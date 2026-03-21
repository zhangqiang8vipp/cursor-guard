'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  globMatch, matchesAny, loadConfig, DEFAULT_CONFIG, DEFAULT_SECRETS,
  filterFiles, buildManifest, manifestChanged, parseArgs, walkDir,
  unquoteGitPath,
} = require('./utils');

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

// ── globMatch ────────────────────────────────────────────────────

console.log('\nglobMatch:');

test('exact filename match', () => {
  assert.strictEqual(globMatch('.env', '.env'), true);
  assert.strictEqual(globMatch('.env', '.envx'), false);
});

test('* matches within a single segment', () => {
  assert.strictEqual(globMatch('*.js', 'foo.js'), true);
  assert.strictEqual(globMatch('*.js', 'bar.ts'), false);
  assert.strictEqual(globMatch('*.js', 'dir/foo.js'), false);
});

test('** matches across directories', () => {
  assert.strictEqual(globMatch('**/*.js', 'src/foo.js'), true);
  assert.strictEqual(globMatch('**/*.js', 'a/b/c/foo.js'), true);
  // **/*.js requires a slash — root-level 'foo.js' doesn't match (matchesAny checks leaf separately)
  assert.strictEqual(globMatch('**/*.js', 'foo.js'), false);
  assert.strictEqual(globMatch('**/*.js', 'foo.ts'), false);
});

test('? matches single character', () => {
  assert.strictEqual(globMatch('?.txt', 'a.txt'), true);
  assert.strictEqual(globMatch('?.txt', 'ab.txt'), false);
});

test('.env.* pattern', () => {
  assert.strictEqual(globMatch('.env.*', '.env.local'), true);
  assert.strictEqual(globMatch('.env.*', '.env.production'), true);
  assert.strictEqual(globMatch('.env.*', '.env'), false);
});

test('credentials* pattern', () => {
  assert.strictEqual(globMatch('credentials*', 'credentials'), true);
  assert.strictEqual(globMatch('credentials*', 'credentials.json'), true);
  assert.strictEqual(globMatch('credentials*', 'my-credentials'), false);
});

test('directory pattern src/**', () => {
  assert.strictEqual(globMatch('src/**', 'src/foo.js'), true);
  assert.strictEqual(globMatch('src/**', 'src/a/b.js'), true);
  assert.strictEqual(globMatch('src/**', 'lib/foo.js'), false);
});

test('backslash normalization', () => {
  assert.strictEqual(globMatch('src/**/*.ts', 'src\\components\\App.ts'), true);
});

test('regex special chars in pattern are escaped', () => {
  assert.strictEqual(globMatch('file(1).txt', 'file(1).txt'), true);
  assert.strictEqual(globMatch('file[0].txt', 'file[0].txt'), true); // [] escaped as literals
});

// ── matchesAny ───────────────────────────────────────────────────

console.log('\nmatchesAny:');

test('matches when any pattern hits', () => {
  assert.strictEqual(matchesAny(['*.js', '*.ts'], 'foo.js'), true);
  assert.strictEqual(matchesAny(['*.js', '*.ts'], 'foo.ts'), true);
  assert.strictEqual(matchesAny(['*.js', '*.ts'], 'foo.py'), false);
});

test('checks leaf filename for deep paths', () => {
  assert.strictEqual(matchesAny(['*.key'], 'secrets/server.key'), true);
  assert.strictEqual(matchesAny(['.env'], 'config/.env'), true);
});

test('empty patterns matches nothing', () => {
  assert.strictEqual(matchesAny([], 'anything'), false);
});

// ── loadConfig ───────────────────────────────────────────────────

console.log('\nloadConfig:');

