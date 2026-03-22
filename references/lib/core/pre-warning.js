'use strict';

const fs = require('fs');
const path = require('path');
const { isGitRepo, gitDir: getGitDir, matchesAny } = require('../utils');

const DEFAULT_EXPIRY_MS = 10 * 60 * 1000;
const MAX_ACTIVE_WARNINGS = 20;
const MAX_HISTORY = 100;

function warningFilePath(projectDir) {
  if (isGitRepo(projectDir)) {
    const gDir = getGitDir(projectDir);
    if (gDir) return path.join(gDir, 'cursor-guard-pre-warning.json');
  }
  return path.join(projectDir, '.cursor-guard-backup', 'cursor-guard-pre-warning.json');
}

function historyFilePath(projectDir) {
  if (isGitRepo(projectDir)) {
    const gDir = getGitDir(projectDir);
    if (gDir) return path.join(gDir, 'cursor-guard-pre-warning-history.json');
  }
  return path.join(projectDir, '.cursor-guard-backup', 'cursor-guard-pre-warning-history.json');
}

function _readActiveStore(projectDir) {
  const filePath = warningFilePath(projectDir);
  try {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const warnings = Array.isArray(parsed?.warnings) ? parsed.warnings : [];
    return warnings.filter(w => w && typeof w.file === 'string');
  } catch { return []; }
}

function _writeActiveStore(projectDir, warnings) {
  const filePath = warningFilePath(projectDir);
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({
      updatedAt: new Date().toISOString(),
      warnings,
    }, null, 2));
  } catch { /* best-effort */ }
}

function _readHistory(projectDir) {
  const filePath = historyFilePath(projectDir);
  try {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function _writeHistory(projectDir, warnings) {
  const filePath = historyFilePath(projectDir);
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(warnings.slice(0, MAX_HISTORY), null, 2));
  } catch { /* best-effort */ }
}

function _normalizeWarning(warning, opts = {}) {
  const now = warning.detectedAt || Date.now();
  return {
    type: 'destructive_edit_risk',
    detectedAt: now,
    timestamp: warning.timestamp || new Date(now).toISOString(),
    expiresAt: warning.expiresAt || new Date(now + (opts.expiryMs || DEFAULT_EXPIRY_MS)).toISOString(),
    ...warning,
  };
}

function isPreWarningEnabled(cfg) {
  return cfg?.enable_pre_warning === true;
}

function shouldExcludePreWarning(file, cfg) {
  if (!file || !Array.isArray(cfg?.pre_warning_exclude_patterns)) return false;
  return matchesAny(cfg.pre_warning_exclude_patterns, file);
}

function recordPreWarning(projectDir, warning, opts = {}) {
  const normalized = _normalizeWarning(warning, opts);

  const history = _readHistory(projectDir);
  _writeHistory(projectDir, [normalized, ...history]);

  if (opts.setActive === false) return normalized;

  const active = loadActivePreWarnings(projectDir)
    .filter(w => w.file !== normalized.file);
  active.unshift(normalized);
  _writeActiveStore(projectDir, active.slice(0, MAX_ACTIVE_WARNINGS));
  return normalized;
}

function loadActivePreWarnings(projectDir) {
  const now = Date.now();
  return _readActiveStore(projectDir)
    .filter(w => !w.expiresAt || now < new Date(w.expiresAt).getTime())
    .sort((a, b) => (b.detectedAt || 0) - (a.detectedAt || 0));
}

function loadActivePreWarning(projectDir) {
  return loadActivePreWarnings(projectDir)[0] || null;
}

function listPreWarningHistory(projectDir, limit = 20) {
  return _readHistory(projectDir)
    .sort((a, b) => (b.detectedAt || 0) - (a.detectedAt || 0))
    .slice(0, limit);
}

function clearPreWarning(projectDir, file) {
  if (!file) {
    _writeActiveStore(projectDir, []);
    return;
  }
  const active = loadActivePreWarnings(projectDir).filter(w => w.file !== file);
  if (active.length === 0) {
    const filePath = warningFilePath(projectDir);
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
    return;
  }
  _writeActiveStore(projectDir, active);
}

function clearExpiredPreWarnings(projectDir) {
  const active = loadActivePreWarnings(projectDir);
  if (active.length === 0) {
    const filePath = warningFilePath(projectDir);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }
  _writeActiveStore(projectDir, active);
  return false;
}

function _splitLines(text) {
  return String(text || '').replace(/\r\n/g, '\n').split('\n');
}

function _normalizeLine(line) {
  return String(line || '').trim().replace(/\s+/g, ' ');
}

function _countLines(lines) {
  const counts = new Map();
  for (const line of lines) {
    const normalized = _normalizeLine(line);
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }
  return counts;
}

