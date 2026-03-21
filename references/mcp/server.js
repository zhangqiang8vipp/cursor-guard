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

const pkg = require('../../package.json');

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
    const result = runDiagnostics(resolved);
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
    const result = listBackups(resolved, { file, before, limit });
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
  },
  async ({ path: projectPath, strategy, message }) => {
    const resolved = path.resolve(projectPath);
    const { loadConfig } = require('../lib/utils');
    const { cfg } = loadConfig(resolved);

    const effectiveStrategy = strategy || cfg.backup_strategy || 'git';
    const results = {};

    if (effectiveStrategy === 'git' || effectiveStrategy === 'both') {
      results.git = createGitSnapshot(resolved, cfg, {
        branchRef: 'refs/guard/snapshot',
        message: message || `guard: manual snapshot ${new Date().toISOString()}`,
      });
    }

    if (effectiveStrategy === 'shadow' || effectiveStrategy === 'both') {
      results.shadow = createShadowCopy(resolved, cfg);
    }

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
    const result = restoreFile(resolved, file, source, {
      preserveCurrent: preserve_current,
    });
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
  'Preview or execute a full project restore to a given backup point. In preview mode (default), shows affected files without changes. In execute mode, creates a pre-restore snapshot then restores all files.',
  {
    path: z.string().describe('Absolute path to the project directory'),
    source: z.string().describe('Backup source: git commit hash or ref name'),
    preview: z.boolean().optional().describe('If true (default), only show what would change. If false, execute the restore.'),
    preserve_current: z.boolean().optional().describe('Create pre-restore snapshot before executing (default true, only used when preview=false)'),
  },
  async ({ path: projectPath, source, preview, preserve_current }) => {
    const resolved = path.resolve(projectPath);

    if (preview !== false) {
      const result = previewProjectRestore(resolved, source);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    const result = executeProjectRestore(resolved, source, {
      preserveCurrent: preserve_current,
    });
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
    const result = runFixes(resolved, { dryRun: !!dry_run });
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
    const result = getBackupStatus(resolved);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
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
