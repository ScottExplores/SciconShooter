import React from 'react';
import ReactDOM from 'react-dom/client';
import '../../styles/tailwind.generated.css';
import './styles.css';
import LegacyDirectorApp from './App';
import { DeveloperHubApp } from './app/DeveloperHubApp';
import BossSandboxApp from './tools/bosses/BossSandboxApp';
import CombatLabApp from './combat-lab/CombatLabApp';
import LevelEditorApp from './editor/LevelEditorApp';

const root = document.getElementById('root');
if (!root) throw new Error('Scicon Director root element was not found');

// Stable aliases remain registry-owned: '/level-editor' and '/combat-lab'.
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <DeveloperHubApp
      pathname={window.location.pathname}
      tools={{
        MissionBuilder: LevelEditorApp,
        BossSandbox: BossSandboxApp,
        CombatLab: CombatLabApp,
        LegacyStudio: LegacyDirectorApp
      }}
    />
  </React.StrictMode>
);
