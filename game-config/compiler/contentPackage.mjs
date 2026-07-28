import { createHash } from 'node:crypto';

const PACKAGE_KIND = 'scicon-game-content-package';
const RESOURCE_SCHEMA_VERSION = 1;
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

const isRecord = (value) => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const cloneJson = (value) => JSON.parse(JSON.stringify(value));

export const canonicalJson = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  )).join(',')}}`;
};

export const hashJson = (value) => (
  `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`
);

const stableJsonValue = (value) => {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableJsonValue(value[key])])
  );
};

export const serializeCompiledCampaign = (campaign) => (
  `${JSON.stringify(stableJsonValue(campaign), null, 2)}\n`
);

const diagnostic = (diagnostics, code, path, message) => {
  diagnostics.push({ severity: 'error', code, path, message });
};

const indexResources = (value, label, diagnostics) => {
  const path = `/${label}`;
  if (!Array.isArray(value)) {
    diagnostic(diagnostics, 'invalid-package', path, `${label} must be an array`);
    return { resources: [], byId: new Map() };
  }
  const byId = new Map();
  value.forEach((resource, index) => {
    const resourcePath = `${path}/${index}`;
    if (!isRecord(resource) || typeof resource.id !== 'string' || !resource.id) {
      diagnostic(
        diagnostics,
        'invalid-resource',
        resourcePath,
        `${label} entries must be objects with a non-empty id`
      );
      return;
    }
    if (byId.has(resource.id)) {
      diagnostic(
        diagnostics,
        'duplicate-resource-id',
        `${resourcePath}/id`,
        `${label} contains duplicate resource id: ${resource.id}`
      );
      return;
    }
    byId.set(resource.id, { resource, path: resourcePath });
  });
  return { resources: value, byId };
};

const validateReferenceList = (value, path, diagnostics) => {
  if (!Array.isArray(value)) {
    diagnostic(diagnostics, 'invalid-resource', path, `${path} must be an array`);
    return [];
  }
  const seen = new Set();
  value.forEach((id, index) => {
    if (typeof id !== 'string' || !id) {
      diagnostic(
        diagnostics,
        'invalid-resource',
        `${path}/${index}`,
        'resource references must be non-empty IDs'
      );
      return;
    }
    if (seen.has(id)) {
      diagnostic(
        diagnostics,
        'duplicate-resource-reference',
        `${path}/${index}`,
        `duplicate resource reference: ${id}`
      );
    }
    seen.add(id);
  });
  return value.filter((id) => typeof id === 'string' && id);
};

const validateCampaignFieldOrder = (value, campaign, diagnostics) => {
  const path = '/manifest/campaignFieldOrder';
  if (!Array.isArray(value)) {
    diagnostic(
      diagnostics,
      'invalid-package',
      path,
      'manifest campaignFieldOrder must be an array'
    );
    return [];
  }

  const expectedKeys = new Set([...Object.keys(campaign), 'levels']);
  const seen = new Set();
  value.forEach((key, index) => {
    const keyPath = `${path}/${index}`;
    if (typeof key !== 'string' || !key) {
      diagnostic(diagnostics, 'invalid-package', keyPath, 'campaign field names must be non-empty strings');
      return;
    }
    if (!expectedKeys.has(key)) {
      diagnostic(diagnostics, 'invalid-package', keyPath, `unknown campaign field: ${key}`);
      return;
    }
    if (seen.has(key)) {
      diagnostic(diagnostics, 'invalid-package', keyPath, `duplicate campaign field: ${key}`);
      return;
    }
    seen.add(key);
  });

  expectedKeys.forEach((key) => {
    if (!seen.has(key)) {
      diagnostic(diagnostics, 'invalid-package', path, `campaignFieldOrder is missing field: ${key}`);
    }
  });
  return value.filter((key) => typeof key === 'string' && expectedKeys.has(key));
};

const validateResourceHeader = (resource, expectedKind, path, diagnostics) => {
  if (resource.schemaVersion !== RESOURCE_SCHEMA_VERSION) {
    diagnostic(
      diagnostics,
      'unsupported-schema',
      `${path}/schemaVersion`,
      `${expectedKind} resource schemaVersion must be 1`
    );
  }
  if (resource.kind !== expectedKind) {
    diagnostic(
      diagnostics,
      'invalid-resource',
      `${path}/kind`,
      `resource kind must be ${expectedKind}`
    );
  }
};

const validatePayload = (resource, forbiddenKey, path, diagnostics) => {
  if (!isRecord(resource.payload)) {
    diagnostic(diagnostics, 'invalid-resource', `${path}/payload`, 'resource payload must be an object');
    return null;
  }
  if (resource.payload.id !== resource.id) {
    diagnostic(
      diagnostics,
      'payload-id-mismatch',
      `${path}/payload/id`,
      `payload id must match resource id ${resource.id}`
    );
  }
  if (forbiddenKey && Object.hasOwn(resource.payload, forbiddenKey)) {
    diagnostic(
      diagnostics,
      'forbidden-runtime-field',
      `${path}/payload/${forbiddenKey}`,
      `${forbiddenKey} belongs in package references, not the resource payload`
    );
  }
  return resource.payload;
};

export const diagnoseContentPackage = (contentPackage) => {
  const diagnostics = [];
  if (!isRecord(contentPackage)) {
    diagnostic(diagnostics, 'invalid-package', '/', 'content package must be an object');
    return diagnostics;
  }

  const manifest = contentPackage.manifest;
  if (!isRecord(manifest)) {
    diagnostic(diagnostics, 'invalid-package', '/manifest', 'manifest must be an object');
  } else {
    if (manifest.schemaVersion !== 1 || manifest.sourceCampaignSchemaVersion !== 1) {
      diagnostic(
        diagnostics,
        'unsupported-schema',
        '/manifest/schemaVersion',
        'only schema-v1 content packages and source campaigns are supported'
      );
    }
    if (manifest.kind !== PACKAGE_KIND) {
      diagnostic(
        diagnostics,
        'invalid-package',
        '/manifest/kind',
        `manifest kind must be ${PACKAGE_KIND}`
      );
    }
    if (!HASH_PATTERN.test(manifest.sourceCampaignHash)) {
      diagnostic(
        diagnostics,
        'invalid-package',
        '/manifest/sourceCampaignHash',
        'manifest sourceCampaignHash must be a SHA-256 content hash'
      );
    }
    if (!Number.isInteger(manifest.sourceCampaignRevision) || manifest.sourceCampaignRevision < 1) {
      diagnostic(
        diagnostics,
        'invalid-package',
        '/manifest/sourceCampaignRevision',
        'manifest sourceCampaignRevision must be a positive integer'
      );
    }
  }

  const campaign = contentPackage.campaign;
  if (!isRecord(campaign)) {
    diagnostic(diagnostics, 'invalid-package', '/campaign', 'campaign metadata must be an object');
  } else {
    if (campaign.schemaVersion !== 1) {
      diagnostic(
        diagnostics,
        'unsupported-schema',
        '/campaign/schemaVersion',
        'campaign metadata schemaVersion must be 1'
      );
    }
    if (typeof campaign.id !== 'string' || !campaign.id) {
      diagnostic(diagnostics, 'invalid-package', '/campaign/id', 'campaign metadata id is required');
    }
    if (!Number.isInteger(campaign.revision) || campaign.revision < 1) {
      diagnostic(
        diagnostics,
        'invalid-package',
        '/campaign/revision',
        'campaign metadata revision must be a positive integer'
      );
    }
    if (Object.hasOwn(campaign, 'levels')) {
      diagnostic(
        diagnostics,
        'forbidden-runtime-field',
        '/campaign/levels',
        'levels must be reconstructed from mission resources'
      );
    }
    if (isRecord(manifest) && manifest.sourceCampaignId !== campaign.id) {
      diagnostic(
        diagnostics,
        'parent-mismatch',
        '/manifest/sourceCampaignId',
        'manifest sourceCampaignId must match campaign metadata id'
      );
    }
    if (
      isRecord(manifest)
      && Number.isInteger(manifest.sourceCampaignRevision)
      && manifest.sourceCampaignRevision !== campaign.revision
    ) {
      diagnostic(
        diagnostics,
        'parent-mismatch',
        '/manifest/sourceCampaignRevision',
        'manifest sourceCampaignRevision must match campaign metadata revision'
      );
    }
  }

  if (isRecord(manifest) && isRecord(campaign)) {
    validateCampaignFieldOrder(manifest.campaignFieldOrder, campaign, diagnostics);
  }

  const missions = indexResources(contentPackage.missions, 'missions', diagnostics);
  const waves = indexResources(contentPackage.waves, 'waves', diagnostics);
  const bosses = indexResources(contentPackage.bosses, 'bosses', diagnostics);
  const runtimeIdOwners = new Map();
  const waveReferences = new Map();
  const eventReferences = new Map();
  const eventCatalog = new Map();

  const claimRuntimeId = (id, owner, path) => {
    if (typeof id !== 'string' || !id) return;
    const existing = runtimeIdOwners.get(id);
    if (existing) {
      diagnostic(
        diagnostics,
        'duplicate-runtime-id',
        path,
        `runtime id ${id} is already owned by ${existing}`
      );
      return;
    }
    runtimeIdOwners.set(id, owner);
  };

  for (const [id, entry] of missions.byId) {
    const { resource, path } = entry;
    validateResourceHeader(resource, 'mission', path, diagnostics);
    validatePayload(resource, 'waves', path, diagnostics);
    claimRuntimeId(id, `mission ${id}`, `${path}/id`);
    validateReferenceList(resource.waveIds, `${path}/waveIds`, diagnostics);
  }

  for (const [id, entry] of waves.byId) {
    const { resource, path } = entry;
    validateResourceHeader(resource, 'wave', path, diagnostics);
    validatePayload(resource, 'events', path, diagnostics);
    claimRuntimeId(id, `wave ${id}`, `${path}/id`);
    if (typeof resource.missionId !== 'string' || !resource.missionId) {
      diagnostic(diagnostics, 'invalid-resource', `${path}/missionId`, 'wave missionId is required');
    }
    validateReferenceList(resource.eventIds, `${path}/eventIds`, diagnostics);
    if (!Array.isArray(resource.events)) {
      diagnostic(diagnostics, 'invalid-resource', `${path}/events`, 'wave events must be an array');
      continue;
    }
    const localEventIds = new Set();
    resource.events.forEach((event, index) => {
      const eventPath = `${path}/events/${index}`;
      if (!isRecord(event) || typeof event.id !== 'string' || !event.id) {
        diagnostic(
          diagnostics,
          'invalid-resource',
          eventPath,
          'inline wave events must be objects with a non-empty id'
        );
        return;
      }
      if (event.kind === 'boss') {
        diagnostic(
          diagnostics,
          'boss-kind-required',
          `${eventPath}/kind`,
          'boss events must be stored as boss resources'
        );
      }
      if (localEventIds.has(event.id) || eventCatalog.has(event.id)) {
        diagnostic(
          diagnostics,
          'duplicate-resource-id',
          `${eventPath}/id`,
          `duplicate event resource id: ${event.id}`
        );
      } else {
        localEventIds.add(event.id);
        eventCatalog.set(event.id, {
          event,
          missionId: resource.missionId,
          waveId: id,
          path: eventPath
        });
      }
      claimRuntimeId(event.id, `event ${event.id}`, `${eventPath}/id`);
    });
  }

  for (const [id, entry] of bosses.byId) {
    const { resource, path } = entry;
    validateResourceHeader(resource, 'boss-event', path, diagnostics);
    const payload = validatePayload(resource, null, path, diagnostics);
    if (!payload || payload.kind !== 'boss') {
      diagnostic(
        diagnostics,
        'boss-kind-required',
        `${path}/payload/kind`,
        'boss resource payload kind must be boss'
      );
    }
    if (typeof resource.missionId !== 'string' || !resource.missionId) {
      diagnostic(diagnostics, 'invalid-resource', `${path}/missionId`, 'boss missionId is required');
    }
    if (typeof resource.waveId !== 'string' || !resource.waveId) {
      diagnostic(diagnostics, 'invalid-resource', `${path}/waveId`, 'boss waveId is required');
    }
    if (eventCatalog.has(id)) {
      diagnostic(
        diagnostics,
        'duplicate-resource-id',
        `${path}/id`,
        `duplicate event resource id: ${id}`
      );
    } else if (payload) {
      eventCatalog.set(id, {
        event: payload,
        missionId: resource.missionId,
        waveId: resource.waveId,
        path
      });
    }
    claimRuntimeId(id, `boss event ${id}`, `${path}/id`);
  }

  const missionIds = isRecord(manifest)
    ? validateReferenceList(manifest.missionIds, '/manifest/missionIds', diagnostics)
    : [];
  const missionReferenceCounts = new Map();
  missionIds.forEach((missionId, index) => {
    const entry = missions.byId.get(missionId);
    missionReferenceCounts.set(missionId, (missionReferenceCounts.get(missionId) ?? 0) + 1);
    if (!entry) {
      diagnostic(
        diagnostics,
        'missing-resource-reference',
        `/manifest/missionIds/${index}`,
        `mission reference does not resolve: ${missionId}`
      );
      return;
    }
    const waveIds = Array.isArray(entry.resource.waveIds) ? entry.resource.waveIds : [];
    waveIds.forEach((waveId, waveIndex) => {
      const waveEntry = waves.byId.get(waveId);
      waveReferences.set(waveId, (waveReferences.get(waveId) ?? 0) + 1);
      if (!waveEntry) {
        diagnostic(
          diagnostics,
          'missing-resource-reference',
          `${entry.path}/waveIds/${waveIndex}`,
          `wave reference does not resolve: ${waveId}`
        );
        return;
      }
      if (waveEntry.resource.missionId !== missionId) {
        diagnostic(
          diagnostics,
          'parent-mismatch',
          `${waveEntry.path}/missionId`,
          `wave ${waveId} belongs to ${waveEntry.resource.missionId}, not ${missionId}`
        );
      }
      const eventIds = Array.isArray(waveEntry.resource.eventIds)
        ? waveEntry.resource.eventIds
        : [];
      eventIds.forEach((eventId, eventIndex) => {
        const eventEntry = eventCatalog.get(eventId);
        eventReferences.set(eventId, (eventReferences.get(eventId) ?? 0) + 1);
        if (!eventEntry) {
          diagnostic(
            diagnostics,
            'missing-resource-reference',
            `${waveEntry.path}/eventIds/${eventIndex}`,
            `event reference does not resolve: ${eventId}`
          );
          return;
        }
        if (eventEntry.missionId !== missionId || eventEntry.waveId !== waveId) {
          diagnostic(
            diagnostics,
            'parent-mismatch',
            eventEntry.path,
            `event ${eventId} does not belong to mission ${missionId}, wave ${waveId}`
          );
        }
      });
    });
  });

  for (const [id, entry] of missions.byId) {
    if (!missionReferenceCounts.has(id)) {
      diagnostic(diagnostics, 'orphan-resource', entry.path, `mission is not referenced: ${id}`);
    }
  }
  for (const [id, entry] of waves.byId) {
    const count = waveReferences.get(id) ?? 0;
    if (count === 0) {
      diagnostic(diagnostics, 'orphan-resource', entry.path, `wave is not referenced: ${id}`);
    } else if (count > 1) {
      diagnostic(
        diagnostics,
        'duplicate-resource-reference',
        entry.path,
        `wave is referenced more than once: ${id}`
      );
    }
  }
  for (const [id, eventEntry] of eventCatalog) {
    const count = eventReferences.get(id) ?? 0;
    if (count === 0) {
      diagnostic(diagnostics, 'orphan-resource', eventEntry.path, `event is not referenced: ${id}`);
    } else if (count > 1) {
      diagnostic(
        diagnostics,
        'duplicate-resource-reference',
        eventEntry.path,
        `event is referenced more than once: ${id}`
      );
    }
  }

  return diagnostics;
};

export class ContentPackageCompilationError extends Error {
  constructor(diagnostics) {
    super(`Game content package has ${diagnostics.length} compilation error${diagnostics.length === 1 ? '' : 's'}`);
    this.name = 'ContentPackageCompilationError';
    this.diagnostics = cloneJson(diagnostics);
  }
}

export const compileContentPackage = (contentPackage) => {
  const diagnostics = diagnoseContentPackage(contentPackage);
  if (diagnostics.length) throw new ContentPackageCompilationError(diagnostics);

  const missionById = new Map(contentPackage.missions.map((resource) => [resource.id, resource]));
  const waveById = new Map(contentPackage.waves.map((resource) => [resource.id, resource]));
  const bossById = new Map(contentPackage.bosses.map((resource) => [resource.id, resource]));
  const levels = contentPackage.manifest.missionIds.map((missionId) => {
    const mission = missionById.get(missionId);
    const waves = mission.waveIds.map((waveId) => {
      const wave = waveById.get(waveId);
      const inlineEvents = new Map(wave.events.map((event) => [event.id, event]));
      const events = wave.eventIds.map((eventId) => (
        cloneJson(inlineEvents.get(eventId) ?? bossById.get(eventId).payload)
      ));
      return { ...cloneJson(wave.payload), events };
    });
    return { ...cloneJson(mission.payload), waves };
  });
  const campaignMetadata = cloneJson(contentPackage.campaign);
  return Object.fromEntries(contentPackage.manifest.campaignFieldOrder.map((key) => [
    key,
    key === 'levels' ? levels : campaignMetadata[key]
  ]));
};

export const compileContentPackageWithDiagnostics = (contentPackage) => {
  const diagnostics = diagnoseContentPackage(contentPackage);
  if (diagnostics.length) return { campaign: null, diagnostics };
  return { campaign: compileContentPackage(contentPackage), diagnostics: [] };
};

export const contentPackageKind = PACKAGE_KIND;
