const { createHmac, randomBytes } = require('node:crypto');

const X_API_BASE_URL = 'https://api.x.com/2';

const encode = (value) => encodeURIComponent(String(value))
  .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);

const createOAuthHeader = ({
  method,
  url,
  apiKey,
  apiSecret,
  accessToken,
  accessTokenSecret,
  nonce = randomBytes(18).toString('hex'),
  timestamp = Math.floor(Date.now() / 1000)
}) => {
  const target = new URL(url);
  const oauth = {
    oauth_consumer_key: apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(timestamp),
    oauth_token: accessToken,
    oauth_version: '1.0'
  };
  const parameters = [...target.searchParams.entries(), ...Object.entries(oauth)]
    .map(([key, value]) => [encode(key), encode(value)])
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => (
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)
    ));
  const parameterString = parameters.map(([key, value]) => `${key}=${value}`).join('&');
  const baseUrl = `${target.protocol}//${target.host}${target.pathname}`;
  const signatureBase = [method.toUpperCase(), encode(baseUrl), encode(parameterString)].join('&');
  const signingKey = `${encode(apiSecret)}&${encode(accessTokenSecret)}`;
  const signature = createHmac('sha1', signingKey).update(signatureBase).digest('base64');

  return `OAuth ${Object.entries({ ...oauth, oauth_signature: signature })
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encode(key)}="${encode(value)}"`)
    .join(', ')}`;
};

const readCredentials = (environment = process.env) => {
  const credentials = {
    apiKey: String(environment.X_API_KEY || '').trim(),
    apiSecret: String(environment.X_API_SECRET || '').trim(),
    accessToken: String(environment.X_ACCESS_TOKEN || '').trim(),
    accessTokenSecret: String(environment.X_ACCESS_TOKEN_SECRET || '').trim()
  };
  const missing = Object.entries(credentials)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) throw new Error(`X API credentials are incomplete: ${missing.join(', ')}`);
  return credentials;
};

const createXClient = ({
  environment = process.env,
  fetchImpl = fetch,
  nonceFactory,
  now = () => Date.now()
} = {}) => {
  const credentials = readCredentials(environment);

  const request = async (path, { method = 'GET', query, body } = {}) => {
    const url = new URL(`${X_API_BASE_URL}${path}`);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
    const headers = {
      Authorization: createOAuthHeader({
        method,
        url: url.toString(),
        ...credentials,
        nonce: nonceFactory?.(),
        timestamp: Math.floor(now() / 1000)
      }),
      Accept: 'application/json'
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetchImpl(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const responseText = await response.text();
    const payload = responseText ? JSON.parse(responseText) : null;
    if (!response.ok) {
      const details = payload?.detail || payload?.title || responseText || `HTTP ${response.status}`;
      throw new Error(`X API request failed (${response.status}): ${details}`);
    }
    return payload;
  };

  return {
    async getMe() {
      const payload = await request('/users/me', {
        query: { 'user.fields': 'id,name,username' }
      });
      return payload?.data || null;
    },

    async getMentions(userId, { sinceId, maxResults = 25 } = {}) {
      return request(`/users/${encode(userId)}/mentions`, {
        query: {
          since_id: sinceId,
          max_results: Math.max(5, Math.min(100, Number(maxResults) || 25)),
          expansions: 'author_id',
          'tweet.fields': 'author_id,conversation_id,created_at,in_reply_to_user_id,public_metrics',
          'user.fields': 'created_at,id,name,public_metrics,username,verified'
        }
      });
    },

    async getOwnPosts(userId, { maxResults = 100 } = {}) {
      return request(`/users/${encode(userId)}/tweets`, {
        query: {
          max_results: Math.max(5, Math.min(100, Number(maxResults) || 100)),
          'tweet.fields': 'conversation_id,created_at,public_metrics'
        }
      });
    },

    async createPost({ text, replyToId, poll }) {
      const body = { text };
      if (replyToId) body.reply = { in_reply_to_tweet_id: String(replyToId) };
      if (poll) body.poll = poll;
      const payload = await request('/tweets', { method: 'POST', body });
      return payload?.data || null;
    }
  };
};

module.exports = {
  X_API_BASE_URL,
  createOAuthHeader,
  createXClient,
  encode,
  readCredentials
};
