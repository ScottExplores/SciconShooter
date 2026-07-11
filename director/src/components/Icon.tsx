import type { SVGProps } from 'react';

export type IconName =
  | 'scorecard'
  | 'waves'
  | 'review'
  | 'undo'
  | 'redo'
  | 'reset'
  | 'save'
  | 'publish'
  | 'pin'
  | 'rectangle'
  | 'zoom-in'
  | 'zoom-out'
  | 'fit'
  | 'camera'
  | 'download'
  | 'check'
  | 'plus'
  | 'resolve';

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
}

export const Icon = ({ name, ...props }: IconProps) => {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <g {...common}>
        {name === 'scorecard' ? <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h5M8 16h8" /></> : null}
        {name === 'waves' ? <path d="M2 13h3l2-7 4 13 3-10 3 7h5" /> : null}
        {name === 'review' ? <><path d="M4 4h16v12H8l-4 4V4Z" /><path d="M8 8h8M8 12h5" /></> : null}
        {name === 'undo' ? <><path d="m9 7-4 4 4 4" /><path d="M5 11h8a6 6 0 0 1 6 6" /></> : null}
        {name === 'redo' ? <><path d="m15 7 4 4-4 4" /><path d="M19 11h-8a6 6 0 0 0-6 6" /></> : null}
        {name === 'reset' ? <><path d="M20 7v5h-5" /><path d="M19 12a7 7 0 1 1-2-5" /></> : null}
        {name === 'save' ? <><path d="M5 3h12l2 2v16H5V3Z" /><path d="M8 3v6h8V3M8 21v-7h8v7" /></> : null}
        {name === 'publish' ? <><path d="M12 20V8" /><path d="m7 13 5-5 5 5" /><path d="M5 4h14" /></> : null}
        {name === 'pin' ? <><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" /><circle cx="12" cy="10" r="2" /></> : null}
        {name === 'rectangle' ? <rect x="4" y="5" width="16" height="14" /> : null}
        {name === 'zoom-in' ? <><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5M10 7v6M7 10h6" /></> : null}
        {name === 'zoom-out' ? <><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5M7 10h6" /></> : null}
        {name === 'fit' ? <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" /><path d="M8 8h8v8H8z" /></> : null}
        {name === 'camera' ? <><path d="M4 7h4l2-2h4l2 2h4v12H4V7Z" /><circle cx="12" cy="13" r="4" /></> : null}
        {name === 'download' ? <><path d="M12 3v12m-4-4 4 4 4-4" /><path d="M4 19h16" /></> : null}
        {name === 'check' || name === 'resolve' ? <path d="m5 12 4 4L19 6" /> : null}
        {name === 'plus' ? <path d="M12 5v14M5 12h14" /> : null}
      </g>
    </svg>
  );
};
