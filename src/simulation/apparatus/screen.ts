
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
