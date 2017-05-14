# WSSiP

[![Travis-CI](https://travis-ci.org/nccgroup/wssip.svg?branch=master)](https://travis-ci.org/nccgroup/wssip) [![npm version](https://img.shields.io/npm/v/wssip.svg)](https://www.npmjs.com/package/wssip) [![npm](https://img.shields.io/npm/dt/wssip.svg)](https://www.npmjs.com/package/wssip) [![github](https://img.shields.io/github/downloads/nccgroup/wssip/total.svg)](https://github.com/nccgroup/wssip) [![github release](https://img.shields.io/github/release/nccgroup/wssip.svg)](https://github.com/nccgroup/wssip/releases) [![license](https://img.shields.io/github/license/nccgroup/wssip.svg)](https://github.com/nccgroup/wssip/blob/master/LICENSE)

Short for "WebSocket/Socket.io Proxy", this tool, written in Node.js, provides a user interface to capture, intercept, send custom messages and view all WebSocket and Socket.IO communications between the client and server.

Upstream proxy support also means you can forward HTTP/HTTPS traffic to an intercepting proxy of your choice (e.g. Burp Suite or Pappy Proxy) but view WebSocket traffic in WSSiP. More information can be found on the blog post.

There is an outward bridge via HTTP to write a fuzzer in any language you choose to debug and fuzz for security vulnerabilities. This is still in development and I hope to release it ~late May.

Written and maintained by Samantha Chalker (@[thekettu](https://github.com/thekettu)). Icon for WSSiP release provided by @[dragonfoxing](https://twitter.com/dragonfoxing).

## Installation

### From npm/yarn

Run the following in your command line:

**npm**:

~~~bash
# Install WSSiP
npm install -g wssip

# ...and launch WSSiP!
wssip
~~~

**yarn**: (Make sure the directory in `yarn global bin` is in your `PATH`)

~~~bash
# Install WSSiP
yarn global add wssip

#...and launch!
wssip
~~~

### From Source

Using a command line:

~~~bash
# Clone repository locally
git clone https://github.com/nccgroup/wssip

# Change to the directory
cd wssip

# Install either the production (normal) version of WSSiP:
npm install --production
# or the development version:
# npm install

# ...and to start the production version:
npm start
# or the development with debugging:
# npm run debug
~~~

### From Homebrew (macOS Only)

Using Terminal:

~~~bash
# Install formula
brew install https://raw.githubusercontent.com/nccgroup/wssip/master/build/wssip.rb

# ...and launch WSSiP!
wssip
~~~

### From Packaged Application

See [Releases](https://github.com/nccgroup/wssip/releases).

## Usage

1. Open the WSSiP application.
2. WSSiP will start listening automatically. This will default to localhost on port 8080.
3. Optionally, use Tools > Use Upstream Proxy to use another intercepting proxy to view web traffic.
4. Configure the browser to point to http://localhost:8080/ as the HTTP Proxy.
5. Navigate to a page using WebSockets. A good example is [the WS Echo Demonstration](http://websocket.org/).
6. ???
7. Potato.

## Fuzzing (Work In Progress)

WSSiP provides an HTTP bridge via the man-in-the-middle proxy for custom applications to help fuzz a connection.

This module is still under development.

## Development

Pull requests are welcomed and encouraged. WSSiP supports the `debug` npm package, and setting the environment variable `DEBUG=wssip:*` will output debug information to console.

Currently working on:
* Exposed API for external scripts for fuzzing (working on now, see above)
* Saving/Resuming Connections from File
* Using WSSiP in browser without Electron
* Using something other than Appbar for Custom/Intercept tabs, and styling the options to center better

In the future, I'll try to rewrite everything to TypeScript.

### mitmengine.js

There is a custom man-in-the-middle Node.js class that I wrote that is within the **lib** folder named "mitmengine.js". For any other applications wishing to use this, you can simply do:

~~~
const mitmengine = require('wssip/lib/mitmengine');
~~~

mitmengine.js will use `http.request()` and `https.request()` to retrieve data from web servers as a part of the man-in-the-middle component, but if `node-libcurl` is installed via npm/yarn either globally or in the working directory, it will use that module instead. In testing, some web servers have unexpectedly terminated their connections while using the `.request()` function, but will not terminate using curl to fetch a web page. SOCKS4/5 proxies are also supported by curl. As a result, some users may opt to use curl instead.

To use the class, possible options and functions include:

#### new mitmengine([options])

- `options` {Object}
   - `hostname` {String} Hostname of the listening proxy. Default is `localhost`.
   - `port` {Number} Port number of the listening proxy. 0-65535. The number 0 will result in Node.js finding a free port to listen on and set instance.port to that value. Default is `0`.
   - `name` {String} If another application is using this and wants to modify the User-Agent, enter in the name here. User Agent is "name/version". Default is `wssip_mitmengine`.
   - `version` {String} Same as above, for version. Default is based on nearest package.json version if "find-up" is installed, followed by `?`.
   - `debugName` {String} If "debug" package is installed, use this identifier to debug. Default is "mitmengine". WSSiP sets this to `wssip:mitmengine`.
   - `useCurl` {Boolean} Disable curl even if node-libcurl is installed, or force curl enable. Not recommended to change. Default is `false`.
   - `useUpstreamProxy` {Boolean} Use an upstream proxy for all requests. For attaching processes, does not take effect on UPGRADE or CONNECT requests. Does not enable even if set to `true` if neither `node-libcurl` nor `tunnel-agent` is installed. Default is `false`.
   - `proxyUrl` {String} Proxy URL. Supports authorization. If `tunnel-agent` is installed, this will only accept http:// and https:// URLs. If `node-libcurl` is installed, it'll additionally support socks4://, socks5://, socks4a:// and socks5h://. Default is blank.
   - `timeout` {Number} Number of seconds before connection and request timeout. 0 means no timeout. Default is `0`.
   - `rejectUnauthorized` {Boolean} Reject self-signed and invalidated certificates. Default is `false`.
   - `tmpDir` {String} Path to directory to write to for storing mitmengine's certificates. Default is `$tmpdir/.mitm-cache`
   - `requestHandler` {Boolean|Function} If navigating to the URL http://me/, it'll signal to forward both request and response headers to this function.
      - `clientRequest` {http.IncomingMessage}
      - `clientResponse` {http.ServerResponse}
   - `tlsDefaultExtensions` {Object} node-forge specific default extensions.
   - `tlsDefaultServerExtensions` {Object} node-forge specific server default extensions.
   - `tlsDefaultIssuer` {Object} node-forge specific issuer object.
   - `eraseConnectionHeader` {Boolean} Rename "Connection: close" to "Connection: \_" Default is `false`
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
