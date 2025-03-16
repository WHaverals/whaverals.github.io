import React from 'react';
import ReactDOM from 'react-dom/client';
import Lanyard from './Lanyard';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <div style={{ height: '60vh', width: '100%' }}>
      <Lanyard position={[0, 0, 20]} gravity={[0, -40, 0]} />
    </div>
  </React.StrictMode>,
);