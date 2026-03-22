'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  git, isGitRepo, gitDir: getGitDir, loadConfig, unquoteGitPath,
} = require('../utils');
const { createGitSnapshot, formatTimestamp, removeSecretsFromIndex } = require('./snapshot');

// ── Path safety ─────────────────────────────────────────────────

function validateRelativePath(file) {
  if (!file || typeof file !== 'string') {
    return { valid: false, error: 'file path is required' };
  }
  const normalized = path.normalize(file).replace(/\\/g, '/');
  if (path.isAbsolute(normalized) || normalized.startsWith('..')) {
    return { valid: false, error: 'file path must be relative and within project directory' };
  }
  if (normalized === '.' || normalized === '') {
    return { valid: false, error: 'file path must target a specific file, not the project root' };
  }
  return { valid: true, normalized };
}

const VALID_SHADOW_SOURCE = /^\d{8}_\d{6}(_\d{3})?$|^pre-restore-\d{8}_\d{6}(_\d{3})?$/;

const TOOL_DIRS = ['.cursor/', '.cursor\\'];
const GUARD_CONFIGS = ['.cursor-guard.json', '.gitignore'];

function isToolPath(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  if (TOOL_DIRS.some(d => normalized.startsWith(d) || normalized === d.replace(/\/$/, ''))) return true;
  if (GUARD_CONFIGS.includes(normalized)) return true;
  return false;
}

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

  if (isToolPath(pathCheck.normalized)) {
    return { status: 'error', restoredFrom: source, error: `refusing to restore protected path '${pathCheck.normalized}' — use restore_project instead` };
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
    const preRestoreResult = createPreRestoreSnapshot(projectDir, file, { source, file: pathCheck.normalized });
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
        const preNow = new Date();
        const preBaseTs = formatTimestamp(preNow);
        let preTs = preBaseTs;
        let preRestoreDir = path.join(projectDir, '.cursor-guard-backup', `pre-restore-${preTs}`);
        if (fs.existsSync(preRestoreDir)) {
          let seq = preNow.getMilliseconds();
          for (let i = 0; i < 1000 && fs.existsSync(preRestoreDir); i++, seq++) {
            preTs = `${preBaseTs}_${String(seq % 1000).padStart(3, '0')}`;
            preRestoreDir = path.join(projectDir, '.cursor-guard-backup', `pre-restore-${preTs}`);
          }
        }
        fs.mkdirSync(path.join(preRestoreDir, path.dirname(file)), { recursive: true });
        fs.copyFileSync(targetFile, path.join(preRestoreDir, file));
        result.preRestoreShadow = `pre-restore-${preTs}`;
      } catch (e) {
        return { status: 'error', restoredFrom: source, error: `pre-restore shadow copy failed: ${e.message}` };
      }
    }
  }

  // Restore from shadow copy
  if (isShadowSource) {
    try {
      const stat = fs.statSync(shadowDir);
      if (stat.isDirectory()) {
        return { status: 'error', restoredFrom: source, error: `'${file}' is a directory, not a file — use restore_project for directory-level restores` };
      }
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
    const resolved = git(['rev-parse', '--verify', source], { cwd: projectDir, allowFail: true });
    if (!resolved) {
      return { status: 'error', restoredFrom: source, error: `cannot resolve git source: ${source}` };
    }

    // Verify the target is a blob (file), not a tree (directory)
    const objType = git(['cat-file', '-t', `${resolved}:${pathCheck.normalized}`], { cwd: projectDir, allowFail: true });
    if (!objType) {
      return { status: 'error', restoredFrom: source, error: `'${file}' not found in source ${source}` };
    }
    if (objType !== 'blob') {
      return { status: 'error', restoredFrom: source, error: `'${file}' is a ${objType} (directory), not a file — use restore_project for directory-level restores` };
    }

    execFileSync('git', ['restore', `--source=${resolved}`, '--', pathCheck.normalized], {
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
 * @returns {{ status: 'ok'|'error', files?: Array<{path: string, change: string}>, protectedPaths?: {count: number, note?: string}, totalChanged?: number, error?: string }}
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

    const files = [];

    const diffOutput = git(
      ['diff', '--name-status', resolved],
      { cwd: projectDir, allowFail: true }
    );

    if (diffOutput) {
      for (const line of diffOutput.split('\n').filter(Boolean)) {
        const parts = line.split('\t');
        const code = parts[0].trim();
        if (code.startsWith('R') || code.startsWith('C')) {
          const oldPath = unquoteGitPath(parts[1] || '');
          const newPath = unquoteGitPath(parts[2] || '');
          files.push({ path: newPath, oldPath, change: code.startsWith('R') ? 'renamed' : 'copied' });
        } else {
          const filePath = unquoteGitPath(parts[1] || '');
          let change = 'modified';
          if (code === 'A') change = 'added';
          else if (code === 'D') change = 'deleted';
          files.push({ path: filePath, change });
        }
      }
    }

    const untrackedOutput = git(
      ['ls-files', '--others', '--exclude-standard'],
      { cwd: projectDir, allowFail: true }
    );
    if (untrackedOutput) {
      for (const f of untrackedOutput.split('\n').filter(Boolean)) {
        files.push({ path: unquoteGitPath(f), change: 'untracked' });
      }
    }

    const protectedFiles = [];
    const projectFiles = [];
    for (const f of files) {
      if (isToolPath(f.path)) {
        protectedFiles.push(f);
      } else {
        projectFiles.push(f);
      }
    }

    return {
      status: 'ok',
      files: projectFiles,
      protectedPaths: {
        count: protectedFiles.length,
        note: protectedFiles.length > 0
          ? 'these paths (.cursor/, .cursor-guard.json, .gitignore) will be preserved from HEAD'
          : undefined,
      },
      totalChanged: files.length,
    };
  } catch (e) {
    return { status: 'error', error: e.message };
  }
}

// ── Execute project restore ─────────────────────────────────────

/**
 * Execute a full project restore to a given source commit.
 * Creates a pre-restore snapshot first (unless opted out), then
 * restores all tracked files and optionally removes untracked files.
 *
 * @param {string} projectDir
 * @param {string} source - Commit hash or ref
 * @param {object} [opts]
 * @param {boolean} [opts.preserveCurrent=true]
 * @param {boolean} [opts.cleanUntracked=true] - Remove untracked non-ignored files after restore
 * @returns {{ status: 'restored'|'error', preRestoreRef?: string, preRestoreShortHash?: string, filesRestored: number, untrackedCleaned?: number, files?: Array<{path: string, change: string}>, error?: string }}
 */
function executeProjectRestore(projectDir, source, opts = {}) {
  const preserveCurrent = resolvePreserve(projectDir, opts);
  const cleanUntracked = opts.cleanUntracked !== false;

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
  const trackedFiles = preview.files.filter(f => f.change !== 'untracked');
  const effectiveFiles = cleanUntracked ? preview.files : trackedFiles;

  if (effectiveFiles.length === 0) {
    return { status: 'restored', filesRestored: 0, files: [], preRestoreRef: null };
  }

  const result = { filesRestored: 0, files: effectiveFiles };

  if (preserveCurrent) {
    const snap = createPreRestoreSnapshot(projectDir, null, { source });
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

    // Restore protected paths: keep HEAD state, don't let old snapshots resurrect deleted files
    const head = git(['rev-parse', 'HEAD'], { cwd: projectDir, allowFail: true });
    if (head) {
      const protectedPatterns = ['.cursor/', ...GUARD_CONFIGS];
      for (const p of protectedPatterns) {
        const existsInHead = git(['ls-tree', '--name-only', head, '--', p], { cwd: projectDir, allowFail: true });
        if (existsInHead) {
          try {
            execFileSync('git', ['restore', `--source=HEAD`, '--', p], {
              cwd: projectDir, stdio: 'pipe',
            });
          } catch { /* restore failed, keep whatever is there */ }
        } else {
          // HEAD intentionally doesn't have this path — remove if old snapshot resurrected it
          const fullPath = path.join(projectDir, p);
          try {
            if (p.endsWith('/')) {
              fs.rmSync(fullPath, { recursive: true, force: true });
            } else {
              fs.unlinkSync(fullPath);
            }
          } catch { /* already gone */ }
        }
      }
    }

    let untrackedCleaned = 0;
    if (cleanUntracked) {
      const untrackedOutput = git(
        ['ls-files', '--others', '--exclude-standard'],
        { cwd: projectDir, allowFail: true }
      );
      if (untrackedOutput) {
        for (const raw of untrackedOutput.split('\n').filter(Boolean)) {
          const f = unquoteGitPath(raw);
          if (isToolPath(f)) continue;
          try {
            fs.unlinkSync(path.join(projectDir, f));
            untrackedCleaned++;
          } catch { /* skip files that can't be removed */ }
        }
      }
    }

    result.status = 'restored';
    result.filesRestored = trackedFiles.filter(f => !isToolPath(f.path)).length;
    result.untrackedCleaned = untrackedCleaned;
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
 * @param {object} [opts]
 * @param {string} [opts.source] - Target restore source (commit hash or ref)
 * @param {string} [opts.file] - File being restored (single-file restore only)
 * @returns {{ status: 'created'|'skipped'|'error', ref?: string, shortHash?: string, error?: string }}
 */
function createPreRestoreSnapshot(projectDir, scope, opts = {}) {
  const gDir = getGitDir(projectDir);
  if (!gDir) return { status: 'error', error: 'not a git repository' };

  const now = new Date();
  const baseTs = formatTimestamp(now);
  let seq = now.getMilliseconds();
  let ts, ref;
  for (let i = 0; i < 1000; i++, seq++) {
    ts = `${baseTs}_${String(seq % 1000).padStart(3, '0')}`;
    ref = `refs/guard/pre-restore/${ts}`;
    if (!git(['rev-parse', '--verify', ref], { cwd: projectDir, allowFail: true })) break;
  }
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

    let msg = `guard: pre-restore snapshot ${ts}`;
    msg += '\n\nTrigger: pre-restore';
    msg += `\nFrom: ${head.substring(0, 7)}`;
    if (opts.source) {
      const targetShort = git(['rev-parse', '--short', opts.source], { cwd, allowFail: true }) || opts.source;
      msg += `\nRestore-To: ${targetShort}`;
    }
    if (opts.file) msg += `\nFile: ${opts.file}`;
    const commitHash = execFileSync('git', [
      'commit-tree', tree, '-p', head, '-m', msg,
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
