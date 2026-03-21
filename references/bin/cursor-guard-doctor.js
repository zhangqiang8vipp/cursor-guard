#!/usr/bin/env node
'use strict';

const path = require('path');
const { parseArgs } = require('../lib/utils');

const args = parseArgs(process.argv);
const targetPath = args.path || '.';
const resolved = path.resolve(targetPath);

const { runDoctor } = require('../lib/guard-doctor');
const exitCode = runDoctor(resolved);
process.exit(exitCode);
