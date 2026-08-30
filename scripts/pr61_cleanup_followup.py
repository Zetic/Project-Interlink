from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def p(rel): return ROOT / rel
def read(rel): return p(rel).read_text()
def write(rel, text):
    p(rel).parent.mkdir(parents=True, exist_ok=True)
    p(rel).write_text(text.rstrip() + '\n')
def delete(rel):
    if p(rel).exists(): p(rel).unlink()
def sub(text, pattern, replacement, label, count=1):
    out, n = re.subn(pattern, replacement, text, count=count, flags=re.S)
    if n != count: raise RuntimeError(f'{label}: expected {count}, got {n}')
    return out

# Fix the first-pass runtime selector tail by replacing everything from the new marker to EOF.
rt = read('src/simulation/realtimeRuntime.js')
marker = '/** Rust/WASM Worker is the required production simulation runtime. */'
if marker not in rt: raise RuntimeError('Rust-only runtime selector marker missing')
rt = rt[:rt.index(marker)] + """/** Rust/WASM Worker is the required production simulation runtime. */
export function createRealtimeRuntime(world, {
  backend = REALTIME_RUNTIME_BACKENDS.RUST_WASM_WORKER,
  capabilities = browserRuntimeCapabilities(),
  workerFactory,
} = {}) {
  if (backend !== 'auto' && backend !== REALTIME_RUNTIME_BACKENDS.RUST_WASM_WORKER) {
    throw new Error(`Unsupported realtime runtime backend '${backend}'; Project Interlink requires rust-wasm-worker`);
  }
  if (!capabilities?.worker || !capabilities?.webAssembly) {
    throw new Error('Project Interlink requires a browser with Web Worker and WebAssembly support');
  }
  return createRustWasmWorkerRealtimeRuntime(world, { capabilities, workerFactory });
}
"""
write('src/simulation/realtimeRuntime.js', rt)

# Boundary transfers remain canonical topology only; Rust owns actual transfer execution.
write('src/simulation/boundaryTransfer.js', """
export function validateBoundaryTransfer(transfer) {
  if (!transfer || typeof transfer !== 'object' || Array.isArray(transfer)) {
    throw new Error('Boundary transfer must be an object');
  }
  if (!transfer.id || typeof transfer.id !== 'string') {
    throw new Error('Boundary transfer id must be a non-empty string');
  }
  if (!transfer.sourceNodeId || !transfer.targetNodeId) {
    throw new Error('Boundary transfer must reference source and target node IDs');
  }
  if (transfer.sourceNodeId === transfer.targetNodeId) {
    throw new Error('Boundary transfer source and target must be different nodes');
  }
  if (!Number.isFinite(transfer.maxRateKgPerSecond) || transfer.maxRateKgPerSecond < 0) {
    throw new Error('Boundary transfer maxRateKgPerSecond must be finite and non-negative');
  }
  if (transfer.enabled != null && typeof transfer.enabled !== 'boolean') {
    throw new Error('Boundary transfer enabled must be boolean');
  }
  return true;
}
""")

# Constructor registry remains useful to browser authoring, but it has no execution phases/simulate callbacks.
write('src/simulation/apparatus/registry.js', """
import { createExtractor } from './extractor.js';
import { createFeeder } from './feeder.js';
import { createMaterialMerger } from './merger.js';
import { createCrusher } from './crusher.js';
import { createJawCrusher, createConeCrusher, createBallMill } from './comminution.js';
import { createScreen } from './screen.js';
import { createSplitter } from './splitter.js';
import { createMagneticSeparator } from './magneticSeparator.js';
import { createRoastingFurnace } from './roastingFurnace.js';
import { createExhaustVent } from './exhaustVent.js';
import { createHopper } from '../hopperNode.js';
import { apparatusPortsForNode } from '../../content/apparatus/definitions.js';

export const APPARATUS_RUNTIME_REGISTRY = Object.freeze({
  extractor: Object.freeze({ create: createExtractor }),
  hopper: Object.freeze({ create: createHopper }),
  merger: Object.freeze({ create: createMaterialMerger }),
  feeder: Object.freeze({ create: createFeeder }),
  crusher: Object.freeze({ create: createCrusher }),
  jawCrusher: Object.freeze({ create: createJawCrusher }),
  coneCrusher: Object.freeze({ create: createConeCrusher }),
  ballMill: Object.freeze({ create: createBallMill }),
  screen: Object.freeze({ create: createScreen }),
  splitter: Object.freeze({ create: createSplitter }),
  magSep: Object.freeze({ create: createMagneticSeparator }),
  roastingFurnace: Object.freeze({ create: createRoastingFurnace }),
  exhaustVent: Object.freeze({ create: createExhaustVent }),
});

export function apparatusRuntimeFor(nodeType) {
  return APPARATUS_RUNTIME_REGISTRY[nodeType] ?? null;
}

export function createApparatusRuntime(nodeType, parameters) {
  const entry = apparatusRuntimeFor(nodeType);
  if (!entry?.create) throw new Error(`Unknown apparatus runtime '${nodeType}'`);
  const node = entry.create(parameters);
  node.ports = apparatusPortsForNode(nodeType, node);
  return node;
}

export function registeredApparatusNodeTypes() {
  return Object.keys(APPARATUS_RUNTIME_REGISTRY);
}
""")

