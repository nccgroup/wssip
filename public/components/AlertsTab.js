'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _react = require('react');

var _react2 = _interopRequireDefault(_react);

var _reactAutobind = require('react-autobind');

var _reactAutobind2 = _interopRequireDefault(_reactAutobind);

var _reactDataGrid = require('react-data-grid');

var _reactDataGrid2 = _interopRequireDefault(_reactDataGrid);

var _ReactStyle = require('./_ReactStyle');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class AlertsTab extends _react2.default.Component {
  constructor(props) {
    super(props);
    (0, _reactAutobind2.default)(this);
  }

  render() {
    var _props = this.props;
    const height = _props.height,
          alerts = _props.alerts;


    return _react2.default.createElement(
      'div',
      { style: { height: '100%' } },
      _react2.default.createElement(_reactDataGrid2.default, {
        columns: _ReactStyle.AlertsColumns,
        rowGetter: i => Object.assign({}, alerts[i]),
        rowsCount: this.props.alerts.length,
        minHeight: height
      })
    );
  }
}
exports.default = AlertsTab;