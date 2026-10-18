import { useEffect, useState, type CSSProperties } from 'react';
import { getSectorTheme, worldColorHex, type WorldTheme } from './WorldTheme';

export type WorldThemeStyle = CSSProperties & Record<`--world-${string}`, string>;
const styleByTheme = new WeakMap<WorldTheme, WorldThemeStyle>();

/** Stable style objects avoid replacing CSS custom properties on every HUD update. */
export function worldThemeStyle(theme: WorldTheme): WorldThemeStyle {
  const existing = styleByTheme.get(theme);
  if (existing) return existing;
  const style: WorldThemeStyle = Object.freeze({
    '--world-accent': worldColorHex(theme.accent),
    '--world-secondary': worldColorHex(theme.secondary),
    '--world-danger': worldColorHex(theme.danger),
    '--world-glow': worldColorHex(theme.uiGlow),
    '--world-ink': worldColorHex(theme.palette.ink),
    '--world-surface': worldColorHex(theme.palette.base),
    '--world-metal': worldColorHex(theme.palette.detail),
    '--world-energy-hue': `${Math.round(theme.hue - 180)}deg`,
    '--world-gem-hue': `${Math.round(theme.hue - 120)}deg`,
  });
  styleByTheme.set(theme, style);
  return style;
}

export function applyWorldTheme(element: HTMLElement, theme: WorldTheme): void {
  element.dataset.worldTheme = theme.id;
  for (const [key, value] of Object.entries(worldThemeStyle(theme))) element.style.setProperty(key, String(value));
}

interface ThemePreview {
  previewSector(sectorId: string): { id: string; sectorId: string };
  clear(): void;
  snapshot(): { id: string; sectorId: string };
}

declare global {
  interface Window { __sciconThemePreview?: ThemePreview; }
}

/**
 * Normal UI derives directly from the active mission. Only the isolated, offline
 * UI audit may preview a sector around a synthetic result; no profile writes.
 */
export function usePresentationTheme(theme: WorldTheme, allowPreview = false): WorldTheme {
  const [preview, setPreview] = useState<{ source: WorldTheme; theme: WorldTheme } | null>(null);
  const active = preview?.source === theme && allowPreview ? preview.theme : theme;
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!allowPreview || params.get('qa') !== '1' || params.get('uiAudit') !== '1') return;
    let selected = theme;
    const api: ThemePreview = {
      previewSector(sectorId) {
        selected = getSectorTheme(sectorId);
        setPreview({ source: theme, theme: selected });
        return { id: selected.id, sectorId: selected.sectorId };
      },
      clear() { selected = theme; setPreview(null); },
      snapshot() { return { id: selected.id, sectorId: selected.sectorId }; },
    };
    window.__sciconThemePreview = api;
    return () => { if (window.__sciconThemePreview === api) delete window.__sciconThemePreview; };
  }, [theme, allowPreview]);
  return active;
}
