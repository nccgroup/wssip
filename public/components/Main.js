'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _electron = require('electron');

var _react = require('react');

var _react2 = _interopRequireDefault(_react);

var _reactAutobind = require('react-autobind');

var _reactAutobind2 = _interopRequireDefault(_reactAutobind);

var _Tabs = require('material-ui/Tabs');

var _MuiThemeProvider = require('material-ui/styles/MuiThemeProvider');

var _MuiThemeProvider2 = _interopRequireDefault(_MuiThemeProvider);

var _Paper = require('material-ui/Paper');

var _Paper2 = _interopRequireDefault(_Paper);

var _Checkbox = require('material-ui/Checkbox');

var _Checkbox2 = _interopRequireDefault(_Checkbox);

var _Dialog = require('material-ui/Dialog');

var _Dialog2 = _interopRequireDefault(_Dialog);

var _FlatButton = require('material-ui/FlatButton');

var _FlatButton2 = _interopRequireDefault(_FlatButton);

var _TextField = require('material-ui/TextField');

var _TextField2 = _interopRequireDefault(_TextField);

var _ActiveConnection = require('./ActiveConnection');

var _ActiveConnection2 = _interopRequireDefault(_ActiveConnection);

var _InactiveConnection = require('./InactiveConnection');

var _InactiveConnection2 = _interopRequireDefault(_InactiveConnection);

var _AlertsTab = require('./AlertsTab');

var _AlertsTab2 = _interopRequireDefault(_AlertsTab);

var _HistoryTab = require('./HistoryTab');

var _HistoryTab2 = _interopRequireDefault(_HistoryTab);

var _CustomTab = require('./CustomTab');

var _CustomTab2 = _interopRequireDefault(_CustomTab);

var _InterceptTab = require('./InterceptTab');

var _InterceptTab2 = _interopRequireDefault(_InterceptTab);

