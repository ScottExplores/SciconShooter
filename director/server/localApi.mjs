import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ConfigRepository } from './configRepository.mjs';
import {
  GeneratedAssetRepository,
  normalizeGeneratedAssetRequest
} from './generatedAssetRepository.mjs';
import { GameCampaignRepository } from './gameCampaignRepository.mjs';
import { GameCampaignWorkspaceRepository } from './gameCampaignWorkspaceRepository.mjs';
import { GameplayTelemetryRepository } from './gameplayTelemetryRepository.mjs';
import {
  DIRECTOR_IMAGE_MODEL,
  OpenAIImageGenerationClient
} from './imageGenerationClient.mjs';
import {
  createLocalPrototypeAssetCatalog,
  PROTOTYPE_ASSET_DEFINITIONS
} from './prototypeAssetCatalog.mjs';
import { RealRunReader } from './realRunReader.mjs';
import {
  assertLoopbackRequest,
  assertMutationRequest,
  HttpError,
  readJsonBody,
  resolveWithin,
  sendJson
} from './security.mjs';
import { assertConfigKind, ValidationError } from './validation.mjs';

export const DIRECTOR_API_PREFIX = '/__director';

const decodePathSegment = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, 'Invalid URL path encoding');
  }
};

const requiredPayload = (body) => {
  if (!Object.hasOwn(body, 'payload')) {
    throw new ValidationError('Missing configuration payload', ['payload is required']);
  }
  return body.payload;
};

const requiredCampaign = (body) => {
  if (!Object.hasOwn(body, 'campaign')) {
    throw new ValidationError('Missing game campaign', ['campaign is required']);
  }
  return body.campaign;
};

const requiredResource = (body) => {
  if (!Object.hasOwn(body, 'resource')) {
    throw new ValidationError('Missing workspace resource', ['resource is required']);
  }
  return body.resource;
};

const workspaceMutationOptions = (body) => ({
  expectedBaseContentHash: body.expectedBaseContentHash,
  expectedDraftRevision: body.expectedDraftRevision,
  idempotencyKey: body.idempotencyKey,
  ...(body.changeNote !== undefined ? { changeNote: body.changeNote } : {})
});

const normalizedPathname = (requestUrl) => {
  const url = new URL(requestUrl || '/', 'http://director.local');
  if (url.pathname === DIRECTOR_API_PREFIX) return '/';
  if (url.pathname.startsWith(`${DIRECTOR_API_PREFIX}/`)) return url.pathname.slice(DIRECTOR_API_PREFIX.length);
  return url.pathname;
};

const isMutationMethod = (method) => ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);

