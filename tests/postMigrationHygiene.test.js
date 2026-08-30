import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const removedCompatibilityPaths = [
  'src/core/materials/liberationClasses.js',
  'src/core/materials/materialSpecies.js',
  'src/core/materials/particleSizeBins.js',
  'src/core/materials/solidMaterialState.js',
  'src/core/processes/processDefinitions.js',
  'src/data/occurrence-families.js',
  'src/data/raw-resources.js',
  'src/data/resourceDefinitions.js',
  'src/simulation/apparatusDefinitions.js',
  'src/simulation/systemNode.js',
  'src/simulation/telemetry/apparatusProfiling.js',
  'src/workspace/inspectionViewModel.js',
  'src/workspace/navigationProjection.js',
  'src/workspace/nodeCatalog.js',
  'src/workspace/nodePlacement.js',
  'src/workspace/nodePresentation.js',
  'src/workspace/nodeRemoval.js',
  'src/workspace/viewport.js',
  'src/workspace/workspaceGraph.js',
  'src/workspace/workspaceUI.js',
];

function javascriptFilesUnder(relativeDirectory) {
  const root = path.join(repoRoot, relativeDirectory);
  const files = [];
  const visit = directory => {
    for (const entry of readdirSync(directory)) {
      const absolute = path.join(directory, entry);
      if (statSync(absolute).isDirectory()) visit(absolute);
      else if (entry.endsWith('.js')) files.push(absolute);
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

test('deprecated single-hop compatibility modules stay removed', () => {
  for (const relativePath of removedCompatibilityPaths) {
    assert.equal(existsSync(path.join(repoRoot, relativePath)), false, `${relativePath} should not return`);
  }
});

test('source and test relative JavaScript module references resolve', () => {
  const files = [...javascriptFilesUnder('src'), ...javascriptFilesUnder('tests')];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const specifier of relativeModuleSpecifiers(source)) {
      const target = path.resolve(path.dirname(file), specifier);
      const candidates = path.extname(target)
        ? [target]
        : [target, `${target}.js`, path.join(target, 'index.js')];
      assert.ok(
        candidates.some(candidate => existsSync(candidate)),
        `${path.relative(repoRoot, file)} references missing module ${specifier}`,
      );
    }
  }
});

test('browser apparatus authoring code does not use physics-runtime terminology', () => {
  const registry = readFileSync(path.join(repoRoot, 'src/simulation/apparatus/registry.js'), 'utf8');
  const simulationEngine = readFileSync(path.join(repoRoot, 'src/simulation/simulationEngine.js'), 'utf8');
  for (const stale of [
    'APPARATUS_RUNTIME_REGISTRY',
    'apparatusRuntimeFor',
    'createApparatusRuntime',
    'Unknown apparatus runtime',
  ]) {
    assert.doesNotMatch(registry, new RegExp(stale));
    assert.doesNotMatch(simulationEngine, new RegExp(stale));
  }
  assert.match(registry, /APPARATUS_NODE_FACTORY_REGISTRY/);
  assert.match(simulationEngine, /createApparatusNode/);
});

test('active architecture documentation describes Rust Worker production authority', () => {
  const architecture = readFileSync(path.join(repoRoot, 'ARCHITECTURE_PERFORMANCE.md'), 'utf8');
  const rustReadme = readFileSync(path.join(repoRoot, 'rust/README.md'), 'utf8');
  const runtimeReadme = readFileSync(path.join(repoRoot, 'rust/interlink-runtime/README.md'), 'utf8');
  const combined = `${architecture}\n${rustReadme}\n${runtimeReadme}`;

  for (const stale of [
    'The JavaScript engine remains authoritative',
    'JavaScript simulation remains production-authoritative',
    'JavaScript remains the production oracle',
    'What this PR does not cut over',
    'Rust/WASM migration started',
  ]) {
    assert.doesNotMatch(combined, new RegExp(stale));
  }

  assert.match(architecture, /Rust\/WASM owns all physical time advancement/);
  assert.match(rustReadme, /production physical simulation is owned by Rust compiled to WebAssembly/);
  assert.match(runtimeReadme, /JavaScript is not a fallback physics engine/);
});
