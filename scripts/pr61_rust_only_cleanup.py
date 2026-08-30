from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def path(rel):
    return ROOT / rel

def read(rel):
    return path(rel).read_text()

def write(rel, text):
    p = path(rel)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text.rstrip() + "\n")

def delete(rel):
    p = path(rel)
    if p.exists():
        p.unlink()

def replace_required(text, old, new, label, count=1):
    if old not in text:
        raise RuntimeError(f"missing patch anchor: {label}")
    return text.replace(old, new, count)

def regex_required(text, pattern, replacement, label, count=1):
    result, n = re.subn(pattern, replacement, text, count=count, flags=re.S)
    if n != count:
        raise RuntimeError(f"expected {count} replacement(s) for {label}, got {n}")
    return result

# ---------------------------------------------------------------------------
# Rust/WASM is the only production simulation backend.
# ---------------------------------------------------------------------------
rt = read('src/simulation/realtimeRuntime.js')
rt = regex_required(
    rt,
    r"import \{\n  createWorldSimulation,\n  pauseWorldSimulation,\n  resumeWorldSimulation,\n  worldSimulationTick,\n\} from './worldSimulation\.js';\n",
    "",
    'remove JS world runtime imports',
)
rt = replace_required(
    rt,
    "export const REALTIME_RUNTIME_BACKENDS = Object.freeze({\n  MAIN_THREAD: 'main-thread-compiled',\n  WORKER: 'worker',\n  RUST_WASM_WORKER: 'rust-wasm-worker',\n});",
    "export const REALTIME_RUNTIME_BACKENDS = Object.freeze({\n  RUST_WASM_WORKER: 'rust-wasm-worker',\n});",
    'Rust-only backend enum',
)
rt = regex_required(
    rt,
    r"/\*\* Synchronous compatibility runtime used when Worker/WASM is unavailable\. \*/.*?function defaultWorkerFactory",
    "function defaultWorkerFactory",
    'remove main-thread realtime runtime',
)
rt = regex_required(
    rt,
    r"/\*\*\n \* Worker/WASM is now the preferred player runtime.*?export function createRealtimeRuntime\(world, \{.*?\n\}",
    """/** Rust/WASM Worker is the required production simulation runtime. */
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
}""",
    'replace runtime selector',
)
write('src/simulation/realtimeRuntime.js', rt)

caps = read('src/simulation/runtimeCapabilities.js')
caps = regex_required(
    caps,
    r"export function recommendedRuntimeBackend\(capabilities = browserRuntimeCapabilities\(\)\) \{.*?\n\}",
    """export function recommendedRuntimeBackend(capabilities = browserRuntimeCapabilities()) {
  const supported = Boolean(capabilities.worker && capabilities.webAssembly);
  return {
    supported,
    simulationThread: capabilities.worker ? 'worker' : 'unavailable',
    numericCore: capabilities.webAssembly ? 'rust-wasm' : 'unavailable',
    cpuParallelism: capabilities.wasmThreads
      ? 'shared-memory-workers'
      : (capabilities.worker ? 'message-workers' : 'unavailable'),
    gpuCompute: capabilities.webGpu ? 'webgpu-available' : 'cpu',
  };
}""",
    'Rust-only runtime recommendation',
)
write('src/simulation/runtimeCapabilities.js', caps)

# ---------------------------------------------------------------------------
# Blueprint module remains authoring-only. Remove every JS physical tick path.
# ---------------------------------------------------------------------------
engine = read('src/simulation/simulationEngine.js')
engine = regex_required(
    engine,
    r"import \{ DEFAULT_EXTRACTOR_RATE_KG_PER_SECOND \} from './extractorNode\.js';\n.*?import \{ MATERIAL_FORMS \} from '../core/materials/materialForms\.js';",
    """import { DEFAULT_EXTRACTOR_RATE_KG_PER_SECOND } from './extractorNode.js';
import { createZeroStream } from './materialStream.js';
import {
  defaultProcessParameters,
  getProcessDefinition,
  CRUSHING_PROCESS_ID,
  MAGNETIC_SEPARATION_PROCESS_ID,
} from '../core/processes/definitions/index.js';
import {
  getApparatusDefinition,
  validateApparatusParameters,
} from '../content/apparatus/definitions.js';
import { createApparatusRuntime } from './apparatus/registry.js';
import { PORT_CAPABILITIES, portCapabilityMatches } from '../core/systems/ports.js';
import { MATERIAL_FORMS } from '../core/materials/materialForms.js';""",
    'authoring-only simulationEngine imports',
)
engine = engine.replace("export const DEFAULT_PASSIVE_STORAGE_TRANSFER_KG_PER_S = 10;\n\nconst TRANSFER_TOLERANCE_KG = 1e-8;\n\n", "")
engine = engine.replace("const blueprintExecutionPlanCache = new WeakMap();\n", "")
engine = replace_required(
    engine,
    "  blueprintExecutionPlanCache.delete(blueprint);\n  bumpRevision(blueprintTopologyRevisionCache, blueprint);",
    "  bumpRevision(blueprintTopologyRevisionCache, blueprint);",
    'remove execution-plan cache invalidation',
)
engine = regex_required(
    engine,
    r"function isExplicitBoundaryStorageTransition.*?function resolveResourceAccessOccurrence",
    "function resolveResourceAccessOccurrence",
    'remove compiled JS execution plan',
)
engine = replace_required(
    engine,
    "export function getStreamForConnection(blueprint, connectionId) {\n  return executionPlanForBlueprint(blueprint).streamByConnectionId.get(connectionId) ?? null;\n}",
    "export function getStreamForConnection(blueprint, connectionId) {\n  return Object.values(blueprint?.streams ?? {}).find(stream => stream.connectionId === connectionId) ?? null;\n}",
    'authoring stream lookup',
)
engine = regex_required(
    engine,
    r"function findInboundConnection.*?export function setNodeEnabled",
    "export function setNodeEnabled",
    'remove JS simulation tick/transfer engine',
)
engine = replace_required(
    engine,
    "  if (typeof apparatusRuntimeFor(node.nodeType)?.simulate !== 'function') throw new Error(`Node '${nodeId}' is not active machinery`);",
    "  if (typeof node.enabled !== 'boolean') throw new Error(`Node '${nodeId}' is not active machinery`);",
    'setNodeEnabled no simulate dependency',
)
engine = replace_required(
    engine,
    "  if (typeof apparatusRuntimeFor(node.nodeType)?.simulate === 'function') return node.enabled ? (node.operatingState ?? 'idle') : 'off';",
    "  if (typeof node.enabled === 'boolean') return node.enabled ? (node.operatingState ?? 'idle') : 'off';",
    'operating state no simulate dependency',
)
engine = engine.replace(
    " * Fixed-timestep Site simulation. Physical material state lives in blueprint\n * runtime objects; node layout and viewport state live separately in UI state.",
    " * Browser-side Blueprint authoring model. Physical simulation state is owned\n * exclusively by the Rust/WASM Worker; this module never advances physical time.",
)
write('src/simulation/simulationEngine.js', engine)

