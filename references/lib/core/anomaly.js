'use strict';

const fs = require('fs');
const path = require('path');
const { isGitRepo, gitDir: getGitDir } = require('../utils');

// ── Alert file paths ────────────────────────────────────────────

function alertFilePath(projectDir) {
  if (isGitRepo(projectDir)) {
    const gDir = getGitDir(projectDir);
    if (gDir) return path.join(gDir, 'cursor-guard-alert.json');
  }
  return path.join(projectDir, '.cursor-guard-backup', 'cursor-guard-alert.json');
}

// ── In-process change tracker ───────────────────────────────────

/**
 * Create a change tracker for in-process monitoring (used by auto-backup).
 *
 * @param {object} cfg - Loaded config (needs proactive_alert, alert_thresholds)
 * @returns {{ events: Array, alerts: Array, config: object }}
 */
function createChangeTracker(cfg) {
  return {
    events: [],
    alerts: [],
    config: {
      enabled: cfg.proactive_alert !== false,
      filesPerWindow: cfg.alert_thresholds.files_per_window,
      windowSeconds: cfg.alert_thresholds.window_seconds,
      cooldownSeconds: cfg.alert_thresholds.cooldown_seconds,
      maxEvents: 1000,
      maxAlerts: 100,
    },
  };
}

/**
 * Record a change event in the tracker.
 *
 * @param {object} tracker
 * @param {number} fileCount - Number of files changed
 * @param {string[]} [files] - Changed file paths (optional, for diagnostics)
 */
function recordChange(tracker, fileCount, files) {
  if (!tracker.config.enabled) return;

  tracker.events.push({
    timestamp: Date.now(),
    fileCount,
    files: files || [],
  });

  if (tracker.events.length > tracker.config.maxEvents) {
    tracker.events = tracker.events.slice(-tracker.config.maxEvents);
  }
}

/**
 * Analyze the tracker for anomalous change velocity.
 *
 * @param {object} tracker
 * @returns {{ anomaly: boolean, alert?: object }}
 */
function checkAnomaly(tracker) {
  if (!tracker.config.enabled || tracker.events.length === 0) {
    return { anomaly: false };
  }

  const now = Date.now();
  const windowMs = tracker.config.windowSeconds * 1000;
  const recentEvents = tracker.events.filter(e => e.timestamp >= now - windowMs);
  const totalFiles = recentEvents.reduce((sum, e) => sum + e.fileCount, 0);

  if (totalFiles < tracker.config.filesPerWindow) {
    return { anomaly: false };
  }

  const lastAlert = tracker.alerts[tracker.alerts.length - 1];
  const cooldownMs = tracker.config.cooldownSeconds * 1000;
  if (lastAlert && now - lastAlert.detectedAt < cooldownMs) {
    return { anomaly: true, alert: lastAlert, suppressed: true };
  }

  const alert = {
    type: 'high_change_velocity',
    detectedAt: now,
    timestamp: new Date(now).toISOString(),
    fileCount: totalFiles,
    windowSeconds: tracker.config.windowSeconds,
    threshold: tracker.config.filesPerWindow,
    expiresAt: new Date(now + 5 * 60 * 1000).toISOString(),
    recommendation: 'High volume of file changes detected. Consider reviewing recent modifications and creating a manual snapshot.',
  };

  tracker.alerts.push(alert);
  if (tracker.alerts.length > tracker.config.maxAlerts) {
    tracker.alerts = tracker.alerts.slice(-tracker.config.maxAlerts);
  }

  return { anomaly: true, alert };
}

/**
 * Get the current alert status summary from the tracker.
 *
 * @param {object} tracker
 * @returns {{ enabled: boolean, hasActiveAlert: boolean, latestAlert?: object, alertCount: number, recentActivity: object }}
 */
function getAlertStatus(tracker) {
  if (!tracker.config.enabled) {
    return { enabled: false, hasActiveAlert: false, alertCount: 0, recentActivity: { windowSeconds: 0, fileCount: 0 } };
  }

  const now = Date.now();
  const windowMs = tracker.config.windowSeconds * 1000;
  const recentEvents = tracker.events.filter(e => e.timestamp >= now - windowMs);
  const fileCount = recentEvents.reduce((sum, e) => sum + e.fileCount, 0);

  const latestAlert = tracker.alerts[tracker.alerts.length - 1];
  const isActive = latestAlert && now < new Date(latestAlert.expiresAt).getTime();

  return {
    enabled: true,
    hasActiveAlert: !!isActive,
    latestAlert: isActive ? latestAlert : undefined,
    alertCount: tracker.alerts.length,
    recentActivity: {
      windowSeconds: tracker.config.windowSeconds,
      fileCount,
    },
  };
}

// ── Alert file persistence (bridge between auto-backup and MCP) ─

/**
 * Save an alert to a file so the MCP server can read it.
 *
 * @param {string} projectDir
 * @param {object} alert
 */
function saveAlert(projectDir, alert) {
  const filePath = alertFilePath(projectDir);
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(alert, null, 2));
  } catch { /* best-effort */ }
}

/**
 * Load and return any active (non-expired) alert from file.
 * Pure read — does not delete expired files (use clearExpiredAlert for that).
 *
 * @param {string} projectDir
 * @returns {object|null} - Alert object or null
 */
function loadActiveAlert(projectDir) {
  const filePath = alertFilePath(projectDir);
  try {
    if (!fs.existsSync(filePath)) return null;
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!data.expiresAt) return null;
    if (Date.now() >= new Date(data.expiresAt).getTime()) return null;
    return data;
  } catch { return null; }
}

/**
 * Remove the alert file if it exists and is expired. No-op if still active.
 * Safe to call periodically from the watcher loop.
 *
 * @param {string} projectDir
 * @returns {boolean} true if an expired file was removed
 */
function clearExpiredAlert(projectDir) {
  const filePath = alertFilePath(projectDir);
  try {
    if (!fs.existsSync(filePath)) return false;
    let data;
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      return true;
    }
    if (data.expiresAt && Date.now() >= new Date(data.expiresAt).getTime()) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch { return false; }
}

/**
 * Unconditionally remove the alert file (e.g. user acknowledged the alert).
 *
 * @param {string} projectDir
 */
function clearAlert(projectDir) {
  const filePath = alertFilePath(projectDir);
  try { fs.unlinkSync(filePath); } catch { /* ignore */ }
}

module.exports = {
  createChangeTracker,
  recordChange,
  checkAnomaly,
  getAlertStatus,
  saveAlert,
  loadActiveAlert,
  clearExpiredAlert,
  clearAlert,
  alertFilePath,
};
