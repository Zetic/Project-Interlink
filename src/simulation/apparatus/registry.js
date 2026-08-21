import { createExtractor, simulateExtractorNode } from './extractor.js';
import { createMerger, simulateMergerNode } from './merger.js';
import { createFeeder, simulateFeederNode } from './feeder.js';
import { createCrusher, simulateCrusherNode } from './crusher.js';
import {
  createBallMill,
  createConeCrusher,
  createJawCrusher,
  simulateBallMillNode,
  simulateConeCrusherNode,
  simulateJawCrusherNode,
} from './comminution.js';
import { createScreen, simulateScreenNode } from './screen.js';
import { createSplitter, simulateSplitterNode } from './splitter.js';
import { createMagneticSeparator, simulateMagSepNode } from './magneticSeparator.js';
import { createExhaustVent } from './exhaustVent.js';
import { createRoastingFurnace, simulateRoastingFurnaceNode } from './roastingFurnace.js';
import { createHopper } from '../hopperNode.js';
import { apparatusPortsForNode } from '../../content/apparatus/definitions.js';
import { profileApparatusCall } from '../../debug/performanceTelemetry.js';

function profiled(nodeType, simulate) {
  return (...args) => profileApparatusCall(nodeType, args[2]?.id ?? null, simulate, args);
}

export const APPARATUS_RUNTIME_REGISTRY = Object.freeze({
  extractor: Object.freeze({ phase: 10, create: createExtractor, simulate: profiled('extractor', simulateExtractorNode) }),
  hopper: Object.freeze({ create: createHopper }),
  merger: Object.freeze({ phase: 15, create: createMerger, simulate: profiled('merger', (blueprint, _world, node, dt) => simulateMergerNode(blueprint, node, dt)) }),
  feeder: Object.freeze({ phase: 18, create: createFeeder, simulate: profiled('feeder', (blueprint, _world, node, dt) => simulateFeederNode(blueprint, node, dt)) }),
  // Compatibility runtime for historical generic Crusher nodes.
  crusher: Object.freeze({ phase: 20, create: createCrusher, simulate: profiled('crusher', (blueprint, _world, node, dt) => simulateCrusherNode(blueprint, node, dt)) }),
  jawCrusher: Object.freeze({ phase: 20, create: createJawCrusher, simulate: profiled('jawCrusher', (blueprint, _world, node, dt) => simulateJawCrusherNode(blueprint, node, dt)) }),
  coneCrusher: Object.freeze({ phase: 22, create: createConeCrusher, simulate: profiled('coneCrusher', (blueprint, _world, node, dt) => simulateConeCrusherNode(blueprint, node, dt)) }),
  ballMill: Object.freeze({ phase: 24, create: createBallMill, simulate: profiled('ballMill', (blueprint, _world, node, dt) => simulateBallMillNode(blueprint, node, dt)) }),
  screen: Object.freeze({ phase: 30, create: createScreen, simulate: profiled('screen', (blueprint, _world, node, dt) => simulateScreenNode(blueprint, node, dt)) }),
  splitter: Object.freeze({ phase: 35, create: createSplitter, simulate: profiled('splitter', (blueprint, _world, node, dt) => simulateSplitterNode(blueprint, node, dt)) }),
  magSep: Object.freeze({ phase: 40, create: createMagneticSeparator, simulate: profiled('magSep', (blueprint, _world, node, dt) => simulateMagSepNode(blueprint, node, dt)) }),
  roastingFurnace: Object.freeze({ phase: 45, create: createRoastingFurnace, simulate: profiled('roastingFurnace', simulateRoastingFurnaceNode) }),
  exhaustVent: Object.freeze({ create: createExhaustVent }),
});

export function apparatusRuntimeFor(nodeType) {
  return APPARATUS_RUNTIME_REGISTRY[nodeType] ?? null;
}

export function createApparatusRuntime(nodeType, parameters) {
  const runtime = apparatusRuntimeFor(nodeType);
  if (!runtime?.create) throw new Error(`No apparatus runtime registered for '${nodeType}'`);
  const node = runtime.create(parameters);
  // Canonical apparatus definitions own ordinary runtime port metadata. Runtime
  // constructors may retain legacy declarations, but registry creation resolves
  // the authoritative definition onto every placed apparatus to prevent drift.
  node.ports = apparatusPortsForNode(nodeType, node);
  return node;
}