# ---------------------------------------------------------------------------
# World module keeps topology/session construction only.
# ---------------------------------------------------------------------------
world = read('src/simulation/worldSimulation.js')
world = world.replace("/** World-owned fixed-step simulation clock and recursive boundary transfers. */\nimport { simulationTick, SIMULATION_STEP_S } from './simulationEngine.js';\n", "/** Browser-side world/session topology compiled into the Rust/WASM runtime. */\n")
world = world.replace("import { transferBoundaryMaterial, validateBoundaryTransfer } from './boundaryTransfer.js';", "import { validateBoundaryTransfer } from './boundaryTransfer.js';")
world = regex_required(world, r"function simulationSessions.*?export function createWorldSimulation", "export function createWorldSimulation", 'remove world execution caches')
world = regex_required(world, r"export function pauseWorldSimulation.*", "", 'remove JS world stepping APIs')
write('src/simulation/worldSimulation.js', world)

boundary = read('src/simulation/boundaryTransfer.js')
boundary = regex_required(boundary, r"export function transferBoundaryMaterial.*", "", 'remove JS boundary transfer execution')
write('src/simulation/boundaryTransfer.js', boundary)

# ---------------------------------------------------------------------------
# Apparatus registry and nodes: constructors/authoring state only.
# ---------------------------------------------------------------------------
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

const APPARATUS_RUNTIME = Object.freeze({
  extractor: Object.freeze({ create: createExtractor }),
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
  hopper: Object.freeze({ create: createHopper }),
});

export function apparatusRuntimeFor(nodeType) {
  return APPARATUS_RUNTIME[nodeType] ?? null;
}

export function createApparatusRuntime(nodeType, parameters) {
  const entry = apparatusRuntimeFor(nodeType);
  if (!entry?.create) throw new Error(`Unknown apparatus runtime '${nodeType}'`);
  return entry.create(parameters);
}

export function registeredApparatusNodeTypes() {
  return Object.keys(APPARATUS_RUNTIME);
}
""")

write('src/simulation/apparatus/extractor.js', """
export {
  createExtractor,
  extractorOccurrenceEligibility,
  extractorOutputRates,
} from '../extractorNode.js';
""")

write('src/simulation/apparatus/feeder.js', """
import { FEEDING_PROCESS_ID } from '../../core/processes/definitions/index.js';

export function createFeeder({ id, flowRateKgPerSecond = 1, throughputKgPerSecond = 10, enabled = false } = {}) {
  if (!id || typeof id !== 'string') throw new Error('Feeder id must be a non-empty string');
  if (!Number.isFinite(flowRateKgPerSecond) || flowRateKgPerSecond < 0) throw new Error('Feeder flow rate must be finite and non-negative');
  if (!Number.isFinite(throughputKgPerSecond) || throughputKgPerSecond <= 0) throw new Error('Feeder throughput must be finite and positive');
  if (typeof enabled !== 'boolean') throw new Error('Feeder enabled must be boolean');
  return {
    id, nodeType: 'feeder', systemType: 'feeder', kind: 'primitive', processId: FEEDING_PROCESS_ID,
    flowRateKgPerSecond, throughputKgPerSecond, enabled,
    operatingState: enabled ? 'idle' : 'off', lastError: null,
    inputPortId: 'feed', outputPortId: 'product',
  };
}
""")

write('src/simulation/apparatus/merger.js', """
import { MERGING_PROCESS_ID } from '../../core/processes/definitions/index.js';

