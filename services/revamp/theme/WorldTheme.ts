import type { GameCampaign } from '../../../game-config/types';
import { BACKGROUND_THEMES, resolveMissionBackdrop, type BackgroundPalette } from '../backgrounds/themes';

/** REVAMP(R): Presentation-only colors; projectiles, hit flashes and simulation keep their own identities. */
export interface WorldTheme {
  readonly id: string;
  readonly sectorId: string;
  readonly name: string;
  /** Source accent hue, used to tint isolated cyan energy / green gem layers. */
  readonly hue: number;
  readonly palette: Readonly<BackgroundPalette>;
  readonly accent: number;
  readonly secondary: number;
  readonly danger: number;
  readonly uiGlow: number;
  readonly glow: number;
  readonly pickupGlow: number;
  readonly enemyDark: number;
  readonly enemyMid: number;
  readonly enemyLight: number;
  /** Shadow, body and energy highlight; neutral metal and black sprite outlines are preserved. */
  readonly enemyPalette: readonly [number, number, number];
}

function hueOf(color: number): number {
  const r = (color >>> 16) / 255;
  const g = ((color >>> 8) & 255) / 255;
  const b = (color & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  const hue = max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return ((hue * 60) + 360) % 360;
}

function hsl(hue: number, saturation: number, lightness: number): number {
  const h = (((hue % 360) + 360) % 360) / 30;
  const a = saturation * Math.min(lightness, 1 - lightness);
  const channel = (offset: number) => {
    const k = (offset + h) % 12;
    return Math.round((lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
  };
  return (channel(0) << 16) | (channel(8) << 8) | channel(4);
}

function makeTheme(id: string, sectorId: string, name: string, palette: Readonly<BackgroundPalette>, hue = hueOf(palette.accent)): WorldTheme {
  // N's muted backdrop hue becomes a small luminous UI/energy accent, never a large bright plane.
  const accent = hsl(hue, 0.72, 0.72);
  const secondary = hsl(hue + 38, 0.5, 0.82);
  const uiGlow = hsl(hue, 0.78, 0.61);
  const enemyDark = hsl(hue, 0.35, 0.25);
  const enemyMid = hsl(hue, 0.46, 0.49);
  const enemyLight = hsl(hue, 0.51, 0.69);
  return Object.freeze({
    id, sectorId, name, hue, palette, accent, secondary,
    // Warnings retain a stable warm family in all worlds; bullets remain untouched.
    danger: 0xff8096, uiGlow, glow: uiGlow, pickupGlow: uiGlow,
    enemyDark, enemyMid, enemyLight,
    enemyPalette: Object.freeze([enemyDark, enemyMid, enemyLight]) as readonly [number, number, number],
  });
}

export const WORLD_THEMES: readonly WorldTheme[] = Object.freeze(BACKGROUND_THEMES.map(theme => (
  makeTheme(theme.id, theme.sectorId, theme.name, theme.palette)
)));

/** Ranked Weekly Run is a distinct lime/ultraviolet broadcast, regardless of sampled campaign level. */
const weeklyBase = makeTheme('weekly-aurora', 'weekly-run', 'Weekly Aurora', Object.freeze({
  ink: 0x080c12, base: 0x111c20, nebula: 0x253c32, shadow: 0x18262b,
  hull: 0x3d5146, detail: 0x6c896f, accent: 0x9dc975, boss: 0x39284e,
}), 88);
export const WEEKLY_THEME: WorldTheme = Object.freeze({ ...weeklyBase, secondary: 0xcab4ff });

const themeBySector = new Map(WORLD_THEMES.map(theme => [theme.sectorId, theme]));
const themeById = new Map(WORLD_THEMES.map(theme => [theme.id, theme]));

export function getSectorTheme(sectorId: string | undefined): WorldTheme {
  if (sectorId === WEEKLY_THEME.sectorId || sectorId === WEEKLY_THEME.id) return WEEKLY_THEME;
  return themeBySector.get(sectorId ?? '') ?? themeById.get(sectorId ?? '') ?? WORLD_THEMES[0];
}

/** Uses N's branch/graph resolution so map, mission, boss and result agree on a world. */
export function getWorldTheme(campaign: GameCampaign, levelId: string | undefined, weekly = false): WorldTheme {
  if (weekly) return WEEKLY_THEME;
  return getSectorTheme(resolveMissionBackdrop(campaign, levelId)?.sectorId);
}

export const resolveWorldTheme = getWorldTheme;

export function worldColorHex(color: number): string {
  return `#${(color >>> 0).toString(16).padStart(6, '0')}`;
}
