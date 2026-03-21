'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

let passed = 0;
let failed = 0;
let serverProcess = null;
let msgId = 0;

function log(color, sym, msg) {
  const c = { green: 32, red: 31 }[color] || 0;
  console.log(`  \x1b[${c}m${sym}\x1b[0m ${msg}`);
}

function createTempGitRepo() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-mcp-test-'));
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

function startServer() {
  const serverPath = path.join(__dirname, 'server.js');
  serverProcess = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  serverProcess.stderr.on('data', () => {});
}

function sendMessage(msg) {
  serverProcess.stdin.write(JSON.stringify(msg) + '\n');
}

function readResponse() {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => {
      serverProcess.stdout.removeListener('data', onData);
      reject(new Error('timeout waiting for response'));
    }, 15000);

    function onData(chunk) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.id !== undefined || parsed.result !== undefined) {
            clearTimeout(timeout);
            serverProcess.stdout.removeListener('data', onData);
            resolve(parsed);
            return;
          }
        } catch { /* not valid JSON yet, continue */ }
      }
      buffer = lines[lines.length - 1];
    }
    serverProcess.stdout.on('data', onData);
  });
}

async function rpc(method, params) {
  const id = ++msgId;
  sendMessage({ jsonrpc: '2.0', id, method, params });
  return await readResponse();
}

async function test(name, fn) {
  try {
    await fn();
    passed++;
    log('green', '✓', name);
  } catch (e) {
    failed++;
    log('red', '✗', name);
    console.log(`    ${e.message}`);
  }
}

