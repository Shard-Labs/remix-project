import React from 'react';
import { DebuggerUI } from '@remix-ui/debugger-ui' // eslint-disable-line

import './app.css';

import { DebuggerClientApi } from './debugger'

export const App = () => {
  /*
   * Replace the elements below with your own.
   *
   * Note: The corresponding styles are in the ./app.css file.
   */
  const debuggerApi = new DebuggerClientApi()
  return (
    <div className="debugger">
      <DebuggerUI debuggerAPI={debuggerApi} />
    </div>
  );
};

export default App;
