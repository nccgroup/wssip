'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _react = require('react');

var _react2 = _interopRequireDefault(_react);

var _reactAutobind = require('react-autobind');

var _reactAutobind2 = _interopRequireDefault(_reactAutobind);

var _hexy = require('hexy');

var _Checkbox = require('material-ui/Checkbox');

var _Checkbox2 = _interopRequireDefault(_Checkbox);

var _TextField = require('material-ui/TextField');

var _TextField2 = _interopRequireDefault(_TextField);

var _reactDataGrid = require('react-data-grid');

var _reactDataGrid2 = _interopRequireDefault(_reactDataGrid);

var _ReactStyle = require('./_ReactStyle');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class HistoryTab extends _react2.default.Component {
  constructor(props) {
    super(props);
    (0, _reactAutobind2.default)(this);

    this.state = {
      selected: [],
      sortDirection: 'NONE',
      sortColumn: 'ASC',
      messageValue: '',
      substrLength: 12 //TODO: adjust 12 for width upon resizing, using 'react-measure'
    };
  }

  readMessage(selected) {
    let message = '';

    if (selected.length === 1 && selected[0] !== -1) {
      const msgObj = this.props.messageHistory[this.props.id][selected[0]];

      if (msgObj.binary) {
        message = (0, _hexy.hexy)(msgObj.data);
      } else if (typeof msgObj.data === 'object') {
        for (let i = 0; i < msgObj.data.length; i++) {
          message += String.fromCharCode(msgObj.data[i]);
        }
      } else {
        message = msgObj.data;
      }
    }

    return message;
  }

  onRowsSelected(rows) {
    const newSelected = this.state.selected.concat(rows.map(r => r.rowIdx));

    this.setState({
      messageValue: this.readMessage(newSelected),
      selected: newSelected
    });
  }

  onRowClick(rowId, row) {
    if (rowId === -1) return this.setState({
      selected: [],
      messageValue: ''
    });

    let selectedState = this.state.selected.slice(0);

    if (selectedState.length === 1 && selectedState[0] === rowId) {
      selectedState = [];
    } else {
      selectedState = [rowId];
    }

    this.setState({
      messageValue: this.readMessage(selectedState),
      selected: selectedState
    });
  }

  onRowsDeselected(rows) {
    let rowIndices = rows.map(r => r.rowIdx);
    let newSelected = this.state.selected.filter(i => rowIndices.indexOf(i) === -1);
    let message = newSelected.length === 1 ? this.readMessage(newSelected) : '';

    this.setState({
      messageValue: message,
      selected: newSelected
    });
  }

  render() {
    if (typeof this.props.messageHistory[this.props.id] === 'undefined') {
      return;
    }

    let msgHistory = Object.assign({}, this.props.messageHistory[this.props.id]);

    const { sortDirection, sortColumn, messageValue } = this.state;
    const { clientWidth, clientHeight } = this.props;

    if (sortDirection !== 'NONE') {
      msgHistory = msgHistory.sort((a, b) => {
        if (sortDirection === 'ASC') {
          return a[sortColumn] > b[sortColumn] ? 1 : -1;
        } else if (sortDirection === 'DESC') {
          return a[sortColumn] < b[sortColumn] ? 1 : -1;
        }
      });
    }

    return _react2.default.createElement(
      'span',
      null,
      _react2.default.createElement(
        'div',
        { style: { float: 'right', width: clientWidth * .40 + 'px', paddingLeft: '5px' } },
        _react2.default.createElement('textarea', {
          style: {
            width: `${clientWidth * .40 - 5}px`,
            height: `${clientHeight - 60}px`,
            resize: 'none',
            borderStyle: 'none',
            borderColor: 'transparent'
          },
          readOnly: true,
          value: messageValue,
          id: 'historyMessage'
        })
      ),
      _react2.default.createElement(
        'div',
        { style: { float: 'right', width: this.props.clientWidth * .60 + 'px', clear: 'none !important' } },
        _react2.default.createElement(_reactDataGrid2.default, {
          onGridSort: (col, dir) => this.setState({ sortColumn: col, sortDirection: dir }),
          columns: _ReactStyle.HistoryColumns,
          rowGetter: i => Object.assign({}, msgHistory[i]),
          rowsCount: this.props.messageHistory[this.props.id].length,
          onRowClick: this.onRowClick,
          rowSelection: {
            showCheckbox: false,
            enableShiftSelect: true,
            onRowsSelected: this.onRowsSelected,
            onRowsDeselected: this.onRowsDeselected,
            selectBy: { indexes: this.state.selected }
          },
          minHeight: this.props.clientHeight - 48
        })
      )
    );
  }
}
exports.default = HistoryTab;