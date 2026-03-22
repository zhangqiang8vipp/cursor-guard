'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

const { runDiagnostics } = require('./doctor');
const { createGitSnapshot, createShadowCopy } = require('./snapshot');
const { listBackups, cleanShadowRetention } = require('./backups');
const { restoreFile, previewProjectRestore, executeProjectRestore, createPreRestoreSnapshot, validateShadowSource } = require('./restore');
const { runFixes } = require('./doctor-fix');
const { getBackupStatus } = require('./status');
const { createChangeTracker, recordChange, checkAnomaly, getAlertStatus, saveAlert, loadActiveAlert, clearExpiredAlert, clearAlert, alertFilePath } = require('./anomaly');
const { getDashboard, dirSizeBytes, formatBytes, relativeTime } = require('./dashboard');
const { assessDeletionRisk, recordPreWarning, loadActivePreWarnings, listPreWarningHistory, clearPreWarning } = require('./pre-warning');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (e) {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`    ${e.message}`);
  }
}

function createTempGitRepo() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-core-test-'));
  execFileSync('git', ['init'], { cwd: tmpDir, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tmpDir, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tmpDir, stdio: 'pipe' });
  fs.writeFileSync(path.join(tmpDir, 'hello.txt'), 'hello world');
  fs.mkdirSync(path.join(tmpDir, 'src'));
  fs.writeFileSync(path.join(tmpDir, 'src', 'app.js'), 'console.log("app");');
  execFileSync('git', ['add', '-A'], { cwd: tmpDir, stdio: 'pipe' });
  execFileSync('git', ['commit', '-m', 'initial', '--no-verify'], { cwd: tmpDir, stdio: 'pipe' });
  return tmpDir;
}

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'guard-core-test-'));
}

function cleanupDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── core/doctor.js ──────────────────────────────────────────────

console.log('\ncore/doctor:');

