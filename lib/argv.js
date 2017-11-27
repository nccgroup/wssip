module.exports = (version='') => {
  const path = require('path').join;
  let tmpdir;

  try {
    tmpdir = require('electron').app.getPath('userData');
  } catch(e) {
    tmpdir = path(require('os').tmpdir(), '.wssip-cache');
  }

  if(version == '') {
    version = require(path(__dirname, '..', 'package.json')).version;
  }

  return require('yargs')
      .usage('Usage: wssip [options]')
      .command(['app', '*'], 'Use Electron to display WSSiP UI')
      .command('web', 'Use Electron-less web browser (coming soon)')
      .describe('h', 'Hostname for the listening proxy (overrides configured if set)')
      .string('h')
      .alias('h', 'host')
      .describe('p', 'Port for the listening proxy (overrides configured if set)')
      .alias('p', 'port')
      .number('port')
      .boolean('s')
      .describe('s', 'Automatically start proxy on application launch')
      .alias('s', 'start')
      .string('u')
      .describe('u', 'Use upstream proxy (URL starting with http://, https://, socks5:// etc)')
      .alias('u', 'upstream')
      .describe('t', 'Timeout (in seconds) before connection fails')
      .number('t')
      .alias('t', 'timeout')
      .boolean('d')
      .describe('d', 'Disable per-message deflate')
      .alias('d', 'disableDeflate')
      .boolean('devtools')
      .describe('devtools', 'Open up Chromium Dev Tools on application start (if Electron)')
      .describe('tmp', 'Temporary directory for MitM certificates and configuration files')
      .string('tmp')
      .default('tmp', tmpdir)
      .boolean('rejectUnauthorized')
      .describe('rejectUnauthorized', 'Reject all unauthorized certificates upon connection')
      .help('help', 'Show help menu')
      .version(version)
      .alias('version', 'v')
      .example('wssip -p 8081 -s', 'listen on localhost:8081 and autostart the proxy')
      .example('wssip --timeout 30', 'wait 30 seconds for page load before stopping')
      .example('wssip --tmp=../sampledirectory', 'set configuration and certificate folder to ../sampledirectory')
      .example('wssip -u=http://localhost:8080/', 'listen on localhost:8081 and use localhost:8080 as the upstream proxy')
      .epilog('For more information, go to https://github.com/nccgroup/wssip')
      .wrap(null)
      .argv;
}
