const DIRECTOR_PROTOTYPE_ASSET_PREFIX =
  '/__director/api/v1/prototype-assets/';

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
