#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REFS = path.resolve(__dirname, '..');
const ROOT = path.resolve(REFS, '..');
const DIST = path.join(__dirname, 'dist');

const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
const extPkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));

console.log(`\n  build-vsix: cursor-guard v${rootPkg.version}\n`);

if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const copyMap = [
  { src: 'extension.js' },
  { src: 'lib', type: 'dir' },
  { src: 'media', type: 'dir' },

  { src: path.join(REFS, 'dashboard'), dst: 'dashboard', type: 'dir' },
  { src: path.join(REFS, 'lib', 'core'), dst: path.join('lib', 'core'), type: 'dir' },
  { src: path.join(REFS, 'lib', 'utils.js'), dst: path.join('lib', 'utils.js') },
  { src: path.join(REFS, 'lib', 'auto-backup.js'), dst: path.join('lib', 'auto-backup.js') },
  { src: path.join(REFS, 'lib', 'guard-doctor.js'), dst: path.join('lib', 'guard-doctor.js') },
  { src: path.join(REFS, 'bin'), dst: 'bin', type: 'dir' },

  { src: path.join(ROOT, 'SKILL.md'), dst: path.join('skill', 'SKILL.md') },
  { src: path.join(ROOT, 'ROADMAP.md'), dst: path.join('skill', 'ROADMAP.md') },
  { src: path.join(REFS, 'cursor-guard.example.json'), dst: path.join('skill', 'cursor-guard.example.json') },
  { src: path.join(REFS, 'cursor-guard.schema.json'), dst: path.join('skill', 'cursor-guard.schema.json') },
  { src: path.join(REFS, 'config-reference.md'), dst: path.join('skill', 'config-reference.md') },
  { src: path.join(REFS, 'config-reference.zh-CN.md'), dst: path.join('skill', 'config-reference.zh-CN.md') },
  { src: path.join(REFS, 'recovery.md'), dst: path.join('skill', 'recovery.md') },
];

for (const entry of copyMap) {
  const src = path.isAbsolute(entry.src) ? entry.src : path.join(__dirname, entry.src);
  const dst = path.join(DIST, entry.dst || entry.src);
  if (!fs.existsSync(src)) { console.log(`  SKIP (not found): ${entry.src}`); continue; }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (entry.type === 'dir') {
    copyDir(src, dst);
  } else {
    fs.copyFileSync(src, dst);
  }
  console.log(`  COPY: ${path.relative(DIST, dst)}`);
}

// ── Bundle MCP server with esbuild (all deps inlined, no vendor/ needed) ──
const mcpEntry = path.join(REFS, 'mcp', 'server.js');
const mcpOut = path.join(DIST, 'mcp', 'server.js');
fs.mkdirSync(path.join(DIST, 'mcp'), { recursive: true });

try {
  const { execSync } = require('child_process');
  const cmd = `npx esbuild "${mcpEntry}" --bundle --platform=node --target=node18 --format=cjs --outfile="${mcpOut}" --log-level=warning`;
  execSync(cmd, { cwd: ROOT, stdio: 'pipe' });
  const size = (fs.statSync(mcpOut).size / 1024).toFixed(0);
  console.log(`  BUNDLE: mcp/server.js (${size} KB, self-contained)`);
} catch (err) {
  console.error(`  ERROR: esbuild bundle failed:\n${err.stderr?.toString() || err.message}`);
  console.error('  Falling back to source copy...');
  fs.copyFileSync(mcpEntry, mcpOut);
}

// Generate merged package.json
extPkg.version = rootPkg.version;
fs.writeFileSync(path.join(DIST, 'package.json'), JSON.stringify(extPkg, null, 2));
console.log(`  WRITE: package.json (v${rootPkg.version})`);

// Copy .vscodeignore
const ignoreFile = path.join(__dirname, '.vscodeignore');
if (fs.existsSync(ignoreFile)) {
  fs.copyFileSync(ignoreFile, path.join(DIST, '.vscodeignore'));
}

// Write a guard-version.json so the extension knows its version
fs.writeFileSync(path.join(DIST, 'guard-version.json'), JSON.stringify({ version: rootPkg.version }));

console.log(`\n  dist/ ready at: ${DIST}`);
console.log(`  To build VSIX: cd dist && npx vsce package\n`);

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    if (entry.name.endsWith('.test.js')) continue;
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
