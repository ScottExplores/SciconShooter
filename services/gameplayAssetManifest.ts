import { ASSET_CATALOG } from '../game-config/catalog';
import type { AssetKey, GameCampaign } from '../game-config/types';

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const collectValueTextureUrls = (
  value: unknown,
  urls: Set<string>,
  visited: Set<object>
) => {
  if (typeof value === 'string') {
    const catalogEntry = Object.prototype.hasOwnProperty.call(ASSET_CATALOG, value)
      ? ASSET_CATALOG[value as AssetKey]
      : undefined;
    if (catalogEntry) {
      catalogEntry.paths.forEach((url) => urls.add(url));
    } else if (value.startsWith('/game-art/')) {
      urls.add(value);
    }
    return;
  }
  if (!value || typeof value !== 'object' || visited.has(value)) return;
  visited.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry) => collectValueTextureUrls(entry, urls, visited));
    return;
  }
  if (isRecord(value)) {
    Object.values(value).forEach((entry) => collectValueTextureUrls(entry, urls, visited));
  }
};

/** Collects safe catalog-backed or already-resolved game-art URLs. */
export const collectRuntimeTextureUrls = (...values: readonly unknown[]) => {
  const urls = new Set<string>();
  const visited = new Set<object>();
  values.forEach((value) => collectValueTextureUrls(value, urls, visited));
  return [...urls];
};

/**
 * Builds the selected Mission's small, deterministic texture pack. Endless
 * modes include a short look-ahead so the following depth is decoded during
 * the current fight instead of at its boundary.
 */
export const collectCampaignTextureWindow = (
  campaign: GameCampaign,
  levelId?: string,
  levelLookahead = 1
) => {
  const startIndex = Math.max(
    0,
    campaign.levels.findIndex((level) => level.id === levelId)
  );
  const levelCount = Math.max(1, Math.floor(levelLookahead));
  const levels = campaign.levels.slice(startIndex, startIndex + levelCount);
  return collectRuntimeTextureUrls(
    campaign.hudAssets,
    campaign.recordCard,
    levels
  );
};
