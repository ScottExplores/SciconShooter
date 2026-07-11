import type { SVGProps } from 'react';

export type EditorIconName =
  | 'add'
  | 'asteroid'
  | 'back'
  | 'boss'
  | 'copy'
  | 'delete'
  | 'down'
  | 'edit'
  | 'forward'
  | 'history'
  | 'pause'
  | 'play'
  | 'restart'
  | 'save'
  | 'spawn'
  | 'undo'
  | 'up';

interface EditorIconProps extends SVGProps<SVGSVGElement> {
  name: EditorIconName;
}

export function EditorIcon({ name, ...props }: EditorIconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {name === 'add' ? <path d="M12 5v14M5 12h14" /> : null}
      {name === 'asteroid' ? <><path d="m8 3 7 1 5 6-2 7-6 4-7-3-2-7 5-8Z" /><path d="m8 9 3-2m4 7 3-2m-9 4 3 1" /></> : null}
      {name === 'back' ? <><path d="m12 6-6 6 6 6" /><path d="M19 6v12" /></> : null}
      {name === 'boss' ? <><path d="m7 8-3-3m13 3 3-3M5 10l2-2h10l2 2v6l-3 3H8l-3-3v-6Z" /><path d="M9 13h.01M15 13h.01m-5 4h4" /></> : null}
      {name === 'copy' ? <><rect x="8" y="8" width="11" height="11" rx="1" /><path d="M16 8V5H5v11h3" /></> : null}
      {name === 'delete' ? <><path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7" /><path d="M10 11v6m4-6v6" /></> : null}
      {name === 'down' ? <path d="m6 9 6 6 6-6" /> : null}
      {name === 'edit' ? <><path d="m4 20 4-1 11-11-3-3L5 16l-1 4Z" /><path d="m14 7 3 3" /></> : null}
      {name === 'forward' ? <><path d="m12 6 6 6-6 6" /><path d="M5 6v12" /></> : null}
      {name === 'history' ? <><path d="M4 5v5h5" /><path d="M5.5 10a7 7 0 1 1 .5 6" /></> : null}
      {name === 'pause' ? <><path d="M8 5v14M16 5v14" /></> : null}
      {name === 'play' ? <path d="m8 5 11 7-11 7V5Z" /> : null}
      {name === 'restart' ? <><path d="M20 7v5h-5" /><path d="M19 12a7 7 0 1 1-2-5" /></> : null}
      {name === 'save' ? <><path d="M4 4h13l3 3v13H4V4Z" /><path d="M8 4v6h8V4m-8 16v-6h8v6" /></> : null}
      {name === 'spawn' ? <><path d="M12 3v4M5.6 5.6l2.8 2.8M3 12h4m-1.4 6.4 2.8-2.8M12 17v4m6.4-2.6-2.8-2.8M17 12h4m-2.6-6.4-2.8 2.8" /><circle cx="12" cy="12" r="3" /></> : null}
      {name === 'undo' ? <><path d="m9 7-5 5 5 5" /><path d="M4 12h9a6 6 0 0 1 6 6" /></> : null}
      {name === 'up' ? <path d="m6 15 6-6 6 6" /> : null}
    </svg>
  );
}
