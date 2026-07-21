import type { FormationSlot, SpawnPatternId } from '@game/game-config/types';

// Pure normalized-geometry helpers shared by the Formation Workshop UI and tests.

export type FormationTemplateId = 'row' | 'v' | 'grid' | 'diamond' | 'spiral' | 'pincer' | 'ring' | 'chevron';

export interface FormationTemplate {
  id: FormationTemplateId;
  label: string;
  description: string;
  choreography: Exclude<SpawnPatternId, 'single-random' | 'asteroid-lanes'>;
  slots: readonly FormationSlot[];
}

const round = (value: number) => Math.round(value * 10000) / 10000;
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export const normalizeFormationSlots = (slots: readonly FormationSlot[]): FormationSlot[] => slots.map((slot) => ({
  x: round(clamp(slot.x, 0.06, 0.94)),
  y: round(clamp(slot.y, 0.08, 0.46))
}));

const rowSlots = (count: number, y: number) => Array.from({ length: count }, (_, index) => ({
  x: count === 1 ? 0.5 : 0.16 + (index / (count - 1)) * 0.68,
  y
}));

const gridSlots = (columns: number, rows: number) => Array.from({ length: columns * rows }, (_, index) => ({
  x: columns === 1 ? 0.5 : 0.2 + ((index % columns) / (columns - 1)) * 0.6,
  y: rows === 1 ? 0.2 : 0.13 + (Math.floor(index / columns) / (rows - 1)) * 0.22
}));

const ringSlots = (count: number) => Array.from({ length: count }, (_, index) => {
  const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
  return { x: 0.5 + Math.cos(angle) * 0.27, y: 0.25 + Math.sin(angle) * 0.13 };
});

const diamondSlots = (count: number) => Array.from({ length: count }, (_, index) => {
  const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
  const denominator = Math.max(0.001, Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle)));
  return {
    x: 0.5 + (Math.cos(angle) / denominator) * 0.28,
    y: 0.25 + (Math.sin(angle) / denominator) * 0.15
  };
});

const spiralSlots = (count: number) => Array.from({ length: count }, (_, index) => {
  const progress = index / Math.max(1, count - 1);
  const angle = index * 1.28 - Math.PI / 2;
  return {
    x: 0.5 + Math.cos(angle) * (0.07 + progress * 0.26),
    y: 0.24 + Math.sin(angle) * (0.035 + progress * 0.13)
  };
});

const vSlots = (count: number) => Array.from({ length: count }, (_, index) => {
  const offset = index - (count - 1) / 2;
  return {
    x: 0.5 + offset * (0.68 / Math.max(1, count - 1)),
    y: 0.13 + Math.abs(offset) * 0.035
  };
});

const pincerSlots = (count: number) => Array.from({ length: count }, (_, index) => {
  const row = Math.floor(index / 2);
  const rows = Math.ceil(count / 2);
  return {
    x: index % 2 === 0 ? 0.23 + row * 0.018 : 0.77 - row * 0.018,
    y: rows === 1 ? 0.2 : 0.12 + (row / Math.max(1, rows - 1)) * 0.27
  };
});

const chevronSlots = (count: number) => Array.from({ length: count }, (_, index) => {
  const progress = index / Math.max(1, count - 1);
  return {
    x: 0.5 + Math.sin((progress * Math.PI * 2.15) - 0.45) * 0.26,
    y: 0.1 + progress * 0.34
  };
});

export const createFormationSlots = (templateId: FormationTemplateId, requestedCount: number): FormationSlot[] => {
  const count = Math.max(2, Math.min(48, Math.round(requestedCount)));
  switch (templateId) {
    case 'row': return normalizeFormationSlots(rowSlots(count, 0.18));
    case 'v': return normalizeFormationSlots(vSlots(count));
    case 'grid': {
      const columns = Math.ceil(Math.sqrt(count * 1.6));
      return normalizeFormationSlots(gridSlots(columns, Math.ceil(count / columns)).slice(0, count));
    }
    case 'diamond': return normalizeFormationSlots(diamondSlots(count));
    case 'spiral': return normalizeFormationSlots(spiralSlots(count));
    case 'pincer': return normalizeFormationSlots(pincerSlots(count));
    case 'ring': return normalizeFormationSlots(ringSlots(count));
    case 'chevron': return normalizeFormationSlots(chevronSlots(count));
  }
};

export const FORMATION_TEMPLATES: readonly FormationTemplate[] = [
  { id: 'row', label: 'Row', description: 'A readable horizontal opening line.', choreography: 'row', slots: createFormationSlots('row', 10) },
  { id: 'v', label: 'V formation', description: 'A classic wedge with a clear center lead.', choreography: 'v', slots: createFormationSlots('v', 11) },
  { id: 'grid', label: 'Grid wall', description: 'Three ranks that hold before diving.', choreography: 'grid', slots: createFormationSlots('grid', 15) },
  { id: 'diamond', label: 'Diamond', description: 'A compact perimeter formation.', choreography: 'diamond', slots: createFormationSlots('diamond', 12) },
  { id: 'spiral', label: 'Spiral', description: 'A rotating-looking layered shape.', choreography: 'spiral', slots: createFormationSlots('spiral', 14) },
  { id: 'pincer', label: 'Pincer', description: 'Two flanks that pressure the center lane.', choreography: 'pincer', slots: createFormationSlots('pincer', 12) },
  { id: 'ring', label: 'Ring', description: 'An open center surrounded by attackers.', choreography: 'diamond', slots: createFormationSlots('ring', 14) },
  { id: 'chevron', label: 'Curved chevron', description: 'A custom S-shaped attack order.', choreography: 'v', slots: createFormationSlots('chevron', 14) }
];

export const cloneFormationSlots = (slots: readonly FormationSlot[]) => slots.map((slot) => ({ ...slot }));

export const mirrorFormationSlots = (slots: readonly FormationSlot[]) => normalizeFormationSlots(
  slots.map((slot) => ({ ...slot, x: 1 - slot.x }))
);

export const rotateFormationSlots = (slots: readonly FormationSlot[]) => normalizeFormationSlots(
  slots.map((slot) => ({ x: 1 - slot.x, y: 0.54 - slot.y }))
);

export const scaleFormationWidth = (slots: readonly FormationSlot[], scale: number) => normalizeFormationSlots(
  slots.map((slot) => ({ ...slot, x: 0.5 + (slot.x - 0.5) * scale }))
);

export const minimumFormationSpacing = (
  slots: readonly FormationSlot[],
  viewport: Readonly<{ width: number; height: number }>
) => {
  if (slots.length < 2) return Number.POSITIVE_INFINITY;
  let minimum = Number.POSITIVE_INFINITY;
  for (let left = 0; left < slots.length; left++) {
    for (let right = left + 1; right < slots.length; right++) {
      const dx = (slots[left].x - slots[right].x) * viewport.width;
      const dy = (slots[left].y - slots[right].y) * viewport.height;
      minimum = Math.min(minimum, Math.hypot(dx, dy));
    }
  }
  return minimum;
};
