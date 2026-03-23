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

const REF_GUARD_AUTO_BACKUP = 'refs/guard/auto-backup';
const REF_GUARD_SNAPSHOT = 'refs/guard/snapshot';

/**
 * Parent commit for the next Guard Git snapshot (first parent of `commit-tree`).
 *
 * For **refs/guard/auto-backup** and **refs/guard/snapshot** only: pick whichever tip is
 * **newer in commit time** between the two refs. That matches the human reading: "changes
 * since the **last** Guard backup, automatic or manual" — one shared baseline for +/- and file counts.
 *
 * For any **other** `branchRef` (e.g. tests using refs/guard/test-*): chain that ref only.
 */
function resolveGuardParentHash(cwd, branchRef) {
  if (branchRef !== REF_GUARD_AUTO_BACKUP && branchRef !== REF_GUARD_SNAPSHOT) {
    return git(['rev-parse', '--verify', branchRef], { cwd, allowFail: true });
  }
  const autoH = git(['rev-parse', '--verify', REF_GUARD_AUTO_BACKUP], { cwd, allowFail: true });
  const snapH = git(['rev-parse', '--verify', REF_GUARD_SNAPSHOT], { cwd, allowFail: true });
  if (!autoH && !snapH) return null;
  if (!autoH) return snapH;
  if (!snapH) return autoH;
  const commitUnix = h => {
    const s = git(['log', '-1', '--format=%ct', h], { cwd, allowFail: true });
    return s ? parseInt(String(s).trim(), 10) : 0;
  };
  const tAuto = commitUnix(autoH);
  const tSnap = commitUnix(snapH);
  return tSnap > tAuto ? snapH : autoH;
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

/** Single-line trailer value (no CR/LF; capped length). */
function trailerScalar(val, maxLen = 500) {
  if (val == null) return '';
  return String(val)
    .replace(/\r\n/g, ' ')
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function buildCommitMessage(ts, opts) {
  if (opts.message && !opts.context) return opts.message;

  const ctx = opts.context || {};
  const countTag = ctx.changedFileCount ? ` (${ctx.changedFileCount} files)` : '';
  const subject = opts.message || `guard: auto-backup ${ts}${countTag}`;

  const trailers = [];
  if (ctx.changedFileCount != null) trailers.push(`Files-Changed: ${ctx.changedFileCount}`);
  if (ctx.summary) trailers.push(`Summary: ${trailerScalar(ctx.summary, 2000)}`);
  if (ctx.trigger) trailers.push(`Trigger: ${trailerScalar(ctx.trigger)}`);
  if (ctx.intent) trailers.push(`Intent: ${trailerScalar(ctx.intent)}`);
  if (ctx.agent) trailers.push(`Agent: ${trailerScalar(ctx.agent)}`);
  if (ctx.session) trailers.push(`Session: ${trailerScalar(ctx.session)}`);
  if (ctx.guardEvent) trailers.push(`Guard-Event: ${trailerScalar(ctx.guardEvent)}`);

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
 * @param {string} [opts.context.guardEvent] - Short MCP/audit event id (written as Guard-Event trailer)
 * @param {boolean} [opts.allowEmptyTree] - If true, still create a commit when the snapshot tree equals the previous ref (empty / bookmark commit). Auto-backup should omit this; explicit manual snapshots should set it.
 * @param {boolean} [opts.fullWorkspaceSnapshot] - If true, ignore `cfg.protect` when building the snapshot tree (still apply `ignore` / secrets). Use for IDE/MCP "snapshot everything" so edits outside protect patterns are not invisible to the snapshot.
 * @returns {{ status: 'created'|'skipped'|'error', commitHash?: string, shortHash?: string, fileCount?: number, reason?: string, error?: string, secretsExcluded?: string[], bookmark?: boolean }}
 * @remarks For refs/guard/auto-backup and refs/guard/snapshot, the first parent is always the
 * newer of those two tips (by commit time), so incremental stats mean "since last Guard backup" in the human sense.
 */
function createGitSnapshot(projectDir, cfg, opts = {}) {
  const branchRef = opts.branchRef || 'refs/guard/auto-backup';
  const cwd = projectDir;
  const gDir = getGitDir(projectDir);
  if (!gDir) return { status: 'error', error: 'not a git repository' };

  const narrowProtect = cfg.protect.length > 0 && !opts.fullWorkspaceSnapshot;

  const guardIndex = path.join(gDir, 'cursor-guard-index');
  const guardIndexLock = guardIndex + '.lock';
  const env = { ...process.env, GIT_INDEX_FILE: guardIndex };

  try { fs.unlinkSync(guardIndex); } catch { /* doesn't exist */ }
  try { fs.unlinkSync(guardIndexLock); } catch { /* doesn't exist */ }

  try {
    const parentHash = resolveGuardParentHash(cwd, branchRef);

    if (narrowProtect) {
      // protect uses strict matching (full path only, no basename fallback)
      // so *.js only matches root-level js files, not nested ones
      execFileSync('git', ['add', '-A'], { cwd, env, stdio: 'pipe' });
      pruneIndexFiles(cwd, env, f => !matchesAny(cfg.protect, f, { strict: true }));
    } else {
      if (parentHash) {
        execFileSync('git', ['read-tree', parentHash], { cwd, env, stdio: 'pipe' });
      }
      execFileSync('git', ['add', '-A'], { cwd, env, stdio: 'pipe' });
    }

    // Keep ignore semantics aligned with filterFiles()/matchesAny(), including
    // basename-only patterns like "settings.json" for nested files.
    pruneIndexFiles(cwd, env, f => matchesAny(cfg.ignore, f));

    const secretsExcluded = removeSecretsFromIndex(cfg.secrets_patterns, cwd, env);

    const newTree = execFileSync('git', ['write-tree'], { cwd, env, stdio: 'pipe', encoding: 'utf-8' }).trim();
    const parentTree = parentHash
      ? git(['rev-parse', `${parentHash}^{tree}`], { cwd, allowFail: true })
      : null;

    if (newTree === parentTree && !opts.allowEmptyTree) {
      return { status: 'skipped', reason: 'tree unchanged' };
    }

    /** Manual snapshot (allowEmptyTree): same tree as parent → still create a Git commit so intent/time appear on the timeline. */
    const isBookmarkCommit = !!(opts.allowEmptyTree && parentTree && newTree === parentTree);

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
          if (narrowProtect && !matchesAny(cfg.protect, fileName, { strict: true })) continue;
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
      const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf899d15f3b60ea6a';
      const lsInitial = git(['ls-tree', '--name-only', '-r', newTree], { cwd, allowFail: true });
      if (lsInitial) {
        const files = lsInitial.split('\n').filter(Boolean)
          .filter(f => !matchesAny(cfg.ignore, f) && !matchesAny(cfg.ignore, path.basename(f)))
          .filter(f => !narrowProtect || matchesAny(cfg.protect, f, { strict: true }));
        changedCount = files.length;
        const sample = files.slice(0, 5).join(', ');

        const numstatInit = git(['diff-tree', '--no-commit-id', '--numstat', '-r', EMPTY_TREE, newTree], { cwd, allowFail: true });
        const stats = {};
        if (numstatInit) {
          for (const line of numstatInit.split('\n').filter(Boolean)) {
            const [add, del, ...nameParts] = line.split('\t');
            const fname = nameParts.join('\t');
            stats[fname] = { added: add === '-' ? 0 : parseInt(add, 10), deleted: del === '-' ? 0 : parseInt(del, 10) };
          }
        }

        changedFiles = files.map(f => {
          const s = stats[f] || { added: 0, deleted: 0 };
          return { path: f, action: 'added', added: s.added, deleted: s.deleted };
        });

        function fmtFilesInit(arr) {
          return arr.slice(0, 5).map(f => {
            const s = stats[f];
            return s ? `${f} (+${s.added} -${s.deleted})` : f;
          }).join(', ');
        }
        incrementalSummary = `Added ${files.length}: ${fmtFilesInit(files)}${files.length > 5 ? ', ...' : ''}`;
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

    if (isBookmarkCommit && opts.context) {
      const s = opts.context.summary;
      if (s == null || String(s).trim() === '') {
        opts.context.summary = 'No file changes since last Guard baseline (bookmark).';
      }
      if (opts.context.changedFileCount == null) opts.context.changedFileCount = 0;
    }

    const ts = formatTimestamp(new Date());
    let msg = buildCommitMessage(ts, opts);

    const autoTip = git(['rev-parse', '--verify', REF_GUARD_AUTO_BACKUP], { cwd, allowFail: true });
    const snapTip = git(['rev-parse', '--verify', REF_GUARD_SNAPSHOT], { cwd, allowFail: true });
    const autoTipTrim = autoTip ? String(autoTip).trim() : '';
    const snapTipTrim = snapTip ? String(snapTip).trim() : '';
    let diffBaseLabel = 'initial';
    if (parentHash) {
      if (parentHash === autoTipTrim) diffBaseLabel = 'auto-backup';
      else if (parentHash === snapTipTrim) diffBaseLabel = 'snapshot';
      else diffBaseLabel = 'other';
    }
    const scopeTrailer = narrowProtect ? 'narrow' : 'full';
    const guardBlock = `Guard-Diff-Base: ${diffBaseLabel}\nGuard-Scope: ${scopeTrailer}${isBookmarkCommit ? '\nGuard-Bookmark: true' : ''}`;
    msg = msg.includes('\n\n') ? `${msg}\n${guardBlock}` : `${msg}\n\n${guardBlock}`;

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
      ...(isBookmarkCommit ? { bookmark: true } : {}),
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

module.exports = { createGitSnapshot, createShadowCopy, formatTimestamp, removeSecretsFromIndex, trailerScalar };
