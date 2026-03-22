'use strict';

const fs = require('fs');
const path = require('path');
const {
  loadConfig, gitAvailable, git, isGitRepo, gitDir: getGitDir, diskFreeGB,
} = require('../utils');
const { loadActivePreWarnings } = require('./pre-warning');

/**
 * Gather comprehensive backup system status.
 *
 * @param {string} projectDir
 * @returns {{
 *   watcher: { running: boolean, pid?: number, startedAt?: string, lockFile?: string, stale?: boolean },
 *   config: { loaded: boolean, strategy: string, interval: number, retention: object, gitRetention: object, error?: string },
 *   lastBackup: { git?: { ref: string, hash: string, shortHash: string, timestamp: string, message: string }, shadow?: { timestamp: string, path: string, fileCount: number } },
 *   refs: { snapshot?: string, autoBackup?: { hash: string, commitCount: number }, preRestoreCount: number },
 *   disk: { freeGB: number|null, warning?: string },
 * }}
 */
function getBackupStatus(projectDir) {
  const hasGit = gitAvailable();
  const repo = hasGit && isGitRepo(projectDir);
  const gDir = repo ? getGitDir(projectDir) : null;
  const backupDir = path.join(projectDir, '.cursor-guard-backup');

  // ── Watcher status ────────────────────────────────────────────
  const lockFile = gDir
    ? path.join(gDir, 'cursor-guard.lock')
    : path.join(backupDir, 'cursor-guard.lock');

  const watcher = { running: false };

  if (fs.existsSync(lockFile)) {
    watcher.lockFile = lockFile;
    try {
      const content = fs.readFileSync(lockFile, 'utf-8').trim();
      const pidMatch = content.match(/pid=(\d+)/);
      const startedMatch = content.match(/started=(.+)/);

      if (pidMatch) {
        const pid = parseInt(pidMatch[1], 10);
        watcher.pid = pid;
        try {
          process.kill(pid, 0);
          watcher.running = true;
        } catch {
          watcher.running = false;
          watcher.stale = true;
        }
      }
      if (startedMatch) {
        watcher.startedAt = startedMatch[1].trim();
      }
    } catch { /* unreadable lock */ }
  }

  // ── Config ────────────────────────────────────────────────────
  const { cfg, loaded, error } = loadConfig(projectDir);
  const config = {
    loaded,
    strategy: cfg.backup_strategy,
    interval: cfg.auto_backup_interval_seconds || 60,
    retention: cfg.retention,
    gitRetention: cfg.git_retention,
  };
  if (error) config.error = error;

  // ── Last backup ───────────────────────────────────────────────
  const lastBackup = {};

  if (repo) {
    const autoRef = 'refs/guard/auto-backup';
    const autoExists = git(['rev-parse', '--verify', autoRef], { cwd: projectDir, allowFail: true });
    if (autoExists) {
      const logLine = git(
        ['log', autoRef, '--format=%H %aI %s', '-1', '--grep=^guard:'],
        { cwd: projectDir, allowFail: true }
      );
      if (logLine) {
        const firstSpace = logLine.indexOf(' ');
        const secondSpace = logLine.indexOf(' ', firstSpace + 1);
        const hash = logLine.substring(0, firstSpace);
        const timestamp = logLine.substring(firstSpace + 1, secondSpace);
        const message = logLine.substring(secondSpace + 1);
        lastBackup.git = {
          ref: autoRef,
          hash,
          shortHash: hash.substring(0, 7),
          timestamp,
          message,
        };
      }
    }
  }

  if (fs.existsSync(backupDir)) {
    try {
      const dirs = fs.readdirSync(backupDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && /^\d{8}_\d{6}(_\d{3})?$/.test(d.name))
        .sort((a, b) => b.name.localeCompare(a.name));

      if (dirs.length > 0) {
        const latest = dirs[0].name;
        const latestPath = path.join(backupDir, latest);
        let fileCount = 0;
        try {
          const countFiles = (dir) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
              if (entry.isDirectory()) countFiles(path.join(dir, entry.name));
              else fileCount++;
            }
          };
          countFiles(latestPath);
        } catch { /* ignore */ }

        lastBackup.shadow = {
          timestamp: latest,
          path: latestPath,
          fileCount,
        };
      }
    } catch { /* ignore */ }
  }

  // ── Guard refs ────────────────────────────────────────────────
  const refs = { preRestoreCount: 0 };

  if (repo) {
    const snapshotHash = git(['rev-parse', '--verify', 'refs/guard/snapshot'], { cwd: projectDir, allowFail: true });
    if (snapshotHash) refs.snapshot = snapshotHash.substring(0, 7);

    const autoRef = 'refs/guard/auto-backup';
    const autoHash = git(['rev-parse', '--verify', autoRef], { cwd: projectDir, allowFail: true });
    if (autoHash) {
      const countOutput = git(['log', autoRef, '--grep=^guard:', '--format=%H'], { cwd: projectDir, allowFail: true });
      refs.autoBackup = {
        hash: autoHash.substring(0, 7),
        commitCount: countOutput ? countOutput.split('\n').filter(Boolean).length : 0,
      };
    }

    const preRestoreRefs = git(
      ['for-each-ref', 'refs/guard/pre-restore/', '--format=%(refname)'],
      { cwd: projectDir, allowFail: true }
    );
    if (preRestoreRefs) {
      refs.preRestoreCount = preRestoreRefs.split('\n').filter(Boolean).length;
    }
  }

  // ── Disk ──────────────────────────────────────────────────────
  const freeGB = diskFreeGB(projectDir);
  const disk = { freeGB };
  if (freeGB !== null) {
    if (freeGB < 1) disk.warning = 'critically low';
    else if (freeGB < 5) disk.warning = 'low';
  }

  const activePreWarnings = loadActivePreWarnings(projectDir);
  const preWarnings = {
    active: activePreWarnings.length > 0,
    count: activePreWarnings.length,
    latest: activePreWarnings[0] || undefined,
  };

  return { watcher, config, lastBackup, refs, disk, preWarnings };
}

module.exports = { getBackupStatus };
