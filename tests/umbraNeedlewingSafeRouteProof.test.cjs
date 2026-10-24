const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const loadCompiledUmbraTimeline = () => {
  const campaign = JSON.parse(fs.readFileSync(path.join(
    root,
    'game-config',
    'campaign.json'
  ), 'utf8'));
  const matches = campaign.levels.flatMap((level) => (
    level.waves.flatMap((wave) => wave.events.filter((event) => (
      event.kind === 'boss' && event.bossId === 'umbra-needlewing'
    )))
  ));
  assert.equal(matches.length, 1, 'the compiled campaign must contain one Umbra boss');
  assert.ok(matches[0].timeline, 'the compiled Umbra boss must own its timeline');
  return matches[0].timeline;
};

const loadRuntime = () => {
  const cache = new Map();
  const loadFile = (absolutePath) => {
    const resolvedPath = absolutePath.endsWith('.ts') ? absolutePath : `${absolutePath}.ts`;
    if (cache.has(resolvedPath)) return cache.get(resolvedPath).exports;
    const source = fs.readFileSync(resolvedPath, 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022
      }
    }).outputText;
    const moduleBox = { exports: {} };
    cache.set(resolvedPath, moduleBox);
    const localRequire = (specifier) => {
      if (!specifier.startsWith('.')) return require(specifier);
      return loadFile(path.resolve(path.dirname(resolvedPath), specifier));
    };
    vm.runInNewContext(
      `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
      { module: moduleBox, require: localRequire, Math, Number, Object, Array, Map, Set, JSON }
    );
    return moduleBox.exports;
  };
  return loadFile(path.join(
    root,
    'services',
    'gameplay',
    'bosses',
    'UmbraNeedlewingSafeRouteProof.ts'
  ));
};

test('all four Umbra sentences retain a continuous canonical-phone route in every phase', () => {
  const runtime = loadRuntime();
  const timeline = loadCompiledUmbraTimeline();
  const matrix = runtime.buildUmbraNeedlewingSafeRouteMatrix(timeline);

  assert.equal(matrix.length, 12);
  const failures = matrix.filter((entry) => entry.proof.status !== 'proven');
  const failureSummary = failures.map((entry) => ({
    phaseId: entry.phaseId,
    attackId: entry.attackId,
    reason: entry.proof.reason,
    detail: entry.proof.detail
  }));
  assert.deepEqual(
    failureSummary,
    [],
    JSON.stringify(failureSummary, null, 2)
  );
  for (const entry of matrix) {
    assert.equal(
      entry.proof.status,
      'proven',
      `${entry.phaseId}/${entry.attackId}: ${entry.proof.detail}`
    );
    assert.equal(entry.proof.viewportId, 'mobile-390x844');
    assert.ok(
      entry.proof.minimumRawClearancePixels
        >= runtime.UMBRA_NEEDLEWING_REQUIRED_RAW_CLEARANCE_PIXELS
    );
    assert.ok(entry.proof.minimumClearanceAfterUncertaintyPixels >= 6);
    assert.match(entry.proof.configurationHash, /^[0-9a-f]{8}$/);
    assert.match(entry.proof.routeHash, /^[0-9a-f]{8}$/);
    assert.equal(entry.proof.checkedFrames, entry.proof.durationFrames);
    assert.equal(entry.proof.witness.length, entry.proof.durationFrames);
  }
});

test('Umbra proof is deterministic and never reads ambient randomness', () => {
  const runtime = loadRuntime();
  const request = {
    timeline: loadCompiledUmbraTimeline(),
    attackId: runtime.UMBRA_NEEDLEWING_ATTACK_IDS.blackoutAmbush,
    phaseId: runtime.UMBRA_NEEDLEWING_PHASE_IDS.broken
  };
  const first = runtime.proveUmbraNeedlewingSafeRoute(request);
  const repeated = runtime.proveUmbraNeedlewingSafeRoute(request);
  const source = fs.readFileSync(path.join(
    root,
    'services',
    'gameplay',
    'bosses',
    'UmbraNeedlewingSafeRouteProof.ts'
  ), 'utf8');

  assert.equal(first.status, 'proven', first.detail);
  assert.equal(repeated.routeHash, first.routeHash);
  assert.equal(repeated.configurationHash, first.configurationHash);
  assert.deepEqual(
    JSON.parse(JSON.stringify(repeated.witness)),
    JSON.parse(JSON.stringify(first.witness))
  );
  assert.doesNotMatch(source, /Math\.random|Date\.|performance\./);
});

test('proof rejects any viewport that is not the canonical mobile arena', () => {
  const runtime = loadRuntime();
  const result = runtime.proveUmbraNeedlewingSafeRoute({
    timeline: loadCompiledUmbraTimeline(),
    attackId: runtime.UMBRA_NEEDLEWING_ATTACK_IDS.wingShear,
    phaseId: runtime.UMBRA_NEEDLEWING_PHASE_IDS.survey,
    viewport: {
      id: 'wide-gameplay',
      width: 1280,
      height: 720,
      mobileProfile: false
    }
  });

  assert.equal(result.status, 'unproven');
  assert.equal(result.reason, 'invalid-viewport');
  assert.match(result.detail, /390x844/);
});

test('proof schedule is derived from the current compiled Umbra timeline', () => {
  const runtime = loadRuntime();
  const timeline = loadCompiledUmbraTimeline();
  const proofSource = fs.readFileSync(path.join(
    root,
    'services',
    'gameplay',
    'bosses',
    'UmbraNeedlewingSafeRouteProof.ts'
  ), 'utf8');

  assert.equal(timeline.clips.length, 120);
  assert.equal(timeline.attacks.length, 4);
  assert.doesNotMatch(proofSource, /const PLANS|wingPlan\(|ringPlan\(|cornerPlan\(|signaturePlan\(/);

  const attackId = runtime.UMBRA_NEEDLEWING_ATTACK_IDS.orbitGap;
  const phaseId = runtime.UMBRA_NEEDLEWING_PHASE_IDS.broken;
  const baseline = runtime.proveUmbraNeedlewingSafeRoute({ timeline, attackId, phaseId });
  const changedTimeline = structuredClone(timeline);
  const variant = changedTimeline.attacks
    .find((attack) => attack.id === attackId)
    .variants.find((candidate) => candidate.phaseId === phaseId);
  const firstAction = changedTimeline.clips.find((clip) => clip.id === variant.beatClipIds[0]);
  const recovery = changedTimeline.clips.find((clip) => clip.id === variant.recoveryClipId);
  firstAction.parameters.sequence += 7;
  recovery.durationSeconds += 0.25;
  const changed = runtime.proveUmbraNeedlewingSafeRoute({
    timeline: changedTimeline,
    attackId,
    phaseId
  });

  assert.equal(baseline.status, 'proven', baseline.detail);
  assert.equal(changed.durationFrames, baseline.durationFrames + 15);
  assert.notEqual(changed.configurationHash, baseline.configurationHash);
});
