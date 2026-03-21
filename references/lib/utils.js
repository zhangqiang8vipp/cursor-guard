'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// ── ANSI colors ──────────────────────────────────────────────────

const color = {
  red:     s => `\x1b[31m${s}\x1b[0m`,
  green:   s => `\x1b[32m${s}\x1b[0m`,
  yellow:  s => `\x1b[33m${s}\x1b[0m`,
  cyan:    s => `\x1b[36m${s}\x1b[0m`,
  gray:    s => `\x1b[90m${s}\x1b[0m`,
  reset:   '\x1b[0m',
};

// ── Glob matching (minimatch subset, zero deps) ─────────────────

/**
 * Match a relative path against a glob pattern.
 * Supports: *, **, ? — enough for .cursor-guard.json patterns.
 */
function globMatch(pattern, relPath) {
  const p = pattern.replace(/\\/g, '/');
  const r = relPath.replace(/\\/g, '/');
  const re = '^' + p
    .replace(/[.+^${}()|[\]]/g, '\\$&')  // escape regex specials (except * and ?)
    .replace(/\*\*/g, '\0')               // placeholder for **
    .replace(/\*/g, '[^/]*')              // * = anything except /
    .replace(/\?/g, '[^/]')              // ? = single char except /
    .replace(/\0/g, '.*')                // ** = anything including /
    + '$';
  return new RegExp(re).test(r);
}

/**
 * Check if a relative file path matches any pattern in a list.
 * Also checks leaf filename for patterns like "*.log".
 */
function matchesAny(patterns, relPath) {
  const leaf = path.basename(relPath);
  for (const pat of patterns) {
    if (globMatch(pat, relPath) || globMatch(pat, leaf)) return true;
  }
  return false;
}

// ── File traversal (recursive, no external deps) ────────────────

const ALWAYS_SKIP = /[/\\](\.git|\.cursor-guard-backup|node_modules)[/\\]/;

function walkDir(dir, rootDir) {
  const results = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); }
    catch { continue; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      const rel = path.relative(rootDir, full).replace(/\\/g, '/');
      if (ALWAYS_SKIP.test('/' + rel + '/')) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        results.push({ full, rel, name: entry.name });
      }
    }
  }
  return results;
}

// ── Config loading ──────────────────────────────────────────────

const DEFAULT_SECRETS = ['.env', '.env.*', '*.key', '*.pem', '*.p12', '*.pfx', 'credentials*'];

const VALID_STRATEGIES = ['git', 'shadow', 'both'];
const VALID_PRE_RESTORE = ['always', 'ask', 'never'];
const VALID_RETENTION_MODES = ['days', 'count', 'size'];
const VALID_GIT_RETENTION_MODES = ['days', 'count'];

const DEFAULT_CONFIG = {
  protect: [],
  ignore: [],
  secrets_patterns: DEFAULT_SECRETS,
  backup_strategy: 'git',
  auto_backup_interval_seconds: 60,
  pre_restore_backup: 'always',
  retention: { mode: 'days', days: 30, max_count: 100, max_size_mb: 500 },
  git_retention: { enabled: false, mode: 'count', days: 30, max_count: 200 },
};

