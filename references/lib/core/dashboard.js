'use strict';

const fs = require('fs');
const path = require('path');
const {
  loadConfig, gitAvailable, git, isGitRepo, gitDir: getGitDir,
  diskFreeGB, walkDir, filterFiles,
} = require('../utils');
const { getBackupStatus } = require('./status');
const { loadActiveAlert } = require('./anomaly');
const { loadActivePreWarnings } = require('./pre-warning');
const { parseShadowTimestamp } = require('./backups');

// ── Helpers ─────────────────────────────────────────────────────

function dirSizeBytes(dirPath) {
  let total = 0;
  const stack = [dirPath];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); }
    catch { continue; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        try { total += fs.statSync(full).size; } catch { /* skip */ }
      }
    }
  }
  return total;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

function relativeTime(isoTimestamp) {
  if (!isoTimestamp) return null;
  const ms = Date.now() - new Date(isoTimestamp).getTime();
  if (ms < 0) return 'just now';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

// ── Dashboard ───────────────────────────────────────────────────

/**
 * Build a comprehensive backup health dashboard.
 *
 * @param {string} projectDir
 * @returns {{
 *   strategy: string,
 *   lastBackup: { git?: { timestamp: string, relativeTime: string }, shadow?: { timestamp: string, relativeTime: string } },
 *   counts: { git: { commits: number }, shadow: { snapshots: number } },
 *   diskUsage: { git: { bytes: number, display: string }, shadow: { bytes: number, display: string } },
 *   protectionScope: { protect: string[], ignore: string[], fileCount: number },
 *   health: { status: string, issues: string[] },
 *   alerts: { active: boolean, latest?: object },
 *   watcher: object,
 *   disk: object,
 * }}
 */
function getDashboard(projectDir) {
  const status = getBackupStatus(projectDir);
  const { cfg } = loadConfig(projectDir);
  const hasGit = gitAvailable();
  const repo = hasGit && isGitRepo(projectDir);
  const gDir = repo ? getGitDir(projectDir) : null;
  const backupDir = path.join(projectDir, '.cursor-guard-backup');

  // ── Strategy ────────────────────────────────────────────────
  const strategy = cfg.backup_strategy;

  // ── Last backup with relative time ──────────────────────────
  const lastBackup = {};
  if (status.lastBackup.git) {
    lastBackup.git = {
      timestamp: status.lastBackup.git.timestamp,
      relativeTime: relativeTime(status.lastBackup.git.timestamp),
      shortHash: status.lastBackup.git.shortHash,
    };
  }
  if (status.lastBackup.shadow) {
    const ts = status.lastBackup.shadow.timestamp;
    const parsed = parseShadowTimestamp(ts);
    const isoTs = parsed ? parsed.toISOString() : ts;
    lastBackup.shadow = {
      timestamp: ts,
      relativeTime: relativeTime(isoTs),
    };
  }

  // ── Counts ──────────────────────────────────────────────────
  const counts = {
    git: { commits: status.refs.autoBackup ? status.refs.autoBackup.commitCount : 0 },
    shadow: { snapshots: 0 },
  };

  if (fs.existsSync(backupDir)) {
    try {
      counts.shadow.snapshots = fs.readdirSync(backupDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && /^\d{8}_\d{6}(_\d{3})?$/.test(d.name))
        .length;
    } catch { /* ignore */ }
  }

  // ── Disk usage breakdown ────────────────────────────────────
  const diskUsage = {
    git: { bytes: 0, display: '0B' },
    shadow: { bytes: 0, display: '0B' },
  };

  if (repo && gDir) {
    const objectsDir = path.join(gDir, 'objects');
    if (fs.existsSync(objectsDir)) {
      diskUsage.git.bytes = dirSizeBytes(objectsDir);
      diskUsage.git.display = formatBytes(diskUsage.git.bytes);
    }
  }

  if (fs.existsSync(backupDir)) {
    diskUsage.shadow.bytes = dirSizeBytes(backupDir);
    diskUsage.shadow.display = formatBytes(diskUsage.shadow.bytes);
  }

  // ── Protection scope ────────────────────────────────────────
  const protectionScope = {
    protect: cfg.protect.length > 0 ? cfg.protect : ['**'],
    ignore: cfg.ignore,
    fileCount: 0,
    totalFiles: 0,
    excludedCount: 0,
    protectPatterns: cfg.protect.length > 0 ? cfg.protect.length : 1,
    ignorePatterns: cfg.ignore.length,
  };

  try {
    const allFiles = walkDir(projectDir, projectDir);
    const protectedFiles = filterFiles(allFiles, cfg);
    protectionScope.totalFiles = allFiles.length;
    protectionScope.fileCount = protectedFiles.length;
    protectionScope.excludedCount = allFiles.length - protectedFiles.length;
  } catch { /* ignore */ }

  // ── Health assessment ───────────────────────────────────────
  const issues = [];

  if (!status.watcher.running) {
    if (status.watcher.stale) {
      issues.push('Watcher has a stale lock file (process not running)');
    } else {
      issues.push('Auto-backup watcher is not running');
    }
  }

  if (strategy === 'git' || strategy === 'both') {
    if (!repo) issues.push('Strategy requires Git but directory is not a git repo');
    else if (!status.refs.autoBackup) issues.push('No auto-backup ref found — watcher may not have run yet');
  }

  if (status.disk.warning === 'critically low') {
    issues.push(`Disk space critically low (${status.disk.freeGB} GB free)`);
  } else if (status.disk.warning === 'low') {
    issues.push(`Disk space low (${status.disk.freeGB} GB free)`);
  }

  // Last backup time is purely informational — no changes = no backup is normal behavior.
  // Health warnings should only reflect actionable problems (watcher down, disk full, no repo).

  let healthStatus = 'healthy';
  if (issues.length > 0) healthStatus = 'warning';
  if (issues.some(i => i.includes('critically') || i.includes('requires Git'))) healthStatus = 'critical';

  // ── Active alerts ───────────────────────────────────────────
  const activeAlert = loadActiveAlert(projectDir);
  const alerts = {
    active: !!activeAlert,
    latest: activeAlert || undefined,
  };
  if (activeAlert) {
    if (healthStatus === 'healthy') healthStatus = 'warning';
    issues.push(`Active alert: ${activeAlert.type} — ${activeAlert.fileCount} files in ${activeAlert.windowSeconds}s`);
  }

  const activePreWarnings = loadActivePreWarnings(projectDir);
  const preWarnings = {
    active: activePreWarnings.length > 0,
    count: activePreWarnings.length,
    latest: activePreWarnings[0] || undefined,
    warnings: activePreWarnings,
  };
  if (preWarnings.active) {
    if (healthStatus === 'healthy') healthStatus = 'warning';
    issues.push(`Pre-warning active: ${preWarnings.latest?.summary || `${preWarnings.count} pending destructive edit warning(s)`}`);
  }

  return {
    strategy,
    lastBackup,
    counts,
    diskUsage,
    protectionScope,
    health: { status: healthStatus, issues },
    alerts,
    preWarnings,
    watcher: status.watcher,
    disk: status.disk,
  };
}

module.exports = { getDashboard, dirSizeBytes, formatBytes, relativeTime };
