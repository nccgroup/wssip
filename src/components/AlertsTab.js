import React from 'react';
import Bootstrap from 'bootstrap/dist/css/bootstrap.css';
import ReactDataGrid from 'react-data-grid';

import {AlertsColumns} from './_ReactStyle';

export default class AlertsTab extends React.Component {
  constructor(props) {
    super(props);
  }

  render() {
    const {height, alerts} = this.props;

    return (
      <div style={{height: '100%'}}>
        <ReactDataGrid
          columns={AlertsColumns}
          rowGetter={i => Object.assign({}, alerts[i])}
          rowsCount={alerts.length}
          minHeight={height}
        />
      </div>
    );
  }
}
