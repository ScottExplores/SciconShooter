import React from 'react';
import type { BossArchiveEntry } from '../../services/bossArchive';

export interface BossArchivePortraitProps {
  readonly entry: BossArchiveEntry;
  readonly portraitUrl?: string;
  readonly className?: string;
  readonly idlePreview?: 'active' | 'static';
  readonly eager?: boolean;
}

/**
 * Renders one motionless, intact Archive portrait. Bosses with detachable
 * weapons use their authored neutral rig layers inside a single SVG viewport;
 * every other boss remains one flattened image. No combat or damage timer is
 * mounted here.
 */
const BossArchivePortrait: React.FC<BossArchivePortraitProps> = ({
  entry,
  portraitUrl,
  className,
  idlePreview,
  eager = false
}) => {
  const composition = entry.preview.composition;
  if (composition) {
    return (
      <svg
        aria-hidden="true"
        className={className}
        data-composed="true"
        data-idle-preview={idlePreview}
        viewBox={`0 0 ${composition.width} ${composition.height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {composition.layers.map((layer, index) => {
          const centerX = layer.x + layer.width / 2;
          const centerY = layer.y + layer.height / 2;
          return (
            <image
              key={`${layer.url}:${index}`}
              href={layer.url}
              x={layer.x}
              y={layer.y}
              width={layer.width}
              height={layer.height}
              preserveAspectRatio="none"
              transform={layer.rotationDegrees
                ? `rotate(${layer.rotationDegrees} ${centerX} ${centerY})`
                : undefined}
            />
          );
        })}
      </svg>
    );
  }
  return (
    <img
      src={portraitUrl ?? entry.preview.portraitUrl ?? entry.artUrl}
      alt=""
      draggable={false}
      decoding="async"
      loading={eager ? 'eager' : 'lazy'}
      className={className}
      data-idle-preview={idlePreview}
    />
  );
};

export default BossArchivePortrait;
