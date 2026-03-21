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

function removeSecretsFromIndex(secretsPatterns, cwd, env, logger) {
  let files;
  try {
    const out = execFileSync('git', ['ls-files', '--cached'], {
      cwd, env, stdio: 'pipe', encoding: 'utf-8',
    }).trim();
    files = out ? out.split('\n').filter(Boolean) : [];
  } catch { return; }

  const excluded = [];
  for (const f of files) {
    const leaf = path.basename(f);
    if (matchesAny(secretsPatterns, f) || matchesAny(secretsPatterns, leaf)) {
      try {
        execFileSync('git', ['rm', '--cached', '--ignore-unmatch', '-q', '--', f], {
          cwd, env, stdio: 'pipe',
        });
      } catch { /* ignore */ }
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

  const freeGB = diskFreeGB(backupDir);
  if (freeGB !== null) {
    if (freeGB < 1) logger.error(`WARNING: disk critically low — ${freeGB.toFixed(1)} GB free`);
    else if (freeGB < 5) logger.warn(`Disk note: ${freeGB.toFixed(1)} GB free`);
  }
}

// ── Git branch retention (best-effort, safe rebuild) ────────────
//
// The backup branch inherits the user's real commit history as its
// ancestor chain.  We must NEVER graft/replace any of those commits
// because git-replace refs have global visibility and would corrupt
// the user's branches.
//
// Strategy: enumerate only guard-created commits (message prefix
// "guard: auto-backup"), then rebuild the kept slice as an orphan
// chain via commit-tree so the branch no longer references any user
// history.  Old objects become unreachable and are collected by gc.

function gitRetention(branchRef, gitDirPath, cfg, cwd, logger) {
  if (!cfg.git_retention.enabled) return;

  const out = git(['log', branchRef, '--format=%H %aI %s'], { cwd, allowFail: true });
  if (!out) return;

  const lines = out.split('\n').filter(Boolean);
  const guardCommits = [];
  for (const line of lines) {
    const firstSpace = line.indexOf(' ');
    const secondSpace = line.indexOf(' ', firstSpace + 1);
    const hash = line.substring(0, firstSpace);
    const dateISO = line.substring(firstSpace + 1, secondSpace);
    const subject = line.substring(secondSpace + 1);
    if (subject.startsWith('guard: auto-backup')) {
      guardCommits.push({ hash, dateISO, subject });
    } else {
      break;
    }
  }

  const total = guardCommits.length;
  if (total === 0) return;

  let keepCount = total;
  const { mode, days, max_count } = cfg.git_retention;

  if (mode === 'count') {
    keepCount = Math.min(total, max_count);
  } else if (mode === 'days') {
    const cutoff = Date.now() - days * 86400000;
    keepCount = 0;
    for (const c of guardCommits) {
      if (new Date(c.dateISO).getTime() >= cutoff) keepCount++;
      else break;
    }
    keepCount = Math.max(keepCount, 10);
  }

  if (keepCount >= total) return;

  // Rebuild kept commits as a new orphan chain (oldest-to-keep first)
  const toKeep = guardCommits.slice(0, keepCount).reverse();

  const rootTree = git(['rev-parse', `${toKeep[0].hash}^{tree}`], { cwd, allowFail: true });
  if (!rootTree) return;
  let prevHash = git(['commit-tree', rootTree, '-m', toKeep[0].subject], { cwd, allowFail: true });
  if (!prevHash) return;

  for (let i = 1; i < toKeep.length; i++) {
    const tree = git(['rev-parse', `${toKeep[i].hash}^{tree}`], { cwd, allowFail: true });
    if (!tree) return;
    prevHash = git(['commit-tree', tree, '-p', prevHash, '-m', toKeep[i].subject], { cwd, allowFail: true });
    if (!prevHash) return;
  }

  git(['update-ref', branchRef, prevHash], { cwd, allowFail: true });

  const pruned = total - keepCount;
  logger.log(`Git retention (${mode}): rebuilt branch with ${keepCount} newest snapshots, pruned ${pruned}. Run 'git gc' to reclaim space.`, 'gray');
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

  // Clean up stale temp index from prior crash
  try { fs.unlinkSync(guardIndex); } catch { /* doesn't exist */ }

  try {
    const parentHash = git(['rev-parse', '--verify', branchRef], { cwd, allowFail: true });
    if (parentHash) {
      execFileSync('git', ['read-tree', branchRef], { cwd, env, stdio: 'pipe' });
    }

    if (cfg.protect.length > 0) {
      for (const p of cfg.protect) {
        execFileSync('git', ['add', '--', p], { cwd, env, stdio: 'pipe' });
      }
    } else {
      execFileSync('git', ['add', '-A'], { cwd, env, stdio: 'pipe' });
    }

    for (const ig of cfg.ignore) {
      execFileSync('git', ['rm', '--cached', '--ignore-unmatch', '-rq', '--', ig], { cwd, env, stdio: 'pipe' });
    }

    removeSecretsFromIndex(cfg.secrets_patterns, cwd, env, logger);

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

function isProcessAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch { return false; }
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
  let { cfg, loaded, error } = loadConfig(projectDir);
  let interval = intervalOverride || cfg.auto_backup_interval_seconds || 60;
  if (interval < 5) interval = 5;
  let cfgMtime = 0;
  const cfgPath = path.join(projectDir, '.cursor-guard.json');
  try { cfgMtime = fs.statSync(cfgPath).mtimeMs; } catch { /* no config */ }

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

  // Lock file with stale detection
  if (fs.existsSync(lockFile)) {
    let stale = false;
    try {
      const content = fs.readFileSync(lockFile, 'utf-8');
      const pidMatch = content.match(/pid=(\d+)/);
      if (pidMatch) {
        const oldPid = parseInt(pidMatch[1], 10);
        if (!isProcessAlive(oldPid)) {
          stale = true;
          console.log(color.yellow(`[guard] Stale lock detected (pid ${oldPid} not running). Cleaning up.`));
          fs.unlinkSync(lockFile);
        }
      }
    } catch { /* ignore */ }
    if (!stale) {
      console.log(color.red(`[guard] ERROR: Lock file exists (${lockFile}).`));
      console.log(color.red('  If no other instance is running, delete it and retry.'));
      process.exit(1);
    }
  }
  try {
    fs.writeFileSync(lockFile, `pid=${process.pid}\nstarted=${new Date().toISOString()}`, { flag: 'wx' });
  } catch (e) {
    if (e.code === 'EEXIST') {
      console.log(color.red('[guard] ERROR: Another instance just acquired the lock.'));
      process.exit(1);
    }
    throw e;
  }

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

    // Hot-reload config every 10 cycles
    if (cycle % 10 === 0) {
      try {
        const newMtime = fs.statSync(cfgPath).mtimeMs;
        if (newMtime !== cfgMtime) {
          const reload = loadConfig(projectDir);
          if (reload.loaded && !reload.error) {
            cfg = reload.cfg;
            cfgMtime = newMtime;
            logger.info('Config reloaded (file changed)');
          }
        }
      } catch { /* no config file or read error, keep current */ }
    }

    // Detect changes (manifest write is deferred until shadow copy succeeds)
    let hasChanges = false;
    let pendingManifest = null;
    try {
      if (repo) {
        const dirty = git(['status', '--porcelain'], { cwd: projectDir, allowFail: true });
        hasChanges = !!dirty;
      } else {
        const allFiles = walkDir(projectDir, projectDir);
        const filtered = filterFiles(allFiles, cfg);
        const newManifest = buildManifest(filtered);
        const oldManifest = loadManifest(backupDir);
        hasChanges = manifestChanged(oldManifest, newManifest);
        if (hasChanges) pendingManifest = newManifest;
      }
    } catch (e) {
      logger.error(`Change detection failed: ${e.message}`);
      continue;
    }
    if (!hasChanges) continue;

    // Git snapshot (with error protection)
    if ((cfg.backup_strategy === 'git' || cfg.backup_strategy === 'both') && repo) {
      try {
        gitSnapshot(projectDir, branchRef, guardIndex, cfg, logger);
      } catch (e) {
        logger.error(`Git snapshot failed: ${e.message}`);
      }
    }

    // Shadow copy (with error protection)
    if (cfg.backup_strategy === 'shadow' || cfg.backup_strategy === 'both') {
      try {
        shadowCopy(projectDir, backupDir, cfg, logger);
        if (pendingManifest) {
          saveManifest(backupDir, pendingManifest);
          pendingManifest = null;
        }
      } catch (e) {
        logger.error(`Shadow copy failed: ${e.message}`);
      }
    }

    // Periodic retention every 10 cycles
    if (cycle % 10 === 0) {
      try { shadowRetention(backupDir, cfg, logger); } catch (e) {
        logger.error(`Shadow retention failed: ${e.message}`);
      }
      if (repo) {
        try { gitRetention(branchRef, gDir, cfg, projectDir, logger); } catch (e) {
          logger.error(`Git retention failed: ${e.message}`);
        }
      }
    }
  }
}

module.exports = { runBackup };