test('returns structured result with checks and summary', () => {
  const tmpDir = createTempGitRepo();
  try {
    const result = runDiagnostics(tmpDir);
    assert.ok(Array.isArray(result.checks), 'checks should be an array');
    assert.ok(result.checks.length > 0, 'should have at least one check');
    assert.ok(typeof result.summary === 'object', 'summary should be an object');
    assert.ok(typeof result.summary.pass === 'number');
    assert.ok(typeof result.summary.warn === 'number');
    assert.ok(typeof result.summary.fail === 'number');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('each check has name, status, and optional detail', () => {
  const tmpDir = createTempGitRepo();
  try {
    const { checks } = runDiagnostics(tmpDir);
    for (const c of checks) {
      assert.ok(typeof c.name === 'string', `check name should be string, got ${typeof c.name}`);
      assert.ok(['PASS', 'WARN', 'FAIL'].includes(c.status), `invalid status: ${c.status}`);
    }
  } finally {
    cleanupDir(tmpDir);
  }
});

test('detects git repo correctly', () => {
  const tmpDir = createTempGitRepo();
  try {
    const { checks } = runDiagnostics(tmpDir);
    const repoCheck = checks.find(c => c.name === 'Git repository');
    assert.ok(repoCheck, 'should have Git repository check');
    assert.strictEqual(repoCheck.status, 'PASS');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('warns for non-git directory', () => {
  const tmpDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'test');
    const { checks } = runDiagnostics(tmpDir);
    const repoCheck = checks.find(c => c.name === 'Git repository');
    if (repoCheck) {
      assert.strictEqual(repoCheck.status, 'WARN');
    }
  } finally {
    cleanupDir(tmpDir);
  }
});

test('summary counts match check statuses', () => {
  const tmpDir = createTempGitRepo();
  try {
    const { checks, summary } = runDiagnostics(tmpDir);
    let pass = 0, warn = 0, fail = 0;
    for (const c of checks) {
      if (c.status === 'PASS') pass++;
      else if (c.status === 'WARN') warn++;
      else if (c.status === 'FAIL') fail++;
    }
    assert.strictEqual(summary.pass, pass);
    assert.strictEqual(summary.warn, warn);
    assert.strictEqual(summary.fail, fail);
  } finally {
    cleanupDir(tmpDir);
  }
});

test('includes MCP server status check', () => {
  const tmpDir = createTempGitRepo();
  try {
    const { checks } = runDiagnostics(tmpDir);
    const mcpCheck = checks.find(c => c.name === 'MCP server');
    assert.ok(mcpCheck, 'should have MCP server check');
    assert.ok(['PASS', 'WARN'].includes(mcpCheck.status), `status should be PASS or WARN, got ${mcpCheck.status}`);
    assert.ok(mcpCheck.detail, 'should have detail');
  } finally {
    cleanupDir(tmpDir);
  }
});

// ── core/snapshot.js ────────────────────────────────────────────

console.log('\ncore/snapshot (git):');

test('creates git snapshot and returns structured result', () => {
  const tmpDir = createTempGitRepo();
  try {
    const { loadConfig } = require('../utils');
    const { cfg } = loadConfig(tmpDir);
    const result = createGitSnapshot(tmpDir, cfg);
    assert.strictEqual(result.status, 'created');
    assert.ok(result.commitHash, 'should have commitHash');
    assert.ok(result.shortHash, 'should have shortHash');
    assert.strictEqual(result.shortHash.length, 7);
    assert.ok(typeof result.fileCount === 'number');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('skips when tree is unchanged', () => {
  const tmpDir = createTempGitRepo();
  try {
    const { loadConfig } = require('../utils');
    const { cfg } = loadConfig(tmpDir);
    createGitSnapshot(tmpDir, cfg);
    const result2 = createGitSnapshot(tmpDir, cfg);
    assert.strictEqual(result2.status, 'skipped');
    assert.strictEqual(result2.reason, 'tree unchanged');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('returns error for non-git directory', () => {
  const tmpDir = createTempDir();
  try {
    const { loadConfig } = require('../utils');
    const { cfg } = loadConfig(tmpDir);
    const result = createGitSnapshot(tmpDir, cfg);
    assert.strictEqual(result.status, 'error');
    assert.ok(result.error);
  } finally {
    cleanupDir(tmpDir);
  }
});

console.log('\ncore/snapshot (shadow):');

test('creates shadow copy and returns structured result', () => {
  const tmpDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tmpDir, 'file.js'), 'content');
    const { loadConfig } = require('../utils');
    const { cfg } = loadConfig(tmpDir);
    const result = createShadowCopy(tmpDir, cfg);
    assert.strictEqual(result.status, 'created');
    assert.ok(result.timestamp);
    assert.ok(result.fileCount > 0);
    assert.ok(result.snapshotDir);
    assert.ok(fs.existsSync(result.snapshotDir));
  } finally {
    cleanupDir(tmpDir);
  }
});

// ── core/backups.js ─────────────────────────────────────────────

console.log('\ncore/backups:');

test('listBackups returns structured result with sources array', () => {
  const tmpDir = createTempGitRepo();
  try {
    const result = listBackups(tmpDir);
    assert.ok(Array.isArray(result.sources), 'sources should be an array');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('listBackups finds git auto-backup after snapshot', () => {
  const tmpDir = createTempGitRepo();
  try {
    const { loadConfig } = require('../utils');
    const { cfg } = loadConfig(tmpDir);
    createGitSnapshot(tmpDir, cfg);
    const result = listBackups(tmpDir);
    const autoBackups = result.sources.filter(s => s.type === 'git-auto-backup');
    assert.ok(autoBackups.length > 0, 'should find auto-backup after snapshot');
    assert.ok(autoBackups[0].commitHash);
    assert.ok(autoBackups[0].shortHash);
  } finally {
    cleanupDir(tmpDir);
  }
});

test('listBackups finds shadow copies', () => {
  const tmpDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tmpDir, 'file.js'), 'content');
    const { loadConfig } = require('../utils');
    const { cfg } = loadConfig(tmpDir);
    createShadowCopy(tmpDir, cfg);
    const result = listBackups(tmpDir);
    const shadows = result.sources.filter(s => s.type === 'shadow');
    assert.ok(shadows.length > 0, 'should find shadow copy');
    assert.ok(shadows[0].timestamp);
    assert.ok(shadows[0].path);
  } finally {
    cleanupDir(tmpDir);
  }
});

test('listBackups returns globally time-sorted results across sources', () => {
  const tmpDir = createTempGitRepo();
  try {
    const { loadConfig } = require('../utils');
    const { cfg } = loadConfig(tmpDir);
    createGitSnapshot(tmpDir, cfg);

    // Create a shadow copy (non-git timestamp dir)
    const backupDir = path.join(tmpDir, '.cursor-guard-backup');
    fs.mkdirSync(backupDir, { recursive: true });
    const futureTs = '29990101_000000';
    const futureDir = path.join(backupDir, futureTs);
    fs.mkdirSync(futureDir);
    fs.writeFileSync(path.join(futureDir, 'hello.txt'), 'x');

    const result = listBackups(tmpDir);
    assert.ok(result.sources.length >= 2, 'should have both git and shadow sources');

    // Verify sorted descending by time
    for (let i = 1; i < result.sources.length; i++) {
      const cur = result.sources[i].timestamp;
      const prev = result.sources[i - 1].timestamp;
      if (cur && prev) {
        assert.ok(Date.parse(prev) >= Date.parse(cur) || prev >= cur,
          `sources[${i - 1}] (${prev}) should be >= sources[${i}] (${cur})`);
      }
    }
  } finally {
    cleanupDir(tmpDir);
  }
});

test('listBackups before filter applies to snapshot ref', () => {
  const tmpDir = createTempGitRepo();
  try {
    const { loadConfig } = require('../utils');
    const { cfg } = loadConfig(tmpDir);
    createGitSnapshot(tmpDir, cfg, { branchRef: 'refs/guard/snapshot', message: 'guard: manual snapshot' });

    const result = listBackups(tmpDir, { before: '2020-01-01T00:00:00Z' });
    const snaps = result.sources.filter(s => s.type === 'git-snapshot');
    assert.strictEqual(snaps.length, 0, 'snapshot ref should be filtered out by before=2020');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('listBackups filters out non-guard commits from auto-backup ref', () => {
  const tmpDir = createTempGitRepo();
  try {
    // Manually seed refs/guard/auto-backup from HEAD (simulating old behavior)
    execFileSync('git', ['update-ref', 'refs/guard/auto-backup',
      execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' }).trim()
    ], { cwd: tmpDir, stdio: 'pipe' });

    const result = listBackups(tmpDir);
    const autoBackups = result.sources.filter(s => s.type === 'git-auto-backup');
    assert.strictEqual(autoBackups.length, 0, 'should NOT list user commits as auto-backups');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('createGitSnapshot creates orphan commit when ref does not exist', () => {
  const tmpDir = createTempGitRepo();
  try {
    const { loadConfig } = require('../utils');
    const { cfg } = loadConfig(tmpDir);
    const ref = 'refs/guard/test-orphan';

    const snap = createGitSnapshot(tmpDir, cfg, { branchRef: ref });
    assert.strictEqual(snap.status, 'created');
    assert.ok(snap.commitHash);

    const parents = execFileSync('git', ['rev-parse', `${ref}^`], {
      cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8',
    }).trim();
    assert.fail('orphan commit should have no parent, but rev-parse succeeded');
  } catch (e) {
    if (e.code === 'ERR_ASSERTION') throw e;
    // Expected: git rev-parse fails because orphan has no parent
  } finally {
    cleanupDir(tmpDir);
  }
});

test('createGitSnapshot drops files when protect scope narrows', () => {
  const tmpDir = createTempGitRepo();
  try {
    const { loadConfig } = require('../utils');
    fs.mkdirSync(path.join(tmpDir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'docs', 'readme.md'), 'docs');

    const wideCfg = { ...loadConfig(tmpDir).cfg, protect: ['src/**', 'docs/**'] };
    const snap1 = createGitSnapshot(tmpDir, wideCfg);
    assert.strictEqual(snap1.status, 'created');

    const tree1Files = execFileSync('git', ['ls-tree', '--name-only', '-r', snap1.commitHash], {
      cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8',
    }).trim().split('\n');
    assert.ok(tree1Files.includes('docs/readme.md'), 'wide protect should include docs/readme.md');

    const narrowCfg = { ...loadConfig(tmpDir).cfg, protect: ['src/**'] };
    const snap2 = createGitSnapshot(tmpDir, narrowCfg);
    assert.strictEqual(snap2.status, 'created');

    const tree2Files = execFileSync('git', ['ls-tree', '--name-only', '-r', snap2.commitHash], {
      cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8',
    }).trim().split('\n');
    assert.ok(!tree2Files.includes('docs/readme.md'), 'narrow protect must NOT include docs/readme.md');
    assert.ok(tree2Files.includes('src/app.js'), 'narrow protect should still include src/app.js');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('createGitSnapshot with basename-only protect does not match nested files in strict mode', () => {
  const tmpDir = createTempGitRepo();
  try {
    const { loadConfig } = require('../utils');
    const cfg = { ...loadConfig(tmpDir).cfg, protect: ['app.js'] };
    const result = createGitSnapshot(tmpDir, cfg);
    assert.strictEqual(result.status, 'created');

    const treeFiles = execFileSync('git', ['ls-tree', '--name-only', '-r', result.commitHash], {
      cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8',
    }).trim().split('\n');
    assert.ok(!treeFiles.includes('src/app.js'), 'basename-only protect should NOT match nested src/app.js');
    assert.ok(!treeFiles.includes('hello.txt'), 'unprotected files should be excluded');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('createGitSnapshot with basename-only ignore excludes nested files', () => {
  const tmpDir = createTempGitRepo();
  try {
    const { loadConfig } = require('../utils');
    const cfg = { ...loadConfig(tmpDir).cfg, ignore: ['app.js'] };
    const result = createGitSnapshot(tmpDir, cfg);
    assert.strictEqual(result.status, 'created');

    const treeFiles = execFileSync('git', ['ls-tree', '--name-only', '-r', result.commitHash], {
      cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8',
    }).trim().split('\n');
    assert.ok(!treeFiles.includes('src/app.js'), 'basename ignore should exclude nested src/app.js');
    assert.ok(treeFiles.includes('hello.txt'), 'non-ignored files should remain');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('createShadowCopy avoids collision within same second', () => {
  const tmpDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'content');
    const { loadConfig } = require('../utils');
    const { cfg } = loadConfig(tmpDir);

    const r1 = createShadowCopy(tmpDir, cfg);
    assert.strictEqual(r1.status, 'created');

    const r2 = createShadowCopy(tmpDir, cfg);
    assert.strictEqual(r2.status, 'created');

    assert.notStrictEqual(r1.timestamp, r2.timestamp, 'timestamps should differ');
    assert.ok(fs.existsSync(r1.snapshotDir), 'first snapshot should still exist');
    assert.ok(fs.existsSync(r2.snapshotDir), 'second snapshot should exist');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('createShadowCopy retries beyond single ms fallback', () => {
  const tmpDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'content');
    const { loadConfig } = require('../utils');
    const { cfg } = loadConfig(tmpDir);

    const r1 = createShadowCopy(tmpDir, cfg);
    assert.strictEqual(r1.status, 'created');
    const r2 = createShadowCopy(tmpDir, cfg);
    assert.strictEqual(r2.status, 'created');
    const r3 = createShadowCopy(tmpDir, cfg);
    assert.strictEqual(r3.status, 'created');

    const allTs = [r1.timestamp, r2.timestamp, r3.timestamp];
    const unique = new Set(allTs);
    assert.strictEqual(unique.size, 3, `all 3 timestamps must be unique, got: ${allTs.join(', ')}`);
  } finally {
    cleanupDir(tmpDir);
  }
});

test('cleanShadowRetention respects count mode', () => {
  const tmpDir = createTempDir();
  const backupDir = path.join(tmpDir, '.cursor-guard-backup');
  fs.mkdirSync(backupDir, { recursive: true });
  try {
    // Create 5 fake snapshot dirs
    for (let i = 0; i < 5; i++) {
      const name = `20260301_10000${i}`;
      const dir = path.join(backupDir, name);
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'f.txt'), 'x');
    }
    const cfg = {
      retention: { mode: 'count', max_count: 2, days: 30, max_size_mb: 500 },
    };
    const result = cleanShadowRetention(backupDir, cfg);
    assert.strictEqual(result.removed, 3);
    assert.strictEqual(result.mode, 'count');
    // Should have 2 dirs left
    const remaining = fs.readdirSync(backupDir).filter(d => /^\d{8}_\d{6}$/.test(d));
    assert.strictEqual(remaining.length, 2);
  } finally {
    cleanupDir(tmpDir);
  }
});

// ── core/restore.js ─────────────────────────────────────────────

console.log('\ncore/restore:');

test('restoreFile restores from git source with pre-restore snapshot', () => {
  const tmpDir = createTempGitRepo();
  try {
    const headHash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' }).trim();

    // Modify file and leave it uncommitted (realistic scenario: user has unsaved work)
    fs.writeFileSync(path.join(tmpDir, 'hello.txt'), 'uncommitted changes');

    const result = restoreFile(tmpDir, 'hello.txt', headHash, { preserveCurrent: true });
    assert.strictEqual(result.status, 'restored');
    assert.strictEqual(result.sourceType, 'git');
    assert.ok(result.preRestoreRef, 'should have pre-restore ref when uncommitted changes exist');

    const content = fs.readFileSync(path.join(tmpDir, 'hello.txt'), 'utf-8');
    assert.strictEqual(content, 'hello world');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('restoreFile skips pre-restore when working tree is clean', () => {
  const tmpDir = createTempGitRepo();
  try {
    const headHash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' }).trim();

    fs.writeFileSync(path.join(tmpDir, 'hello.txt'), 'modified');
    execFileSync('git', ['add', '-A'], { cwd: tmpDir, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'modify', '--no-verify'], { cwd: tmpDir, stdio: 'pipe' });

    const result = restoreFile(tmpDir, 'hello.txt', headHash, { preserveCurrent: true });
    assert.strictEqual(result.status, 'restored');
    assert.strictEqual(result.sourceType, 'git');
    assert.ok(!result.preRestoreRef, 'no pre-restore ref when tree is clean (HEAD is the restore point)');

    const content = fs.readFileSync(path.join(tmpDir, 'hello.txt'), 'utf-8');
    assert.strictEqual(content, 'hello world');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('restoreFile restores from shadow copy', () => {
  const tmpDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tmpDir, 'data.txt'), 'original');
    const { loadConfig } = require('../utils');
    const { cfg } = loadConfig(tmpDir);
    const snap = createShadowCopy(tmpDir, cfg);

    // Modify file
    fs.writeFileSync(path.join(tmpDir, 'data.txt'), 'changed');

    const result = restoreFile(tmpDir, 'data.txt', snap.timestamp, { preserveCurrent: false });
    assert.strictEqual(result.status, 'restored');
    assert.strictEqual(result.sourceType, 'shadow');

    const content = fs.readFileSync(path.join(tmpDir, 'data.txt'), 'utf-8');
    assert.strictEqual(content, 'original');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('restoreFile creates shadow pre-restore for non-git project', () => {
  const tmpDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tmpDir, 'data.txt'), 'original');
    const { loadConfig } = require('../utils');
    const { cfg } = loadConfig(tmpDir);
    const snap = createShadowCopy(tmpDir, cfg);

    fs.writeFileSync(path.join(tmpDir, 'data.txt'), 'modified-later');

    const result = restoreFile(tmpDir, 'data.txt', snap.timestamp, { preserveCurrent: true });
    assert.strictEqual(result.status, 'restored');
    assert.ok(result.preRestoreShadow, 'should have preRestoreShadow for non-git project');
    assert.ok(result.preRestoreShadow.startsWith('pre-restore-'), 'shadow dir should start with pre-restore-');

    const preRestoreDir = path.join(tmpDir, '.cursor-guard-backup', result.preRestoreShadow);
    assert.ok(fs.existsSync(path.join(preRestoreDir, 'data.txt')), 'pre-restore should contain the file');
    const preserved = fs.readFileSync(path.join(preRestoreDir, 'data.txt'), 'utf-8');
    assert.strictEqual(preserved, 'modified-later', 'pre-restore should preserve the current version');

    const restored = fs.readFileSync(path.join(tmpDir, 'data.txt'), 'utf-8');
    assert.strictEqual(restored, 'original', 'file should be restored to original');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('restoreFile returns error for invalid source', () => {
  const tmpDir = createTempGitRepo();
  try {
    const result = restoreFile(tmpDir, 'hello.txt', 'nonexistent-ref-abc123', { preserveCurrent: false });
    assert.strictEqual(result.status, 'error');
    assert.ok(result.error);
  } finally {
    cleanupDir(tmpDir);
  }
});

test('restoreFile rejects path-traversal shadow source', () => {
  const tmpDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tmpDir, 'data.txt'), 'original');
    const { loadConfig } = require('../utils');
    const { cfg } = loadConfig(tmpDir);
    createShadowCopy(tmpDir, cfg);

    const result = restoreFile(tmpDir, 'data.txt', '../../etc', { preserveCurrent: false });
    assert.strictEqual(result.status, 'error', 'path-traversal source should be rejected');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('validateShadowSource accepts valid timestamps and rejects traversals', () => {
  assert.strictEqual(validateShadowSource('20260321_143205').valid, true);
  assert.strictEqual(validateShadowSource('20260321_143205_042').valid, true);
  assert.strictEqual(validateShadowSource('pre-restore-20260321_143205').valid, true);
  assert.strictEqual(validateShadowSource('pre-restore-20260321_143205_999').valid, true);
  assert.strictEqual(validateShadowSource('../../etc').valid, false);
  assert.strictEqual(validateShadowSource('..\\..\\Windows').valid, false);
  assert.strictEqual(validateShadowSource('some-arbitrary-name').valid, false);
});

test('restoreFile respects pre_restore_backup=never from config', () => {
  const tmpDir = createTempGitRepo();
  try {
    fs.writeFileSync(path.join(tmpDir, '.cursor-guard.json'),
      JSON.stringify({ pre_restore_backup: 'never', backup_strategy: 'git' }));
    const headHash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' }).trim();

    fs.writeFileSync(path.join(tmpDir, 'hello.txt'), 'uncommitted changes');

    const result = restoreFile(tmpDir, 'hello.txt', headHash);
    assert.strictEqual(result.status, 'restored');
    assert.ok(!result.preRestoreRef, 'should NOT create pre-restore when config says never');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('restoreFile rejects directory pathspec (git tree)', () => {
  const tmpDir = createTempGitRepo();
  try {
    const headHash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' }).trim();
    const result = restoreFile(tmpDir, 'src', headHash, { preserveCurrent: false });
    assert.strictEqual(result.status, 'error');
    assert.ok(result.error.includes('tree') || result.error.includes('directory'), `expected tree/directory error, got: ${result.error}`);
  } finally {
    cleanupDir(tmpDir);
  }
});

test('restoreFile rejects protected .cursor directory', () => {
  const tmpDir = createTempGitRepo();
  try {
    fs.mkdirSync(path.join(tmpDir, '.cursor'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.cursor', 'mcp.json'), '{}');
    execFileSync('git', ['add', '-A'], { cwd: tmpDir, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'add .cursor'], { cwd: tmpDir, stdio: 'pipe' });
    const headHash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' }).trim();
    const result = restoreFile(tmpDir, '.cursor', headHash, { preserveCurrent: false });
    assert.strictEqual(result.status, 'error');
    assert.ok(result.error.includes('protected'), `expected protected path error, got: ${result.error}`);
  } finally {
    cleanupDir(tmpDir);
  }
});

test('restoreFile rejects project root "."', () => {
  const tmpDir = createTempGitRepo();
  try {
    const headHash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' }).trim();
    const result = restoreFile(tmpDir, '.', headHash, { preserveCurrent: false });
    assert.strictEqual(result.status, 'error');
    assert.ok(result.error.includes('project root') || result.error.includes('specific file'), `expected root rejection, got: ${result.error}`);
  } finally {
    cleanupDir(tmpDir);
  }
});

test('createPreRestoreSnapshot creates ref under refs/guard/pre-restore/', () => {
  const tmpDir = createTempGitRepo();
  try {
    // Make a change so snapshot is not skipped
    fs.writeFileSync(path.join(tmpDir, 'hello.txt'), 'changed');
    const result = createPreRestoreSnapshot(tmpDir);
    assert.strictEqual(result.status, 'created');
    assert.ok(result.ref.startsWith('refs/guard/pre-restore/'));
    assert.ok(result.shortHash);
  } finally {
    cleanupDir(tmpDir);
  }
});

test('createPreRestoreSnapshot avoids same-ms ref collision', () => {
  const tmpDir = createTempGitRepo();
  try {
    fs.writeFileSync(path.join(tmpDir, 'hello.txt'), 'v1');
    const r1 = createPreRestoreSnapshot(tmpDir);
    assert.strictEqual(r1.status, 'created');

    fs.writeFileSync(path.join(tmpDir, 'hello.txt'), 'v2');
    const r2 = createPreRestoreSnapshot(tmpDir);
    assert.strictEqual(r2.status, 'created');

    fs.writeFileSync(path.join(tmpDir, 'hello.txt'), 'v3');
    const r3 = createPreRestoreSnapshot(tmpDir);
    assert.strictEqual(r3.status, 'created');

    const refs = [r1.ref, r2.ref, r3.ref];
    const unique = new Set(refs);
    assert.strictEqual(unique.size, 3, `all 3 pre-restore refs must be unique, got: ${refs.join(', ')}`);
  } finally {
    cleanupDir(tmpDir);
  }
});

test('createPreRestoreSnapshot excludes secrets from snapshot', () => {
  const tmpDir = createTempGitRepo();
  try {
    fs.writeFileSync(path.join(tmpDir, '.env'), 'SECRET_KEY=abc123');
    fs.writeFileSync(path.join(tmpDir, 'hello.txt'), 'changed');

    const result = createPreRestoreSnapshot(tmpDir);
    assert.strictEqual(result.status, 'created');

    const filesInSnapshot = execFileSync('git', ['ls-tree', '--name-only', '-r', result.ref], {
      cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8',
    }).trim().split('\n');
    assert.ok(!filesInSnapshot.includes('.env'), '.env should be excluded from pre-restore snapshot');
    assert.ok(filesInSnapshot.includes('hello.txt'), 'non-secret files should be included');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('createPreRestoreSnapshot skips when no changes', () => {
  const tmpDir = createTempGitRepo();
  try {
    const result = createPreRestoreSnapshot(tmpDir);
    assert.strictEqual(result.status, 'skipped');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('previewProjectRestore returns file list', () => {
  const tmpDir = createTempGitRepo();
  try {
    const headHash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' }).trim();

    fs.writeFileSync(path.join(tmpDir, 'hello.txt'), 'changed');
    fs.writeFileSync(path.join(tmpDir, 'new.txt'), 'new file');
    execFileSync('git', ['add', '-A'], { cwd: tmpDir, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'changes', '--no-verify'], { cwd: tmpDir, stdio: 'pipe' });

    const result = previewProjectRestore(tmpDir, headHash);
    assert.strictEqual(result.status, 'ok');
    assert.ok(Array.isArray(result.files));
    assert.ok(result.totalChanged > 0);
    const filePaths = result.files.map(f => f.path);
    assert.ok(filePaths.includes('hello.txt'));
  } finally {
    cleanupDir(tmpDir);
  }
});

test('previewProjectRestore handles rename entries', () => {
  const tmpDir = createTempGitRepo();
  try {
    const headHash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' }).trim();

    execFileSync('git', ['mv', 'hello.txt', 'greeting.txt'], { cwd: tmpDir, stdio: 'pipe' });
    execFileSync('git', ['add', '-A'], { cwd: tmpDir, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'rename', '--no-verify'], { cwd: tmpDir, stdio: 'pipe' });

    const result = previewProjectRestore(tmpDir, headHash);
    assert.strictEqual(result.status, 'ok');

    const renamed = result.files.filter(f => f.change === 'renamed');
    if (renamed.length > 0) {
      assert.ok(renamed[0].path, 'renamed entry should have path');
      assert.ok(renamed[0].oldPath, 'renamed entry should have oldPath');
      assert.ok(!renamed[0].path.includes('\t'), 'path must not contain raw tab');
    } else {
      const added = result.files.filter(f => f.change === 'added');
      const deleted = result.files.filter(f => f.change === 'deleted');
      assert.ok(added.length > 0 || deleted.length > 0, 'should show changes even if rename detection is off');
    }
  } finally {
    cleanupDir(tmpDir);
  }
});

// ── core/restore (executeProjectRestore) ─────────────────────────

console.log('\ncore/restore (executeProjectRestore):');

test('executeProjectRestore restores all changed files with uncommitted changes', () => {
  const tmpDir = createTempGitRepo();
  try {
    const headHash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' }).trim();

    fs.writeFileSync(path.join(tmpDir, 'hello.txt'), 'changed-v2');
    fs.writeFileSync(path.join(tmpDir, 'extra.txt'), 'extra');
    execFileSync('git', ['add', '-A'], { cwd: tmpDir, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'v2 changes', '--no-verify'], { cwd: tmpDir, stdio: 'pipe' });

    // Add uncommitted change so pre-restore snapshot is created
    fs.writeFileSync(path.join(tmpDir, 'hello.txt'), 'uncommitted');

    const result = executeProjectRestore(tmpDir, headHash, { preserveCurrent: true });
    assert.strictEqual(result.status, 'restored');
    assert.ok(result.filesRestored > 0, 'should restore at least 1 file');
    assert.ok(result.preRestoreRef, 'should have pre-restore ref');

    const restored = fs.readFileSync(path.join(tmpDir, 'hello.txt'), 'utf-8');
    assert.strictEqual(restored, 'hello world');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('executeProjectRestore restores with clean tree (pre-restore skipped)', () => {
  const tmpDir = createTempGitRepo();
  try {
    const headHash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' }).trim();

    fs.writeFileSync(path.join(tmpDir, 'hello.txt'), 'changed-v2');
    execFileSync('git', ['add', '-A'], { cwd: tmpDir, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'v2 changes', '--no-verify'], { cwd: tmpDir, stdio: 'pipe' });

    const result = executeProjectRestore(tmpDir, headHash, { preserveCurrent: true });
    assert.strictEqual(result.status, 'restored');
    assert.ok(result.filesRestored > 0, 'should restore at least 1 file');
    // pre-restore skipped because working tree is clean — HEAD itself is the restore point
  } finally {
    cleanupDir(tmpDir);
  }
});

test('executeProjectRestore detects dirty working tree against HEAD', () => {
  const tmpDir = createTempGitRepo();
  try {
    const headHash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' }).trim();
    fs.writeFileSync(path.join(tmpDir, 'hello.txt'), 'dirty content');

    const preview = previewProjectRestore(tmpDir, headHash);
    assert.ok(preview.totalChanged > 0, 'preview should detect dirty file vs HEAD');

    const result = executeProjectRestore(tmpDir, headHash, { preserveCurrent: false });
    assert.strictEqual(result.status, 'restored');
    assert.ok(result.filesRestored > 0, 'should restore dirty files');
    assert.strictEqual(fs.readFileSync(path.join(tmpDir, 'hello.txt'), 'utf-8'), 'hello world');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('executeProjectRestore returns 0 files when already at target', () => {
  const tmpDir = createTempGitRepo();
  try {
    const headHash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' }).trim();
    const result = executeProjectRestore(tmpDir, headHash, { preserveCurrent: false });
    assert.strictEqual(result.status, 'restored');
    assert.strictEqual(result.filesRestored, 0);
  } finally {
    cleanupDir(tmpDir);
  }
});

test('executeProjectRestore errors on invalid source', () => {
  const tmpDir = createTempGitRepo();
  try {
    const result = executeProjectRestore(tmpDir, 'nonexistent-ref');
    assert.strictEqual(result.status, 'error');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('previewProjectRestore includes untracked files', () => {
  const tmpDir = createTempGitRepo();
  try {
    const headHash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' }).trim();
    fs.writeFileSync(path.join(tmpDir, 'untracked.txt'), 'not added to git');

    const result = previewProjectRestore(tmpDir, headHash);
    assert.strictEqual(result.status, 'ok');
    const untracked = result.files.filter(f => f.change === 'untracked');
    assert.ok(untracked.length >= 1, 'should list untracked files');
    assert.ok(untracked.some(f => f.path === 'untracked.txt'), 'should include untracked.txt');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('executeProjectRestore cleans untracked files by default', () => {
  const tmpDir = createTempGitRepo();
  try {
    const headHash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' }).trim();
    fs.writeFileSync(path.join(tmpDir, 'hello.txt'), 'changed');
    execFileSync('git', ['add', '-A'], { cwd: tmpDir, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'change', '--no-verify'], { cwd: tmpDir, stdio: 'pipe' });

    fs.writeFileSync(path.join(tmpDir, 'leftover.txt'), 'untracked leftover');

    const result = executeProjectRestore(tmpDir, headHash, { preserveCurrent: false });
    assert.strictEqual(result.status, 'restored');
    assert.ok(result.untrackedCleaned >= 1, 'should clean untracked files');
    assert.ok(!fs.existsSync(path.join(tmpDir, 'leftover.txt')), 'untracked file should be removed');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('executeProjectRestore filesRestored excludes untracked cleanup count', () => {
  const tmpDir = createTempGitRepo();
  try {
    const headHash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' }).trim();
    fs.writeFileSync(path.join(tmpDir, 'hello.txt'), 'changed');
    execFileSync('git', ['add', '-A'], { cwd: tmpDir, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'change', '--no-verify'], { cwd: tmpDir, stdio: 'pipe' });

    fs.writeFileSync(path.join(tmpDir, 'untracked1.txt'), 'u1');
    fs.writeFileSync(path.join(tmpDir, 'untracked2.txt'), 'u2');

    const result = executeProjectRestore(tmpDir, headHash, { preserveCurrent: false });
    assert.strictEqual(result.status, 'restored');
    assert.ok(result.untrackedCleaned >= 2, 'should clean untracked files');
    assert.ok(result.filesRestored > 0, 'should have restored tracked files');
    assert.ok(result.filesRestored <= result.files.filter(f => f.change !== 'untracked').length,
      'filesRestored should not include untracked count');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('executeProjectRestore respects cleanUntracked=false', () => {
  const tmpDir = createTempGitRepo();
  try {
    const headHash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' }).trim();
    fs.writeFileSync(path.join(tmpDir, 'hello.txt'), 'changed');
    execFileSync('git', ['add', '-A'], { cwd: tmpDir, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'change', '--no-verify'], { cwd: tmpDir, stdio: 'pipe' });

    fs.writeFileSync(path.join(tmpDir, 'keep-me.txt'), 'should stay');

    const result = executeProjectRestore(tmpDir, headHash, { preserveCurrent: false, cleanUntracked: false });
    assert.strictEqual(result.status, 'restored');
    assert.strictEqual(result.untrackedCleaned, 0, 'should not clean when disabled');
    assert.ok(fs.existsSync(path.join(tmpDir, 'keep-me.txt')), 'untracked file should remain');
  } finally {
    cleanupDir(tmpDir);
  }
});

// ── core/doctor-fix ─────────────────────────────────────────────

console.log('\ncore/doctor-fix:');

test('runFixes dry-run reports actions without modifying', () => {
  const tmpDir = createTempDir();
  try {
    const result = runFixes(tmpDir, { dryRun: true });
    assert.ok(Array.isArray(result.actions));
    assert.strictEqual(result.totalFixed, 0, 'dry-run should not fix anything');
    const configAction = result.actions.find(a => a.name === 'Create config');
    assert.ok(configAction, 'should report config action');
    assert.strictEqual(configAction.status, 'skipped');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('runFixes creates config and inits git on empty dir', () => {
  const tmpDir = createTempDir();
  try {
    const result = runFixes(tmpDir, { dryRun: false });
    assert.ok(result.totalFixed > 0, 'should fix at least 1 issue');

    const configExists = fs.existsSync(path.join(tmpDir, '.cursor-guard.json'));
    assert.ok(configExists, 'should create .cursor-guard.json');

    const initAction = result.actions.find(a => a.name === 'Init Git repo');
    assert.ok(initAction, 'should have init git action');
    assert.strictEqual(initAction.status, 'fixed');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('runFixes init git excludes secrets via .gitignore', () => {
  const tmpDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tmpDir, 'app.js'), 'console.log("ok")');
    fs.writeFileSync(path.join(tmpDir, '.env'), 'SECRET=value');
    fs.writeFileSync(path.join(tmpDir, 'credentials.json'), '{}');

    const result = runFixes(tmpDir, { dryRun: false });
    const initAction = result.actions.find(a => a.name === 'Init Git repo');
    assert.strictEqual(initAction.status, 'fixed');

    const tracked = execFileSync('git', ['ls-files'], {
      cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8',
    }).trim().split('\n');
    assert.ok(!tracked.includes('.env'), '.env should not be tracked');
    assert.ok(!tracked.includes('credentials.json'), 'credentials.json should not be tracked');
    assert.ok(tracked.includes('app.js'), 'normal files should be tracked');

    const gitignore = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8');
    assert.ok(gitignore.includes('.env'), '.gitignore should contain .env pattern');
    assert.ok(gitignore.includes('.cursor-guard-backup/'), '.gitignore should contain backup dir');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('runFixes init git excludes secrets even with pre-existing .gitignore', () => {
  const tmpDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), 'dist/\n');
    fs.writeFileSync(path.join(tmpDir, 'app.js'), 'console.log("ok")');
    fs.writeFileSync(path.join(tmpDir, '.env'), 'SECRET=leak');

    const result = runFixes(tmpDir, { dryRun: false });
    const initAction = result.actions.find(a => a.name === 'Init Git repo');
    assert.strictEqual(initAction.status, 'fixed');

    const tracked = execFileSync('git', ['ls-files'], {
      cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8',
    }).trim().split('\n');
    assert.ok(!tracked.includes('.env'), '.env should not be tracked even when .gitignore pre-exists');
    assert.ok(tracked.includes('app.js'), 'normal files should be tracked');

    const gitignore = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8');
    assert.ok(gitignore.includes('dist/'), 'original entries should be preserved');
    assert.ok(gitignore.includes('.env'), 'secrets should be appended');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('runFixes is idempotent on already-configured repo', () => {
  const tmpDir = createTempGitRepo();
  try {
    fs.writeFileSync(path.join(tmpDir, '.cursor-guard.json'), '{"backup_strategy":"git"}');
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), '.cursor-guard-backup/\n');

    const result = runFixes(tmpDir, { dryRun: false });
    const fixed = result.actions.filter(a => a.status === 'fixed');
    assert.strictEqual(fixed.length, 0, `should fix nothing, but fixed: ${JSON.stringify(fixed)}`);
  } finally {
    cleanupDir(tmpDir);
  }
});

test('runFixes adds gitignore entry when missing', () => {
  const tmpDir = createTempGitRepo();
  try {
    fs.writeFileSync(path.join(tmpDir, '.cursor-guard.json'), '{"backup_strategy":"git"}');

    const result = runFixes(tmpDir, { dryRun: false });
    const gitignoreAction = result.actions.find(a => a.name === 'Gitignore backup dir');
    assert.ok(gitignoreAction);
    assert.strictEqual(gitignoreAction.status, 'fixed');

    const gitignore = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8');
    assert.ok(gitignore.includes('.cursor-guard-backup/'));
  } finally {
    cleanupDir(tmpDir);
  }
});

test('runFixes removes stale lock file', () => {
  const tmpDir = createTempGitRepo();
  try {
    const gDir = execFileSync('git', ['rev-parse', '--git-dir'], { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' }).trim();
    const lockPath = path.join(tmpDir, gDir, 'cursor-guard.lock');
    fs.writeFileSync(lockPath, 'pid: 99999999');
    fs.writeFileSync(path.join(tmpDir, '.cursor-guard.json'), '{"backup_strategy":"git"}');
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), '.cursor-guard-backup/\n');

    const result = runFixes(tmpDir, { dryRun: false });
    const lockAction = result.actions.find(a => a.name === 'Remove stale lock');
    assert.ok(lockAction, 'should have lock removal action');
    assert.strictEqual(lockAction.status, 'fixed');
    assert.ok(!fs.existsSync(lockPath), 'lock file should be removed');
  } finally {
    cleanupDir(tmpDir);
  }
});

// ── core/status ─────────────────────────────────────────────────

console.log('\ncore/status:');

test('getBackupStatus returns structured result for git repo', () => {
  const tmpDir = createTempGitRepo();
  try {
    const result = getBackupStatus(tmpDir);
    assert.ok(typeof result.watcher === 'object', 'should have watcher');
    assert.strictEqual(result.watcher.running, false);
    assert.ok(typeof result.config === 'object', 'should have config');
    assert.strictEqual(result.config.strategy, 'git');
    assert.ok(typeof result.lastBackup === 'object', 'should have lastBackup');
    assert.ok(typeof result.refs === 'object', 'should have refs');
    assert.ok(typeof result.disk === 'object', 'should have disk');
    assert.ok(result.disk.freeGB === null || typeof result.disk.freeGB === 'number');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('getBackupStatus detects running watcher via lock file', () => {
  const tmpDir = createTempGitRepo();
  try {
    const gDir = execFileSync('git', ['rev-parse', '--git-dir'], { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' }).trim();
    const lockPath = path.join(tmpDir, gDir, 'cursor-guard.lock');
    // Use current PID to simulate running process
    fs.writeFileSync(lockPath, `pid=${process.pid}\nstarted=2026-03-21T12:00:00Z`);

    const result = getBackupStatus(tmpDir);
    assert.strictEqual(result.watcher.running, true);
    assert.strictEqual(result.watcher.pid, process.pid);
    assert.strictEqual(result.watcher.startedAt, '2026-03-21T12:00:00Z');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('getBackupStatus detects stale lock file', () => {
  const tmpDir = createTempGitRepo();
  try {
    const gDir = execFileSync('git', ['rev-parse', '--git-dir'], { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' }).trim();
    const lockPath = path.join(tmpDir, gDir, 'cursor-guard.lock');
    fs.writeFileSync(lockPath, 'pid=99999999\nstarted=2026-03-21T12:00:00Z');

    const result = getBackupStatus(tmpDir);
    assert.strictEqual(result.watcher.running, false);
    assert.strictEqual(result.watcher.stale, true);
  } finally {
    cleanupDir(tmpDir);
  }
});

test('getBackupStatus finds last git backup after snapshot', () => {
  const tmpDir = createTempGitRepo();
  try {
    const cfg = { protect: [], ignore: [], secrets_patterns: [], backup_strategy: 'git' };
    createGitSnapshot(tmpDir, cfg, { branchRef: 'refs/guard/auto-backup' });

    const result = getBackupStatus(tmpDir);
    assert.ok(result.lastBackup.git, 'should have git lastBackup');
    assert.ok(result.lastBackup.git.shortHash, 'should have shortHash');
    assert.ok(result.refs.autoBackup, 'should have autoBackup ref info');
    assert.ok(result.refs.autoBackup.commitCount > 0);
  } finally {
    cleanupDir(tmpDir);
  }
});

test('getBackupStatus finds last shadow backup', () => {
  const tmpDir = createTempGitRepo();
  try {
    const cfg = { protect: [], ignore: [], secrets_patterns: [], backup_strategy: 'shadow' };
    createShadowCopy(tmpDir, cfg);

    const result = getBackupStatus(tmpDir);
    assert.ok(result.lastBackup.shadow, 'should have shadow lastBackup');
    assert.ok(result.lastBackup.shadow.timestamp, 'should have timestamp');
    assert.ok(result.lastBackup.shadow.fileCount > 0, 'should have files');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('getBackupStatus works for non-git directory', () => {
  const tmpDir = createTempDir();
  try {
    const result = getBackupStatus(tmpDir);
    assert.strictEqual(result.watcher.running, false);
    assert.ok(typeof result.config === 'object');
    assert.ok(typeof result.refs === 'object');
    assert.strictEqual(result.refs.preRestoreCount, 0);
  } finally {
    cleanupDir(tmpDir);
  }
});

// ── core/anomaly.js ─────────────────────────────────────────────

console.log('\ncore/anomaly:');

test('createChangeTracker returns tracker with config', () => {
  const cfg = {
    proactive_alert: true,
    alert_thresholds: { files_per_window: 20, window_seconds: 10, cooldown_seconds: 60 },
  };
  const tracker = createChangeTracker(cfg);
  assert.ok(Array.isArray(tracker.events));
  assert.ok(Array.isArray(tracker.alerts));
  assert.strictEqual(tracker.config.enabled, true);
  assert.strictEqual(tracker.config.filesPerWindow, 20);
  assert.strictEqual(tracker.config.windowSeconds, 10);
});

test('createChangeTracker respects proactive_alert=false', () => {
  const cfg = {
    proactive_alert: false,
    alert_thresholds: { files_per_window: 20, window_seconds: 10, cooldown_seconds: 60 },
  };
  const tracker = createChangeTracker(cfg);
  assert.strictEqual(tracker.config.enabled, false);
});

test('recordChange adds events to tracker', () => {
  const cfg = {
    proactive_alert: true,
    alert_thresholds: { files_per_window: 20, window_seconds: 10, cooldown_seconds: 60 },
  };
  const tracker = createChangeTracker(cfg);
  recordChange(tracker, 5, ['a.js', 'b.js']);
  assert.strictEqual(tracker.events.length, 1);
  assert.strictEqual(tracker.events[0].fileCount, 5);
  recordChange(tracker, 3);
  assert.strictEqual(tracker.events.length, 2);
});

test('recordChange skips when disabled', () => {
  const cfg = {
    proactive_alert: false,
    alert_thresholds: { files_per_window: 20, window_seconds: 10, cooldown_seconds: 60 },
  };
  const tracker = createChangeTracker(cfg);
  recordChange(tracker, 5);
  assert.strictEqual(tracker.events.length, 0);
});

test('checkAnomaly detects high velocity', () => {
  const cfg = {
    proactive_alert: true,
    alert_thresholds: { files_per_window: 5, window_seconds: 60, cooldown_seconds: 1 },
  };
  const tracker = createChangeTracker(cfg);
  recordChange(tracker, 3);
  recordChange(tracker, 3);
  const result = checkAnomaly(tracker);
  assert.strictEqual(result.anomaly, true);
  assert.ok(result.alert);
  assert.strictEqual(result.alert.type, 'high_change_velocity');
  assert.strictEqual(result.alert.fileCount, 6);
});

test('checkAnomaly returns false when below threshold', () => {
  const cfg = {
    proactive_alert: true,
    alert_thresholds: { files_per_window: 20, window_seconds: 60, cooldown_seconds: 60 },
  };
  const tracker = createChangeTracker(cfg);
  recordChange(tracker, 3);
  const result = checkAnomaly(tracker);
  assert.strictEqual(result.anomaly, false);
});

test('checkAnomaly suppresses during cooldown', () => {
  const cfg = {
    proactive_alert: true,
    alert_thresholds: { files_per_window: 5, window_seconds: 60, cooldown_seconds: 600 },
  };
  const tracker = createChangeTracker(cfg);
  recordChange(tracker, 10);
  const first = checkAnomaly(tracker);
  assert.strictEqual(first.anomaly, true);
  assert.ok(!first.suppressed);
  recordChange(tracker, 10);
  const second = checkAnomaly(tracker);
  assert.strictEqual(second.anomaly, true);
  assert.strictEqual(second.suppressed, true);
});

test('getAlertStatus returns summary', () => {
  const cfg = {
    proactive_alert: true,
    alert_thresholds: { files_per_window: 5, window_seconds: 60, cooldown_seconds: 1 },
  };
  const tracker = createChangeTracker(cfg);
  recordChange(tracker, 10);
  checkAnomaly(tracker);
  const status = getAlertStatus(tracker);
  assert.strictEqual(status.enabled, true);
  assert.strictEqual(status.hasActiveAlert, true);
  assert.ok(status.latestAlert);
  assert.strictEqual(status.alertCount, 1);
});

test('getAlertStatus with disabled tracker', () => {
  const cfg = {
    proactive_alert: false,
    alert_thresholds: { files_per_window: 5, window_seconds: 60, cooldown_seconds: 60 },
  };
  const tracker = createChangeTracker(cfg);
  const status = getAlertStatus(tracker);
  assert.strictEqual(status.enabled, false);
  assert.strictEqual(status.hasActiveAlert, false);
});

test('saveAlert and loadActiveAlert round-trip', () => {
  const tmpDir = createTempGitRepo();
  try {
    const alert = {
      type: 'high_change_velocity',
      timestamp: new Date().toISOString(),
      fileCount: 25,
      windowSeconds: 10,
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    };
    saveAlert(tmpDir, alert);
    const loaded = loadActiveAlert(tmpDir);
    assert.ok(loaded);
    assert.strictEqual(loaded.type, 'high_change_velocity');
    assert.strictEqual(loaded.fileCount, 25);
  } finally {
    cleanupDir(tmpDir);
  }
});

test('loadActiveAlert returns null for expired alert without deleting file', () => {
  const tmpDir = createTempGitRepo();
  try {
    const alert = {
      type: 'high_change_velocity',
      timestamp: new Date(Date.now() - 600000).toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    };
    saveAlert(tmpDir, alert);
    const loaded = loadActiveAlert(tmpDir);
    assert.strictEqual(loaded, null);
    assert.ok(fs.existsSync(alertFilePath(tmpDir)), 'expired file should still exist (load is read-only)');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('clearAlert removes alert file', () => {
  const tmpDir = createTempGitRepo();
  try {
    const alert = {
      type: 'test',
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    };
    saveAlert(tmpDir, alert);
    assert.ok(loadActiveAlert(tmpDir));
    clearAlert(tmpDir);
    assert.strictEqual(loadActiveAlert(tmpDir), null);
  } finally {
    cleanupDir(tmpDir);
  }
});

test('clearExpiredAlert removes expired file but leaves active ones', () => {
  const tmpDir = createTempGitRepo();
  try {
    const expired = {
      type: 'high_change_velocity',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    };
    saveAlert(tmpDir, expired);
    assert.ok(fs.existsSync(alertFilePath(tmpDir)));
    const removed = clearExpiredAlert(tmpDir);
    assert.strictEqual(removed, true);
    assert.ok(!fs.existsSync(alertFilePath(tmpDir)));

    const active = {
      type: 'high_change_velocity',
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    };
    saveAlert(tmpDir, active);
    const removedActive = clearExpiredAlert(tmpDir);
    assert.strictEqual(removedActive, false);
    assert.ok(fs.existsSync(alertFilePath(tmpDir)));
  } finally {
    cleanupDir(tmpDir);
  }
});

// ── core/dashboard.js ───────────────────────────────────────────

console.log('\ncore/pre-warning:');

test('assessDeletionRisk flags removed methods', () => {
  const prevText = [
    'function keepMe() {',
    '  return true;',
    '}',
    '',
    'function removeMe() {',
    '  return false;',
    '}',
  ].join('\n');
  const nextText = [
    'function keepMe() {',
    '  return true;',
    '}',
  ].join('\n');

  const result = assessDeletionRisk(prevText, nextText, { threshold: 30 });
  assert.strictEqual(result.triggered, true);
  assert.strictEqual(result.removedMethodCount, 1);
  assert.ok(result.removedMethods.some(method => method.name === 'removeMe'));
  assert.ok(result.deletedLines >= 3);
  assert.ok(result.riskPercent >= 40);
});

test('recordPreWarning persists active warnings and history', () => {
  const tmpDir = createTempGitRepo();
  try {
    recordPreWarning(tmpDir, {
      file: 'src/app.js',
      riskPercent: 68,
      summary: '1 method removed, 5 lines deleted (risk 68%)',
      removedMethodCount: 1,
      removedMethods: [{ name: 'login', lineNumber: 12 }],
      deletedLines: 5,
    }, { setActive: true });

    const active = loadActivePreWarnings(tmpDir);
    const history = listPreWarningHistory(tmpDir, 5);
    assert.strictEqual(active.length, 1);
    assert.strictEqual(active[0].file, 'src/app.js');
    assert.ok(active[0].expiresAt, 'active warning should have expiry');
    assert.strictEqual(history.length, 1);

    clearPreWarning(tmpDir, 'src/app.js');
    assert.strictEqual(loadActivePreWarnings(tmpDir).length, 0);
  } finally {
    cleanupDir(tmpDir);
  }
});

test('getBackupStatus and getDashboard expose active pre-warning state', () => {
  const tmpDir = createTempGitRepo();
  try {
    recordPreWarning(tmpDir, {
      file: 'src/app.js',
      riskPercent: 72,
      summary: '1 method removed, 6 lines deleted (risk 72%)',
      removedMethodCount: 1,
      removedMethods: [{ name: 'login', lineNumber: 15 }],
      deletedLines: 6,
    }, { setActive: true });

    const status = getBackupStatus(tmpDir);
    const dashboard = getDashboard(tmpDir);

    assert.strictEqual(status.preWarnings.active, true);
    assert.strictEqual(status.preWarnings.count, 1);
    assert.strictEqual(status.preWarnings.latest.file, 'src/app.js');
    assert.strictEqual(dashboard.preWarnings.active, true);
    assert.strictEqual(dashboard.preWarnings.count, 1);
    assert.ok(dashboard.health.issues.some(issue => issue.includes('Pre-warning active')));
  } finally {
    cleanupDir(tmpDir);
  }
});

console.log('\ncore/dashboard:');

test('formatBytes formats correctly', () => {
  assert.strictEqual(formatBytes(500), '500B');
  assert.strictEqual(formatBytes(1536), '1.5KB');
  assert.strictEqual(formatBytes(1048576), '1.0MB');
  assert.strictEqual(formatBytes(1073741824), '1.0GB');
});

test('relativeTime returns human-readable time', () => {
  const now = new Date().toISOString();
  const result = relativeTime(now);
  assert.ok(result.endsWith('s ago') || result === 'just now');
  assert.strictEqual(relativeTime(null), null);
});

test('getDashboard returns structured result for git repo', () => {
  const tmpDir = createTempGitRepo();
  try {
    const cfg = { protect: [], ignore: [], secrets_patterns: [], backup_strategy: 'git' };
    createGitSnapshot(tmpDir, cfg, { branchRef: 'refs/guard/auto-backup' });

    const dash = getDashboard(tmpDir);
    assert.ok(typeof dash.strategy === 'string');
    assert.ok(typeof dash.counts === 'object');
    assert.ok(typeof dash.counts.git.commits === 'number');
    assert.ok(typeof dash.counts.shadow.snapshots === 'number');
    assert.ok(typeof dash.diskUsage === 'object');
    assert.ok(typeof dash.diskUsage.git.display === 'string');
    assert.ok(typeof dash.protectionScope === 'object');
    assert.ok(typeof dash.protectionScope.fileCount === 'number');
    assert.ok(typeof dash.health === 'object');
    assert.ok(['healthy', 'warning', 'critical'].includes(dash.health.status));
    assert.ok(Array.isArray(dash.health.issues));
    assert.ok(typeof dash.alerts === 'object');
    assert.ok(typeof dash.watcher === 'object');
    assert.ok(typeof dash.disk === 'object');
  } finally {
    cleanupDir(tmpDir);
  }
});

test('getDashboard works for non-git directory', () => {
  const tmpDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'hello');
    const dash = getDashboard(tmpDir);
    assert.ok(typeof dash.strategy === 'string');
    assert.ok(typeof dash.health === 'object');
    assert.ok(dash.protectionScope.fileCount >= 0);
  } finally {
    cleanupDir(tmpDir);
  }
});

test('getDashboard includes active alert in health issues', () => {
  const tmpDir = createTempGitRepo();
  try {
    const alert = {
      type: 'high_change_velocity',
      timestamp: new Date().toISOString(),
      fileCount: 30,
      windowSeconds: 10,
      expiresAt: new Date(Date.now() + 300000).toISOString(),
      recommendation: 'Check recent changes',
    };
    saveAlert(tmpDir, alert);

    const dash = getDashboard(tmpDir);
    assert.strictEqual(dash.alerts.active, true);
    assert.ok(dash.alerts.latest);
    assert.ok(dash.health.issues.some(i => i.includes('Active alert')));
  } finally {
    cleanupDir(tmpDir);
  }
});

test('getDashboard reports shadow copy count', () => {
  const tmpDir = createTempGitRepo();
  try {
    const cfg = { protect: [], ignore: [], secrets_patterns: [], backup_strategy: 'shadow' };
    createShadowCopy(tmpDir, cfg);
    createShadowCopy(tmpDir, cfg);

    const dash = getDashboard(tmpDir);
    assert.ok(dash.counts.shadow.snapshots >= 1);
  } finally {
    cleanupDir(tmpDir);
  }
});

test('dirSizeBytes returns size for directory', () => {
  const tmpDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'hello world');
    const size = dirSizeBytes(tmpDir);
    assert.ok(size > 0);
  } finally {
    cleanupDir(tmpDir);
  }
});

// ── Summary ─────────────────────────────────────────────────────

test('executeProjectRestore with only untracked files and cleanUntracked=false is a no-op', () => {
  const tmpDir = createTempGitRepo();
  try {
    const headHash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' }).trim();
    fs.writeFileSync(path.join(tmpDir, 'keep-me.txt'), 'should stay');

    const result = executeProjectRestore(tmpDir, headHash, { preserveCurrent: true, cleanUntracked: false });
    assert.strictEqual(result.status, 'restored');
    assert.strictEqual(result.filesRestored, 0);
    assert.strictEqual(result.files.length, 0, 'no files should be reported as restored');
    assert.strictEqual(result.preRestoreRef, null, 'no pre-restore snapshot should be created for a no-op');
    assert.ok(fs.existsSync(path.join(tmpDir, 'keep-me.txt')), 'untracked file should remain');

    const refs = execFileSync('git', ['for-each-ref', 'refs/guard/pre-restore/', '--format=%(refname)'], {
      cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8',
    }).trim();
    assert.strictEqual(refs, '', 'no pre-restore refs should be created');
  } finally {
    cleanupDir(tmpDir);
  }
});

console.log(`\n${passed + failed} tests: \x1b[32m${passed} passed\x1b[0m` + (failed ? `, \x1b[31m${failed} failed\x1b[0m` : ''));
process.exit(failed > 0 ? 1 : 0);
