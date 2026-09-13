import React, { lazy, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Watch from './Watch';
import './styles.css';
const ResearchApp = lazy(() => import('./App'));
const Teaching = lazy(() => import('./Teaching'));
function Router() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => { const changed = () => setHash(location.hash); window.addEventListener('hashchange', changed); return () => window.removeEventListener('hashchange', changed); }, []);
  return !hash || hash === '#watch' ? <Watch /> : <Suspense fallback={<p>Opening the lab…</p>}>{hash === '#learn' ? <Teaching /> : <ResearchApp />}</Suspense>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Router /></React.StrictMode>);