async function run() {
  const tmpDir = createTempGitRepo();

  console.log('\nMCP Server:');

  startServer();

  // Initialize
  const initResp = await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0' },
  });
  sendMessage({ jsonrpc: '2.0', method: 'notifications/initialized' });

  await test('initialize returns server info', () => {
    if (!initResp.result) throw new Error('no result');
    if (!initResp.result.serverInfo) throw new Error('no serverInfo');
    if (initResp.result.serverInfo.name !== 'cursor-guard') throw new Error(`wrong name: ${initResp.result.serverInfo.name}`);
  });

  // List tools
  const toolsResp = await rpc('tools/list', {});

  await test('lists 7 tools', () => {
    const tools = toolsResp.result.tools;
    if (!tools) throw new Error('no tools');
    if (tools.length !== 7) throw new Error(`expected 7 tools, got ${tools.length}`);
    const names = tools.map(t => t.name).sort();
    const expected = ['backup_status', 'doctor', 'doctor_fix', 'list_backups', 'restore_file', 'restore_project', 'snapshot_now'].sort();
    if (JSON.stringify(names) !== JSON.stringify(expected)) {
      throw new Error(`tool names mismatch: ${JSON.stringify(names)}`);
    }
  });

  // Call doctor
  const doctorResp = await rpc('tools/call', {
    name: 'doctor',
    arguments: { path: tmpDir },
  });

  await test('doctor returns structured checks', () => {
    const content = doctorResp.result.content[0].text;
    const data = JSON.parse(content);
    if (!data.checks) throw new Error('no checks');
    if (!data.summary) throw new Error('no summary');
    if (typeof data.summary.pass !== 'number') throw new Error('summary.pass not a number');
  });

  // Call snapshot_now
  const snapResp = await rpc('tools/call', {
    name: 'snapshot_now',
    arguments: { path: tmpDir, strategy: 'git' },
  });

  await test('snapshot_now creates git snapshot', () => {
    const content = snapResp.result.content[0].text;
    const data = JSON.parse(content);
    if (!data.git) throw new Error('no git result');
    if (data.git.status !== 'created' && data.git.status !== 'skipped') {
      throw new Error(`unexpected status: ${data.git.status}`);
    }
  });

  // Call list_backups
  const listResp = await rpc('tools/call', {
    name: 'list_backups',
    arguments: { path: tmpDir },
  });

  await test('list_backups returns sources', () => {
    const content = listResp.result.content[0].text;
    const data = JSON.parse(content);
    if (!Array.isArray(data.sources)) throw new Error('sources not an array');
  });

  // Setup for restore tests
  const headHash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' }).trim();
  fs.writeFileSync(path.join(tmpDir, 'hello.txt'), 'changed');
  execFileSync('git', ['add', '-A'], { cwd: tmpDir, stdio: 'pipe' });
  execFileSync('git', ['commit', '-m', 'change', '--no-verify'], { cwd: tmpDir, stdio: 'pipe' });

  // Call restore_project (preview)
  const previewResp = await rpc('tools/call', {
    name: 'restore_project',
    arguments: { path: tmpDir, source: headHash, preview: true },
  });

  await test('restore_project returns preview', () => {
    const content = previewResp.result.content[0].text;
    const data = JSON.parse(content);
    if (data.status !== 'ok') throw new Error(`status: ${data.status}`);
    if (!Array.isArray(data.files)) throw new Error('files not an array');
  });

  // Call restore_project (execute mode)
  // Re-stage the change so we have something to restore
  fs.writeFileSync(path.join(tmpDir, 'hello.txt'), 'changed-again');
  execFileSync('git', ['add', '-A'], { cwd: tmpDir, stdio: 'pipe' });
  execFileSync('git', ['commit', '-m', 'change again', '--no-verify'], { cwd: tmpDir, stdio: 'pipe' });

  const execResp = await rpc('tools/call', {
    name: 'restore_project',
    arguments: { path: tmpDir, source: headHash, preview: false, preserve_current: true },
  });

  await test('restore_project executes restore', () => {
    const content = execResp.result.content[0].text;
    const data = JSON.parse(content);
    if (data.status !== 'restored') throw new Error(`status: ${data.status}, error: ${data.error}`);
    if (typeof data.filesRestored !== 'number') throw new Error('filesRestored missing');
    const actual = fs.readFileSync(path.join(tmpDir, 'hello.txt'), 'utf-8');
    if (actual !== 'hello world') throw new Error(`content mismatch: "${actual}"`);
  });

  // Call restore_file
  fs.writeFileSync(path.join(tmpDir, 'hello.txt'), 'overwritten');
  execFileSync('git', ['add', '-A'], { cwd: tmpDir, stdio: 'pipe' });
  execFileSync('git', ['commit', '-m', 'overwrite', '--no-verify'], { cwd: tmpDir, stdio: 'pipe' });

  const restoreResp = await rpc('tools/call', {
    name: 'restore_file',
    arguments: { path: tmpDir, file: 'hello.txt', source: headHash, preserve_current: false },
  });

  await test('restore_file restores successfully', () => {
    const content = restoreResp.result.content[0].text;
    const data = JSON.parse(content);
    if (data.status !== 'restored') throw new Error(`status: ${data.status}, error: ${data.error}`);
    const actual = fs.readFileSync(path.join(tmpDir, 'hello.txt'), 'utf-8');
    if (actual !== 'hello world') throw new Error(`content mismatch: "${actual}"`);
  });

  // Call backup_status
  const statusResp = await rpc('tools/call', {
    name: 'backup_status',
    arguments: { path: tmpDir },
  });

  await test('backup_status returns structured status', () => {
    const content = statusResp.result.content[0].text;
    const data = JSON.parse(content);
    if (typeof data.watcher !== 'object') throw new Error('no watcher');
    if (typeof data.config !== 'object') throw new Error('no config');
    if (typeof data.lastBackup !== 'object') throw new Error('no lastBackup');
    if (typeof data.refs !== 'object') throw new Error('no refs');
    if (typeof data.disk !== 'object') throw new Error('no disk');
  });

  // Call doctor_fix (dry-run)
  const fixDryResp = await rpc('tools/call', {
    name: 'doctor_fix',
    arguments: { path: tmpDir, dry_run: true },
  });

  await test('doctor_fix dry-run returns actions without fixing', () => {
    const content = fixDryResp.result.content[0].text;
    const data = JSON.parse(content);
    if (!Array.isArray(data.actions)) throw new Error('actions not an array');
    if (data.totalFixed !== 0) throw new Error(`dry-run should not fix, but fixed ${data.totalFixed}`);
  });

  // Call doctor_fix (apply)
  const fixResp = await rpc('tools/call', {
    name: 'doctor_fix',
    arguments: { path: tmpDir },
  });

  await test('doctor_fix returns structured result', () => {
    const content = fixResp.result.content[0].text;
    const data = JSON.parse(content);
    if (!Array.isArray(data.actions)) throw new Error('actions not an array');
    if (typeof data.totalFixed !== 'number') throw new Error('totalFixed missing');
  });

  // Cleanup
  serverProcess.kill();
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log(`\n${passed + failed} tests: \x1b[32m${passed} passed\x1b[0m` + (failed ? `, \x1b[31m${failed} failed\x1b[0m` : ''));
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test runner error:', err);
  if (serverProcess) serverProcess.kill();
  process.exit(1);
});