# Generic Inspector recognizes authorable apparatus by constructor registration, not obsolete simulate callbacks.
generic = read('src/workspace/inspector/genericApparatusInspectorUI.js')
generic = generic.replace("if (!node || !definition || typeof runtime?.simulate !== 'function') continue;", "if (!node || !definition || typeof runtime?.create !== 'function') continue;")
write('src/workspace/inspector/genericApparatusInspectorUI.js', generic)

# Minimal packed setup state still exposes compiler-facing length/columns; it performs no physics.
prs = read('src/simulation/packedRuntimeState.js')
prs = prs.replace("  constructor() { this.rows = new Map(); }", "  constructor() { this.rows = new Map(); }\n  get length() { return this.rows.size; }")
write('src/simulation/packedRuntimeState.js', prs)

# Remove stale debug UI for deleted JS profiling/headless benchmark and make Rust authority visible immediately.
shell = read('src/workspace/shell/workspaceUI.js')
shell = shell.replace('<div class="ws-debug-metric"><span>Profiled apparatus CPU/tick</span><span data-debug-stat="apparatus-cpu-tick">profiling off</span></div>\n        <label class="ws-debug-check"><input id="ws-debug-deep-profile" type="checkbox"> Deep apparatus profiling</label>\n', '<div class="ws-debug-metric"><span>Physics engine</span><span data-debug-stat="apparatus-cpu-tick">Rust/WASM</span></div>\n')
shell = shell.replace('<div class="ws-debug-metric"><span>Production backend</span><span data-debug-stat="runtime-backend">Compiled JS</span></div>', '<div class="ws-debug-metric"><span>Production backend</span><span data-debug-stat="runtime-backend">Rust/WASM Worker</span></div>')
shell = shell.replace('<div class="ws-debug-metric"><span>Material bodies</span><span data-debug-stat="bodies">0</span></div>\n        <div class="ws-debug-metric"><span>Solid/gas populations</span><span data-debug-stat="populations">0</span></div>\n        <div class="ws-debug-metric"><span>Texture profiles</span><span data-debug-stat="textures">0</span></div>\n', '')
shell = shell.replace('<section class="ws-debug-section"><div class="ws-debug-section-title">Hotspots</div><div data-debug-hotspots><div class="ws-debug-muted">Enable deep profiling to collect apparatus hotspots.</div></div></section>\n', '')
shell = shell.replace('        <div class="ws-debug-note">Visible placement uses the selected goethite-bearing iron Feature when possible, otherwise the first compatible Feature in the Site. The headless benchmark uses Canonical Iron Ore v1.</div>\n        <div class="ws-debug-button-row"><button data-debug-action="place-factories" type="button">Place Factory</button><button data-debug-action="benchmark" type="button">Run Headless Benchmark</button></div>\n', '        <div class="ws-debug-note">Visible placement uses the selected goethite-bearing iron Feature when possible, otherwise the first compatible Feature in the Site. Test factories run through the live Rust/WASM Worker.</div>\n        <div class="ws-debug-button-row"><button data-debug-action="place-factories" type="button">Place Factory</button></div>\n')
shell = shell.replace('        <pre id="ws-debug-benchmark-result" class="ws-debug-benchmark-result">No benchmark run yet.</pre>\n', '')
write('src/workspace/shell/workspaceUI.js', shell)

