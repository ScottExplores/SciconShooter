import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { createDirectorApiPlugin } from './server/localApi.mjs';

const directorRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(directorRoot, '..');

export default defineConfig(({ command }) => {
  if (command === 'build' || process.env.VERCEL) {
    throw new Error('Scicon Director is local-only and cannot be built for deployment.');
  }

  return {
    root: directorRoot,
    envDir: path.join(directorRoot, 'env'),
    publicDir: path.join(repositoryRoot, 'public'),
    resolve: {
      alias: {
        '@director': path.join(directorRoot, 'src')
      },
      dedupe: ['react', 'react-dom']
    },
    plugins: [
      react(),
      createDirectorApiPlugin({ repositoryRoot, directorRoot })
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
