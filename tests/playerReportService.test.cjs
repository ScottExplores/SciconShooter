const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const serviceSource = fs.readFileSync(
  path.join(__dirname, '..', 'services', 'playerReportService.ts'),
  'utf8'
);

const acceptedResponse = ({ emailed = true } = {}) => ({
  ok: true,
  status: 201,
  headers: { get: () => null },
  async json() {
    return { accepted: true, stored: true, emailed };
  }
});

const loadService = ({ online = true, fetchImpl, browserTimers = false } = {}) => {
  const compiled = ts.transpileModule(serviceSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText;
  const storageValues = new Map();
  const localStorage = {
    getItem: (key) => storageValues.get(key) ?? null,
    setItem: (key, value) => storageValues.set(key, String(value))
  };
  let uuid = 0;
  const nextUuid = () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`;
  const scheduledRetries = [];
  let browserTimerId = 0;
  const browserWindow = {
    innerWidth: 390,
    innerHeight: 760,
    location: { href: 'https://sciconshooter.xyz/game' },
    addEventListener() {},
    removeEventListener() {}
  };
  if (browserTimers) {
    browserWindow.setTimeout = (callback, delay) => {
      const timer = { id: ++browserTimerId, callback, delay, canceled: false };
      scheduledRetries.push(timer);
      return timer.id;
    };
    browserWindow.clearTimeout = (id) => {
      const timer = scheduledRetries.find((candidate) => candidate.id === id);
      if (timer) timer.canceled = true;
    };
  }
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    require: (id) => {
      if (id === './clientSession') {
        return { getClientSessionId: () => '11111111-1111-4111-8111-111111111111' };
      }
      if (id === './runReceiptService') {
        return { GAME_VERSION: 'test-version' };
      }
      throw new Error(`Unexpected import: ${id}`);
    },
    AbortController,
    Date,
    Error,
    JSON,
    Map,
    Math,
    Number,
    Object,
    Promise,
    RegExp,
    String,
    URL,
    console,
    crypto: { randomUUID: nextUuid },
    document: {
      visibilityState: 'visible',
      addEventListener() {},
      removeEventListener() {}
    },
    fetch: fetchImpl || (async () => acceptedResponse()),
    location: { pathname: '/game' },
    localStorage,
    navigator: {
      onLine: online,
      language: 'en-US',
      platform: 'test-mobile',
      connection: { effectiveType: '3g', downlink: 1.5, rtt: 320, saveData: true }
    },
    performance: { getEntriesByType: () => [] },
    screen: { width: 390, height: 844 },
    setTimeout,
    clearTimeout,
    window: browserWindow,
    HTMLElement: class HTMLElement {},
    ErrorEvent: class ErrorEvent {},
    PerformanceObserver: class PerformanceObserver {
      observe() {}
      disconnect() {}
    }
  };
  vm.runInNewContext(compiled, context, { filename: 'playerReportService.js' });
  return { service: module.exports, storageValues, scheduledRetries };
};

test('manual reports send an anonymous, redacted payload without diagnostics when declined', async () => {
  let submitted;
  const { service } = loadService({
    fetchImpl: async (_url, options) => {
      submitted = JSON.parse(options.body);
      return acceptedResponse();
    }
  });

  const result = await service.submitPlayerReport({
    kind: 'feedback',
    category: 'other',
    summary: 'Wallet 0x1234567890123456789012345678901234567890 needs polish',
    details: 'authorization=super-secret-value',
    includeDiagnostics: false
  });

  assert.equal(result.delivery, 'sent');
  assert.equal(submitted.sessionId, '11111111-1111-4111-8111-111111111111');
  assert.match(submitted.summary, /\[redacted_wallet\]/);
  assert.match(submitted.details, /authorization=\[redacted\]/i);
  assert.equal(submitted.diagnostics, undefined);
});

test('manual reports remain queued until the API confirms both storage and email delivery', async () => {
  const { service, storageValues } = loadService({
    fetchImpl: async () => acceptedResponse({ emailed: false })
  });

  const result = await service.submitPlayerReport({
    kind: 'feedback',
    category: 'other',
    summary: 'Please keep this report until the email is accepted.',
    details: '',
    includeDiagnostics: false
  });

  assert.equal(result.delivery, 'queued');
  const queue = JSON.parse(storageValues.get('scicon_player_report_queue_v1'));
  assert.equal(queue.length, 1);
  assert.equal(queue[0].summary, 'Please keep this report until the email is accepted.');
});

test('offline reports stay in a bounded local queue and report queued delivery', async () => {
  let fetchCount = 0;
  const { service, storageValues } = loadService({
    online: false,
    fetchImpl: async () => {
      fetchCount += 1;
      return { ok: true, status: 202 };
    }
  });

  const result = await service.submitPlayerReport({
    kind: 'bug',
    category: 'loading-performance',
    summary: 'Sprites loaded late',
    details: 'On weak service during launch',
    includeDiagnostics: true
  });

  assert.equal(result.delivery, 'queued');
  assert.equal(fetchCount, 0);
  const queue = JSON.parse(storageValues.get('scicon_player_report_queue_v1'));
  assert.equal(queue.length, 1);
  assert.equal(queue[0].retryAttempts, 0);
  assert.equal(queue[0].nextAttemptAt, 0);
  assert.equal(queue[0].diagnostics.environment.connection.effectiveType, '3g');
});

test('Retry-After delays only the failed entry while a later due report still sends', async () => {
  const submitted = [];
  let fetchCount = 0;
  const { service, storageValues } = loadService({
    fetchImpl: async (_url, options) => {
      submitted.push(JSON.parse(options.body));
      fetchCount += 1;
      if (fetchCount === 1) {
        return {
          ok: false,
          status: 429,
          headers: { get: (name) => name.toLowerCase() === 'retry-after' ? '120' : null }
        };
      }
      return acceptedResponse();
    }
  });

  const before = Date.now();
  const first = await service.submitPlayerReport({
    kind: 'bug',
    category: 'gameplay',
    summary: 'First queued report',
    details: '',
    includeDiagnostics: false
  });
  assert.equal(first.delivery, 'queued');

  const second = await service.submitPlayerReport({
    kind: 'feedback',
    category: 'other',
    summary: 'Later due report',
    details: '',
    includeDiagnostics: false
  });
  assert.equal(second.delivery, 'sent');
  assert.deepEqual(submitted.map((report) => report.summary), [
    'First queued report',
    'Later due report'
  ]);
  assert.equal(submitted[0].retryAttempts, undefined);
  assert.equal(submitted[0].nextAttemptAt, undefined);

  const queue = JSON.parse(storageValues.get('scicon_player_report_queue_v1'));
  assert.equal(queue.length, 1);
  assert.equal(queue[0].summary, 'First queued report');
  assert.equal(queue[0].retryAttempts, 1);
  assert.ok(queue[0].nextAttemptAt >= before + 119_000);
  assert.ok(queue[0].nextAttemptAt <= Date.now() + 120_000);
});

test('online failures schedule one bounded browser retry without leaving Node timers alive', async () => {
  const { service, storageValues, scheduledRetries } = loadService({
    browserTimers: true,
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      headers: { get: () => null }
    })
  });

  const result = await service.submitPlayerReport({
    kind: 'bug',
    category: 'loading-performance',
    summary: 'Storage was unavailable',
    details: '',
    includeDiagnostics: false
  });
  assert.equal(result.delivery, 'queued');
  const queue = JSON.parse(storageValues.get('scicon_player_report_queue_v1'));
  assert.equal(queue[0].retryAttempts, 1);
  assert.ok(queue[0].nextAttemptAt > Date.now());
  const activeTimers = scheduledRetries.filter((timer) => !timer.canceled);
  assert.equal(activeTimers.length, 1);
  assert.ok(activeTimers[0].delay >= 14_000 && activeTimers[0].delay <= 15_000);
});

test('a submission returns queued immediately when another bounded flush is active', async () => {
  let releaseFirstFetch;
  let fetchCount = 0;
  const { service } = loadService({
    fetchImpl: async () => {
      fetchCount += 1;
      return new Promise((resolve) => {
        releaseFirstFetch = () => resolve(acceptedResponse());
      });
    }
  });

  const firstSubmission = service.submitPlayerReport({
    kind: 'bug',
    category: 'gameplay',
    summary: 'Flush already running',
    details: '',
    includeDiagnostics: false
  });
  assert.equal(fetchCount, 1);

  let secondResult;
  service.submitPlayerReport({
    kind: 'feedback',
    category: 'other',
    summary: 'Do not wait behind the first request',
    details: '',
    includeDiagnostics: false
  }).then((result) => { secondResult = result; });
  await Promise.resolve();
  assert.equal(secondResult?.delivery, 'queued');
  assert.equal(fetchCount, 1);

  releaseFirstFetch();
  const firstResult = await firstSubmission;
  assert.equal(firstResult.delivery, 'sent');
});

test('automatic crash capture deduplicates repeats and caps attached breadcrumbs', () => {
  const { service, storageValues } = loadService({ online: false });
  for (let index = 0; index < 45; index += 1) {
    service.recordPlayerReportBreadcrumb('wave_started', {
      wave_number: index,
      wallet: '0x1234567890123456789012345678901234567890'
    });
  }

  const first = service.capturePlayerRuntimeError('Renderer exploded', { source: 'runtime' });
  const duplicate = service.capturePlayerRuntimeError('Renderer exploded', { source: 'runtime' });

  assert.match(first, /^[0-9a-f-]{36}$/i);
  assert.equal(duplicate, null);
  const queue = JSON.parse(storageValues.get('scicon_player_report_queue_v1'));
  assert.equal(queue.length, 1);
  assert.ok(queue[0].diagnostics.breadcrumbs.length <= 30);
  assert.doesNotMatch(JSON.stringify(queue), /0x1234567890123456789012345678901234567890/i);
});