# Debug metrics must not infer Rust populations from stale canonical browser objects.
dbg = read('src/workspace/debug/debugDrawer.js')
dbg = sub(dbg, r"function solidBodyStats\(body\).*?function collectSimulationStats\(\) \{", "function collectSimulationStats() {", 'remove stale browser material population counters')
dbg = sub(dbg, r"    bodies: 0,\n    populations: 0,\n    textureProfiles: 0,\n", "", 'remove stale simulation counters')
dbg = sub(dbg, r"      if \(node\?\.materialBody\).*?      if \(node\?\.nodeType === 'exhaustVent'.*?\n      \}", "      if (node?.nodeType === 'roastingFurnace') {\n        totals.furnaces += 1;\n        totals.solverEvaluations += node.lastSolverEvaluationCount ?? 0;\n      }", 'remove canonical retained-body inspection')
dbg = dbg.replace("  setText(root, 'bodies', String(simulation.bodies));\n  setText(root, 'populations', String(simulation.populations));\n  setText(root, 'textures', String(simulation.textureProfiles));\n", "")
dbg = dbg.replace("  renderHotspots(root);\n", "")
dbg = sub(dbg, r"function renderHotspots\(root\) \{.*?\n\}\n\n", "", 'remove deleted hotspot section')
dbg = dbg.replace("    else if (action === 'benchmark') status(root, 'Legacy JavaScript benchmark removed. Use live Rust/WASM test factories.', true);\n", "")
write('src/workspace/debug/debugDrawer.js', dbg)

# Registry extractor legacy port declaration is normalized by registry, but make direct construction consistent too.
extractor = read('src/simulation/extractorNode.js')
extractor = extractor.replace("label: 'material out'", "label: 'output'")
write('src/simulation/extractorNode.js', extractor)

# Architecture guard should accept the local runtime alias used by debug stepping.
arch = read('tests/rustOnlyRuntimeArchitecture.test.js')
arch = arch.replace("assert.match(source, /realtimeRuntime\\.advanceFixedSteps/);", "assert.match(source, /advanceFixedSteps/);")
write('tests/rustOnlyRuntimeArchitecture.test.js', arch)

# Old architecture test specifically described a JavaScript physics/process layer; the Rust-only test supersedes it.
delete('tests/architectureBoundaries.test.js')
delete('tests/thermochemicalInspector.test.js')

# Keep canonical apparatus control contract; delete only the JS magnetic-physics parity test.
write('tests/apparatusCanonicalControls.test.js', """
import test from 'node:test';
import assert from 'node:assert/strict';
import { APPARATUS_DEFINITIONS } from '../src/content/apparatus/definitions.js';
import { getProcessDefinition } from '../src/core/processes/definitions/index.js';

test('canonical apparatus defaults are process-definition values, not duplicated UI physics constants', () => {
  for (const definition of Object.values(APPARATUS_DEFINITIONS)) {
    if (!definition.processId) continue;
    const process = getProcessDefinition(definition.processId);
    for (const parameter of process.parameters ?? []) {
      assert.equal(definition.defaults[parameter.id], parameter.defaultValue, `${definition.nodeType}.${parameter.id}`);
    }
  }
});
""")

