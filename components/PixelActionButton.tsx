import React from 'react';
// REVAMP(H): One native-button ripple, disabled when reduced motion is requested.
import { useReducedMotion } from './revamp/UiMotion';

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
  onPointerDown,
  onClick,
  ...props
}, ref) => {
  const reducedMotion = useReducedMotion();
  const [ripple, setRipple] = React.useState<{ x: number; y: number; id: number } | null>(null);
  const rippleId = React.useRef(0);
  const addRipple = (button: HTMLButtonElement, x: number, y: number) => {
    if (disabled || reducedMotion) return;
    const bounds = button.getBoundingClientRect();
    setRipple({ x: (x - bounds.left) / bounds.width * 100, y: (y - bounds.top) / bounds.height * 100, id: ++rippleId.current });
  };
  return (
  <button
    ref={ref}
    type="button"
    disabled={disabled}
    data-tone={tone}
    data-upgrade-ready={!disabled && ready ? 'true' : 'false'}
    data-shine={!disabled && (shine || ready) ? 'true' : 'false'}
    className={`sci-pixel-action ${className}`.trim()}
    {...props}
    onPointerDown={(event) => {
      onPointerDown?.(event);
      if (!event.defaultPrevented) addRipple(event.currentTarget, event.clientX, event.clientY);
    }}
    onClick={(event) => {
      if (event.detail === 0) {
        const bounds = event.currentTarget.getBoundingClientRect();
        addRipple(event.currentTarget, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
      }
      onClick?.(event);
    }}
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
    {ripple ? <span
      key={ripple.id}
      className="sci-pixel-action__ripple"
      aria-hidden="true"
      style={{ '--ripple-x': `${ripple.x}%`, '--ripple-y': `${ripple.y}%` } as React.CSSProperties}
      onAnimationEnd={() => setRipple(null)}
    /> : null}
  </button>
  );
});

PixelActionButton.displayName = 'PixelActionButton';

export default PixelActionButton;
