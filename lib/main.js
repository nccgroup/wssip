#!/usr/bin/env node

const {version} = require('../package.json'),
      argv = require('./argv')(version);

if(argv._.includes('web')) {
  require('./web');
} else {
  require('child_process').spawn(
    require('electron'),
    [require.resolve('./electron')].concat(process.argv.slice(2)),
    {stdio: 'inherit'}
  )
  .on('close', (code) => process.exit(code));
}
