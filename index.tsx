import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tailwind.generated.css';
import App from './App';
import DesktopMobileLaunchShell from './components/DesktopMobileLaunchShell';
import AppErrorBoundary from './components/AppErrorBoundary';
import { AppProviders } from './providers';
import { recoverFromModulePreloadFailure } from './services/deploymentUpdateService';
import { isBossLabDevKey, isBossLabQueryEnabled } from './services/gameplay/bossLabFlag.mjs';
import { eventLoaderVariant } from './services/gameplay/eventLoaderFlag.mjs';
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
const BossLab = React.lazy(() => import('./components/BossLab'));
const showCombatLab = Boolean(CombatLab && combatLabRequested);
const eventLoaderVariantId = eventLoaderVariant(window.location.search);
const EventLoadingMockup = eventLoaderVariantId
  ? React.lazy(() => import('./components/EventLoadingMockup'))
  : null;

const rememberBossLabFlag = () => {
  const url = new URL(window.location.href);
  if (url.searchParams.has('bosslab')) return;
  url.searchParams.set('bosslab', '');
  window.history.replaceState(null, '', url);
};

const AppRoot: React.FC = () => {
  const [bossLabEnabled, setBossLabEnabled] = React.useState(
    () => isBossLabQueryEnabled(window.location.search)
  );

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isBossLabDevKey(event)) return;
      event.preventDefault();
      rememberBossLabFlag();
      setBossLabEnabled(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (eventLoaderVariantId && EventLoadingMockup) {
    return (
      <React.Suspense fallback={null}>
        <EventLoadingMockup variant={eventLoaderVariantId} />
      </React.Suspense>
    );
  }

  return (
    <AppErrorBoundary>
      <DesktopMobileLaunchShell>
        {showCombatLab && CombatLab ? <React.Suspense fallback={<div>Loading Combat Lab…</div>}><CombatLab /></React.Suspense> :
        bossLabEnabled ? <React.Suspense fallback={<div>Loading boss lab…</div>}><BossLab /></React.Suspense> :
        <AppProviders>
          <App />
        </AppProviders>
        }
      </DesktopMobileLaunchShell>
    </AppErrorBoundary>
  );
};

root.render(
  <React.StrictMode>
    <AppRoot />
  </React.StrictMode>
);
