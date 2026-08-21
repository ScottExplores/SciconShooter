const X_POST_INTENT_URL = 'https://x.com/intent/post';
const SCORE_SHARE_GAME_URL = 'https://www.sciconshooter.xyz/?utm_source=x&utm_medium=social&utm_campaign=player-score-share&utm_content=mission-record';

interface XScoreShareOptions {
  score: number;
  wave: number;
}

export const buildXScoreShareUrl = ({ score, wave }: XScoreShareOptions) => {
  const safeScore = Math.max(0, Math.floor(Number(score) || 0));
  const safeWave = Math.max(1, Math.floor(Number(wave) || 1));
  const intent = new URL(X_POST_INTENT_URL);
  intent.searchParams.set(
    'text',
    `I scored ${safeScore.toLocaleString('en-US')} in Scicon Shooter and reached Wave ${safeWave}. Beat it.`
  );
  intent.searchParams.set('url', SCORE_SHARE_GAME_URL);
  return intent.toString();
};

export const openXScoreShare = (options: XScoreShareOptions) => {
  const shareWindow = window.open(
    buildXScoreShareUrl(options),
    '_blank',
    'noopener,noreferrer'
  );
  if (shareWindow) shareWindow.opener = null;
  return Boolean(shareWindow);
};

export { SCORE_SHARE_GAME_URL, X_POST_INTENT_URL };
