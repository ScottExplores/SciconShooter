import { HttpError } from './security.mjs';

export const OPENAI_IMAGE_ENDPOINT = 'https://api.openai.com/v1/images/generations';
export const DIRECTOR_IMAGE_MODEL = 'gpt-image-2';
export const DIRECTOR_CHROMA_KEY = '#ff00ff';

const DEFAULT_TIMEOUT_MS = 180_000;
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

const ROLE_DESCRIPTIONS = Object.freeze({
  enemy: 'an enemy spacecraft or hostile gameplay object',
  boss: 'a large boss encounter sprite',
  asteroid: 'an asteroid or environmental hazard',
  hud: 'a compact heads-up-display icon',
  scorecard: 'an encounter illustration for a mission scorecard',
  player: 'a player spacecraft',
  background: 'a game background layer'
});

const cleanLine = (value) => String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim();

/**
 * Adds the constraints needed for reliable local chroma removal without
 * allowing callers to control the model, output path, or network target.
 */
export const normalizeSpritePrompt = ({ prompt, label, role }) => {
  const request = cleanLine(prompt);
  const assetLabel = cleanLine(label);
  const roleDescription = ROLE_DESCRIPTIONS[role] || 'a polished 2D game sprite';

  return [
    'Use case: stylized-concept',
    `Asset type: Scicon Shooter ${roleDescription}`,
    `Primary request: ${request}`,
    `Asset label: ${assetLabel}`,
    'Style/medium: polished production-quality 2D arcade game sprite, crisp silhouette, detailed but readable at small sizes',
    'Composition/framing: one complete centered subject, straight-on or three-quarter game view, generous even padding, nothing cropped',
    `Scene/backdrop: perfectly flat solid ${DIRECTOR_CHROMA_KEY} chroma-key background for background removal`,
    `Constraints: the background must be one uniform ${DIRECTOR_CHROMA_KEY} color with no shadows, gradients, texture, reflections, floor plane, or lighting variation; do not use ${DIRECTOR_CHROMA_KEY} anywhere in the subject`,
    'Avoid: cast shadow, contact shadow, reflection, glow extending into the background, text, letters, logo, border, frame, watermark, extra objects'
  ].join('\n');
};

const validBase64 = (value) => (
  typeof value === 'string'
  && value.length > 0
  && value.length <= Math.ceil(MAX_RESPONSE_BYTES * 4 / 3) + 8
  && /^[A-Za-z0-9+/]+={0,2}$/.test(value)
);

export class OpenAIImageGenerationClient {
  constructor({
    apiKey = '',
    fetchImpl = globalThis.fetch,
    endpoint = OPENAI_IMAGE_ENDPOINT,
    model = DIRECTOR_IMAGE_MODEL,
    timeoutMs = DEFAULT_TIMEOUT_MS
  } = {}) {
    this.apiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
    this.fetchImpl = fetchImpl;
    this.endpoint = endpoint;
    this.model = model;
    this.timeoutMs = timeoutMs;
  }

  isConfigured() {
    return this.apiKey.length > 0 && typeof this.fetchImpl === 'function';
  }

  getPublicStatus() {
    return {
      available: this.isConfigured(),
      model: this.model,
      backgroundRemoval: 'local-chroma-key'
    };
  }

  async generateSprite(input) {
    if (!this.isConfigured()) {
      throw new HttpError(
        503,
        'Sprite generation is not configured locally. Set OPENAI_API_KEY in director/env/.env.local and restart Scicon Director.'
      );
    }

    const normalizedPrompt = normalizeSpritePrompt(input);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          prompt: normalizedPrompt,
          size: '1024x1024',
          quality: 'high',
          output_format: 'png'
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new HttpError(503, 'The local image-generation key was rejected. Update director/env/.env.local and restart Scicon Director.');
        }
        if (response.status === 429) {
          throw new HttpError(429, 'Image generation is temporarily rate-limited. Wait a moment and try again.');
        }
        throw new HttpError(502, `The image-generation service could not create the sprite (status ${response.status}).`);
      }

      const declaredLength = Number(response.headers?.get?.('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
        throw new HttpError(502, 'The image-generation response exceeded the local safety limit.');
      }

      const responseBytes = Buffer.from(await response.arrayBuffer());
      if (responseBytes.length > MAX_RESPONSE_BYTES) {
        throw new HttpError(502, 'The image-generation response exceeded the local safety limit.');
      }
      let payload = null;
      try {
        payload = JSON.parse(responseBytes.toString('utf8'));
      } catch {
        // The generic invalid-payload response below intentionally hides provider details.
      }
      const encoded = payload?.data?.[0]?.b64_json;
      if (!validBase64(encoded)) {
        throw new HttpError(502, 'The image-generation service returned an invalid image payload.');
      }

      const png = Buffer.from(encoded, 'base64');
      if (png.length === 0 || png.length > MAX_RESPONSE_BYTES) {
        throw new HttpError(502, 'The generated image exceeded the local safety limit.');
      }

      return {
        png,
        model: this.model,
        normalizedPrompt
      };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (error?.name === 'AbortError') {
        throw new HttpError(504, 'Image generation timed out. Try a shorter prompt or try again.');
      }
      throw new HttpError(502, 'The local Director could not reach the image-generation service.');
    } finally {
      clearTimeout(timeout);
    }
  }
}
