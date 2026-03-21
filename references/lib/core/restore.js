'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  git, isGitRepo, gitDir: getGitDir, loadConfig,
} = require('../utils');
const { createGitSnapshot, formatTimestamp, removeSecretsFromIndex } = require('./snapshot');

// ── Path safety ─────────────────────────────────────────────────

function validateRelativePath(file) {
  const normalized = path.normalize(file).replace(/\\/g, '/');
  if (path.isAbsolute(normalized) || normalized.startsWith('..')) {
    return { valid: false, error: 'file path must be relative and within project directory' };
  }
  return { valid: true, normalized };
}

const VALID_SHADOW_SOURCE = /^\d{8}_\d{6}$|^pre-restore-\d{8}_\d{6}$/;

function validateShadowSource(source) {
  if (!VALID_SHADOW_SOURCE.test(source)) {
    return { valid: false };
  }
  return { valid: true };
}

/**
 * Determine whether to create a pre-restore snapshot.
 * Priority: explicit opts.preserveCurrent > config pre_restore_backup > default true.
 */
function resolvePreserve(projectDir, opts) {
  if (typeof opts.preserveCurrent === 'boolean') return opts.preserveCurrent;
  const { cfg } = loadConfig(projectDir);
  if (cfg.pre_restore_backup === 'never') return false;
  return true;
}

// ── Restore file ────────────────────────────────────────────────

/**
 * Restore a single file from a backup source.
 *
 * @param {string} projectDir
 * @param {string} file - Relative path to the file
 * @param {string} source - Commit hash, ref name, or shadow timestamp
 * @param {object} [opts]
 * @param {boolean} [opts.preserveCurrent=true] - Snapshot current state before restoring
 * @returns {{ status: 'restored'|'error', preRestoreRef?: string, preRestoreShortHash?: string, restoredFrom: string, sourceType?: 'git'|'shadow', error?: string }}
 */
