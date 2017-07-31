//Main.js
import {
  red800, red900,
  pinkA200,
  grey100, grey300, grey400, grey500,
  white, darkBlack, fullBlack
} from 'material-ui/styles/colors';

import getMuiTheme from 'material-ui/styles/getMuiTheme';
import spacing from 'material-ui/styles/spacing';

export const muiTheme = getMuiTheme({
  spacing: spacing,
  fontFamily: 'Roboto, sans-serif',
  borderRadius: 2,
  palette: {
    primary1Color: red800,
    primary2Color: red900,
    primary3Color: grey400,
    accent1Color: pinkA200,
    accent2Color: grey100,
    accent3Color: grey500,
    textColor: darkBlack,
    secondaryTextColor: darkBlack,
    alternateTextColor: white,
    canvasColor: white,
    borderColor: grey300,
    disabledColor: darkBlack,
    pickerHeaderColor: red800,
    clockCircleColor: darkBlack,
    shadowColor: fullBlack,
  },
});

export const mainStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  height: '100%',
  width: '100%',
  overflow: 'hidden'
}

export const tabStyle = {
  headline: {
    fontSize: 24,
    paddingTop: 12,
    marginBottom: 8,
    fontWeight: 400
  }
}

export const tableStyle = {
  height: '100%',
  width: '100%'
}

export const tableContentStyle = {
  height: '100%',
  width: '100%'
}

//AlertsTab.js
export const AlertsColumns = [
  {
    key: 'time',
    name: 'Time',
    resizable: true
  },
  {
    key: 'msg',
    name: 'Message',
    resizable: true
  }
];

//ActiveConnection.js
export const ActiveConnectionColumns = [
  {
    key: 'id',
    name: ' ',
    resizable: true,
    sortable: true
  },
  {
    key: 'protocol',
    name: 'Protocol',
    sortable: true,
    resizable: true
  },
  {
    key: 'host',
    name: 'Host',
    sortable: true,
    resizable: true
  },
  {
    key: 'port',
    name: 'Port',
    sortable: true,
    resizable: true
  },
  {
    key: 'path',
    name: 'Path',
    sortable: true,
    resizable: true
  },
  {
    key: 'serverMsgs',
    name: 'Server Msgs',
    sortable: true,
    resizable: true
  },
  {
    key: 'clientMsgs',
    name: 'Browser Msgs',
    sortable: true,
    resizable: true
  },
  {
    key: 'timeOpened',
    name: 'Opened',
    sortable: true,
    resizable: true
  }
];

//CustomTab.js
export const centerText = {
  textAlign: 'center',
  width: '100%'
}

//HistoryTab.js
export const HistoryColumns = [
  {
    key: 'time',
    name: 'Sent',
    resizable: true,
    sortable: true
  },
  {
    key: 'intercepted',
    name: 'Edited',
    resizable: true,
    sortable: true
  },
  {
    key: 'custom',
    name: 'Custom',
    resizable: true,
    sortable: true
  },
  {
    key: 'sender',
    name: 'Sender',
    resizable: true,
    sortable: true
  },
  {
    key: 'type',
    name: 'Type',
    resizable: true,
    sortable: true
  },
  {
    key: 'preview',
    name: 'Data',
    resizable: true,
    sortable: true
  },
  {
    key: 'binaryDisplay',
    name: 'Binary',
    resizable: true,
    sortable: true
  }
];

//InactiveConnection.js
export const InactiveConnectionColumns = [
  {
    key: 'id',
    name: ' ',
    resizable: true,
    sortable: true,
    width: 25
  },
  {
    key: 'protocol',
    name: 'Protocol',
    sortable: true,
    resizable: true,
    width: 70
  },
  {
    key: 'host',
    name: 'Host',
    sortable: true,
    resizable: true
  },
  {
    key: 'port',
    name: 'Port',
    sortable: true,
    resizable: true,
    width: 50
  },
  {
    key: 'path',
    name: 'Path',
    sortable: true,
    resizable: true
  },
  {
    key: 'serverMsgs',
    name: 'Server Msgs',
    sortable: true,
    resizable: true,
    width: 100
  },
  {
    key: 'clientMsgs',
    name: 'Browser Msgs',
    sortable: true,
    resizable: true,
    width: 122
  },
  {
    key: 'timeOpened',
    name: 'Opened',
    sortable: true,
    resizable: true
  },
  {
    key: 'timeClosed',
    name: 'Closed',
    sortable: true,
    resizable: true
  }
];
