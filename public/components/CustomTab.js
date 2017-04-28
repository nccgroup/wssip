'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _react = require('react');

var _react2 = _interopRequireDefault(_react);

var _reactAutobind = require('react-autobind');

var _reactAutobind2 = _interopRequireDefault(_reactAutobind);

var _AppBar = require('material-ui/AppBar');

var _AppBar2 = _interopRequireDefault(_AppBar);

var _FlatButton = require('material-ui/FlatButton');

var _FlatButton2 = _interopRequireDefault(_FlatButton);

var _Toggle = require('material-ui/Toggle');

var _Toggle2 = _interopRequireDefault(_Toggle);

var _DropDownMenu = require('material-ui/DropDownMenu');

var _DropDownMenu2 = _interopRequireDefault(_DropDownMenu);

var _MenuItem = require('material-ui/MenuItem');

var _MenuItem2 = _interopRequireDefault(_MenuItem);

var _TextField = require('material-ui/TextField');

var _TextField2 = _interopRequireDefault(_TextField);

var _ReactStyle = require('./_ReactStyle');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class CustomTab extends _react2.default.Component {
  constructor(props) {
    super(props);
    (0, _reactAutobind2.default)(this);

    this.state = {
      serverIsBinary: false,
      serverIsMasked: false,
      clientIsBinary: false,
      clientIsMasked: false,
      sendServerValue: '',
      sendClientValue: '',
      sendServerMenu: 'message',
      sendClientMenu: 'message'
    };
  }

  handleSendServerClick() {
    this.props.onMessageSent(this.props.id, 'server', this.state.sendServerMenu, this.state.sendServerValue, this.state.serverIsBinary, this.state.serverIsMasked, false, true);
  }

  handleSendClientClick() {
    this.props.onMessageSent(this.props.id, 'client', this.state.sendClientMenu, this.state.sendClientValue, this.state.clientIsBinary, this.state.clientIsMasked, false, true);
  }

  render() {
    const textareaHeight = (this.props.clientHeight - 202) / 2 - 5;

    return _react2.default.createElement(
      'div',
      null,
      _react2.default.createElement(_AppBar2.default, {
        title: _react2.default.createElement(
          'span',
          { style: _ReactStyle.centerText },
          'Send to Server'
        ),
        iconElementLeft: _react2.default.createElement(
          'div',
          null,
          _react2.default.createElement(_Toggle2.default, {
            label: 'Binary',
            onToggle: (event, checked) => this.setState({ serverIsBinary: checked })
          }),
          _react2.default.createElement(_Toggle2.default, {
            label: 'Masked',
            onToggle: (event, checked) => this.setState({ serverIsMasked: checked })
          })
        ),
        iconElementRight: _react2.default.createElement(
          'div',
          null,
          _react2.default.createElement(
            _DropDownMenu2.default,
            {
              value: this.state.sendServerMenu,
              onChange: (event, index, value) => this.setState({ sendServerMenu: value })
            },
            _react2.default.createElement(_MenuItem2.default, { value: 'message', primaryText: 'Message' }),
            _react2.default.createElement(_MenuItem2.default, { value: 'ping', primaryText: 'Ping' }),
            _react2.default.createElement(_MenuItem2.default, { value: 'pong', primaryText: 'Pong' })
          ),
          _react2.default.createElement(_FlatButton2.default, {
            label: 'Send',
            onTouchTap: this.handleSendServerClick
          })
        )
      }),
      _react2.default.createElement('textarea', {
        style: { width: '100%', height: textareaHeight },
        onChange: e => this.setState({ sendServerValue: e.target.value }),
        value: this.state.sendServerValue,
        id: 'sendServer'
      }),
      _react2.default.createElement(_AppBar2.default, {
        title: _react2.default.createElement(
          'span',
          { style: _ReactStyle.centerText },
          'Send to Client'
        ),
        iconElementLeft: _react2.default.createElement(
          'div',
          null,
          _react2.default.createElement(_Toggle2.default, {
            label: 'Binary',
            onToggle: (event, checked) => this.setState({ clientIsBinary: checked })
          }),
          _react2.default.createElement(_Toggle2.default, {
            label: 'Masked',
            onToggle: (event, checked) => this.setState({ clientIsMasked: checked })
          })
        ),
        iconElementRight: _react2.default.createElement(
          'div',
          null,
          _react2.default.createElement(
            _DropDownMenu2.default,
            {
              value: this.state.sendClientMenu,
              onChange: (event, index, value) => this.setState({ sendClientMenu: value })
            },
            _react2.default.createElement(_MenuItem2.default, { value: 'message', primaryText: 'Message' }),
            _react2.default.createElement(_MenuItem2.default, { value: 'ping', primaryText: 'Ping' }),
            _react2.default.createElement(_MenuItem2.default, { value: 'pong', primaryText: 'Pong' })
          ),
          _react2.default.createElement(_FlatButton2.default, {
            label: 'Send',
            onTouchTap: this.handleSendClientClick
          })
        )
      }),
      _react2.default.createElement('textarea', {
        style: { width: '100%', height: textareaHeight },
        onChange: e => this.setState({ sendClientValue: e.target.value }),
        value: this.state.sendClientValue,
        id: 'sendClient'
      })
    );
  }
}
exports.default = CustomTab;