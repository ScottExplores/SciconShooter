import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tailwind.generated.css';
import App from './App';
import DesktopMobileLaunchShell from './components/DesktopMobileLaunchShell';
import { AppProviders } from './providers';
import { recoverFromModulePreloadFailure } from './services/deploymentUpdateService';

window.addEventListener('vite:preloadError', (event) => {
  if (recoverFromModulePreloadFailure(event.payload)) {
    event.preventDefault();
  }
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <DesktopMobileLaunchShell>
      <AppProviders>
        <App />
      </AppProviders>
    </DesktopMobileLaunchShell>
  </React.StrictMode>
);