export function createMaterialMerger({ id, throughputKgPerSecond = 10, enabled = false } = {}) {
  if (!id || typeof id !== 'string') throw new Error('Material Merger id must be a non-empty string');
  if (!Number.isFinite(throughputKgPerSecond) || throughputKgPerSecond <= 0) throw new Error('Material Merger throughput must be finite and positive');
  if (typeof enabled !== 'boolean') throw new Error('Material Merger enabled must be boolean');
  return {
    id, nodeType: 'merger', systemType: 'material-merger', kind: 'primitive', processId: MERGING_PROCESS_ID,
    throughputKgPerSecond, enabled, operatingState: enabled ? 'idle' : 'off', lastError: null,
    inputAPortId: 'input-a', inputBPortId: 'input-b', outputPortId: 'product',
  };
}
""")

write('src/simulation/apparatus/crusher.js', """
import { CRUSHING_PROCESS_ID } from '../../core/processes/definitions/index.js';

export function createCrusher({ id, throughputKgPerSecond = 4, targetParticleSizeMm = 10, enabled = false } = {}) {
  if (!id || typeof id !== 'string') throw new Error('Crusher id must be a non-empty string');
  if (!Number.isFinite(throughputKgPerSecond) || throughputKgPerSecond <= 0) throw new Error('Crusher throughput must be finite and positive');
  if (!Number.isFinite(targetParticleSizeMm) || targetParticleSizeMm <= 0) throw new Error('Crusher target particle size must be finite and positive');
  if (typeof enabled !== 'boolean') throw new Error('Crusher enabled must be boolean');
  return {
    id, nodeType: 'crusher', systemType: 'crusher', kind: 'primitive', processId: CRUSHING_PROCESS_ID,
    throughputKgPerSecond, targetParticleSizeMm, enabled,
    operatingState: enabled ? 'idle' : 'off', lastError: null,
    inputPortId: 'feed', outputPortId: 'product',
  };
}
""")

write('src/simulation/apparatus/comminution.js', """
import {
  JAW_CRUSHING_PROCESS_ID,
  CONE_CRUSHING_PROCESS_ID,
  MILLING_PROCESS_ID,
  getProcessDefinition,
} from '../../core/processes/definitions/index.js';

const MACHINE_CONFIG = Object.freeze({
  jawCrusher: Object.freeze({ processId: JAW_CRUSHING_PROCESS_ID, sizeField: 'jawProductSizeMm' }),
  coneCrusher: Object.freeze({ processId: CONE_CRUSHING_PROCESS_ID, sizeField: 'coneProductSizeMm' }),
  ballMill: Object.freeze({ processId: MILLING_PROCESS_ID, sizeField: 'millProductSizeMm' }),
});

function createComminutionNode(nodeType, parameters = {}) {
  const config = MACHINE_CONFIG[nodeType];
  if (!config) throw new Error(`Unknown comminution apparatus '${nodeType}'`);
  const definition = getProcessDefinition(config.processId);
  const id = parameters.id;
  const targetSizeMm = parameters[config.sizeField];
  const throughputKgPerSecond = parameters.throughputKgPerSecond;
  const ratedPowerKw = parameters.ratedPowerKw;
  const enabled = parameters.enabled ?? false;
  if (!id || typeof id !== 'string') throw new Error(`${nodeType} id must be a non-empty string`);
  if (!Number.isFinite(targetSizeMm) || targetSizeMm <= 0) throw new Error(`${nodeType} product particle size must be finite and positive`);
  if (!Number.isFinite(throughputKgPerSecond) || throughputKgPerSecond <= 0) throw new Error(`${nodeType} throughput must be finite and positive`);
  if (!Number.isFinite(ratedPowerKw) || ratedPowerKw <= 0) throw new Error(`${nodeType} rated power must be finite and positive`);
  if (typeof enabled !== 'boolean') throw new Error(`${nodeType} enabled must be boolean`);
  return {
    id, nodeType, systemType: nodeType, kind: 'primitive', processId: config.processId,
    [config.sizeField]: targetSizeMm,
    throughputKgPerSecond,
    ratedPowerKw,
    maxFeedParticleSizeMm: definition.maxFeedParticleSizeMm,
    enabled,
    operatingState: enabled ? 'idle' : 'off', lastError: null,
    inputPortId: 'feed', outputPortId: 'product',
    lastSpecificEnergyKWhPerT: 0,
    lastActualPowerKw: 0,
    lastBondAbrasionIndex: 0,
    accumulatedAbrasionTonneAi: 0,
  };
}

export const createJawCrusher = parameters => createComminutionNode('jawCrusher', parameters);
export const createConeCrusher = parameters => createComminutionNode('coneCrusher', parameters);
export const createBallMill = parameters => createComminutionNode('ballMill', parameters);
""")

write('src/simulation/apparatus/screen.js', """
import { SCREENING_PROCESS_ID } from '../../core/processes/definitions/index.js';

