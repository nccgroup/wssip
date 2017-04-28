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

class ActiveConnection extends _react2.default.Component {
  constructor(props) {
    super(props);
    (0, _reactAutobind2.default)(this);

    this.state = {
      selected: [],
      sortDirection: 'NONE',
      sortColumn: 'ASC'
    };
  }

  onRowsSelected(rows) {
    this.props.ipcRenderer.send('debug', 'ActiveConnection', `onRowsSelected: rows = ${rows}`);

    let newSelected = this.state.selected.concat(rows.map(r => r.rowIdx));

    this.setState({ selected: newSelected }, () => {
      this.props.onSelectConnection(newSelected[0]);
      this.props.ipcRenderer.send('debug', 'ActiveConnection', `onRowsSelected: state.selected = ${JSON.stringify(newSelected)}`);
    });
  }

  onRowClick(rowId, row) {
    this.props.ipcRenderer.send('debug', 'ActiveConnection', `onRowClick: rowId = ${rowId}`);
    this.props.ipcRenderer.send('debug', 'ActiveConnection', `onRowClick: row = ${JSON.stringify(row)}`);

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

    this.setState({ selected: selectedState }, () => {
      this.props.ipcRenderer.send('debug', 'ActiveConnection', `onRowClick: state.selected = ${JSON.stringify(selectedState)}`);

      let ids = [];
      this.state.selected.forEach(rowId => ids.push(this.props.list[rowId].id));

      this.props.ipcRenderer.send('debug', 'ActiveConnection', `onRowClick: sending id array ${JSON.stringify(ids)}`);
      this.props.onSelectConnection(ids);
    });
  }

  onRowsDeselected(rows) {
    this.props.ipcRenderer.send('debug', 'ActiveConnection', `onRowsDeselected: rows = ${rows}`);

    const rowIndices = rows.map(r => r.rowIdx);
    const newSelected = this.state.selected.filter(i => rowIndices.indexOf(i) === -1);

    this.setState({ selected: newSelected }, () => {
      this.props.onSelectConnection(newSelected);
      this.props.ipcRenderer.send('debug', 'ActiveConnection', `onRowsDeselected: state.selected = ${JSON.stringify(newSelected)}`);
    });
  }

  render() {
    let { list } = this.props;
    const { height } = this.props;
    const { sortDirection, sortColumn, selected } = this.state;

    if (sortDirection !== 'NONE') {
      list = list.sort((a, b) => {
        if (sortDirection === 'ASC') {
          return a[sortColumn] > b[sortColumn] ? 1 : -1;
        } else if (sortDirection === 'DESC') {
          return a[sortColumn] < b[sortColumn] ? 1 : -1;
        }
      });
    }

    return _react2.default.createElement(
      'div',
      { style: { height: '100%' } },
      _react2.default.createElement(_reactDataGrid2.default, {
        onGridSort: (col, dir) => this.setState({ sortColumn: col, sortDirection: dir }),
        columns: _ReactStyle.ActiveConnectionColumns,
        rowGetter: i => Object.assign({}, list[i]),
        rowsCount: this.props.list.length,
        onRowClick: this.onRowClick,
        rowSelection: {
          showCheckbox: false,
          enableShiftSelect: true,
          onRowsSelected: this.onRowsSelected,
          onRowsDeselected: this.onRowsDeselected,
          selectBy: { indexes: selected }
        },
        minHeight: height
      })
    );
  }
}
exports.default = ActiveConnection;