# Resource-access tests now cover only browser graph authoring; extraction physics is covered by Rust.
write('tests/extractorResourceAccess.test.js', """
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blueprintAddExtractor, blueprintAddFeatureSource, blueprintConnect, blueprintDisconnect,
  checkBlueprintConnection, createBlueprint, _resetOrdinals,
} from '../src/simulation/simulationEngine.js';
import { nodeDefinitionById } from '../src/workspace/nodeCatalog.js';

function occurrence(id, featureId) { return { id, sourceId: featureId }; }
function addSource(blueprint, item) {
  return blueprintAddFeatureSource(blueprint, { featureId: item.sourceId, resourceOccurrenceIds: [item.id] });
}

test('NODE catalog places Extractors unbound and the resource-access edge selects the source occurrence', () => {
  _resetOrdinals();
  const blueprint = createBlueprint();
  const basalt = occurrence('occ-basalt', 'feature-basalt');
  const source = addSource(blueprint, basalt);
  const extractor = nodeDefinitionById('extractor').create(blueprint, { occurrenceId: 'ignored' });
  assert.equal(extractor.requestedOccurrenceId, null);
  const access = blueprintConnect(blueprint, source.id, source.resourceAccessPortId, extractor.id, extractor.sourceInputPortId);
  assert.equal(access.occurrenceId, basalt.id);
  assert.equal(extractor.occurrenceId, basalt.id);
});

test('an Extractor can be disconnected and reused on a different resource source', () => {
  const blueprint = createBlueprint();
  const a = addSource(blueprint, occurrence('occ-a', 'feature-a'));
  const b = addSource(blueprint, occurrence('occ-b', 'feature-b'));
  const extractor = blueprintAddExtractor(blueprint);
  const first = blueprintConnect(blueprint, a.id, a.resourceAccessPortId, extractor.id, extractor.sourceInputPortId);
  blueprintDisconnect(blueprint, first.id);
  assert.equal(extractor.occurrenceId, null);
  const second = blueprintConnect(blueprint, b.id, b.resourceAccessPortId, extractor.id, extractor.sourceInputPortId);
  assert.equal(second.occurrenceId, 'occ-b');
});

test('Feature sources with multiple occurrences require explicit edge selection', () => {
  const blueprint = createBlueprint();
  const source = blueprintAddFeatureSource(blueprint, { featureId: 'feature-mixed', resourceOccurrenceIds: ['occ-a', 'occ-b'] });
  const extractor = blueprintAddExtractor(blueprint);
  const ambiguous = checkBlueprintConnection(blueprint, source.id, source.resourceAccessPortId, extractor.id, extractor.sourceInputPortId);
  assert.equal(ambiguous.ok, false);
  const selected = blueprintConnect(blueprint, source.id, source.resourceAccessPortId, extractor.id, extractor.sourceInputPortId, { occurrenceId: 'occ-b' });
  assert.equal(selected.occurrenceId, 'occ-b');
});
""")

# Keep concrete species/generation coverage; old batch-process execution is gone.
write('tests/materialSpeciesCoverage.test.js', """
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/core/world/worldState.js';
import { MATERIAL_FORMS, physicalFormForOccurrence } from '../src/core/materials/materialForms.js';
import { getMaterialSpecies, listMaterialSpecies } from '../src/core/materials/materialSpecies.js';

const PLACEHOLDER_IDS = new Set(['quartzAndGangue', 'gangue-mixture', 'gangue', 'ironOxides', 'other']);

test('material species registry contains concrete species only with explicit magnetic-response data', () => {
  for (const item of listMaterialSpecies()) {
    assert.notEqual(item.kind, 'pseudo-species');
    assert.equal(PLACEHOLDER_IDS.has(item.id), false);
    const coefficient = item.physicalProperties?.magneticResponse?.normalizedSeparationCoefficient;
    assert.equal(typeof coefficient, 'number');
    assert.ok(Number.isFinite(coefficient) && coefficient >= 0 && coefficient <= 1);
  }
});

test('generated solid ResourceOccurrences always use registered concrete constituents', () => {
  let count = 0;
  for (let i = 0; i < 60; i++) {
    const world = createWorld(`solid-species-world-${i}`);
    for (const occurrence of Object.values(world.resourceOccurrences)) {
      if (physicalFormForOccurrence(occurrence) !== MATERIAL_FORMS.SOLID_PARTICULATE) continue;
      count++;
      for (const constituentId of Object.keys(occurrence.composition ?? {})) {
        assert.equal(PLACEHOLDER_IDS.has(constituentId), false);
        assert.ok(getMaterialSpecies(constituentId));
      }
    }
  }
  assert.ok(count > 0);
});
""")

