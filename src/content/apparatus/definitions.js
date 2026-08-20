import {
 CRUSHING_PROCESS_ID,
 defaultProcessParameters,
 getProcessDefinition,
 MAGNETIC_SEPARATION_PROCESS_ID,
 validateProcessParameters,
} from '../../core/processes/definitions/index.js';
import { PORT_CAPABILITIES } from '../../core/systems/ports.js';

function processParameters(processId) {
  return getProcessDefinition(processId).parameters;
}

const catalog = (id, label, category, description, searchTerms) => Object.freeze({
  id,
  label,
  category,
  description,
  searchTerms: Object.freeze([...searchTerms]),
});

const resourceSourcePort = Object.freeze({
  id: 'resource-source',
  direction: 'input',
  kind: 'resource-access',
  label: 'resource source',
  accepts: Object.freeze([PORT_CAPABILITIES.RESOURCE_SOURCE]),
  runtimePortField: 'sourceInputPortId',
});
const solidInputPort = (
  id,
  accepts = PORT_CAPABILITIES.SOLID_PARTICULATE,
  runtimePortField = 'inputPortId',
) => Object.freeze({
  id,
  direction: 'input',
  kind: 'material',
  label: id,
  accepts: Object.freeze([accepts]),
  runtimePortField,
});
const solidOutputPort = (
  id,
  provides = [PORT_CAPABILITIES.SOLID_PARTICULATE],
  runtimePortField = 'outputPortId',
) => Object.freeze({
  id,
  direction: 'output',
  kind: 'material',
  label: id,
  provides: Object.freeze(Array.isArray(provides) ? [...provides] : [provides]),
  runtimePortField,
});

export const APPARATUS_DEFINITIONS = Object.freeze({
  extractor: Object.freeze({
    nodeType: 'extractor',
    catalog: catalog('extractor', 'Extractor', 'apparatus', 'Pulls compatible solid matter from a connected Feature resource source.', ['extractor', 'extraction', 'resource access', 'source', 'feed', 'raw material']),
    defaults: Object.freeze({ prototypeRateKgPerSecond: 5 }),
    placementParameterAliases: Object.freeze({ prototypeRateKgPerSecond: 'rateKgPerSecond' }),
    ports: Object.freeze([
      resourceSourcePort,
      solidOutputPort('output'),
    ]),
    capabilities: Object.freeze([
      Object.freeze({ id: 'prototypeRateKgPerSecond', label: 'Rated extraction rate', unit: 'kg/s' }),
    ]),
    parameters: Object.freeze([]),
  }),
  hopper: Object.freeze({
    nodeType: 'hopper',
    catalog: catalog('hopper', 'Hopper', 'container', 'Stores discrete material constituents between processing nodes.', ['hopper', 'storage', 'buffer', 'container', 'holding', 'material']),
    defaults: Object.freeze({ capacityKg: 1000 }),
    ports: Object.freeze([
      solidInputPort('input'),
      solidOutputPort('output', [
        PORT_CAPABILITIES.SOLID_PARTICULATE,
        PORT_CAPABILITIES.STORED_SOLID_PARTICULATE,
      ]),
    ]),
    capabilities: Object.freeze([
      Object.freeze({ id: 'capacityKg', label: 'Capacity', unit: 'kg' }),
    ]),
    parameters: Object.freeze([]),
  }),
  crusher: Object.freeze({
    nodeType: 'crusher',
    processId: CRUSHING_PROCESS_ID,
    catalog: catalog('crusher', 'Crusher', 'apparatus', 'Reduces the particle size of solid material streams.', ['crusher', 'crushing', 'grinding', 'size reduction', 'ore', 'solid', 'particle']),
    defaults: Object.freeze({
      ...defaultProcessParameters(CRUSHING_PROCESS_ID),
      throughputKgPerSecond: 4,
    }),
    ports: Object.freeze([
      solidInputPort('feed', PORT_CAPABILITIES.STORED_SOLID_PARTICULATE),
      solidOutputPort('product'),
    ]),
    capabilities: Object.freeze([
      Object.freeze({ id: 'throughputKgPerSecond', label: 'Rated throughput', unit: 'kg/s' }),
    ]),
    parameters: processParameters(CRUSHING_PROCESS_ID),
  }),
  magSep: Object.freeze({
    nodeType: 'magSep',
    processId: MAGNETIC_SEPARATION_PROCESS_ID,
    catalog: catalog('magnetic-separator', 'Magnetic Separator', 'apparatus', 'Separates material streams using magnetic response.', ['magnetic separator', 'separator', 'separation', 'magnetic', 'concentrate', 'tailings']),
    defaults: Object.freeze({
      ...defaultProcessParameters(MAGNETIC_SEPARATION_PROCESS_ID),
      throughputKgPerSecond: 4,
    }),
    ports: Object.freeze([
      solidInputPort('feed', PORT_CAPABILITIES.STORED_SOLID_PARTICULATE),
      solidOutputPort('concentrate', undefined, 'concentratePortId'),
      solidOutputPort('tailings', undefined, 'tailingsPortId'),
    ]),
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
