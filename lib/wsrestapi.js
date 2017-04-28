/*
GET /[id]                     Is this connection active?
<- {'connected': true}
<- {'connected': false}

GET /cacert.pem -> CA PEM
GET /cacert.der -> CA DER
GET /privatekey.pem -> Private Key PEM
GET /privatekey.der -> Private Key DER
GET /publickey.pem -> Public Key PEM
GET /publickey.der -> Public Key DER

POST /[id]/[client/server]/[message/ping/pong]/[ascii/binary]?log=true
-> data
<- {'success': true}
<- {'success': false, 'reason': 'Connection is not open'}
?log=true only for it to show in wssip
*/

module.exports = class WebSocketRestAPI {

  constructor(browserWindow, certDir) {
    this.BrowserWindow = browserWindow;
    this.certDir = certDir;
  }

  //---

  request(method, path, response) {
    if(method === 'GET') {
      if(path === '/cacert.pem') {

      }
    }
  }

}
