#!/usr/bin/env node

var web = (require('./argv')('.'))._.indexOf('web') !== -1;

require('child_process').spawn(
  web ? 'node' : require('electron'),
  [require.resolve(web ? './web' : './electron')].concat(process.argv.slice(2)),
  {stdio: 'inherit'}
).on('close', function(code) { process.exit(code); });
