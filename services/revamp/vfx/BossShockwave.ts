import { Container, Filter, GlProgram, Rectangle, UniformGroup, type Renderer } from 'pixi.js';

export const BOSS_SHOCKWAVE_DURATION_MS = 360;
export const BOSS_SHOCKWAVE_MAX_DISPLACEMENT = 3;

// Pixi v8's filter quad coordinates. The extra varying retains display pixels,
// so the circular front stays round on the tall mobile arena.
const vertex = `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vWorldCoord;
uniform highp vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main() {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  vWorldCoord = position;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}`;

const fragment = `
in vec2 vTextureCoord;
in vec2 vWorldCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform vec4 uInputClamp;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uBand;
uniform float uStrength;
void main() {
  vec2 radial = vWorldCoord - uCenter;
  float distance = length(radial);
  float front = (distance - uRadius) / uBand;
  float envelope = 1.0 - smoothstep(0.0, 1.0, abs(front));
  vec2 direction = radial / max(distance, 1.0);
  float ripple = clamp(sin(front * 3.14159265) * envelope * 1.8, -1.0, 1.0);
  vec2 shift = direction * ripple * uStrength;
  vec2 uv = clamp(vTextureCoord + shift * uInputSize.zw, uInputClamp.xy, uInputClamp.zw);
  // The filter's render target may use linear sampling. Exact texel centers
  // preserve crisp nearest-neighbour scenery without changing its sampler.
  uv = (floor(uv * uInputSize.xy) + 0.5) * uInputSize.zw;
  finalColor = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}`;

/** One brief background-only pass. No gameplay sprite, projectile or HUD is filtered. */
export class BossShockwave {
  private filter?: Filter;
  private uniforms?: { uCenter: Float32Array; uRadius: number; uBand: number; uStrength: number };
  private contextRenderer?: Renderer;
  private readonly area = new Rectangle();
  private previousArea: Rectangle | null = null;
  private attached = false;
  private disposed = false;
  // Pixi restores shader programs itself. Never render from a context runner;
  // detach this optional pass until its next ordinary presentation update.
  private readonly contextListener = { contextChange: () => this.disable() };

  constructor(private readonly background: Container, private readonly renderer: () => Renderer) {}

  /**
   * center is in display/world pixels (apply encounter camera before calling).
   * enabled must mean explicit High quality AND motion/flash effects permitted.
   * ageMs starts at the finale, independently of the preceding hull sequence.
   */
  update(centerX: number, centerY: number, ageMs: number, width: number, height: number, enabled: boolean) {
    if (this.disposed || !enabled || !Number.isFinite(ageMs) || ageMs < 0
      || ageMs >= BOSS_SHOCKWAVE_DURATION_MS || !Number.isFinite(centerX)
      || !Number.isFinite(centerY) || !Number.isFinite(width) || !Number.isFinite(height)
      || width <= 0 || height <= 0) {
      this.disable();
      return;
    }
    if (!this.filter) this.createFilter();
    const progress = ageMs / BOSS_SHOCKWAVE_DURATION_MS;
    this.uniforms!.uCenter[0] = centerX;
    this.uniforms!.uCenter[1] = centerY;
    this.uniforms!.uRadius = 12 + Math.min(360, Math.max(width, height) * 0.44) * progress;
    this.uniforms!.uBand = 13 + 9 * progress;
    this.uniforms!.uStrength = BOSS_SHOCKWAVE_MAX_DISPLACEMENT * (1 - progress);
    this.area.set(0, 0, width, height);
    if (!this.attached) {
      this.previousArea = this.background.filterArea;
      this.background.filterArea = this.area;
      this.background.filters = [...(this.background.filters ?? []), this.filter!];
      this.attached = true;
    }
  }

  /** Remove the pass completely on Auto/Low and reduced motion, including mid-pulse changes. */
  disable() {
    if (!this.attached) return;
    const remaining = (this.background.filters ?? []).filter(filter => filter !== this.filter);
    this.background.filters = remaining.length ? remaining : null;
    if (this.background.filterArea === this.area) this.background.filterArea = this.previousArea;
    this.previousArea = null;
    this.attached = false;
  }

  private createFilter() {
    const uniforms = new UniformGroup({
      uCenter: { value: new Float32Array(2), type: 'vec2<f32>' },
      uRadius: { value: 0, type: 'f32' },
      uBand: { value: 14, type: 'f32' },
      uStrength: { value: 0, type: 'f32' }
    });
    this.uniforms = uniforms.uniforms;
    this.filter = new Filter({
      glProgram: GlProgram.from({ vertex, fragment, name: 'scicon-boss-shockwave' }),
      resources: { shockwaveUniforms: uniforms },
      resolution: 1, padding: 0, antialias: 'off', clipToViewport: true
    });
    this.contextRenderer = this.renderer();
    this.contextRenderer.runners?.contextChange?.add(this.contextListener);
  }

  destroy() {
    if (this.disposed) return;
    this.disable();
    this.contextRenderer?.runners?.contextChange?.remove(this.contextListener);
    this.contextRenderer = undefined;
    this.filter?.destroy();
    this.filter = undefined;
    this.uniforms = undefined;
    this.disposed = true;
  }
}