export function createScreen({ id, apertureSizeMm = 25, throughputKgPerSecond = 4, enabled = false } = {}) {
  if (!id || typeof id !== 'string') throw new Error('Screen id must be a non-empty string');
  if (!Number.isFinite(apertureSizeMm) || apertureSizeMm <= 0) throw new Error('Screen aperture must be finite and positive');
  if (!Number.isFinite(throughputKgPerSecond) || throughputKgPerSecond <= 0) throw new Error('Screen throughput must be finite and positive');
  if (typeof enabled !== 'boolean') throw new Error('Screen enabled must be boolean');
  return {
    id, nodeType: 'screen', systemType: 'screen', kind: 'primitive', processId: SCREENING_PROCESS_ID,
    apertureSizeMm, throughputKgPerSecond, enabled, operatingState: enabled ? 'idle' : 'off', lastError: null,
    inputPortId: 'feed', undersizePortId: 'undersize', oversizePortId: 'oversize',
  };
}
""")

write('src/simulation/apparatus/splitter.js', """
import { SPLITTING_PROCESS_ID } from '../../core/processes/definitions/index.js';

export function createSplitter({ id, splitFractionToA = 0.5, throughputKgPerSecond = 10, enabled = false } = {}) {
  if (!id || typeof id !== 'string') throw new Error('Splitter id must be a non-empty string');
  if (!Number.isFinite(splitFractionToA) || splitFractionToA < 0 || splitFractionToA > 1) throw new Error('Splitter fraction must be within [0, 1]');
  if (!Number.isFinite(throughputKgPerSecond) || throughputKgPerSecond <= 0) throw new Error('Splitter throughput must be finite and positive');
  if (typeof enabled !== 'boolean') throw new Error('Splitter enabled must be boolean');
  return {
    id, nodeType: 'splitter', systemType: 'splitter', kind: 'primitive', processId: SPLITTING_PROCESS_ID,
    splitFractionToA, throughputKgPerSecond, enabled, operatingState: enabled ? 'idle' : 'off', lastError: null,
    inputPortId: 'feed', outputAPortId: 'output-a', outputBPortId: 'output-b',
  };
}
""")

write('src/simulation/apparatus/magneticSeparator.js', """
import { MAGNETIC_SEPARATION_PROCESS_ID, getProcessDefinition } from '../../core/processes/definitions/index.js';

export function createMagneticSeparator({ id, fieldStrength = 0.5, throughputKgPerSecond = 4, enabled = false } = {}) {
  if (!id || typeof id !== 'string') throw new Error('Magnetic Separator id must be a non-empty string');
  if (!Number.isFinite(fieldStrength) || fieldStrength < 0 || fieldStrength > 1) throw new Error('Magnetic Separator field strength must be within [0, 1]');
  if (!Number.isFinite(throughputKgPerSecond) || throughputKgPerSecond <= 0) throw new Error('Magnetic Separator throughput must be finite and positive');
  if (typeof enabled !== 'boolean') throw new Error('Magnetic Separator enabled must be boolean');
  return {
    id, nodeType: 'magSep', systemType: 'magnetic-separator', kind: 'primitive', processId: MAGNETIC_SEPARATION_PROCESS_ID,
    fieldStrength, throughputKgPerSecond,
    maxFeedParticleSizeMm: getProcessDefinition(MAGNETIC_SEPARATION_PROCESS_ID).maxFeedParticleSizeMm,
    enabled, operatingState: enabled ? 'idle' : 'off', lastError: null,
    inputPortId: 'feed', concentratePortId: 'concentrate', tailingsPortId: 'tailings',
  };
}
""")

write('src/simulation/apparatus/exhaustVent.js', """
import { createGasMaterialBody, createGasMaterialState } from '../../core/materials/gas/gasMaterialState.js';
import { PORT_CAPABILITIES } from '../../core/systems/ports.js';

export function createExhaustVent({ id } = {}) {
  return {
    id,
    nodeType: 'exhaustVent',
    systemType: 'exhaust-vent',
    kind: 'primitive',
    gasInputPortId: 'gas-in',
    emittedGasBody: createGasMaterialBody(createGasMaterialState()),
    ports: [{ id: 'gas-in', direction: 'input', kind: 'material', label: 'gas in', accepts: [PORT_CAPABILITIES.GAS] }],
  };
}
""")

write('src/simulation/apparatus/roastingFurnace.js', """
import { createSolidMaterialBody, totalSolidQuantity } from '../../core/materials/solids/solidMaterialState.js';
import { createGasMaterialBody, createGasMaterialState } from '../../core/materials/gas/gasMaterialState.js';
import { ROASTING_PROCESS_ID } from '../../core/processes/definitions/index.js';

export const DEFAULT_ROASTING_FURNACE_ZONE_COUNT = 4;

function emptySolidBody() { return createSolidMaterialBody(); }
function createZoneBodies(count) { return Array.from({ length: count }, () => emptySolidBody()); }
function solidBodyMassKg(body) { return body?.solidState ? totalSolidQuantity(body.solidState) : 0; }

function ensureFurnaceState(node) {
  node.zones ??= createZoneBodies(node.internalZoneCount);
  node.pendingFeed ??= emptySolidBody();
  node.gasInventory ??= createGasMaterialBody(createGasMaterialState());
  return node;
}

export function roastingFurnaceZoneCapacityKg(node) {
  return node.effectiveChamberHoldUpKg / node.internalZoneCount;
}

export function roastingFurnaceChargeMassKg(node) {
  ensureFurnaceState(node);
  return node.zones.reduce((sum, zone) => sum + solidBodyMassKg(zone), 0);
}

export function roastingFurnacePendingFeedMassKg(node) {
  ensureFurnaceState(node);
  return solidBodyMassKg(node.pendingFeed);
}

