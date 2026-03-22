'use strict';

const { color } = require('./utils');
const { runDiagnostics } = require('./core/doctor');

/**
 * Run doctor checks and print formatted output to console.
 * Thin CLI wrapper over core/doctor.js.
 */
function runDoctor(projectDir) {
  const { checks, summary } = runDiagnostics(projectDir);

  console.log('');
  console.log(color.cyan('=== Cursor Guard Doctor ==='));
  console.log(color.cyan(`  Target: ${projectDir}`));
  console.log('');

  for (const c of checks) {
    const tag = `[${c.status}]`;
    const line = c.detail ? `  ${tag} ${c.name} — ${c.detail}` : `  ${tag} ${c.name}`;
    switch (c.status) {
      case 'PASS': console.log(color.green(line)); break;
      case 'WARN': console.log(color.yellow(line)); break;
      case 'FAIL': console.log(color.red(line)); break;
      default: console.log(line);
    }
  }

  console.log('');
  console.log(color.cyan('=== Summary ==='));
  const summaryColor = summary.fail > 0 ? 'red' : summary.warn > 0 ? 'yellow' : 'green';
  console.log(color[summaryColor](`  PASS: ${summary.pass}  |  WARN: ${summary.warn}  |  FAIL: ${summary.fail}`));
  console.log('');
  if (summary.fail > 0) {
    console.log(color.red('  Fix FAIL items before relying on Cursor Guard.'));
  } else if (summary.warn > 0) {
    console.log(color.yellow('  Review WARN items to ensure everything works as expected.'));
  } else {
    console.log(color.green('  All checks passed. Cursor Guard is ready.'));
  }
  console.log('');

  return summary.fail > 0 ? 1 : 0;
}

module.exports = { runDoctor };
