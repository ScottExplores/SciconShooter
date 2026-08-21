const { createHmac, randomBytes } = require('node:crypto');

const X_API_BASE_URL = 'https://api.x.com/2';
const X_MEDIA_UPLOAD_URL = 'https://upload.twitter.com/1.1/media/upload.json';
const X_MEDIA_METADATA_URL = 'https://upload.twitter.com/1.1/media/metadata/create.json';
const X_MEDIA_SOURCE_HOST = 'www.sciconshooter.xyz';
const X_MEDIA_SOURCE_PREFIX = '/social-assets/';
const MAX_X_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_X_VIDEO_BYTES = 15 * 1024 * 1024;
const X_VIDEO_CHUNK_BYTES = 5 * 1024 * 1024;
const MAX_X_VIDEO_STATUS_CHECKS = 8;
const X_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const X_VIDEO_TYPE = 'video/mp4';

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
  now = () => Date.now(),
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
} = {}) => {
  const credentials = readCredentials(environment);

  const requestUrl = async (inputUrl, { method = 'GET', query, body, rawBody } = {}) => {
    const url = new URL(inputUrl);
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
      body: rawBody === undefined
        ? body === undefined ? undefined : JSON.stringify(body)
        : rawBody
    });
    const responseText = await response.text();
    const payload = responseText ? JSON.parse(responseText) : null;
    if (!response.ok) {
      const details = payload?.detail || payload?.title || responseText || `HTTP ${response.status}`;
      throw new Error(`X API request failed (${response.status}): ${details}`);
    }
    return payload;
  };

  const request = (path, options) => requestUrl(`${X_API_BASE_URL}${path}`, options);

  const uploadImageBytes = async ({ bytes, mediaType, altText }) => {
    if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > MAX_X_IMAGE_BYTES) {
      throw new Error('X media image size is invalid.');
    }
    if (!X_IMAGE_TYPES.has(mediaType)) throw new Error('X media image type is not allowed.');
    const extension = mediaType === 'image/jpeg' ? 'jpg' : mediaType.split('/')[1];
    const form = new FormData();
    form.append('media', new Blob([bytes], { type: mediaType }), `scicon-social.${extension}`);
    const payload = await requestUrl(X_MEDIA_UPLOAD_URL, { method: 'POST', rawBody: form });
    const mediaId = String(payload?.media_id_string || payload?.media_id || payload?.data?.id || '').trim();
    if (!/^\d{1,19}$/.test(mediaId)) throw new Error('X did not return a valid media ID.');
    if (altText) {
      await requestUrl(X_MEDIA_METADATA_URL, {
        method: 'POST',
        body: { media_id: mediaId, alt_text: { text: altText } }
      });
    }
    return mediaId;
  };

  const readMediaId = (payload) => {
    const mediaId = String(payload?.media_id_string || payload?.media_id || payload?.data?.id || '').trim();
    if (!/^\d{1,19}$/.test(mediaId)) throw new Error('X did not return a valid media ID.');
    return mediaId;
  };

  const waitForVideoProcessing = async (mediaId, initialProcessingInfo) => {
    let processingInfo = initialProcessingInfo || null;
    for (let attempt = 0; processingInfo && attempt < MAX_X_VIDEO_STATUS_CHECKS; attempt += 1) {
      const state = String(processingInfo.state || '').toLowerCase();
      if (state === 'succeeded') return;
      if (state === 'failed') {
        const details = processingInfo?.error?.message || processingInfo?.error?.name || 'unknown processing error';
        throw new Error(`X video processing failed: ${details}`);
      }
      if (!['pending', 'in_progress'].includes(state)) {
        throw new Error(`X returned an unknown video processing state: ${state || 'missing'}`);
      }
      const waitSeconds = Math.max(1, Math.min(5, Number(processingInfo.check_after_secs) || 1));
      await sleep(waitSeconds * 1_000);
      const status = await requestUrl(X_MEDIA_UPLOAD_URL, {
        query: { command: 'STATUS', media_id: mediaId }
      });
      processingInfo = status?.processing_info || null;
    }
    if (processingInfo) throw new Error('X video processing did not finish within the bounded wait.');
  };

  const uploadVideoBytes = async ({ bytes, altText }) => {
    if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > MAX_X_VIDEO_BYTES) {
      throw new Error('X media video size is invalid.');
    }
    const initForm = new FormData();
    initForm.append('command', 'INIT');
    initForm.append('total_bytes', String(bytes.length));
    initForm.append('media_type', X_VIDEO_TYPE);
    initForm.append('media_category', 'tweet_video');
    const initialized = await requestUrl(X_MEDIA_UPLOAD_URL, {
      method: 'POST',
      rawBody: initForm
    });
    const mediaId = readMediaId(initialized);
    for (let offset = 0, segmentIndex = 0; offset < bytes.length; offset += X_VIDEO_CHUNK_BYTES, segmentIndex += 1) {
      const form = new FormData();
      form.append('command', 'APPEND');
      form.append('media_id', mediaId);
      form.append('segment_index', String(segmentIndex));
      form.append('media', new Blob([bytes.subarray(offset, offset + X_VIDEO_CHUNK_BYTES)], { type: X_VIDEO_TYPE }), 'scicon-social.mp4');
      await requestUrl(X_MEDIA_UPLOAD_URL, {
        method: 'POST',
        rawBody: form
      });
    }
    const finalizeForm = new FormData();
    finalizeForm.append('command', 'FINALIZE');
    finalizeForm.append('media_id', mediaId);
    const finalized = await requestUrl(X_MEDIA_UPLOAD_URL, {
      method: 'POST',
      rawBody: finalizeForm
    });
    await waitForVideoProcessing(mediaId, finalized?.processing_info);
    if (altText) {
      await requestUrl(X_MEDIA_METADATA_URL, {
        method: 'POST',
        body: { media_id: mediaId, alt_text: { text: altText } }
      });
    }
    return mediaId;
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
          expansions: 'attachments.poll_ids',
          'tweet.fields': 'attachments,conversation_id,created_at,public_metrics',
          'poll.fields': 'duration_minutes,end_datetime,id,options,voting_status'
        }
      });
    },

    async uploadImageFromUrl({ sourceUrl, altText }) {
      const source = new URL(sourceUrl);
      if (
        source.protocol !== 'https:'
        || source.hostname !== X_MEDIA_SOURCE_HOST
        || !source.pathname.startsWith(X_MEDIA_SOURCE_PREFIX)
        || source.search
        || source.hash
      ) {
        throw new Error('X media source URL is not allowed.');
      }
      const response = await fetchImpl(source, {
        method: 'GET',
        redirect: 'error',
        headers: { Accept: 'image/png,image/jpeg,image/webp' }
      });
      if (!response.ok) throw new Error(`X media source fetch failed (${response.status}).`);
      const mediaType = String(response.headers?.get?.('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!X_IMAGE_TYPES.has(mediaType)) throw new Error('X media source returned an unsupported image type.');
      const declaredBytes = Number(response.headers?.get?.('content-length'));
      if (Number.isFinite(declaredBytes) && declaredBytes > MAX_X_IMAGE_BYTES) {
        throw new Error('X media source exceeds the image size limit.');
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      return uploadImageBytes({ bytes, mediaType, altText });
    },

    async uploadVideoFromUrl({ sourceUrl, altText }) {
      const source = new URL(sourceUrl);
      if (
        source.protocol !== 'https:'
        || source.hostname !== X_MEDIA_SOURCE_HOST
        || !source.pathname.startsWith(X_MEDIA_SOURCE_PREFIX)
        || !source.pathname.toLowerCase().endsWith('.mp4')
        || source.search
        || source.hash
      ) {
        throw new Error('X video source URL is not allowed.');
      }
      const response = await fetchImpl(source, {
        method: 'GET',
        redirect: 'error',
        headers: { Accept: X_VIDEO_TYPE }
      });
      if (!response.ok) throw new Error(`X video source fetch failed (${response.status}).`);
      const mediaType = String(response.headers?.get?.('content-type') || '').split(';')[0].trim().toLowerCase();
      if (mediaType !== X_VIDEO_TYPE) throw new Error('X video source returned an unsupported video type.');
      const declaredBytes = Number(response.headers?.get?.('content-length'));
      if (Number.isFinite(declaredBytes) && declaredBytes > MAX_X_VIDEO_BYTES) {
        throw new Error('X video source exceeds the configured size limit.');
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      return uploadVideoBytes({ bytes, altText });
    },

    async createPost({ text, replyToId, poll, mediaIds }) {
      const body = { text };
      if (replyToId) body.reply = { in_reply_to_tweet_id: String(replyToId) };
      if (poll) body.poll = poll;
      if (Array.isArray(mediaIds) && mediaIds.length > 0) {
        if (poll) throw new Error('X posts cannot combine a poll with media.');
        if (mediaIds.length > 4 || mediaIds.some((id) => !/^\d{1,19}$/.test(String(id)))) {
          throw new Error('X media IDs are invalid.');
        }
        body.media = { media_ids: mediaIds.map(String) };
      }
      const payload = await request('/tweets', { method: 'POST', body });
      return payload?.data || null;
    }
  };
};

module.exports = {
  X_API_BASE_URL,
  X_MEDIA_METADATA_URL,
  X_MEDIA_UPLOAD_URL,
  createOAuthHeader,
  createXClient,
  encode,
  readCredentials
};
