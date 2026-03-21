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
 * @returns {{ status: 'created'|'skipped'|'error', commitHash?: string, shortHash?: string, fileCount?: number, reason?: string, error?: string, secretsExcluded?: string[] }}
 */
function createGitSnapshot(projectDir, cfg, opts = {}) {
  const branchRef = opts.branchRef || 'refs/guard/auto-backup';
  const cwd = projectDir;
  const gDir = getGitDir(projectDir);
  if (!gDir) return { status: 'error', error: 'not a git repository' };

  const guardIndex = path.join(gDir, 'cursor-guard-index');
  const env = { ...process.env, GIT_INDEX_FILE: guardIndex };

  try { fs.unlinkSync(guardIndex); } catch { /* doesn't exist */ }

  try {
    const parentHash = git(['rev-parse', '--verify', branchRef], { cwd, allowFail: true });

    if (cfg.protect.length > 0) {
      // Add everything then prune — 'git add -- <pattern>' treats bare names as
      // root-relative pathspecs, but matchesAny() also checks basenames (e.g.
      // "settings.json" matches "src/settings.json").  Pruning via matchesAny
      // keeps the semantics consistent with filterFiles().
      execFileSync('git', ['add', '-A'], { cwd, env, stdio: 'pipe' });
      pruneIndexFiles(cwd, env, f => !matchesAny(cfg.protect, f));
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

    const ts = formatTimestamp(new Date());
    const msg = opts.message || `guard: auto-backup ${ts}`;
    const commitArgs = parentHash
      ? ['commit-tree', newTree, '-p', parentHash, '-m', msg]
      : ['commit-tree', newTree, '-m', msg];
    const commitHash = execFileSync('git', commitArgs, { cwd, stdio: 'pipe', encoding: 'utf-8' }).trim();

    if (!commitHash) {
      return { status: 'error', error: 'commit-tree returned empty hash' };
    }

    git(['update-ref', branchRef, commitHash], { cwd });

    let fileCount = 0;
    if (parentTree) {
      const diff = git(['diff-tree', '--no-commit-id', '--name-only', '-r', parentTree, newTree], { cwd, allowFail: true });
      fileCount = diff ? diff.split('\n').filter(Boolean).length : 0;
    } else {
      const all = git(['ls-tree', '--name-only', '-r', newTree], { cwd, allowFail: true });
      fileCount = all ? all.split('\n').filter(Boolean).length : 0;
    }

    return {
      status: 'created',
      commitHash,
      shortHash: commitHash.substring(0, 7),
      fileCount,
      secretsExcluded: secretsExcluded.length > 0 ? secretsExcluded : undefined,
    };
  } catch (e) {
    return { status: 'error', error: e.message };
  } finally {
    try { fs.unlinkSync(guardIndex); } catch { /* ignore */ }
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

    if (copied === 0) {
      fs.rmSync(snapDir, { recursive: true, force: true });
      return { status: 'empty', timestamp: ts };
    }

    return { status: 'created', timestamp: ts, fileCount: copied, snapshotDir: snapDir };
  } catch (e) {
    return { status: 'error', error: e.message };
  }
}

module.exports = { createGitSnapshot, createShadowCopy, formatTimestamp, removeSecretsFromIndex };
