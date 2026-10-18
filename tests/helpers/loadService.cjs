const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');

// REVAMP(G): Run the real service graph on Node versions without TS stripping.
// Explicit fixtures remain local to a loader; relative imports resolve from source.
const createServiceLoader = ({ dependencies = {}, globals = {} } = {}) => {
  const cache = new Map();
  const load = (filename) => {
    filename = path.resolve(filename);
    const candidates = [filename, `${filename}.ts`, `${filename}.tsx`, `${filename}.js`,
      `${filename}.json`, path.join(filename, 'index.ts'), path.join(filename, 'index.js')];
    filename = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!filename) throw new Error(`Cannot resolve service: ${candidates[0]}`);
    if (cache.has(filename)) return cache.get(filename).exports;
    if (filename.endsWith('.json')) return JSON.parse(fs.readFileSync(filename, 'utf8'));
    const module = { exports: {} };
    cache.set(filename, module);
    const source = fs.readFileSync(filename, 'utf8');
    const compiled = ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
    }).outputText;
    const nativeRequire = createRequire(filename);
    const localRequire = (specifier) => {
      if (Object.hasOwn(dependencies, specifier)) return dependencies[specifier];
      if (specifier.startsWith('.')) return load(path.resolve(path.dirname(filename), specifier));
      return nativeRequire(specifier);
    };
    Function('exports', 'require', 'module', '__filename', '__dirname',
      ...Object.keys(globals), compiled)(module.exports, localRequire, module,
      filename, path.dirname(filename), ...Object.values(globals));
    return module.exports;
  };
  return load;
};

module.exports = { createServiceLoader, loadService: createServiceLoader() };
