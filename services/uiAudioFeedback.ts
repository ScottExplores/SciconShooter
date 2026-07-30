import { audioService, type UiSoundType } from './audioService';

const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  '[role="button"]',
  'summary',
  'select',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="checkbox"]',
  'input[type="radio"]'
].join(',');

const CLOSE_ACTION = /\b(close|cancel|dismiss)\b/i;
const BACK_ACTION = /\b(back|exit|quit|disconnect|return)\b/i;
const CONFIRM_ACTION = /\b(start|launch|play|continue|retry|confirm|submit|claim|buy|purchase|upgrade|connect|save|equip|unlock|acknowledge)\b/i;
const OPEN_ACTION = /\b(open|map|archive|hangar|more|menu|settings|details|view|trophies|proposals)\b/i;

const findInteractiveControl = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>(INTERACTIVE_SELECTOR);
};

const isControlDisabled = (control: HTMLElement) => (
  control.dataset.audio === 'none'
  || control.getAttribute('aria-disabled') === 'true'
  || ('disabled' in control && Boolean((control as HTMLButtonElement).disabled))
);

export const resolveUiSound = (control: HTMLElement): UiSoundType => {
  const explicit = control.dataset.audioCue;
  if (
    explicit === 'click'
    || explicit === 'confirm'
    || explicit === 'back'
    || explicit === 'error'
    || explicit === 'open'
    || explicit === 'close'
  ) return explicit;

  const label = [
    control.getAttribute('aria-label'),
    control.getAttribute('title'),
    control.textContent
  ].filter(Boolean).join(' ').trim();

  if (CLOSE_ACTION.test(label)) return 'close';
  if (BACK_ACTION.test(label)) return 'back';
  if (CONFIRM_ACTION.test(label)) return 'confirm';
  if (OPEN_ACTION.test(label)) return 'open';
  return 'click';
};

/**
 * Adds one capture listener for the whole application instead of wiring audio
 * into every menu component. Pointer feedback is immediate; keyboard-created
 * clicks are handled separately without doubling normal pointer clicks.
 */
export const installUiAudioFeedback = (root: Document | HTMLElement = document) => {
  const playForTarget = (target: EventTarget | null) => {
    const control = findInteractiveControl(target);
    if (!control || isControlDisabled(control)) return;
    audioService.playUiSound(resolveUiSound(control));
  };

  const onPointerDown = (event: Event) => playForTarget(event.target);
  const onClick = (event: MouseEvent) => {
    if (event.detail !== 0) return;
    playForTarget(event.target);
  };

  root.addEventListener('pointerdown', onPointerDown, true);
  root.addEventListener('click', onClick as EventListener, true);
  return () => {
    root.removeEventListener('pointerdown', onPointerDown, true);
    root.removeEventListener('click', onClick as EventListener, true);
  };
};
