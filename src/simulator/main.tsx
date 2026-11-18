import React from 'react';
import ReactDOM from 'react-dom/client';
import { SimulatorApp } from './SimulatorApp';

const enabled = String(import.meta.env.VITE_SIMULATOR_ENABLED ?? 'true').toLowerCase() === 'true';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {enabled ? (
      <SimulatorApp />
    ) : (
      <div style={{minHeight:'100vh',display:'grid',placeItems:'center',fontFamily:'system-ui',background:'#111827',color:'#fff',padding:24,textAlign:'center'}}>
        <div>
          <h1>PowerGIS Simulator is disabled</h1>
          <p>Set VITE_SIMULATOR_ENABLED=true to enable the isolated simulator site.</p>
        </div>
      </div>
    )}
  </React.StrictMode>
);
