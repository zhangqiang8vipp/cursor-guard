'use strict';

const path = require('path');
const fs = require('fs');

let _guardRoot = null;

function getGuardRoot() {
  if (_guardRoot) return _guardRoot;

  const marker = path.join('dashboard', 'server.js');

  // Strategy 1: skill dir structure — lib/ is inside references/vscode-extension/
  const fromSkill = path.resolve(__dirname, '..', '..');
  if (fs.existsSync(path.join(fromSkill, marker))) {
    _guardRoot = fromSkill;
    return _guardRoot;
  }

  // Strategy 2: VSIX flat — dashboard/ is sibling to lib/
  const fromFlat = path.resolve(__dirname, '..');
  if (fs.existsSync(path.join(fromFlat, marker))) {
    _guardRoot = fromFlat;
    return _guardRoot;
  }

  // Strategy 3: search common skill install locations
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const candidates = [
    path.join(home, '.cursor', 'skills', 'cursor-guard', 'references'),
    path.join(home, '.cursor', 'skills', 'cursor-guard'),
  ];

  // Strategy 4: search workspace node_modules
  if (typeof require.main?.filename === 'string') {
    const wsRoot = path.dirname(require.main.filename);
    candidates.push(path.join(wsRoot, 'node_modules', 'cursor-guard', 'references'));
  }

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, marker))) {
      _guardRoot = dir;
      return _guardRoot;
    }
  }

  throw new Error(
    'Cannot locate cursor-guard installation. '
    + 'Ensure cursor-guard is installed as a skill or via npm.'
  );
}

function guardPath(...segments) {
  return path.join(getGuardRoot(), ...segments);
}

function getPackageJson() {
  const root = getGuardRoot();
  // package.json is one level above references/ in skill structure
  const skillPkg = path.resolve(root, '..', 'package.json');
  if (fs.existsSync(skillPkg)) return skillPkg;
  // or at the same level in flat structure
  const flatPkg = path.join(root, 'package.json');
  if (fs.existsSync(flatPkg)) return flatPkg;
  return null;
}

function getPublicDir() {
  return guardPath('dashboard', 'public');
}

module.exports = { getGuardRoot, guardPath, getPackageJson, getPublicDir };
