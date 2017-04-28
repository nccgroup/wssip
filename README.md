# WSSiP

Short for "WebSocket/Socket.io Proxy", this tool provides a user interface to capture, intercept, send custom messages and view all WebSocket and Socket.IO communications between the client and server. Upstream proxy support also means you can forward HTTP/HTTPS traffic to an intercepting proxy of your choice (e.g. Burp Suite or Pappy Proxy) but view WebSocket traffic in WSSiP. More information can be found on the blog post.

WSSiP was written by Samantha Chalker and is primarily written in Node.js using Electron and React with Material-UI for the main user interface layout. Features include viewing message history, sending custom messages and intercepting messages for editing. There is an outward bridge via HTTP to write a fuzzer in any language you choose to debug and fuzz for security vulnerabilities. For that, see Fuzzing for more details.

## Installation

### From npm/yarn

Run the following in your command line:

~~~bash
# Install WSSiP
npm install -g wssip
# or via yarn:
# yarn global add wssip

# ...and launch WSSiP!
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

Installing via yarn uses the same commands, just swap `npm` with `yarn` for the above, however make sure that the npm packages folder listed in `yarn global bin` are added to your `PATH`.

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

Working on for v1.1.0:
* Exposed API for external scripts for fuzzing (working on now, see above)
* Highlight Table Rows when Intercepted Message comes in
* Saving/Resuming Connections from File
* Using WSSiP in browser without Electron

Working on for v???:
* Using something other than Appbar for Custom/Intercept tabs, and styling the options to center better

### node-libcurl

WSSiP will use `http.request()` and `https.request()` to retrieve data from web servers as a part of the man-in-the-middle component, but if `node-libcurl` is installed via npm/yarn either globally or in the working directory of WSSiP, it will use that module instead. In testing, some web servers have unexpectedly terminated their connections while using the `.request()` function, but will not terminate using curl to fetch a web page. As a result, some users may opt to use curl instead.
