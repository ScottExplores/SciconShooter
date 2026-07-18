const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const appSource = read('App.tsx');
const canvasSource = read('components/GameCanvas.tsx');
const engineSource = read('services/gameLogic.ts');
const overlaySource = read('components/WaveVictoryOverlay.tsx');
const typesSource = read('types.ts');

test('a final boss clear pauses after the departure and waits for an explicit next-wave command', () => {
  assert.match(engineSource, /export interface WaveVictorySummary/);
  assert.match(engineSource, /this\.waveVictorySummary = this\.buildWaveVictorySummary\(\)/);
  assert.match(engineSource, /this\.waveVictoryReady = true;\s*this\.gameActive = false;/);
  assert.match(engineSource, /continueToNextWave\(\)\s*{[\s\S]*?this\.startNextWave\(\);[\s\S]*?return true;/);
  assert.match(engineSource, /if \(this\.previewMode\)\s*{\s*this\.startNextWave\(\);/);
});

test('wave records are calculated from per-wave baselines', () => {
  assert.match(engineSource, /scoreEarned: Math\.max\(0, this\.stats\.score - this\.waveStartScore\)/);
  assert.match(engineSource, /enemiesDefeated: Math\.max\(0, this\.stats\.enemiesDefeated - this\.waveStartEnemiesDefeated\)/);
  assert.match(engineSource, /coinsCollected: Math\.max\(0, this\.stats\.totalCoins - this\.waveStartTotalCoins\)/);
  assert.match(engineSource, /elapsedSeconds: Math\.max\(0, Math\.round\(this\.waveFlightFrames \/ GAME_CONFIG\.FPS\)\)/);
  assert.match(engineSource, /this\.waveStartScore = this\.stats\.score/);
});

test('the production canvas reports victory once and accepts a deduplicated continue command', () => {
  assert.match(canvasSource, /onWaveVictory\?: \(summary: WaveVictorySummary\) => void/);
  assert.match(canvasSource, /lastWaveVictoryIdRef\.current !== waveVictory\.id/);
  assert.match(canvasSource, /onWaveVictoryRef\.current\?\.\(waveVictory\)/);
  assert.match(canvasSource, /handledWaveContinueNonceRef\.current === waveContinueCommand\.nonce/);
  assert.match(canvasSource, /engine\.continueToNextWave\(\)/);
});

test('the app keeps the real game mounted behind a dedicated wave-complete state', () => {
  assert.match(typesSource, /WAVE_COMPLETE = 'WAVE_COMPLETE'/);
  assert.match(appSource, /gameState === GameState\.WAVE_COMPLETE/);
  assert.match(appSource, /onWaveVictory: showWaveVictory/);
  assert.match(appSource, /waveContinueCommand/);
  assert.match(appSource, /<WaveVictoryOverlay summary={waveVictorySummary} onContinue={continueAfterWaveVictory}/);
});

test('the victory overlay uses the layered Scicon reveal packs and shows the requested wave metrics', () => {
  assert.match(overlaySource, /weekly-champion-reveal\/parts/);
  assert.match(overlaySource, /mission-record-verification\/parts/);
  assert.match(overlaySource, /plaque-body\.png/);
  assert.match(overlaySource, /record-card-body\.png/);
  assert.match(overlaySource, />Victory</);
  assert.match(overlaySource, />Enemies</);
  assert.match(overlaySource, />Coins</);
  assert.match(overlaySource, />Flight</);
  assert.match(overlaySource, /Continue/);
});
