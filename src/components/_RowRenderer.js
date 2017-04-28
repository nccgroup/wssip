import React, {Component} from 'react';
import autoBind from 'react-autobind';

import {Row} from 'react-data-grid';

class RowRenderer extends Component {
  constructor(props) {
    super(props);
    autoBind(this);
  }

  setScrollLeft(s) {
    this.row.setScrollLeft(s);
  }

  getStyle() {
    return {
      color: this.props.hasIntercepts ? 'red' : 'white'
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

export default RowRenderer;
