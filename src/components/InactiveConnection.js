import React from 'react';
import autoBind from 'react-autobind';
import Bootstrap from 'bootstrap/dist/css/bootstrap.css';
import ReactDataGrid from 'react-data-grid';
import {InactiveConnectionColumns} from './_ReactStyle';

export default class InactiveConnection extends React.Component {
  constructor(props) {
    super(props);
    autoBind(this);

    this.state = {
      selected: [],
      sortDirection: 'NONE',
      sortColumn: 'ASC'
    }
  }

  onRowsSelected(rows) {
    this.props.ipcRenderer.send('debug', 'InactiveConnection', `onRowsSelected: rows = ${rows}`);

    let newSelected = this.state.selected.concat(rows.map(r => r.rowIdx));

    this.setState({ selected: newSelected }, () => {
      this.props.onSelectConnection(newSelected[0]);
      this.props.ipcRenderer.send('debug', 'InactiveConnection', `onRowsSelected: state.selected = ${JSON.stringify(newSelected)}`);
    });
  }

  onRowClick(rowId, row) {
    this.props.ipcRenderer.send('debug', 'InactiveConnection', `onRowClick: rowId = ${rowId}`);
    this.props.ipcRenderer.send('debug', 'InactiveConnection', `onRowClick: row = ${JSON.stringify(row)}`);

    if(rowId === -1)
      return this.setState({
        selected: [],
        messageValue: ''
      });

    let selectedState = this.state.selected.slice(0);

    if(selectedState.length === 1 && (selectedState[0] === rowId)) {
      selectedState = [];
    } else {
      selectedState = [rowId];
    }

    this.setState({ selected: selectedState }, () => {
      this.props.ipcRenderer.send('debug', 'InactiveConnection', `onRowClick: state.selected = ${JSON.stringify(selectedState)}`);

      let ids = [];
      this.state.selected.forEach(rowId => ids.push(this.props.list[rowId].id));

      this.props.ipcRenderer.send('debug', 'InactiveConnection', `onRowClick: sending id array ${JSON.stringify(ids)}`);
      this.props.onSelectConnection(ids);
    });
  }

  onRowsDeselected(rows) {
    this.props.ipcRenderer.send('debug', 'InactiveConnection', `onRowsDeselected: rows = ${rows}`);

    const rowIndices = rows.map(r => r.rowIdx);
    const newSelected = this.state.selected.filter(i => rowIndices.indexOf(i) === -1);

    this.setState({ selected: newSelected }, () => {
      this.props.onSelectConnection(newSelected);
      this.props.ipcRenderer.send('debug', 'InactiveConnection', `onRowsDeselected: state.selected = ${JSON.stringify(newSelected)}`);
    });
  }

  render() {
    let {list} = this.props;
    const {sortDirection, sortColumn} = this.state;

    if(sortDirection !== 'NONE') {
      list = list.sort((a, b) => {
        if(sortDirection === 'ASC') {
          return (a[sortColumn] > b[sortColumn]) ? 1 : -1;
        } else if(sortDirection === 'DESC') {
          return (a[sortColumn] < b[sortColumn]) ? 1 : -1;
        }
      });
    }

    return (
      <div style={{height: '100%'}}>
        <ReactDataGrid
          onGridSort={(col, dir) => this.setState({ sortColumn: col, sortDirection: dir })}
          columns={InactiveConnectionColumns}
          rowGetter={i => Object.assign({}, list[i])}
          rowsCount={this.props.list.length}
          onRowClick={this.onRowClick}
          rowSelection={{
            showCheckbox: false,
            enableShiftSelect: true,
            onRowsSelected: this.onRowsSelected,
            onRowsDeselected: this.onRowsDeselected,
            selectBy: { indexes: this.state.selected }
          }}
          minHeight={this.props.height}
        />
      </div>
    );
  }
}
