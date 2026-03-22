#!/usr/bin/env node
'use strict';

const path = require('path');
const { parseArgs } = require('../lib/utils');

const args = parseArgs(process.argv);

if (args.help || args.h) {
  console.log(`Usage: cursor-guard-doctor [options]

Options:
  --path <dir>       Project directory to check (default: current dir)
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
const resolved = path.resolve(targetPath);

const { runDoctor } = require('../lib/guard-doctor');
const exitCode = runDoctor(resolved);
process.exit(exitCode);
