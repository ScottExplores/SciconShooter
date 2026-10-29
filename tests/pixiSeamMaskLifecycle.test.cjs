const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Regression for the live crash "Cannot read properties of null (reading '0')" /
// "null is not an object (evaluating 'this.resources[e]')" on the second game runtime.
// Pixi pools alpha-mask filter effects globally; destroying a seam mask texture
// source on runtime dispose destroyed the pooled MaskFilter's bind group.

const root = path.resolve(__dirname, '..');
const environmentPath = path.join(root, 'services', 'pixi', 'PixiEnvironment.ts');
const environmentSource = fs.readFileSync(environmentPath, 'utf8');

function loadEnvironmentModule() {
  const created = [];
  class Texture {
    static from(canvas) {
      const texture = new Texture();
      texture.canvas = canvas;
      texture.destroyed = false;
      texture.source = { scaleMode: 'nearest', destroyed: false };
      texture.destroy = (destroySource) => {
        texture.destroyed = true;
        if (destroySource) texture.source.destroyed = true;
      };
      created.push(texture);
      return texture;
    }
  }
  Texture.WHITE = {};
  const context2d = {
    createLinearGradient: () => ({ addColorStop() {} }),
    fillRect() {},
    fillStyle: ''
  };
  const document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => context2d })
  };
  const transpiled = ts.transpileModule(environmentSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const moduleUnderTest = { exports: {} };
  vm.runInNewContext(transpiled, {
    module: moduleUnderTest,
    exports: moduleUnderTest.exports,
    document,
    require(request) {
      if (request === 'pixi.js') {
        return {
          BlurFilter: class BlurFilter {},
          Container: class Container {},
          Graphics: class Graphics {},
          Rectangle: class Rectangle {},
          Sprite: class Sprite {},
          Texture
        };
      }
      if (request === '../../constants') {
        return { ASSETS: new Proxy({}, { get: (_target, key) => String(key) }) };
      }
      if (request === './PixiTextureBank') return { PixiTextureBank: class PixiTextureBank {} };
      throw new Error(`Unexpected test dependency: ${request}`);
    }
  });
  return { exports: moduleUnderTest.exports, created };
}

test('seam mask textures are shared across runtimes instead of rebuilt per environment', () => {
  const { exports, created } = loadEnvironmentModule();
  const first = exports.getSeamMaskTexture(0.2);
  const again = exports.getSeamMaskTexture(0.2);
  assert.ok(first);
  assert.equal(again, first);
  assert.equal(first.source.scaleMode, 'linear');
  assert.equal(created.length, 1);
  exports.getSeamMaskTexture(0.9); // clamps to the 0.45 key
  exports.getSeamMaskTexture(0.45);
  assert.equal(created.length, 2);
});

test('environment destroy never destroys a texture that Pixi alpha masks may still reference', () => {
  const destroyBody = environmentSource.slice(environmentSource.indexOf('\n  destroy() {'));
  assert.ok(destroyBody.length > 0);
  assert.doesNotMatch(destroyBody, /seamMask\w*\.[^\n]*destroy\(/);
  assert.doesNotMatch(destroyBody, /texture\.destroy\(true\)/);
  assert.doesNotMatch(environmentSource, /private\s+readonly\s+seamMaskTextures/);
});

test('pixi destroys a bind group when a resource source is destroyed (why masks must stay alive)', async () => {
  globalThis.navigator ??= { userAgent: 'node' };
  const { BindGroup, TextureSource } = await import('pixi.js');
  const source = new TextureSource({ width: 4, height: 4 });
  const group = new BindGroup({ 0: source });
  assert.equal(group.getResource(0), source);
  source.destroy();
  assert.equal(group.resources, null);
  assert.throws(() => group.getResource(0), /null/);
});