# Core material authoring/serialization remains JS; physical process execution does not.
write('tests/solidMaterialState.test.js', """
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/core/world/worldState.js';
import { createSolidMaterialBodyFromOccurrence } from '../src/core/materials/occurrenceMaterialization.js';
import {
  addSolidMaterialState, createSolidMaterialState, summarizeSolidMaterialByLiberationClass,
  summarizeSolidMaterialBySizeBin, summarizeSolidMaterialBySpecies, totalSolidQuantity,
  withdrawSolidMaterialState, SOLID_MATERIAL_TOLERANCE, validateSolidMaterialState,
} from '../src/core/materials/solidMaterialState.js';
import { particleSizeBinIdForMm } from '../src/core/materials/particleSizeBins.js';

const TOL = 1e-9;
const close = (a, b) => assert.ok(Math.abs(a - b) <= TOL, `${a} != ${b}`);
function findOccurrence(resourceId) {
  for (let i = 0; i < 250; i++) {
    const world = createWorld(`solid-material-${resourceId}-${i}`);
    const occurrence = Object.values(world.resourceOccurrences).find(item => item.resourceId === resourceId && item.composition);
    if (occurrence) return occurrence;
  }
  throw new Error(`Could not find ${resourceId}`);
}

test('solid material state merges identical descriptors and summarizes sparse populations', () => {
  const state = createSolidMaterialState([
    { speciesId: 'hematite', sizeBinId: '5-15mm', liberationClassId: 'locked', quantity: 2 },
    { speciesId: 'hematite', sizeBinId: '5-15mm', liberationClassId: 'locked', quantity: 3 },
    { speciesId: 'hematite', sizeBinId: '15-25mm', liberationClassId: 'locked', quantity: 4 },
    { speciesId: 'hematite', sizeBinId: '5-15mm', liberationClassId: 'liberated', quantity: 5 },
    { speciesId: 'quartz', sizeBinId: '5-15mm', liberationClassId: 'liberated', quantity: SOLID_MATERIAL_TOLERANCE / 2 },
  ]);
  assert.equal(totalSolidQuantity(state), 14);
  assert.deepEqual(summarizeSolidMaterialBySpecies(state), { hematite: 14 });
  assert.deepEqual(summarizeSolidMaterialBySizeBin(state), { '5-15mm': 10, '15-25mm': 4 });
  assert.deepEqual(summarizeSolidMaterialByLiberationClass(state), { locked: 9, liberated: 5 });
});

test('canonical sparse add/withdraw utilities conserve mass for authoring and serialization', () => {
  const source = createSolidMaterialState([
    { speciesId: 'hematite', sizeBinId: '5-15mm', liberationClassId: 'partial', quantity: 20 },
    { speciesId: 'quartz', sizeBinId: '1-5mm', liberationClassId: 'liberated', quantity: 10 },
  ]);
  const initial = totalSolidQuantity(source);
  const copy = createSolidMaterialState();
  addSolidMaterialState(copy, source, 0.5);
  close(totalSolidQuantity(copy), 15);
  const withdrawn = withdrawSolidMaterialState(source, 9);
  close(totalSolidQuantity(source) + totalSolidQuantity(withdrawn), initial);
});

test('occurrence materialization preserves concrete composition in canonical packed-ready state', () => {
  const occurrence = findOccurrence('iron-ore');
  const body = createSolidMaterialBodyFromOccurrence(occurrence, 10);
  close(totalSolidQuantity(body.solidState), 10);
  assert.ok(Object.keys(summarizeSolidMaterialBySpecies(body.solidState)).length > 1);
});

test('particle-size boundary lookup keeps canonical cut semantics', () => {
  assert.equal(particleSizeBinIdForMm(1), 'lt-1mm');
  assert.equal(particleSizeBinIdForMm(5), '1-5mm');
  assert.equal(particleSizeBinIdForMm(25), '15-25mm');
  assert.equal(particleSizeBinIdForMm(120), '60-120mm');
});

test('serialized solid fraction keys reject malformed descriptors', () => {
  assert.throws(() => validateSolidMaterialState({ fractions: { 'hematite|5-15mm': 1 } }), /exactly 3 segments/);
  assert.throws(() => validateSolidMaterialState({ fractions: { 'hematite||locked': 1 } }), /empty segments/);
});
""")

