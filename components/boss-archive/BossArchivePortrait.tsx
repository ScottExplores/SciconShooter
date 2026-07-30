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
 * Renders one intact Archive portrait. Bosses with detachable
 * weapons use their authored neutral rig layers inside a single SVG viewport;
 * selected composed portraits can articulate those internal layers while
 * flattened bosses receive only a small hover. No combat frame, damage frame,
 * React timer, or image-source swap is mounted here.
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
        <g className="boss-archive-portrait__assembly">
          {composition.layers.map((layer, index) => {
            const centerX = layer.x + layer.width / 2;
            const centerY = layer.y + layer.height / 2;
            return (
              <g
                key={`${layer.url}:${index}`}
                className="boss-archive-portrait__layer"
                data-motion-role={layer.motionRole ?? 'hull'}
              >
                <image
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
              </g>
            );
          })}
        </g>
      </svg>
    );
  }
  return (
    <img
      src={portraitUrl ?? entry.preview.portraitUrl ?? entry.artUrl}
      alt=""
      draggable={false}
      decoding={eager ? 'sync' : 'async'}
      loading={eager ? 'eager' : 'lazy'}
      className={className}
      data-composed="false"
      data-idle-preview={idlePreview}
    />
  );
};

export default BossArchivePortrait;
