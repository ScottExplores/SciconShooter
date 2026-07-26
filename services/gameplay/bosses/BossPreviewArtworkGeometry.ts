export interface BossPreviewArtworkDesignSize {
  readonly width: number;
  readonly height: number;
}

export interface BossPreviewArtworkDimensionsInput {
  readonly configuredWidth: number;
  readonly configuredHeight: number;
  readonly sourceEventId?: string;
  readonly selectedEventId?: string;
  readonly designSize?: BossPreviewArtworkDesignSize;
}

export interface BossPreviewArtworkDimensions {
  readonly width: number;
  readonly height: number;
  readonly preservesDesignAspect: boolean;
}

const isUsableDesignSize = (
  designSize: BossPreviewArtworkDesignSize | undefined
): designSize is BossPreviewArtworkDesignSize => Boolean(
  designSize
  && Number.isFinite(designSize.width)
  && Number.isFinite(designSize.height)
  && designSize.width > 0
  && designSize.height > 0
);

/**
 * Fits only the exact selected preview boss to its registered modular-art
 * aspect ratio. Production and unrelated preview encounters keep the existing
 * configured simulation dimensions.
 */
export const resolveBossPreviewArtworkDimensions = (
  input: BossPreviewArtworkDimensionsInput
): BossPreviewArtworkDimensions => {
  const width = Math.max(1, Math.round(input.configuredWidth));
  const fallbackHeight = Math.max(1, Math.round(input.configuredHeight));
  const selected = Boolean(
    input.sourceEventId
    && input.selectedEventId
    && input.sourceEventId === input.selectedEventId
  );
  if (!selected || !isUsableDesignSize(input.designSize)) {
    return Object.freeze({
      width,
      height: fallbackHeight,
      preservesDesignAspect: false
    });
  }

  const aspectRatio = input.designSize.width / input.designSize.height;
  if (!Number.isFinite(aspectRatio) || aspectRatio < 0.25 || aspectRatio > 4) {
    return Object.freeze({
      width,
      height: fallbackHeight,
      preservesDesignAspect: false
    });
  }
  return Object.freeze({
    width,
    height: Math.max(1, Math.round(width / aspectRatio)),
    preservesDesignAspect: true
  });
};
