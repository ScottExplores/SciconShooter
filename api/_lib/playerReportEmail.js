const RESEND_EMAIL_ENDPOINT = 'https://api.resend.com/emails';
const PLAYER_REPORT_EMAIL_TO = 'sciconshooter@gmail.com';
const PLAYER_REPORT_EMAIL_FROM = 'Scicon Shooter Reports <reports@sciconshooter.xyz>';
const EMAIL_TIMEOUT_MS = 5_000;

const CATEGORY_LABELS = Object.freeze({
  gameplay: 'Gameplay or waves',
  'loading-performance': 'Loading or performance',
  'wallet-purchase': 'Wallet or purchase',
  'visual-audio': 'Visual or audio',
  other: 'Something else'
});

const emailDeliveryError = (retryAfterMs = null) => Object.assign(
  new Error('Player report email delivery is temporarily unavailable.'),
  {
    code: 'REPORT_EMAIL_UNAVAILABLE',
    ...(Number.isFinite(retryAfterMs) ? { retryAfterMs } : {})
  }
);

const parseRetryAfterMs = (response) => {
  const raw = response.headers?.get?.('Retry-After')?.trim();
  if (!raw) return null;
  const seconds = Number(raw);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(raw) - Date.now();
  if (!Number.isFinite(delay)) return null;
  return Math.max(1_000, Math.min(60 * 60 * 1000, Math.round(delay)));
};

const formatDiagnostics = (diagnostics) => {
  if (!diagnostics) return 'Not included by the player.';
  try {
    return JSON.stringify(diagnostics, null, 2);
  } catch {
    return 'Diagnostics could not be formatted.';
  }
};

const buildPlayerReportEmail = (report) => {
  const reportLabel = report.kind === 'feedback' ? 'Feedback' : 'Bug report';
  const categoryLabel = CATEGORY_LABELS[report.category] || report.category;
  const shortReportId = report.reportId.slice(0, 8).toUpperCase();
  return {
    from: PLAYER_REPORT_EMAIL_FROM,
    to: [PLAYER_REPORT_EMAIL_TO],
    subject: `[Scicon Shooter] ${reportLabel} - ${categoryLabel} - ${shortReportId}`,
    text: [
      `A player submitted a ${reportLabel.toLowerCase()} from Scicon Shooter.`,
      '',
      `Report ID: ${report.reportId}`,
      `Category: ${categoryLabel}`,
      `Submitted: ${report.createdAt}`,
      `Game version: ${report.gameVersion}`,
      '',
      'Summary',
      report.summary,
      '',
      'Additional details',
      report.details || 'None provided.',
      '',
      'Technical diagnostics',
      formatDiagnostics(report.diagnostics)
    ].join('\n')
  };
};

const sendPlayerReportEmail = async (report) => {
  if (report.source !== 'manual') return { emailed: false, skipped: true };

  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) throw emailDeliveryError();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMAIL_TIMEOUT_MS);
  try {
    const response = await fetch(RESEND_EMAIL_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `scicon-player-report/${report.reportId}`
      },
      body: JSON.stringify(buildPlayerReportEmail(report)),
      signal: controller.signal
    });
    if (!response.ok) throw emailDeliveryError(parseRetryAfterMs(response));

    let responseBody;
    try {
      responseBody = await response.json();
    } catch {
      throw emailDeliveryError();
    }
    if (typeof responseBody?.id !== 'string' || !responseBody.id.trim()) {
      throw emailDeliveryError();
    }
    return { emailed: true, skipped: false, providerMessageId: responseBody.id };
  } catch (error) {
    if (error?.code === 'REPORT_EMAIL_UNAVAILABLE') throw error;
    throw emailDeliveryError();
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = {
  PLAYER_REPORT_EMAIL_FROM,
  PLAYER_REPORT_EMAIL_TO,
  RESEND_EMAIL_ENDPOINT,
  buildPlayerReportEmail,
  parseRetryAfterMs,
  sendPlayerReportEmail
};
