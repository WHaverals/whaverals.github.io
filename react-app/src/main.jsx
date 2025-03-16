import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// This function will be available globally to mount the React app
window.mountLanyard = (elementId, userName) => {
  const element = document.getElementById(elementId);
  if (element) {
    ReactDOM.createRoot(element).render(
      <React.StrictMode>
        <App userName={userName || "Wouter Haverals"} />
      </React.StrictMode>
    );
  }
};

// Auto-mount if the element exists
document.addEventListener('DOMContentLoaded', () => {
  const element = document.getElementById('lanyard-root');
  if (element) {
    ReactDOM.createRoot(element).render(
      <React.StrictMode>
        <App userName="Wouter Haverals" />
      </React.StrictMode>
    );
  }
});