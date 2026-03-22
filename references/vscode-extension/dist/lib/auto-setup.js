'use strict';

const fs = require('fs');
const path = require('path');

function detectIdeDir(vscode) {
  const appName = (vscode.env.appName || '').toLowerCase();
  const home = process.env.USERPROFILE || process.env.HOME || '';

  const ideDirs = [];

  if (appName.includes('cursor')) {
    ideDirs.push('.cursor');
  } else if (appName.includes('windsurf')) {
    ideDirs.push('.windsurf');
  } else if (appName.includes('trae')) {
    ideDirs.push('.trae');
  }

  ideDirs.push('.cursor', '.windsurf', '.vscode');

  const seen = new Set();
  for (const dir of ideDirs) {
    if (seen.has(dir)) continue;
    seen.add(dir);
    const full = path.join(home, dir);
    if (fs.existsSync(full)) return { dirName: dir, homePath: full };
  }

  return { dirName: ideDirs[0], homePath: path.join(home, ideDirs[0]) };
}

function getExtensionRoot(context) {
  return context.extensionPath;
}

function findBundledSkill(extRoot) {
  const skillDir = path.join(extRoot, 'skill');
  if (fs.existsSync(path.join(skillDir, 'SKILL.md'))) return skillDir;
  const fromRefs = path.resolve(extRoot, '..', '..', 'SKILL.md');
  if (fs.existsSync(fromRefs)) return path.resolve(extRoot, '..', '..');
  return null;
}

async function autoSetup(context, vscode) {
  const extRoot = getExtensionRoot(context);
  const { dirName, homePath } = detectIdeDir(vscode);
  const workspaceFolders = vscode.workspace.workspaceFolders;
  const wsRoot = workspaceFolders?.[0]?.uri.fsPath;

  const actions = [];

  try { actions.push(...autoInstallSkill(extRoot, homePath, dirName)); } catch { /* non-critical */ }
  try { actions.push(...autoRegisterMcp(extRoot, homePath, wsRoot)); } catch { /* non-critical */ }
  if (wsRoot) {
    try { actions.push(...autoCreateConfig(extRoot, wsRoot)); } catch { /* non-critical */ }
  }

  if (actions.length > 0) {
    vscode.window.showInformationMessage(`Cursor Guard: auto-setup complete — ${actions.join(', ')}`);
  }
}

function autoInstallSkill(extRoot, homePath, dirName) {
  const actions = [];
  const skillSrc = findBundledSkill(extRoot);
  if (!skillSrc) return actions;

  const skillTarget = path.join(homePath, 'skills', 'cursor-guard');
  const skillMdTarget = path.join(skillTarget, 'SKILL.md');

  if (fs.existsSync(skillMdTarget)) return actions;

  fs.mkdirSync(skillTarget, { recursive: true });

  const skillMdSrc = path.join(skillSrc, 'SKILL.md');
  if (fs.existsSync(skillMdSrc)) {
    fs.copyFileSync(skillMdSrc, skillMdTarget);
    actions.push('SKILL.md installed');
  }

  const roadmapSrc = path.join(skillSrc, 'ROADMAP.md');
  if (fs.existsSync(roadmapSrc)) {
    fs.copyFileSync(roadmapSrc, path.join(skillTarget, 'ROADMAP.md'));
  }

  // Link references/ → extension directory so SKILL.md paths resolve correctly
  // (mcp/server.js, lib/core/*, dashboard/, bin/ etc.)
  const refsTarget = path.join(skillTarget, 'references');
  if (!fs.existsSync(refsTarget)) {
    try {
      fs.symlinkSync(extRoot, refsTarget, 'junction');
      actions.push('references/ linked');
    } catch {
      // junction failed (rare) — fall back to copying essential docs only
      fs.mkdirSync(refsTarget, { recursive: true });
      _copyDocFiles(skillSrc, refsTarget);
    }
  }

  // Copy package.json so `require('../../package.json')` in source mode works
  const pkgSrc = path.join(extRoot, '..', '..', 'package.json');
  const pkgDst = path.join(skillTarget, 'package.json');
  if (fs.existsSync(pkgSrc) && !fs.existsSync(pkgDst)) {
    fs.copyFileSync(pkgSrc, pkgDst);
  }

  return actions;
}

function _copyDocFiles(skillSrc, refsTarget) {
  const docs = [
    'config-reference.md', 'config-reference.zh-CN.md',
    'recovery.md', 'cursor-guard.schema.json', 'cursor-guard.example.json',
  ];
  for (const f of docs) {
    const src = path.join(skillSrc, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(refsTarget, f));
  }
}

function autoRegisterMcp(extRoot, homePath, wsRoot) {
  const actions = [];
  const mcpServerPath = path.join(extRoot, 'mcp', 'server.js');
  if (!fs.existsSync(mcpServerPath)) return actions;

  const mcpJsonPaths = [
    wsRoot ? path.join(wsRoot, '.cursor', 'mcp.json') : null,
    wsRoot ? path.join(wsRoot, '.windsurf', 'mcp.json') : null,
    path.join(homePath, 'mcp.json'),
  ].filter(Boolean);

  for (const mcpJsonPath of mcpJsonPaths) {
    const dir = path.dirname(mcpJsonPath);
    if (!fs.existsSync(dir)) continue;

    let mcpConfig = { mcpServers: {} };
    if (fs.existsSync(mcpJsonPath)) {
      try { mcpConfig = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8')); } catch { continue; }
    }

    if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};
    if (mcpConfig.mcpServers['cursor-guard']) return actions;

    mcpConfig.mcpServers['cursor-guard'] = {
      command: 'node',
      args: [mcpServerPath.replace(/\\/g, '/')],
    };

    fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2));
    actions.push('MCP registered');
    return actions;
  }

  return actions;
}

function autoCreateConfig(extRoot, wsRoot) {
  const actions = [];
  const configTarget = path.join(wsRoot, '.cursor-guard.json');
  if (fs.existsSync(configTarget)) return actions;

  const exampleSrc = path.join(extRoot, 'skill', 'cursor-guard.example.json');
  const exampleFromRefs = path.join(extRoot, '..', 'cursor-guard.example.json');
  const src = fs.existsSync(exampleSrc) ? exampleSrc : fs.existsSync(exampleFromRefs) ? exampleFromRefs : null;

  if (src) {
    fs.copyFileSync(src, configTarget);
    actions.push('.cursor-guard.json created');
  }

  return actions;
}

module.exports = { autoSetup, detectIdeDir };
