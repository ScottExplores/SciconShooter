import React from 'react';
import { createRoot } from 'react-dom/client';
import Spectator from './Spectator';
createRoot(document.getElementById('root')!).render(<React.StrictMode><Spectator offline /></React.StrictMode>);