# Inspector tests retain authoring/presentation behavior; live physics projection is covered by runtimePresentation tests.
write('tests/inspectionViewModel.test.js', """
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBlueprint, blueprintAddFeatureSource, blueprintAddExtractor, blueprintAddMagSep,
  blueprintConnect, setApparatusParameter,
} from '../src/simulation/simulationEngine.js';
import { createBoundaryBuffer } from '../src/simulation/hopperNode.js';
import { createMaterialStream } from '../src/simulation/materialStream.js';
import { hopperInspection, streamInspection, connectionInspection, featureInspection, machineInspection } from '../src/workspace/inspectionViewModel.js';

test('hopper and boundary inspection exposes canonical initial composition and particle size', () => {
  const hopper = createBoundaryBuffer({ id: 'site-export', capacityKg: 10, role: 'export', initialComponentsKg: { hematite: 3, quartz: 1 }, initialParticleSizeMm: 12 });
  const details = hopperInspection(hopper);
  assert.equal(details.storedMassKg, 4);
  assert.equal(details.freeCapacityKg, 6);
});

test('stream inspection remains a presentation model independent of physics execution', () => {
  const details = streamInspection(createMaterialStream({ id: 's', sourceNodeId: 'a', sourcePortId: 'out', targetNodeId: 'b', targetPortId: 'in', componentMassFlowKgPerSecond: { hematite: 2 }, particleSizeMm: 8 }));
  assert.equal(details.totalFlowKgPerSecond, 2);
});

test('resource-access inspection is a relationship and never invents material flow', () => {
  const blueprint = createBlueprint();
  const source = blueprintAddFeatureSource(blueprint, { featureId: 'feature', resourceOccurrenceIds: ['iron'] });
  const extractor = blueprintAddExtractor(blueprint, 'iron');
  const access = blueprintConnect(blueprint, source.id, source.resourceAccessPortId, extractor.id, extractor.sourceInputPortId);
  const details = connectionInspection(blueprint, access);
  assert.equal(details.kind, 'relationship');
  assert.equal(details.totalFlowKgPerSecond, 0);
});

test('Feature inspection exposes structured occurrence metadata', () => {
  const world = { features: { feature: { id: 'feature', name: 'Formation', type: 'Mineral Deposit', resourceOccurrences: ['iron'] } }, resourceOccurrences: { iron: { id: 'iron', resourceId: 'iron-ore', name: 'Iron Ore', composition: { hematite: 60, quartz: 40 } } } };
  const blueprint = createBlueprint();
  const node = blueprintAddFeatureSource(blueprint, { featureId: 'feature', resourceOccurrenceIds: ['iron'] });
  assert.equal(featureInspection(world, blueprint, node).resources[0].name, 'Iron Ore');
});

test('machine inspection projects committed apparatus configuration without executing physics', () => {
  const blueprint = createBlueprint();
  const separator = blueprintAddMagSep(blueprint);
  setApparatusParameter(blueprint, separator.id, 'fieldStrength', 0.8);
  const details = machineInspection(blueprint, separator);
  assert.equal(details.fieldStrength, 0.8);
});
""")

write('tests/nodeRemoval.test.js', """
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blueprintAddFeatureSource, blueprintAddHopper, blueprintAddCrusher, blueprintAddExtractor,
  blueprintAddMagSep, blueprintConnect, createBlueprint, createBlueprintLayout,
} from '../src/simulation/simulationEngine.js';
import { HOPPER_TOLERANCE_KG } from '../src/simulation/hopperNode.js';
import { canRemoveNode, nodeOwnedMatterKg, nodeRemovalEligibility, removeBlueprintNode } from '../src/workspace/nodeRemoval.js';

test('empty player-authored node removal clears layout, connections, and material streams', () => {
  const blueprint = createBlueprint(); const layout = createBlueprintLayout();
  const input = blueprintAddHopper(blueprint); const crusher = blueprintAddCrusher(blueprint);
  layout.nodePositions[crusher.id] = { x: 1, y: 1 };
  const connection = blueprintConnect(blueprint, input.id, input.outputPortId, crusher.id, crusher.inputPortId);
  assert.equal(removeBlueprintNode(blueprint, layout, crusher.id).removed, true);
  assert.equal(blueprint.connections[connection.id], undefined);
});

test('Rust-owned Hopper matter blocks removal above the physical tolerance', () => {
  const blueprint = createBlueprint(); const layout = createBlueprintLayout(); const hopper = blueprintAddHopper(blueprint);
  hopper.runtimePresentation = { authority: 'rust-wasm-worker', storedMassKg: 2 };
  assert.equal(nodeOwnedMatterKg(hopper), 2);
  assert.equal(canRemoveNode(blueprint, hopper.id), false);
  assert.equal(removeBlueprintNode(blueprint, layout, hopper.id).removed, false);
  hopper.runtimePresentation.storedMassKg = HOPPER_TOLERANCE_KG / 2;
  assert.equal(canRemoveNode(blueprint, hopper.id), true);
});

test('Feature and Site boundary nodes are not removable through player policy', () => {
  const blueprint = createBlueprint(); const feature = blueprintAddFeatureSource(blueprint, { featureId: 'feature' }); const boundary = blueprintAddHopper(blueprint);
  boundary.boundaryRole = 'import'; boundary.systemType = 'boundary-buffer';
  assert.equal(nodeRemovalEligibility(blueprint, feature).removable, false);
  assert.equal(nodeRemovalEligibility(blueprint, boundary).removable, false);
});

test('current player-placeable apparatus are removable when Rust reports them empty', () => {
  const blueprint = createBlueprint();
  for (const node of [blueprintAddHopper(blueprint), blueprintAddCrusher(blueprint), blueprintAddExtractor(blueprint, 'occ'), blueprintAddMagSep(blueprint)]) {
    assert.equal(canRemoveNode(blueprint, node.id), true);
  }
});
""")

