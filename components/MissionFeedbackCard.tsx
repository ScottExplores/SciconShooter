import React, { useEffect, useRef, useState } from 'react';
import {
  acknowledgeMissionFeedbackShown,
  fetchMissionFeedbackStatus,
  submitMissionFeedback
} from '../services/missionFeedbackService';
import {
  browserMissionFeedbackStorage,
  markMissionFeedbackShown,
  readMissionFeedbackShown,
  shouldShowMissionFeedback
} from '../services/missionFeedbackPrompt';
import './mission-feedback.css';

const SCAN_STRIP = '/game-art/generated/ui/scicon-ui-system-v2/animations/mission-record-verification/parts/scan-strip.png';
const COMMENT_LIMIT = 500;
const THANKS_MS = 1100;

interface MissionFeedbackCardProps {
  walletConnected: boolean;
  missionId: string;
}

const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error('timeout')), ms);
      })
    ]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
};

const MissionFeedbackCard: React.FC<MissionFeedbackCardProps> = ({
  walletConnected,
  missionId
}) => {
  const [visible, setVisible] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [phase, setPhase] = useState<'form' | 'thanks' | 'error'>('form');
  const [sending, setSending] = useState(false);
  const missionIdRef = useRef(missionId);
  missionIdRef.current = missionId;

  useEffect(() => {
    let cancel = false;
    const storage = browserMissionFeedbackStorage();
    const decide = async () => {
      if (readMissionFeedbackShown(storage)) return;
      let profileShown = false;
      if (walletConnected) {
        try {
          const status = await withTimeout(fetchMissionFeedbackStatus(), 2500);
          profileShown = status.shown;
        } catch {
          profileShown = false;
        }
      }
      if (cancel || readMissionFeedbackShown(storage)) return;
      const show = shouldShowMissionFeedback({
        result: 'win',
        deviceShown: false,
        profileShown
      });
      if (!show) {
        if (profileShown) markMissionFeedbackShown(storage);
        return;
      }
      markMissionFeedbackShown(storage);
      if (cancel) return;
      setVisible(true);
      if (walletConnected) {
        try {
          await acknowledgeMissionFeedbackShown();
        } catch {
          // This device is already marked. The next signed-in visit retries.
        }
      }
    };
    void decide();
    return () => {
      cancel = true;
    };
  }, [walletConnected]);

  useEffect(() => {
    if (phase !== 'thanks') return undefined;
    const timer = window.setTimeout(() => setVisible(false), THANKS_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (!visible) return null;

  const dismiss = () => {
    if (sending) return;
    markMissionFeedbackShown(browserMissionFeedbackStorage());
    setVisible(false);
  };

  const send = async () => {
    if (!rating || sending || phase === 'thanks') return;
    setSending(true);
    setPhase('form');
    try {
      await submitMissionFeedback({
        rating,
        comment,
        missionId: missionIdRef.current
      });
      markMissionFeedbackShown(browserMissionFeedbackStorage());
      setPhase('thanks');
    } catch {
      setPhase('error');
    } finally {
      setSending(false);
    }
  };

  return (
    <section
      className="mission-feedback-card"
      data-testid="mission-feedback-card"
      aria-labelledby="mission-feedback-title"
    >
      <img className="mission-feedback-scan" src={SCAN_STRIP} alt="" aria-hidden="true" />
      {phase === 'thanks' ? (
        <p className="mission-feedback-thanks" role="status">Thanks!</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <div className="mission-feedback-heading">
            <h2 id="mission-feedback-title">Enjoying SciCon?</h2>
            <button
              className="mission-feedback-close"
              type="button"
              onClick={dismiss}
              aria-label="Not now"
            >
              X
            </button>
          </div>
          <div className="mission-feedback-stars" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((value) => {
              const selected = rating !== null && value <= rating;
              return (
                <button
                  key={value}
                  className={`mission-feedback-star${selected ? ' is-on' : ''}`}
                  type="button"
                  role="radio"
                  aria-checked={rating === value}
                  aria-label={`${value} star${value === 1 ? '' : 's'}`}
                  data-testid={`mission-feedback-star-${value}`}
                  onClick={() => setRating(value)}
                >
                  ★
                </button>
              );
            })}
          </div>
          <textarea
            className="mission-feedback-comment"
            value={comment}
            maxLength={COMMENT_LIMIT}
            rows={2}
            placeholder="Optional"
            aria-label="Comment"
            data-testid="mission-feedback-comment"
            onChange={(event) => setComment(event.target.value.slice(0, COMMENT_LIMIT))}
          />
          {phase === 'error' ? <p className="mission-feedback-error" role="alert">Try again</p> : null}
          <div className="mission-feedback-actions">
            <button
              className="mission-feedback-send"
              type="submit"
              disabled={!rating || sending}
              data-testid="mission-feedback-send"
            >
              {sending ? 'Sending' : 'Send'}
            </button>
            <button className="mission-feedback-later" type="button" onClick={dismiss}>
              Not now
            </button>
          </div>
        </form>
      )}
    </section>
  );
};

export default MissionFeedbackCard;
