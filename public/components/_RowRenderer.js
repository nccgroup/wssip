'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _react = require('react');

var _react2 = _interopRequireDefault(_react);

var _reactAutobind = require('react-autobind');

var _reactAutobind2 = _interopRequireDefault(_reactAutobind);

var _reactDataGrid = require('react-data-grid');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class RowRenderer extends _react.Component {
  constructor(props) {
    super(props);
    (0, _reactAutobind2.default)(this);
  }

  setScrollLeft(s) {
    this.row.setScrollLeft(s);
  }

  getStyle() {
    return {
      color: this.props.hasIntercepts ? 'red' : 'white'
    };
  }

  render() {
    return _react2.default.createElement(
      'div',
      { style: this.getStyle() },
      _react2.default.createElement(_reactDataGrid.Row, _extends({ ref: node => this.row = node }, this.props))
    );
  }
}

exports.default = RowRenderer;