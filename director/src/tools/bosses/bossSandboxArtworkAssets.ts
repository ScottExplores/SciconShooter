interface BossSandboxIntegrityAsset {
  readonly url: string;
  readonly contentHash: string;
}

interface BossSandboxArtworkAssetRegistration {
  readonly assembled: BossSandboxIntegrityAsset;
  readonly sheet: BossSandboxIntegrityAsset;
  readonly articulatedAtlas?: BossSandboxIntegrityAsset;
  readonly modularRig?: Readonly<{
    readonly atlases: readonly BossSandboxIntegrityAsset[];
  }>;
  readonly modularReferenceComparison?: BossSandboxIntegrityAsset;
  readonly vfxAtlas?: BossSandboxIntegrityAsset;
}

/**
 * Returns every image that can participate in one Boss Sandbox presentation.
 * Modular-rig atlases are intentionally iterated as a collection so future
 * supplemental atlases receive the same browser integrity gate as the primary
 * atlas without adding boss-specific preview code.
 */
export const getBossSandboxIntegrityAssets = (
  registration: BossSandboxArtworkAssetRegistration
): readonly BossSandboxIntegrityAsset[] => {
  const candidates = [
    registration.assembled,
    registration.sheet,
    ...(registration.articulatedAtlas ? [registration.articulatedAtlas] : []),
    ...(registration.modularRig?.atlases ?? []),
    ...(registration.modularReferenceComparison
      ? [registration.modularReferenceComparison]
      : []),
    ...(registration.vfxAtlas ? [registration.vfxAtlas] : [])
  ];
  const byUrl = new Map<string, BossSandboxIntegrityAsset>();

  candidates.forEach((asset) => {
    const existing = byUrl.get(asset.url);
    if (existing && existing.contentHash !== asset.contentHash) {
      throw new Error(`Boss Sandbox artwork URL has conflicting hashes: ${asset.url}`);
    }
    if (!existing) byUrl.set(asset.url, asset);
  });

  return Object.freeze([...byUrl.values()]);
};
