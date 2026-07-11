import React from 'react';
import ReactDOM from 'react-dom/client';
import LegacyDirectorApp from './App';
import LevelEditorApp from './editor/LevelEditorApp';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Scicon Director root element was not found');

const path = window.location.pathname.replace(/\/+$/, '') || '/';
const App = path === '/studio' ? LegacyDirectorApp : LevelEditorApp;

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