export function createRoastingFurnace({
  id,
  temperatureSetpointK = 900,
  ratedHeaterPowerKw = 60,
  maximumOperatingTemperatureK = 1200,
  maximumSolidThroughputKgPerSecond = 4,
  effectiveChamberHoldUpKg = 20,
  heatLossCoefficientWPerK = 25,
  internalZoneCount = DEFAULT_ROASTING_FURNACE_ZONE_COUNT,
  enabled = false,
} = {}) {
  if (!id || typeof id !== 'string') throw new Error('Roasting Furnace id must be a non-empty string');
  for (const [label, value] of Object.entries({ temperatureSetpointK, ratedHeaterPowerKw, maximumOperatingTemperatureK, maximumSolidThroughputKgPerSecond, effectiveChamberHoldUpKg, heatLossCoefficientWPerK })) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Roasting Furnace ${label} must be finite and positive`);
  }
  if (!Number.isInteger(internalZoneCount) || internalZoneCount < 1) throw new Error('Roasting Furnace internalZoneCount must be a positive integer');
  if (typeof enabled !== 'boolean') throw new Error('Roasting Furnace enabled must be boolean');
  const node = {
    id, nodeType: 'roastingFurnace', systemType: 'roasting-furnace', kind: 'primitive', processId: ROASTING_PROCESS_ID,
    temperatureSetpointK, ratedHeaterPowerKw, maximumOperatingTemperatureK,
    maximumSolidThroughputKgPerSecond, effectiveChamberHoldUpKg, heatLossCoefficientWPerK, internalZoneCount,
    enabled, operatingState: enabled ? 'idle' : 'off', lastError: null,
    inputPortId: 'feed', solidProductPortId: 'solid-product', gasExhaustPortId: 'gas-exhaust',
    zones: createZoneBodies(internalZoneCount), pendingFeed: emptySolidBody(), gasInventory: createGasMaterialBody(createGasMaterialState()),
    lastHeaterPowerKw: 0, lastHeatLossPowerKw: 0, lastReactionPowerKw: 0,
    lastGoethiteConversionFraction: 0, lastFeedRateKgPerSecond: 0, lastProductRateKgPerSecond: 0,
    lastSolverEvaluationCount: 0, actualChargeTemperatureK: 298.15,
  };
  return node;
}
""")

# Hopper remains canonical storage authoring/presentation; remove local execution mutations.
hopper = read('src/simulation/hopperNode.js')
hopper = regex_required(hopper, r"/\*\*\n \* Receive a finite, already-materialized solid body directly into inventory\..*?export \{ HOPPER_TOLERANCE_KG \};", "export { HOPPER_TOLERANCE_KG };", 'remove JS hopper transfer execution')
hopper = hopper.replace("  addSolidMaterialState,\n", "").replace("  proportionalSolidMaterialShare,\n", "").replace("  withdrawSolidMaterialState,\n", "")
write('src/simulation/hopperNode.js', hopper)

# ---------------------------------------------------------------------------
# JS packed objects are setup containers only, never a second execution engine.
# ---------------------------------------------------------------------------
write('src/simulation/packedRuntimeState.js', """
export const PACKED_SOLID_TOLERANCE = 1e-9;

function assertUnsigned(value, max, label) {
  if (!Number.isInteger(value) || value < 0 || value > max) throw new Error(`${label} must be an integer from 0 to ${max}`);
}

export class PackedSolidRuntimeState {
  constructor() { this.rows = new Map(); }
  pushFraction({ speciesId, sizeBinId, liberationClassId, textureProfileId = 0, quantity }) {
    assertUnsigned(speciesId, 0xffff, 'speciesId');
    assertUnsigned(sizeBinId, 0xff, 'sizeBinId');
    assertUnsigned(liberationClassId, 0xff, 'liberationClassId');
    assertUnsigned(textureProfileId, 0xffffffff, 'textureProfileId');
    if (!Number.isFinite(quantity) || quantity < 0) throw new Error('solid material quantity must be finite and non-negative');
    if (quantity <= PACKED_SOLID_TOLERANCE) return this;
    const key = `${speciesId}|${sizeBinId}|${liberationClassId}|${textureProfileId}`;
    const existing = this.rows.get(key);
    if (existing) existing.quantity += quantity;
    else this.rows.set(key, { speciesId, sizeBinId, liberationClassId, textureProfileId, quantity });
    return this;
  }
  totalQuantity() { return [...this.rows.values()].reduce((sum, row) => sum + row.quantity, 0); }
  toColumns() {
    const rows = [...this.rows.values()];
    return {
      speciesIds: Uint16Array.from(rows, row => row.speciesId),
      sizeBinIds: Uint8Array.from(rows, row => row.sizeBinId),
      liberationClassIds: Uint8Array.from(rows, row => row.liberationClassId),
      textureProfileIds: Uint32Array.from(rows, row => row.textureProfileId),
      quantities: Float64Array.from(rows, row => row.quantity),
    };
  }
}
""")

write('src/simulation/packedStorageRuntime.js', """
import { PackedSolidRuntimeState } from './packedRuntimeState.js';

export class PackedSolidRuntimeBody {
  constructor(solidState = new PackedSolidRuntimeState(), sensibleEnthalpyJ = 0) {
    if (!(solidState instanceof PackedSolidRuntimeState)) throw new Error('PackedSolidRuntimeBody requires packed solid state');
    if (!Number.isFinite(sensibleEnthalpyJ)) throw new Error('sensible enthalpy must be finite');
    this.solidState = solidState;
    this.sensibleEnthalpyJ = sensibleEnthalpyJ;
  }
  totalMassKg() { return this.solidState.totalQuantity(); }
}

export class PackedHopperRuntimeState {
  constructor(capacityKg, body = new PackedSolidRuntimeBody()) {
    if (!Number.isFinite(capacityKg) || capacityKg <= 0) throw new Error('hopper capacity must be positive');
    if (!(body instanceof PackedSolidRuntimeBody)) throw new Error('PackedHopperRuntimeState requires packed solid body');
    if (body.totalMassKg() > capacityKg + 1e-9) throw new Error(`hopper initial contents (${body.totalMassKg()} kg) exceed capacity (${capacityKg} kg)`);
    this.capacityKg = capacityKg;
    this.body = body;
  }
}
""")

write('src/simulation/packedGasRuntime.js', """
export class PackedGasRuntimeState {
  constructor() { this.species = new Map(); }
  pushSpecies(speciesId, quantity) {
    if (!Number.isInteger(speciesId) || speciesId < 0 || speciesId > 0xffff) throw new Error('gas speciesId must be a u16');
    if (!Number.isFinite(quantity) || quantity < 0) throw new Error('gas quantity must be finite and non-negative');
    if (quantity > 1e-12) this.species.set(speciesId, (this.species.get(speciesId) ?? 0) + quantity);
    return this;
  }
  toColumns() {
    const rows = [...this.species.entries()];
    return { speciesIds: Uint16Array.from(rows, row => row[0]), quantities: Float64Array.from(rows, row => row[1]) };
  }
}

export class PackedGasRuntimeBody {
  constructor(gasState = new PackedGasRuntimeState(), sensibleEnthalpyJ = 0) {
    if (!(gasState instanceof PackedGasRuntimeState)) throw new Error('PackedGasRuntimeBody requires packed gas state');
    if (!Number.isFinite(sensibleEnthalpyJ)) throw new Error('gas sensible enthalpy must be finite');
    this.gasState = gasState;
    this.sensibleEnthalpyJ = sensibleEnthalpyJ;
  }
}
""")

thermal = read('src/simulation/packedThermalRuntime.js')
thermal = regex_required(thermal, r"\n  heatCapacityJPerK\(state\) \{.*?\n  \}", "", 'remove JS packed thermal calculation')
thermal = thermal.replace("import { PACKED_SOLID_TOLERANCE, PackedSolidRuntimeState } from './packedRuntimeState.js';\n\n", "")
write('src/simulation/packedThermalRuntime.js', thermal)

# Exact #60 startup bug: staged comminution has apparatus-specific canonical fields.
pwc = read('src/simulation/packedWorldRuntimeCompiler.js')
pwc = replace_required(
    pwc,
    "const COMMINUTION_KIND = Object.freeze({\n  crusher: 0,\n  jawCrusher: 1,\n  coneCrusher: 2,\n  ballMill: 3,\n});",
    "const COMMINUTION_KIND = Object.freeze({\n  crusher: 0,\n  jawCrusher: 1,\n  coneCrusher: 2,\n  ballMill: 3,\n});\n\nconst COMMINUTION_TARGET_SIZE_FIELD = Object.freeze({\n  crusher: 'targetParticleSizeMm',\n  jawCrusher: 'jawProductSizeMm',\n  coneCrusher: 'coneProductSizeMm',\n  ballMill: 'millProductSizeMm',\n});",
    'comminution target field map',
)
pwc = replace_required(
    pwc,
    "        const targetParticleSizeMm = node.targetParticleSizeMm;",
    "        const targetParticleSizeMm = node[COMMINUTION_TARGET_SIZE_FIELD[node.nodeType]];",
    'resolve staged comminution target size',
)
write('src/simulation/packedWorldRuntimeCompiler.js', pwc)

# Runtime presentation has no fallback state to clear anymore.
pres = read('src/simulation/runtimePresentation.js')
pres = regex_required(pres, r"\n/\*\* Drop presentation authority when falling back.*", "", 'remove fallback presentation clearing')
write('src/simulation/runtimePresentation.js', pres)

controller = read('src/workspace/workspaceController.js')
controller = controller.replace("  applyRustWorkerRuntimeSnapshot,\n  clearRustWorkerRuntimePresentation,\n", "  applyRustWorkerRuntimeSnapshot,\n")
controller = controller.replace("    clearRustWorkerRuntimePresentation(wsState.world);\n", "")
write('src/workspace/workspaceController.js', controller)

# Debug runtime label must report the actual required production architecture.
dbgstats = read('src/workspace/debug/runtimeDebugStats.js')
dbgstats = dbgstats.replace("setText(root, 'runtime-backend', 'Compiled JS');", "setText(root, 'runtime-backend', 'Rust/WASM Worker');")
write('src/workspace/debug/runtimeDebugStats.js', dbgstats)

# Debug stepping is routed through the authoritative Worker; JS apparatus profiling/benchmark is removed.
dbg = read('src/workspace/debug/debugDrawer.js')
dbg = regex_required(
    dbg,
    r"import \{ wsState, inspector \} from '../workspaceState\.js';.*?\} from '../../debug/fixtures/roastingBenchmark\.js';",
    """import { wsState, inspector } from '../workspaceState.js';
import { SIMULATION_STEP_S } from '../../simulation/simulationEngine.js';
import { applyRustWorkerRuntimeSnapshot } from '../../simulation/runtimePresentation.js';
import {
  placeRoastingTestFactories,
  removeRoastingTestFixture,
} from '../../debug/fixtures/roastingBenchmark.js';""",
    'debug imports',
)
dbg = dbg.replace("const BENCHMARK_WARMUP_TICKS = 60;\nconst BENCHMARK_SAMPLE_TICKS = 30;\n", "")
dbg = dbg.replace("let lastProfileTotals = { durationMs: 0, elapsedSeconds: 0 };\nlet liveApparatusCpuPerTickMs = null;\n", "")
dbg = dbg.replace("let benchmarkRunning = false;\n", "")
dbg = regex_required(
    dbg,
    r"function updateLiveRates\(profileSnapshot\) \{.*?\n\}\n\nfunction renderHotspots\(root, profileSnapshot\) \{.*?\n\}",
    """function updateLiveRates() {
  const elapsedSeconds = wsState.world?.simulation?.elapsedSeconds ?? 0;
  const wallNow = nowMs();
  if (lastRealtimeSample) {
    const wallDeltaSeconds = (wallNow - lastRealtimeSample.wallMs) / 1000;
    const simulationDeltaSeconds = elapsedSeconds - lastRealtimeSample.simulationSeconds;
    if (wallDeltaSeconds > 0.05) liveRealtimeFactor = simulationDeltaSeconds / wallDeltaSeconds;
  }
  lastRealtimeSample = { wallMs: wallNow, simulationSeconds: elapsedSeconds };
}

function renderHotspots(root) {
  const container = root.querySelector('[data-debug-hotspots]');
  if (container) container.innerHTML = '<div class="ws-debug-muted">Physics profiling is owned by the Rust/WASM runtime; JavaScript apparatus profiling has been removed.</div>';
}""",
    'remove JS apparatus profiling',
)
dbg = dbg.replace("  const profile = performanceTelemetrySnapshot();\n  updateLiveRates(profile);", "  updateLiveRates();")
dbg = dbg.replace("  setText(root, 'apparatus-cpu-tick', profile.deepProfilingEnabled ? formatMs(liveApparatusCpuPerTickMs) : 'profiling off');", "  setText(root, 'apparatus-cpu-tick', 'Rust/WASM');")
dbg = dbg.replace("  renderHotspots(root, profile);", "  renderHotspots(root);")
dbg = regex_required(
    dbg,
    r"async function stepWorld\(root, seconds\) \{.*?\n\}\n\nfunction yieldToBrowser\(\) \{.*?\n\}\n\nfunction benchmarkTick.*?\n\}\n\nasync function runHeadlessBenchmark\(root\) \{.*?\n\}",
    """async function stepWorld(root, seconds) {
  const runtime = wsState.realtimeRuntime;
  if (!runtime) return status(root, 'Rust/WASM runtime is not initialized.', true);
  const ticks = Math.floor((seconds + 1e-12) / SIMULATION_STEP_S);
  const wasRunning = runtime.running;
  try {
    if (!wasRunning) await runtime.resume();
    const result = await runtime.advanceFixedSteps(ticks);
    applyRustWorkerRuntimeSnapshot(wsState.world, runtime, result?.snapshot ?? runtime.snapshot);
    if (!wasRunning) await runtime.pause();
    if (!wasRunning && wsState.world?.simulation) wsState.world.simulation.running = false;
    status(root, `Advanced Rust/WASM world by ${(ticks * SIMULATION_STEP_S).toFixed(1)} s (${ticks} ticks).`);
    await refreshCurrentWorkspace();
  } catch (error) {
    status(root, error.message, true);
  }
}""",
    'route debug step through Worker/remove JS benchmark',
)
dbg = regex_required(
    dbg,
    r"function resetStats\(root\) \{.*?\n\}",
    """function resetStats(root) {
  frameSamplesMs = [];
  liveRealtimeFactor = null;
  lastRealtimeSample = null;
  status(root, 'Performance statistics reset.');
  renderDebugStats(root);
}""",
    'remove JS profiling reset',
)
dbg = dbg.replace("    else if (action === 'benchmark') await runHeadlessBenchmark(root);", "    else if (action === 'benchmark') status(root, 'Legacy JavaScript benchmark removed. Use live Rust/WASM test factories.', true);")
dbg = regex_required(
    dbg,
    r"\n  root\.addEventListener\('change', event => \{.*?\n  \}, \{ signal \}\);",
    "",
    'remove deep JS profiling controls',
)
write('src/workspace/debug/debugDrawer.js', dbg)

# ---------------------------------------------------------------------------
# Delete obsolete JavaScript execution implementations and their tests.
# ---------------------------------------------------------------------------
obsolete_files = [
  'src/simulation/continuousProcessing.js',
  'src/simulation/continuousComminution.js',
  'src/simulation/packedProcessRuntime.js',
  'src/simulation/packedProcessCompiler.js',
  'src/simulation/packedRoutingRuntime.js',
  'src/simulation/apparatus/blueprintHelpers.js',
  'src/simulation/apparatus/materialTransferHelpers.js',
  'src/simulation/apparatus/transactionHelpers.js',
  'src/simulation/apparatus/apparatusProfiling.js',
  'src/debug/performanceTelemetry.js',
  'src/core/processes/processExecution.js',
  'src/core/processes/processPhysics.js',
]
for rel in obsolete_files:
    delete(rel)
for folder in ['src/core/processes/physics', 'src/core/processes/executors']:
    p = path(folder)
    if p.exists():
        for f in p.glob('*.js'): f.unlink()

obsolete_tests = [
  'tests/continuousSimulation.test.js',
  'tests/crusherScreenCircuit.test.js',
  'tests/liberationEquilibrium.test.js',
  'tests/materialProcessing.test.js',
  'tests/materialRoutingApparatus.test.js',
  'tests/packedProcessRuntime.test.js',
  'tests/packedRoutingRuntime.test.js',
  'tests/packedRuntimeState.test.js',
  'tests/packedStorageRuntime.test.js',
  'tests/packedThermalGasRuntime.test.js',
  'tests/performancePass.test.js',
  'tests/realtimeRuntimeCaching.test.js',
  'tests/screening.test.js',
  'tests/stagedComminution.test.js',
  'tests/thermochemicalPerformance.test.js',
  'tests/thermochemicalProcessing.test.js',
  'tests/thermochemicalTolerance.test.js',
]
for rel in obsolete_tests:
    delete(rel)

# Remove old parity fixture now that Rust is authoritative instead of compared to JS.
delete('tests/fixtures/rust_core_parity.json')

# Docs: make authority permanent and explicit.
for rel in ['ARCHITECTURE_PERFORMANCE.md', 'rust/README.md']:
    text = read(rel)
    text = text.replace('compiled JavaScript backend', 'obsolete JavaScript backend')
    text = text.replace('JavaScript runtime remains production-authoritative', 'Rust/WASM Worker is production-authoritative')
    text += "\n\n## Rust-only production authority\n\nThe browser no longer contains a JavaScript physics fallback. JavaScript owns UI, authoring, world/content compilation, Worker messaging, serialization, and presentation only. All physical time advancement, retained material state, apparatus execution, routing, thermal behavior, chemistry, and world scheduling are owned by Rust/WASM in the dedicated simulation Worker. Browsers without both Web Worker and WebAssembly support are unsupported rather than silently selecting a second simulation engine.\n"
    write(rel, text)

# Architecture regression: source tree must not reintroduce a JS physical fallback.
write('tests/rustOnlyRuntimeArchitecture.test.js', """
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('production realtime runtime exposes only the Rust/WASM Worker backend', () => {
  const source = read('src/simulation/realtimeRuntime.js');
  assert.doesNotMatch(source, /main-thread-compiled/);
  assert.doesNotMatch(source, /worldSimulationTick/);
  assert.match(source, /requires a browser with Web Worker and WebAssembly support/);
});

test('browser authoring modules cannot advance physical simulation time', () => {
  const engine = read('src/simulation/simulationEngine.js');
  const world = read('src/simulation/worldSimulation.js');
  assert.doesNotMatch(engine, /export function simulationTick/);
  assert.doesNotMatch(engine, /export function simulationAdvance/);
  assert.doesNotMatch(world, /export function worldSimulationTick/);
  assert.doesNotMatch(world, /export function worldSimulationAdvance/);
});

test('debug tools cannot invoke the removed JavaScript physics engine', () => {
  const source = read('src/workspace/debug/debugDrawer.js');
  assert.doesNotMatch(source, /simulationTick|worldSimulationTick|performanceTelemetry/);
  assert.match(source, /realtimeRuntime\.advanceFixedSteps/);
});
""")

# Extend world compiler coverage for the exact player-reported staged comminution regression.
test_path = 'tests/packedWorldRuntimeCompiler.test.js'
test_text = read(test_path)
if 'staged comminution uses each apparatus canonical product-size field' not in test_text:
    test_text += """

test('staged comminution uses each apparatus canonical product-size field', () => {
  const world = worldWithSiteBlueprint();
  const blueprint = Object.values(world.simulation.sessions)[0];
  const jaw = blueprintAddApparatus(blueprint, 'jawCrusher', { jawProductSizeMm: 120, throughputKgPerSecond: 8, ratedPowerKw: 8 });
  const cone = blueprintAddApparatus(blueprint, 'coneCrusher', { coneProductSizeMm: 25, throughputKgPerSecond: 5, ratedPowerKw: 10 });
  const mill = blueprintAddApparatus(blueprint, 'ballMill', { millProductSizeMm: 0.25, throughputKgPerSecond: 2, ratedPowerKw: 75 });
  const compiled = compilePackedWorldRuntime(world);
  const byNode = new Map(compiled.machines.map(machine => [compiled.runtimeIds.nodeIds.valueFor(machine.nodeId), machine]));
  assert.equal(byNode.get(jaw.id).targetParticleSizeMm, 120);
  assert.equal(byNode.get(cone.id).targetParticleSizeMm, 25);
  assert.equal(byNode.get(mill.id).targetParticleSizeMm, 0.25);
});
"""
    write(test_path, test_text)

print('PR61 Rust-only cleanup applied')
