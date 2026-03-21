'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  loadConfig, gitAvailable, git, isGitRepo, gitDir,
} = require('../utils');

/**
 * Auto-fix common configuration and environment issues detected by doctor.
 *
 * Each fix is idempotent — running it when nothing is wrong is a no-op.
 * Returns a list of actions taken (or skipped).
 *
 * @param {string} projectDir
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun=false] - If true, report what would be fixed without modifying anything.
 * @returns {{ actions: Array<{name: string, status: 'fixed'|'skipped'|'error', detail: string}>, totalFixed: number }}
 */
function runFixes(projectDir, opts = {}) {
  const dryRun = !!opts.dryRun;
  const actions = [];
  let totalFixed = 0;

  function action(name, status, detail) {
    actions.push({ name, status, detail });
    if (status === 'fixed') totalFixed++;
  }

  const hasGit = gitAvailable();
  const repo = hasGit && isGitRepo(projectDir);

  // Fix 1: Create .cursor-guard.json with defaults if missing
  const configPath = path.join(projectDir, '.cursor-guard.json');
  if (!fs.existsSync(configPath)) {
    const examplePath = path.resolve(__dirname, '../../cursor-guard.example.json');
    if (fs.existsSync(examplePath)) {
      if (dryRun) {
        action('Create config', 'skipped', 'would copy cursor-guard.example.json → .cursor-guard.json (dry-run)');
      } else {
        try {
          fs.copyFileSync(examplePath, configPath);
          action('Create config', 'fixed', 'copied cursor-guard.example.json → .cursor-guard.json');
        } catch (e) {
          action('Create config', 'error', e.message);
        }
      }
    } else {
      const defaultConfig = {
        protect: [],
        ignore: ["node_modules/**", "dist/**", "*.log"],
        backup_strategy: "git",
        auto_backup_interval_seconds: 60,
        pre_restore_backup: "always",
        retention: { mode: "days", days: 30 },
      };
      if (dryRun) {
        action('Create config', 'skipped', 'would create .cursor-guard.json with defaults (dry-run)');
      } else {
        try {
          fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2) + '\n');
          action('Create config', 'fixed', 'created .cursor-guard.json with defaults');
        } catch (e) {
          action('Create config', 'error', e.message);
        }
      }
    }
  } else {
    action('Create config', 'skipped', '.cursor-guard.json already exists');
  }

  // Fix 2: Init git repo if missing
  if (hasGit && !repo) {
    if (dryRun) {
      action('Init Git repo', 'skipped', 'would run git init (dry-run)');
    } else {
      try {
        execFileSync('git', ['init'], { cwd: projectDir, stdio: 'pipe' });
        // Ensure git commit works even without global user config
        try { execFileSync('git', ['config', 'user.email'], { cwd: projectDir, stdio: 'pipe' }); }
        catch { execFileSync('git', ['config', 'user.email', 'cursor-guard@local'], { cwd: projectDir, stdio: 'pipe' }); }
        try { execFileSync('git', ['config', 'user.name'], { cwd: projectDir, stdio: 'pipe' }); }
        catch { execFileSync('git', ['config', 'user.name', 'cursor-guard'], { cwd: projectDir, stdio: 'pipe' }); }
        // Ensure .gitignore contains backup dir + secrets patterns BEFORE git add
        const { cfg: initCfg } = loadConfig(projectDir);
        const gitignorePath = path.join(projectDir, '.gitignore');
        const existingIgnore = fs.existsSync(gitignorePath)
          ? fs.readFileSync(gitignorePath, 'utf-8')
          : '';
        const missingPatterns = [];
        if (!existingIgnore.includes('.cursor-guard-backup')) {
          missingPatterns.push('# cursor-guard shadow copies', '.cursor-guard-backup/', '');
        }
        const missingSecrets = initCfg.secrets_patterns.filter(p => !existingIgnore.includes(p));
        if (missingSecrets.length > 0) {
          missingPatterns.push('# Secrets (cursor-guard defaults)', ...missingSecrets, '');
        }
        if (missingPatterns.length > 0) {
          const separator = existingIgnore && !existingIgnore.endsWith('\n') ? '\n' : '';
          const block = separator + missingPatterns.join('\n');
          if (existingIgnore) {
            fs.appendFileSync(gitignorePath, block);
          } else {
            fs.writeFileSync(gitignorePath, block);
          }
        }
        execFileSync('git', ['add', '-A'], { cwd: projectDir, stdio: 'pipe' });
        execFileSync('git', ['commit', '-m', 'guard: initial snapshot', '--no-verify', '--allow-empty'], {
          cwd: projectDir, stdio: 'pipe',
        });
        action('Init Git repo', 'fixed', 'initialized git repo with .gitignore and initial commit');
      } catch (e) {
        action('Init Git repo', 'error', e.message);
      }
    }
  } else if (repo) {
    action('Init Git repo', 'skipped', 'already a git repo');
  } else {
    action('Init Git repo', 'skipped', 'git not available');
  }

  // Fix 3: Add .cursor-guard-backup/ to .gitignore
  const effectiveRepo = hasGit && isGitRepo(projectDir);
  if (effectiveRepo) {
    const ignored = git(['check-ignore', '.cursor-guard-backup/test'], { cwd: projectDir, allowFail: true });
    if (!ignored) {
      const gitignorePath = path.join(projectDir, '.gitignore');
      const entry = '\n# cursor-guard shadow copies\n.cursor-guard-backup/\n';
      if (dryRun) {
        action('Gitignore backup dir', 'skipped', 'would add .cursor-guard-backup/ to .gitignore (dry-run)');
      } else {
        try {
          if (fs.existsSync(gitignorePath)) {
            const content = fs.readFileSync(gitignorePath, 'utf-8');
            if (!content.includes('.cursor-guard-backup')) {
              fs.appendFileSync(gitignorePath, entry);
              action('Gitignore backup dir', 'fixed', 'appended .cursor-guard-backup/ to .gitignore');
            } else {
              action('Gitignore backup dir', 'skipped', 'entry exists but git check-ignore failed — may need manual fix');
            }
          } else {
            fs.writeFileSync(gitignorePath, entry.trimStart());
            action('Gitignore backup dir', 'fixed', 'created .gitignore with .cursor-guard-backup/ entry');
          }
        } catch (e) {
          action('Gitignore backup dir', 'error', e.message);
        }
      }
    } else {
      action('Gitignore backup dir', 'skipped', '.cursor-guard-backup/ already git-ignored');
    }
  } else {
    action('Gitignore backup dir', 'skipped', 'not a git repo');
  }

  // Fix 4: Create .cursor-guard-backup/ directory if shadow strategy
  const { cfg } = loadConfig(projectDir);
  if (cfg.backup_strategy === 'shadow' || cfg.backup_strategy === 'both') {
    const backupDir = path.join(projectDir, '.cursor-guard-backup');
    if (!fs.existsSync(backupDir)) {
      if (dryRun) {
        action('Create backup dir', 'skipped', 'would create .cursor-guard-backup/ (dry-run)');
      } else {
        try {
          fs.mkdirSync(backupDir, { recursive: true });
          action('Create backup dir', 'fixed', 'created .cursor-guard-backup/');
        } catch (e) {
          action('Create backup dir', 'error', e.message);
        }
      }
    } else {
      action('Create backup dir', 'skipped', '.cursor-guard-backup/ already exists');
    }
  }

  // Fix 5: Remove stale lock file
  const gDir = effectiveRepo ? gitDir(projectDir) : null;
  const lockFile = gDir
    ? path.join(gDir, 'cursor-guard.lock')
    : path.join(projectDir, '.cursor-guard-backup', 'cursor-guard.lock');
  if (fs.existsSync(lockFile)) {
    let stale = false;
    try {
      const content = fs.readFileSync(lockFile, 'utf-8').trim();
      const pidMatch = content.match(/pid[=:\s]+(\d+)/i);
      if (pidMatch) {
        const pid = parseInt(pidMatch[1], 10);
        try { process.kill(pid, 0); } catch { stale = true; }
      } else {
        const stat = fs.statSync(lockFile);
        if (Date.now() - stat.mtimeMs > 300000) stale = true;
      }
    } catch {
      stale = true;
    }

    if (stale) {
      if (dryRun) {
        action('Remove stale lock', 'skipped', 'would remove stale cursor-guard.lock (dry-run)');
      } else {
        try {
          fs.unlinkSync(lockFile);
          action('Remove stale lock', 'fixed', 'removed stale cursor-guard.lock');
        } catch (e) {
          action('Remove stale lock', 'error', e.message);
        }
      }
    } else {
      action('Remove stale lock', 'skipped', 'lock file is active — another instance is running');
    }
  }

  // Fix 6: Fix config strategy mismatch — if strategy is git/both but no repo
  // (Already handled by Fix 2 above — this reports if the combo is still wrong)
  const { cfg: freshCfg } = loadConfig(projectDir);
  const freshRepo = hasGit && isGitRepo(projectDir);
  if ((freshCfg.backup_strategy === 'git' || freshCfg.backup_strategy === 'both') && !freshRepo) {
    if (dryRun) {
      action('Fix strategy mismatch', 'skipped', "would switch backup_strategy to 'shadow' since no git repo (dry-run)");
    } else {
      try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(raw);
        parsed.backup_strategy = 'shadow';
        fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2) + '\n');
        action('Fix strategy mismatch', 'fixed', "changed backup_strategy to 'shadow' (no git repo available)");
      } catch (e) {
        action('Fix strategy mismatch', 'error', e.message);
      }
    }
  }

  return { actions, totalFixed };
}

module.exports = { runFixes };
