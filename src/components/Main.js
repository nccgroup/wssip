import {ipcRenderer} from 'electron';
import React from 'react';
import autoBind from 'react-autobind';

import {Tabs, Tab} from 'material-ui/Tabs';
import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider';
import Paper from 'material-ui/Paper';
import Checkbox from 'material-ui/Checkbox';
import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';
import TextField from 'material-ui/TextField';

import ActiveConnection from './ActiveConnection';
import InactiveConnection from './InactiveConnection';
import AlertsTab from './AlertsTab';
import HistoryTab from './HistoryTab';
import CustomTab from './CustomTab';
import InterceptTab from './InterceptTab';

import {muiTheme, mainStyle, tabStyle, tableStyle, tableContentStyle} from './_ReactStyle';

export default class Main extends React.Component {
  constructor(props) {
    super(props);
    autoBind(this);

    this.state = {
      activeConnections: [],
      inactiveConnections: [],
      alerts: [],
      connectionIndex: {},

      messageHistory: [],
      heldForIntercepts: [],

      openConnection: null,
      openConnectionActive: null,

      clientHeight: window.innerHeight,
      clientWidth: window.innerWidth,

      changeHostOpen: false,
      changePortOpen: false,
      changeUpstreamHostOpen: false,
      changeUpstreamPortOpen: false,
      textFieldValue: '',

      alertOpen: false,
      alertText: 'Default Alert Text'
    }

    ipcRenderer.on('mitmengine-new-connection', this.addConnection);
    ipcRenderer.on('mitmengine-data', this.handleMitmData);
    ipcRenderer.on('mitmengine-close-connection', this.handleCloseConnection);
    ipcRenderer.on('mitmengine-error', this.handleError);

    ipcRenderer.on('changeHost', this.changeHostIpc);
    ipcRenderer.on('changePort', this.changePortIpc);
    ipcRenderer.on('changeUpstreamHost', this.changeUpstreamHostIpc);
    ipcRenderer.on('changeUpstreamPort', this.changeUpstreamPortIpc);
    ipcRenderer.on('dialogAlert', this.alertIpc);

    ipcRenderer.on('clearInactive', this.clearInactiveConnections);
  }

  getCurrentDateTime() {
    let date = new Date();
    let leadingZero = num => (new String(num)).length === 1 ? '0' + num : num;

    let format = `${date.getFullYear()}-${leadingZero(date.getMonth()+1)}-${leadingZero(date.getDate())} `;
    format += `${leadingZero(date.getHours())}:${leadingZero(date.getMinutes())}:`;
    format += `${leadingZero(date.getSeconds())}.${date.getMilliseconds()}`;

    return format;
  }

  handleError(event, message, trace) {
    let {alerts} = this.state;

    alerts.push({
      time: this.getCurrentDateTime(),
      msg: message
    });

    console.error(trace);
    this.setState({ alerts: alerts });
  }

  connectionRowIndexById(id) {
    if(typeof this.state.connectionIndex[id] === 'undefined')
      return -1;

    return parseInt(this.state.connectionIndex[id]);
  }

  addConnection(event, id, serverUrl, serverUrlParsed) {
    let {
      activeConnections,
      messageHistory,
      heldForIntercepts,
      connectionIndex
    } = this.state;

    connectionIndex[id] = activeConnections.push({
      id: id,
      protocol: serverUrlParsed.protocol,
      host: serverUrlParsed.hostname,
      port: serverUrlParsed.port,
      path: serverUrlParsed.path,
      serverMsgs: 0,
      clientMsgs: 0,
      timeOpened: this.getCurrentDateTime()
    });

    connectionIndex[id] = connectionIndex[id] - 1; //.push() returns length

    ipcRenderer.send('debug', 'Main', `Connection ${id} row ${connectionIndex[id]}: ${serverUrl}`);

    messageHistory[id] = [];
    heldForIntercepts[id] = {
      client: false,
      server: false
    }

    this.setState({
      activeConnections: activeConnections,
      messageHistory: messageHistory,
      heldForIntercepts: heldForIntercepts,
      connectionIndex: connectionIndex
    },
    () => {
      ipcRenderer.send('debug', 'Main', `activeConnections = ${JSON.stringify(this.state.activeConnections)}`);
      ipcRenderer.send(`mitmengine-ready-${id}`);
    });
  }

