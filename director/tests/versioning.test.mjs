import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ConfigRepository, contentHash } from '../server/configRepository.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
const fixtureRoot = path.join(repositoryRoot, 'director-data', 'fixtures');

const makeRepository = async (t, options = {}) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'scicon-director-repo-'));
  let seconds = 0;
  const repository = new ConfigRepository({
    repositoryRoot,
    dataRoot,
    fixtureRoot,
    clock: () => new Date(Date.UTC(2026, 6, 10, 20, 0, seconds++)),
    ...options
  });
  t.after(() => rm(dataRoot, { recursive: true, force: true }));
  return { repository, dataRoot };
};

test('initialization creates immutable hashed revision-one envelopes and active manifests', async (t) => {
  const { repository } = await makeRepository(t);
  const bootstrap = await repository.bootstrap();
  const active = await repository.getActive('scorecard');
  assert.equal(active.revision, 1);
  assert.equal(active.id, bootstrap.activeVersions.scorecard);
  assert.equal(active.contentHash, contentHash(active.payload));
  assert.deepEqual(
    bootstrap.reviews.map((review) => review.target),
    ['Mini-boss', 'Asteroid belt', 'Gatekeeper']
  );
  assert.equal(bootstrap.safety.productionWrites, false);
  assert.equal(bootstrap.safety.mainnetTransactions, false);
});

test('initial review examples are seeded once and never replace an existing review store', async (t) => {
  const { repository, dataRoot } = await makeRepository(t);
  const seeded = await repository.listReviews();
  await repository.updateReview(seeded[0].id, { status: 'resolved' });

  const restarted = new ConfigRepository({ repositoryRoot, dataRoot, fixtureRoot });
  const reviewsAfterRestart = await restarted.listReviews();
  assert.equal(reviewsAfterRestart.length, 3);
  assert.equal(reviewsAfterRestart[0].status, 'resolved');
});

test('draft save is separate from publish and publish advances only the local manifest', async (t) => {
  const { repository, dataRoot } = await makeRepository(t);
  const initial = await repository.getActive('scorecard');
  const edited = structuredClone(initial.payload);
  edited.copy.title = 'FLIGHT RECORD';

  const draft = await repository.saveDraft('scorecard', edited, { baseVersionId: initial.id });
  assert.equal(draft.payload.copy.title, 'FLIGHT RECORD');
  assert.equal((await repository.getActive('scorecard')).id, initial.id);

  const published = await repository.publish('scorecard', edited, {
    baseVersionId: initial.id,
    changeNote: 'Update title'
  });
  assert.equal(published.revision, 2);
  assert.equal(published.parentId, initial.id);
  assert.equal(published.rollbackOf, null);
  assert.equal((await repository.getActive('scorecard')).id, published.id);
  assert.equal(await repository.getDraft('scorecard'), null);
  assert.equal((await repository.getVersion('scorecard', initial.id)).payload.copy.title, initial.payload.copy.title);

  const manifest = JSON.parse(await readFile(path.join(dataRoot, 'manifests', 'scorecard.json'), 'utf8'));
  assert.equal(manifest.activeVersionId, published.id);
});

test('reset clears a saved draft and stale tabs cannot overwrite a newer active revision', async (t) => {
  const { repository } = await makeRepository(t);
  const initial = await repository.getActive('scorecard');
  const edited = structuredClone(initial.payload);
  edited.copy.title = 'LOCAL DRAFT';

  await repository.saveDraft('scorecard', edited, { baseVersionId: initial.id });
  await repository.clearDraft('scorecard', { baseVersionId: initial.id });
  assert.equal(await repository.getDraft('scorecard'), null);

  const published = await repository.publish('scorecard', edited, { baseVersionId: initial.id });
  await assert.rejects(
    () => repository.saveDraft('scorecard', initial.payload, { baseVersionId: initial.id }),
    /active configuration changed/
  );
  await assert.rejects(
    () => repository.clearDraft('scorecard', { baseVersionId: initial.id }),
    /active configuration changed/
  );
  assert.equal((await repository.getActive('scorecard')).id, published.id);
});

