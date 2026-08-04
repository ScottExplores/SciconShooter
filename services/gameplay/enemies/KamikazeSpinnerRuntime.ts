export const KAMIKAZE_SPINNER_ROLE_ID = 'role-orbit-scout';

const KAMIKAZE_SPINNER_ASSET_SEGMENT = '/scicon-kamikaze-spinner-v1/';
const KAMIKAZE_SPINNER_FORWARD_DIVE_FRAME_INDEX = 0;
const KAMIKAZE_SPINNER_HOLD_FRAMES = 7;

export interface KamikazeSpinnerFrameInput {
  frames?: readonly string[];
  campaignRoleId?: string;
  formationState?: string;
  frameCount: number;
  variant?: number;
  formationIndex?: number;
}

export const isKamikazeSpinner = ({
  frames,
  campaignRoleId
}: Pick<KamikazeSpinnerFrameInput, 'frames' | 'campaignRoleId'>) => (
  campaignRoleId === KAMIKAZE_SPINNER_ROLE_ID
  || Boolean(frames?.some((frame) => frame.includes(KAMIKAZE_SPINNER_ASSET_SEGMENT)))
);

/**
 * The generated pack is a six-pose yaw loop, not six independent enemies.
 * Assembled and traveling scouts spin through every pose. A committed dive
 * holds the authored forward silhouette so the hull visibly aims at the
 * player instead of presenting a sideways frame during the attack.
 */
export const resolveKamikazeSpinnerFrameIndex = (input: KamikazeSpinnerFrameInput) => {
  const frameCount = input.frames?.length ?? 0;
  if (frameCount <= 0 || !isKamikazeSpinner(input)) return null;
  if (input.formationState === 'dive') {
    return Math.min(KAMIKAZE_SPINNER_FORWARD_DIVE_FRAME_INDEX, frameCount - 1);
  }

  const phaseOffset = Math.abs(
    Math.floor(input.variant ?? 0) * 13
    + Math.floor(input.formationIndex ?? 0) * 7
  );
  return Math.floor((Math.max(0, input.frameCount) + phaseOffset) / KAMIKAZE_SPINNER_HOLD_FRAMES)
    % frameCount;
};
