import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  readFile,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const toolDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(toolDirectory, '..');
const prototypeAssetRoot = path.join(
  repositoryRoot,
  'director-data',
  'prototype-assets'
);
const publicPackageRoot = path.join(
  repositoryRoot,
  'public',
  'game-art',
  'generated',
  'bosses',
  'campaign-packages'
);
const generatedRegistryPath = path.join(
  repositoryRoot,
  'game-config',
  'generated',
  'campaign-boss-artwork.json'
);

const packages = Object.freeze([
  Object.freeze({
    bossId: 'prism-moth',
    prototypeId: 'prism-moth-brood',
    poseKey: 'prism-moth',
    assets: Object.freeze([
      Object.freeze({
        source: path.join(
          prototypeAssetRoot,
          'prism-moth-broodkeeper',
          'prism-moth-broodkeeper-neutral.png'
        ),
        output: 'prism-moth/assembled.png',
        registrationPath: 'assembled'
      }),
      Object.freeze({
        source: path.join(
          prototypeAssetRoot,
          'prism-moth-broodkeeper',
          'prism-moth-broodkeeper-atlas.png'
        ),
        output: 'prism-moth/atlas.png',
        registrationPath: 'sheet'
      })
    ])
  }),
  Object.freeze({
    bossId: 'frontier-crownclaw',
    prototypeId: 'frontier-crownclaw',
    poseKey: 'frontier-crownclaw',
    assets: Object.freeze([
      Object.freeze({
        source: path.join(
          prototypeAssetRoot,
          'frontier-crownclaw',
          'frontier-crownclaw-neutral.png'
        ),
        output: 'frontier-crownclaw/assembled.png',
        registrationPath: 'assembled'
      }),
      Object.freeze({
        source: path.join(
          prototypeAssetRoot,
          'frontier-crownclaw',
          'frontier-crownclaw-atlas.png'
        ),
        output: 'frontier-crownclaw/atlas.png',
        registrationPath: 'sheet'
      })
    ])
  }),
  Object.freeze({
    bossId: 'helios-clawcarrier',
    prototypeId: 'helios-clawcarrier',
    poseKey: 'helios-clawcarrier',
    assets: Object.freeze([
      Object.freeze({
        source: path.join(
          prototypeAssetRoot,
          'helios-clawcarrier-v2',
          'helios-clawcarrier-v2-neutral.png'
        ),
        output: 'helios-clawcarrier/assembled.png',
        registrationPath: 'assembled'
      }),
      Object.freeze({
        source: path.join(
          prototypeAssetRoot,
          'helios-clawcarrier-v2',
          'helios-clawcarrier-v2-atlas.png'
        ),
        output: 'helios-clawcarrier/atlas.png',
        registrationPath: 'sheet'
      })
    ])
  }),
  Object.freeze({
    bossId: 'nullwake-revenant',
    prototypeId: 'nullwake-revenant',
    poseKey: 'nullwake-revenant',
    assets: Object.freeze([
      Object.freeze({
        source: path.join(
          prototypeAssetRoot,
          'nullwake-revenant-assembled.png'
        ),
        output: 'nullwake-revenant/assembled.png',
        registrationPath: 'assembled'
      }),
      Object.freeze({
        source: path.join(
          prototypeAssetRoot,
          'nullwake-revenant-modular-sheet.png'
        ),
        output: 'nullwake-revenant/articulated-atlas.png',
        registrationPath: 'sheet'
      }),
      Object.freeze({
        source: path.join(
          prototypeAssetRoot,
          'nullwake-revenant-factory-atlas-v3.png'
        ),
        output: 'nullwake-revenant/factory-atlas-v3.png',
        registrationUrl:
          '/__director/api/v1/prototype-assets/nullwake-revenant/a0d29566c3e925c764267f48202ce1a18247f28007b43ad7fdcba7c8573da2cd/factory-atlas-v3.png'
      })
    ])
  }),
  Object.freeze({
    bossId: 'orbit-gyroscope',
    prototypeId: 'aurora-storm-engine',
    poseKey: 'aurora-storm-engine',
    assets: Object.freeze([
      Object.freeze({
        source: path.join(
          prototypeAssetRoot,
          'aurora-storm-engine-assembled.png'
        ),
        output: 'orbit-gyroscope/assembled.png',
        registrationPath: 'assembled'
      }),
      Object.freeze({
        source: path.join(
          prototypeAssetRoot,
          'aurora-storm-engine-modular-sheet.png'
        ),
        output: 'orbit-gyroscope/articulated-atlas.png',
        registrationPath: 'sheet'
      })
    ])
  }),
  Object.freeze({
    bossId: 'hammerhead-siege',
    prototypeId: 'gloamforge-mantis',
    poseKey: 'gloamforge-mantis',
    assets: Object.freeze([
      Object.freeze({
        source: path.join(
          prototypeAssetRoot,
          'gloamforge-mantis',
          'gloamforge-mantis-neutral.png'
        ),
        output: 'hammerhead-siege/assembled.png',
        registrationPath: 'assembled'
      }),
      Object.freeze({
        source: path.join(
          prototypeAssetRoot,
          'gloamforge-mantis',
          'gloamforge-mantis-atlas.png'
        ),
        output: 'hammerhead-siege/atlas.png',
        registrationPath: 'sheet'
      })
    ])
  }),
  Object.freeze({
    bossId: 'umbra-needlewing',
    prototypeId: 'umbra-needlewing',
    poseKey: 'umbra-needlewing',
    assets: Object.freeze([
      Object.freeze({
        source: path.join(
          prototypeAssetRoot,
          'umbra-needlewing',
          'umbra-needlewing-neutral.png'
        ),
        output: 'umbra-needlewing/assembled.png',
        registrationPath: 'assembled'
      }),
      Object.freeze({
        source: path.join(
          prototypeAssetRoot,
          'umbra-needlewing',
          'umbra-needlewing-atlas.png'
        ),
        output: 'umbra-needlewing/atlas.png',
        registrationPath: 'sheet'
      })
    ])
  })
]);

