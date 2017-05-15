# WSSiP

[![Travis-CI](https://travis-ci.org/nccgroup/wssip.svg?branch=master)](https://travis-ci.org/nccgroup/wssip) [![npm version](https://img.shields.io/npm/v/wssip.svg)](https://www.npmjs.com/package/wssip) [![npm](https://img.shields.io/npm/dt/wssip.svg)](https://www.npmjs.com/package/wssip) [![github](https://img.shields.io/github/downloads/nccgroup/wssip/total.svg)](https://github.com/nccgroup/wssip) [![github release](https://img.shields.io/github/release/nccgroup/wssip.svg)](https://github.com/nccgroup/wssip/releases) [![license](https://img.shields.io/github/license/nccgroup/wssip.svg)](https://github.com/nccgroup/wssip/blob/master/LICENSE)

Short for "WebSocket/Socket.io Proxy", this tool, written in Node.js, provides a user interface to capture, intercept, send custom messages and view all WebSocket and Socket.IO communications between the client and server.

Upstream proxy support also means you can forward HTTP/HTTPS traffic to an intercepting proxy of your choice (e.g. Burp Suite or Pappy Proxy) but view WebSocket traffic in WSSiP. More information can be found on the blog post.

There is an outward bridge via HTTP to write a fuzzer in any language you choose to debug and fuzz for security vulnerabilities. This is still in development and I hope to release it ~late May.

Written and maintained by Samantha Chalker (@[thekettu](https://github.com/thekettu)). Icon for WSSiP release provided by @[dragonfoxing](https://twitter.com/dragonfoxing).

## Installation

### From Packaged Application

See [Releases](https://github.com/nccgroup/wssip/releases).

### From npm/yarn (for CLI commands)

Run the following in your command line:

**npm**:

~~~bash
# Install Electron globally
npm i -g electron

# Install wssip global for "wssip" command
npm i -g wssip

# Launch!
wssip
~~~

**yarn**: (Make sure the directory in `yarn global bin` is in your `PATH`)

~~~bash
yarn global add electron
yarn global add wssip
wssip
~~~

You can also run `npm install electron` (or `yarn add electron` if using yarn) inside the installed WSSiP directory if you do not want to install Electron globally, as the app packager requires Electron be added to developer dependencies.

### From Source

Using a command line:

~~~bash
# Clone repository locally
git clone https://github.com/nccgroup/wssip

# Change to the directory
cd wssip

# If development:
# npm i

# If not for developing WSSiP (as to minimize disk space):
npm i -g electron
npm i --production

# Start application:
npm start
~~~

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

There are two commands depending on how you want to compile the Webpack bundle: for development, that is `npm run compile:dev` and for production is `npm run compile`. React will also log errors depending on whether development or production is specified.

Currently working on:
* Exposed API for external scripts for fuzzing (working on now, see above)
* Saving/Resuming Connections from File
* Using WSSiP in browser without Electron
* Using something other than Appbar for Custom/Intercept tabs, and styling the options to center better
* Rewrite in TypeScript

For information on using the `mitmengine` class, see [mitmengine/README.md](https://github.com/nccgroup/wssip/mitmengine/README.md)
