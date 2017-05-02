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
      .alias('version', 'v')
      .version(() => version)
      .command(['app', '*'], 'Use Electron to display WSSiP UI')
      .command('web', 'Use Electron-less web browser (coming soon)')
      .boolean('devtools')
      .describe('devtools', 'Open up Chromium Dev Tools on application start')
      .describe('host', 'Hostname for the listening proxy (overrides configured if set)')
      .string('host')
      .describe('p', 'Port for the listening proxy (overrides configured if set)')
      .alias('p', 'port')
      .number('port')
      .boolean('s')
      .describe('s', 'Automatically start proxy on application launch')
      .alias('s', 'start')
      .boolean('u')
      .describe('u', 'Enable upstream proxy (with --upstreamHost and --upstreamPort)')
      .alias('u', 'upstream')
      .describe('upstreamHost', 'Upstream hostname for the listening proxy')
      .string('upstreamHost')
      .describe('upstreamPort', 'Upstream port for the listening proxy')
      .number('upstreamPort')
      .describe('t', 'Timeout (in seconds) before connection fails')
      .number('t')
      .alias('t', 'timeout')
      .describe('tmp', 'Temporary directory for MitM certificates and configuration files')
      .string('tmp')
      .default('tmp', tmpdir)
      .boolean('rejectUnauthorized')
      .describe('rejectUnauthorized', 'Reject all unauthorized certificates upon connection')
      .boolean('disableDeflate')
      .describe('disableDeflate', 'Disable per-message deflate')
      .help('h', 'Show help menu')
      .alias('h', 'help')
      .example('wssip -p 8081 -s', 'listen on 127.0.0.1:8081 and autostart the proxy')
      .example('wssip --timeout 30', 'wait 30 seconds for page load before stopping')
      .example('wssip --tmp=../sampledirectory', 'set configuration and certificate folder to ../sampledirectory')
      .epilog('For more information, go to https://github.com/nccgroup/wssip')
      .wrap(null)
      .argv;
}
