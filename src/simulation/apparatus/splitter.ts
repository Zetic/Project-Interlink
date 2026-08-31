
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