function restoreFile(projectDir, file, source, opts = {}) {
  const pathCheck = validateRelativePath(file);
  if (!pathCheck.valid) {
    return { status: 'error', restoredFrom: source, error: pathCheck.error };
  }

  const preserveCurrent = resolvePreserve(projectDir, opts);
  const repo = isGitRepo(projectDir);
  const result = { restoredFrom: source };

  // Determine source type — shadow source must be a valid timestamp directory name
  const shadowCheck = validateShadowSource(source);
  const shadowDir = shadowCheck.valid
    ? path.join(projectDir, '.cursor-guard-backup', source, pathCheck.normalized)
    : null;
  const isShadowSource = shadowDir && fs.existsSync(shadowDir);

  if (!isShadowSource && !repo) {
    return { status: 'error', restoredFrom: source, error: 'not a git repo and source is not a shadow copy timestamp' };
  }

  // Pre-restore snapshot (git path)
  if (preserveCurrent && repo) {
    const preRestoreResult = createPreRestoreSnapshot(projectDir, file);
    if (preRestoreResult.status === 'created') {
      result.preRestoreRef = preRestoreResult.ref;
      result.preRestoreShortHash = preRestoreResult.shortHash;
    } else if (preRestoreResult.status === 'error') {
      return { status: 'error', restoredFrom: source, error: `pre-restore snapshot failed: ${preRestoreResult.error}` };
    }
    // 'skipped' (no changes) is fine, proceed
  }

  // Pre-restore shadow copy (non-git path)
  if (preserveCurrent && !repo) {
    const targetFile = path.join(projectDir, file);
    if (fs.existsSync(targetFile)) {
      try {
        const ts = formatTimestamp(new Date());
        const preRestoreDir = path.join(projectDir, '.cursor-guard-backup', `pre-restore-${ts}`);
        fs.mkdirSync(path.join(preRestoreDir, path.dirname(file)), { recursive: true });
        fs.copyFileSync(targetFile, path.join(preRestoreDir, file));
        result.preRestoreShadow = `pre-restore-${ts}`;
      } catch (e) {
        return { status: 'error', restoredFrom: source, error: `pre-restore shadow copy failed: ${e.message}` };
      }
    }
  }

  // Restore from shadow copy
  if (isShadowSource) {
    try {
      const dest = path.join(projectDir, file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(shadowDir, dest);
      result.status = 'restored';
      result.sourceType = 'shadow';
      return result;
    } catch (e) {
      return { status: 'error', restoredFrom: source, error: e.message };
    }
  }

  // Restore from git
  try {
    // Verify the source ref/hash is valid
    const resolved = git(['rev-parse', '--verify', source], { cwd: projectDir, allowFail: true });
    if (!resolved) {
      return { status: 'error', restoredFrom: source, error: `cannot resolve git source: ${source}` };
    }

    // Check that the file exists in the source
    const fileExists = git(['cat-file', '-e', `${resolved}:${file}`], { cwd: projectDir, allowFail: true });
    if (fileExists === null) {
      // cat-file -e returns empty on success with allowFail, null on error
      // Try ls-tree instead
      const lsOut = git(['ls-tree', resolved, '--', file], { cwd: projectDir, allowFail: true });
      if (!lsOut) {
        return { status: 'error', restoredFrom: source, error: `file '${file}' not found in source ${source}` };
      }
    }

    execFileSync('git', ['restore', `--source=${resolved}`, '--', file], {
      cwd: projectDir, stdio: 'pipe',
    });

    result.status = 'restored';
    result.sourceType = 'git';
    return result;
  } catch (e) {
    return { status: 'error', restoredFrom: source, error: e.message };
  }
}

// ── Restore project (preview only for V3.0) ─────────────────────

/**
 * Preview which files would be affected by a full project restore.
 *
 * @param {string} projectDir
 * @param {string} source - Commit hash or ref
 * @returns {{ status: 'ok'|'error', files?: Array<{path: string, change: 'modified'|'added'|'deleted'}>, totalChanged?: number, error?: string }}
 */
function previewProjectRestore(projectDir, source) {
  if (!isGitRepo(projectDir)) {
    return { status: 'error', error: 'not a git repository' };
  }

  try {
    const resolved = git(['rev-parse', '--verify', source], { cwd: projectDir, allowFail: true });
    if (!resolved) {
      return { status: 'error', error: `cannot resolve git source: ${source}` };
    }

    const diffOutput = git(
      ['diff', '--name-status', resolved],
      { cwd: projectDir, allowFail: true }
    );

    if (!diffOutput) {
      return { status: 'ok', files: [], totalChanged: 0 };
    }

    const files = [];
    for (const line of diffOutput.split('\n').filter(Boolean)) {
      const tab = line.indexOf('\t');
      const code = line.substring(0, tab).trim();
      const filePath = line.substring(tab + 1).trim();
      let change = 'modified';
      if (code === 'A') change = 'added';
      else if (code === 'D') change = 'deleted';
      files.push({ path: filePath, change });
    }

    return { status: 'ok', files, totalChanged: files.length };
  } catch (e) {
    return { status: 'error', error: e.message };
  }
}

// ── Execute project restore ─────────────────────────────────────

/**
 * Execute a full project restore to a given source commit.
 * Creates a pre-restore snapshot first (unless opted out), then
 * restores all changed files.
 *
 * @param {string} projectDir
 * @param {string} source - Commit hash or ref
 * @param {object} [opts]
 * @param {boolean} [opts.preserveCurrent=true]
 * @returns {{ status: 'restored'|'error', preRestoreRef?: string, preRestoreShortHash?: string, filesRestored: number, files?: Array<{path: string, change: string}>, error?: string }}
 */
function executeProjectRestore(projectDir, source, opts = {}) {
  const preserveCurrent = resolvePreserve(projectDir, opts);

  if (!isGitRepo(projectDir)) {
    return { status: 'error', filesRestored: 0, error: 'not a git repository' };
  }

  const resolved = git(['rev-parse', '--verify', source], { cwd: projectDir, allowFail: true });
  if (!resolved) {
    return { status: 'error', filesRestored: 0, error: `cannot resolve git source: ${source}` };
  }

  const preview = previewProjectRestore(projectDir, source);
  if (preview.status === 'error') {
    return { status: 'error', filesRestored: 0, error: preview.error };
  }
  if (preview.totalChanged === 0) {
    return { status: 'restored', filesRestored: 0, files: [], preRestoreRef: null };
  }

  const result = { filesRestored: 0, files: preview.files };

  if (preserveCurrent) {
    const snap = createPreRestoreSnapshot(projectDir, null);
    if (snap.status === 'created') {
      result.preRestoreRef = snap.ref;
      result.preRestoreShortHash = snap.shortHash;
    } else if (snap.status === 'error') {
      return { status: 'error', filesRestored: 0, error: `pre-restore snapshot failed: ${snap.error}` };
    }
  }

  try {
    execFileSync('git', ['restore', `--source=${resolved}`, '--', '.'], {
      cwd: projectDir, stdio: 'pipe',
    });
    result.status = 'restored';
    result.filesRestored = preview.totalChanged;
    return result;
  } catch (e) {
    return { status: 'error', filesRestored: 0, error: e.message };
  }
}

// ── Pre-restore snapshot helper ─────────────────────────────────

/**
 * Create a pre-restore snapshot on refs/guard/pre-restore/<timestamp>.
 * Uses temp index so the user's staging area is never touched.
 *
 * @param {string} projectDir
 * @param {string} [scope] - Specific file to check for changes, or null for all
 * @returns {{ status: 'created'|'skipped'|'error', ref?: string, shortHash?: string, error?: string }}
 */
function createPreRestoreSnapshot(projectDir, scope) {
  const gDir = getGitDir(projectDir);
  if (!gDir) return { status: 'error', error: 'not a git repository' };

  const ts = formatTimestamp(new Date());
  const ref = `refs/guard/pre-restore/${ts}`;
  const guardIdx = path.join(gDir, 'guard-pre-restore-index');
  const env = { ...process.env, GIT_INDEX_FILE: guardIdx };
  const cwd = projectDir;

  try { fs.unlinkSync(guardIdx); } catch { /* doesn't exist */ }

  try {
    const head = git(['rev-parse', 'HEAD'], { cwd, allowFail: true });
    if (!head) return { status: 'skipped', reason: 'no HEAD commit' };

    execFileSync('git', ['read-tree', 'HEAD'], { cwd, env, stdio: 'pipe' });
    execFileSync('git', ['add', '-A'], { cwd, env, stdio: 'pipe' });

    const { cfg } = loadConfig(projectDir);
    removeSecretsFromIndex(cfg.secrets_patterns, cwd, env);

    const tree = execFileSync('git', ['write-tree'], { cwd, env, stdio: 'pipe', encoding: 'utf-8' }).trim();
    const headTree = git(['rev-parse', 'HEAD^{tree}'], { cwd, allowFail: true });

    if (tree === headTree) {
      return { status: 'skipped', reason: 'no changes to preserve' };
    }

    const commitHash = execFileSync('git', [
      'commit-tree', tree, '-p', head, '-m', `guard: pre-restore snapshot ${ts}`,
    ], { cwd, stdio: 'pipe', encoding: 'utf-8' }).trim();

    if (!commitHash) return { status: 'error', error: 'commit-tree returned empty' };

    git(['update-ref', ref, commitHash], { cwd });

    return { status: 'created', ref, shortHash: commitHash.substring(0, 7) };
  } catch (e) {
    return { status: 'error', error: e.message };
  } finally {
    try { fs.unlinkSync(guardIdx); } catch { /* ignore */ }
  }
}

module.exports = { restoreFile, previewProjectRestore, executeProjectRestore, createPreRestoreSnapshot, validateRelativePath, validateShadowSource };
