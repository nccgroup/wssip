import {ipcRenderer} from 'electron';
import React from 'react';
import autoBind from 'react-autobind';
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
    ipcRenderer.send('debug', 'InactiveConnection', `onRowsSelected: rows = ${rows}`);

    let newSelected = this.state.selected.concat(rows.map(r => r.rowIdx));

    this.setState({ selected: newSelected }, () => {
      this.props.onSelectConnection(newSelected[0]);
      ipcRenderer.send('debug', 'InactiveConnection', `onRowsSelected: state.selected = ${JSON.stringify(newSelected)}`);
    });
  }

  onRowClick(rowId, row) {
    ipcRenderer.send('debug', 'InactiveConnection', `onRowClick: rowId = ${rowId}`);
    ipcRenderer.send('debug', 'InactiveConnection', `onRowClick: row = ${JSON.stringify(row)}`);

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
      ipcRenderer.send('debug', 'InactiveConnection', `onRowClick: state.selected = ${JSON.stringify(selectedState)}`);

      let ids = [];
      this.state.selected.forEach(rowId => ids.push(this.props.list[rowId].id));

      ipcRenderer.send('debug', 'InactiveConnection', `onRowClick: sending id array ${JSON.stringify(ids)}`);
      this.props.onSelectConnection(ids);
    });
  }

  onRowsDeselected(rows) {
    ipcRenderer.send('debug', 'InactiveConnection', `onRowsDeselected: rows = ${rows}`);

    const rowIndices = rows.map(r => r.rowIdx);
    const newSelected = this.state.selected.filter(i => rowIndices.indexOf(i) === -1);

    this.setState({ selected: newSelected }, () => {
      this.props.onSelectConnection(newSelected);
      ipcRenderer.send('debug', 'InactiveConnection', `onRowsDeselected: state.selected = ${JSON.stringify(newSelected)}`);
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
