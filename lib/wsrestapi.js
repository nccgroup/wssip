/*
GET /ws/[id]                     Is this connection active?
<- {'connected': true}
<- {'connected': false}

GET /cacert.pem -> CA PEM
GET /cacert.der -> CA DER
GET /privatekey.pem -> Private Key PEM
GET /privatekey.der -> Private Key DER
GET /publickey.pem -> Public Key PEM
GET /publickey.der -> Public Key DER

POST /ws/[id]/[client/server]/[message/ping/pong]/[ascii/binary]?log=true
-> data
<- {'success': true}
<- {'success': false, 'reason': 'Connection is not open'}
?log=true only for it to show in wssip
*/

const path = require('path');
const fs = require('fs');

module.exports = class WebSocketRestAPI {

  constructor(browserWindow, certDir) {
    this.BrowserWindow = browserWindow;
    this.certDir = certDir;
  }

  request(request, response) {
    let me = url.parse(`http://me${request.url}`);
    let responseBody, matcher;

    if(request.method === 'GET' && (
      me.pathname.indexOf('/cacert.') === 0 ||
      me.pathname.indexOf('/privatekey.') === 0 ||
      me.pathname.indexOf('/publickey.') === 0)
    ) {
      let _split = me.pathname.split('.');
      let name = _split[0], type = _split[1];

      if(type !== 'pem' && type !== 'der') {
        return this.sendOther(404, request, response);
      }

      if(name === '/cacert') {
        name = 'cacert.pem';
      } else if(name === '/privatekey') {
        name = 'ca_pri.pem';
      } else if(name === '/publickey') {
        name = 'ca_pub.pem';
      }

      try {
        responseBody = fs.readFileSync(path.join(this.certDir, name), 'utf8');

        if(type === 'der') {
          responseBody = Buffer.from(responseBody.split('-----')[2].split('\r\n').join(''), 'base64');
        }
      } catch(e) {
        return this.sendOther(500, request, response, 'text/plain', 'Could not retrieve certificate.\n\n' + e.stack);
      }

      response.writeHead(200, {
        'Content-Length': responseBody.length,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${name}"`
      });

      response.end(responseBody);

    } else if((matcher = me.pathname.match(/\/ws\/\d+(.*)/)) !== null) {
      let id = Number(matcher[0].replace('/ws/', ''));
      let options = matcher[1].split('/');

      //TODO: is ID active?

      if(request.method === 'GET' && options.length === 1 || (options.length === 2 && options[1] === '')) {
        //TODO: result of above
      } else if(request.method === 'POST' && this.doesMatchSendMessage(options)) {
        let sender = options[1];
        let datatype = options[2];
        let datamode = options[3];
        let log = me.query === 'log=true' || me.query === 'log=y';

        //TODO: send messsage
      } else {
        this.sendOther(404, request, response);
      }
    } else {
      this.sendOther(404, request, response);
    }
  }

  doesMatchSendMessage(opt) {
    return (
      (opt.length === 4 || opt.length === 5) &&
      ('client' in opt[1] || 'server' in opt[1]) &&
      ('message' in opt[2] || 'ping' in opt[2] || 'pong' in opt[2]) &&
      ('ascii' in opt[3] || 'text' in opt[3] || 'binary' in opt[3])
    );
  }

  sendOther(code, request, response, type = 'text/plain', msg = '') {
    if (code === 404 && msg === '') {
      msg = `404 Not Found (or Invalid): ${request.url}`;
    }

    response.writeHead(code, {
      'Content-Type': type,
      'Content-Length': msg.length
    });

    response.end(msg);
  }
}
