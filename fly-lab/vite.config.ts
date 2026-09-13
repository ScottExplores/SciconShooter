import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
// Deliberately never imports the production Vite configuration or .env.local.
export default defineConfig({
  root, envDir: root, plugins: [react()],
  publicDir: path.resolve(root, '../public'),
  resolve: { dedupe: ['react', 'react-dom', 'pixi.js'] },
  server: {
    host: '127.0.0.1', port: 5180, strictPort: true,
    fs: { allow: [path.resolve(root, '..')] },
    proxy: { '/lab-api': { target: 'http://127.0.0.1:8766', rewrite: p => p.replace(/^\/lab-api/, '') } }
  },
  build: { outDir: 'dist', copyPublicDir: false,
    rollupOptions: { input: { dashboard: path.resolve(root,'index.html'), runner: path.resolve(root,'environment/runner.html') } }
  }
});
