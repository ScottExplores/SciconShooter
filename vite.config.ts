import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const leaderboardHandler = require('./api/leaderboard.js');
const monthlyWinnersHandler = require('./api/monthly-winners.js');
const researchHubProposalsHandler = require('./api/researchhub-proposals.js');
const runReceiptsHandler = require('./api/run-receipts.js');
const weeklyCompetitionsHandler = require('./api/weekly-competitions.js');
const eventsHandler = require('./api/events.js');
const runClaimsHandler = require('./api/run-claims.js');
const weeklyClaimHandler = require('./api/weekly-claim.js');
const mintAuthorizationHandler = require('./api/mint-authorization.js');
const mintRecordsHandler = require('./api/mint-records.js');
const recordMetadataHandler = require('./api/record-metadata.js');
const recordCardHandler = require('./api/record-card.js');

process.env.RUN_RECEIPT_SECRET ||= 'scicon-local-development-receipt-secret';

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
    const mount = (path: string, handler: (req: any, res: any) => Promise<void>) => {
      server.middlewares.use(path, async (req: any, res: any) => {
        const url = new URL(req.url || '/', 'http://localhost');
        req.query = Object.fromEntries(url.searchParams.entries());
        req.body = await readBody(req);
        await handler(req, res);
      });
    };

    mount('/api/leaderboard', leaderboardHandler);
    mount('/api/monthly-winners', monthlyWinnersHandler);
    mount('/api/researchhub-proposals', researchHubProposalsHandler);
    mount('/api/run-receipts', runReceiptsHandler);
    mount('/api/weekly-competitions', weeklyCompetitionsHandler);
    mount('/api/events', eventsHandler);
    mount('/api/run-claims', runClaimsHandler);
    mount('/api/weekly-claim', weeklyClaimHandler);
    mount('/api/mint-authorization', mintAuthorizationHandler);
    mount('/api/mint-records', mintRecordsHandler);
    mount('/api/record-metadata', recordMetadataHandler);
    mount('/api/record-card', recordCardHandler);

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
    port: 5173
  }
});
