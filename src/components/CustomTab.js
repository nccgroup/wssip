import React from 'react';
import autoBind from 'react-autobind';

import AppBar from 'material-ui/AppBar';
import FlatButton from 'material-ui/FlatButton';
import Toggle from 'material-ui/Toggle';
import DropDownMenu from 'material-ui/DropDownMenu';
import MenuItem from 'material-ui/MenuItem';
import TextField from 'material-ui/TextField';
import {centerText} from './_ReactStyle';

export default class CustomTab extends React.Component {
  constructor(props) {
    super(props);
    autoBind(this);

    this.state = {
      serverIsBinary: false,
      clientIsBinary: false,
      sendServerValue: '',
      sendClientValue: '',
      sendServerMenu: 'message',
      sendClientMenu: 'message'
    }
  }

  handleSendServerClick() {
    this.props.onMessageSent(
      this.props.id,
      'server',
      this.state.sendServerMenu,
      this.state.sendServerValue,
      this.state.serverIsBinary,
      false,
      true
    );
  }

  handleSendClientClick() {
    this.props.onMessageSent(
      this.props.id,
      'client',
      this.state.sendClientMenu,
      this.state.sendClientValue,
      this.state.clientIsBinary,
      false,
      true
    );
  }

  render() {
    const textareaHeight = ((this.props.clientHeight - 202) / 2) - 5;

    return (
      <div>
        <AppBar
          title={<span style={centerText}>Send to Server</span>}
          iconElementLeft={
            <div>
              <Toggle
                label="Binary"
                onToggle={(event, checked) => this.setState({ serverIsBinary: checked })}
              />
            </div>
          }
          iconElementRight={
            <div>
              <DropDownMenu
                value={this.state.sendServerMenu}
                onChange={(event, index, value) => this.setState({ sendServerMenu: value })}
              >
                <MenuItem value="message" primaryText="Message" />
                <MenuItem value="ping" primaryText="Ping" />
                <MenuItem value="pong" primaryText="Pong" />
              </DropDownMenu>
              <FlatButton
                label="Send"
                onTouchTap={this.handleSendServerClick}
              />
            </div>
          }
        />
        <textarea
          style={{width: '100%', height: textareaHeight}}
          onChange={e => this.setState({ sendServerValue: e.target.value })}
          value={this.state.sendServerValue}
          id="sendServer"
        />
        <AppBar
          title={<span style={centerText}>Send to Client</span>}
          iconElementLeft={
            <div>
              <Toggle
                label="Binary"
                onToggle={(event, checked) => this.setState({ clientIsBinary: checked })}
              />
            </div>
          }
          iconElementRight={
            <div>
              <DropDownMenu
                value={this.state.sendClientMenu}
                onChange={(event, index, value) => this.setState({ sendClientMenu: value })}
              >
                <MenuItem value="message" primaryText="Message" />
                <MenuItem value="ping" primaryText="Ping" />
                <MenuItem value="pong" primaryText="Pong" />
              </DropDownMenu>
              <FlatButton
                label="Send"
                onTouchTap={this.handleSendClientClick}
              />
            </div>
          }
        />
        <textarea
          style={{width: '100%', height: textareaHeight}}
          onChange={e => this.setState({ sendClientValue: e.target.value })}
          value={this.state.sendClientValue}
          id="sendClient"
        />
      </div>
    );
  }
}