export const createDirectorRequestHandler = ({
  repository,
  realRunReader,
  gameCampaignRepository = null,
  gameCampaignWorkspaceRepository = null,
  gameplayTelemetryRepository = null,
  generatedAssetRepository = null,
  imageGenerationClient = null,
  prototypeAssets = [],
  meridianHarrowerArtworkPath = null,
  meridianHarrowerSheetPath = null
}) => {
  if (!repository || !realRunReader) throw new Error('Director API requires a repository and real-run reader');

  const prototypeAssetByRoute = new Map(
    PROTOTYPE_ASSET_DEFINITIONS.map((definition) => [
      definition.route,
      { ...definition, filePath: null }
    ])
  );
  for (const prototypeAsset of prototypeAssets) {
    const expected = prototypeAssetByRoute.get(prototypeAsset.route);
    if (!expected || prototypeAsset.sha256 !== expected.sha256) {
      throw new Error('Director API received an unknown prototype asset registration');
    }
    prototypeAssetByRoute.set(prototypeAsset.route, {
      ...expected,
      filePath: prototypeAsset.filePath
    });
  }
  if (meridianHarrowerArtworkPath) {
    const definition = PROTOTYPE_ASSET_DEFINITIONS.find((candidate) => (
      candidate.prototypeId === 'meridian-harrower' && candidate.variant === 'assembled'
    ));
    prototypeAssetByRoute.set(definition.route, {
      ...definition,
      filePath: meridianHarrowerArtworkPath
    });
  }
  if (meridianHarrowerSheetPath) {
    const definition = PROTOTYPE_ASSET_DEFINITIONS.find((candidate) => (
      candidate.prototypeId === 'meridian-harrower' && candidate.variant === 'sheet'
    ));
    prototypeAssetByRoute.set(definition.route, {
      ...definition,
      filePath: meridianHarrowerSheetPath
    });
  }

  return async (request, response) => {
    try {
      const method = String(request.method || 'GET').toUpperCase();
      assertLoopbackRequest(request);
      if (isMutationMethod(method)) assertMutationRequest(request);
      const pathname = normalizedPathname(request.url);

      if (method === 'GET' && pathname === '/health') {
        return sendJson(response, 200, {
          ok: true,
          localOnly: true,
          productionWrites: false,
          mainnetTransactions: false
        });
      }

      if (method === 'GET' && pathname === '/bootstrap') {
        return sendJson(response, 200, await repository.bootstrap());
      }

      const prototypeAsset = prototypeAssetByRoute.get(pathname);
      if (method === 'GET' && prototypeAsset) {
        if (!prototypeAsset.filePath) {
          throw new HttpError(404, `${prototypeAsset.label} is not installed locally`);
        }
        let png;
        try {
          png = await readFile(prototypeAsset.filePath);
        } catch (error) {
          if (error?.code === 'ENOENT') {
            throw new HttpError(404, `${prototypeAsset.label} is not installed locally`);
          }
          throw error;
        }
        if (png.length > prototypeAsset.maxBytes) {
          throw new HttpError(422, `${prototypeAsset.label} exceeds its local size budget`);
        }
        const pngSignature = png.subarray(0, 8).toString('hex');
        const width = png.length >= 24 ? png.readUInt32BE(16) : 0;
        const height = png.length >= 24 ? png.readUInt32BE(20) : 0;
        const sha256 = createHash('sha256').update(png).digest('hex');
        if (
          pngSignature !== '89504e470d0a1a0a'
          || width !== prototypeAsset.width
          || height !== prototypeAsset.height
          || sha256 !== prototypeAsset.sha256
        ) {
          throw new HttpError(
            422,
            `${prototypeAsset.label} failed integrity validation`
          );
        }
        response.statusCode = 200;
        response.setHeader('Content-Type', 'image/png');
        response.setHeader('Content-Length', String(png.length));
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('Referrer-Policy', 'no-referrer');
        response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
        return response.end(png);
      }

      if (pathname.startsWith('/api/generated-assets') && !generatedAssetRepository) {
        throw new HttpError(503, 'Generated asset storage is unavailable');
      }

      if (method === 'GET' && pathname === '/api/generated-assets') {
        return sendJson(response, 200, {
          ok: true,
          generator: imageGenerationClient?.getPublicStatus?.() ?? {
            available: false,
            model: DIRECTOR_IMAGE_MODEL,
            backgroundRemoval: 'local-chroma-key'
          },
          assets: await generatedAssetRepository.listAssets()
        });
      }

      if (method === 'POST' && pathname === '/api/generated-assets') {
        if (!imageGenerationClient?.isConfigured?.()) {
          throw new HttpError(
            503,
            'Sprite generation is not configured locally. Set OPENAI_API_KEY in director/env/.env.local and restart Scicon Director.'
          );
        }
        const requestBody = normalizeGeneratedAssetRequest(await readJsonBody(request, { limit: 16 * 1024 }));
        const generated = await imageGenerationClient.generateSprite(requestBody);
        const result = await generatedAssetRepository.createAsset({
          request: requestBody,
          sourcePng: generated.png,
          model: generated.model,
          normalizedPrompt: generated.normalizedPrompt
        });
        return sendJson(response, result.created ? 201 : 200, {
          ok: true,
          message: result.created
            ? 'Generated sprite saved to the local game asset library'
            : 'The same generated sprite is already in the local game asset library',
          asset: result.asset
        });
      }

      if (pathname.startsWith('/api/v1/playtest-sessions') && !gameplayTelemetryRepository) {
        throw new HttpError(503, 'Local playtest session storage is unavailable');
      }

      if (method === 'GET' && pathname === '/api/v1/playtest-sessions') {
        return sendJson(response, 200, {
          ok: true,
          localOnly: true,
          sessions: await gameplayTelemetryRepository.listSessions()
        });
      }

      if (method === 'POST' && pathname === '/api/v1/playtest-sessions') {
        const body = await readJsonBody(request, { limit: 512 * 1024 });
        if (!Object.hasOwn(body, 'session')) {
          throw new ValidationError('Missing playtest session', ['session is required']);
        }
        return sendJson(response, 201, {
          ok: true,
          localOnly: true,
          message: 'Saved the bounded playtest session to local Director storage',
          session: await gameplayTelemetryRepository.createSession(body.session)
        });
      }

      let playtestSessionMatch = /^\/api\/v1\/playtest-sessions\/([^/]+)$/.exec(pathname);
      if (playtestSessionMatch) {
        const sessionId = decodePathSegment(playtestSessionMatch[1]);
        if (method === 'GET') {
          return sendJson(response, 200, {
            ok: true,
            localOnly: true,
            session: await gameplayTelemetryRepository.readSession(sessionId)
          });
        }
        if (method === 'DELETE') {
          await readJsonBody(request, { limit: 1024 });
          return sendJson(response, 200, {
            ok: true,
            localOnly: true,
            message: 'Deleted the local playtest session',
            deleted: await gameplayTelemetryRepository.deleteSession(sessionId)
          });
        }
      }

      if (pathname.startsWith('/api/game-campaign') && !gameCampaignRepository) {
        throw new HttpError(503, 'Game campaign file integration is unavailable');
      }

      if (pathname.startsWith('/api/v1/workspace') && !gameCampaignWorkspaceRepository) {
        throw new HttpError(503, 'Game campaign workspace is unavailable');
      }

      if (method === 'GET' && pathname === '/api/v1/workspace') {
        return sendJson(response, 200, {
          ok: true,
          workspace: await gameCampaignWorkspaceRepository.readWorkspace()
        });
      }

      let workspaceMatch = /^\/api\/v1\/workspace\/levels\/([^/]+)\/waves\/([^/]+)\/boss-events\/([^/]+)$/.exec(pathname);
      if (workspaceMatch) {
        const identifiers = {
          levelId: decodePathSegment(workspaceMatch[1]),
          waveId: decodePathSegment(workspaceMatch[2]),
          eventId: decodePathSegment(workspaceMatch[3])
        };
        if (method === 'GET') {
          return sendJson(response, 200, {
            ok: true,
            ...(await gameCampaignWorkspaceRepository.readResource('boss-event', identifiers))
          });
        }
        if (method === 'PUT') {
          const body = await readJsonBody(request);
          return sendJson(response, 200, {
            ok: true,
            message: 'Boss event autosaved to the local Director workspace',
            ...(await gameCampaignWorkspaceRepository.updateResource(
              'boss-event',
              identifiers,
              requiredResource(body),
              workspaceMutationOptions(body)
            ))
          });
        }
      }

      workspaceMatch = /^\/api\/v1\/workspace\/levels\/([^/]+)\/waves\/([^/]+)$/.exec(pathname);
      if (workspaceMatch) {
        const identifiers = {
          levelId: decodePathSegment(workspaceMatch[1]),
          waveId: decodePathSegment(workspaceMatch[2])
        };
        if (method === 'GET') {
          return sendJson(response, 200, {
            ok: true,
            ...(await gameCampaignWorkspaceRepository.readResource('wave', identifiers))
          });
        }
        if (method === 'PUT') {
          const body = await readJsonBody(request);
          return sendJson(response, 200, {
            ok: true,
            message: 'Wave autosaved to the local Director workspace',
            ...(await gameCampaignWorkspaceRepository.updateResource(
              'wave',
              identifiers,
              requiredResource(body),
              workspaceMutationOptions(body)
            ))
          });
        }
      }

      workspaceMatch = /^\/api\/v1\/workspace\/(levels|missions)\/([^/]+)$/.exec(pathname);
      if (workspaceMatch) {
        const identifiers = { levelId: decodePathSegment(workspaceMatch[2]) };
        if (method === 'GET') {
          return sendJson(response, 200, {
            ok: true,
            ...(await gameCampaignWorkspaceRepository.readResource('level', identifiers))
          });
        }
        if (method === 'PUT') {
          const body = await readJsonBody(request);
          return sendJson(response, 200, {
            ok: true,
            message: 'Mission autosaved to the local Director workspace',
            ...(await gameCampaignWorkspaceRepository.updateResource(
              'level',
              identifiers,
              requiredResource(body),
              workspaceMutationOptions(body)
            ))
          });
        }
      }

      if (method === 'POST' && pathname === '/api/v1/workspace/apply') {
        const body = await readJsonBody(request, { limit: 16 * 1024 });
        return sendJson(response, 201, {
          ok: true,
          message: 'Applied the validated Director workspace to game-config/campaign.json',
          ...(await gameCampaignWorkspaceRepository.apply(workspaceMutationOptions(body)))
        });
      }

      if (method === 'POST' && pathname === '/api/v1/workspace/reset') {
        const body = await readJsonBody(request, { limit: 16 * 1024 });
        return sendJson(response, 200, {
          ok: true,
          message: 'Cleared workspace edits and reset to the tracked campaign',
          ...(await gameCampaignWorkspaceRepository.reset(workspaceMutationOptions(body)))
        });
      }

      if (method === 'POST' && pathname === '/api/v1/workspace/rebase') {
        const body = await readJsonBody(request, { limit: 16 * 1024 });
        return sendJson(response, 200, {
          ok: true,
          message: 'Rebased workspace edits onto the tracked campaign',
          ...(await gameCampaignWorkspaceRepository.rebase(workspaceMutationOptions(body)))
        });
      }

      if (method === 'GET' && pathname === '/api/game-campaign') {
        return sendJson(response, 200, {
          ok: true,
          ...(await gameCampaignRepository.readCampaign())
        });
      }

      if (method === 'GET' && pathname === '/api/game-campaign/versions') {
        const [disk, versions] = await Promise.all([
          gameCampaignRepository.readCampaign(),
          gameCampaignRepository.listVersions()
        ]);
        return sendJson(response, 200, {
          ok: true,
          activeVersionId: disk.activeVersionId,
          currentContentHash: disk.contentHash,
          versions
        });
      }

      if (method === 'POST' && pathname === '/api/game-campaign/apply') {
        const body = await readJsonBody(request);
        const result = await gameCampaignRepository.applyCampaign(requiredCampaign(body), {
          expectedContentHash: body.expectedContentHash,
          changeNote: body.changeNote
        });
        return sendJson(response, 201, {
          ok: true,
          message: `Applied game campaign revision ${result.campaign.revision} to game-config/campaign.json`,
          ...result
        });
      }

      if (method === 'POST' && pathname === '/api/game-campaign/rollback') {
        const body = await readJsonBody(request);
        if (typeof body.versionId !== 'string') {
          throw new ValidationError('Missing game campaign rollback target', ['versionId is required']);
        }
        const result = await gameCampaignRepository.rollback(body.versionId, {
          expectedContentHash: body.expectedContentHash,
          changeNote: body.changeNote
        });
        return sendJson(response, 201, {
          ok: true,
          message: `Rolled back game campaign in new revision ${result.campaign.revision}`,
          ...result
        });
      }

      let match = /^\/versions\/(scorecard|wave-campaign)$/.exec(pathname);
      if (method === 'GET' && match) {
        const kind = assertConfigKind(match[1]);
        const [active, versions] = await Promise.all([
          repository.getActive(kind),
          repository.listVersions(kind)
        ]);
        return sendJson(response, 200, { kind, activeVersionId: active.id, versions });
      }

      match = /^\/drafts\/(scorecard|wave-campaign)$/.exec(pathname);
      if (method === 'POST' && match) {
        const kind = assertConfigKind(match[1]);
        const body = await readJsonBody(request);
        const draft = await repository.saveDraft(kind, requiredPayload(body), {
          baseVersionId: body.baseVersionId
        });
        return sendJson(response, 200, {
          ok: true,
          message: 'Draft saved to the local Director workspace',
          draft
        });
      }
      if (method === 'DELETE' && match) {
        const kind = assertConfigKind(match[1]);
        const body = await readJsonBody(request);
        await repository.clearDraft(kind, { baseVersionId: body.baseVersionId });
        return sendJson(response, 200, {
          ok: true,
          message: 'Reset to the active local revision and cleared the saved draft'
        });
      }

      match = /^\/publish\/(scorecard|wave-campaign)$/.exec(pathname);
      if (method === 'POST' && match) {
        const kind = assertConfigKind(match[1]);
        const body = await readJsonBody(request);
        const envelope = await repository.publish(kind, requiredPayload(body), {
          baseVersionId: body.baseVersionId,
          changeNote: body.changeNote
        });
        return sendJson(response, 201, {
          ok: true,
          message: `Published locally as revision ${envelope.revision}`,
          envelope
        });
      }

      match = /^\/rollback\/(scorecard|wave-campaign)$/.exec(pathname);
      if (method === 'POST' && match) {
        const kind = assertConfigKind(match[1]);
        const body = await readJsonBody(request);
        if (typeof body.versionId !== 'string') {
          throw new ValidationError('Missing rollback target', ['versionId is required']);
        }
        const envelope = await repository.rollback(kind, body.versionId, {
          baseVersionId: body.baseVersionId,
          changeNote: body.changeNote
        });
        return sendJson(response, 201, {
          ok: true,
          message: `Rolled back locally in new revision ${envelope.revision}`,
          envelope
        });
      }

      if (method === 'GET' && pathname === '/reviews') {
        return sendJson(response, 200, { reviews: await repository.listReviews() });
      }

      if (method === 'POST' && pathname === '/reviews') {
        const review = await repository.createReview(await readJsonBody(request));
        return sendJson(response, 201, {
          ok: true,
          message: 'Visual change request saved locally',
          review
        });
      }

      match = /^\/reviews\/([^/]+)$/.exec(pathname);
      if (method === 'PATCH' && match) {
        const review = await repository.updateReview(
          decodePathSegment(match[1]),
          await readJsonBody(request)
        );
        return sendJson(response, 200, {
          ok: true,
          message: 'Visual change request updated locally',
          review
        });
      }

      if (method === 'GET' && pathname === '/real-runs') {
        const runs = await realRunReader.listRuns();
        return sendJson(response, 200, {
          source: 'production-readonly',
          fetchedAt: new Date().toISOString(),
          runs
        });
      }

      return sendJson(response, 404, { ok: false, error: 'Director API route not found' });
    } catch (error) {
      if (error instanceof ValidationError) {
        return sendJson(response, 422, { ok: false, error: error.message, errors: error.errors });
      }
      if (error instanceof HttpError) {
        return sendJson(response, error.statusCode, {
          ok: false,
          error: error.message,
          ...(error.details ? { errors: error.details } : {})
        });
      }
      console.error('Scicon Director local API error:', error?.message || error);
      return sendJson(response, 500, {
        ok: false,
        error: 'The local Director API could not complete the request'
      });
    }
  };
};

