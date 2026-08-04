export type HubToolId =
  | 'overview'
  | 'project'
  | 'missions'
  | 'waves'
  | 'bosses'
  | 'formations'
  | 'sandbox'
  | 'loadouts'
  | 'assets'
  | 'reports'
  | 'analytics'
  | 'reviews'
  | 'legacy';

export type HubToolHost =
  | 'overview'
  | 'project-guide'
  | 'mission-builder'
  | 'boss-sandbox'
  | 'combat-lab'
  | 'report-inbox'
  | 'analytics-foundation'
  | 'legacy';

export type HubToolStatus = 'live' | 'shared-surface' | 'foundation' | 'legacy';
export type HubNavigationGroup = 'hub' | 'author' | 'test' | 'inspect' | 'archive';
export type HubPreviewSurface = 'game' | 'review' | 'sandbox' | 'none';

export type AuthoringResourceKind =
  | 'mission'
  | 'wave'
  | 'boss'
  | 'formation'
  | 'sandbox-preset'
  | 'loadout'
  | 'asset'
  | 'player-report'
  | 'project-status'
  | 'playtest-session'
  | 'review';

export interface AuthoringDescriptor {
  id: HubToolId;
  path: string;
  aliases: readonly string[];
  label: string;
  shortLabel: string;
  glyph: string;
  eyebrow: string;
  description: string;
  group: HubNavigationGroup;
  host: HubToolHost;
  status: HubToolStatus;
  resourceKinds: readonly AuthoringResourceKind[];
  previewSurface: HubPreviewSurface;
  requiredQuerySurface?: 'review';
  navigation: boolean;
}

/**
 * The registry is the shared description of every Developer Hub authoring surface.
 * Route rendering, navigation, landing cards, and future command/workspace registries
 * consume this list instead of maintaining separate labels and capability maps.
 */