function _extractRemovedLines(prevLines, nextLines) {
  const nextCounts = _countLines(nextLines);
  const removed = [];
  for (let i = 0; i < prevLines.length; i++) {
    const raw = prevLines[i];
    const normalized = _normalizeLine(raw);
    if (!normalized) continue;
    const remaining = nextCounts.get(normalized) || 0;
    if (remaining > 0) {
      nextCounts.set(normalized, remaining - 1);
      continue;
    }
    removed.push({
      line: raw,
      normalized,
      lineNumber: i + 1,
    });
  }
  return removed;
}

function _extractDefinitions(lines) {
  const defs = [];
  const patterns = [
    /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/,
    /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^=]*\)\s*=>/,
    /^\s*(?:public|private|protected|static|async|get|set|\s)*([A-Za-z_$][\w$]*)\s*\([^;]*\)\s*(?:\{|=>)\s*$/,
    /^\s*(?:public|private|protected|internal|static|final|virtual|override|abstract|synchronized|\s)+(?:[\w<>\[\],.?]+\s+)+([A-Za-z_]\w*)\s*\([^;]*\)\s*(?:\{|=>)\s*$/,
    /^\s*def\s+([A-Za-z_]\w*[!?=]?)\s*\(/,
    /^\s*func\s+(?:\([^)]+\)\s*)?([A-Za-z_]\w*)\s*\(/,
    /^\s*(?:public|private|protected|static|\s)*function\s+([A-Za-z_]\w*)\s*\(/,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (!match) continue;
      defs.push({
        name: match[1],
        signature: _normalizeLine(line),
        lineNumber: i + 1,
      });
      break;
    }
  }

  return defs;
}

function _removedDefinitions(prevLines, nextLines) {
  const prevDefs = _extractDefinitions(prevLines);
  const nextDefs = _extractDefinitions(nextLines);
  const nextNames = new Set(nextDefs.map(d => d.name));
  return prevDefs.filter(d => !nextNames.has(d.name));
}

function assessDeletionRisk(prevText, nextText, opts = {}) {
  const threshold = Math.max(1, parseInt(opts.threshold, 10) || 30);
  const prevLines = _splitLines(prevText);
  const nextLines = _splitLines(nextText);
  const previousNonEmptyLines = prevLines.filter(line => _normalizeLine(line)).length;
  const nextNonEmptyLines = nextLines.filter(line => _normalizeLine(line)).length;

  if (String(prevText || '') === String(nextText || '')) {
    return {
      triggered: false,
      threshold,
      previousNonEmptyLines,
      nextNonEmptyLines,
      deletedLines: 0,
      removedMethodCount: 0,
      removedMethods: [],
      riskPercent: 0,
      summary: 'No deletion risk detected.',
    };
  }

  const removedLines = _extractRemovedLines(prevLines, nextLines);
  const removedMethods = _removedDefinitions(prevLines, nextLines);
  const deletedLines = removedLines.length;
  const baseRisk = previousNonEmptyLines > 0
    ? Math.round((deletedLines / previousNonEmptyLines) * 100)
    : 0;
  const methodBoost = removedMethods.length > 0
    ? Math.min(100, baseRisk + removedMethods.length * 20)
    : baseRisk;
  const riskPercent = Math.min(100, Math.max(baseRisk, methodBoost));
  const triggered = deletedLines > 0 && (riskPercent >= threshold || removedMethods.length > 0);

  const methodSummary = removedMethods.length > 0
    ? `${removedMethods.length} method${removedMethods.length === 1 ? '' : 's'} removed`
    : null;
  const lineSummary = deletedLines > 0
    ? `${deletedLines} line${deletedLines === 1 ? '' : 's'} deleted`
    : null;
  const summaryParts = [methodSummary, lineSummary].filter(Boolean);
  const deletedLineSamples = removedLines
    .map(r => r.normalized)
    .filter(Boolean)
    .slice(0, 5);

  return {
    triggered,
    threshold,
    previousNonEmptyLines,
    nextNonEmptyLines,
    deletedLines,
    netLineDelta: nextNonEmptyLines - previousNonEmptyLines,
    removedMethodCount: removedMethods.length,
    removedMethods,
    riskPercent,
    deletedLineSamples,
    summary: summaryParts.length > 0
      ? `${summaryParts.join(', ')} (risk ${riskPercent}%)`
      : `Deletion risk ${riskPercent}%`,
  };
}

module.exports = {
  assessDeletionRisk,
  isPreWarningEnabled,
  shouldExcludePreWarning,
  recordPreWarning,
  loadActivePreWarning,
  loadActivePreWarnings,
  listPreWarningHistory,
  clearPreWarning,
  clearExpiredPreWarnings,
  warningFilePath,
  historyFilePath,
};