var _ReactStyle = require('./_ReactStyle');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class Main extends _react2.default.Component {
  constructor(props) {
    super(props);
    (0, _reactAutobind2.default)(this);

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
    };

    _electron.ipcRenderer.on('mitmengine-new-connection', this.addConnection);
    _electron.ipcRenderer.on('mitmengine-data', this.handleMitmData);
    _electron.ipcRenderer.on('mitmengine-close-connection', this.handleCloseConnection);
    _electron.ipcRenderer.on('mitmengine-error', this.handleError);

    _electron.ipcRenderer.on('changeHost', this.changeHostIpc);
    _electron.ipcRenderer.on('changePort', this.changePortIpc);
    _electron.ipcRenderer.on('changeUpstreamHost', this.changeUpstreamHostIpc);
    _electron.ipcRenderer.on('changeUpstreamPort', this.changeUpstreamPortIpc);
    _electron.ipcRenderer.on('dialogAlert', this.alertIpc);

    _electron.ipcRenderer.on('clearInactive', this.clearInactiveConnections);
  }

  getCurrentDateTime() {
    let date = new Date();
    let leadingZero = num => new String(num).length === 1 ? '0' + num : num;

    let format = `${date.getFullYear()}-${leadingZero(date.getMonth() + 1)}-${leadingZero(date.getDate())} `;
    format += `${leadingZero(date.getHours())}:${leadingZero(date.getMinutes())}:`;
    format += `${leadingZero(date.getSeconds())}.${date.getMilliseconds()}`;

    return format;
  }

  handleError(event, message, trace) {
    let alerts = this.state.alerts;


    alerts.push({
      time: this.getCurrentDateTime(),
      msg: message
    });

    console.error(trace);
    this.setState({ alerts: alerts });
  }

  connectionRowIndexById(id) {
    if (typeof this.state.connectionIndex[id] === 'undefined') return -1;

    return parseInt(this.state.connectionIndex[id]);
  }

  addConnection(event, id, serverUrl, serverUrlParsed) {
    var _state = this.state;
    let activeConnections = _state.activeConnections,
        messageHistory = _state.messageHistory,
        heldForIntercepts = _state.heldForIntercepts,
        connectionIndex = _state.connectionIndex;


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

    _electron.ipcRenderer.send('debug', 'ReactMain', `Connection ${id} row ${connectionIndex[id]}: ${serverUrl}`);

    messageHistory[id] = [];
    heldForIntercepts[id] = {
      client: false,
      server: false
    };

    this.setState({
      activeConnections: activeConnections,
      messageHistory: messageHistory,
      heldForIntercepts: heldForIntercepts,
      connectionIndex: connectionIndex
    }, () => {
      _electron.ipcRenderer.send('debug', 'ReactMain', `activeConnections = ${JSON.stringify(this.state.activeConnections)}`);
      _electron.ipcRenderer.send(`mitmengine-ready-${id}`);
    });
  }

  clearInactiveConnections(event) {
    var _state2 = this.state;
    let messageHistory = _state2.messageHistory,
        inactiveConnections = _state2.inactiveConnections,
        openConnectionActive = _state2.openConnectionActive,
        connectionIndex = _state2.connectionIndex;


    inactiveConnections.forEach(connection => {
      if (openConnectionActive === connection.id) {
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

    if (rowIndex === -1) return;

    _electron.ipcRenderer.send('debug', 'ReactMain', `Incoming ${id}: ${sender}-${type} with ${message.length} bytes`);

    var _state3 = this.state;
    let activeConnections = _state3.activeConnections,
        inactiveConnections = _state3.inactiveConnections,
        heldForIntercepts = _state3.heldForIntercepts;


    let connection;

    if (activeConnections[rowIndex].id !== id) {
      connection = inactiveConnections[rowIndex];
    } else {
      connection = activeConnections[rowIndex];
    }

    if (sender === 'server') {
      connection.serverMsgs++;
    } else if (sender === 'client') {
      connection.clientMsgs++;
    }

    if (heldForIntercepts[id][sender] === false) {
      let direction = sender === 'client' ? 'server' : 'client';

      this.handleMessageSent(id, direction, type, message, flags.binary, flags.masked, false, false);
    } else {
      let newArr = {
        type: type,
        data: message,
        binary: flags.binary,
        masked: flags.masked
      };

      if (sender === 'client') {
        heldForIntercepts[id].client.push(newArr);
      } else if (sender === 'server') {
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
    var _state4 = this.state;
    let activeConnections = _state4.activeConnections,
        inactiveConnections = _state4.inactiveConnections,
        openConnection = _state4.openConnection,
        openConnectionActive = _state4.openConnectionActive,
        connectionIndex = _state4.connectionIndex;


    let rowIndex = this.connectionRowIndexById(id);

    if (rowIndex === -1) return;

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

    if (openConnection === id) {
      openConnectionActive = false;
    }

    activeConnections.splice(rowIndex, rowIndex + 1);

    _electron.ipcRenderer.send('debug', 'ReactMain', `Connection ${id} closed`);

    this.setState({
      activeConnections: activeConnections,
      inactiveConnections: inactiveConnections,
      connectionIndex: connectionIndex,
      openConnection: openConnection,
      openConnectionActive: openConnectionActive
    }, () => {
      _electron.ipcRenderer.send('debug', 'ReactMain', `activeConnections = ${JSON.stringify(this.state.activeConnections)}`);
      _electron.ipcRenderer.send('debug', 'ReactMain', `inactiveConnections = ${JSON.stringify(this.state.inactiveConnections)}`);
    });
  }

  onActiveSelectConnection(selectedId) {
    if (selectedId.length === 1) {
      _electron.ipcRenderer.send('debug', 'ReactMain', `set active connection ${selectedId[0]}`);
      this.setState({
        openConnection: selectedId[0],
        openConnectionActive: true
      });
    } else {
      _electron.ipcRenderer.send('debug', 'ReactMain', 'reset openConnectionActive back to null');
      this.setState({
        openConnection: null,
        openConnectionActive: null
      });
    }
  }

  onInactiveSelectConnection(selectedId) {
    if (selectedId.length === 1) {
      _electron.ipcRenderer.send('debug', 'ReactMain', `set inactive connection ${selectedId[0]}`);
      this.setState({
        openConnection: selectedId[0],
        openConnectionActive: false
      });
    } else {
      _electron.ipcRenderer.send('debug', 'ReactMain', 'reset openConnectionActive back to null');
      this.setState({
        openConnection: null,
        openConnectionActive: null
      });
    }
  }

  handleToggleInterceptState(id, sender, checked) {
    let heldForIntercepts = this.state.heldForIntercepts;

    let messageArr = sender === 'client' ? heldForIntercepts[id].client : heldForIntercepts[id].server;

    if (messageArr !== false && checked === false) {
      messageArr.forEach(individualMsg => this.handleMessageSent(id, sender, individualMsg.type, individualMsg.data, individualMsg.binary, individualMsg.masked, false, false));
    }

    if (sender === 'client') {
      heldForIntercepts[id].client = checked ? [] : false;
    } else {
      heldForIntercepts[id].server = checked ? [] : false;
    }

    this.setState({
      heldForIntercepts: heldForIntercepts
    });
  }

  handleRetrieveMessage(id, sender, index) {
    let heldForIntercepts = this.state.heldForIntercepts;


    heldForIntercepts[id][sender].shift(index);
    this.setState({ heldForIntercepts: heldForIntercepts });
  }

  renderDataPreview(binary, data) {
    if (data === null) return '';

    let preview = '';

    if (binary) {
      preview = `<Binary, ${data.length} byte(s)>`;
    } else {
      if (data.length > this.state.substrLength) {
        preview = data.substr(0, this.state.substrLength);
      } else {
        return data;
      }
    }

    return preview;
  }

  handleMessageSent(id, sender, type, data, binary, masked, intercepted, custom) {
    let messageHistory = this.state.messageHistory;


    _electron.ipcRenderer.send('debug', 'ReactMain', `Outgoing ${id}: ${sender}-${type} with ${data.length} bytes`);

    _electron.ipcRenderer.send('mitmengine-send-' + id, sender, type, data, {
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
      binaryDisplay: binary ? _react2.default.createElement(_Checkbox2.default, { checked: true, disabled: true }) : _react2.default.createElement(_Checkbox2.default, { disabled: true }),
      masked: masked,
      maskedDisplay: masked ? _react2.default.createElement(_Checkbox2.default, { checked: true, disabled: true }) : _react2.default.createElement(_Checkbox2.default, { disabled: true }),
      intercepted: intercepted ? _react2.default.createElement(_Checkbox2.default, { checked: true, disabled: true }) : _react2.default.createElement(_Checkbox2.default, { disabled: true }),
      custom: custom ? _react2.default.createElement(_Checkbox2.default, { checked: true, disabled: true }) : _react2.default.createElement(_Checkbox2.default, { disabled: true })
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
    if (this.state.changeHostOpen === true) {
      _electron.ipcRenderer.send('changeHostCallback', this.state.textFieldValue);
      this.setState({ changeHostOpen: false });
    } else if (this.state.changePortOpen === true) {
      _electron.ipcRenderer.send('changePortCallback', this.state.textFieldValue);
      this.setState({ changePortOpen: false });
    } else if (this.state.changeUpstreamHostOpen === true) {
      _electron.ipcRenderer.send('changeUpstreamHostCallback', this.state.textFieldValue);
      this.setState({ changeUpstreamHostOpen: false });
    } else if (this.state.changeUpstreamPortOpen === true) {
      _electron.ipcRenderer.send('changeUpstreamPortCallback', this.state.textFieldValue);
      this.setState({ changeUpstreamPortOpen: false });
    }
  }

  render() {
    var _state5 = this.state;
    const openConnection = _state5.openConnection,
          openConnectionActive = _state5.openConnectionActive,
          messageHistory = _state5.messageHistory,
          heldForIntercepts = _state5.heldForIntercepts,
          activeConnections = _state5.activeConnections,
          inactiveConnections = _state5.inactiveConnections,
          alerts = _state5.alerts,
          clientHeight = _state5.clientHeight,
          clientWidth = _state5.clientWidth,
          alertText = _state5.alertText,
          alertOpen = _state5.alertOpen,
          textFieldValue = _state5.textFieldValue,
          changeHostOpen = _state5.changeHostOpen,
          changePortOpen = _state5.changePortOpen,
          changeUpstreamHostOpen = _state5.changeUpstreamHostOpen,
          changeUpstreamPortOpen = _state5.changeUpstreamPortOpen;


    const changeHostActions = [_react2.default.createElement(_FlatButton2.default, {
      label: 'Cancel',
      primary: true,
      onTouchTap: () => this.setState({ changeHostOpen: false })
    }), _react2.default.createElement(_FlatButton2.default, {
      label: 'Submit',
      primary: true,
      onTouchTap: this.changeSubmit
    })];

    const changePortActions = [_react2.default.createElement(_FlatButton2.default, {
      label: 'Cancel',
      primary: true,
      onTouchTap: () => this.setState({ changePortOpen: false })
    }), _react2.default.createElement(_FlatButton2.default, {
      label: 'Submit',
      primary: true,
      onTouchTap: this.changeSubmit
    })];

    const changeUpstreamHostActions = [_react2.default.createElement(_FlatButton2.default, {
      label: 'Cancel',
      primary: true,
      onTouchTap: () => this.setState({ changeUpstreamHostOpen: false })
    }), _react2.default.createElement(_FlatButton2.default, {
      label: 'Submit',
      primary: true,
      onTouchTap: this.changeSubmit
    })];

    const changeUpstreamPortActions = [_react2.default.createElement(_FlatButton2.default, {
      label: 'Cancel',
      primary: true,
      onTouchTap: () => this.setState({ changeUpstreamPortOpen: false })
    }), _react2.default.createElement(_FlatButton2.default, {
      label: 'Submit',
      primary: true,
      onTouchTap: this.changeSubmit
    })];

    const alertActions = [_react2.default.createElement(_FlatButton2.default, {
      label: 'OK',
      primary: true,
      onTouchTap: () => this.setState({ alertOpen: false })
    })];

    const alertsTab = `Alerts (${alerts.length})`;
    const connectionList = openConnectionActive ? activeConnections : inactiveConnections;

    let topHeight = 0;
    let bottomHeight = 0;

    if (openConnection === null) {
      topHeight = clientHeight;
    } else {
      topHeight = clientHeight * (1 - .70); //minHeight=292
      topHeight = topHeight <= 292 ? 292 : topHeight;
      bottomHeight = clientHeight - topHeight;
    }

    return _react2.default.createElement(
      'div',
      { style: _ReactStyle.mainStyle },
      _react2.default.createElement(
        _MuiThemeProvider2.default,
        { muiTheme: _ReactStyle.muiTheme },
        _react2.default.createElement(
          'span',
          null,
          _react2.default.createElement(
            'div',
            { style: { height: `${topHeight}px`, width: clientWidth } },
            _react2.default.createElement(
              _Tabs.Tabs,
              null,
              _react2.default.createElement(
                _Tabs.Tab,
                { label: 'Active Connections' },
                _react2.default.createElement(
                  'div',
                  { style: { height: topHeight - 50 + 'px' } },
                  _react2.default.createElement(_ActiveConnection2.default, {
                    list: activeConnections,
                    onSelectConnection: this.onActiveSelectConnection,
                    tableStyle: _ReactStyle.tableStyle,
                    height: topHeight - 50
                  })
                )
              ),
              _react2.default.createElement(
                _Tabs.Tab,
                { label: 'Inactive Connections' },
                _react2.default.createElement(
                  'div',
                  { style: { height: topHeight - 50 + 'px' } },
                  _react2.default.createElement(_InactiveConnection2.default, {
                    list: inactiveConnections,
                    onSelectConnection: this.onInactiveSelectConnection,
                    tableStyle: _ReactStyle.tableStyle,
                    height: topHeight - 50
                  })
                )
              ),
              _react2.default.createElement(
                _Tabs.Tab,
                { label: alertsTab },
                _react2.default.createElement(
                  'div',
                  { style: { height: topHeight - 50 + 'px' } },
                  _react2.default.createElement(_AlertsTab2.default, {
                    alerts: alerts,
                    height: topHeight - 50
                  })
                )
              )
            )
          ),
          //if active connection is selected
          openConnection !== null && openConnectionActive === true && _react2.default.createElement(
            'div',
            { style: { height: `${bottomHeight}px`, width: clientWidth } },
            _react2.default.createElement(
              'div',
              { style: { minHeight: '50px' } },
              _react2.default.createElement(
                _Tabs.Tabs,
                null,
                _react2.default.createElement(
                  _Tabs.Tab,
                  { label: 'History' },
                  _react2.default.createElement(
                    'div',
                    { style: { height: bottomHeight - 50 + 'px', width: clientWidth } },
                    _react2.default.createElement(_HistoryTab2.default, {
                      messageHistory: messageHistory,
                      id: openConnection,
                      tableStyle: _ReactStyle.tableContentStyle,
                      clientHeight: bottomHeight,
                      clientWidth: clientWidth
                    })
                  )
                ),
                _react2.default.createElement(
                  _Tabs.Tab,
                  { label: 'Custom' },
                  _react2.default.createElement(
                    'div',
                    { style: { height: bottomHeight - 50 + 'px', width: clientWidth } },
                    _react2.default.createElement(_CustomTab2.default, {
                      id: openConnection,
                      onMessageSent: this.handleMessageSent,
                      clientHeight: bottomHeight,
                      clientWidth: clientWidth
                    })
                  )
                ),
                _react2.default.createElement(
                  _Tabs.Tab,
                  { label: 'Intercept' },
                  _react2.default.createElement(
                    'div',
                    { style: { height: bottomHeight - 50 + 'px', width: clientWidth } },
                    _react2.default.createElement(_InterceptTab2.default, {
                      id: openConnection,
                      onToggleInterceptState: this.handleToggleInterceptState,
                      onMessageSent: this.handleMessageSent,
                      retrieveMessage: this.handleRetrieveMessage,
                      heldForIntercept: heldForIntercepts[openConnection],
                      clientHeight: bottomHeight,
                      clientWidth: clientWidth
                    })
                  )
                )
              )
            )
          ),
          //if inactive connection is selected
          openConnection !== null && openConnectionActive === false && _react2.default.createElement(
            'div',
            { style: { height: `${bottomHeight}px`, width: clientWidth } },
            _react2.default.createElement(
              'div',
              { style: { minHeight: '50px' } },
              _react2.default.createElement(
                _Tabs.Tabs,
                null,
                _react2.default.createElement(
                  _Tabs.Tab,
                  { label: 'History' },
                  _react2.default.createElement(
                    'div',
                    { style: { height: bottomHeight - 50 + 'px' } },
                    _react2.default.createElement(_HistoryTab2.default, {
                      messageHistory: messageHistory,
                      id: openConnection,
                      tableStyle: _ReactStyle.tableContentStyle,
                      clientHeight: bottomHeight,
                      clientWidth: clientWidth
                    })
                  )
                )
              )
            )
          ),
          _react2.default.createElement(
            'div',
            null,
            _react2.default.createElement(
              _Dialog2.default,
              { title: 'Change Proxy Host', actions: changeHostActions, modal: true, open: changeHostOpen },
              _react2.default.createElement(
                'div',
                null,
                _react2.default.createElement(_TextField2.default, {
                  hintText: 'Hostname (Default: 127.0.0.1)',
                  value: textFieldValue,
                  onChange: e => this.setState({ textFieldValue: e.target.value })
                })
              )
            )
          ),
          _react2.default.createElement(
            'div',
            null,
            _react2.default.createElement(
              _Dialog2.default,
              { title: 'Change Upstream Proxy Host', actions: changeUpstreamHostActions, modal: true, open: changeUpstreamHostOpen },
              _react2.default.createElement(
                'div',
                null,
                _react2.default.createElement(_TextField2.default, {
                  hintText: 'Hostname (Default: 127.0.0.1)',
                  value: textFieldValue,
                  onChange: e => this.setState({ textFieldValue: e.target.value })
                })
              )
            )
          ),
          _react2.default.createElement(
            'div',
            null,
            _react2.default.createElement(
              _Dialog2.default,
              { title: 'Change Proxy Port', actions: changePortActions, modal: true, open: changePortOpen },
              _react2.default.createElement(
                'div',
                null,
                _react2.default.createElement(_TextField2.default, {
                  hintText: 'Port (Default: 8080)',
                  value: textFieldValue,
                  onChange: e => this.setState({ textFieldValue: e.target.value })
                })
              )
            )
          ),
          _react2.default.createElement(
            'div',
            null,
            _react2.default.createElement(
              _Dialog2.default,
              { title: 'Change Upstream Proxy Port', actions: changeUpstreamPortActions, modal: true, open: changeUpstreamPortOpen },
              _react2.default.createElement(
                'div',
                null,
                _react2.default.createElement(_TextField2.default, {
                  hintText: 'Port',
                  value: textFieldValue,
                  onChange: e => this.setState({ textFieldValue: e.target.value })
                })
              )
            )
          ),
          _react2.default.createElement(
            'div',
            null,
            _react2.default.createElement(
              _Dialog2.default,
              { actions: alertActions, modal: false, open: alertOpen },
              _react2.default.createElement(
                'div',
                null,
                alertText
              )
            )
          )
        )
      )
    );
  }
}
exports.default = Main;