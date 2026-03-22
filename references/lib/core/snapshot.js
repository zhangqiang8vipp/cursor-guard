'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  git, isGitRepo, gitDir: getGitDir, walkDir, filterFiles, matchesAny,
} = require('../utils');

// ── Helpers ─────────────────────────────────────────────────────

function formatTimestamp(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function listIndexFiles(cwd, env) {
  try {
    const out = execFileSync('git', ['ls-files', '--cached'], {
      cwd, env, stdio: 'pipe', encoding: 'utf-8',
    }).trim();
    return out ? out.split('\n').filter(Boolean) : [];
  } catch { return []; }
}

function pruneIndexFiles(cwd, env, shouldRemove) {
  for (const f of listIndexFiles(cwd, env)) {
    if (!shouldRemove(f)) continue;
    try {
      execFileSync('git', ['rm', '--cached', '--ignore-unmatch', '-q', '--', f], {
        cwd, env, stdio: 'pipe',
      });
    } catch { /* ignore */ }
  }
}

function removeSecretsFromIndex(secretsPatterns, cwd, env) {
  const files = listIndexFiles(cwd, env);

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
  return excluded;
}

// ── Commit message builder ──────────────────────────────────────

function buildCommitMessage(ts, opts) {
  if (opts.message && !opts.context) return opts.message;

  const ctx = opts.context || {};
  const countTag = ctx.changedFileCount ? ` (${ctx.changedFileCount} files)` : '';
  const subject = opts.message || `guard: auto-backup ${ts}${countTag}`;

  const trailers = [];
  if (ctx.changedFileCount != null) trailers.push(`Files-Changed: ${ctx.changedFileCount}`);
  if (ctx.summary) trailers.push(`Summary: ${ctx.summary}`);
  if (ctx.trigger) trailers.push(`Trigger: ${ctx.trigger}`);
  if (ctx.intent) trailers.push(`Intent: ${ctx.intent}`);
  if (ctx.agent) trailers.push(`Agent: ${ctx.agent}`);
  if (ctx.session) trailers.push(`Session: ${ctx.session}`);

  if (trailers.length === 0) return subject;
  return subject + '\n\n' + trailers.join('\n');
}

// ── Git snapshot ────────────────────────────────────────────────

/**
 * Create a git snapshot commit on a dedicated ref using plumbing commands.
 * Does not touch the user's index or branch.
 *
 * @param {string} projectDir
 * @param {object} cfg - Loaded config
 * @param {object} [opts]
 * @param {string} [opts.branchRef='refs/guard/auto-backup']
 * @param {string} [opts.message] - Commit message (auto-generated if omitted)
 * @param {object} [opts.context] - Backup context metadata
 * @param {string} [opts.context.trigger] - 'auto' | 'manual' | 'pre-restore'
 * @param {number} [opts.context.changedFileCount] - Number of changed files
 * @param {string} [opts.context.summary] - Short change summary (e.g. "Modified 3: a.js, b.js; Added 1: c.js")
 * @param {string} [opts.context.intent] - Why this snapshot was created (e.g. "refactoring auth middleware")
 * @param {string} [opts.context.agent] - AI model identifier (e.g. "claude-4-opus")
 * @param {string} [opts.context.session] - Conversation/session ID
 * @returns {{ status: 'created'|'skipped'|'error', commitHash?: string, shortHash?: string, fileCount?: number, reason?: string, error?: string, secretsExcluded?: string[] }}
 */
function createGitSnapshot(projectDir, cfg, opts = {}) {
  const branchRef = opts.branchRef || 'refs/guard/auto-backup';
  const cwd = projectDir;
  const gDir = getGitDir(projectDir);
  if (!gDir) return { status: 'error', error: 'not a git repository' };

  const guardIndex = path.join(gDir, 'cursor-guard-index');
  const guardIndexLock = guardIndex + '.lock';
  const env = { ...process.env, GIT_INDEX_FILE: guardIndex };

  try { fs.unlinkSync(guardIndex); } catch { /* doesn't exist */ }
  try { fs.unlinkSync(guardIndexLock); } catch { /* doesn't exist */ }

  try {
    const parentHash = git(['rev-parse', '--verify', branchRef], { cwd, allowFail: true });

    if (cfg.protect.length > 0) {
      // protect uses strict matching (full path only, no basename fallback)
      // so *.js only matches root-level js files, not nested ones
      execFileSync('git', ['add', '-A'], { cwd, env, stdio: 'pipe' });
      pruneIndexFiles(cwd, env, f => !matchesAny(cfg.protect, f, { strict: true }));
    } else {
      if (parentHash) {
        execFileSync('git', ['read-tree', branchRef], { cwd, env, stdio: 'pipe' });
      }
      execFileSync('git', ['add', '-A'], { cwd, env, stdio: 'pipe' });
    }

    // Keep ignore semantics aligned with filterFiles()/matchesAny(), including
    // basename-only patterns like "settings.json" for nested files.
    pruneIndexFiles(cwd, env, f => matchesAny(cfg.ignore, f));

    const secretsExcluded = removeSecretsFromIndex(cfg.secrets_patterns, cwd, env);

    const newTree = execFileSync('git', ['write-tree'], { cwd, env, stdio: 'pipe', encoding: 'utf-8' }).trim();
    const parentTree = parentHash
      ? git(['rev-parse', `${branchRef}^{tree}`], { cwd, allowFail: true })
      : null;

    if (newTree === parentTree) {
      return { status: 'skipped', reason: 'tree unchanged' };
    }

    // Build incremental summary from actual tree diff (not working-dir status)
    let changedCount;
    let incrementalSummary;
    let changedFiles;
    if (parentTree) {
      const diffOut = git(['diff-tree', '--no-commit-id', '--name-status', '-r', parentTree, newTree], { cwd, allowFail: true });
      if (diffOut) {
        const diffLines = diffOut.split('\n').filter(Boolean);
        const groups = { M: [], A: [], D: [], R: [] };
        for (const line of diffLines) {
          const tab = line.indexOf('\t');
          if (tab < 0) continue;
          const code = line.substring(0, tab).trim();
          const filePart = line.substring(tab + 1);
          const key = code.startsWith('R') ? 'R'
            : code === 'D' ? 'D'
            : code === 'A' ? 'A'
            : 'M';
          const fileName = filePart.split('\t').pop();
          if (matchesAny(cfg.ignore, fileName) || matchesAny(cfg.ignore, path.basename(fileName))) continue;
          groups[key].push(fileName);
        }
        changedCount = Object.values(groups).reduce((sum, arr) => sum + arr.length, 0);

        const numstatOut = git(['diff-tree', '--no-commit-id', '--numstat', '-r', parentTree, newTree], { cwd, allowFail: true });
        const stats = {};
        if (numstatOut) {
          for (const line of numstatOut.split('\n').filter(Boolean)) {
            const [add, del, ...nameParts] = line.split('\t');
            const fname = nameParts.join('\t');
            stats[fname] = { added: add === '-' ? 0 : parseInt(add, 10), deleted: del === '-' ? 0 : parseInt(del, 10) };
          }
        }

        // Build structured changedFiles array
        changedFiles = [];
        const ACTION_MAP = { M: 'modified', A: 'added', D: 'deleted', R: 'renamed' };
        for (const [key, arr] of Object.entries(groups)) {
          for (const f of arr) {
            const s = stats[f] || { added: 0, deleted: 0 };
            changedFiles.push({ path: f, action: ACTION_MAP[key], added: s.added, deleted: s.deleted });
          }
        }
        changedFiles.sort((a, b) => (b.added + b.deleted) - (a.added + a.deleted));

        function fmtFiles(arr) {
          return arr.slice(0, 5).map(f => {
            const s = stats[f];
            return s ? `${f} (+${s.added} -${s.deleted})` : f;
          }).join(', ');
        }

        const parts = [];
        if (groups.M.length) parts.push(`Modified ${groups.M.length}: ${fmtFiles(groups.M)}${groups.M.length > 5 ? ', ...' : ''}`);
        if (groups.A.length) parts.push(`Added ${groups.A.length}: ${fmtFiles(groups.A)}${groups.A.length > 5 ? ', ...' : ''}`);
        if (groups.D.length) parts.push(`Deleted ${groups.D.length}: ${fmtFiles(groups.D)}${groups.D.length > 5 ? ', ...' : ''}`);
        if (groups.R.length) parts.push(`Renamed ${groups.R.length}: ${fmtFiles(groups.R)}${groups.R.length > 5 ? ', ...' : ''}`);
        if (parts.length) incrementalSummary = parts.join('; ');
      }
    } else {
      const lsInitial = git(['ls-tree', '--name-only', '-r', newTree], { cwd, allowFail: true });
      if (lsInitial) {
        const files = lsInitial.split('\n').filter(Boolean)
          .filter(f => !matchesAny(cfg.ignore, f) && !matchesAny(cfg.ignore, path.basename(f)));
        changedCount = files.length;
        const sample = files.slice(0, 5).join(', ');
        incrementalSummary = `Added ${files.length}: ${sample}${files.length > 5 ? ', ...' : ''}`;
        changedFiles = files.map(f => ({ path: f, action: 'added', added: 0, deleted: 0 }));
      }
    }

    // Override context summary with the accurate incremental one
    if (incrementalSummary && opts.context) {
      opts.context.summary = incrementalSummary;
    } else if (incrementalSummary && !opts.context) {
      opts.context = { summary: incrementalSummary };
    }
    if (changedCount != null && opts.context) {
      opts.context.changedFileCount = changedCount;
    }

    const ts = formatTimestamp(new Date());
    const msg = buildCommitMessage(ts, opts);
    const commitArgs = parentHash
      ? ['commit-tree', newTree, '-p', parentHash, '-m', msg]
      : ['commit-tree', newTree, '-m', msg];
    const commitHash = execFileSync('git', commitArgs, { cwd, stdio: 'pipe', encoding: 'utf-8' }).trim();

    if (!commitHash) {
      return { status: 'error', error: 'commit-tree returned empty hash' };
    }

    git(['update-ref', branchRef, commitHash], { cwd });

    const lsOut = git(['ls-tree', '--name-only', '-r', newTree], { cwd, allowFail: true });
    const fileCount = lsOut ? lsOut.split('\n').filter(Boolean).length : 0;

    return {
      status: 'created',
      commitHash,
      shortHash: commitHash.substring(0, 7),
      fileCount,
      changedCount,
      changedFiles,
      incrementalSummary,
      secretsExcluded: secretsExcluded.length > 0 ? secretsExcluded : undefined,
    };
  } catch (e) {
    return { status: 'error', error: e.message };
  } finally {
    try { fs.unlinkSync(guardIndex); } catch { /* ignore */ }
    try { fs.unlinkSync(guardIndexLock); } catch { /* ignore */ }
  }
}

// ── Shadow copy ─────────────────────────────────────────────────

/**
 * Create a shadow (file) copy of the project.
 *
 * @param {string} projectDir
 * @param {object} cfg - Loaded config
 * @param {object} [opts]
 * @param {string} [opts.backupDir] - Override backup directory (default: projectDir/.cursor-guard-backup)
 * @returns {{ status: 'created'|'empty'|'error', timestamp?: string, fileCount?: number, snapshotDir?: string, error?: string }}
 */
function findPreviousSnapshot(backupDir) {
  try {
    const entries = fs.readdirSync(backupDir)
      .filter(e => /^\d{8}_\d{6}/.test(e))
      .sort()
      .reverse();
    for (const e of entries) {
      const full = path.join(backupDir, e);
      if (fs.statSync(full).isDirectory()) return full;
    }
  } catch { /* no previous snapshots */ }
  return null;
}

function createShadowCopy(projectDir, cfg, opts = {}) {
  const backupDir = opts.backupDir || path.join(projectDir, '.cursor-guard-backup');
  let ts = formatTimestamp(new Date());
  let snapDir = path.join(backupDir, ts);

  try {
    if (fs.existsSync(snapDir)) {
      const baseTs = ts;
      let seq = new Date().getMilliseconds();
      for (let i = 0; i < 1000 && fs.existsSync(snapDir); i++, seq++) {
        ts = `${baseTs}_${String(seq % 1000).padStart(3, '0')}`;
        snapDir = path.join(backupDir, ts);
      }
    }
    const prevSnapDir = findPreviousSnapshot(backupDir);

    fs.mkdirSync(snapDir, { recursive: true });

    const allFiles = walkDir(projectDir, projectDir);
    const files = filterFiles(allFiles, cfg);

    let copied = 0;
    let linked = 0;
    for (const f of files) {
      const dest = path.join(snapDir, f.rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      try {
        let didLink = false;
        if (prevSnapDir) {
          const prevFile = path.join(prevSnapDir, f.rel);
          try {
            const srcStat = fs.statSync(f.full);
            const prevStat = fs.statSync(prevFile);
            if (srcStat.size === prevStat.size && Math.abs(srcStat.mtimeMs - prevStat.mtimeMs) < 1) {
              fs.linkSync(prevFile, dest);
              didLink = true;
              linked++;
            }
          } catch { /* prev file missing or stat error — fall through to copy */ }
        }
        if (!didLink) {
          fs.copyFileSync(f.full, dest);
          try {
            const srcStat = fs.statSync(f.full);
            fs.utimesSync(dest, srcStat.atime, srcStat.mtime);
          } catch { /* non-critical: mtime preservation failed */ }
        }
        copied++;
      } catch { /* skip unreadable */ }
    }

    if (copied === 0) {
      fs.rmSync(snapDir, { recursive: true, force: true });
      return { status: 'empty', timestamp: ts };
    }

    return { status: 'created', timestamp: ts, fileCount: copied, linkedCount: linked, snapshotDir: snapDir };
  } catch (e) {
    return { status: 'error', error: e.message };
  }
}

module.exports = { createGitSnapshot, createShadowCopy, formatTimestamp, removeSecretsFromIndex };
