import React from 'react';
import autoBind from 'react-autobind';

import AppBar from 'material-ui/AppBar';
import FlatButton from 'material-ui/FlatButton';
import Toggle from 'material-ui/Toggle';
import DropDownMenu from 'material-ui/DropDownMenu';
import MenuItem from 'material-ui/MenuItem';
import TextField from 'material-ui/TextField';

import {centerText} from './_ReactStyle';
import RowRenderer from './_RowRenderer';

export default class InterceptTab extends React.Component {
  constructor(props) {
    super(props);
    autoBind(this);

    this.state = {
      editing: {client: false, server: false},
      waiting: {client: '', server: ''},
      interceptValue: {client: '', server: ''},
      menu: {client: 'message', server: 'message'},
      interceptionOn: {client: false, server: false},
      isBinary: {client: false, server: false}
    }
  }

  componentWillReceiveProps(nextProps) {
    const {waiting, editing, interceptionOn, interceptValue, menu} = this.state;

    ['client', 'server'].forEach(sender => {
      if(nextProps.heldForIntercept[sender] !== false) {
        waiting[sender] = nextProps.heldForIntercept[sender].length > 0 ? `(${nextProps.heldForIntercept[sender].length} messages waiting)` : '';
        nextProps.ipcRenderer.send('debug', 'InterceptTab', `this.state.waiting[${sender}] = ${waiting[sender]}`);

        if(interceptionOn[sender] && editing[sender] === false && nextProps.heldForIntercept[sender].length > 0) {
          editing[sender] = true;
          interceptValue[sender] = nextProps.heldForIntercept[sender][0].data === null ? '' : nextProps.heldForIntercept[sender][0].data;
          menu[sender] = nextProps.heldForIntercept[sender][0].type;
        }
      } else {
        waiting[sender] = '';
        editing[sender] = false;
      }
    });

    this.setState({
      waiting: waiting,
      editing: editing,
      interceptionOn: interceptionOn,
      interceptValue: interceptValue,
      menu: menu
    });

    return true;
  }

  resetToDefault(sender) {
    const {editing, isBinary, interceptValue, menu} = this.state;

    isBinary[sender] = false;
    interceptValue[sender] = '';
    menu[sender] = 'message';
    editing[sender] = false;

    this.setState({
      editing: editing,
      isBinary: isBinary,
      interceptValue: interceptValue,
      menu: menu,
      editing: editing
    });
  }

  handleSendClick(sender) {
    const {id, heldForIntercept} = this.props;
    const direction = sender === 'client' ? 'server' : 'client';

    this.props.onMessageSent(
      id,
      direction,
      this.state.menu[sender],
      this.state.interceptValue[sender],
      this.state.isBinary[sender],
      (heldForIntercept[sender][0].data !== this.state.interceptValue[sender]),
      true,
      false
    );

    this.handleDiscardClick(sender, id);
  }

  handleDiscardClick(sender, id) {
    this.resetToDefault(sender);
    this.props.retrieveMessage(id, sender, 0);
  }

  onToggleInterceptState(sender, checked) {
    const {interceptionOn} = this.state;
    interceptionOn[sender] = checked;

    this.setState({ interceptionOn: interceptionOn },
      () => this.props.onToggleInterceptState(this.props.id, sender, checked));
  }

  changeVal(sender, name, val) {
    let currentState = this.state;
    let tmp = currentState[name];
    tmp[sender] = val;
    currentState[name] = tmp;
    this.setState(currentState);
  }

  render() {
    const textareaHeight = ((this.props.clientHeight - 235) / 2) - 5;

    return (
      <div>
        <AppBar
          title={<span style={centerText}>Data from Server {this.state.waiting.server}</span>}
          iconElementLeft={
            <div>
              <Toggle
                label="Intercept"
                onToggle={(event, checked) => this.onToggleInterceptState('server', checked)}
              />
              <Toggle
                label="Binary"
                onToggle={(event, checked) => this.changeVal('server', 'isBinary', checked)}
              />
            </div>
          }
          iconElementRight={
            <div>
              <DropDownMenu
                value={this.state.menu.server}
                onChange={(event, index, value) => this.changeVal('server', 'menu', value)}
              >
                <MenuItem value="message" primaryText="Message" />
                <MenuItem value="ping" primaryText="Ping" />
                <MenuItem value="pong" primaryText="Pong" />
              </DropDownMenu>
              <FlatButton
                label="Discard"
                onTouchTap={e => this.handleDiscardClick('server')}
              />
              <FlatButton
                label="Send"
                onTouchTap={e => this.handleSendClick('server')}
              />
            </div>
          }
        />
        <textarea
          style={{width: '100%', height: textareaHeight }}
          name="serverIntercept"
          value={this.state.interceptValue.server}
          onChange={(event, value) => this.changeVal('server', 'interceptValue', value)}
        />
        <AppBar
          title={<span style={centerText}>Data from Client {this.state.waiting.client}</span>}
          iconElementLeft={
            <div>
              <Toggle
                label="Intercept"
                onToggle={(event, checked) => this.onToggleInterceptState('client', checked)}
              />
              <Toggle
                label="Binary"
                onToggle={(event, checked) => this.changeVal('client', 'isBinary', checked)}
              />
            </div>
          }
          iconElementRight={
            <div>
              <DropDownMenu
                value={this.state.menu.client}
                onChange={(event, index, value) => this.changeVal('client', 'menu', value)}
              >
                <MenuItem value="message" primaryText="Message" />
                <MenuItem value="ping" primaryText="Ping" />
                <MenuItem value="pong" primaryText="Pong" />
              </DropDownMenu>
              <FlatButton
                label="Discard"
                onTouchTap={e => this.handleDiscardClick('client')}
              />
              <FlatButton
                label="Send"
                onTouchTap={e => this.handleSendClick('client')}
              />
            </div>
          }
        />
        <textarea
          style={{width: '100%', height: textareaHeight }}
          name="clientIntercept"
          value={this.state.interceptValue.client}
          onChange={(event, value) => this.changeVal('client', 'interceptValue', value)}
        />
      </div>
    );
  }
}
