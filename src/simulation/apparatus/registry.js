
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
