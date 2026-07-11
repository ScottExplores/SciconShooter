import path from 'node:path';
import { ConfigRepository } from './configRepository.mjs';
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

const normalizedPathname = (requestUrl) => {
  const url = new URL(requestUrl || '/', 'http://director.local');
  if (url.pathname === DIRECTOR_API_PREFIX) return '/';
  if (url.pathname.startsWith(`${DIRECTOR_API_PREFIX}/`)) return url.pathname.slice(DIRECTOR_API_PREFIX.length);
  return url.pathname;
};

const isMutationMethod = (method) => ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);

export const createDirectorRequestHandler = ({ repository, realRunReader }) => {
  if (!repository || !realRunReader) throw new Error('Director API requires a repository and real-run reader');

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

export const createDirectorApiPlugin = ({ repositoryRoot, directorRoot: _directorRoot }) => {
  const resolvedRepositoryRoot = path.resolve(repositoryRoot);
  const dataRoot = resolveWithin(resolvedRepositoryRoot, 'director-data');
  const fixtureRoot = resolveWithin(dataRoot, 'fixtures');
  const repository = new ConfigRepository({
    repositoryRoot: resolvedRepositoryRoot,
    dataRoot,
    fixtureRoot
  });
  const requestHandler = createDirectorRequestHandler({
    repository,
    realRunReader: new RealRunReader()
  });

  return {
    name: 'scicon-director-local-api',
    apply: /** @type {const} */ ('serve'),
    configureServer(server) {
      server.middlewares.use(DIRECTOR_API_PREFIX, requestHandler);
    }
  };
};