function loadConfig(projectDir) {
  const cfgPath = path.join(projectDir, '.cursor-guard.json');
  const cfg = { ...DEFAULT_CONFIG };
  cfg.retention = { ...DEFAULT_CONFIG.retention };
  cfg.git_retention = { ...DEFAULT_CONFIG.git_retention };

  if (!fs.existsSync(cfgPath)) return { cfg, loaded: false, error: null };

  try {
    const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    if (Array.isArray(raw.protect))          cfg.protect = raw.protect;
    if (Array.isArray(raw.ignore))           cfg.ignore = raw.ignore;
    if (Array.isArray(raw.secrets_patterns)) cfg.secrets_patterns = raw.secrets_patterns;
    if (Array.isArray(raw.secrets_patterns_extra)) {
      const merged = [...new Set([...cfg.secrets_patterns, ...raw.secrets_patterns_extra])];
      cfg.secrets_patterns = merged;
    }
    const warnings = [];
    if (typeof raw.backup_strategy === 'string') {
      if (VALID_STRATEGIES.includes(raw.backup_strategy)) {
        cfg.backup_strategy = raw.backup_strategy;
      } else {
        warnings.push(`Unknown backup_strategy "${raw.backup_strategy}", using default "${cfg.backup_strategy}"`);
      }
    }
    if (typeof raw.auto_backup_interval_seconds === 'number') cfg.auto_backup_interval_seconds = raw.auto_backup_interval_seconds;
    if (typeof raw.pre_restore_backup === 'string') {
      if (VALID_PRE_RESTORE.includes(raw.pre_restore_backup)) {
        cfg.pre_restore_backup = raw.pre_restore_backup;
      } else {
        warnings.push(`Unknown pre_restore_backup "${raw.pre_restore_backup}", using default "${cfg.pre_restore_backup}"`);
      }
    }
    if (raw.retention) {
      if (raw.retention.mode) {
        if (VALID_RETENTION_MODES.includes(raw.retention.mode)) {
          cfg.retention.mode = raw.retention.mode;
        } else {
          warnings.push(`Unknown retention.mode "${raw.retention.mode}", using default "${cfg.retention.mode}"`);
        }
      }
      if (typeof raw.retention.days === 'number')        cfg.retention.days = raw.retention.days;
      if (typeof raw.retention.max_count === 'number')   cfg.retention.max_count = raw.retention.max_count;
      if (typeof raw.retention.max_size_mb === 'number') cfg.retention.max_size_mb = raw.retention.max_size_mb;
    }
    if (raw.git_retention) {
      if (raw.git_retention.enabled === true)  cfg.git_retention.enabled = true;
      if (raw.git_retention.mode) {
        if (VALID_GIT_RETENTION_MODES.includes(raw.git_retention.mode)) {
          cfg.git_retention.mode = raw.git_retention.mode;
        } else {
          warnings.push(`Unknown git_retention.mode "${raw.git_retention.mode}", using default "${cfg.git_retention.mode}"`);
        }
      }
      if (typeof raw.git_retention.days === 'number')      cfg.git_retention.days = raw.git_retention.days;
      if (typeof raw.git_retention.max_count === 'number') cfg.git_retention.max_count = raw.git_retention.max_count;
    }
    return { cfg, loaded: true, error: null, warnings };
  } catch (e) {
    return { cfg, loaded: false, error: e.message };
  }
}

// ── Git helpers ─────────────────────────────────────────────────

function gitAvailable() {
  try {
    execFileSync('git', ['--version'], { stdio: 'pipe' });
    return true;
  } catch { return false; }
}

function git(args, opts = {}) {
  const options = {
    stdio: 'pipe',
    encoding: 'utf-8',
    ...opts,
  };
  try {
    return execFileSync('git', args, options).trim();
  } catch (e) {
    if (opts.allowFail) return null;
    throw e;
  }
}

function isGitRepo(cwd) {
  try {
    const result = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd, stdio: 'pipe', encoding: 'utf-8',
    }).trim();
    return result === 'true';
  } catch { return false; }
}

function gitDir(cwd) {
  try {
    const dir = execFileSync('git', ['rev-parse', '--git-dir'], {
      cwd, stdio: 'pipe', encoding: 'utf-8',
    }).trim();
    return path.resolve(cwd, dir);
  } catch { return null; }
}

function gitVersion() {
  try {
    return execFileSync('git', ['--version'], { stdio: 'pipe', encoding: 'utf-8' })
      .trim().replace('git version ', '');
  } catch { return null; }
}

// ── Manifest (for shadow-mode change detection) ─────────────────

function buildManifest(files) {
  const manifest = {};
  for (const f of files) {
    try {
      const st = fs.statSync(f.full);
      manifest[f.rel] = { mtimeMs: st.mtimeMs, size: st.size };
    } catch { /* skip unreadable files */ }
  }
  return manifest;
}

function manifestPath(backupDir) {
  return path.join(backupDir, '.manifest.json');
}

function loadManifest(backupDir) {
  const p = manifestPath(backupDir);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch { return null; }
}

