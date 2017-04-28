#!/usr/bin/env node

require('child_process').spawn(
  require('electron'),
  [require.resolve('./electron')].concat(process.argv.slice(2)),
  {stdio: 'inherit'}
).on('close', code => process.exit(code));