export const createDirectorApiPlugin = ({
  repositoryRoot,
  directorRoot: _directorRoot,
  imageApiKey = ''
}) => {
  const resolvedRepositoryRoot = path.resolve(repositoryRoot);
  const dataRoot = resolveWithin(resolvedRepositoryRoot, 'director-data');
  const fixtureRoot = resolveWithin(dataRoot, 'fixtures');
  const generatedAssetRepository = new GeneratedAssetRepository({
    repositoryRoot: resolvedRepositoryRoot,
    dataRoot
  });
  const imageGenerationClient = new OpenAIImageGenerationClient({ apiKey: imageApiKey });
  const gameCampaignRepository = new GameCampaignRepository({
    repositoryRoot: resolvedRepositoryRoot,
    dataRoot
  });
  const gameCampaignWorkspaceRepository = new GameCampaignWorkspaceRepository({
    repositoryRoot: resolvedRepositoryRoot,
    dataRoot,
    gameCampaignRepository
  });
  const gameplayTelemetryRepository = new GameplayTelemetryRepository({
    repositoryRoot: resolvedRepositoryRoot,
    dataRoot
  });
  const repository = new ConfigRepository({
    repositoryRoot: resolvedRepositoryRoot,
    dataRoot,
    fixtureRoot,
    reviewVersionResolver: (requestedVersion, context, draftCampaign) => (
      gameCampaignRepository.resolveReviewConfigReference(requestedVersion, context, draftCampaign)
    )
  });
  const requestHandler = createDirectorRequestHandler({
    repository,
    realRunReader: new RealRunReader(),
    gameCampaignRepository,
    gameCampaignWorkspaceRepository,
    gameplayTelemetryRepository,
    generatedAssetRepository,
    imageGenerationClient,
    prototypeAssets: createLocalPrototypeAssetCatalog(dataRoot)
  });

  return {
    name: 'scicon-director-local-api',
    apply: /** @type {const} */ ('serve'),
    configureServer(server) {
      server.middlewares.use(DIRECTOR_API_PREFIX, requestHandler);
    }
  };
};
