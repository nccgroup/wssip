import React from 'react';
import autoBind from 'react-autobind';
import {hexy} from 'hexy';

import Checkbox from 'material-ui/Checkbox';
import TextField from 'material-ui/TextField';
import Bootstrap from 'bootstrap/dist/css/bootstrap.css';
import ReactDataGrid from 'react-data-grid';
import {HistoryColumns} from './_ReactStyle';

export default class HistoryTab extends React.Component {
  constructor(props) {
    super(props);
    autoBind(this);

    this.state = {
      selected: [],
      sortDirection: 'NONE',
      sortColumn: 'ASC',
      messageValue: '',
      substrLength: 12 //TODO: adjust 12 for width upon resizing, using 'react-measure'
    }
  }

  readMessage(selected) {
    let message = '';

    if(selected.length === 1 && selected[0] !== -1) {
      const msgObj = this.props.messageHistory[this.props.id][selected[0]];

      if(typeof msgObj.data === 'object') {
        message = hexy(msgObj.data);
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
    if(typeof this.props.messageHistory[this.props.id] === 'undefined') {
      return;
    }

    let msgHistory = Object.assign({}, this.props.messageHistory[this.props.id]);

    const {sortDirection, sortColumn, messageValue} = this.state;
    const {clientWidth, clientHeight} = this.props;

    if(sortDirection !== 'NONE') {
      msgHistory = msgHistory.sort((a, b) => {
        if(sortDirection === 'ASC') {
          return (a[sortColumn] > b[sortColumn]) ? 1 : -1;
        } else if(sortDirection === 'DESC') {
          return (a[sortColumn] < b[sortColumn]) ? 1 : -1;
        }
      });
    }

    return (
      <span>
        <div style={{float: 'right', width: (clientWidth * .40) + 'px', paddingLeft: '5px' }}>
          <textarea
            style={{
              width: `${(clientWidth * .40) - 5}px`,
              height: `${clientHeight - 60}px`,
              resize: 'none',
              borderStyle: 'none',
              borderColor: 'transparent'
            }}
            readOnly={true}
            value={messageValue}
            id="historyMessage"
          />
        </div>
        <div style={{float: 'right', width: (this.props.clientWidth * .60) + 'px', clear: 'none !important'}}>
    			<ReactDataGrid
    			  onGridSort={(col, dir) => this.setState({ sortColumn: col, sortDirection: dir })}
    			  columns={HistoryColumns}
    			  rowGetter={i => Object.assign({}, msgHistory[i])}
    			  rowsCount={this.props.messageHistory[this.props.id].length}
    			  onRowClick={this.onRowClick}
    			  rowSelection={{
      				showCheckbox: false,
      				enableShiftSelect: true,
      				onRowsSelected: this.onRowsSelected,
      				onRowsDeselected: this.onRowsDeselected,
      				selectBy: { indexes: this.state.selected }
    			  }}
            minHeight={this.props.clientHeight - 48}
    			/>
    		</div>
      </span>
    );
  }
}
