'use strict';

const fs = require('fs');
const path = require('path');
const {
  loadConfig, gitAvailable, git, isGitRepo, gitDir, gitVersion,
  walkDir, matchesAny, diskFreeGB,
} = require('../utils');

/**
 * Run all diagnostic checks for a project directory.
 *
 * @param {string} projectDir - Absolute path to the project root.
 * @returns {{ checks: Array<{name: string, status: 'PASS'|'WARN'|'FAIL', detail?: string}>, summary: {pass: number, warn: number, fail: number} }}
 */
function runDiagnostics(projectDir) {
  const checks = [];

  function check(name, status, detail) {
    checks.push({ name, status, detail: detail || null });
  }

  // 1. Git availability
  const hasGit = gitAvailable();
  if (hasGit) {
    check('Git installed', 'PASS', `version ${gitVersion()}`);
  } else {
    check('Git installed', 'WARN', 'git not found in PATH; only shadow strategy available');
  }

  // 2. Git repo status
  let repo = false;
  let gDir = null;
  let isWorktree = false;
  if (hasGit) {
    repo = isGitRepo(projectDir);
    if (repo) {
      gDir = gitDir(projectDir);
      try {
        const commonDir = git(['rev-parse', '--git-common-dir'], { cwd: projectDir, allowFail: true });
        const currentDir = git(['rev-parse', '--git-dir'], { cwd: projectDir, allowFail: true });
        isWorktree = commonDir && currentDir && commonDir !== currentDir;
      } catch { /* ignore */ }
      if (isWorktree) {
        check('Git repository', 'PASS', `worktree detected (git-dir: ${gDir})`);
      } else {
        check('Git repository', 'PASS', 'standard repo');
      }
    } else {
      check('Git repository', 'WARN', 'not a Git repo; git/both strategies won\'t work');
    }
  }

  // 3. Config file
  const { cfg, loaded, error } = loadConfig(projectDir);
  if (loaded) {
    check('Config file', 'PASS', '.cursor-guard.json found and valid JSON');
  } else if (error) {
    check('Config file', 'FAIL', `JSON parse error: ${error}`);
  } else {
    check('Config file', 'WARN', 'no .cursor-guard.json found; using defaults (protect everything)');
  }

  // 4. Strategy vs environment
  const strategy = cfg.backup_strategy;
  if (strategy === 'git' || strategy === 'both') {
    if (!repo) {
      check('Strategy compatibility', 'FAIL', `backup_strategy='${strategy}' but directory is not a Git repo`);
    } else {
      check('Strategy compatibility', 'PASS', `backup_strategy='${strategy}' and Git repo exists`);
    }
  } else if (strategy === 'shadow') {
    check('Strategy compatibility', 'PASS', "backup_strategy='shadow' — no Git required");
  } else {
    check('Strategy compatibility', 'FAIL', `unknown backup_strategy='${strategy}' (must be git/shadow/both)`);
  }

  // 5. Backup ref
  if (repo) {
    const guardRef = 'refs/guard/auto-backup';
    const legacyRef = 'refs/heads/cursor-guard/auto-backup';
    const exists = git(['rev-parse', '--verify', guardRef], { cwd: projectDir, allowFail: true });
    const legacyExists = git(['rev-parse', '--verify', legacyRef], { cwd: projectDir, allowFail: true });
    if (exists) {
      const count = git(['rev-list', '--count', guardRef], { cwd: projectDir, allowFail: true }) || '?';
      check('Backup ref', 'PASS', `refs/guard/auto-backup exists (${count} commits)`);
    } else if (legacyExists) {
      const count = git(['rev-list', '--count', legacyRef], { cwd: projectDir, allowFail: true }) || '?';
      check('Backup ref', 'WARN', `legacy refs/heads/cursor-guard/auto-backup found (${count} commits) — run auto-backup once to migrate`);
    } else {
      check('Backup ref', 'WARN', 'refs/guard/auto-backup not created yet (will be created on first backup)');
    }
  }

  // 5b. Git retention warning
  if (repo) {
    const guardRef = 'refs/guard/auto-backup';
    const countStr = git(['rev-list', '--count', guardRef], { cwd: projectDir, allowFail: true });
    const commitCount = countStr ? parseInt(countStr, 10) : 0;
    if (commitCount > 500 && !cfg.git_retention.enabled) {
      check('Git retention', 'WARN',
        `${commitCount} backup commits and git_retention is disabled — set git_retention.enabled=true in .cursor-guard.json to auto-prune old snapshots`);
    } else if (commitCount > 0 && cfg.git_retention.enabled) {
      check('Git retention', 'PASS', `${commitCount} commits, auto-prune enabled (${cfg.git_retention.mode}: ${cfg.git_retention.mode === 'days' ? cfg.git_retention.days + 'd' : cfg.git_retention.max_count})`);
    }
  }

  // 5c. Backup integrity — verify latest auto-backup tree is reachable
  if (repo) {
    const guardRef = 'refs/guard/auto-backup';
    const latestHash = git(['rev-parse', '--verify', guardRef], { cwd: projectDir, allowFail: true });
    if (latestHash) {
      const treeType = git(['cat-file', '-t', `${latestHash}^{tree}`], { cwd: projectDir, allowFail: true });
      if (treeType === 'tree') {
        check('Backup integrity', 'PASS', `latest auto-backup commit ${latestHash.substring(0, 7)} tree is valid`);
      } else {
        check('Backup integrity', 'FAIL', `latest auto-backup commit ${latestHash.substring(0, 7)} tree is corrupted or unreachable`);
      }
    }
  }

  // 6. Guard refs
  if (repo) {
    const refs = git(['for-each-ref', 'refs/guard/', '--format=%(refname)'], { cwd: projectDir, allowFail: true });
    if (refs) {
      const refList = refs.split('\n').filter(Boolean);
      const preRestoreCount = refList.filter(r => r.includes('pre-restore/')).length;
      check('Guard refs', 'PASS', `${refList.length} ref(s) found (${preRestoreCount} pre-restore snapshots)`);
    } else {
      check('Guard refs', 'WARN', 'no guard refs yet (created on first snapshot or restore)');
    }
  }

  // 7. Shadow copy directory
  const backupDir = path.join(projectDir, '.cursor-guard-backup');
  if (fs.existsSync(backupDir)) {
    let snapCount = 0;
    let totalBytes = 0;
    try {
      const dirs = fs.readdirSync(backupDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && (/^\d{8}_\d{6}(_\d{3})?$/.test(d.name) || d.name.startsWith('pre-restore-')));
      snapCount = dirs.length;
    } catch { /* ignore */ }
    try {
      const allFiles = walkDir(backupDir, backupDir);
      for (const f of allFiles) {
        try { totalBytes += fs.statSync(f.full).size; } catch { /* skip */ }
      }
    } catch { /* ignore */ }
    const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);
    check('Shadow copies', 'PASS', `${snapCount} snapshot(s), ${totalMB} MB total`);
  } else {
    check('Shadow copies', 'WARN', '.cursor-guard-backup/ not found (will be created on first shadow backup)');
  }

  // 8. .gitignore / exclude coverage
  if (repo) {
    const ignored = git(['check-ignore', '.cursor-guard-backup/test'], { cwd: projectDir, allowFail: true });
    if (ignored) {
      check('Backup dir ignored', 'PASS', '.cursor-guard-backup/ is git-ignored');
    } else {
      check('Backup dir ignored', 'WARN', '.cursor-guard-backup/ may NOT be git-ignored — backup changes could trigger commits');
    }
  }

  // 9. Config field validation
  if (loaded) {
    const validStrategies = ['git', 'shadow', 'both'];
    if (cfg.backup_strategy && !validStrategies.includes(cfg.backup_strategy)) {
      check('Config: backup_strategy', 'FAIL', `invalid value '${cfg.backup_strategy}'`);
    }
    const validPreRestore = ['always', 'ask', 'never'];
    if (cfg.pre_restore_backup && !validPreRestore.includes(cfg.pre_restore_backup)) {
      check('Config: pre_restore_backup', 'FAIL', `invalid value '${cfg.pre_restore_backup}'`);
    } else if (cfg.pre_restore_backup === 'never') {
      check('Config: pre_restore_backup', 'WARN', "set to 'never' — restores won't auto-preserve current version");
    }
    if (cfg.auto_backup_interval_seconds && cfg.auto_backup_interval_seconds < 5) {
      check('Config: interval', 'WARN', `${cfg.auto_backup_interval_seconds}s is below minimum (5s), will be clamped`);
    }
    if (cfg.retention && cfg.retention.mode) {
      const validModes = ['days', 'count', 'size'];
      if (!validModes.includes(cfg.retention.mode)) {
        check('Config: retention.mode', 'FAIL', `invalid value '${cfg.retention.mode}'`);
      }
    }
    if (cfg.git_retention && cfg.git_retention.mode) {
      const validGitModes = ['days', 'count'];
      if (!validGitModes.includes(cfg.git_retention.mode)) {
        check('Config: git_retention.mode', 'FAIL', `invalid value '${cfg.git_retention.mode}'`);
      }
    }
  }

  // 10. Protect / Ignore effectiveness
  if (loaded && cfg.protect.length > 0) {
    const allFiles = walkDir(projectDir, projectDir);
    let protectedCount = 0;
    for (const f of allFiles) {
      if (matchesAny(cfg.protect, f.rel)) protectedCount++;
    }
    check('Protect patterns', 'PASS', `${protectedCount} / ${allFiles.length} files matched by protect patterns`);
  }

  // 11. Disk space
  const freeGB = diskFreeGB(projectDir);
  if (freeGB !== null) {
    const rounded = freeGB.toFixed(1);
    if (freeGB < 1) {
      check('Disk space', 'FAIL', `${rounded} GB free — critically low`);
    } else if (freeGB < 5) {
      check('Disk space', 'WARN', `${rounded} GB free`);
    } else {
      check('Disk space', 'PASS', `${rounded} GB free`);
    }
  } else {
    check('Disk space', 'WARN', 'could not determine free space');
  }

  // 12. Lock file — distinguish running watcher from stale lock
  const lockFile = gDir
    ? path.join(gDir, 'cursor-guard.lock')
    : path.join(backupDir, 'cursor-guard.lock');
  if (fs.existsSync(lockFile)) {
    let content = '';
    try { content = fs.readFileSync(lockFile, 'utf-8').trim(); } catch { /* ignore */ }
    const pidMatch = content.match(/pid=(\d+)/);
    const startedMatch = content.match(/started=(.+)/);
    const lockPid = pidMatch ? parseInt(pidMatch[1], 10) : null;
    let pidAlive = false;
    if (lockPid) {
      try { process.kill(lockPid, 0); pidAlive = true; } catch { /* not running */ }
    }
    if (lockPid && pidAlive) {
      const since = startedMatch ? startedMatch[1] : 'unknown';
      check('Lock file', 'PASS', `watcher running (pid=${lockPid}, since ${since})`);
    } else if (lockPid && !pidAlive) {
      check('Lock file', 'WARN', `stale lock file (pid=${lockPid} is dead) — safe to delete or run doctor_fix`);
    } else {
      check('Lock file', 'WARN', `lock file exists — another instance may be running. ${content}`);
    }
  } else {
    check('Lock file', 'PASS', 'no lock file (no running instance)');
  }

  // 13. Node.js version
  const nodeVer = process.version;
  const major = parseInt(nodeVer.slice(1), 10);
  if (major >= 18) {
    check('Node.js', 'PASS', `${nodeVer}`);
  } else {
    check('Node.js', 'WARN', `${nodeVer} — recommended >=18`);
  }

  // 14. MCP server status
  const mcpServerPath = path.resolve(__dirname, '../../mcp/server.js');
  const mcpServerExists = fs.existsSync(mcpServerPath);

  let mcpSdkAvailable = false;
  let mcpSdkVersion = null;
  const skillRoot = path.resolve(__dirname, '../../..');
  // Search multiple candidate locations for SDK package.json
  const sdkCandidates = [
    path.join(skillRoot, 'node_modules', '@modelcontextprotocol', 'sdk', 'package.json'),
  ];
  for (const candidate of sdkCandidates) {
    try {
      const resolved = path.resolve(candidate);
      if (fs.existsSync(resolved)) {
        const mcpPkg = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
        mcpSdkAvailable = true;
        mcpSdkVersion = mcpPkg.version;
        break;
      }
    } catch { /* ignore */ }
  }
  if (!mcpSdkAvailable) {
    // Fallback: try require.resolve from Node's module paths.
    // Some SDK versions restrict subpath access via exports, so try
    // the main entry first and derive the package.json from it.
    try {
      const mainPath = require.resolve('@modelcontextprotocol/sdk');
      const sdkDir = mainPath.replace(/[/\\]dist[/\\].*$/, '').replace(/[/\\]src[/\\].*$/, '');
      const pkgPath = path.join(sdkDir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const mcpPkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        mcpSdkAvailable = true;
        mcpSdkVersion = mcpPkg.version;
      }
    } catch { /* not installed */ }
  }

  if (mcpServerExists && mcpSdkAvailable) {
    check('MCP server', 'PASS', `server.js found, SDK ${mcpSdkVersion}`);
  } else if (mcpServerExists && !mcpSdkAvailable) {
    check('MCP server', 'WARN', 'server.js found but @modelcontextprotocol/sdk not installed — run: cd <skill-dir> && npm install');
  } else if (!mcpServerExists && mcpSdkAvailable) {
    check('MCP server', 'WARN', `SDK installed (${mcpSdkVersion}) but server.js not found at expected path`);
  } else {
    check('MCP server', 'WARN', 'MCP not configured (optional — cursor-guard works without it)');
  }

  // 15. MCP version consistency (in-process vs on-disk)
  const diskPkgPath = path.resolve(__dirname, '../../../package.json');
  try {
    const diskPkg = JSON.parse(fs.readFileSync(diskPkgPath, 'utf-8'));
    const memPkg = require('../../../package.json');
    if (diskPkg.version !== memPkg.version) {
      check('MCP version', 'WARN',
        `running v${memPkg.version} but disk has v${diskPkg.version} — restart Cursor (Ctrl+Shift+P -> "Developer: Reload Window") to load the new version`);
    } else {
      check('MCP version', 'PASS', `v${memPkg.version}`);
    }
  } catch {
    // Not running inside MCP or package.json unreadable — skip silently
  }

  // Build summary
  let pass = 0, warn = 0, fail = 0;
  for (const c of checks) {
    if (c.status === 'PASS') pass++;
    else if (c.status === 'WARN') warn++;
    else if (c.status === 'FAIL') fail++;
  }

  return { checks, summary: { pass, warn, fail } };
}

module.exports = { runDiagnostics };
