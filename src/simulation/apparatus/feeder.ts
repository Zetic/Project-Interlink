
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
