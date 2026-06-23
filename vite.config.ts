import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const leaderboardHandler = require('./api/leaderboard.js');
const monthlyWinnersHandler = require('./api/monthly-winners.js');

const readBody = (req: any) => new Promise((resolve) => {
  if (req.method === 'GET' || req.method === 'OPTIONS') {
    resolve(undefined);
    return;
  }

  let body = '';
  req.on('data', (chunk: Buffer) => {
    body += chunk.toString();
  });
  req.on('end', () => {
    if (!body) {
      resolve(undefined);
      return;
    }

    try {
      resolve(JSON.parse(body));
    } catch {
      resolve(body);
    }
  });
});

const localApiRoutes = () => ({
  name: 'local-api-routes',
  configureServer(server: any) {
    server.middlewares.use('/api/leaderboard', async (req: any, res: any) => {
      req.body = await readBody(req);
      await leaderboardHandler(req, res);
    });

    server.middlewares.use('/api/monthly-winners', async (req: any, res: any) => {
      req.body = await readBody(req);
      await monthlyWinnersHandler(req, res);
    });
  }
});

export default defineConfig({
  plugins: [react(), localApiRoutes()],
  publicDir: 'public', // Ensures public/ folder is served at root
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api/researchhub-proposals': {
        target: 'https://backend.prod.researchhub.com',
        changeOrigin: true,
        secure: false,
        rewrite: () => '/api/funding_feed/?fundraise_status=OPEN&ordering=best&page_size=5&content_type=PREREGISTRATION'
      }
    }
  }
});
