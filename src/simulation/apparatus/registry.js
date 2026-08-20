import { createExtractor, simulateExtractorNode } from './extractor.js';
import { createCrusher, simulateCrusherNode } from './crusher.js';
import { createMagneticSeparator, simulateMagSepNode } from './magneticSeparator.js';
import { createHopper } from '../hopperNode.js';
import { apparatusPortsForNode } from '../../content/apparatus/definitions.js';

export const APPARATUS_RUNTIME_REGISTRY = Object.freeze({
  extractor: Object.freeze({ phase: 10, create: createExtractor, simulate: simulateExtractorNode }),
  hopper: Object.freeze({ create: createHopper }),
  crusher: Object.freeze({ phase: 20, create: createCrusher, simulate: (blueprint, _world, node, dt) => simulateCrusherNode(blueprint, node, dt) }),
  magSep: Object.freeze({ phase: 30, create: createMagneticSeparator, simulate: (blueprint, _world, node, dt) => simulateMagSepNode(blueprint, node, dt) }),
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
