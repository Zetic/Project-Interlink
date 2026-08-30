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
  'src/core/materials/sampleAcquisition.js',
  'src/core/materials/species/elementalComposition.js',
  'src/core/materials/species/speciesRegistry.js',
  'src/core/processes/processDefinitions.js',
  'src/core/processes/conservation/conservation.js',
  'src/core/processes/conservation/elementalConservation.js',
  'src/core/processes/conservation/speciesConservation.js',
  'src/core/systems/systemValidation.js',
  'src/core/world/worldState.js',
  'src/core/world/model/worldState.js',
  'src/core/world/model/feature.js',
  'src/core/world/model/planet.js',
  'src/core/world/model/region.js',
  'src/core/world/model/resourceOccurrence.js',
  'src/core/world/model/site.js',
  'src/core/world/validation/index.js',
  'src/data/occurrence-families.js',
  'src/data/raw-resources.js',
  'src/data/resourceDefinitions.js',
  'src/generator/features/generateFeatures.js',
  'src/generator/planet/generatePlanet.js',
  'src/generator/regions/generateRegions.js',
  'src/generator/resources/generateResources.js',
  'src/generator/sites/generateSites.js',
  'src/simulation/apparatus/extractor.js',
  'src/simulation/apparatusDefinitions.js',
  'src/simulation/systemNode.js',
  'src/simulation/telemetry/apparatusProfiling.js',
  'src/workspace/apparatusControlUI.js',
  'src/workspace/inspectionViewModel.js',
  'src/workspace/inspector/inspectorUI.js',
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
    if (!existsSync(directory)) return;
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

function forwardingOnlyModule(source) {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .trim();
  if (!withoutComments) return false;
  const statements = withoutComments.split(/;\s*(?:\n|$)/).map(value => value.trim()).filter(Boolean);
  return statements.length > 0 && statements.every(statement => (
    /^export\s+(?:\*|\{[\s\S]*\})\s+from\s+['"][^'"]+['"]$/.test(statement)
  ));
}

test('deprecated compatibility and unused lookup modules stay removed', () => {
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
      assert.ok(candidates.some(candidate => existsSync(candidate)), `${path.relative(repoRoot, file)} references missing module ${specifier}`);
    }
  }
});

test('forwarding-only compatibility shims are not present in source', () => {
  for (const file of javascriptFilesUnder('src')) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/');
    assert.equal(forwardingOnlyModule(readFileSync(file, 'utf8')), false, `${relative} is a forwarding-only compatibility module`);
  }
});

test('standalone per-apparatus WASM browser adapters stay removed', () => {
  const forbidden = [
    'populateWasmComminutionTables',
    'populateWasmResourceOccurrence',
    'populateWasmSeparationTables',
    'populateWasmPackedGasBody',
    'populateWasmThermalGasTable',
    'populateWasmGoethiteReactionTables',
    'wasmGoethiteReactionConstructorArgs',
    'wasmRoastingFurnaceConstructorArgs',
  ];
  const combined = javascriptFilesUnder('src/simulation').map(file => readFileSync(file, 'utf8')).join('\n');
  for (const name of forbidden) assert.doesNotMatch(combined, new RegExp(name));
  assert.match(combined, /populateWasmPackedWorldRuntimeFromWorkerSetup/);
});

test('browser apparatus authoring code does not use physics-runtime terminology', () => {
  const registry = readFileSync(path.join(repoRoot, 'src/simulation/apparatus/registry.js'), 'utf8');
  const simulationEngine = readFileSync(path.join(repoRoot, 'src/simulation/simulationEngine.js'), 'utf8');
  for (const stale of ['APPARATUS_RUNTIME_REGISTRY', 'apparatusRuntimeFor', 'createApparatusRuntime', 'Unknown apparatus runtime']) {
    assert.doesNotMatch(registry, new RegExp(stale));
    assert.doesNotMatch(simulationEngine, new RegExp(stale));
  }
  assert.match(registry, /APPARATUS_NODE_FACTORY_REGISTRY/);
  assert.match(simulationEngine, /createApparatusNode/);
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
  assert.match(combined, /Rust\/WASM owns physical time advancement|Rust\/WASM owns all physical time advancement/);
  assert.match(combined, /no JavaScript physics fallback|JavaScript is not a fallback physics engine/);
});