# Compiler tests keep JS->Rust setup semantics, not JS physics parity.
pc = read('tests/packedComminutionCompiler.test.js')
pc = pc.replace("  summarizeSolidMaterialBySizeBin,\n", "")
pc = pc.replace("import { millSolidMaterialState } from '../src/core/processes/physics/comminution.js';\n", "")
pc = sub(pc, r"\ntest\('production Ball Mill reference PSD used by Rust parity remains unchanged'.*?\n\}\);", "", 'remove JS comminution parity test')
write('tests/packedComminutionCompiler.test.js', pc)

ps = read('tests/packedSeparationCompiler.test.js')
ps = ps.replace("  summarizeSolidMaterialBySizeBin,\n  totalSolidQuantity,\n", "")
ps = ps.replace("import { magneticRecoveryForFraction } from '../src/core/processes/physics/magneticSeparation.js';\n", "")
ps = ps.replace("import { splitScreenedSolidState } from '../src/core/processes/physics/screening.js';\n", "")
ps = sub(ps, r"\ntest\('compiler metadata pins the production magnetic recovery curve used by Rust parity tests'.*", "", 'remove JS separation parity tests')
write('tests/packedSeparationCompiler.test.js', ps)

pr = read('tests/packedRoastingCompiler.test.js')
pr = pr.replace("  iterateSolidFractions,\n", "")
pr = pr.replace("import { applyGoethiteDehydroxylation } from '../src/core/processes/physics/thermochemicalReactions.js';\n", "")
pr = sub(pr, r"\ntest\('production thermochemical kernel remains the numerical and energy-balance oracle'.*?\n\}\);", "", 'remove JS thermochemistry parity test')
write('tests/packedRoastingCompiler.test.js', pr)

# Runtime capability/realtime tests now encode required Worker+WASM support instead of fallback behavior.
write('tests/runtimeCapabilities.test.js', """
import test from 'node:test';
import assert from 'node:assert/strict';
import { browserRuntimeCapabilities, recommendedRuntimeBackend } from '../src/simulation/runtimeCapabilities.js';

test('runtime capability report detects Worker and WebAssembly', () => {
  const capabilities = browserRuntimeCapabilities({ Worker: class {}, WebAssembly, navigator: { hardwareConcurrency: 8 } });
  assert.equal(capabilities.worker, true);
  assert.equal(capabilities.webAssembly, true);
  assert.equal(capabilities.hardwareConcurrency, 8);
});

test('runtime policy reports unsupported instead of selecting JavaScript fallback', () => {
  assert.deepEqual(recommendedRuntimeBackend({ worker: false, webAssembly: false, wasmThreads: false, webGpu: false }), {
    supported: false, simulationThread: 'unavailable', numericCore: 'unavailable', cpuParallelism: 'unavailable', gpuCompute: 'cpu',
  });
});

test('runtime policy reports Rust/WASM Worker when required browser capabilities exist', () => {
  assert.deepEqual(recommendedRuntimeBackend({ worker: true, webAssembly: true, wasmThreads: true, webGpu: true }), {
    supported: true, simulationThread: 'worker', numericCore: 'rust-wasm', cpuParallelism: 'shared-memory-workers', gpuCompute: 'webgpu-available',
  });
});
""")

