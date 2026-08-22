import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { rewriteHostedRunnerAssetUrls } from './runnerAssetUrlRewrite.mjs';

const remoteRoot = path.dirname(fileURLToPath(import.meta.url));
const directorRoot = path.resolve(remoteRoot, '..');
const repositoryRoot = path.resolve(directorRoot, '..');
const outputRoot = path.join(
  repositoryRoot,
  'sites',
  'boss-test-runner',
  'public',
  'runner'
);

/**
 * The local model deliberately registers prototype images under its loopback
 * endpoint. This build-only rewrite retains the locked IDs and SHA-256 values
 * while moving the pinned fixed files to the hosted runner's same-origin,
 * read-only namespace.
 */
const remotePrototypeAssetUrls = (): Plugin => ({
  name: 'scicon-remote-prototype-asset-urls',
  enforce: 'pre',
  transform(source, id) {
    if (
      !source.includes('/__director/api/v1/prototype-assets/')
      && !source.includes('/game-art/generated/mini-boss-lab-v3')
    ) return null;
    const code = rewriteHostedRunnerAssetUrls(source);
    return { code, map: null };
  }
});

export default defineConfig({
  root: remoteRoot,
  base: '/runner/',
  publicDir: false,
  resolve: {
    alias: {
      '@director': path.join(directorRoot, 'src'),
      '@game': repositoryRoot
    },
    dedupe: ['react', 'react-dom', 'pixi.js']
  },
  plugins: [
    remotePrototypeAssetUrls(),
    react()
  ],
  server: {
    fs: {
      allow: [repositoryRoot]
    }
  },
  build: {
    outDir: outputRoot,
    emptyOutDir: true,
    sourcemap: false
  }
});
