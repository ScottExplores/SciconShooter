// REVAMP(F): Opt-in QA pages use disposable storage before profile services load.
import './services/revamp/qa/storage';
import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tailwind.generated.css';
import DesktopMobileLaunchShell from './components/DesktopMobileLaunchShell';
import AppErrorBoundary from './components/AppErrorBoundary';
import { AppProviders } from './providers';
import { recoverFromModulePreloadFailure } from './services/deploymentUpdateService';
import { installPlayerReportMonitoring } from './services/playerReportService';
import { installPreviewRequestGuard } from './services/revamp/preview/previewMode';

// REVAMP(E): Block preview API writes before any React effects can start.
installPreviewRequestGuard();

// REVAMP(A): Dev-only VFX lab does not mount wallet/profile/report services.
const feelLabRequested = import.meta.env.DEV && new URLSearchParams(window.location.search).get('fxlab') === '1';
const FeelLab = import.meta.env.DEV ? React.lazy(() => import('./components/FeelLab')) : null;
const combatLabRequested = import.meta.env.DEV && new URLSearchParams(window.location.search).get('lab') === 'combat';
// REVAMP(C): Practice entry bypasses account services and the desktop launch gate.
// QA (?qa=1&bosslab=...) runs the real campaign boss wave; the standalone lab owns ?bosslab without qa.
const bossLabParams = new URLSearchParams(window.location.search);
const bossLabRequested = bossLabParams.has('bosslab') && bossLabParams.get('qa') !== '1';
if (!combatLabRequested && !feelLabRequested && !bossLabRequested) installPlayerReportMonitoring();

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
// REVAMP(C): Lazy load the gallery only for explicit bosslab links.
const BossLab = React.lazy(() => import('./components/revamp/BossLab'));
// REVAMP(J): Explicit lab routes do not download or initialize the lobby and wallet shell.
const App = React.lazy(() => import('./App'));
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      {feelLabRequested && FeelLab ? <React.Suspense fallback={<div>Loading FX Lab…</div>}><FeelLab /></React.Suspense> :
      bossLabRequested ? <React.Suspense fallback={<div>Loading Boss Lab…</div>}><BossLab /></React.Suspense> :
      <DesktopMobileLaunchShell>
        {showCombatLab && CombatLab ? <React.Suspense fallback={<div>Loading Combat Lab…</div>}><CombatLab /></React.Suspense> :
        <AppProviders>
          <React.Suspense fallback={<div className="min-h-screen bg-slate-950 text-cyan-100 grid place-items-center" role="status">Loading SciCon…</div>}>
            <App />
          </React.Suspense>
        </AppProviders>
        }
      </DesktopMobileLaunchShell>
      }
    </AppErrorBoundary>
  </React.StrictMode>
);
