'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  git, isGitRepo, gitDir: getGitDir, walkDir, diskFreeGB,
} = require('../utils');

// ── Helpers ──────────────────────────────────────────────────────

function parseShadowTimestamp(name) {
  const m = name.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})(?:_(\d{3}))?$/);
  if (!m) return null;
  const ms = m[7] ? `.${m[7]}` : '';
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${ms}`);
}

function parseBeforeExpression(before) {
  if (!before) return null;
  const iso = Date.parse(before);
  if (!isNaN(iso)) return new Date(iso);
  const agoMatch = before.match(/^(\d+)\s*(second|minute|hour|day|week|month)s?\s*ago$/i);
  if (agoMatch) {
    const n = parseInt(agoMatch[1], 10);
    const unit = agoMatch[2].toLowerCase();
    const ms = { second: 1000, minute: 60000, hour: 3600000, day: 86400000, week: 604800000, month: 2592000000 }[unit] || 0;
    return new Date(Date.now() - n * ms);
  }
  return null;
}

function entryToMs(entry) {
  if (!entry.timestamp) return 0;
  const iso = Date.parse(entry.timestamp);
  if (!isNaN(iso)) return iso;
  const tsName = typeof entry.timestamp === 'string' && entry.timestamp.startsWith('pre-restore-')
    ? entry.timestamp.slice('pre-restore-'.length)
    : entry.timestamp;
  const d = parseShadowTimestamp(tsName);
  return d ? d.getTime() : 0;
}

const TRAILER_MAP = {
  'Files-Changed': { key: 'filesChanged', parse: v => parseInt(v, 10) },
  'Summary':       { key: 'summary' },
  'Trigger':       { key: 'trigger' },
  'Intent':        { key: 'intent' },
  'Agent':         { key: 'agent' },
  'Session':       { key: 'session' },
  'From':          { key: 'from' },
  'Restore-To':   { key: 'restoreTo' },
  'File':          { key: 'restoreFile' },
};

function parseCommitTrailers(body) {
  if (!body) return {};
  const result = {};
  const pattern = new RegExp(`^(${Object.keys(TRAILER_MAP).join('|')}):\\s*(.+)$`);
  for (const line of body.split('\n')) {
    const m = line.match(pattern);
    if (m) {
      const def = TRAILER_MAP[m[1]];
      result[def.key] = def.parse ? def.parse(m[2]) : m[2];
    }
  }
  return result;
}

// ── List backups ────────────────────────────────────────────────

/**
 * List available backup/restore points from all sources.
 * Returns a globally time-sorted list (newest first), truncated to `limit`.
 *
 * @param {string} projectDir
 * @param {object} [opts]
 * @param {string} [opts.file] - Filter to commits touching this relative path
 * @param {string} [opts.before] - Time boundary (e.g. '10 minutes ago', ISO string)
 * @param {number} [opts.limit=20] - Max total results
 * @returns {{ sources: Array<{type: string, ref?: string, commitHash?: string, shortHash?: string, timestamp?: string, message?: string, path?: string, filesChanged?: number, summary?: string, trigger?: string}> }}
 */
function listBackups(projectDir, opts = {}) {
  const limit = opts.limit || 20;
  const sources = [];

  if (opts.file) {
    const normalized = path.normalize(opts.file).replace(/\\/g, '/');
    if (path.isAbsolute(normalized) || normalized.startsWith('..')) {
      return { sources: [], error: 'file path must be relative and within project directory' };
    }
  }

  const repo = isGitRepo(projectDir);
  const beforeDate = parseBeforeExpression(opts.before);

  // Git sources
  if (repo) {
    // Auto-backup commits (git --before handles native filtering)
    const autoRef = 'refs/guard/auto-backup';
    const autoExists = git(['rev-parse', '--verify', autoRef], { cwd: projectDir, allowFail: true });
    if (autoExists) {
      const logArgs = ['log', autoRef, '--format=%H\x1f%aI\x1f%B\x1e', `-${limit}`, '--grep=^guard:'];
      if (opts.before) logArgs.push(`--before=${opts.before}`);
      if (opts.file) logArgs.push('--', opts.file);
      const out = git(logArgs, { cwd: projectDir, allowFail: true });
      if (out) {
        for (const record of out.split('\x1e').filter(r => r.trim())) {
          const parts = record.split('\x1f');
          if (parts.length < 3) continue;
          const hash = parts[0].trim();
          const timestamp = parts[1];
          const body = parts[2];
          const subject = body.split('\n')[0];
          const trailers = parseCommitTrailers(body);
          sources.push({
            type: 'git-auto-backup',
            ref: autoRef,
            commitHash: hash,
            shortHash: hash.substring(0, 7),
            timestamp,
            message: subject,
            ...trailers,
          });
        }
      }
    }

    // Pre-restore snapshots
    const preRestoreRefs = git(
      ['for-each-ref', 'refs/guard/pre-restore/', '--format=%(refname) %(objectname) %(*objectname) %(creatordate:iso-strict)', '--sort=-creatordate'],
      { cwd: projectDir, allowFail: true }
    );
    if (preRestoreRefs) {
      for (const line of preRestoreRefs.split('\n').filter(Boolean)) {
        const parts = line.split(' ');
        const ref = parts[0];
        const hash = parts[1];
        const timestamp = parts[3] || parts[2];
        if (beforeDate && timestamp) {
          const ms = Date.parse(timestamp);
          if (!isNaN(ms) && ms > beforeDate.getTime()) continue;
        }
        const entry = {
          type: 'git-pre-restore',
          ref,
          commitHash: hash,
          shortHash: hash.substring(0, 7),
          timestamp,
        };
        const prBody = git(['log', '-1', '--format=%B', hash], { cwd: projectDir, allowFail: true });
        if (prBody) {
          const prSubject = prBody.split('\n')[0];
          if (prSubject) entry.message = prSubject;
          Object.assign(entry, parseCommitTrailers(prBody));
        }
        sources.push(entry);
      }
    }

    // Agent snapshot ref
    const snapshotHash = git(['rev-parse', '--verify', 'refs/guard/snapshot'], { cwd: projectDir, allowFail: true });
    if (snapshotHash) {
      const snapLog = git(['log', '-1', '--format=%aI\x1f%B', 'refs/guard/snapshot'], { cwd: projectDir, allowFail: true });
      const snapParts = snapLog ? snapLog.split('\x1f') : [];
      const ts = snapParts[0] || null;
      const snapBody = snapParts[1] || '';
      const snapTrailers = parseCommitTrailers(snapBody);
      const snapSubject = snapBody.split('\n')[0] || '';
      const include = !beforeDate || (ts && Date.parse(ts) <= beforeDate.getTime());
      if (include) {
        sources.push({
          type: 'git-snapshot',
          ref: 'refs/guard/snapshot',
          commitHash: snapshotHash,
          shortHash: snapshotHash.substring(0, 7),
          timestamp: ts,
          message: snapSubject || undefined,
          ...snapTrailers,
        });
      }
    }
  }

  // Shadow copy directories
  const backupDir = path.join(projectDir, '.cursor-guard-backup');
  if (fs.existsSync(backupDir)) {
    try {
      const dirs = fs.readdirSync(backupDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
        .sort()
        .reverse();

      for (const name of dirs) {
        const isPreRestore = name.startsWith('pre-restore-');
        const isTimestamp = /^\d{8}_\d{6}(_\d{3})?$/.test(name);
        if (!isTimestamp && !isPreRestore) continue;

        if (beforeDate) {
          const tsName = isPreRestore ? name.slice('pre-restore-'.length) : name;
          const snapDate = parseShadowTimestamp(tsName);
          if (snapDate && snapDate.getTime() > beforeDate.getTime()) continue;
        }

        const dirPath = path.join(backupDir, name);

        if (opts.file && !fs.existsSync(path.join(dirPath, opts.file))) continue;

        sources.push({
          type: isPreRestore ? 'shadow-pre-restore' : 'shadow',
          timestamp: name,
          path: dirPath,
        });
      }
    } catch { /* ignore */ }
  }

  // Unified time sort (newest first) across all sources, then truncate
  sources.sort((a, b) => entryToMs(b) - entryToMs(a));

  return { sources: sources.slice(0, limit) };
}

// ── Shadow retention ────────────────────────────────────────────

/**
 * Clean old shadow copy snapshots based on retention config.
 *
 * @param {string} backupDir - Path to .cursor-guard-backup/
 * @param {object} cfg - Loaded config
 * @returns {{ removed: number, mode: string, diskFreeGB?: number, diskWarning?: string }}
 */
function cleanShadowRetention(backupDir, cfg) {
  const { mode, days, max_count, max_size_mb } = cfg.retention;
  let dirs;
  try {
    dirs = fs.readdirSync(backupDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && /^\d{8}_\d{6}(_\d{3})?$/.test(d.name))
      .map(d => d.name)
      .sort()
      .reverse();
  } catch { return { removed: 0, mode }; }
  if (!dirs || dirs.length === 0) return { removed: 0, mode };

  let removed = 0;

  if (mode === 'days') {
    const cutoff = Date.now() - days * 86400000;
    for (const name of dirs) {
      const dt = parseShadowTimestamp(name);
      if (!dt) continue;
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

  const result = { removed, mode };

  const freeGB = diskFreeGB(backupDir);
  if (freeGB !== null) {
    result.diskFreeGB = parseFloat(freeGB.toFixed(1));
    if (freeGB < 1) result.diskWarning = 'critically low';
    else if (freeGB < 5) result.diskWarning = 'low';
  }

  return result;
}

// ── Git retention ───────────────────────────────────────────────

/**
 * Clean old git auto-backup commits by rebuilding the branch as an orphan chain.
 *
 * @param {string} branchRef
 * @param {string} gitDirPath
 * @param {object} cfg - Loaded config
 * @param {string} cwd - Project directory
 * @returns {{ kept: number, pruned: number, mode: string, rebuilt: boolean, skipped?: boolean, reason?: string }}
 */
function cleanGitRetention(branchRef, gitDirPath, cfg, cwd) {
  const { mode, days, max_count } = cfg.git_retention;
  if (!cfg.git_retention.enabled) {
    return { kept: 0, pruned: 0, mode, rebuilt: false, skipped: true, reason: 'retention disabled' };
  }

  const RS = '\x1e', US = '\x1f';
  const out = git(['log', branchRef, `--format=%H${US}%aI${US}%cI${US}%s${US}%B${RS}`], { cwd, allowFail: true });
  if (!out) {
    return { kept: 0, pruned: 0, mode, rebuilt: false, skipped: true, reason: 'no commits on ref' };
  }

  const records = out.split(RS).filter(r => r.trim());
  const guardCommits = [];
  for (const record of records) {
    const fields = record.split(US);
    if (fields.length < 5) continue;
    const hash = fields[0].trim();
    const authorDate = fields[1].trim();
    const committerDate = fields[2].trim();
    const subject = fields[3].trim();
    const fullBody = fields[4].trim();
    if (subject.startsWith('guard: auto-backup') || subject.startsWith('guard: snapshot')) {
      guardCommits.push({ hash, authorDate, committerDate, subject, fullBody });
    }
  }

  const total = guardCommits.length;
  if (total === 0) {
    return { kept: 0, pruned: 0, mode, rebuilt: false, skipped: true, reason: 'no guard commits found' };
  }

  let keepCount = total;
  if (mode === 'count') {
    keepCount = Math.min(total, max_count);
  } else if (mode === 'days') {
    const cutoff = Date.now() - days * 86400000;
    keepCount = 0;
    for (const c of guardCommits) {
      if (new Date(c.authorDate).getTime() >= cutoff) keepCount++;
      else break;
    }
    keepCount = Math.max(keepCount, 10);
  }

  if (keepCount >= total) {
    return { kept: total, pruned: 0, mode, rebuilt: false };
  }

  const toKeep = guardCommits.slice(0, keepCount).reverse();

  function commitTreeWithDate(args, commit) {
    const env = {
      ...process.env,
      GIT_AUTHOR_DATE: commit.authorDate,
      GIT_COMMITTER_DATE: commit.committerDate,
    };
    try {
      return execFileSync('git', args, { cwd, env, stdio: 'pipe', encoding: 'utf-8' }).trim() || null;
    } catch { return null; }
  }

  const rootTree = git(['rev-parse', `${toKeep[0].hash}^{tree}`], { cwd, allowFail: true });
  if (!rootTree) {
    return { kept: total, pruned: 0, mode, rebuilt: false, reason: 'could not resolve root tree' };
  }
  const msgOf = (c) => c.fullBody || c.subject;
  let prevHash = commitTreeWithDate(['commit-tree', rootTree, '-m', msgOf(toKeep[0])], toKeep[0]);
  if (!prevHash) {
    return { kept: total, pruned: 0, mode, rebuilt: false, reason: 'commit-tree failed for root' };
  }

  for (let i = 1; i < toKeep.length; i++) {
    const tree = git(['rev-parse', `${toKeep[i].hash}^{tree}`], { cwd, allowFail: true });
    if (!tree) {
      return { kept: total, pruned: 0, mode, rebuilt: false, reason: `could not resolve tree for commit ${i}` };
    }
    prevHash = commitTreeWithDate(['commit-tree', tree, '-p', prevHash, '-m', msgOf(toKeep[i])], toKeep[i]);
    if (!prevHash) {
      return { kept: total, pruned: 0, mode, rebuilt: false, reason: `commit-tree failed at index ${i}` };
    }
  }

  git(['update-ref', branchRef, prevHash], { cwd, allowFail: true });

  return { kept: keepCount, pruned: total - keepCount, mode, rebuilt: true };
}

// ── Get backup file details ─────────────────────────────────────

/** Git's canonical empty tree (used as diff base for root/orphan commits). */
const GIT_EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/** Normalize paths so numstat / name-status keys match (Windows vs /, quotes). */
function _normalizeBackupPath(p) {
  if (!p) return p;
  let s = String(p).replace(/\\/g, '/');
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).replace(/\\"/g, '"');
  }
  return s;
}

/** Parse one line of `git diff --numstat` (same semantics as CLI; binary => `- -`). */
function _parseGitDiffNumstatLine(add, del) {
  if (add === '-' || del === '-') {
    return { added: 0, deleted: 0, binary: true };
  }
  const a = parseInt(add, 10);
  const d = parseInt(del, 10);
  return {
    added: Number.isNaN(a) ? 0 : a,
    deleted: Number.isNaN(d) ? 0 : d,
    binary: false,
  };
}

/**
 * Get structured file-level changes for a specific git backup commit.
 * Uses **only** `git diff --numstat` + `git diff --name-status` (same as terminal),
 * so +/- counts match `git diff parent..commit` 100%. Root/orphan commits diff
 * against the standard empty tree.
 *
 * @param {string} projectDir
 * @param {string} commitHash - Full or short commit hash
 * @returns {{ files: Array<{path: string, action: string, added: number, deleted: number}>, error?: string }}
 */
function getBackupFiles(projectDir, commitHash) {
  if (!isGitRepo(projectDir)) {
    return { files: [], error: 'not a git repository' };
  }

  const resolved = git(['rev-parse', '--verify', commitHash], { cwd: projectDir, allowFail: true });
  if (!resolved) {
    return { files: [], error: `cannot resolve commit: ${commitHash}` };
  }

  const parentCommit = git(['rev-parse', '--verify', `${resolved}^`], { cwd: projectDir, allowFail: true });
  const parent = parentCommit || GIT_EMPTY_TREE_SHA;

  const numstatOut = git(['diff', '--numstat', parent, resolved], { cwd: projectDir, allowFail: true });
  const nameStatusOut = git(['diff', '--name-status', parent, resolved], { cwd: projectDir, allowFail: true });

  const stats = {};
  if (numstatOut) {
    for (const line of numstatOut.split('\n').filter(Boolean)) {
      const [add, del, ...nameParts] = line.split('\t');
      const fname = _normalizeBackupPath(nameParts.join('\t'));
      stats[fname] = _parseGitDiffNumstatLine(add, del);
    }
  }

  const ACTION_MAP = { M: 'modified', A: 'added', D: 'deleted' };
  const files = [];
  if (nameStatusOut) {
    for (const line of nameStatusOut.split('\n').filter(Boolean)) {
      const tab = line.indexOf('\t');
      if (tab < 0) continue;
      const code = line.substring(0, tab).trim();
      const filePart = line.substring(tab + 1);
      let action = ACTION_MAP[code];
      if (code.startsWith('R')) action = 'renamed';
      else if (code.startsWith('C')) action = 'copied';
      else if (!action) action = 'modified';

      const fileName = filePart.split('\t').pop();
      const norm = _normalizeBackupPath(fileName);
      let s = stats[norm];
      if (!s && fileName !== norm) s = stats[fileName];
      if (!s) s = { added: 0, deleted: 0, binary: false };

      files.push({ path: fileName, action, added: s.added, deleted: s.deleted });
    }
  }

  files.sort((a, b) => (b.added + b.deleted) - (a.added + a.deleted));
  return { files };
}

module.exports = { listBackups, getBackupFiles, cleanShadowRetention, cleanGitRetention, parseShadowTimestamp };