write('tests/realtimeRuntime.test.js', """
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealtimeRuntime, REALTIME_RUNTIME_BACKENDS } from '../src/simulation/realtimeRuntime.js';
import { RUNTIME_EVENT_TYPES, createRuntimeEvent } from '../src/simulation/runtimeProtocol.js';

const world = () => ({ sites: {}, regions: {}, features: {}, resourceOccurrences: {}, systemNodes: {} });
const capabilities = () => ({ worker: true, hardwareConcurrency: 2, webAssembly: true, wasmSimd: true, sharedArrayBuffer: false, crossOriginIsolated: false, wasmThreads: false, webGpu: false, offscreenCanvas: false });

test('unsupported browsers fail instead of selecting a JavaScript simulation backend', () => {
  assert.throws(() => createRealtimeRuntime(world(), { capabilities: { worker: false, webAssembly: true } }), /requires a browser with Web Worker and WebAssembly support/);
  assert.throws(() => createRealtimeRuntime(world(), { capabilities: { worker: true, webAssembly: false } }), /requires a browser with Web Worker and WebAssembly support/);
});

test('auto selects the only production backend: rust-wasm-worker', async () => {
  const worker = { addEventListener() {}, postMessage() {}, terminate() {} };
  const runtime = createRealtimeRuntime(world(), { workerFactory: () => worker, capabilities: capabilities() });
  const pending = runtime.ready.catch(error => error);
  assert.equal(runtime.backend, REALTIME_RUNTIME_BACKENDS.RUST_WASM_WORKER);
  runtime.dispose();
  assert.match((await pending).message, /disposed/);
});

test('non-Rust backend requests are rejected', () => {
  assert.throws(() => createRealtimeRuntime(world(), { backend: 'main-thread-compiled', capabilities: capabilities() }), /requires rust-wasm-worker/);
});

test('Worker crash is terminal', async () => {
  const listeners = new Map(); let terminated = false;
  const worker = { addEventListener: (type, cb) => listeners.set(type, cb), postMessage: () => queueMicrotask(() => listeners.get('error')?.({ message: 'crash' })), terminate: () => { terminated = true; } };
  const runtime = createRealtimeRuntime(world(), { capabilities: capabilities(), workerFactory: () => worker });
  await assert.rejects(runtime.ready, /crash/); assert.equal(runtime.running, false); assert.equal(terminated, true);
});

test('Worker protocol ERROR is terminal', async () => {
  const listeners = new Map(); let terminated = false;
  const worker = { addEventListener: (type, cb) => listeners.set(type, cb), postMessage: () => queueMicrotask(() => listeners.get('message')?.({ data: createRuntimeEvent(RUNTIME_EVENT_TYPES.ERROR, { message: 'wasm failed' }) })), terminate: () => { terminated = true; } };
  const runtime = createRealtimeRuntime(world(), { capabilities: capabilities(), workerFactory: () => worker });
  await assert.rejects(runtime.ready, /wasm failed/); assert.equal(runtime.running, false); assert.equal(terminated, true);
});
""")

rp = read('tests/runtimePresentation.test.js')
rp = rp.replace("  clearRustWorkerRuntimePresentation,\n", "")
rp = sub(rp, r"\ntest\('clearing Worker presentation restores scalar helpers to canonical browser state'.*", "", 'remove fallback presentation test')
write('tests/runtimePresentation.test.js', rp)

# Old debug test asserted the deleted JS profiler. Keep fixture/debug-shell coverage for the Rust-only tools.
write('tests/debugTools.test.js', """
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRoastingBenchmarkFixture } from '../src/debug/fixtures/roastingBenchmark.js';
import { workspaceShellMarkup } from '../src/workspace/shell/workspaceUI.js';

test('test factory fixture still builds canonical graph topology for live Rust/WASM testing', () => {
  const fixture = createRoastingBenchmarkFixture({ count: 1 });
  assert.ok(Object.keys(fixture.blueprint.nodes).length > 0);
  assert.ok(Object.keys(fixture.blueprint.connections).length > 0);
});

test('debug shell exposes Rust Worker stepping and no legacy JS profiler or headless benchmark', () => {
  const markup = workspaceShellMarkup({ canvasId: 'c', svgId: 's', inspectorBodyId: 'i' });
  assert.match(markup, /Rust\/WASM Worker/);
  assert.match(markup, /\+0\.1 s/);
  assert.doesNotMatch(markup, /Deep apparatus profiling|Run Headless Benchmark|Compiled JS/);
  const source = readFileSync(new URL('../src/workspace/debug/debugDrawer.js', import.meta.url), 'utf8');
  assert.match(source, /advanceFixedSteps/);
  assert.doesNotMatch(source, /simulationTick|worldSimulationTick|performanceTelemetry/);
});
""")

print('PR61 follow-up cleanup fixes applied')
