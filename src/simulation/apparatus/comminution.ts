
import {
  JAW_CRUSHING_PROCESS_ID,
  CONE_CRUSHING_PROCESS_ID,
  MILLING_PROCESS_ID,
  getProcessDefinition,
} from '../../core/processes/definitions/index.js';

const MACHINE_CONFIG = Object.freeze({
  jawCrusher: Object.freeze({ processId: JAW_CRUSHING_PROCESS_ID, sizeField: 'jawProductSizeMm' }),
  coneCrusher: Object.freeze({ processId: CONE_CRUSHING_PROCESS_ID, sizeField: 'coneProductSizeMm' }),
  ballMill: Object.freeze({ processId: MILLING_PROCESS_ID, sizeField: 'millProductSizeMm' }),
});

function createComminutionNode(nodeType, parameters = {}) {
  const config = MACHINE_CONFIG[nodeType];
  if (!config) throw new Error(`Unknown comminution apparatus '${nodeType}'`);
  const definition = getProcessDefinition(config.processId);
  const id = parameters.id;
  const targetSizeMm = parameters[config.sizeField];
  const throughputKgPerSecond = parameters.throughputKgPerSecond;
  const ratedPowerKw = parameters.ratedPowerKw;
  const enabled = parameters.enabled ?? false;
  if (!id || typeof id !== 'string') throw new Error(`${nodeType} id must be a non-empty string`);
  if (!Number.isFinite(targetSizeMm) || targetSizeMm <= 0) throw new Error(`${nodeType} product particle size must be finite and positive`);
  if (!Number.isFinite(throughputKgPerSecond) || throughputKgPerSecond <= 0) throw new Error(`${nodeType} throughput must be finite and positive`);
  if (!Number.isFinite(ratedPowerKw) || ratedPowerKw <= 0) throw new Error(`${nodeType} rated power must be finite and positive`);
  if (typeof enabled !== 'boolean') throw new Error(`${nodeType} enabled must be boolean`);
  return {
    id, nodeType, systemType: nodeType, kind: 'primitive', processId: config.processId,
    [config.sizeField]: targetSizeMm,
    throughputKgPerSecond,
    ratedPowerKw,
    maxFeedParticleSizeMm: definition.maxFeedParticleSizeMm,
    enabled,
    operatingState: enabled ? 'idle' : 'off', lastError: null,
    inputPortId: 'feed', outputPortId: 'product',
    lastSpecificEnergyKWhPerT: 0,
    lastActualPowerKw: 0,
    lastBondAbrasionIndex: 0,
    accumulatedAbrasionTonneAi: 0,
  };
}

export const createJawCrusher = parameters => createComminutionNode('jawCrusher', parameters);
export const createConeCrusher = parameters => createComminutionNode('coneCrusher', parameters);
export const createBallMill = parameters => createComminutionNode('ballMill', parameters);
