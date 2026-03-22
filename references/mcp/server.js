#!/usr/bin/env node
'use strict';

const path = require('path');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

const { runDiagnostics } = require('../lib/core/doctor');
const { createGitSnapshot, createShadowCopy } = require('../lib/core/snapshot');
const { listBackups } = require('../lib/core/backups');
const { restoreFile, previewProjectRestore, executeProjectRestore } = require('../lib/core/restore');
const { runFixes } = require('../lib/core/doctor-fix');
const { getBackupStatus } = require('../lib/core/status');
const { getDashboard } = require('../lib/core/dashboard');
const { loadActiveAlert } = require('../lib/core/anomaly');

const { writeIntentContext } = require('../lib/utils');

const pkg = require('../../package.json');

// ── Alert injection helper ──────────────────────────────────────

function injectAlert(projectPath, result) {
  const alert = loadActiveAlert(projectPath);
  if (alert) {
    result._activeAlert = {
      type: alert.type,
      message: alert.recommendation || `${alert.fileCount} files changed in ${alert.windowSeconds}s`,
      timestamp: alert.timestamp,
      expiresAt: alert.expiresAt,
    };
  }
  return result;
}

// ── Server ──────────────────────────────────────────────────────

const server = new McpServer({
  name: 'cursor-guard',
  version: pkg.version,
});

// ── Tool 1: doctor ──────────────────────────────────────────────

server.tool(
  'doctor',
  'Run health checks on a project: environment, config, Git, backup refs, shadow copies, disk space. Read-only, safe to call anytime.',
  {
    path: z.string().describe('Absolute path to the project directory'),
  },
  async ({ path: projectPath }) => {
    const resolved = path.resolve(projectPath);
    const result = injectAlert(resolved, runDiagnostics(resolved));
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    };
  }
);

// ── Tool 2: list_backups ────────────────────────────────────────

server.tool(
  'list_backups',
  'List available backup/restore points from all sources (git refs, shadow copies). Read-only. Use before restore to find candidate versions.',
  {
    path: z.string().describe('Absolute path to the project directory'),
    file: z.string().optional().describe('Filter to a specific file (relative path)'),
    before: z.string().optional().describe('Only show backups before this time (e.g. "10 minutes ago", "2026-03-21T14:00:00")'),
    limit: z.number().optional().describe('Max results per source (default 20)'),
  },
  async ({ path: projectPath, file, before, limit }) => {
    const resolved = path.resolve(projectPath);
    const result = injectAlert(resolved, listBackups(resolved, { file, before, limit }));
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    };
  }
);

// ── Tool 3: snapshot_now ────────────────────────────────────────

server.tool(
  'snapshot_now',
  'Create an immediate backup snapshot of the current project state. Use before risky operations to preserve a restore point.',
  {
    path: z.string().describe('Absolute path to the project directory'),
    strategy: z.enum(['git', 'shadow', 'both']).optional().describe('Backup strategy (default: from config, or "git")'),
    message: z.string().optional().describe('Custom commit message for git snapshot'),
    scope: z.enum(['protected', 'all']).optional().describe('Snapshot scope: "protected" = only files matching protect patterns (default when protect is configured); "all" = all files regardless of protect config'),
    intent: z.string().optional().describe('Why this snapshot is being created — describe the operation about to happen (e.g. "refactoring auth middleware to use JWT")'),
    agent: z.string().optional().describe('AI model identifier (e.g. "claude-4-opus")'),
    session: z.string().optional().describe('Conversation or session ID for audit trail'),
  },
  async ({ path: projectPath, strategy, message, scope, intent, agent, session }) => {
    const resolved = path.resolve(projectPath);
    const { loadConfig } = require('../lib/utils');
    const { cfg } = loadConfig(resolved);

    if (scope === 'all') {
      cfg.protect = [];
    } else if (scope === 'protected' && cfg.protect.length === 0) {
      // "protected" requested but no protect patterns configured — snapshot all
      // (no way to filter without patterns)
    }

    const effectiveStrategy = strategy || cfg.backup_strategy || 'git';
    const results = {};

    if (effectiveStrategy === 'git' || effectiveStrategy === 'both') {
      const context = { trigger: 'manual' };
      if (intent) context.intent = intent;
      if (agent) context.agent = agent;
      if (session) context.session = session;

      if (intent || agent || session) {
        writeIntentContext(resolved, { intent, agent, session });
      }

      results.git = createGitSnapshot(resolved, cfg, {
        branchRef: 'refs/guard/snapshot',
        message: message || `guard: manual snapshot ${new Date().toISOString()}`,
        context,
      });
    }

    if (effectiveStrategy === 'shadow' || effectiveStrategy === 'both') {
      results.shadow = createShadowCopy(resolved, cfg);
    }

    injectAlert(resolved, results);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(results, null, 2),
      }],
    };
  }
);

// ── Tool 4: restore_file ────────────────────────────────────────