  clearInactiveConnections(event) {
    let {
      messageHistory,
      inactiveConnections,
      openConnectionActive,
      connectionIndex
    } = this.state;

    inactiveConnections.forEach(connection => {
      if(openConnectionActive === connection.id) {
        openConnectionActive = null;
      }

      messageHistory[connection.id] = [];
      delete connectionIndex[connection.id];
    });

    this.setState({
      messageHistory: messageHistory,
      inactiveConnections: [],
      openConnectionActive: openConnectionActive,
      connectionIndex: connectionIndex
    });
  }

  handleMitmData(event, id, sender, message, type, flags) {
    let rowIndex = this.connectionRowIndexById(id);

    if(rowIndex === -1)
      return;

    ipcRenderer.send('debug', 'Main', `Incoming ${id}: ${sender}-${type} with ${message.length} bytes`);

    let {
      activeConnections,
      inactiveConnections,
      heldForIntercepts
    } = this.state;

    let connection;

    if(activeConnections[rowIndex].id !== id) {
      connection = inactiveConnections[rowIndex];
    } else {
      connection = activeConnections[rowIndex];
    }

    if(sender === 'server') {
      connection.serverMsgs++;
    } else if(sender === 'client') {
      connection.clientMsgs++;
    }

    if(heldForIntercepts[id][sender] === false) {
      let direction = sender === 'client' ? 'server' : 'client';

      this.handleMessageSent(
        id,
        direction,
        type,
        message,
        flags.binary,
        flags.masked,
        false,
        false
      );
    } else {
      let newArr = {
        type: type,
        data: message,
        binary: flags.binary,
        masked: flags.masked
      }

      if(sender === 'client') {
        heldForIntercepts[id].client.push(newArr);
      } else if(sender === 'server') {
        heldForIntercepts[id].server.push(newArr);
      }
    }

    this.setState({
      activeConnections: activeConnections,
      inactiveConnections: inactiveConnections,
      heldForIntercepts: heldForIntercepts
    });
  }

  handleCloseConnection(event, sender, id) {
    let {
      activeConnections,
      inactiveConnections,
      openConnection,
      openConnectionActive,
      connectionIndex
    } = this.state;

    let rowIndex = this.connectionRowIndexById(id);

    if(rowIndex === -1)
      return;

    let connection = activeConnections[rowIndex];

    connectionIndex[id] = inactiveConnections.push({
      id: connection.id,
      protocol: connection.protocol,
      host: connection.host,
      port: connection.port,
      path: connection.path,
      serverMsgs: connection.serverMsgs,
      clientMsgs: connection.clientMsgs,
      timeOpened: connection.timeOpened,
      timeClosed: this.getCurrentDateTime()
    });

    if(openConnection === id) {
      openConnectionActive = false;
    }

    activeConnections.splice(rowIndex, rowIndex+1);

    ipcRenderer.send('debug', 'Main', `Connection ${id} closed`);

    this.setState({
      activeConnections: activeConnections,
      inactiveConnections: inactiveConnections,
      connectionIndex: connectionIndex,
      openConnection: openConnection,
      openConnectionActive: openConnectionActive
    },
    () => {
      ipcRenderer.send('debug', 'Main', `activeConnections = ${JSON.stringify(this.state.activeConnections)}`);
      ipcRenderer.send('debug', 'Main', `inactiveConnections = ${JSON.stringify(this.state.inactiveConnections)}`);
    });
  }

  onActiveSelectConnection(selectedId) {
    if(selectedId.length === 1) {
      ipcRenderer.send('debug', 'Main', `set active connection ${selectedId[0]}`);
      this.setState({
        openConnection: selectedId[0],
        openConnectionActive: true
      });
    } else {
      ipcRenderer.send('debug', 'Main', 'reset openConnectionActive back to null');
      this.setState({
        openConnection: null,
        openConnectionActive: null
      });
    }
  }

