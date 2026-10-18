import { Mesh, MeshGeometry, Texture } from 'pixi.js';

/** A full-plane background needs one sampler, not the multi-texture actor shader. */
export function createBackgroundQuad() {
  const geometry = new MeshGeometry({});
  geometry.batchMode = 'no-batch';
  const mesh = new Mesh({ geometry, texture: Texture.WHITE });
  mesh.once('destroyed', () => geometry.destroy());
  return mesh;
}
