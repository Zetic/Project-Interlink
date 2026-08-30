
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
