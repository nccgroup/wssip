#!/usr/bin/env node

const path = require('path').join,
      {version} = require(path(__dirname, '..', 'package.json')),
      argv = require(path(__dirname, 'argv.js'))(version);

if(argv._.includes('web')) {
  require(path(__dirname, 'web.js'));
} else {
  require('child_process').spawn(
    require('electron'),
    [path(__dirname, 'electron.js')].concat(process.argv.slice(2)),
    {stdio: 'inherit'}
  )
  .on('close', (code) => process.exit(code));
}
