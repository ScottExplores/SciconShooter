import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const leaderboardHandler = require('./api/leaderboard.js');
const researchHubProposalsHandler = require('./api/researchhub-proposals.js');
const runReceiptsHandler = require('./api/run-receipts.js');
const weeklyCompetitionsHandler = require('./api/weekly-competitions.js');
const eventsHandler = require('./api/events.js');
const playerReportsHandler = require('./api/_lib/playerReportsRoute.js');
const runClaimsHandler = require('./api/run-claims.js');
const weeklyClaimHandler = require('./api/weekly-claim.js');
const mintAuthorizationHandler = require('./api/mint-authorization.js');
const mintRecordsHandler = require('./api/mint-records.js');
const walletProfileHandler = require('./api/_lib/walletProfileRoute.js');
const walletPurchaseHandler = require('./api/_lib/walletPurchaseRoute.js');
const playerShipAccessHandler = require('./api/_lib/playerShipAccessRoute.js');
const continuePaymentHandler = require('./api/_lib/continuePaymentRoute.js');
const walletTokenSpendHandler = require('./api/_lib/walletTokenSpendRoute.js');
const { handlePlayerRuns } = require('./api/_lib/playerRuns.js');
const recordMetadataHandler = require('./api/record-metadata.js');
const recordCardHandler = require('./api/record-card.js');

const PUBLIC_API_ORIGIN = process.env.SCICON_PUBLIC_API_ORIGIN || 'https://sciconshooter.xyz';
const hasLocalLeaderboardStorage = Boolean(
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
);
const hasLocalReceiptSecret = Boolean(process.env.RUN_RECEIPT_SECRET);
const useRemotePersistence = !hasLocalLeaderboardStorage || !hasLocalReceiptSecret;

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

const proxyPublicApi = async (path: string, req: any, res: any) => {
  try {
    const query = new URL(req.url || '/', 'http://localhost').search;
    const method = String(req.method || 'GET').toUpperCase();
    const headers: Record<string, string> = {
      Accept: String(req.headers?.accept || 'application/json')
    };
    if (req.headers?.authorization) headers.Authorization = String(req.headers.authorization);
    if (req.headers?.cookie) headers.Cookie = String(req.headers.cookie);
    const hasBody = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' && req.body !== undefined;
    if (hasBody) headers['Content-Type'] = 'application/json';
    const upstream = await fetch(`${PUBLIC_API_ORIGIN}${path}${query}`, {
      method,
      headers,
      body: hasBody
        ? typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
        : undefined,
      redirect: 'follow'
    });
    const body = await upstream.text();

    res.statusCode = upstream.status;
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.setHeader('Cache-Control', upstream.headers.get('cache-control') || 'no-store');
    const setCookie = upstream.headers.get('set-cookie');
    if (setCookie) {
      // The remote API marks profile cookies Secure. The local Vite relay is
      // HTTP-only, so remove that attribute only on this development response.
      res.setHeader('Set-Cookie', setCookie.replace(/;\s*Secure/gi, ''));
    }
    res.end(body);
  } catch (error) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'Development API relay is unavailable',
      details: error instanceof Error ? error.message : 'Unknown upstream error'
    }));
  }
};

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

    mount('/api/leaderboard', async (req, res) => {
      if (useRemotePersistence) return proxyPublicApi('/api/leaderboard', req, res);
      return leaderboardHandler(req, res);
    });
    mount('/api/researchhub-proposals', async (req, res) => {
      return researchHubProposalsHandler(req, res);
    });
    mount('/api/run-receipts', async (req, res) => {
      if (useRemotePersistence) return proxyPublicApi('/api/run-receipts', req, res);
      return runReceiptsHandler(req, res);
    });
    mount('/api/weekly-competitions', async (req, res) => {
      if (useRemotePersistence || req.method === 'GET') return proxyPublicApi('/api/weekly-competitions', req, res);
      return weeklyCompetitionsHandler(req, res);
    });
    mount('/api/events', async (req, res) => {
      if (useRemotePersistence) return proxyPublicApi('/api/events', req, res);
      return eventsHandler(req, res);
    });
    mount('/api/player-reports', async (req, res) => {
      return playerReportsHandler(req, res);
    });
    mount('/api/run-claims', async (req, res) => {
      if (useRemotePersistence) return proxyPublicApi('/api/run-claims', req, res);
      return runClaimsHandler(req, res);
    });
    mount('/api/weekly-claim', async (req, res) => {
      if (useRemotePersistence) return proxyPublicApi('/api/weekly-claim', req, res);
      return weeklyClaimHandler(req, res);
    });
    mount('/api/mint-authorization', async (req, res) => {
      if (useRemotePersistence) return proxyPublicApi('/api/mint-authorization', req, res);
      return mintAuthorizationHandler(req, res);
    });
    mount('/api/mint-records', async (req, res) => {
      if (useRemotePersistence) return proxyPublicApi('/api/mint-records', req, res);
      return mintRecordsHandler(req, res);
    });
    mount('/api/wallet-profile', async (req, res) => {
      if (useRemotePersistence) return proxyPublicApi('/api/wallet-profile', req, res);
      return walletProfileHandler(req, res);
    });
    mount('/api/wallet-purchases', async (req, res) => {
      if (useRemotePersistence) return proxyPublicApi('/api/wallet-purchases', req, res);
      return walletPurchaseHandler(req, res);
    });
    mount('/api/player-ship-access', async (req, res) => {
      if (useRemotePersistence) return proxyPublicApi('/api/player-ship-access', req, res);
      return playerShipAccessHandler(req, res);
    });
    mount('/api/continue-payments', async (req, res) => {
      if (useRemotePersistence) return proxyPublicApi('/api/continue-payments', req, res);
      return continuePaymentHandler(req, res);
    });
    mount('/api/wallet-token-spends', async (req, res) => {
      if (useRemotePersistence) return proxyPublicApi('/api/wallet-token-spends', req, res);
      return walletTokenSpendHandler(req, res);
    });
    mount('/api/player-runs', async (req, res) => {
      if (useRemotePersistence) return proxyPublicApi('/api/player-runs', req, res);
      return handlePlayerRuns(req, res);
    });
    mount('/api/record-metadata', async (req, res) => {
      if (useRemotePersistence) return proxyPublicApi('/api/record-metadata', req, res);
      return recordMetadataHandler(req, res);
    });
    mount('/api/record-card', async (req, res) => {
      if (useRemotePersistence) return proxyPublicApi('/api/record-card', req, res);
      return recordCardHandler(req, res);
    });

  }
});

const excludeSandboxTestAssetsFromProduction = () => ({
  name: 'exclude-sandbox-test-assets-from-production',
  closeBundle() {
    const distRoot = path.resolve(process.cwd(), 'dist');
    const testPackagesRoot = path.resolve(
      distRoot,
      'game-art',
      'generated',
      'bosses',
      'test-packages'
    );
    const relativeTarget = path.relative(distRoot, testPackagesRoot);
    if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
      throw new Error('Refusing to remove sandbox test assets outside the production dist directory.');
    }
    fs.rmSync(testPackagesRoot, { recursive: true, force: true });
  }
});

export default defineConfig({
  plugins: [react(), localApiRoutes(), excludeSandboxTestAssetsFromProduction()],
  publicDir: 'public', // Ensures public/ folder is served at root
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173
  }
});
