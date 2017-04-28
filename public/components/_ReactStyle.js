'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.InactiveConnectionColumns = exports.HistoryColumns = exports.centerText = exports.ActiveConnectionColumns = exports.AlertsColumns = exports.tableContentStyle = exports.tableStyle = exports.tabStyle = exports.mainStyle = exports.muiTheme = undefined;

var _colors = require('material-ui/styles/colors');

var _getMuiTheme = require('material-ui/styles/getMuiTheme');

var _getMuiTheme2 = _interopRequireDefault(_getMuiTheme);

var _spacing = require('material-ui/styles/spacing');

var _spacing2 = _interopRequireDefault(_spacing);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const muiTheme = exports.muiTheme = (0, _getMuiTheme2.default)({
  spacing: _spacing2.default,
  fontFamily: 'Roboto, sans-serif',
  borderRadius: 2,
  palette: {
    primary1Color: _colors.red800,
    primary2Color: _colors.red900,
    primary3Color: _colors.grey400,
    accent1Color: _colors.pinkA200,
    accent2Color: _colors.grey100,
    accent3Color: _colors.grey500,
    textColor: _colors.darkBlack,
    secondaryTextColor: _colors.darkBlack,
    alternateTextColor: _colors.white,
    canvasColor: _colors.white,
    borderColor: _colors.grey300,
    disabledColor: _colors.darkBlack,
    pickerHeaderColor: _colors.red800,
    clockCircleColor: _colors.darkBlack,
    shadowColor: _colors.fullBlack
  }
}); //Main.js
const mainStyle = exports.mainStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  height: '100%',
  width: '100%',
  overflow: 'hidden'
};

const tabStyle = exports.tabStyle = {
  headline: {
    fontSize: 24,
    paddingTop: 12,
    marginBottom: 8,
    fontWeight: 400
  }
};

const tableStyle = exports.tableStyle = {
  height: '100%',
  width: '100%'
};

const tableContentStyle = exports.tableContentStyle = {
  height: '100%',
  width: '100%'
};

//AlertsTab.js
const AlertsColumns = exports.AlertsColumns = [{
  key: 'time',
  name: 'Time',
  resizable: true
}, {
  key: 'msg',
  name: 'Message',
  resizable: true
}];

//ActiveConnection.js
const ActiveConnectionColumns = exports.ActiveConnectionColumns = [{
  key: 'id',
  name: ' ',
  resizable: true,
  sortable: true
}, {
  key: 'protocol',
  name: 'Protocol',
  sortable: true,
  resizable: true
}, {
  key: 'host',
  name: 'Host',
  sortable: true,
  resizable: true
}, {
  key: 'port',
  name: 'Port',
  sortable: true,
  resizable: true
}, {
  key: 'path',
  name: 'Path',
  sortable: true,
  resizable: true
}, {
  key: 'serverMsgs',
  name: 'Server Msgs',
  sortable: true,
  resizable: true
}, {
  key: 'clientMsgs',
  name: 'Browser Msgs',
  sortable: true,
  resizable: true
}, {
  key: 'timeOpened',
  name: 'Opened',
  sortable: true,
  resizable: true
}];

//CustomTab.js
const centerText = exports.centerText = {
  textAlign: 'center',
  width: '100%'
};

//HistoryTab.js
const HistoryColumns = exports.HistoryColumns = [{
  key: 'time',
  name: 'Sent',
  resizable: true,
  sortable: true
}, {
  key: 'intercepted',
  name: 'Edited',
  resizable: true,
  sortable: true
}, {
  key: 'custom',
  name: 'Custom',
  resizable: true,
  sortable: true
}, {
  key: 'sender',
  name: 'Sender',
  resizable: true,
  sortable: true
}, {
  key: 'type',
  name: 'Type',
  resizable: true,
  sortable: true
}, {
  key: 'preview',
  name: 'Data',
  resizable: true,
  sortable: true
}, {
  key: 'binaryDisplay',
  name: 'Binary',
  resizable: true,
  sortable: true
}, {
  key: 'maskedDisplay',
  name: 'Masked',
  resizable: true,
  sortable: true
}];

//InactiveConnection.js
const InactiveConnectionColumns = exports.InactiveConnectionColumns = [{
  key: 'id',
  name: ' ',
  resizable: true,
  sortable: true,
  width: 25
}, {
  key: 'protocol',
  name: 'Protocol',
  sortable: true,
  resizable: true,
  width: 70
}, {
  key: 'host',
  name: 'Host',
  sortable: true,
  resizable: true
}, {
  key: 'port',
  name: 'Port',
  sortable: true,
  resizable: true,
  width: 50
}, {
  key: 'path',
  name: 'Path',
  sortable: true,
  resizable: true
}, {
  key: 'serverMsgs',
  name: 'Server Msgs',
  sortable: true,
  resizable: true,
  width: 100
}, {
  key: 'clientMsgs',
  name: 'Browser Msgs',
  sortable: true,
  resizable: true,
  width: 122
}, {
  key: 'timeOpened',
  name: 'Opened',
  sortable: true,
  resizable: true
}, {
  key: 'timeClosed',
  name: 'Closed',
  sortable: true,
  resizable: true
}];