  onInactiveSelectConnection(selectedId) {
    if(selectedId.length === 1) {
      ipcRenderer.send('debug', 'Main', `set inactive connection ${selectedId[0]}`);
      this.setState({
        openConnection: selectedId[0],
        openConnectionActive: false
      });
    } else {
      ipcRenderer.send('debug', 'Main', 'reset openConnectionActive back to null');
      this.setState({
        openConnection: null,
        openConnectionActive: null
      });
    }
  }

  handleToggleInterceptState(id, sender, checked) {
    let {heldForIntercepts} = this.state;
    let messageArr = sender === 'client' ? heldForIntercepts[id].client : heldForIntercepts[id].server;

    if(messageArr !== false && checked === false) {
      messageArr.forEach(individualMsg =>
        this.handleMessageSent(id, sender, individualMsg.type, individualMsg.data, individualMsg.binary, individualMsg.masked, false, false));
    }

    if(sender === 'client') {
      heldForIntercepts[id].client = checked ? [] : false;
    } else {
      heldForIntercepts[id].server = checked ? [] : false;
    }

    this.setState({
      heldForIntercepts: heldForIntercepts
    });
  }

  handleRetrieveMessage(id, sender, index) {
    let {heldForIntercepts} = this.state;

    heldForIntercepts[id][sender].shift(index);
    this.setState({ heldForIntercepts: heldForIntercepts });
  }

  renderDataPreview(binary, data) {
    if(data === null) return '';

    let preview = '';

    if(binary) {
      preview = `<Binary, ${data.length} byte(s)>`;
    } else {
      if(data.length > this.state.substrLength) {
        preview = data.substr(0, this.state.substrLength);
      } else {
        return data;
      }
    }

    return preview;
  }

  handleMessageSent(id, sender, type, data, binary, masked, intercepted, custom) {
    let {messageHistory} = this.state;

    ipcRenderer.send('debug', 'Main', `Outgoing ${id}: ${sender}-${type} with ${data.length} bytes`);

    ipcRenderer.send('mitmengine-send-' + id, sender, type, data, {
      binary: binary,
      mask: masked
    });

    messageHistory[id].push({
      time: this.getCurrentDateTime(),
      sender: sender,
      type: type,
      data: data,
      preview: this.renderDataPreview(binary, data),
      binary: binary,
      binaryDisplay: binary ? (<Checkbox checked={true} disabled={true} />) : (<Checkbox disabled={true} />),
      masked: masked,
      maskedDisplay: masked ? (<Checkbox checked={true} disabled={true} />) : (<Checkbox disabled={true} />),
      intercepted: intercepted ? (<Checkbox checked={true} disabled={true} />) : (<Checkbox disabled={true} />),
      custom: custom ? (<Checkbox checked={true} disabled={true} />) : (<Checkbox disabled={true} />)
    });

    this.setState({ messageHistory: messageHistory });
  }

  updateDimensions() {
    this.setState({
      clientHeight: window.innerHeight,
      clientWidth: window.innerWidth
    });
  }

