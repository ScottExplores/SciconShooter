import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tailwind.generated.css';
import App from './App';
import DesktopMobileLaunchShell from './components/DesktopMobileLaunchShell';
import AppErrorBoundary from './components/AppErrorBoundary';
import { AppProviders } from './providers';
import { recoverFromModulePreloadFailure } from './services/deploymentUpdateService';
import { installPlayerReportMonitoring } from './services/playerReportService';

const combatLabRequested = import.meta.env.DEV && new URLSearchParams(window.location.search).get('lab') === 'combat';
if (!combatLabRequested) installPlayerReportMonitoring();

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
// Development-only, isolated test surface. Never mounts wallet/profile services.
const CombatLab = import.meta.env.DEV
  ? React.lazy(() => import('./components/CombatLab'))
  : null;
const showCombatLab = Boolean(CombatLab && combatLabRequested);
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <DesktopMobileLaunchShell>
        {showCombatLab && CombatLab ? <React.Suspense fallback={<div>Loading Combat Lab…</div>}><CombatLab /></React.Suspense> :
        <AppProviders>
          <App />
        </AppProviders>
        }
      </DesktopMobileLaunchShell>
    </AppErrorBoundary>
  </React.StrictMode>
);
