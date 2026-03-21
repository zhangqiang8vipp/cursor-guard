#!/usr/bin/env node
'use strict';

const path = require('path');
const { parseArgs } = require('../lib/utils');

const args = parseArgs(process.argv);
const targetPath = args.path || '.';
const interval = parseInt(args.interval, 10) || 0;

const resolved = path.resolve(targetPath);

const { runBackup } = require('../lib/auto-backup');
runBackup(resolved, interval);
