# mitmengine

Man-in-the-middle class written for [WSSiP](https://npmjs.com/package/wssip). Only requires `node-forge` for X509 signing, and optionally requires `debug` (for debugging), `node-libcurl` and/or `tunnel-agent` (for upstream services).

## Example

~~~javascript
const mitmengine = require('mitmengine');

let mitmInstance = new mitmengine({
  hostname: '127.0.0.1',
  port: 8080
});

mitmInstance.listen();
~~~

mitmengine will by default use `http.request()` and `https.request()` to retrieve data from web servers as a part of one of the components. If `node-libcurl` is installed, `useCurl` will by default be set to `true` but you can set this to `false`. `node-libcurl` support is there as an alternative for requesting pages as some web servers react oddly to .request() calls for some odd reason.

To use the class, possible options and functions include:

### new mitmengine([options])

Create a new instance and call `mitmengine.setOptions(options)`.

### mitmengine.setOptions([options])

- `options` {Object}
   - `hostname` {String} Hostname of the listening proxy. Default is `localhost`.
   - `port` {Number} Port number of the listening proxy. 0-65535. The number 0 will result in Node.js finding a free port to listen on and set instance.port to that value. Default is `0`.
   - `useHTTPS` {Boolean} Intercepting proxy should listen over HTTPS instead of HTTP. Default is `false`.
   - `uaId` {String} If another application is using this and wants to modify the User-Agent, enter in the identifier here. User Agent is "name/version". If find-up is installed, defaults to `wssip_mitmengine/x.x.x` where x.x.x is the nearest package version from package.json, otherwise defaults to `wssip_mitmengine/?`.
   - `debugName` {String} If "debug" package is installed, use this identifier to debug. Default is "mitmengine". WSSiP sets this to `wssip:mitmengine`.
   - `useCurl` {Boolean} Disable curl even if node-libcurl is installed, or force curl enable. Not recommended to change. Default is `false`.
   - `useUpstreamProxy` {Boolean} Use an upstream proxy for all requests. For attaching processes, does not take effect on UPGRADE or CONNECT requests. Does not enable even if set to `true` if neither `node-libcurl` nor `tunnel-agent` is installed. Default is `false`.
   - `proxyUrl` {String} Proxy URL. Supports authorization. If `tunnel-agent` is installed, this will only accept http:// and https:// URLs. If `node-libcurl` is installed, it'll additionally support socks4://, socks5://, socks4a:// and socks5h://. Default is blank.
   - `timeout` {Number} Number of seconds before connection and request timeout. 0 means no timeout. Default is `0`.
   - `rejectUnauthorized` {Boolean} Reject self-signed and invalidated certificates. Default is `false`.
   - `tmpDir` {String} Path to directory to write to for storing mitmengine's certificates. Default is `$tmpdir/.mitm-cache`
   - `requestHandler` {Boolean|Function} If navigating to the URL http://mitm/, it'll signal to forward both request and response headers to this function.
      - `clientRequest` {http.IncomingMessage}
      - `clientResponse` {http.ServerResponse}
      - `data` {String} Post data, if available. Default is blank.
   - `tlsDefaultExtensions` {Object} node-forge specific default extensions.
   - `tlsDefaultServerExtensions` {Object} node-forge specific server default extensions.
   - `tlsDefaultIssuer` {Object} node-forge specific issuer object.
   - `eraseConnectionHeader` {Boolean} Rename "Connection: close" to "Connection: \_". For web servers that react oddly to Connection: close headers. Default is `false`
   - `onRequestCurl` {Function} Callback function for modifying request information, e.g. headers. Curl only.
      - `queuePosition` {Number} Position in queue relative to other requests.
      - `method` {String} HTTP/S method.
      - `url` {String} Full URL of the request.
      - `headers` {Array} List of header names and values, e.g. `X-Frame-Options: DENY`
      - `postFields` {String} String of POST request names and values, e.g. `a=b&c=d`
   - `onRequestNode` {Function} Callback function for modifying request options, e.g. headers and agent. Will not call if Curl is in use.
      - `queuePosition` {Number} Position in queue relative to other requests.
      - `options` {Object} Object with `hostname`, `port`, `agent` meant for `http.request`.
   - `onRequestData` {Function} Callback function for modifying POST fields, in chunks. Will not call if Curl is in use.
      - `queuePosition` {Number} Position in queue relative to other requests.
      - `chunk` {Buffer} Chunk of POST data.
   - `onRequestEnd` {Function} Callback function signifying the end of request POST fields. Will not call if Curl is in use.
      - `queuePosition` {Number} Position in queue relative to other requests.
      - `chunk` {Buffer} Chunk of POST data, if any.
   - `onResponseHeaders` {Function} Callback function for modifying response headers.
      - `queuePosition` {Number} Position in queue relative to other requests.
      - `code` {Number} HTTP Response Code, e.g. `404`
      - `reason` {String} HTTP Response Reason, e.g. `Not Found`
      - `headers` {Object} HTTP Response Headers.
   - `onResponseData` {Function} Callback function for modifying response data. In chunks.
      - `queuePosition` {Number} Position in queue relative to other requests.
      - `chunk` {Buffer} Response body.
   - `onResponseEnd` {Function} Callback function for final chunk, if there is.
      - `queuePosition` {Number} Position in queue relative to other requests.
      - `chunk` {Buffer} Response body.
   - `onUpgrade` {Function} Callback function for UPGRADE requests.
      - `req` {http.ClientRequest} Arguments for the HTTP request.
      - `socket` {net.Socket} Network socket between the server and client
      - `head` {Buffer} The first packet of the upgraded stream (may be empty).
   - `onRootCAGeneration` {Function} Callback function for Root CA generation in node-forge.
      - `certificate` {Object} Certificate information.
      - `privateKey` {Object} Private key object.
   - `onServerKeyGeneration` {Function} Callback function for self-signed certificate server generation in node-forge.
      - `hostIdentifier` {String} Hostname and port in `hostname:port` format, e.g. `google.com:443`
      - `certificate` {Object} Certificate information.
      - `privateKey` {Object} Private key object.
      - `signingKey` {Object} Root CA private key used to sign the server certificate.

Set intercepting proxy server options.

### mitmengine.setProxyTimeout(seconds)

- `seconds` {Number}

Number of seconds to set for a timeout on page load and server requests.

### mitmengine.listenSync([newRootCertificate])

- `newRootCertificate` {Boolean} Reset all master keys. In the future, this will delete subkeys as well. Default is false.

Synchronous version of `mitmengine.listen()`.

### mitmengine.listen([newRootCertificate])

- `newRootCertificate` {Boolean} Reset all master keys. In the future, this will delete subkeys as well. Default is false.

Begin accepting connections on the specified port and hostname. Returns a Promise and sends a resolve when the server is listening, and reject when there is an error.

### mitmengine.endSync()

Synchronous version of `mitmengine.end()`.

### mitmengine.end()

End all connections to the intercepting proxy and all sub-servers. Returns a Promise and sends a resolve when all connections are closed, and reject when there is an error closing.

### Event: 'new_root_certificate'

- `certificatePEM` {String}
- `privateKeyPEM` {String}
- `publicKeyPEM` {String}

Emitted when a new root CA has been generated and stored.

### Event: 'new_server_keys'

- `hostIdentifier` {String}
- `certificatePEM` {String}
- `privateKeyPEM` {String}
- `publicKeyPEM` {String}

Emitted when a certificate has been generated and signed for a specific SSL/TLS server.

### Event: 'close_sub'

- `proxy` {http.Server}
- `serverUrl` {Object}
   - `hostname` {String}
   - `port` {Number}
   - `host` {String}
   - `prefix` {String}

Emitted when a sub-server opened for a CONNECT request has been closed.

### Event: 'listen_pre_sub'

- `proxy` {http.Server}
- `serverUrl` {Object}
   - `hostname` {String}
   - `port` {Number}
   - `host` {String}
   - `prefix` {String}

Emitted when a sub-server is created for a CONNECT request and about to listen. This is primarily where things like WebSocket servers can attach themselves.

### Event: 'listen_post_sub'

- `proxy` {http.Server}
- `serverUrl` {Object}
   - `hostname` {String}
   - `port` {Number}
   - `host` {String}
   - `prefix` {String}
- `address` {String}
- `port` {Number}

Emitted when a sub-server successfully listens.

### Event: 'response_data'

- `queuePosition` {Number}
- `chunk` {Buffer}

Emitted when 'data' is emitted from the proxy.

### Event: 'response_end'

- `queuePosition` {Number}
- `chunk` {Buffer|Null}

Emitted when 'end' is emitted from the proxy.

### Event: 'response_headers'

- `queuePosition` {Number}
- `code` {Number}
- `reason` {String}
- `headers` {Object}

Emitted when headers are received from the server.

### Event: 'request_new_curl'

- `queuePosition` {Number}
- `method` {String}
- `url` {String}
- `httpVersion` {String}
- `headers` {Object}
- `postField` {String}

Emitted when a HTTP/S request comes in via the proxy and does the request via Curl.

### Event: 'request_new_node'

- `queuePosition` {Number}
- `options` {Object}
   - `hostname` {String}
   - `port` {Number}
   - `method` {String}
   - `headers` {Object}
   - `agent` {http.Agent}
   - `key` {String}
   - `cert` {String}

Emitted when a HTTP/S requests comes in via the proxy and does the request via http/s.request().

### Event: 'error'

- `where` {String}
- `code` {String}
- `error` {Error}

Emitted when an error is thrown.

### Event: 'listen_pre'

- `proxy` {http.Server}

Emitted when the main proxy server is about to listen.

### Event: 'listen_post'

- `proxy` {http.Server}

Emitted when the main proxy server has successfully listens.

### Event: 'close'

Emitted when the main proxy server and sub-servers close connections.
