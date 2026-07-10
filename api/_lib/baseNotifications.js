const BASE_DASHBOARD_API = 'https://dashboard.base.org/api/v1/notifications';
const DEFAULT_APP_URL = 'https://www.sciconshooter.xyz';

const getConfig = () => ({
  apiKey: process.env.BASE_DASHBOARD_API_KEY,
  appUrl: process.env.BASE_APP_URL || DEFAULT_APP_URL
});

const requestBase = async (path, options = {}) => {
  const { apiKey } = getConfig();
  if (!apiKey) return null;
  const response = await fetch(`${BASE_DASHBOARD_API}${path}`, {
    ...options,
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Base notification request failed with ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }
  return payload;
};

const readOptedInWallets = async () => {
  const { apiKey, appUrl } = getConfig();
  if (!apiKey) return [];
  const wallets = [];
  let cursor = '';
  do {
    const params = new URLSearchParams({ app_url: appUrl, notification_enabled: 'true', limit: '500' });
    if (cursor) params.set('cursor', cursor);
    const payload = await requestBase(`/app/users?${params.toString()}`);
    for (const user of payload?.users || []) {
      if (user.notificationsEnabled && /^0x[a-f0-9]{40}$/i.test(user.address || '')) wallets.push(user.address);
    }
    cursor = payload?.nextCursor || '';
  } while (cursor && wallets.length < 10000);
  return [...new Set(wallets.map((wallet) => wallet.toLowerCase()))];
};

const sendBaseNotificationBroadcast = async ({ title, message, targetPath = '/' }) => {
  const { apiKey, appUrl } = getConfig();
  if (!apiKey) return { configured: false, sentCount: 0, failedCount: 0 };
  const wallets = await readOptedInWallets();
  let sentCount = 0;
  let failedCount = 0;
  for (let index = 0; index < wallets.length; index += 1000) {
    const payload = await requestBase('/send', {
      method: 'POST',
      body: JSON.stringify({
        app_url: appUrl,
        wallet_addresses: wallets.slice(index, index + 1000),
        title: String(title).slice(0, 30),
        message: String(message).slice(0, 200),
        target_path: targetPath.startsWith('/') ? targetPath.slice(0, 500) : '/'
      })
    });
    sentCount += Number(payload?.sentCount) || 0;
    failedCount += Number(payload?.failedCount) || 0;
  }
  return { configured: true, audienceCount: wallets.length, sentCount, failedCount };
};

module.exports = { sendBaseNotificationBroadcast };
