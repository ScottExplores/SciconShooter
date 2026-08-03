import React from 'react';

export type PixelActionTone = 'gold' | 'cyan' | 'green' | 'neutral' | 'danger';

const PIXEL_ACTION_SPRITES: Partial<Record<PixelActionTone, string>> = Object.freeze({
  gold: '/game-art/generated/ui/scicon-pixel-action-buttons-v1/upgrade-panel.png',
  green: '/game-art/generated/ui/scicon-pixel-action-buttons-v1/start-mission-panel.png'
});

interface PixelActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: PixelActionTone;
  ready?: boolean;
  shine?: boolean;
}

/**
 * Shared low-resolution arcade action panel used by Home and the Hangar.
 * Decorative layers stay out of the accessibility tree while the native
 * button owns disabled, pressed, keyboard, and screen-reader behavior.
 */
const PixelActionButton = React.forwardRef<HTMLButtonElement, PixelActionButtonProps>(({
  tone = 'gold',
  ready = false,
  shine = false,
  className = '',
  children,
  disabled,
  ...props
}, ref) => (
  <button
    ref={ref}
    type="button"
    disabled={disabled}
    data-tone={tone}
    data-upgrade-ready={!disabled && ready ? 'true' : 'false'}
    data-shine={!disabled && (shine || ready) ? 'true' : 'false'}
    className={`sci-pixel-action ${className}`.trim()}
    {...props}
  >
    <span className="sci-pixel-action__chrome" aria-hidden="true" />
    {PIXEL_ACTION_SPRITES[tone] ? (
      <img
        src={PIXEL_ACTION_SPRITES[tone]!}
        alt=""
        draggable={false}
        className="sci-pixel-action__sprite"
        aria-hidden="true"
      />
    ) : null}
    <span className="sci-pixel-action__face" aria-hidden="true">
      <span className="sci-pixel-action__shine" />
    </span>
    <span className="sci-pixel-action__fixtures" aria-hidden="true">
      <span className="sci-pixel-action__fixture sci-pixel-action__fixture--port" />
      <span className="sci-pixel-action__fixture sci-pixel-action__fixture--starboard" />
      <span className="sci-pixel-action__fixture sci-pixel-action__fixture--top" />
      <span className="sci-pixel-action__fixture sci-pixel-action__fixture--bottom" />
    </span>
    <span className="sci-pixel-action__content">{children}</span>
  </button>
));

PixelActionButton.displayName = 'PixelActionButton';

export default PixelActionButton;
