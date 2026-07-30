export const DESKTOP_LAUNCH_MEDIA_QUERY = '(min-width: 900px) and (hover: hover) and (pointer: fine)';
export const DESKTOP_LAUNCH_SESSION_KEY = 'scicon-shooter:desktop-mobile-launch-play-here:v1';
export const MOBILE_FRAME_DISPLAY_PARAMETER = 'display';
export const MOBILE_FRAME_DISPLAY_VALUE = 'mobile-frame';
export const MOBILE_FRAME_WIDTH = 390;
export const MOBILE_FRAME_HEIGHT = 844;

export interface DesktopLaunchEnvironment {
  readonly topLevel: boolean;
  readonly framedDisplayRequested: boolean;
  readonly desktopMediaMatches: boolean;
}

export const shouldUseDesktopLaunchShell = ({
  topLevel,
  framedDisplayRequested,
  desktopMediaMatches
}: DesktopLaunchEnvironment) => (
  topLevel && !framedDisplayRequested && desktopMediaMatches
);

export const hasMobileFrameDisplay = (href: string) => {
  const url = new URL(href);
  return url.searchParams.get(MOBILE_FRAME_DISPLAY_PARAMETER) === MOBILE_FRAME_DISPLAY_VALUE;
};

export const buildMobileFrameUrl = (href: string) => {
  const url = new URL(href);
  url.searchParams.set(MOBILE_FRAME_DISPLAY_PARAMETER, MOBILE_FRAME_DISPLAY_VALUE);
  return url.toString();
};

export const resolveMobileFrameScale = (
  viewportWidth: number,
  viewportHeight: number,
  horizontalPadding = 48,
  verticalPadding = 24
) => {
  const safeWidth = Number.isFinite(viewportWidth) ? Math.max(1, viewportWidth) : MOBILE_FRAME_WIDTH;
  const safeHeight = Number.isFinite(viewportHeight) ? Math.max(1, viewportHeight) : MOBILE_FRAME_HEIGHT;
  const widthBudget = Math.max(1, safeWidth - Math.max(0, horizontalPadding));
  const heightBudget = Math.max(1, safeHeight - Math.max(0, verticalPadding));

  return Math.max(0.1, Math.min(
    1,
    widthBudget / MOBILE_FRAME_WIDTH,
    heightBudget / MOBILE_FRAME_HEIGHT
  ));
};