const sharedVfxAsset = Object.freeze({
  source: path.join(prototypeAssetRoot, 'aurora-boss-vfx-sheet-v1.png'),
  output: 'shared/boss-vfx-atlas-v1.png',
  registrationUrl:
    '/__director/api/v1/prototype-assets/sandbox-boss-vfx/09bcf6e00e0a3d6d96b4a64f73f09a3b7a59b890219169bcf433ebfea2b7e8b1/sheet.png'
});

const sha256 = async (filePath) => createHash('sha256')
  .update(await readFile(filePath))
  .digest('hex');

const publicUrlFor = (relativePath) => (
  `/game-art/generated/bosses/campaign-packages/${relativePath.replaceAll('\\', '/')}`
);

const getRegistrationAsset = (registration, registrationPath) => {
  const value = registration[registrationPath];
  if (!value || typeof value.url !== 'string' || typeof value.contentHash !== 'string') {
    throw new Error(
      `Artwork registration is missing the ${registrationPath} asset.`
    );
  }
  return value;
};

const rewriteUrls = (value, replacements) => {
  if (typeof value === 'string') return replacements.get(value) ?? value;
  if (Array.isArray(value)) {
    return value.map((entry) => rewriteUrls(entry, replacements));
  }
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      rewriteUrls(entry, replacements)
    ])
  );
};

