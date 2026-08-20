import { getSystemNodePort } from './systemNode.js';

export function validateSystemNode(node) {
  const errors = [];
  if (!node || typeof node !== 'object' || Array.isArray(node)) return ['System node must be an object'];
  if (typeof node.id !== 'string' || !node.id) errors.push('System node id must be a non-empty string');
  if (typeof node.nodeType !== 'string' || !node.nodeType) errors.push(`System node '${node.id ?? 'unknown'}' type must be a non-empty string`);
  if (!Array.isArray(node.ports)) errors.push(`System node '${node.id ?? 'unknown'}' ports must be an array`);
  const seen = new Set();
  for (const port of node.ports ?? []) {
    if (!port || typeof port.id !== 'string' || !port.id) errors.push(`System node '${node.id ?? 'unknown'}' has an invalid port`);
    else if (seen.has(port.id)) errors.push(`System node '${node.id}' has duplicate port '${port.id}'`);
    else seen.add(port.id);
  }
  return errors;
}

export function requireSystemNodePort(node, portId) {
  const port = getSystemNodePort(node, portId);
  if (!port) throw new Error(`Unknown system port '${portId}'`);
  return port;
}
