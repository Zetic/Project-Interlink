import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const retiredSourcePaths = [
  'src/app.js',
  'src/content',
  'src/core',
  'src/generator',
  'src/simulation',
  'src/workspace',
  'src/debug/fixtures',
];

function filesUnder(relativeDirectory, extension) {
  const root = path.join(repoRoot, relativeDirectory);
  const files = [];
  const visit = directory => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory)) {
      const absolute = path.join(directory, entry);
      if (statSync(absolute).isDirectory()) visit(absolute);
      else if (entry.endsWith(extension)) files.push(absolute);
    }
  };
  visit(root);
  return files;
}

function relativeModuleSpecifiers(source) {
  const specifiers = [];
  const pattern = /(?:from\s*|import\s*\(\s*)['"](\.[^'"]+)['"]/g;
  for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  return specifiers;
}

test('retired handwritten JavaScript implementation stays removed', () => {
  for (const relativePath of retiredSourcePaths) {
    assert.equal(existsSync(path.join(repoRoot, relativePath)), false, `${relativePath} should not return`);
  }
});

test('the only JavaScript under src is generated wasm-bindgen glue', () => {
  const javascript = filesUnder('src', '.js')
    .map(file => path.relative(repoRoot, file).replaceAll('\\', '/'))
    .sort();
  assert.deepEqual(javascript, ['src/wasm/interlink_wasm.js']);
  assert.equal(existsSync(path.join(repoRoot, 'src/wasm/interlink_wasm_bg.wasm')), true);
  assert.equal(existsSync(path.join(repoRoot, 'src/wasm/interlink_wasm.d.ts')), true);
});

test('active browser source is TypeScript and compiles to committed dist output', () => {
  assert.equal(existsSync(path.join(repoRoot, 'src/app.ts')), true);
  assert.equal(existsSync(path.join(repoRoot, 'dist/app.js')), true);
  const tsconfig = readFileSync(path.join(repoRoot, 'tsconfig.json'), 'utf8');
  assert.match(tsconfig, /src\/\*\*\/\*\.ts/);
  assert.match(tsconfig, /"outDir"\s*:\s*"dist"/);
});

test('remaining source and test JavaScript module references resolve', () => {
  const files = [...filesUnder('src', '.js'), ...filesUnder('tests', '.js')];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const specifier of relativeModuleSpecifiers(source)) {
      const target = path.resolve(path.dirname(file), specifier);
      const candidates = path.extname(target)
        ? [target]
        : [target, `${target}.js`, path.join(target, 'index.js')];
      assert.ok(candidates.some(candidate => existsSync(candidate)), `${path.relative(repoRoot, file)} references missing module ${specifier}`);
    }
  }
});

test('active runtime path is TypeScript controller to full Worker to one WASM world runtime', () => {
  const controller = readFileSync(path.join(repoRoot, 'src/runtime/runtimeController.ts'), 'utf8');
  const worker = readFileSync(path.join(repoRoot, 'src/runtime/fullRuntimeWorker.ts'), 'utf8');
  assert.match(controller, /new Worker\(new URL\('\.\/fullRuntimeWorker\.js'/);
  assert.match(worker, /WasmPackedWorldRuntime/);
  assert.match(worker, /runtime_protocol_version as runtimeProtocolVersion/);
  for (const stale of ['worldSimulationTick', 'simulationTick', 'simulationAdvance', 'main-thread-compiled']) {
    assert.doesNotMatch(controller, new RegExp(stale));
    assert.doesNotMatch(worker, new RegExp(stale));
  }
});

test('active documentation does not point contributors at retired source roots', () => {
  const files = ['ARCHITECTURE.md', 'README.md', '.github/copilot-instructions.md'];
  const combined = files.map(file => readFileSync(path.join(repoRoot, file), 'utf8')).join('\n');
  for (const stale of ['src/app.js', 'src/content/', 'src/core/', 'src/generator/', 'src/simulation/', 'src/workspace/']) {
    assert.doesNotMatch(combined, new RegExp(stale.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('active architecture documentation describes the single Rust Worker production authority', () => {
  const files = [
    'ARCHITECTURE.md',
    'ARCHITECTURE_PERFORMANCE.md',
    'README.md',
    'rust/README.md',
    'rust/interlink-runtime/README.md',
    '.github/copilot-instructions.md',
  ];
  const combined = files.map(file => readFileSync(path.join(repoRoot, file), 'utf8')).join('\n');
  for (const stale of [
    'The JavaScript engine remains authoritative',
    'JavaScript simulation remains production-authoritative',
    'JavaScript remains the production oracle',
    'What this PR does not cut over',
    'Rust/WASM migration started',
    'parity oracle during migration',
    'eventual authoritative Rust world',
  ]) assert.doesNotMatch(combined, new RegExp(stale));

  assert.match(combined, /WasmPackedWorldRuntime/);
  assert.match(combined, /Rust\/WASM owns physical time advancement|Rust\/WASM owns all physical time advancement|Rust\/WASM owns all time-evolving physical state/);
  assert.match(combined, /no JavaScript physics fallback|JavaScript is not a fallback physics engine|no browser-side fallback physics engine/i);
});
