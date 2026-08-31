
import { MAGNETIC_SEPARATION_PROCESS_ID, getProcessDefinition } from '../../core/processes/definitions/index.js';

export function createMagneticSeparator({ id, fieldStrength = 0.5, throughputKgPerSecond = 4, enabled = false } = {}) {
  if (!id || typeof id !== 'string') throw new Error('Magnetic Separator id must be a non-empty string');
  if (!Number.isFinite(fieldStrength) || fieldStrength < 0 || fieldStrength > 1) throw new Error('Magnetic Separator field strength must be within [0, 1]');
  if (!Number.isFinite(throughputKgPerSecond) || throughputKgPerSecond <= 0) throw new Error('Magnetic Separator throughput must be finite and positive');
  if (typeof enabled !== 'boolean') throw new Error('Magnetic Separator enabled must be boolean');
  return {
    id, nodeType: 'magSep', systemType: 'magnetic-separator', kind: 'primitive', processId: MAGNETIC_SEPARATION_PROCESS_ID,
    fieldStrength, throughputKgPerSecond,
    maxFeedParticleSizeMm: getProcessDefinition(MAGNETIC_SEPARATION_PROCESS_ID).maxFeedParticleSizeMm,
    enabled, operatingState: enabled ? 'idle' : 'off', lastError: null,
    inputPortId: 'feed', concentratePortId: 'concentrate', tailingsPortId: 'tailings',
  };
}
