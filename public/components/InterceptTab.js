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

var _RowRenderer = require('./_RowRenderer');

var _RowRenderer2 = _interopRequireDefault(_RowRenderer);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class InterceptTab extends _react2.default.Component {
  constructor(props) {
    super(props);
    (0, _reactAutobind2.default)(this);

    this.state = {
      editing: { client: false, server: false },
      waiting: { client: '', server: '' },
      interceptValue: { client: '', server: '' },
      menu: { client: 'message', server: 'message' },
      interceptionOn: { client: false, server: false },
      isBinary: { client: false, server: false },
      isMasked: { client: false, server: false }
    };
  }

  componentWillReceiveProps(nextProps) {
    const { waiting, editing, interceptionOn, interceptValue, menu } = this.state;

    ['client', 'server'].forEach(sender => {
      if (nextProps.heldForIntercept[sender] !== false) {
        waiting[sender] = nextProps.heldForIntercept[sender].length > 0 ? `(${nextProps.heldForIntercept[sender].length} messages waiting)` : '';
        nextProps.ipcRenderer.send('debug', 'InterceptTab', `this.state.waiting[${sender}] = ${waiting[sender]}`);

        if (interceptionOn[sender] && editing[sender] === false && nextProps.heldForIntercept[sender].length > 0) {
          editing[sender] = true;
          interceptValue[sender] = nextProps.heldForIntercept[sender][0].data === null ? '' : nextProps.heldForIntercept[sender][0].data;
          menu[sender] = nextProps.heldForIntercept[sender][0].type;
        }
      } else {
        waiting[sender] = '';
        editing[sender] = false;
      }
    });

    this.setState({
      waiting: waiting,
      editing: editing,
      interceptionOn: interceptionOn,
      interceptValue: interceptValue,
      menu: menu
    });

    return true;
  }

  resetToDefault(sender) {
    const { editing, isMasked, isBinary, interceptValue, menu } = this.state;

    isMasked[sender] = false;
    isBinary[sender] = false;
    interceptValue[sender] = '';
    menu[sender] = 'message';
    editing[sender] = false;

    this.setState({
      editing: editing,
      isMasked: isMasked,
      isBinary: isBinary,
      interceptValue: interceptValue,
      menu: menu,
      editing: editing
    });
  }

  handleSendClick(sender) {
    const { id, heldForIntercept } = this.props;
    const direction = sender === 'client' ? 'server' : 'client';

    this.props.onMessageSent(id, direction, this.state.menu[sender], this.state.interceptValue[sender], this.state.isBinary[sender], this.state.isMasked[sender], heldForIntercept[sender][0].data !== this.state.interceptValue[sender], true, false);

    this.handleDiscardClick(sender, id);
  }

  handleDiscardClick(sender, id) {
    this.resetToDefault(sender);
    this.props.retrieveMessage(id, sender, 0);
  }

  onToggleInterceptState(sender, checked) {
    const { interceptionOn } = this.state;
    interceptionOn[sender] = checked;

    this.setState({ interceptionOn: interceptionOn }, () => this.props.onToggleInterceptState(this.props.id, sender, checked));
  }

  changeVal(sender, name, val) {
    let currentState = this.state;
    let tmp = currentState[name];
    tmp[sender] = val;
    currentState[name] = tmp;
    this.setState(currentState);
  }

  render() {
    const textareaHeight = (this.props.clientHeight - 235) / 2 - 5;

    return _react2.default.createElement(
      'div',
      null,
      _react2.default.createElement(_AppBar2.default, {
        title: _react2.default.createElement(
          'span',
          { style: _ReactStyle.centerText },
          'Data from Server ',
          this.state.waiting.server
        ),
        iconElementLeft: _react2.default.createElement(
          'div',
          null,
          _react2.default.createElement(_Toggle2.default, {
            label: 'Intercept',
            onToggle: (event, checked) => this.onToggleInterceptState('server', checked)
          }),
          _react2.default.createElement(_Toggle2.default, {
            label: 'Binary',
            onToggle: (event, checked) => this.changeVal('server', 'isBinary', checked)
          }),
          _react2.default.createElement(_Toggle2.default, {
            label: 'Masked',
            onToggle: (event, checked) => this.changeVal('server', 'isMasked', checked)
          })
        ),
        iconElementRight: _react2.default.createElement(
          'div',
          null,
          _react2.default.createElement(
            _DropDownMenu2.default,
            {
              value: this.state.menu.server,
              onChange: (event, index, value) => this.changeVal('server', 'menu', value)
            },
            _react2.default.createElement(_MenuItem2.default, { value: 'message', primaryText: 'Message' }),
            _react2.default.createElement(_MenuItem2.default, { value: 'ping', primaryText: 'Ping' }),
            _react2.default.createElement(_MenuItem2.default, { value: 'pong', primaryText: 'Pong' })
          ),
          _react2.default.createElement(_FlatButton2.default, {
            label: 'Discard',
            onTouchTap: e => this.handleDiscardClick('server')
          }),
          _react2.default.createElement(_FlatButton2.default, {
            label: 'Send',
            onTouchTap: e => this.handleSendClick('server')
          })
        )
      }),
      _react2.default.createElement('textarea', {
        style: { width: '100%', height: textareaHeight },
        name: 'serverIntercept',
        value: this.state.interceptValue.server,
        onChange: (event, value) => this.changeVal('server', 'interceptValue', value)
      }),
      _react2.default.createElement(_AppBar2.default, {
        title: _react2.default.createElement(
          'span',
          { style: _ReactStyle.centerText },
          'Data from Client ',
          this.state.waiting.client
        ),
        iconElementLeft: _react2.default.createElement(
          'div',
          null,
          _react2.default.createElement(_Toggle2.default, {
            label: 'Intercept',
            onToggle: (event, checked) => this.onToggleInterceptState('client', checked)
          }),
          _react2.default.createElement(_Toggle2.default, {
            label: 'Binary',
            onToggle: (event, checked) => this.changeVal('client', 'isBinary', checked)
          }),
          _react2.default.createElement(_Toggle2.default, {
            label: 'Masked',
            onToggle: (event, checked) => this.changeVal('client', 'isMasked', checked)
          })
        ),
        iconElementRight: _react2.default.createElement(
          'div',
          null,
          _react2.default.createElement(
            _DropDownMenu2.default,
            {
              value: this.state.menu.client,
              onChange: (event, index, value) => this.changeVal('client', 'menu', value)
            },
            _react2.default.createElement(_MenuItem2.default, { value: 'message', primaryText: 'Message' }),
            _react2.default.createElement(_MenuItem2.default, { value: 'ping', primaryText: 'Ping' }),
            _react2.default.createElement(_MenuItem2.default, { value: 'pong', primaryText: 'Pong' })
          ),
          _react2.default.createElement(_FlatButton2.default, {
            label: 'Discard',
            onTouchTap: e => this.handleDiscardClick('client')
          }),
          _react2.default.createElement(_FlatButton2.default, {
            label: 'Send',
            onTouchTap: e => this.handleSendClick('client')
          })
        )
      }),
      _react2.default.createElement('textarea', {
        style: { width: '100%', height: textareaHeight },
        name: 'clientIntercept',
        value: this.state.interceptValue.client,
        onChange: (event, value) => this.changeVal('client', 'interceptValue', value)
      })
    );
  }
}
exports.default = InterceptTab;