server.tool(
  'restore_file',
  'Restore a single file from a backup source (git commit/ref or shadow copy timestamp). By default, preserves the current version in a pre-restore snapshot before restoring.',
  {
    path: z.string().describe('Absolute path to the project directory'),
    file: z.string().describe('Relative path to the file to restore'),
    source: z.string().describe('Backup source: git commit hash, ref name, or shadow copy timestamp (e.g. "20260321_143205")'),
    preserve_current: z.boolean().optional().describe('Create pre-restore snapshot before restoring (default true)'),
  },
  async ({ path: projectPath, file, source, preserve_current }) => {
    const resolved = path.resolve(projectPath);
    const result = injectAlert(resolved, restoreFile(resolved, file, source, {
      preserveCurrent: preserve_current,
    }));
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    };
  }
);

// ── Tool 5: restore_project ─────────────────────────────────────

server.tool(
  'restore_project',
  'Preview or execute a full project restore to a given backup point. In preview mode (default), shows affected files (including untracked) without changes. In execute mode, creates a pre-restore snapshot then restores all tracked files and cleans untracked files.',
  {
    path: z.string().describe('Absolute path to the project directory'),
    source: z.string().describe('Backup source: git commit hash or ref name'),
    preview: z.boolean().optional().describe('If true (default), only show what would change. If false, execute the restore.'),
    preserve_current: z.boolean().optional().describe('Create pre-restore snapshot before executing (default true, only used when preview=false)'),
    clean_untracked: z.boolean().optional().describe('Remove untracked non-ignored files after restore (default true, only used when preview=false)'),
  },
  async ({ path: projectPath, source, preview, preserve_current, clean_untracked }) => {
    const resolved = path.resolve(projectPath);

    if (preview !== false) {
      const result = injectAlert(resolved, previewProjectRestore(resolved, source));
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    const result = injectAlert(resolved, executeProjectRestore(resolved, source, {
      preserveCurrent: preserve_current,
      cleanUntracked: clean_untracked,
    }));
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool 6: doctor_fix ──────────────────────────────────────────

server.tool(
  'doctor_fix',
  'Auto-fix common configuration and environment issues: create missing config, init git repo, add .cursor-guard-backup/ to .gitignore, remove stale lock files, fix strategy mismatch. Each fix is idempotent. Use dry_run=true to preview without changes.',
  {
    path: z.string().describe('Absolute path to the project directory'),
    dry_run: z.boolean().optional().describe('If true, report what would be fixed without modifying anything (default false)'),
  },
  async ({ path: projectPath, dry_run }) => {
    const resolved = path.resolve(projectPath);
    const result = injectAlert(resolved, runFixes(resolved, { dryRun: !!dry_run }));
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool 7: backup_status ───────────────────────────────────────

server.tool(
  'backup_status',
  'Get comprehensive backup system status: watcher running/stale, last backup time per strategy, configured strategy and retention, guard ref counts, disk space. Read-only, safe to call anytime.',
  {
    path: z.string().describe('Absolute path to the project directory'),
  },
  async ({ path: projectPath }) => {
    const resolved = path.resolve(projectPath);
    const result = injectAlert(resolved, getBackupStatus(resolved));
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool 8: dashboard ───────────────────────────────────────────

server.tool(
  'dashboard',
  'Get a comprehensive backup health dashboard: strategy, last backup time, backup counts, disk usage breakdown, protection scope, health assessment, and active alerts. Combines status + analytics in one call.',
  {
    path: z.string().describe('Absolute path to the project directory'),
  },
  async ({ path: projectPath }) => {
    const resolved = path.resolve(projectPath);
    const result = injectAlert(resolved, getDashboard(resolved));
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool 9: alert_status ────────────────────────────────────────

server.tool(
  'alert_status',
  'Check if there is an active change-velocity alert (V4 proactive detection). Returns the alert details if active, or confirms no alert. Read-only, safe to call anytime.',
  {
    path: z.string().describe('Absolute path to the project directory'),
  },
  async ({ path: projectPath }) => {
    const resolved = path.resolve(projectPath);
    const alert = loadActiveAlert(resolved);
    const result = alert
      ? { active: true, alert }
      : { active: false, message: 'No active alerts' };
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool 10: set_intent ──────────────────────────────────────────

server.tool(
  'set_intent',
  'Declare the current operation intent BEFORE making code changes. The watcher will attach this context to the next auto-backup, so users can see WHY a backup was created. Call this before any file edits. Context expires after 10 minutes.',
  {
    path: z.string().describe('Absolute path to the project directory'),
    intent: z.string().describe('What you are about to do (e.g. "refactoring calculator.js to use class syntax", "adding input validation to login form")'),
    agent: z.string().optional().describe('AI model identifier (e.g. "claude-4-opus")'),
    session: z.string().optional().describe('Conversation or session ID'),
  },
  async ({ path: projectPath, intent, agent, session }) => {
    const resolved = path.resolve(projectPath);
    const ok = writeIntentContext(resolved, { intent, agent, session });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(ok
          ? { status: 'ok', intent, ttl: '10m' }
          : { status: 'error', error: 'Failed to write intent context (is this a git repo?)' },
          null, 2),
      }],
    };
  }
);

// ── Start ───────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('cursor-guard MCP server failed to start:', err);
  process.exit(1);
});
