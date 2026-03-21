#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: cursor-guard-init [options]

Installs cursor-guard skill into your Cursor skills directory, including
MCP dependencies and .gitignore entries.

Options:
  --global             Install to ~/.cursor/skills/ (default: project-local)
  --path <dir>         Project directory (default: current dir)
  --help, -h           Show this help message
  --version, -v        Show version number`);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  const pkg = require('../../package.json');
  console.log(pkg.version);
  process.exit(0);
}

const isGlobal = args.includes('--global');
const pathIdx = args.indexOf('--path');
const projectDir = path.resolve(pathIdx >= 0 && args[pathIdx + 1] ? args[pathIdx + 1] : '.');

const skillSource = path.resolve(__dirname, '../..');
const skillTarget = isGlobal
  ? path.join(process.env.USERPROFILE || process.env.HOME || os.homedir(), '.cursor', 'skills', 'cursor-guard')
  : path.join(projectDir, '.cursor', 'skills', 'cursor-guard');

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (path.basename(src) === 'node_modules') return;
    if (path.basename(src) === '.git') return;
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

console.log(`\n  cursor-guard init\n`);
console.log(`  Source:  ${skillSource}`);
console.log(`  Target:  ${skillTarget}`);
console.log(`  Mode:    ${isGlobal ? 'global (~/.cursor/skills/)' : 'project-local (.cursor/skills/)'}\n`);

// Step 1: Copy skill files (excluding node_modules and .git)
console.log('  [1/4] Copying skill files...');
if (fs.existsSync(skillTarget)) {
  fs.rmSync(skillTarget, { recursive: true, force: true });
}
copyRecursive(skillSource, skillTarget);
console.log('        Done.');

// Step 2: Install MCP dependencies in skill directory
console.log('  [2/4] Installing MCP dependencies...');
try {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execFileSync(npmCmd, ['install', '--omit=dev', '--ignore-scripts'], {
    cwd: skillTarget,
    stdio: 'pipe',
  });
  console.log('        Done.');
} catch (e) {
  console.log(`        Warning: npm install failed (${e.message}). MCP tools may not work.`);
  console.log('        You can fix this later: cd "' + skillTarget + '" ; npm install');
}

// Step 3: Add .gitignore entries for skill node_modules
console.log('  [3/4] Updating .gitignore...');
const gitignorePath = path.join(projectDir, '.gitignore');
const entries = ['.cursor/skills/**/node_modules/'];
let gitignoreUpdated = false;
if (!isGlobal) {
  let existing = '';
  try { existing = fs.readFileSync(gitignorePath, 'utf-8'); } catch { /* doesn't exist */ }
  const missing = entries.filter(e => !existing.includes(e));
  if (missing.length > 0) {
    const newline = existing.endsWith('\n') || !existing ? '' : '\n';
    fs.appendFileSync(gitignorePath, `${newline}# cursor-guard skill dependencies\n${missing.join('\n')}\n`);
    gitignoreUpdated = true;
    console.log('        Added: ' + missing.join(', '));
  } else {
    console.log('        Already configured.');
  }
} else {
  console.log('        Skipped (global install, not inside a project).');
}

// Step 4: Summary
console.log('  [4/4] Verifying...');
const serverExists = fs.existsSync(path.join(skillTarget, 'references', 'mcp', 'server.js'));
const sdkExists = fs.existsSync(path.join(skillTarget, 'node_modules', '@modelcontextprotocol', 'sdk'));
const skillMdExists = fs.existsSync(path.join(skillTarget, 'SKILL.md'));

console.log(`        SKILL.md:   ${skillMdExists ? 'OK' : 'MISSING'}`);
console.log(`        MCP server: ${serverExists ? 'OK' : 'MISSING'}`);
console.log(`        MCP SDK:    ${sdkExists ? 'OK' : 'MISSING — run npm install in skill dir'}`);

console.log(`\n  Installation complete!\n`);

// Detect git repo and recommend committing
let isGitRepoDir = false;
try { isGitRepoDir = fs.existsSync(path.join(projectDir, '.git')); } catch { /* ignore */ }
if (!isGlobal && isGitRepoDir) {
  console.log('  ** Important: commit now to prevent restore from reverting the skill **');
  console.log(`     git add .cursor/ .cursor-guard.json && git commit -m "chore: install cursor-guard"\n`);
}

console.log('  If MCP was already configured, restart Cursor (or Ctrl+Shift+P ->');
console.log('     "Developer: Reload Window") to load the updated MCP server.\n');
console.log('  Next steps:');
console.log('  1. The skill activates automatically in Cursor Agent conversations.');
console.log('  2. (Optional) Copy example config to project root:');
console.log(`     cp "${path.join(skillTarget, 'references', 'cursor-guard.example.json')}" .cursor-guard.json`);
console.log('  3. (Optional) Enable MCP — add to .cursor/mcp.json:');
console.log(`     { "mcpServers": { "cursor-guard": { "command": "node", "args": ["${path.join(skillTarget, 'references', 'mcp', 'server.js').replace(/\\/g, '/')}"] } } }`);
console.log('  4. (Optional) Start auto-backup:');
console.log(`     npx cursor-guard-backup --path "${projectDir}"\n`);
