'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

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
      changeUpstreamOpen: false,
      textFieldValue: '',

      alertOpen: false,
      alertText: 'Default Alert Text'
    };

    props.ipcRenderer.on('mitmengine-new-connection', this.addConnection);
    props.ipcRenderer.on('mitmengine-data', this.handleMitmData);
    props.ipcRenderer.on('mitmengine-close-connection', this.handleCloseConnection);
    props.ipcRenderer.on('mitmengine-error', this.handleError);

    props.ipcRenderer.on('changeHost', (e, host) => this.setState({ changeHostOpen: true, textFieldValue: host }));
    props.ipcRenderer.on('changePort', (e, port) => this.setState({ changePortOpen: true, textFieldValue: port }));
    props.ipcRenderer.on('changeUpstream', (e, url) => this.setState({ changeUpstreamOpen: true, textFieldValue: url }));
    props.ipcRenderer.on('dialogAlert', (e, text) => this.setState({ alertOpen: true, alertText: text }));

    props.ipcRenderer.on('clearInactive', this.clearInactiveConnections);

    props.ipcRenderer.on('wssip-new', this.handleClearAll);
    props.ipcRenderer.on('wssip-import', this.handleImport);
    props.ipcRenderer.on('wssip-export', this.handleExport);
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
    console.error(trace);

    let { alerts } = this.state;
    let lastIndex = alerts.length - 1;

    if (alerts.length !== 0 && alerts[lastIndex].msg === message) {
      alerts[lastIndex].time = this.getCurrentDateTime();
    } else {
      alerts = alerts.concat([{
        time: this.getCurrentDateTime(),
        msg: message
      }]);
    }

    this.setState({ alerts: alerts });
  }

  connectionRowIndexById(id) {
    if (!(id in this.state.connectionIndex)) return -1;

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

    this.props.ipcRenderer.send('debug', 'Main', `Connection ${id} row ${connectionIndex[id]}: ${serverUrl}`);

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
      this.props.ipcRenderer.send('debug', 'Main', `activeConnections = ${JSON.stringify(this.state.activeConnections)}`);
      this.props.ipcRenderer.send(`mitmengine-ready-${id}`);
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

    this.props.ipcRenderer.send('debug', 'Main', `Incoming ${id}: ${sender}-${type} with ${message.length} bytes`);

    let {
      activeConnections,
      inactiveConnections,
      heldForIntercepts
    } = this.state;

    let connection = activeConnections[rowIndex].id === id ? activeConnections[rowIndex] : inactiveConnections[rowIndex];

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
    let {
      activeConnections,
      inactiveConnections,
      openConnection,
      openConnectionActive,
      connectionIndex
    } = this.state;

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

    this.props.ipcRenderer.send('debug', 'Main', `Connection ${id} closed`);

    this.setState({
      activeConnections: activeConnections,
      inactiveConnections: inactiveConnections,
      connectionIndex: connectionIndex,
      openConnection: openConnection,
      openConnectionActive: openConnectionActive
    }, () => {
      this.props.ipcRenderer.send('debug', 'Main', `activeConnections = ${JSON.stringify(this.state.activeConnections)}`);
      this.props.ipcRenderer.send('debug', 'Main', `inactiveConnections = ${JSON.stringify(this.state.inactiveConnections)}`);
    });
  }

  onActiveSelectConnection(selectedId) {
    if (selectedId.length === 1) {
      this.props.ipcRenderer.send('debug', 'Main', `set active connection ${selectedId[0]}`);
      this.setState({
        openConnection: selectedId[0],
        openConnectionActive: true
      });
    } else {
      this.props.ipcRenderer.send('debug', 'Main', 'reset openConnectionActive back to null');
      this.setState({
        openConnection: null,
        openConnectionActive: null
      });
    }
  }

  onInactiveSelectConnection(selectedId) {
    if (selectedId.length === 1) {
      this.props.ipcRenderer.send('debug', 'Main', `set inactive connection ${selectedId[0]}`);
      this.setState({
        openConnection: selectedId[0],
        openConnectionActive: false
      });
    } else {
      this.props.ipcRenderer.send('debug', 'Main', 'reset openConnectionActive back to null');
      this.setState({
        openConnection: null,
        openConnectionActive: null
      });
    }
  }

  handleToggleInterceptState(id, sender, checked) {
    let { heldForIntercepts } = this.state;

    if (messageArr !== false && checked === false) {
      heldForIntercepts[id][sender].forEach(individualMsg => this.handleMessageSent(id, sender, individualMsg.type, individualMsg.data, individualMsg.binary, individualMsg.masked, false, false));
    }

    heldForIntercepts[id][sender] = checked ? [] : false;

    this.setState({
      heldForIntercepts: heldForIntercepts
    });
  }

  handleRetrieveMessage(id, sender, index) {
    let { heldForIntercepts } = this.state;

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
    id = Number(id);
    let { messageHistory } = this.state;

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

    this.setState({ messageHistory: messageHistory }, () => {
      this.props.ipcRenderer.send('debug', 'Main', `Outgoing ${id}: ${sender}-${type} with ${data.length} bytes`);
      this.props.ipcRenderer.send(`mitmengine-send-${id}`, sender, type, data, { binary: binary, mask: masked });
    });
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

  handleClearAll(event) {
    //user goes to File > New
  }

  handleImport(event, contents) {}

  handleExport(event, filename) {
    this.props.ipcRenderer.send('savefileCallback', filename, {
      wssip: this.state.inactiveConnections
    });
  }

  changeSubmit() {
    if (this.state.changeHostOpen === true) {
      this.setState({ changeHostOpen: false }, () => this.props.ipcRenderer.send('changeHostCallback', this.state.textFieldValue));
    } else if (this.state.changePortOpen === true) {
      this.setState({ changePortOpen: false }, () => this.props.ipcRenderer.send('changePortCallback', this.state.textFieldValue));
    } else if (this.state.changeUpstreamOpen === true) {
      this.setState({ changeUpstreamOpen: false }, () => this.props.ipcRenderer.send('changeUpstreamCallback', this.state.textFieldValue));
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
      changeUpstreamOpen
    } = this.state;

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

    const changeUpstreamActions = [_react2.default.createElement(_FlatButton2.default, {
      label: 'Cancel',
      primary: true,
      onTouchTap: () => this.setState({ changeUpstreamOpen: false })
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
                    ipcRenderer: this.props.ipcRenderer,
                    list: activeConnections,
                    onSelectConnection: this.onActiveSelectConnection,
                    tableStyle: _ReactStyle.tableStyle,
                    height: topHeight - 50,
                    heldForIntercepts: heldForIntercepts
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
                    ipcRenderer: this.props.ipcRenderer,
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
                    ipcRenderer: this.props.ipcRenderer,
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
                      ipcRenderer: this.props.ipcRenderer,
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
                      ipcRenderer: this.props.ipcRenderer,
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
                      ipcRenderer: this.props.ipcRenderer,
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
                      ipcRenderer: this.props.ipcRenderer,
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
              { title: 'Change Upstream Proxy URL', actions: changeUpstreamActions, modal: true, open: changeUpstreamOpen },
              _react2.default.createElement(
                'div',
                null,
                _react2.default.createElement(_TextField2.default, {
                  hintText: 'http://hostname:port/',
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