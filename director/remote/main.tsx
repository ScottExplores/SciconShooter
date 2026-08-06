import React from 'react';
import ReactDOM from 'react-dom/client';
import '../../styles/tailwind.generated.css';
import './remote-boss-runner.css';
import RemoteBossRunnerApp from './RemoteBossRunnerApp';
import { recoverFromModulePreloadFailure } from '../../services/deploymentUpdateService';

window.addEventListener('vite:preloadError', (event) => {
  if (recoverFromModulePreloadFailure(event.payload)) {
    event.preventDefault();
  }
});

const root = document.getElementById('root');
if (!root) throw new Error('SciCon Boss Test Runner root was not found');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <RemoteBossRunnerApp />
  </React.StrictMode>
);
