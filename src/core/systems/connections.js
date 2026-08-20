import { getSystemNodePort } from './systemNode.js';
import { portCapabilityMatches } from './ports.js';

/**
 * Validate the neutral graph contract. Domain-specific compatibility is
 * expressed by typed port capabilities rather than node-pair tables.
 */
export function assertSystemConnectionCompatible(sourceNode, sourcePortId, targetNode, targetPortId) {
  const source = getSystemNodePort(sourceNode, sourcePortId);
  const target = getSystemNodePort(targetNode, targetPortId);
  if (!source) throw new Error(`Unknown source port '${sourcePortId}'`);
  if (!target) throw new Error(`Unknown target port '${targetPortId}'`);
  if (source.direction !== 'output') throw new Error(`Source port '${sourcePortId}' must be an output`);
  if (target.direction !== 'input') throw new Error(`Target port '${targetPortId}' must be an input`);
  if (source.kind !== target.kind) throw new Error(`Port kinds '${source.kind}' and '${target.kind}' are incompatible`);
  if (!portCapabilityMatches(source, target)) {
    throw new Error(`Port capabilities '${sourcePortId}' and '${targetPortId}' are incompatible`);
  }
  return { source, target };
}
