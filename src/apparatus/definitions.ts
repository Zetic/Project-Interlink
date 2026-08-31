import type { MechanicalNodeCategory } from '../graph/types.js';
import type { NodePort } from '../world/types.js';

export interface ApparatusParameterDefinition {
  id: string;
  label: string;
  unit: string;
  min: number;
  step: number;
  defaultValue: number;
}

export interface ApparatusDefinition {
  id: string;
  nodeType: string;
  label: string;
  category: MechanicalNodeCategory;
  description: string;
  searchTerms: readonly string[];
  order: number;
  physicalWidthMeters: number;
  physicalHeightMeters: number;
  ports: readonly NodePort[];
  parameters?: readonly ApparatusParameterDefinition[];
}

const resourceInput = (id: string, label: string): NodePort => ({
  id,
  direction: 'input',
  kind: 'resource-access',
  medium: 'resource',
  label,
});

const solidInput = (id: string, label: string): NodePort => ({
  id,
  direction: 'input',
  kind: 'material',
  medium: 'solid',
  label,
});

const solidOutput = (id: string, label: string): NodePort => ({
  id,
  direction: 'output',
  kind: 'material',
  medium: 'solid',
  label,
});

const gasInput = (id: string, label: string): NodePort => ({
  id,
  direction: 'input',
  kind: 'material',
  medium: 'gas',
  label,
});

const gasOutput = (id: string, label: string): NodePort => ({
  id,
  direction: 'output',
  kind: 'material',
  medium: 'gas',
  label,
});

const define = (definition: ApparatusDefinition): ApparatusDefinition => Object.freeze({
  ...definition,
  searchTerms: Object.freeze([...definition.searchTerms]),
  ports: Object.freeze(definition.ports.map(port => Object.freeze({ ...port }))),
  ...(definition.parameters ? {
    parameters: Object.freeze(definition.parameters.map(parameter => Object.freeze({ ...parameter }))),
  } : {}),
});