  componentDidMount() {
    window.addEventListener('resize', this.updateDimensions);
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this.updateDimensions);
  }

  changeHostIpc(e, hostname) {
    this.setState({ changeHostOpen: true, textFieldValue: hostname });
  }

  changePortIpc(e, port) {
    this.setState({ changePortOpen: true, textFieldValue: port });
  }

  changeUpstreamHostIpc(e, hostname) {
    this.setState({ changeUpstreamHostOpen: true, textFieldValue: hostname });
  }

  changeUpstreamPortIpc(e, port) {
    this.setState({ changeUpstreamPortOpen: true, textFieldValue: port });
  }

  alertIpc(e, text) {
    this.setState({ alertOpen: true, alertText: text });
  }

  changeSubmit() {
    if(this.state.changeHostOpen === true) {
      ipcRenderer.send('changeHostCallback', this.state.textFieldValue);
      this.setState({ changeHostOpen: false });
    } else if(this.state.changePortOpen === true) {
      ipcRenderer.send('changePortCallback', this.state.textFieldValue);
      this.setState({ changePortOpen: false });
    } else if(this.state.changeUpstreamHostOpen === true) {
      ipcRenderer.send('changeUpstreamHostCallback', this.state.textFieldValue);
      this.setState({ changeUpstreamHostOpen: false });
    } else if(this.state.changeUpstreamPortOpen === true) {
      ipcRenderer.send('changeUpstreamPortCallback', this.state.textFieldValue);
      this.setState({ changeUpstreamPortOpen: false });
    }
  }

  render() {
    const {
      openConnection,
      openConnectionActive,
      messageHistory,
      heldForIntercepts,
      activeConnections,
      inactiveConnections,
      alerts,
      clientHeight,
      clientWidth,
      alertText,
      alertOpen,
      textFieldValue,
      changeHostOpen,
      changePortOpen,
      changeUpstreamHostOpen,
      changeUpstreamPortOpen
    } = this.state;

    const changeHostActions = [
      <FlatButton
        label="Cancel"
        primary={true}
        onTouchTap={() => this.setState({ changeHostOpen: false })}
      />,
      <FlatButton
        label="Submit"
        primary={true}
        onTouchTap={this.changeSubmit}
      />,
    ];

    const changePortActions = [
      <FlatButton
        label="Cancel"
        primary={true}
        onTouchTap={() => this.setState({ changePortOpen: false })}
      />,
      <FlatButton
        label="Submit"
        primary={true}
        onTouchTap={this.changeSubmit}
      />,
    ];

    const changeUpstreamHostActions = [
      <FlatButton
        label="Cancel"
        primary={true}
        onTouchTap={() => this.setState({ changeUpstreamHostOpen: false })}
      />,
      <FlatButton
        label="Submit"
        primary={true}
        onTouchTap={this.changeSubmit}
      />,
    ];

    const changeUpstreamPortActions = [
      <FlatButton
        label="Cancel"
        primary={true}
        onTouchTap={() => this.setState({ changeUpstreamPortOpen: false })}
      />,
      <FlatButton
        label="Submit"
        primary={true}
        onTouchTap={this.changeSubmit}
      />,
    ];

    const alertActions = [
      <FlatButton
        label="OK"
        primary={true}
        onTouchTap={() => this.setState({ alertOpen: false })}
      />,
    ]

    const alertsTab = `Alerts (${alerts.length})`;
    const connectionList = openConnectionActive ? activeConnections : inactiveConnections;

    let topHeight = 0;
    let bottomHeight = 0;

    if(openConnection === null) {
      topHeight = clientHeight;
    } else {
      topHeight = clientHeight * (1 - .70); //minHeight=292
      topHeight = (topHeight <= 292) ? 292 : topHeight;
      bottomHeight = clientHeight - topHeight;
    }

    return (
      <div style={mainStyle}>
        <MuiThemeProvider muiTheme={muiTheme}>
          <span>
            <div style={{height: `${topHeight}px`, width: clientWidth}}>
              <Tabs>
                <Tab label="Active Connections">
                  <div style={{height: (topHeight - 50) + 'px'}}>
                    <ActiveConnection
                      list={activeConnections}
                      onSelectConnection={this.onActiveSelectConnection}
                      tableStyle={tableStyle}
                      height={(topHeight - 50)}
                    />
                  </div>
                </Tab>
                <Tab label="Inactive Connections">
                  <div style={{height: (topHeight - 50) + 'px'}}>
                    <InactiveConnection
                      list={inactiveConnections}
                      onSelectConnection={this.onInactiveSelectConnection}
                      tableStyle={tableStyle}
                      height={(topHeight - 50)}
                    />
                  </div>
                </Tab>
                <Tab label={alertsTab}>
                  <div style={{height: (topHeight - 50) + 'px'}}>
                    <AlertsTab
                      alerts={alerts}
                      height={(topHeight-50)}
                    />
                  </div>
                </Tab>
              </Tabs>
            </div>
            { //if active connection is selected
              openConnection !== null &&
              openConnectionActive === true &&
              (
                <div style={{ height: `${bottomHeight}px`, width: clientWidth }}>
                  <div style={{minHeight: '50px'}}>
                    <Tabs>
                      <Tab label="History">
                        <div style={{ height: (bottomHeight - 50) + 'px', width: clientWidth }}>
                          <HistoryTab
                            messageHistory={messageHistory}
                            id={openConnection}
                            tableStyle={tableContentStyle}
                            clientHeight={bottomHeight}
                            clientWidth={clientWidth}
                          />
                        </div>
                      </Tab>
                      <Tab label="Custom">
                        <div style={{ height: (bottomHeight - 50) + 'px', width: clientWidth }}>
                          <CustomTab
                            id={openConnection}
                            onMessageSent={this.handleMessageSent}
                            clientHeight={bottomHeight}
                            clientWidth={clientWidth}
                          />
                        </div>
                      </Tab>
                      <Tab label="Intercept">
                        <div style={{ height: (bottomHeight - 50) + 'px', width: clientWidth }}>
                          <InterceptTab
                            id={openConnection}
                            onToggleInterceptState={this.handleToggleInterceptState}
                            onMessageSent={this.handleMessageSent}
                            retrieveMessage={this.handleRetrieveMessage}
                            heldForIntercept={heldForIntercepts[openConnection]}
                            clientHeight={bottomHeight}
                            clientWidth={clientWidth}
                          />
                        </div>
                      </Tab>
                    </Tabs>
                  </div>
                </div>
              )
            }
            { //if inactive connection is selected
              openConnection !== null &&
              openConnectionActive === false &&
              (
                <div style={{ height: `${bottomHeight}px`, width: clientWidth }}>
                  <div style={{minHeight: '50px'}}>
                    <Tabs>
                      <Tab label="History">
                        <div style={{height: (bottomHeight - 50) + 'px'}}>
                          <HistoryTab
                            messageHistory={messageHistory}
                            id={openConnection}
                            tableStyle={tableContentStyle}
                            clientHeight={bottomHeight}
                            clientWidth={clientWidth}
                          />
                        </div>
                      </Tab>
                    </Tabs>
                  </div>
                </div>
              )
            }
            <div>
              <Dialog title="Change Proxy Host" actions={changeHostActions} modal={true} open={changeHostOpen}>
                <div>
                  <TextField
                    hintText="Hostname (Default: 127.0.0.1)"
                    value={textFieldValue}
                    onChange={e => this.setState({ textFieldValue: e.target.value })}
                  />
                </div>
              </Dialog>
            </div>
            <div>
              <Dialog title="Change Upstream Proxy Host" actions={changeUpstreamHostActions} modal={true} open={changeUpstreamHostOpen}>
                <div>
                  <TextField
                    hintText="Hostname (Default: 127.0.0.1)"
                    value={textFieldValue}
                    onChange={e => this.setState({ textFieldValue: e.target.value })}
                  />
                </div>
              </Dialog>
            </div>
            <div>
              <Dialog title="Change Proxy Port" actions={changePortActions} modal={true} open={changePortOpen}>
                <div>
                  <TextField
                    hintText="Port (Default: 8080)"
                    value={textFieldValue}
                    onChange={e => this.setState({ textFieldValue: e.target.value })}
                  />
                </div>
              </Dialog>
            </div>
            <div>
              <Dialog title="Change Upstream Proxy Port" actions={changeUpstreamPortActions} modal={true} open={changeUpstreamPortOpen}>
                <div>
                  <TextField
                    hintText="Port"
                    value={textFieldValue}
                    onChange={e => this.setState({ textFieldValue: e.target.value })}
                  />
                </div>
              </Dialog>
            </div>
            <div>
              <Dialog actions={alertActions} modal={false} open={alertOpen}>
                <div>
                  {alertText}
                </div>
              </Dialog>
            </div>
          </span>
        </MuiThemeProvider>
      </div>
    );
  }
}
