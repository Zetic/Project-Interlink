import {
  CRUSHING_PROCESS_ID,
  getProcessDefinition,
  MAGNETIC_SEPARATION_PROCESS_ID,
  validateProcessParameters,
} from '../../core/processes/definitions/index.js';

function processParameters(processId) {
  return getProcessDefinition(processId).parameters;
}

const catalog = (label, category, description, searchTerms) => Object.freeze({
  label,
  category,
  description,
  searchTerms: Object.freeze([...searchTerms]),
});

export const APPARATUS_DEFINITIONS = Object.freeze({
  extractor: Object.freeze({
    nodeType: 'extractor',
    catalog: catalog('Extractor', 'apparatus', 'Pulls compatible solid matter from a connected Feature resource source.', ['extractor', 'extraction', 'resource access', 'source', 'feed', 'raw material']),
    capabilities: Object.freeze([
      Object.freeze({ id: 'prototypeRateKgPerSecond', label: 'Rated extraction rate', unit: 'kg/s' }),
    ]),
    parameters: Object.freeze([]),
  }),
  hopper: Object.freeze({
    nodeType: 'hopper',
    catalog: catalog('Hopper', 'container', 'Stores discrete material constituents between processing nodes.', ['hopper', 'storage', 'buffer', 'container', 'holding', 'material']),
    capabilities: Object.freeze([
      Object.freeze({ id: 'capacityKg', label: 'Capacity', unit: 'kg' }),
    ]),
    parameters: Object.freeze([]),
  }),
  crusher: Object.freeze({
    nodeType: 'crusher',
    processId: CRUSHING_PROCESS_ID,
    catalog: catalog('Crusher', 'apparatus', 'Reduces the particle size of solid material streams.', ['crusher', 'crushing', 'grinding', 'size reduction', 'ore', 'solid', 'particle']),
    capabilities: Object.freeze([
      Object.freeze({ id: 'throughputKgPerSecond', label: 'Rated throughput', unit: 'kg/s' }),
    ]),
    parameters: processParameters(CRUSHING_PROCESS_ID),
  }),
  magSep: Object.freeze({
    nodeType: 'magSep',
    processId: MAGNETIC_SEPARATION_PROCESS_ID,
    catalog: catalog('Magnetic Separator', 'apparatus', 'Separates material streams using magnetic response.', ['magnetic separator', 'separator', 'separation', 'magnetic', 'concentrate', 'tailings']),
    capabilities: Object.freeze([
      Object.freeze({ id: 'throughputKgPerSecond', label: 'Rated throughput', unit: 'kg/s' }),
      Object.freeze({ id: 'maxFeedParticleSizeMm', label: 'Maximum supported feed particle size', unit: 'mm' }),
    ]),
    parameters: processParameters(MAGNETIC_SEPARATION_PROCESS_ID),
  }),
});

export function getApparatusDefinition(nodeType) {
  return APPARATUS_DEFINITIONS[nodeType] ?? null;
}

export function apparatusParametersForNode(node) {
  return getApparatusDefinition(node?.nodeType)?.parameters ?? [];
}

export function validateApparatusParameters(node, parameters = node) {
  const definition = getApparatusDefinition(node?.nodeType);
  if (!definition?.processId) return {};
  const processDefinition = getProcessDefinition(definition.processId);
  const values = Object.fromEntries(
    (processDefinition.parameters ?? []).map(parameter => [parameter.id, parameters?.[parameter.id]])
  );
  return validateProcessParameters(processDefinition, values);
}
