import { Container, Sprite, Texture } from 'pixi.js';

export type SoftRadialLight = {
  root: Container;
  halo: Sprite;
  reflection: Sprite;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

let sharedSoftRadialTexture: Texture | null = null;

const getSoftRadialTexture = () => {
  if (sharedSoftRadialTexture) return sharedSoftRadialTexture;

  const canvas = document.createElement('canvas');
  // A larger authored texture gives the long, low-alpha tail enough samples
  // to disappear without revealing the sprite's rectangular boundary on a
  // phone display. Every scene light shares this one GPU texture.
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) {
    sharedSoftRadialTexture = Texture.WHITE;
    return sharedSoftRadialTexture;
  }

  const center = canvas.width / 2;
  const gradient = context.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.78)');
  gradient.addColorStop(0.08, 'rgba(255, 255, 255, 0.68)');
  gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.48)');
  gradient.addColorStop(0.38, 'rgba(255, 255, 255, 0.25)');
  gradient.addColorStop(0.58, 'rgba(255, 255, 255, 0.1)');
  gradient.addColorStop(0.76, 'rgba(255, 255, 255, 0.032)');
  gradient.addColorStop(0.9, 'rgba(255, 255, 255, 0.006)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  sharedSoftRadialTexture = Texture.from(canvas);
  sharedSoftRadialTexture.source.scaleMode = 'linear';
  return sharedSoftRadialTexture;
};

/**
 * Builds a reusable additive light with a soft, multi-stop falloff and a small
 * neutral reflection lobe. The geometry is authored once; frame sync only
 * changes transforms, tint, and alpha.
 */
export const createSoftRadialLight = (): SoftRadialLight => {
  const root = new Container();
  const texture = getSoftRadialTexture();
  const halo = new Sprite(texture);
  const reflection = new Sprite(texture);

  root.eventMode = 'none';
  root.visible = false;
  halo.eventMode = 'none';
  halo.anchor.set(0.5);
  halo.blendMode = 'add';
  reflection.eventMode = 'none';
  reflection.anchor.set(0.5);
  reflection.blendMode = 'add';

  // The authored gradient is shared across every pooled node. Local scaling
  // creates radial or elliptical falloff without vector rings at phone size.
  halo.width = 2;
  halo.height = 2;
  reflection.width = 0.92;
  reflection.height = 0.36;
  reflection.position.set(-0.1, -0.12);
  reflection.tint = '#ffffff';

  root.addChild(halo, reflection);
  return { root, halo, reflection };
};

export const showSoftRadialLight = (
  light: SoftRadialLight,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  tint: number | string,
  alpha: number,
  reflectionStrength = 0.55
) => {
  light.root.visible = true;
  light.root.position.set(x, y);
  light.root.scale.set(Math.max(1, radiusX), Math.max(1, radiusY));
  light.root.alpha = clamp(alpha, 0, 1);
  light.halo.tint = tint;
  light.reflection.alpha = clamp(reflectionStrength, 0, 0.82);
};

export const hideSoftRadialLight = (light: SoftRadialLight) => {
  light.root.visible = false;
};
