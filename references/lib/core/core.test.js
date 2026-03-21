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
  assert.strictEqual(validateShadowSource('pre-restore-20260321_143205').valid, true);
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

// ── Summary ─────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: \x1b[32m${passed} passed\x1b[0m` + (failed ? `, \x1b[31m${failed} failed\x1b[0m` : ''));
process.exit(failed > 0 ? 1 : 0);
