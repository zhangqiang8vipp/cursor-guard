'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  color, loadConfig, gitAvailable, git, isGitRepo, gitDir: getGitDir,
  walkDir, filterFiles, buildManifest, loadManifest, saveManifest,
  manifestChanged, createLogger, unquoteGitPath,
} = require('./utils');
const { createGitSnapshot, createShadowCopy } = require('./core/snapshot');
const { cleanShadowRetention, cleanGitRetention } = require('./core/backups');
const { createChangeTracker, recordChange, checkAnomaly, saveAlert, clearExpiredAlert } = require('./core/anomaly');

// ── Helpers ─────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isProcessAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch { return false; }
}

// ── Main ────────────────────────────────────────────────────────

async function runBackup(projectDir, intervalOverride) {
  const hasGit = gitAvailable();
  const repo = hasGit && isGitRepo(projectDir);
  const gDir = repo ? getGitDir(projectDir) : null;

  const backupDir = path.join(projectDir, '.cursor-guard-backup');
  const logFilePath = path.join(backupDir, 'backup.log');
  const lockFile = gDir
    ? path.join(gDir, 'cursor-guard.lock')
    : path.join(backupDir, 'cursor-guard.lock');

  // Load config
  let { cfg, loaded, error, warnings } = loadConfig(projectDir);
  let interval = intervalOverride || cfg.auto_backup_interval_seconds || 60;
  if (interval < 5) interval = 5;
  let cfgMtime = 0;
  const cfgPath = path.join(projectDir, '.cursor-guard.json');
  try { cfgMtime = fs.statSync(cfgPath).mtimeMs; } catch { /* no config */ }

  if (error) {
    console.log(color.yellow(`[guard] WARNING: .cursor-guard.json parse error — using defaults. ${error}`));
  } else if (loaded) {
    console.log(color.cyan(`[guard] Config loaded  protect=${cfg.protect.length}  ignore=${cfg.ignore.length}  strategy=${cfg.backup_strategy}  git_retention=${cfg.git_retention.enabled ? 'on' : 'off'}`));
    if (warnings && warnings.length > 0) {
      for (const w of warnings) console.log(color.yellow(`[guard] WARNING: ${w}`));
    }
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

  // Lock file with stale detection (PID + age)
  const LOCK_MAX_AGE_MS = 24 * 60 * 60 * 1000;
  if (fs.existsSync(lockFile)) {
    let stale = false;
    let reason = '';
    try {
      const content = fs.readFileSync(lockFile, 'utf-8');
      const pidMatch = content.match(/pid=(\d+)/);
      const startedMatch = content.match(/started=(.+)/);
      const oldPid = pidMatch ? parseInt(pidMatch[1], 10) : null;
      const startedAt = startedMatch ? Date.parse(startedMatch[1]) : NaN;

      if (oldPid && !isProcessAlive(oldPid)) {
        stale = true;
        reason = `pid ${oldPid} not running`;
      } else if (!isNaN(startedAt) && Date.now() - startedAt > LOCK_MAX_AGE_MS) {
        stale = true;
        reason = `lock age > 24h (started ${startedMatch[1]})`;
      } else if (!oldPid) {
        const stat = fs.statSync(lockFile);
        if (Date.now() - stat.mtimeMs > LOCK_MAX_AGE_MS) {
          stale = true;
          reason = 'lock file too old (no PID, mtime > 24h)';
        }
      }
    } catch { /* ignore */ }
    if (stale) {
      console.log(color.yellow(`[guard] Stale lock detected (${reason}). Cleaning up.`));
      try { fs.unlinkSync(lockFile); } catch { /* ignore */ }
    } else {
      console.log(color.red(`[guard] ERROR: Lock file exists (${lockFile}).`));
      console.log(color.red('  Another watcher instance may be running.'));
      console.log(color.red('  If no other instance is running, delete the lock file and retry.'));
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
  const guardIndex = gDir ? path.join(gDir, 'cursor-guard-index') : null;
  function cleanup() {
    try { if (guardIndex) fs.unlinkSync(guardIndex); } catch { /* ignore */ }
    try { fs.unlinkSync(lockFile); } catch { /* ignore */ }
  }
  process.on('SIGINT', () => { cleanup(); console.log(color.cyan('\n[guard] Stopped.')); process.exit(0); });
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });
  process.on('exit', cleanup);

  // Git-specific setup
  const branchRef = 'refs/guard/auto-backup';
  const legacyRef = 'refs/heads/cursor-guard/auto-backup';
  if (repo) {
    const exists = git(['rev-parse', '--verify', branchRef], { cwd: projectDir, allowFail: true });
    if (!exists) {
      const legacyHash = git(['rev-parse', '--verify', legacyRef], { cwd: projectDir, allowFail: true });
      if (legacyHash) {
        git(['update-ref', branchRef, legacyHash], { cwd: projectDir, allowFail: true });
        git(['update-ref', '-d', legacyRef], { cwd: projectDir, allowFail: true });
        console.log(color.green(`[guard] Migrated ${legacyRef} → ${branchRef}`));
      } else {
        console.log(color.cyan(`[guard] Ref ${branchRef} does not exist yet — will be created on first snapshot.`));
      }
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

  // Global error handlers
  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught exception: ${err.message}`);
    cleanup();
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled rejection: ${reason}`);
  });

  // V4: Initialize change tracker for anomaly detection
  let tracker = createChangeTracker(cfg);
  if (cfg.proactive_alert) {
    console.log(color.cyan(`[guard] Proactive alert: ON  (threshold: ${cfg.alert_thresholds.files_per_window} files / ${cfg.alert_thresholds.window_seconds}s)`));
  }

  // Banner
  console.log('');
  console.log(color.cyan(`[guard] Watching '${projectDir}' every ${interval}s  (Ctrl+C to stop)`));
  console.log(color.cyan(`[guard] Strategy: ${cfg.backup_strategy}  |  Ref: ${branchRef}  |  Retention: ${cfg.retention.mode}`));
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
            tracker = createChangeTracker(cfg);
            logger.info('Config reloaded (file changed)');
          }
        }
      } catch { /* no config file or read error, keep current */ }
    }

    // Detect changes
    let hasChanges = false;
    let pendingManifest = null;
    let lastManifest = null;
    try {
      if (repo) {
        const dirty = git(['status', '--porcelain'], { cwd: projectDir, allowFail: true });
        hasChanges = !!dirty;
      } else {
        const allFiles = walkDir(projectDir, projectDir);
        const filtered = filterFiles(allFiles, cfg);
        const newManifest = buildManifest(filtered);
        lastManifest = loadManifest(backupDir);
        hasChanges = manifestChanged(lastManifest, newManifest);
        if (hasChanges) pendingManifest = newManifest;
      }
    } catch (e) {
      logger.error(`Change detection failed: ${e.message}`);
      continue;
    }
    if (!hasChanges) continue;

    // V4: Record change event and check for anomalies
    let changedFileCount = 0;
    let porcelain = '';
    if (repo) {
      // Use execFileSync directly — git() helper's trim() strips leading spaces
      // from porcelain output, corrupting the first line when it starts with ' '.
      try {
        porcelain = execFileSync('git', ['status', '--porcelain'], {
          cwd: projectDir, stdio: 'pipe', encoding: 'utf-8',
        });
      } catch { /* ignore */ }
      if (porcelain) {
        const lines = porcelain.split('\n').filter(Boolean);
        if (cfg.protect.length === 0 && cfg.ignore.length === 0) {
          changedFileCount = lines.length;
        } else {
          const changedPaths = lines.map(line => {
            const filePart = line.substring(3);
            const arrowIdx = filePart.indexOf(' -> ');
            const raw = arrowIdx >= 0 ? filePart.substring(arrowIdx + 4) : filePart;
            return unquoteGitPath(raw);
          });
          const fakeFiles = changedPaths.map(rel => ({ rel, full: path.join(projectDir, rel) }));
          changedFileCount = filterFiles(fakeFiles, cfg).length;
        }
      }
    } else if (pendingManifest) {
      if (!lastManifest) {
        changedFileCount = Object.keys(pendingManifest).length;
      } else {
        const newKeys = new Set(Object.keys(pendingManifest));
        const oldKeys = new Set(Object.keys(lastManifest));
        let diffCount = 0;
        for (const k of newKeys) {
          if (!oldKeys.has(k) || lastManifest[k].mtimeMs !== pendingManifest[k].mtimeMs || lastManifest[k].size !== pendingManifest[k].size) diffCount++;
        }
        for (const k of oldKeys) {
          if (!newKeys.has(k)) diffCount++;
        }
        changedFileCount = diffCount;
      }
    }

    recordChange(tracker, changedFileCount);
    const anomalyResult = checkAnomaly(tracker);
    if (anomalyResult.anomaly && anomalyResult.alert && !anomalyResult.suppressed) {
      saveAlert(projectDir, anomalyResult.alert);
      logger.warn(`ALERT: ${anomalyResult.alert.fileCount} files changed in ${anomalyResult.alert.windowSeconds}s (threshold: ${anomalyResult.alert.threshold})`);
    }

    // Git snapshot via Core
    if ((cfg.backup_strategy === 'git' || cfg.backup_strategy === 'both') && repo) {
      const context = { trigger: 'auto', changedFileCount };
      if (porcelain) {
        let pLines = porcelain.split('\n').filter(Boolean);
        if (cfg.protect.length > 0 || cfg.ignore.length > 0) {
          pLines = pLines.filter(line => {
            const filePart = line.substring(3);
            const arrowIdx = filePart.indexOf(' -> ');
            const raw = arrowIdx >= 0 ? filePart.substring(arrowIdx + 4) : filePart;
            const rel = unquoteGitPath(raw);
            const fakeFile = { rel, full: path.join(projectDir, rel) };
            return filterFiles([fakeFile], cfg).length > 0;
          });
        }
        if (pLines.length > 0) {
          const groups = { M: [], A: [], D: [], R: [] };
          for (const l of pLines) {
            const code = l.substring(0, 2).trim();
            const filePart = l.substring(3);
            const arrowIdx = filePart.indexOf(' -> ');
            const file = arrowIdx >= 0 ? filePart.substring(arrowIdx + 4) : filePart;
            const key = code.startsWith('R') ? 'R'
              : code.includes('D') ? 'D'
              : code.includes('A') || code === '??' ? 'A'
              : 'M';
            groups[key].push(file);
          }
          const parts = [];
          if (groups.M.length) parts.push(`Modified ${groups.M.length}: ${groups.M.slice(0, 5).join(', ')}`);
          if (groups.A.length) parts.push(`Added ${groups.A.length}: ${groups.A.slice(0, 5).join(', ')}`);
          if (groups.D.length) parts.push(`Deleted ${groups.D.length}: ${groups.D.slice(0, 5).join(', ')}`);
          if (groups.R.length) parts.push(`Renamed ${groups.R.length}: ${groups.R.slice(0, 5).join(', ')}`);
          context.summary = parts.join('; ');
        }
      }
      const snapResult = createGitSnapshot(projectDir, cfg, { branchRef, context });
      if (snapResult.status === 'created') {
        let msg = `Git snapshot ${snapResult.shortHash} (${snapResult.fileCount} files)`;
        if (snapResult.secretsExcluded) {
          msg += ` [secrets excluded: ${snapResult.secretsExcluded.join(', ')}]`;
        }
        logger.log(msg);
      } else if (snapResult.status === 'skipped') {
        console.log(color.gray(`[guard] ${new Date().toTimeString().slice(0,8)} tree unchanged, skipped.`));
      } else if (snapResult.status === 'error') {
        logger.error(`Git snapshot failed: ${snapResult.error}`);
      }
    }

    // Shadow copy via Core
    if (cfg.backup_strategy === 'shadow' || cfg.backup_strategy === 'both') {
      const shadowResult = createShadowCopy(projectDir, cfg, { backupDir });
      if (shadowResult.status === 'created') {
        logger.log(`Shadow copy ${shadowResult.timestamp} (${shadowResult.fileCount} files)`);
        if (pendingManifest) {
          saveManifest(backupDir, pendingManifest);
          pendingManifest = null;
        }
      } else if (shadowResult.status === 'error') {
        logger.error(`Shadow copy failed: ${shadowResult.error}`);
      }
    }

    // Periodic retention every 10 cycles via Core
    if (cycle % 10 === 0) {
      const retResult = cleanShadowRetention(backupDir, cfg);
      if (retResult.removed > 0) {
        logger.log(`Retention (${retResult.mode}): cleaned ${retResult.removed} old snapshot(s)`, 'gray');
      }
      if (retResult.diskWarning === 'critically low') {
        logger.error(`WARNING: disk critically low — ${retResult.diskFreeGB} GB free`);
      } else if (retResult.diskWarning === 'low') {
        logger.warn(`Disk note: ${retResult.diskFreeGB} GB free`);
      }

      if (repo) {
        const gitRetResult = cleanGitRetention(branchRef, gDir, cfg, projectDir);
        if (gitRetResult.rebuilt) {
          logger.log(`Git retention (${gitRetResult.mode}): rebuilt branch with ${gitRetResult.kept} newest snapshots, pruned ${gitRetResult.pruned}. Run 'git gc' to reclaim space.`, 'gray');
        }
      }

      clearExpiredAlert(projectDir);
    }
  }
}

module.exports = { runBackup };