function saveManifest(backupDir, manifest) {
  fs.writeFileSync(manifestPath(backupDir), JSON.stringify(manifest, null, 2));
}

function manifestChanged(oldM, newM) {
  if (!oldM) return true;
  const oldKeys = Object.keys(oldM);
  const newKeys = Object.keys(newM);
  if (oldKeys.length !== newKeys.length) return true;
  for (const k of newKeys) {
    if (!oldM[k]) return true;
    if (oldM[k].mtimeMs !== newM[k].mtimeMs || oldM[k].size !== newM[k].size) return true;
  }
  return false;
}

// ── Disk space (cross-platform) ─────────────────────────────────

function diskFreeGB(dir) {
  try {
    if (process.platform === 'win32') {
      const drive = path.parse(dir).root.replace(/\\$/, '');
      // Try PowerShell first (works on all modern Windows)
      try {
        const out = execFileSync('powershell', [
          '-NoProfile', '-Command',
          `(Get-PSDrive ${drive[0]}).Free`,
        ], { stdio: 'pipe', encoding: 'utf-8' });
        const bytes = parseInt(out.trim(), 10);
        if (!isNaN(bytes)) return bytes / (1024 ** 3);
      } catch { /* fall through */ }
      // Fallback to wmic
      try {
        const out = execFileSync('wmic', [
          'logicaldisk', 'where', `DeviceID="${drive}"`, 'get', 'FreeSpace', '/value',
        ], { stdio: 'pipe', encoding: 'utf-8' });
        const m = out.match(/FreeSpace=(\d+)/);
        return m ? parseFloat(m[1]) / (1024 ** 3) : null;
      } catch { return null; }
    }
    const out = execFileSync('df', ['-k', dir], { stdio: 'pipe', encoding: 'utf-8' });
    const lines = out.trim().split('\n');
    if (lines.length < 2) return null;
    const parts = lines[1].split(/\s+/);
    const availKB = parseInt(parts[3], 10);
    return isNaN(availKB) ? null : availKB / (1024 * 1024);
  } catch { return null; }
}

// ── Logging ─────────────────────────────────────────────────────

function timestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function createLogger(logFilePath, maxSizeMB = 10) {
  let writeCount = 0;
  function rotateIfNeeded() {
    if (++writeCount % 100 !== 0) return;
    try {
      const stat = fs.statSync(logFilePath);
      if (stat.size > maxSizeMB * 1024 * 1024) {
        const old = logFilePath + '.old';
        try { fs.unlinkSync(old); } catch { /* ignore */ }
        fs.renameSync(logFilePath, old);
      }
    } catch { /* ignore */ }
  }
  return {
    log(msg, c = 'green') {
      const line = `${timestamp()}  ${msg}`;
      try { fs.appendFileSync(logFilePath, line + '\n'); rotateIfNeeded(); } catch { /* ignore */ }
      console.log(color[c] ? color[c](`[guard] ${line}`) : `[guard] ${line}`);
    },
    info(msg) { this.log(msg, 'cyan'); },
    warn(msg) { this.log(msg, 'yellow'); },
    error(msg) { this.log(msg, 'red'); },
  };
}

// ── CLI arg parsing (zero deps) ─────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

// ── Filter files by config ──────────────────────────────────────

function filterFiles(files, cfg) {
  let result = files;
  if (cfg.protect.length > 0) {
    result = result.filter(f => matchesAny(cfg.protect, f.rel));
  }
  result = result.filter(f => {
    if (cfg.ignore.length > 0 && matchesAny(cfg.ignore, f.rel)) return false;
    if (matchesAny(cfg.secrets_patterns, f.rel)) return false;
    return true;
  });
  return result;
}

// ── Exports ─────────────────────────────────────────────────────

module.exports = {
  color,
  globMatch,
  matchesAny,
  walkDir,
  loadConfig,
  DEFAULT_CONFIG,
  DEFAULT_SECRETS,
  gitAvailable,
  git,
  isGitRepo,
  gitDir,
  gitVersion,
  buildManifest,
  manifestPath,
  loadManifest,
  saveManifest,
  manifestChanged,
  diskFreeGB,
  timestamp,
  createLogger,
  parseArgs,
  filterFiles,
};
