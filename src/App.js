import React from 'react';
import ReactDOM from 'react-dom';
import injectTapEventPlugin from 'react-tap-event-plugin';
import Main from './components/Main';

injectTapEventPlugin();

ReactDOM.render(
  <Main ipcRenderer={ipcRenderer} />,
  document.getElementById('root')
);
