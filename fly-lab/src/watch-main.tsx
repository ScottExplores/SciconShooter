import React from 'react';
import { createRoot } from 'react-dom/client';
import Watch from './Watch';
createRoot(document.getElementById('root')!).render(<React.StrictMode><Watch offline /></React.StrictMode>);
