const DIRECTOR_PROTOTYPE_ASSET_PREFIX =
  '/__director/api/v1/prototype-assets/';
const MINI_BOSS_LAB_V2_ASSET_PREFIX =
  '/game-art/generated/mini-boss-lab-v2';

const createDirectorPrototypeAssetPattern = () => (
  /\/__director\/api\/v1\/prototype-assets\/([a-z0-9-]+)\/(?:\$\{[^}\r\n]+\}|[a-f0-9]{64})\/([a-z0-9-]+\.png)/g
);

/**
 * Rewrites every content-hash-bound Director prototype image to the hosted
 * runner's read-only, same-origin namespace. The variant is deliberately
 * generic so supplemental modular atlases require no build-plugin changes.
 */
export const rewriteDirectorPrototypeAssetUrls = (source) => {
  if (!source.includes(DIRECTOR_PROTOTYPE_ASSET_PREFIX)) return source;
  const code = source.replace(
    createDirectorPrototypeAssetPattern(),
    '/runner-assets/prototype-assets/$1/$2'
  );
  if (code.includes(DIRECTOR_PROTOTYPE_ASSET_PREFIX)) {
    throw new Error(
      'Remote Boss Test Runner encountered an unsupported Director prototype asset URL.'
    );
  }
  return code;
};

/**
 * Rewrites the generated Mini-Boss Lab bodies to the same pinned, read-only
 * namespace used by the hosted Runner. Mini-boss IDs and filenames must match
 * exactly so arbitrary public paths cannot enter the deployment package.
 */
export const rewriteGeneratedMiniBossAssetUrls = (source) => {
  if (!source.includes(MINI_BOSS_LAB_V2_ASSET_PREFIX)) return source;
  const code = source.replaceAll(
    MINI_BOSS_LAB_V2_ASSET_PREFIX,
    '/runner-assets/prototype-assets'
  );
  if (code.includes(MINI_BOSS_LAB_V2_ASSET_PREFIX)) {
    throw new Error(
      'Remote Boss Test Runner encountered an unsupported Mini-Boss Lab asset URL.'
    );
  }
  return code;
};

export const rewriteHostedRunnerAssetUrls = (source) => (
  rewriteGeneratedMiniBossAssetUrls(rewriteDirectorPrototypeAssetUrls(source))
);