const buildRegistry = async () => {
  const vite = await createServer({
    root: repositoryRoot,
    configFile: false,
    resolve: {
      alias: {
        '@game': repositoryRoot,
        '@director': path.join(repositoryRoot, 'director', 'src')
      }
    },
    server: { middlewareMode: true, hmr: false },
    appType: 'custom'
  });

  try {
    const model = await vite.ssrLoadModule(
      '/director/src/tools/bosses/bossSandboxModel.ts'
    );
    const prototypes = await vite.ssrLoadModule(
      '/director/src/combat-lab/sandboxBossPrototypes.ts'
    );
    const collisionMasks = await vite.ssrLoadModule(
      '/director/src/tools/bosses/generatedSandboxBossCollisionMasks.ts'
    );

    const compiledPackages = {};
    for (const packageSpec of packages) {
      const registration =
        model.SANDBOX_BOSS_ARTWORK_REGISTRATIONS[packageSpec.prototypeId];
      const prototype =
        prototypes.SANDBOX_BOSS_PROTOTYPE_BY_ID[packageSpec.prototypeId];
      const collisionMaskAsset =
        collisionMasks.getSandboxBossCollisionMask(packageSpec.prototypeId);
      if (!registration || !prototype || !collisionMaskAsset) {
        throw new Error(
          `Incomplete Test Boss package for ${packageSpec.prototypeId}.`
        );
      }
      if (collisionMaskAsset.contentHash !== registration.assembled.contentHash) {
        throw new Error(
          `Collision mask is stale for ${packageSpec.prototypeId}.`
        );
      }

      const replacements = new Map();
      for (const asset of [...packageSpec.assets, sharedVfxAsset]) {
        const registeredAsset = asset.registrationPath
          ? getRegistrationAsset(registration, asset.registrationPath)
          : null;
        const registeredUrl = asset.registrationUrl ?? registeredAsset?.url;
        if (!registeredUrl) {
          throw new Error(
            `No registration URL was supplied for ${asset.output}.`
          );
        }
        const actualHash = await sha256(asset.source);
        if (registeredAsset && actualHash !== registeredAsset.contentHash) {
          throw new Error(
            `${packageSpec.prototypeId} source hash does not match ${asset.registrationPath}.`
          );
        }
        replacements.set(registeredUrl, publicUrlFor(asset.output));
        const outputPath = path.join(publicPackageRoot, asset.output);
        await mkdir(path.dirname(outputPath), { recursive: true });
        await copyFile(asset.source, outputPath);
      }

      const artwork = rewriteUrls({
        url: registration.assembled.url,
        contentHash: registration.assembled.contentHash,
        collisionMask: collisionMaskAsset.mask,
        ...(registration.weaponSockets
          ? { weaponSockets: registration.weaponSockets }
          : {}),
        ...(registration.renderMode
          ? { renderMode: registration.renderMode }
          : {}),
        ...(registration.assembledMotionProfile
          ? { assembledMotionProfile: registration.assembledMotionProfile }
          : {}),
        ...(registration.articulatedAtlas
          ? { articulatedAtlas: registration.articulatedAtlas }
          : {}),
        ...(registration.modularRig
          ? { modularRigManifest: registration.modularRig.manifest }
          : {}),
        ...(registration.projectileAnimations
          ? { projectileAnimations: registration.projectileAnimations }
          : {}),
        ...(registration.vfxAtlas ? { vfxAtlas: registration.vfxAtlas } : {})
      }, replacements);

      const serializedArtwork = JSON.stringify(artwork);
      if (serializedArtwork.includes('/__director/')) {
        throw new Error(
          `${packageSpec.prototypeId} still contains a Director-only asset URL.`
        );
      }

      compiledPackages[packageSpec.bossId] = {
        bossId: packageSpec.bossId,
        prototypeId: packageSpec.prototypeId,
        prototypeHash: prototype.prototypeHash,
        poseKey: packageSpec.poseKey,
        artwork
      };
    }

    return {
      schemaVersion: 1,
      source: 'director-test-boss-packages',
      packages: compiledPackages
    };
  } finally {
    await vite.close();
  }
};

await mkdir(path.dirname(generatedRegistryPath), { recursive: true });
const registry = await buildRegistry();
await writeFile(
  generatedRegistryPath,
  `${JSON.stringify(registry, null, 2)}\n`,
  'utf8'
);
console.log(
  `Compiled ${Object.keys(registry.packages).length} Campaign boss artwork packages.`
);