test('rollback creates a new revision and never rewrites the selected version', async (t) => {
  const { repository } = await makeRepository(t);
  const initial = await repository.getActive('wave-campaign');
  const edited = structuredClone(initial.payload);
  edited.waves[0].difficultyMultiplier = 1.2;
  const changed = await repository.publish('wave-campaign', edited);
  const rolledBack = await repository.rollback('wave-campaign', initial.id, {
    baseVersionId: changed.id,
    changeNote: 'Restore baseline wave timing'
  });

  assert.equal(rolledBack.revision, 3);
  assert.equal(rolledBack.parentId, changed.id);
  assert.equal(rolledBack.rollbackOf, initial.id);
  assert.deepEqual(rolledBack.payload, initial.payload);
  assert.equal((await repository.listVersions('wave-campaign')).length, 3);
});

test('parallel local publishes serialize into distinct monotonically increasing revisions', async (t) => {
  const { repository } = await makeRepository(t);
  const initial = await repository.getActive('scorecard');
  const first = structuredClone(initial.payload);
  const second = structuredClone(initial.payload);
  first.copy.title = 'FIRST RECORD';
  second.copy.title = 'SECOND RECORD';
  const results = await Promise.all([
    repository.publish('scorecard', first),
    repository.publish('scorecard', second)
  ]);
  assert.deepEqual(results.map((result) => result.revision), [2, 3]);
  assert.equal((await repository.getActive('scorecard')).revision, 3);
});

test('manual version tampering is detected by the SHA-256 check', async (t) => {
  const { repository, dataRoot } = await makeRepository(t);
  const active = await repository.getActive('scorecard');
  const versionPath = path.join(dataRoot, 'versions', 'scorecard', `${active.id}.json`);
  const raw = JSON.parse(await readFile(versionPath, 'utf8'));
  raw.payload.copy.title = 'TAMPERED';
  await writeFile(versionPath, JSON.stringify(raw), 'utf8');
  await assert.rejects(() => repository.getVersion('scorecard', active.id), /content hash check/);
});

test('review requests reference a real config version and resolve by creating timestamps', async (t) => {
  const { repository } = await makeRepository(t);
  const activeWave = await repository.getActive('wave-campaign');
  const review = await repository.createReview({
    surface: 'wave',
    configVersion: activeWave.id,
    target: 'Wave 2 / asteroid belt',
    note: 'Increase warning contrast.',
    status: 'open',
    anchor: { x: 0.62, y: 0.31 }
  });
  assert.equal(review.status, 'open');
  const resolved = await repository.updateReview(review.id, { status: 'resolved' });
  assert.equal(resolved.status, 'resolved');
  assert.match(resolved.resolvedAt, /Z$/);
  await assert.rejects(
    () => repository.createReview({
      surface: 'scorecard',
      configVersion: activeWave.id,
      target: 'Score',
      note: 'Wrong version kind.',
      anchor: { x: 0.5, y: 0.5 }
    }),
    /Invalid configuration version ID/
  );
});

test('level-editor review context uses the injected game-campaign resolver and remains immutable', async (t) => {
  const resolutions = [];
  const { repository } = await makeRepository(t, {
    reviewVersionResolver: async (requestedVersion, context, draftCampaign) => {
      resolutions.push({ requestedVersion, context, draftCampaign });
      return requestedVersion;
    }
  });
  const context = {
    source: 'level-editor',
    campaignId: 'scicon-shooter-campaign',
    campaignRevision: 1,
    campaignContentHash: `sha256:${'b'.repeat(64)}`,
    draftContentHash: `sha256:${'c'.repeat(64)}`,
    levelId: 'operation-open-galaxy',
    levelName: 'Operation Open Galaxy',
    waveId: 'open-orbit',
    waveName: 'OPEN ORBIT',
    eventId: 'wave-1-gatekeeper',
    eventLabel: 'Gatekeeper',
    eventKind: 'boss',
    elapsedSeconds: 60,
    draft: true
  };
  const draftCampaign = { id: 'scicon-shooter-campaign', revision: 1 };
  const configVersion = 'game-campaign-draft-r1-cccccccccccc';
  const review = await repository.createReview({
    surface: 'wave',
    configVersion,
    target: 'Operation Open Galaxy / OPEN ORBIT / Gatekeeper',
    note: 'Move the warning away from the sprite.',
    status: 'open',
    anchor: { x: 0.7, y: 0.2 },
    context,
    draftCampaign
  });

  assert.deepEqual(resolutions, [{ requestedVersion: configVersion, context, draftCampaign }]);
  assert.deepEqual(review.context, context);
  await assert.rejects(
    () => repository.updateReview(review.id, { context: { ...context, waveId: 'citation-storm' } }),
    /Invalid review update/
  );
});
