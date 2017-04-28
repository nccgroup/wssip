import React from 'react';
import autoBind from 'react-autobind';
import ReactDataGrid from 'react-data-grid';

import {AlertsColumns} from './_ReactStyle';

export default class AlertsTab extends React.Component {
  constructor(props) {
    super(props);
    autoBind(this);
  }

  render() {
    const {height, alerts} = this.props;

    return (
      <div style={{height: '100%'}}>
        <ReactDataGrid
          columns={AlertsColumns}
          rowGetter={(i) => Object.assign({}, alerts[i])}
          rowsCount={this.props.alerts.length}
          minHeight={height}
        />
      </div>
    );
  }
}
