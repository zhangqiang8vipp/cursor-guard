#!/usr/bin/env node
'use strict';

const path = require('path');
const { parseArgs } = require('../lib/utils');

const args = parseArgs(process.argv);

if (args.help || args.h) {
  console.log(`Usage: cursor-guard-backup [options]

Options:
  --path <dir>       Project directory to watch (default: current dir)
  --interval <sec>   Override backup interval in seconds
  --dashboard [port] Start dashboard server alongside watcher (default port: 3120)
  --help, -h         Show this help message
  --version, -v      Show version number`);
  process.exit(0);
}

if (args.version || args.v) {
  const pkg = require('../../package.json');
  console.log(pkg.version);
  process.exit(0);
}

const targetPath = args.path || '.';
const interval = parseInt(args.interval, 10) || 0;
const resolved = path.resolve(targetPath);

const opts = {};
if (args.dashboard !== undefined) {
  opts.dashboardPort = (typeof args.dashboard === 'string' && /^\d+$/.test(args.dashboard))
    ? parseInt(args.dashboard, 10)
    : 3120;
}

const { runBackup } = require('../lib/auto-backup');
runBackup(resolved, interval, opts);