test('returns defaults when no config file', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-test-'));
  try {
    const { cfg, loaded, error } = loadConfig(tmpDir);
    assert.strictEqual(loaded, false);
    assert.strictEqual(error, null);
    assert.deepStrictEqual(cfg.protect, []);
    assert.deepStrictEqual(cfg.ignore, []);
    assert.deepStrictEqual(cfg.secrets_patterns, DEFAULT_SECRETS);
    assert.strictEqual(cfg.backup_strategy, 'git');
    assert.strictEqual(cfg.git_retention.enabled, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('loads and merges custom config', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-test-'));
  try {
    fs.writeFileSync(path.join(tmpDir, '.cursor-guard.json'), JSON.stringify({
      protect: ['src/**'],
      backup_strategy: 'both',
      retention: { mode: 'count', max_count: 50 },
    }));
    const { cfg, loaded, error } = loadConfig(tmpDir);
    assert.strictEqual(loaded, true);
    assert.strictEqual(error, null);
    assert.deepStrictEqual(cfg.protect, ['src/**']);
    assert.strictEqual(cfg.backup_strategy, 'both');
    assert.strictEqual(cfg.retention.mode, 'count');
    assert.strictEqual(cfg.retention.max_count, 50);
    assert.strictEqual(cfg.retention.days, 30); // default preserved
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('handles malformed JSON gracefully', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-test-'));
  try {
    fs.writeFileSync(path.join(tmpDir, '.cursor-guard.json'), '{ broken }');
    const { cfg, loaded, error } = loadConfig(tmpDir);
    assert.strictEqual(loaded, false);
    assert.ok(error, 'should have an error message');
    assert.deepStrictEqual(cfg.protect, []);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('secrets_patterns override replaces defaults entirely', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-test-'));
  try {
    fs.writeFileSync(path.join(tmpDir, '.cursor-guard.json'), JSON.stringify({
      secrets_patterns: ['my-secret'],
    }));
    const { cfg } = loadConfig(tmpDir);
    assert.deepStrictEqual(cfg.secrets_patterns, ['my-secret']);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('secrets_patterns_extra appends to defaults', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-test-'));
  try {
    fs.writeFileSync(path.join(tmpDir, '.cursor-guard.json'), JSON.stringify({
      secrets_patterns_extra: ['*.secret', 'tokens.*'],
    }));
    const { cfg } = loadConfig(tmpDir);
    assert.ok(cfg.secrets_patterns.includes('.env'), 'should keep default .env');
    assert.ok(cfg.secrets_patterns.includes('*.p12'), 'should keep default *.p12');
    assert.ok(cfg.secrets_patterns.includes('*.secret'), 'should include extra *.secret');
    assert.ok(cfg.secrets_patterns.includes('tokens.*'), 'should include extra tokens.*');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('secrets_patterns_extra merges with custom secrets_patterns', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-test-'));
  try {
    fs.writeFileSync(path.join(tmpDir, '.cursor-guard.json'), JSON.stringify({
      secrets_patterns: ['.env'],
      secrets_patterns_extra: ['.env', '*.secret'],
    }));
    const { cfg } = loadConfig(tmpDir);
    assert.deepStrictEqual(cfg.secrets_patterns, ['.env', '*.secret']);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('non-string backup_strategy is ignored', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-test-'));
  try {
    fs.writeFileSync(path.join(tmpDir, '.cursor-guard.json'), JSON.stringify({
      backup_strategy: 123,
      auto_backup_interval_seconds: 'bad',
    }));
    const { cfg } = loadConfig(tmpDir);
    assert.strictEqual(cfg.backup_strategy, 'git');
    assert.strictEqual(cfg.auto_backup_interval_seconds, 60);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('invalid enum values fall back to defaults with warnings', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-test-'));
  try {
    fs.writeFileSync(path.join(tmpDir, '.cursor-guard.json'), JSON.stringify({
      backup_strategy: 'gittt',
      pre_restore_backup: 'yolo',
      retention: { mode: 'fancy' },
      git_retention: { enabled: true, mode: 'monthly' },
    }));
    const { cfg, warnings } = loadConfig(tmpDir);
    assert.strictEqual(cfg.backup_strategy, 'git');
    assert.strictEqual(cfg.pre_restore_backup, 'always');
    assert.strictEqual(cfg.retention.mode, 'days');
    assert.strictEqual(cfg.git_retention.mode, 'count');
    assert.strictEqual(warnings.length, 4);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── filterFiles ──────────────────────────────────────────────────

console.log('\nfilterFiles:');

const makeFiles = names => names.map(n => ({ full: `/fake/${n}`, rel: n, name: path.basename(n) }));

test('no protect/ignore returns all non-secret files', () => {
  const files = makeFiles(['a.js', 'b.ts', '.env', 'credentials.json']);
  const cfg = { ...DEFAULT_CONFIG };
  const result = filterFiles(files, cfg);
  const rels = result.map(f => f.rel);
  assert.ok(!rels.includes('.env'));
  assert.ok(!rels.includes('credentials.json'));
  assert.ok(rels.includes('a.js'));
  assert.ok(rels.includes('b.ts'));
});

test('protect narrows scope', () => {
  const files = makeFiles(['src/a.js', 'lib/b.js', 'README.md']);
  const cfg = { ...DEFAULT_CONFIG, protect: ['src/**'] };
  const result = filterFiles(files, cfg);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].rel, 'src/a.js');
});

test('ignore excludes files', () => {
  const files = makeFiles(['src/a.js', 'src/a.test.js', 'src/b.js']);
  const cfg = { ...DEFAULT_CONFIG, ignore: ['**/*.test.js'] };
  const result = filterFiles(files, cfg);
  const rels = result.map(f => f.rel);
  assert.ok(!rels.includes('src/a.test.js'));
  assert.ok(rels.includes('src/a.js'));
});

// ── manifestChanged ──────────────────────────────────────────────

console.log('\nmanifestChanged:');

test('null old manifest means changed', () => {
  assert.strictEqual(manifestChanged(null, { 'a.js': { mtimeMs: 1, size: 100 } }), true);
});

test('identical manifests are not changed', () => {
  const m = { 'a.js': { mtimeMs: 1, size: 100 } };
  assert.strictEqual(manifestChanged(m, { ...m }), false);
});

test('different mtime means changed', () => {
  const old = { 'a.js': { mtimeMs: 1, size: 100 } };
  const nw = { 'a.js': { mtimeMs: 2, size: 100 } };
  assert.strictEqual(manifestChanged(old, nw), true);
});

test('new file means changed', () => {
  const old = { 'a.js': { mtimeMs: 1, size: 100 } };
  const nw = { 'a.js': { mtimeMs: 1, size: 100 }, 'b.js': { mtimeMs: 2, size: 50 } };
  assert.strictEqual(manifestChanged(old, nw), true);
});

// ── parseArgs ────────────────────────────────────────────────────

console.log('\nparseArgs:');

test('parses --key value pairs', () => {
  const args = parseArgs(['node', 'script', '--path', '/tmp', '--interval', '30']);
  assert.strictEqual(args.path, '/tmp');
  assert.strictEqual(args.interval, '30');
});

test('parses boolean flags', () => {
  const args = parseArgs(['node', 'script', '--verbose']);
  assert.strictEqual(args.verbose, true);
});

test('empty args returns empty object', () => {
  const args = parseArgs(['node', 'script']);
  assert.deepStrictEqual(args, {});
});

// ── walkDir ──────────────────────────────────────────────────────

console.log('\nwalkDir:');

test('discovers files recursively', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-walk-'));
  try {
    fs.mkdirSync(path.join(tmpDir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'a');
    fs.writeFileSync(path.join(tmpDir, 'sub', 'b.txt'), 'b');
    const files = walkDir(tmpDir, tmpDir);
    const rels = files.map(f => f.rel).sort();
    assert.deepStrictEqual(rels, ['a.txt', 'sub/b.txt']);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('skips .git and node_modules', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-walk-'));
  try {
    fs.mkdirSync(path.join(tmpDir, '.git'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.git', 'HEAD'), 'ref');
    fs.writeFileSync(path.join(tmpDir, 'node_modules', 'x.js'), 'x');
    fs.writeFileSync(path.join(tmpDir, 'real.js'), 'y');
    const files = walkDir(tmpDir, tmpDir);
    assert.strictEqual(files.length, 1);
    assert.strictEqual(files[0].rel, 'real.js');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('loadConfig filters non-string elements from array fields with warnings', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-cfg-'));
  try {
    fs.writeFileSync(path.join(tmpDir, '.cursor-guard.json'), JSON.stringify({
      protect: ['src/**', 123, null, true],
      ignore: ['dist/**', { not: 'a string' }],
      secrets_patterns: ['.env', 42],
    }));
    const { cfg, warnings } = loadConfig(tmpDir);
    assert.deepStrictEqual(cfg.protect, ['src/**'], 'protect should only contain strings');
    assert.deepStrictEqual(cfg.ignore, ['dist/**'], 'ignore should only contain strings');
    assert.deepStrictEqual(cfg.secrets_patterns, ['.env'], 'secrets_patterns should only contain strings');
    assert.ok(warnings.some(w => w.includes('protect') && w.includes('3 non-string')), 'should warn about protect');
    assert.ok(warnings.some(w => w.includes('ignore') && w.includes('1 non-string')), 'should warn about ignore');
    assert.ok(warnings.some(w => w.includes('secrets_patterns') && w.includes('1 non-string')), 'should warn about secrets_patterns');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('loadConfig filters non-string elements from secrets_patterns_extra', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-cfg-'));
  try {
    fs.writeFileSync(path.join(tmpDir, '.cursor-guard.json'), JSON.stringify({
      secrets_patterns_extra: ['*.secret', 999, null],
    }));
    const { cfg, warnings } = loadConfig(tmpDir);
    assert.ok(cfg.secrets_patterns.includes('*.secret'), 'should include valid extra pattern');
    assert.ok(!cfg.secrets_patterns.includes(999), 'should not include number');
    assert.ok(warnings.some(w => w.includes('secrets_patterns_extra')), 'should warn about non-string extras');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('loadConfig warns on non-boolean proactive_alert', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-cfg-'));
  try {
    fs.writeFileSync(path.join(tmpDir, '.cursor-guard.json'), JSON.stringify({ proactive_alert: "no" }));
    const { cfg, warnings } = loadConfig(tmpDir);
    assert.strictEqual(cfg.proactive_alert, true, 'should keep default true');
    assert.ok(warnings && warnings.some(w => w.includes('proactive_alert')), 'should have proactive_alert warning');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── unquoteGitPath ───────────────────────────────────────────────

console.log('\nunquoteGitPath:');

test('returns unquoted path unchanged', () => {
  assert.strictEqual(unquoteGitPath('src/app.js'), 'src/app.js');
});

test('strips quotes and unescapes spaces', () => {
  assert.strictEqual(unquoteGitPath('"dir with space/a.txt"'), 'dir with space/a.txt');
});

test('unescapes backslash sequences', () => {
  assert.strictEqual(unquoteGitPath('"a\\tb"'), 'a\tb');
  assert.strictEqual(unquoteGitPath('"a\\nb"'), 'a\nb');
  assert.strictEqual(unquoteGitPath('"a\\\\"'), 'a\\');
  assert.strictEqual(unquoteGitPath('"a\\""'), 'a"');
});

test('unescapes octal sequences', () => {
  assert.strictEqual(unquoteGitPath('"\\303\\251"'), '\u00e9');
});

// ── Summary ──────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: \x1b[32m${passed} passed\x1b[0m` + (failed ? `, \x1b[31m${failed} failed\x1b[0m` : ''));
process.exit(failed > 0 ? 1 : 0);
