
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
