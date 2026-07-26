export const MODULAR_BOSS_REFERENCE_COMPARISON_KIND =
  'modular-boss-reference-comparison-v1' as const;

export interface PreviewBossReferenceComparisonPoint {
  /** Horizontal position inside the corresponding image/canvas, from 0 to 1. */
  readonly xRatio: number;
  /** Vertical position inside the corresponding image/canvas, from 0 to 1. */
  readonly yRatio: number;
}

export interface PreviewBossReferenceComparisonNormalizedRigPoint
  extends PreviewBossReferenceComparisonPoint {
  readonly kind: 'normalized-design-point';
}

export interface PreviewBossReferenceComparisonSocketTarget {
  readonly kind: 'socket';
  /** Stable authored socket ID resolved from the live modular hierarchy. */
  readonly socketId: string;
}

export type PreviewBossReferenceComparisonRigTarget =
  | PreviewBossReferenceComparisonNormalizedRigPoint
  | PreviewBossReferenceComparisonSocketTarget;

export interface PreviewBossReferenceComparisonLandmark {
  readonly id: string;
  readonly label: string;
  /** Landmark on the cropped reference artifact. */
  readonly reference: PreviewBossReferenceComparisonPoint;
  /** Matching live socket or fixed point on the modular rig's design canvas. */
  readonly rig: PreviewBossReferenceComparisonRigTarget;
}

/**
 * Review-only registration for comparing one locked reference against a
 * modular preview rig. It is deliberately separate from atlas frames and can
 * never become an entity texture, collision mask, or weapon-socket source.
 */
export interface PreviewBossReferenceComparisonDescriptor {
  readonly kind: typeof MODULAR_BOSS_REFERENCE_COMPARISON_KIND;
  readonly url: string;
  readonly contentHash: string;
  readonly width: number;
  readonly height: number;
  readonly provenance: string;
  readonly landmarks: readonly PreviewBossReferenceComparisonLandmark[];
}

export interface PreviewBossReferenceComparisonLayoutLandmark {
  readonly id: string;
  readonly label: string;
  readonly referenceX: number;
  readonly referenceY: number;
  readonly rigX?: number;
  readonly rigY?: number;
  readonly rigSocketId?: string;
}

export interface PreviewBossReferenceComparisonLayout {
  readonly centerX: 0;
  readonly centerY: 0;
  /** Local modular-design units. The renderer applies the live rig root scale. */
  readonly width: number;
  /** Always identical to the live rig's authored design height. */
  readonly height: number;
  readonly landmarks: readonly PreviewBossReferenceComparisonLayoutLandmark[];
}

const finitePositive = (value: number) => Number.isFinite(value) && value > 0;
const finiteRatio = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1;

/**
 * Fits the tight reference crop to the live modular rig's exact center and
 * height while preserving the crop's source aspect ratio.
 */
export const resolvePreviewBossReferenceComparisonLayout = (
  descriptor: Readonly<PreviewBossReferenceComparisonDescriptor>,
  designSize: Readonly<{ width: number; height: number }>
): PreviewBossReferenceComparisonLayout | null => {
  if (
    descriptor.kind !== MODULAR_BOSS_REFERENCE_COMPARISON_KIND
    || !finitePositive(descriptor.width)
    || !finitePositive(descriptor.height)
    || !finitePositive(designSize.width)
    || !finitePositive(designSize.height)
  ) return null;

  const height = designSize.height;
  const width = height * descriptor.width / descriptor.height;
  const landmarks = descriptor.landmarks.flatMap((landmark) => {
    if (
      !landmark.id
      || !finiteRatio(landmark.reference.xRatio)
      || !finiteRatio(landmark.reference.yRatio)
    ) return [];
    const rigTarget = landmark.rig.kind === 'socket'
      ? (landmark.rig.socketId
          ? { rigSocketId: landmark.rig.socketId }
          : null)
      : (
          finiteRatio(landmark.rig.xRatio)
          && finiteRatio(landmark.rig.yRatio)
            ? {
                rigX: (landmark.rig.xRatio - 0.5) * designSize.width,
                rigY: (landmark.rig.yRatio - 0.5) * designSize.height
              }
            : null
        );
    if (!rigTarget) return [];
    return [Object.freeze({
      id: landmark.id,
      label: landmark.label,
      referenceX: (landmark.reference.xRatio - 0.5) * width,
      referenceY: (landmark.reference.yRatio - 0.5) * height,
      ...rigTarget
    })];
  });

  return Object.freeze({
    centerX: 0,
    centerY: 0,
    width,
    height,
    landmarks: Object.freeze(landmarks)
  });
};