export const AUTHORING_DESCRIPTORS = [
  {
    id: 'overview',
    path: '/',
    aliases: [],
    label: 'Control Center',
    shortLabel: 'Home',
    glyph: 'CC',
    eyebrow: 'Start',
    description: 'The owner-friendly home for Scicon Shooter tools, reports, project status, and local previews.',
    group: 'hub',
    host: 'overview',
    status: 'live',
    resourceKinds: [],
    previewSurface: 'none',
    navigation: true
  },
  {
    id: 'project',
    path: '/project',
    aliases: ['/status'],
    label: 'Project Guide',
    shortLabel: 'Project',
    glyph: 'PG',
    eyebrow: 'Start',
    description: 'See the current local branch, important addresses, tool map, and the return-to-project checklist.',
    group: 'hub',
    host: 'project-guide',
    status: 'live',
    resourceKinds: ['project-status'],
    previewSurface: 'none',
    navigation: true
  },
  {
    id: 'missions',
    path: '/missions',
    aliases: ['/level-editor'],
    label: 'Missions',
    shortLabel: 'Missions',
    glyph: 'MI',
    eyebrow: 'Author',
    description: 'Build missions with the existing campaign editor and the canonical game preview.',
    group: 'author',
    host: 'mission-builder',
    status: 'live',
    resourceKinds: ['mission'],
    previewSurface: 'game',
    navigation: true
  },
  {
    id: 'waves',
    path: '/waves',
    aliases: [],
    label: 'Waves',
    shortLabel: 'Waves',
    glyph: 'WV',
    eyebrow: 'Author',
    description: 'Organize encounters and edit spawn timing on the canonical wave timeline.',
    group: 'author',
    host: 'mission-builder',
    status: 'live',
    resourceKinds: ['wave'],
    previewSurface: 'game',
    navigation: true
  },
  {
    id: 'bosses',
    path: '/bosses',
    aliases: [],
    label: 'Boss Sandbox',
    shortLabel: 'Bosses',
    glyph: 'BS',
    eyebrow: 'Test',
    description: 'Choose any configured boss or a test-only prototype and fight it in a focused canonical preview.',
    group: 'test',
    host: 'boss-sandbox',
    status: 'live',
    resourceKinds: ['boss'],
    previewSurface: 'game',
    navigation: true
  },
  {
    id: 'formations',
    path: '/formations',
    aliases: [],
    label: 'Formations',
    shortLabel: 'Formations',
    glyph: 'FM',
    eyebrow: 'Author',
    description: 'Open Combat Lab and its visual Formation Workshop against real campaign content.',
    group: 'author',
    host: 'combat-lab',
    status: 'live',
    resourceKinds: ['formation'],
    previewSurface: 'sandbox',
    navigation: true
  },
  {
    id: 'sandbox',
    path: '/sandbox',
    aliases: ['/combat-lab'],
    label: 'Sandbox',
    shortLabel: 'Sandbox',
    glyph: 'SB',
    eyebrow: 'Test',
    description: 'Run isolated encounters, waves, bosses, formations, and debug controls in Combat Lab.',
    group: 'test',
    host: 'combat-lab',
    status: 'live',
    resourceKinds: ['sandbox-preset'],
    previewSurface: 'sandbox',
    navigation: true
  },
  {
    id: 'loadouts',
    path: '/loadouts',
    aliases: [],
    label: 'Loadouts',
    shortLabel: 'Loadouts',
    glyph: 'LD',
    eyebrow: 'Test',
    description: 'Exercise player ships, weapons, upgrades, and mini-ships through Combat Lab.',
    group: 'test',
    host: 'combat-lab',
    status: 'shared-surface',
    resourceKinds: ['loadout'],
    previewSurface: 'sandbox',
    navigation: true
  },
  {
    id: 'assets',
    path: '/assets',
    aliases: [],
    label: 'Assets',
    shortLabel: 'Assets',
    glyph: 'AS',
    eyebrow: 'Inspect',
    description: 'Browse safe catalog artwork and generated assets through the current Combat Lab library.',
    group: 'inspect',
    host: 'combat-lab',
    status: 'shared-surface',
    resourceKinds: ['asset'],
    previewSurface: 'sandbox',
    navigation: true
  },
  {
    id: 'analytics',
    path: '/analytics',
    aliases: [],
    label: 'Analytics',
    shortLabel: 'Analytics',
    glyph: 'AN',
    eyebrow: 'Inspect',
    description: 'Compare deterministic local playtest sessions, inspect balance metrics, and export results.',
    group: 'inspect',
    host: 'analytics-foundation',
    status: 'live',
    resourceKinds: ['playtest-session'],
    previewSurface: 'none',
    navigation: true
  },
  {
    id: 'reports',
    path: '/reports',
    aliases: ['/bugs'],
    label: 'Player Reports',
    shortLabel: 'Reports',
    glyph: 'RP',
    eyebrow: 'Inspect',
    description: 'Review the sanitized local cache of player bugs, feedback, and bounded crash diagnostics.',
    group: 'inspect',
    host: 'report-inbox',
    status: 'live',
    resourceKinds: ['player-report'],
    previewSurface: 'none',
    navigation: true
  },
  {
    id: 'reviews',
    path: '/reviews',
    aliases: [],
    label: 'Reviews',
    shortLabel: 'Reviews',
    glyph: 'RV',
    eyebrow: 'Inspect',
    description: 'Annotate and resolve local change requests on the actual Mission Builder game surface.',
    group: 'inspect',
    host: 'mission-builder',
    status: 'live',
    resourceKinds: ['review'],
    previewSurface: 'review',
    requiredQuerySurface: 'review',
    navigation: true
  },
  {
    id: 'legacy',
    path: '/studio',
    aliases: [],
    label: 'Legacy Studio',
    shortLabel: 'Legacy',
    glyph: 'LG',
    eyebrow: 'Archive',
    description: 'Read-only migration reference for the superseded Director models.',
    group: 'archive',
    host: 'legacy',
    status: 'legacy',
    resourceKinds: [],
    previewSurface: 'none',
    navigation: true
  }
] as const satisfies readonly AuthoringDescriptor[];

export const CANONICAL_HUB_PATHS = AUTHORING_DESCRIPTORS
  .filter((descriptor) => descriptor.id !== 'legacy')
  .map((descriptor) => descriptor.path);

export const AUTHORING_DESCRIPTOR_BY_ID = Object.fromEntries(
  AUTHORING_DESCRIPTORS.map((descriptor) => [descriptor.id, descriptor])
) as Record<HubToolId, (typeof AUTHORING_DESCRIPTORS)[number]>;

const descriptorByPath = new Map<string, (typeof AUTHORING_DESCRIPTORS)[number]>();
for (const descriptor of AUTHORING_DESCRIPTORS) {
  descriptorByPath.set(descriptor.path, descriptor);
  for (const alias of descriptor.aliases) descriptorByPath.set(alias, descriptor);
}

export interface ResolvedHubRoute {
  descriptor: (typeof AUTHORING_DESCRIPTORS)[number];
  requestedPath: string;
  isAlias: boolean;
  notFound: boolean;
}

export const normalizeHubPath = (pathname: string): string => {
  const pathOnly = pathname.split(/[?#]/, 1)[0] || '/';
  if (pathOnly === '/') return '/';
  return `/${pathOnly.replace(/^\/+|\/+$/g, '')}`;
};

export const resolveHubRoute = (pathname: string): ResolvedHubRoute => {
  const requestedPath = normalizeHubPath(pathname);
  const descriptor = descriptorByPath.get(requestedPath);
  if (!descriptor) {
    return {
      descriptor: AUTHORING_DESCRIPTOR_BY_ID.overview,
      requestedPath,
      isAlias: false,
      notFound: true
    };
  }

  return {
    descriptor,
    requestedPath,
    isAlias: descriptor.path !== requestedPath,
    notFound: false
  };
};