export const APPARATUS_DEFINITIONS: readonly ApparatusDefinition[] = Object.freeze([
  define({
    id: 'extractor', nodeType: 'extractor', label: 'Extractor', category: 'apparatus', order: 10,
    description: 'Pulls compatible solid matter from a connected Feature resource source.',
    searchTerms: ['extractor', 'extraction', 'resource access', 'source', 'feed', 'raw material'],
    physicalWidthMeters: 12, physicalHeightMeters: 8,
    ports: [resourceInput('resource-source', 'resource source'), solidOutput('output', 'output')],
    parameters: [
      { id: 'rateKgPerSecond', label: 'Extraction rate', unit: 'kg/s', min: 0.001, step: 0.1, defaultValue: 5 },
    ],
  }),
  define({
    id: 'jaw-crusher', nodeType: 'jawCrusher', label: 'Jaw Crusher', category: 'apparatus', order: 20,
    description: 'Primary crusher for reducing run-of-mine rock to a coarse plant feed.',
    searchTerms: ['jaw crusher', 'primary crusher', 'primary crushing', 'run of mine', 'rom', 'ore'],
    physicalWidthMeters: 14, physicalHeightMeters: 9,
    ports: [solidInput('feed', 'feed'), solidOutput('product', 'product')],
  }),
  define({
    id: 'cone-crusher', nodeType: 'coneCrusher', label: 'Cone Crusher', category: 'apparatus', order: 30,
    description: 'Secondary or tertiary crusher for reducing coarse rock to mill-ready sizes.',
    searchTerms: ['cone crusher', 'secondary crusher', 'tertiary crusher', 'size reduction', 'ore'],
    physicalWidthMeters: 14, physicalHeightMeters: 9,
    ports: [solidInput('feed', 'feed'), solidOutput('product', 'product')],
  }),
  define({
    id: 'ball-mill', nodeType: 'ballMill', label: 'Ball Mill', category: 'apparatus', order: 40,
    description: 'Fine grinding equipment that reduces mill-ready feed into the sub-millimetre regime.',
    searchTerms: ['ball mill', 'mill', 'milling', 'grinding', 'comminution', 'liberation'],
    physicalWidthMeters: 18, physicalHeightMeters: 10,
    ports: [solidInput('feed', 'feed'), solidOutput('product', 'product')],
  }),
  define({
    id: 'screen', nodeType: 'screen', label: 'Screen', category: 'apparatus', order: 50,
    description: 'Separates solid particulate material into undersize and oversize streams.',
    searchTerms: ['screen', 'sieve', 'screening', 'size separation', 'undersize', 'oversize'],
    physicalWidthMeters: 14, physicalHeightMeters: 10,
    ports: [solidInput('feed', 'feed'), solidOutput('undersize', 'undersize'), solidOutput('oversize', 'oversize')],
  }),
  define({
    id: 'splitter', nodeType: 'splitter', label: 'Splitter', category: 'apparatus', order: 60,
    description: 'Divides one stored particulate feed into two material outputs.',
    searchTerms: ['splitter', 'split', 'branch', 'routing', 'fan out', 'ratio'],
    physicalWidthMeters: 12, physicalHeightMeters: 9,
    ports: [solidInput('feed', 'feed'), solidOutput('output-a', 'A'), solidOutput('output-b', 'B')],
  }),
  define({
    id: 'material-merger', nodeType: 'merger', label: 'Material Merger', category: 'apparatus', order: 70,
    description: 'Combines two stored particulate feeds into one material output.',
    searchTerms: ['merger', 'merge', 'combine', 'junction', 'routing', 'fan in'],
    physicalWidthMeters: 12, physicalHeightMeters: 9,
    ports: [solidInput('input-a', 'A'), solidInput('input-b', 'B'), solidOutput('product', 'product')],
  }),
  define({
    id: 'feeder', nodeType: 'feeder', label: 'Feeder', category: 'apparatus', order: 80,
    description: 'Meters stored particulate material into downstream equipment.',
    searchTerms: ['feeder', 'feed', 'meter', 'flow control', 'rate', 'throughput'],
    physicalWidthMeters: 12, physicalHeightMeters: 8,
    ports: [solidInput('feed', 'feed'), solidOutput('product', 'product')],
  }),
  define({
    id: 'magnetic-separator', nodeType: 'magSep', label: 'Dry Drum Magnetic Separator', category: 'apparatus', order: 90,
    description: 'Dry coarse magnetic preconcentrator for recovering strongly magnetic material.',
    searchTerms: ['magnetic separator', 'dry drum', 'separator', 'magnetic', 'concentrate', 'tailings'],
    physicalWidthMeters: 16, physicalHeightMeters: 10,
    ports: [solidInput('feed', 'feed'), solidOutput('concentrate', 'concentrate'), solidOutput('tailings', 'tailings')],
  }),
  define({
    id: 'electric-roasting-furnace', nodeType: 'roastingFurnace', label: 'Electric Roasting Furnace', category: 'apparatus', order: 95,
    description: 'Continuous electric roasting apparatus. Runtime process behavior remains disconnected in Phase 4.',
    searchTerms: ['roasting furnace', 'furnace', 'roast', 'thermal', 'thermochemical'],
    physicalWidthMeters: 20, physicalHeightMeters: 12,
    ports: [solidInput('feed', 'feed'), solidOutput('solid-product', 'solid product'), gasOutput('gas-exhaust', 'gas exhaust')],
  }),
  define({
    id: 'exhaust-vent', nodeType: 'exhaustVent', label: 'Exhaust Vent', category: 'container', order: 96,
    description: 'Environmental gas boundary. Runtime discharge accounting remains disconnected in Phase 4.',
    searchTerms: ['exhaust', 'vent', 'gas', 'off-gas', 'emissions'],
    physicalWidthMeters: 10, physicalHeightMeters: 7,
    ports: [gasInput('gas-in', 'gas in')],
  }),
  define({
    id: 'hopper', nodeType: 'hopper', label: 'Hopper', category: 'container', order: 100,
    description: 'Stores material between processing nodes.',
    searchTerms: ['hopper', 'storage', 'buffer', 'container', 'holding', 'material'],
    physicalWidthMeters: 12, physicalHeightMeters: 8,
    ports: [solidInput('input', 'in'), solidOutput('output', 'out')],
    parameters: [
      { id: 'capacityKg', label: 'Capacity', unit: 'kg', min: 0.001, step: 10, defaultValue: 1000 },
    ],
  }),
]);

export function apparatusDefinitionById(id: string): ApparatusDefinition | null {
  return APPARATUS_DEFINITIONS.find(definition => definition.id === id) ?? null;
}

export function apparatusDefinitionsByCategory(category: MechanicalNodeCategory): readonly ApparatusDefinition[] {
  return APPARATUS_DEFINITIONS.filter(definition => definition.category === category);
}
