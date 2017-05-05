import React from 'react';
import autoBind from 'react-autobind';
import {Row} from 'react-data-grid';

export default class RowRenderer extends React.Component {

  constructor(props) {
    super(props);
    autoBind(this);

    this.row = null;
  }

  setScrollLeft(s) {
    this.row.setScrollLeft(s);
  }

  getStyle() {
    let style = {};

    if(this.row != null && typeof this.row.props.rowData !== 'undefined') {
      const {heldForIntercepts} = this.props;
      let id = this.row.props.rowData.id;
      let style = {};

      if(heldForIntercepts != null && id != null) {
        const {client, server} = heldForIntercepts;

        if(client !== false && client.length !== 0) {
          style.color = 'red';
        } else if(server !== false && server.length !== 0) {
          style.color = 'red';
        }
      }
    }

    return style;
  }

  render() {
    return (
      <div style={this.getStyle()}>
        <Row ref={node => this.row = node} {...this.props} />
      </div>
    );
  }
}
