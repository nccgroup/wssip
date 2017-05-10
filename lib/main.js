#!/usr/bin/env node

var _argv = process.argv.slice(2);
var web = _argv.indexOf('web') !== -1;

require('child_process').spawn(
  web ? 'node' : require('electron'),
  [require.resolve(web ? './web' : './electron')].concat(_argv),
  {stdio: 'inherit'}
).on('close', function(code) { process.exit(code); });
