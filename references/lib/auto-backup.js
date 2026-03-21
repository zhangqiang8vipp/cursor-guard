'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  color, loadConfig, gitAvailable, git, isGitRepo, gitDir: getGitDir,
  walkDir, filterFiles, buildManifest, loadManifest, saveManifest,
  manifestChanged, diskFreeGB, createLogger, matchesAny,
} = require('./utils');

// ── Secrets filter (remove from temp git index) ─────────────────

function removeSecretsFromIndex(secretsPatterns, cwd, logger) {
  let files;
  try {
    const out = git(['ls-files', '--cached'], { cwd, allowFail: true });
    files = out ? out.split('\n').filter(Boolean) : [];
  } catch { return; }

  const excluded = [];
  for (const f of files) {
    const leaf = path.basename(f);
    if (matchesAny(secretsPatterns, f) || matchesAny(secretsPatterns, leaf)) {
      git(['rm', '--cached', '--ignore-unmatch', '-q', '--', f], { cwd, allowFail: true });
      excluded.push(f);
    }
  }
  if (excluded.length > 0) {
    logger.warn(`Secrets auto-excluded: ${excluded.join(', ')}`);
  }
}

// ── Shadow retention cleanup ────────────────────────────────────

function shadowRetention(backupDir, cfg, logger) {
  const { mode, days, max_count, max_size_mb } = cfg.retention;
  let dirs;
  try {
    dirs = fs.readdirSync(backupDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && /^\d{8}_\d{6}$/.test(d.name))
      .map(d => d.name)
      .sort()
      .reverse();
  } catch { return; }
  if (!dirs || dirs.length === 0) return;

  let removed = 0;

  if (mode === 'days') {
    const cutoff = Date.now() - days * 86400000;
    for (const name of dirs) {
      const m = name.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/);
      if (!m) continue;
      const dt = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`);
      if (dt.getTime() < cutoff) {
        fs.rmSync(path.join(backupDir, name), { recursive: true, force: true });
        removed++;
      }
    }
  } else if (mode === 'count') {
    if (dirs.length > max_count) {
      for (const name of dirs.slice(max_count)) {
        fs.rmSync(path.join(backupDir, name), { recursive: true, force: true });
        removed++;
      }
    }
  } else if (mode === 'size') {
    let totalBytes = 0;
    try {
      const allFiles = walkDir(backupDir, backupDir);
      for (const f of allFiles) {
        try { totalBytes += fs.statSync(f.full).size; } catch { /* skip */ }
      }
    } catch { /* ignore */ }
    const oldestFirst = [...dirs].reverse();
    for (const name of oldestFirst) {
      if (totalBytes / (1024 * 1024) <= max_size_mb) break;
      const dirPath = path.join(backupDir, name);
      let dirSize = 0;
      try {
        const files = walkDir(dirPath, dirPath);
        for (const f of files) {
          try { dirSize += fs.statSync(f.full).size; } catch { /* skip */ }
        }
      } catch { /* ignore */ }
      fs.rmSync(dirPath, { recursive: true, force: true });
      totalBytes -= dirSize;
      removed++;
    }
  }

  if (removed > 0) {
    logger.log(`Retention (${mode}): cleaned ${removed} old snapshot(s)`, 'gray');
  }

  // Disk warning
  const freeGB = diskFreeGB(backupDir);
  if (freeGB !== null) {
    if (freeGB < 1) logger.error(`WARNING: disk critically low — ${freeGB.toFixed(1)} GB free`);
    else if (freeGB < 5) logger.warn(`Disk note: ${freeGB.toFixed(1)} GB free`);
  }
}

// ── Git branch retention (best-effort) ──────────────────────────

function gitRetention(branchRef, gitDirPath, cfg, cwd, logger) {
  if (!cfg.git_retention.enabled) return;

  const out = git(['rev-list', branchRef], { cwd, allowFail: true });
  if (!out) return;
  const commits = out.split('\n').filter(Boolean);
  const total = commits.length;

  let keepCount = total;
  const { mode, days, max_count } = cfg.git_retention;

  if (mode === 'count') {
    keepCount = Math.min(total, max_count);
  } else if (mode === 'days') {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const kept = git(['rev-list', branchRef, `--after=${cutoff}`], { cwd, allowFail: true });
    keepCount = kept ? kept.split('\n').filter(Boolean).length : 0;
    keepCount = Math.max(keepCount, 10);
  }

  if (keepCount >= total) return;

  // Best-effort: point the branch ref to the Nth commit, orphaning older ones.
  // Git gc will eventually collect them. We don't rewrite history.
  const newBase = commits[keepCount - 1];
  git(['update-ref', branchRef, newBase], { cwd, allowFail: true });

  const pruned = total - keepCount;
  logger.log(`Git retention (${mode}): logically pruned ${pruned} old commit(s), kept ${keepCount}. Run 'git gc' to reclaim space.`, 'gray');
}

// ── Shadow copy ─────────────────────────────────────────────────

function shadowCopy(projectDir, backupDir, cfg, logger) {
  const ts = formatTimestamp(new Date());
  const snapDir = path.join(backupDir, ts);
  fs.mkdirSync(snapDir, { recursive: true });

  const allFiles = walkDir(projectDir, projectDir);
  const files = filterFiles(allFiles, cfg);

  let copied = 0;
  for (const f of files) {
    const dest = path.join(snapDir, f.rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    try {
      fs.copyFileSync(f.full, dest);
      copied++;
    } catch { /* skip unreadable */ }
  }

  if (copied > 0) {
    logger.log(`Shadow copy ${ts} (${copied} files)`);
  } else {
    fs.rmSync(snapDir, { recursive: true, force: true });
  }
  return copied;
}

// ── Git snapshot (plumbing) ─────────────────────────────────────

function gitSnapshot(projectDir, branchRef, guardIndex, cfg, logger) {
  const cwd = projectDir;
  const env = { ...process.env, GIT_INDEX_FILE: guardIndex };
  const opts = { cwd, env, allowFail: true };

  try {
    const parentHash = git(['rev-parse', '--verify', branchRef], { cwd, allowFail: true });
    if (parentHash) {
      execFileSync('git', ['read-tree', branchRef], { cwd, env, stdio: 'pipe' });
    }

    if (cfg.protect.length > 0) {
      for (const p of cfg.protect) {
        execFileSync('git', ['add', '--', p], { cwd, env, stdio: 'pipe' }).toString();
      }
    } else {
      execFileSync('git', ['add', '-A'], { cwd, env, stdio: 'pipe' });
    }

    for (const ig of cfg.ignore) {
      execFileSync('git', ['rm', '--cached', '--ignore-unmatch', '-rq', '--', ig], { cwd, env, stdio: 'pipe' }).toString();
    }

    removeSecretsFromIndex(cfg.secrets_patterns, cwd, logger);

    const newTree = execFileSync('git', ['write-tree'], { cwd, env, stdio: 'pipe', encoding: 'utf-8' }).trim();
    const parentTree = parentHash
      ? git(['rev-parse', `${branchRef}^{tree}`], { cwd, allowFail: true })
      : null;

    if (newTree === parentTree) {
      console.log(color.gray(`[guard] ${new Date().toTimeString().slice(0,8)} tree unchanged, skipped.`));
      return;
    }

    const ts = formatTimestamp(new Date());
    const msg = `guard: auto-backup ${ts}`;
    const commitArgs = parentHash
      ? ['commit-tree', newTree, '-p', parentHash, '-m', msg]
      : ['commit-tree', newTree, '-m', msg];
    const commitHash = execFileSync('git', commitArgs, { cwd, stdio: 'pipe', encoding: 'utf-8' }).trim();

    if (!commitHash) {
      logger.error('commit-tree failed, snapshot skipped');
      return;
    }

    git(['update-ref', branchRef, commitHash], { cwd });
    const short = commitHash.substring(0, 7);

    let count = 0;
    if (parentTree) {
      const diff = git(['diff-tree', '--no-commit-id', '--name-only', '-r', parentTree, newTree], { cwd, allowFail: true });
      count = diff ? diff.split('\n').filter(Boolean).length : 0;
    } else {
      const all = git(['ls-tree', '--name-only', '-r', newTree], { cwd, allowFail: true });
      count = all ? all.split('\n').filter(Boolean).length : 0;
    }

    logger.log(`Git snapshot ${short} (${count} files)`);
  } finally {
    try { fs.unlinkSync(guardIndex); } catch { /* ignore */ }
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function formatTimestamp(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Main ────────────────────────────────────────────────────────

async function runBackup(projectDir, intervalOverride) {
  process.chdir(projectDir);

  const hasGit = gitAvailable();
  const repo = hasGit && isGitRepo(projectDir);
  const gDir = repo ? getGitDir(projectDir) : null;

  const backupDir = path.join(projectDir, '.cursor-guard-backup');
  const logFilePath = path.join(backupDir, 'backup.log');
  const lockFile = gDir
    ? path.join(gDir, 'cursor-guard.lock')
    : path.join(backupDir, 'cursor-guard.lock');
  const guardIndex = gDir ? path.join(gDir, 'cursor-guard-index') : null;

  // Load config
  const { cfg, loaded, error } = loadConfig(projectDir);
  let interval = intervalOverride || cfg.auto_backup_interval_seconds || 60;
  if (interval < 5) interval = 5;

  if (error) {
    console.log(color.yellow(`[guard] WARNING: .cursor-guard.json parse error — using defaults. ${error}`));
  } else if (loaded) {
    console.log(color.cyan(`[guard] Config loaded  protect=${cfg.protect.length}  ignore=${cfg.ignore.length}  strategy=${cfg.backup_strategy}  git_retention=${cfg.git_retention.enabled ? 'on' : 'off'}`));
  }

  // Strategy check
  const needsGit = cfg.backup_strategy === 'git' || cfg.backup_strategy === 'both';
  if (needsGit && !repo) {
    if (!hasGit) {
      console.log(color.red(`[guard] ERROR: backup_strategy='${cfg.backup_strategy}' requires Git, but git is not installed.`));
      console.log(color.yellow("  Either install Git or set backup_strategy to 'shadow' in .cursor-guard.json."));
      process.exit(1);
    }
    console.log(color.red(`[guard] ERROR: backup_strategy='${cfg.backup_strategy}' but directory is not a Git repo.`));
    console.log(color.yellow("  Run 'git init' first, or set backup_strategy to 'shadow'."));
    process.exit(1);
  }
  if (!repo && cfg.backup_strategy === 'shadow') {
    console.log(color.cyan('[guard] Non-Git directory detected. Running in shadow-only mode.'));
  }

  // Ensure backup dir
  fs.mkdirSync(backupDir, { recursive: true });

  // Lock file
  if (fs.existsSync(lockFile)) {
    console.log(color.red(`[guard] ERROR: Lock file exists (${lockFile}).`));
    console.log(color.red('  If no other instance is running, delete it and retry.'));
    process.exit(1);
  }
  fs.writeFileSync(lockFile, `pid=${process.pid}\nstarted=${new Date().toISOString()}`);

  // Cleanup on exit
  function cleanup() {
    try { if (guardIndex) fs.unlinkSync(guardIndex); } catch { /* ignore */ }
    try { fs.unlinkSync(lockFile); } catch { /* ignore */ }
  }
  process.on('SIGINT', () => { cleanup(); console.log(color.cyan('\n[guard] Stopped.')); process.exit(0); });
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });
  process.on('exit', cleanup);

  // Git-specific setup
  const branch = 'cursor-guard/auto-backup';
  const branchRef = `refs/heads/${branch}`;
  if (repo) {
    const exists = git(['rev-parse', '--verify', branchRef], { cwd: projectDir, allowFail: true });
    if (!exists) {
      git(['branch', branch, 'HEAD'], { cwd: projectDir, allowFail: true });
      console.log(color.green(`[guard] Created branch: ${branch}`));
    }

    // Ensure .cursor-guard-backup/ is git-ignored
    const excludeFile = path.join(gDir, 'info', 'exclude');
    fs.mkdirSync(path.dirname(excludeFile), { recursive: true });
    const entry = '.cursor-guard-backup/';
    let content = '';
    try { content = fs.readFileSync(excludeFile, 'utf-8'); } catch { /* doesn't exist yet */ }
    if (!content.includes(entry)) {
      fs.appendFileSync(excludeFile, `\n${entry}\n`);
    }
  }

  const logger = createLogger(logFilePath);

  // Banner
  console.log('');
  console.log(color.cyan(`[guard] Watching '${projectDir}' every ${interval}s  (Ctrl+C to stop)`));
  console.log(color.cyan(`[guard] Strategy: ${cfg.backup_strategy}  |  Branch: ${branch}  |  Retention: ${cfg.retention.mode}`));
  console.log(color.cyan(`[guard] Log: ${logFilePath}`));
  console.log('');

  // Main loop
  let cycle = 0;
  while (true) {
    await sleep(interval * 1000);
    cycle++;

    // Detect changes
    let hasChanges = false;
    if (repo) {
      const dirty = git(['status', '--porcelain'], { cwd: projectDir, allowFail: true });
      hasChanges = !!dirty;
    } else {
      const allFiles = walkDir(projectDir, projectDir);
      const filtered = filterFiles(allFiles, cfg);
      const newManifest = buildManifest(filtered);
      const oldManifest = loadManifest(backupDir);
      hasChanges = manifestChanged(oldManifest, newManifest);
      if (hasChanges) saveManifest(backupDir, newManifest);
    }
    if (!hasChanges) continue;

    // Git snapshot
    if ((cfg.backup_strategy === 'git' || cfg.backup_strategy === 'both') && repo) {
      gitSnapshot(projectDir, branchRef, guardIndex, cfg, logger);
    }

    // Shadow copy
    if (cfg.backup_strategy === 'shadow' || cfg.backup_strategy === 'both') {
      shadowCopy(projectDir, backupDir, cfg, logger);
    }

    // Periodic retention every 10 cycles
    if (cycle % 10 === 0) {
      shadowRetention(backupDir, cfg, logger);
      if (repo) gitRetention(branchRef, gDir, cfg, projectDir, logger);
    }
  }
}

module.exports = { runBackup };
