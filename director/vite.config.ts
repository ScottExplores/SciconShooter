import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { createDirectorApiPlugin } from './server/localApi.mjs';

const directorRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(directorRoot, '..');

export default defineConfig(({ command, mode }) => {
  if (command === 'build' || process.env.VERCEL) {
    throw new Error('Scicon Director is local-only and cannot be built for deployment.');
  }

  const envDir = path.join(directorRoot, 'env');
  const localEnvironment = loadEnv(mode, envDir, '');
  const imageApiKey = process.env.OPENAI_API_KEY || localEnvironment.OPENAI_API_KEY || '';

  return {
    root: directorRoot,
    envDir,
    publicDir: path.join(repositoryRoot, 'public'),
    resolve: {
      alias: {
        '@director': path.join(directorRoot, 'src'),
        '@game': repositoryRoot
      },
      dedupe: ['react', 'react-dom']
    },
    plugins: [
      react(),
      createDirectorApiPlugin({ repositoryRoot, directorRoot, imageApiKey })
    ],
    server: {
      host: '127.0.0.1',
      port: 5174,
      strictPort: true,
      fs: {
        allow: [repositoryRoot]
      },
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Cross-Origin-Resource-Policy': 'same-origin'
      }
    }
  };
});
