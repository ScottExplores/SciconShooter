import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tailwind.generated.css';
import App from './App';
import { AppProviders } from './providers';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </React.StrictMode>
);
