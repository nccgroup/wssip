import React from 'react';
import autoBind from 'react-autobind';
import {Row} from 'react-data-grid';

export default class RowRenderer extends React.Component {

  constructor(props) {
    super(props);
    autoBind(this);
  }

  setScrollLeft(s) {
    this.row.setScrollLeft(s);
  }

  getStyle() {
    const {client, server} = this.props.heldForIntercepts[this.row.id];
    const hasWaitingMessages = (client !== false && client.length > 0) || (server !== false && server.length > 0);

    return {
      color: hasWaitingMessages ? 'red' : 'black'
    }
  }

  render() {
    return (
      <div style={this.getStyle()}>
        <Row ref={node => this.row = node} {...this.props} />
      </div>
    );
  }
}
