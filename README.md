# WSSiP: A WebSocket Manipulation Proxy

[![Travis-CI](https://travis-ci.org/nccgroup/wssip.svg?branch=master)](https://travis-ci.org/nccgroup/wssip)
[![Appveyor](https://ci.appveyor.com/api/projects/status/q85uar6lmhddke6j?svg=true)](https://ci.appveyor.com/project/thekettu/wssip)
[![npm version](https://img.shields.io/npm/v/wssip.svg)](https://www.npmjs.com/package/wssip)
[![npm](https://img.shields.io/npm/dt/wssip.svg)](https://www.npmjs.com/package/wssip)
[![github](https://img.shields.io/github/downloads/nccgroup/wssip/total.svg)](https://github.com/nccgroup/wssip)
[![github release](https://img.shields.io/github/release/nccgroup/wssip.svg)](https://github.com/nccgroup/wssip/releases)
[![dependency outdated](https://david-dm.org/nccgroup/wssip/dev-status.svg)](https://david-dm.org/nccgroup/wssip)

Short for "WebSocket/Socket.io Proxy", this tool, written in Node.js, provides a user interface to capture, intercept, send custom messages and view all WebSocket and Socket.IO communications between the client and server.

Upstream proxy support also means you can forward HTTP/HTTPS traffic to an intercepting proxy of your choice (e.g. Burp Suite or Pappy Proxy) but view WebSocket traffic in WSSiP. More information can be found on the blog post.

There is an outward bridge via HTTP to write a fuzzer in any language you choose to debug and fuzz for security vulnerabilities. See [Fuzzing](#fuzzing) for more details.

Written and maintained by Samantha Chalker (@[thekettu](https://github.com/thekettu)). Icon for WSSiP release provided by @[dragonfoxing](https://twitter.com/dragonfoxing).

## Installation

### From Packaged Application

See [Releases](https://github.com/nccgroup/wssip/releases).

### From npx via npm (for CLI commands)

Run the following in your command line:

~~~bash
npx wssip
~~~

### From Source

Using a command line:

~~~bash
# Clone repository locally
git clone https://github.com/nccgroup/wssip

# Change to the directory
cd wssip

# If you are developing for WSSiP:
# npm i

# If not... (as to minimize disk space):
npm i electron
npm i --production

# Yarn version:
# yarn add electron
# yarn install --production

# Start application:
npm start
# or yarn:
# yarn start
~~~

## Usage

1. Open the WSSiP application.
2. WSSiP will start listening automatically. This will default to localhost on port 8080.
3. Optionally, use Tools > Use Upstream Proxy to use another intercepting proxy to view web traffic.
4. Configure the browser to point to http://localhost:8080/ as the HTTP Proxy.
5. Navigate to a page using WebSockets. A good example is [the WS Echo Demonstration](http://websocket.org/).
6. ???
7. Potato.

## Fuzzing

WSSiP provides an HTTP bridge via the man-in-the-middle proxy for custom applications to help fuzz a connection. These are accessed over the proxy server.

A few of the simple CA certificate downloads are:

* http://mitm/ca.pem / http://mitm/ca.der (Download CA Certificate)
* http://mitm/ca_pri.pem / http://mitm/ca_pri.der (Download Private Key)
* http://mitm/ca_pub.pem / http://mitm/ca_pub.der (Download Public Key)

**Get WebSocket Connection Info**
----
Returns whether the WebSocket id is connected to a web server, and if so, return information.

* **URL**

    GET http://mitm/ws/:id

* **URL Params**

  `id=[integer]`

* **Success Response (Not Connected)**

  * **Code:** 200 <br />
    **Content:** `{connected: false}`


* **Success Response (Connected)**

  * **Code**: 200 <br />
    **Content:** `{connected: true, url: 'ws://echo.websocket.org', bytesReceived: 0, extensions: {}, readyState: 3, protocol: '', protocolVersion: 13}`

**Send WebSocket Data**
----
Send WebSocket data.

* **URL**

  POST http://mitm/ws/:id/:sender/:mode/:type?log=:log

* **URL Params**

  **Required:**

  `id=[integer]`

  `sender` one of `client` or `server`

  `mode` one of `message`, `ping` or `pong`

  `type` one of `ascii` or `binary` (`text` is an alias of `ascii`)

  **Optional:**

  `log` either `true` or `y` to log in the WSSiP application. Errors will be logged in the WSSiP application instead of being returned via the REST API.

* **Data Params**

  Raw data in the POST field will be sent to the WebSocket server.

* **Success Response:**

  * **Code:** 200 <br />
    **Content:** `{success: true}`


* **Error Response:**

  * **Code:** 500 <br />
    **Content:** `{success: false, reason: 'Error message'}`

## Development

Pull requests are welcomed and encouraged. WSSiP supports the `debug` npm package, and setting the environment variable `DEBUG=wssip:*` will output debug information to console.

There are two commands depending on how you want to compile the Webpack bundle: for development, that is `npm run compile:dev` and for production is `npm run compile`. React will also log errors depending on whether development or production is specified.

Currently working on:
* Exposed API for external scripts for fuzzing (99% complete, it is live but need to test more data)
* Saving/Resuming Connections from File (35% complete, exporting works sans active connections)
* Using WSSiP in browser without Electron (likely 1.1.0)
* Rewrite in TypeScript (likely 1.2.0)
* Using something other than Appbar for Custom/Intercept tabs, and styling the options to center better

For information on using the `mitmengine` class, see: [npm](https://npmjs.com/package/mitmengine), [yarn](https://yarnpkg.com/en/package/mitmengine), or [mitmengine/README.md](https://github.com/nccgroup/wssip/blob/master/mitmengine/README.md)
