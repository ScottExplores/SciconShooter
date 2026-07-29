import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const directorRequire = createRequire(path.join(workspaceRoot, 'director', 'package.json'));
const { PNG } = directorRequire('pngjs');
const GRID_SIZE = 64;
const ALPHA_THRESHOLD = 48;

const publicAsset = (url) => path.join(
  workspaceRoot,
  'public',
  url.replace(/^\/+/, '').replace(/\//g, path.sep)
);

const frameRange = (prefix, count, suffix = '.png') => (
  Array.from({ length: count }, (_, index) => `${prefix}${index + 1}${suffix}`)
);

const campaignMasks = [
  {
    key: '/game-art/pixi/bosses/open-orbit/frame-1.png',
    sources: frameRange('/game-art/pixi/bosses/open-orbit/frame-', 5)
  },
  {
    key: '/game-art/pixi/bosses/citation-storm/frame-1.png',
    sources: frameRange('/game-art/pixi/bosses/citation-storm/frame-', 5)
  },
  {
    key: '/game-art/pixi/bosses/paywall-decimator/body/frame-1.png',
    sources: frameRange('/game-art/pixi/bosses/paywall-decimator/body/frame-', 5)
  },
  {
    key: '/game-art/generated/bosses/astral-crownclaw/animations/decay/frames/astral-crownclaw-decay-frame-01.png',
    sources: Array.from(
      { length: 6 },
      (_, index) => `/game-art/generated/bosses/astral-crownclaw/animations/decay/frames/astral-crownclaw-decay-frame-0${index + 1}.png`
    )
  },
  {
    key: '/game-art/generated/scicon-stage20-expansion-v1/bosses/frames/eclipse-engine.png'
  },
  {
    key: '/game-art/generated/scicon-stage20-expansion-v1/bosses/frames/hammerhead-siege.png'
  },
  {
    key: '/game-art/generated/scicon-stage20-expansion-v1/bosses/frames/helix-leviathan.png'
  },
  {
    key: '/game-art/generated/scicon-stage20-expansion-v1/bosses/frames/orbit-gyroscope.png'
  },
  {
    key: '/game-art/generated/scicon-stage20-expansion-v1/bosses/frames/prism-moth.png'
  },
  {
    key: '/game-art/generated/scicon-stage20-expansion-v1/bosses/frames/rail-serpent.png'
  },
  {
    key: '/game-art/generated/scicon-stage20-expansion-v1/bosses/frames/singularity-crab.png'
  },
  {
    key: '/game-art/generated/scicon-stage20-expansion-v1/bosses/frames/tribunal-dreadnought.png'
  },
  {
    key: '/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/bullet-ring-emitter.png'
  },
  {
    key: '/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/crescent-minelayer.png'
  },
  {
    key: '/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/dark-asteroid-sentinel.png'
  },
  {
    key: '/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/dna-conductor.png'
  },
  {
    key: '/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/laser-hunter.png'
  },
  {
    key: '/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/laser-stalker.png'
  },
  {
    key: '/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/orbit-disc.png'
  },
  {
    key: '/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/prism-artillery.png'
  },
  {
    key: '/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/ring-sentinel.png'
  },
  {
    key: '/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/shield-rammer.png'
  },
  {
    key: '/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/wall-sniper-left.png'
  },
  {
    key: '/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/wall-sniper-right.png'
  },
  {
    key: '/game-art/bosses/mini-boss-drone.png'
  },
  {
    key: '/game-art/generated/scicon-flight-motion-pack-v1/bosses/bottleneck-harvester/frames/bottleneck-harvester-01-idle.png'
  },
  {
    key: '/game-art/generated/scicon-flight-motion-pack-v1/bosses/bottleneck-harvester/frames/bottleneck-harvester-02-neutral.png'
  },
  {
    key: '/game-art/generated/scicon-flight-motion-pack-v1/bosses/bottleneck-harvester/frames/bottleneck-harvester-03-attack.png'
  },
  {
    key: '/game-art/generated/scicon-flight-motion-pack-v1/bosses/bottleneck-harvester/frames/bottleneck-harvester-04-damage-50.png'
  },
  {
    key: '/game-art/generated/scicon-flight-motion-pack-v1/bosses/bottleneck-harvester/frames/bottleneck-harvester-05-critical-15.png'
  },
  {
    key: '/game-art/generated/scicon-flight-motion-pack-v1/bosses/paywall-bastion/frames/paywall-bastion-01-idle.png',
    sources: [
      '/game-art/generated/scicon-flight-motion-pack-v1/bosses/paywall-bastion/frames/paywall-bastion-01-idle.png',
      '/game-art/generated/scicon-flight-motion-pack-v1/bosses/paywall-bastion/frames/paywall-bastion-02-neutral.png',
      '/game-art/generated/scicon-flight-motion-pack-v1/bosses/paywall-bastion/frames/paywall-bastion-03-attack.png',
      '/game-art/generated/scicon-flight-motion-pack-v1/bosses/paywall-bastion/frames/paywall-bastion-04-damage-50.png',
      '/game-art/generated/scicon-flight-motion-pack-v1/bosses/paywall-bastion/frames/paywall-bastion-05-critical-15.png'
    ]
  }
];

const componentMasks = [
  {
    key: 'open-orbit:left-cannon',
    sources: ['/game-art/generated/boss-weapons/open-orbit-railgun-arm-left.png']
  },
  {
    key: 'open-orbit:right-cannon',
    sources: ['/game-art/generated/boss-weapons/open-orbit-railgun-arm-right.png']
  },
  {
    key: 'citation-storm:left-cannon',
    sources: ['/game-art/generated/boss-weapons/citation-storm-plasma-claw-left.png']
  },
  {
    key: 'citation-storm:right-cannon',
    sources: ['/game-art/generated/boss-weapons/citation-storm-plasma-claw-right.png']
  },
  {
    key: 'paywall-siege:left-cannon',
    sources: ['/game-art/pixi/bosses/paywall-decimator/cannon-left.png']
  },
  {
    key: 'paywall-siege:right-cannon',
    sources: ['/game-art/pixi/bosses/paywall-decimator/cannon-right.png']
  },
  {
    key: 'paywall-siege:helmet',
    sources: ['/game-art/pixi/bosses/paywall-decimator/helmet.png']
  },
  {
    key: 'crown-claw:left-cannon',
    sources: [
      '/game-art/generated/bosses/astral-crownclaw/rig/weapons/astral-crownclaw-underclaw-gun-left.png',
      '/game-art/generated/bosses/astral-crownclaw/rig/weapons/astral-crownclaw-sharp-claw-projectile-left.png'
    ]
  },
  {
    key: 'crown-claw:right-cannon',
    sources: [
      '/game-art/generated/bosses/astral-crownclaw/rig/weapons/astral-crownclaw-underclaw-gun-right.png',
      '/game-art/generated/bosses/astral-crownclaw/rig/weapons/astral-crownclaw-sharp-claw-projectile-right.png'
    ]
  }
];

const sandboxDirectory = path.join(
  workspaceRoot,
  'director-data',
  'prototype-assets'
);
const sandboxMasks = [
  'meridian-harrower',
  'helios-clawcarrier',
  'aurora-storm-engine',
  'umbra-needlewing',
  'cinderjaw-siege-beetle',
  'vesperglass-mothmother',
  'twin-halo-wardens',
  'riftcoil-wyrm',
  'nullwake-revenant',
  'gloamforge-mantis',
  'prism-moth-brood',
  'frontier-crownclaw'
].map((key) => ({
  key,
  source: key === 'gloamforge-mantis'
    ? path.join(sandboxDirectory, 'gloamforge-mantis', 'gloamforge-mantis-neutral.png')
    : key === 'frontier-crownclaw'
      ? path.join(
        sandboxDirectory,
        'frontier-crownclaw',
        'frontier-crownclaw-neutral.png'
      )
    : key === 'prism-moth-brood'
      ? path.join(
        sandboxDirectory,
        'prism-moth-broodkeeper',
        'prism-moth-broodkeeper-neutral.png'
      )
    : key === 'helios-clawcarrier'
      ? path.join(
        sandboxDirectory,
        'helios-clawcarrier-v2',
        'helios-clawcarrier-v2-neutral.png'
      )
      : path.join(sandboxDirectory, `${key}-assembled.png`)
}));

const readPng = async (filePath) => {
  const bytes = await readFile(filePath);
  return {
    bytes,
    png: PNG.sync.read(bytes)
  };
};

const buildMask = async (sourcePaths) => {
  const wordsPerRow = Math.ceil(GRID_SIZE / 32);
  const rowWords = new Uint32Array(GRID_SIZE * wordsPerRow);
  for (const sourcePath of sourcePaths) {
    const { png } = await readPng(sourcePath);
    for (let row = 0; row < GRID_SIZE; row += 1) {
      const sourceStartY = Math.floor((row * png.height) / GRID_SIZE);
      const sourceEndY = Math.max(
        sourceStartY + 1,
        Math.ceil(((row + 1) * png.height) / GRID_SIZE)
      );
      for (let column = 0; column < GRID_SIZE; column += 1) {
        const sourceStartX = Math.floor((column * png.width) / GRID_SIZE);
        const sourceEndX = Math.max(
          sourceStartX + 1,
          Math.ceil(((column + 1) * png.width) / GRID_SIZE)
        );
        let occupied = false;
        for (let y = sourceStartY; y < sourceEndY && !occupied; y += 1) {
          for (let x = sourceStartX; x < sourceEndX; x += 1) {
            if (png.data[(y * png.width + x) * 4 + 3] >= ALPHA_THRESHOLD) {
              occupied = true;
              break;
            }
          }
        }
        if (occupied) {
          const wordIndex = row * wordsPerRow + Math.floor(column / 32);
          rowWords[wordIndex] |= (1 << (column % 32)) >>> 0;
        }
      }
    }
  }
  return {
    width: GRID_SIZE,
    height: GRID_SIZE,
    rowWords: Array.from(rowWords)
  };
};

const renderMask = (mask) => (
  `Object.freeze({ width: ${mask.width}, height: ${mask.height}, rowWords: Object.freeze([${
    mask.rowWords.join(', ')
  }]) })`
);

const buildCampaignOutput = async () => {
  const campaignEntries = [];
  for (const definition of campaignMasks) {
    const urls = definition.sources ?? [definition.key];
    const mask = await buildMask(urls.map(publicAsset));
    campaignEntries.push(`  ${JSON.stringify(definition.key)}: ${renderMask(mask)}`);
  }

  const componentEntries = [];
  for (const definition of componentMasks) {
    const mask = await buildMask(definition.sources.map(publicAsset));
    componentEntries.push(`  ${JSON.stringify(definition.key)}: ${renderMask(mask)}`);
  }

  return `// Generated by tools/generate-boss-collision-masks.mjs. Do not hand edit.
import type { BossCollisionMask } from './BossCollisionMask';

const CAMPAIGN_BOSS_COLLISION_MASKS: Readonly<Record<string, BossCollisionMask>> = Object.freeze({
${campaignEntries.join(',\n')}
});

const BOSS_COMPONENT_COLLISION_MASKS: Readonly<Record<string, BossCollisionMask>> = Object.freeze({
${componentEntries.join(',\n')}
});

export const getCampaignBossCollisionMask = (
  spriteUrl: string | undefined
): BossCollisionMask | undefined => (
  spriteUrl ? CAMPAIGN_BOSS_COLLISION_MASKS[spriteUrl] : undefined
);

export const getBossComponentCollisionMask = (
  rigId: string | undefined,
  componentId: string
): BossCollisionMask | undefined => (
  rigId ? BOSS_COMPONENT_COLLISION_MASKS[\`\${rigId}:\${componentId}\`] : undefined
);
`;
};

const buildSandboxOutput = async () => {
  const entries = [];
  for (const definition of sandboxMasks) {
    const { bytes } = await readPng(definition.source);
    const mask = await buildMask([definition.source]);
    const contentHash = createHash('sha256').update(bytes).digest('hex');
    entries.push(
      `  ${JSON.stringify(definition.key)}: Object.freeze({ contentHash: ${JSON.stringify(contentHash)}, mask: ${renderMask(mask)} })`
    );
  }
  return `// Generated by tools/generate-boss-collision-masks.mjs. Do not hand edit.
export interface SandboxBossCollisionMask {
  readonly width: number;
  readonly height: number;
  readonly rowWords: readonly number[];
}

export interface SandboxBossCollisionMaskAsset {
  readonly contentHash: string;
  readonly mask: SandboxBossCollisionMask;
}

const SANDBOX_BOSS_COLLISION_MASKS: Readonly<Record<string, SandboxBossCollisionMaskAsset>> = Object.freeze({
${entries.join(',\n')}
});

export const getSandboxBossCollisionMask = (
  prototypeId: string | undefined
): SandboxBossCollisionMaskAsset | undefined => (
  prototypeId ? SANDBOX_BOSS_COLLISION_MASKS[prototypeId] : undefined
);
`;
};

const campaignOutputPath = path.join(
  workspaceRoot,
  'services',
  'gameplay',
  'bosses',
  'generatedBossCollisionMasks.ts'
);
const sandboxOutputPath = path.join(
  workspaceRoot,
  'director',
  'src',
  'tools',
  'bosses',
  'generatedSandboxBossCollisionMasks.ts'
);

await mkdir(path.dirname(campaignOutputPath), { recursive: true });
await mkdir(path.dirname(sandboxOutputPath), { recursive: true });
await Promise.all([
  writeFile(campaignOutputPath, await buildCampaignOutput(), 'utf8'),
  writeFile(sandboxOutputPath, await buildSandboxOutput(), 'utf8')
]);

console.log('Generated campaign, component, and Sandbox boss alpha collision masks.');
