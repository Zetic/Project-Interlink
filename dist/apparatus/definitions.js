const resourceInput = (id, label) => ({
    id,
    direction: 'input',
    kind: 'resource-access',
    medium: 'resource',
    label,
});
const solidInput = (id, label) => ({
    id,
    direction: 'input',
    kind: 'material',
    medium: 'solid',
    label,
});
const solidOutput = (id, label) => ({
    id,
    direction: 'output',
    kind: 'material',
    medium: 'solid',
    label,
});
const gasInput = (id, label) => ({
    id,
    direction: 'input',
    kind: 'material',
    medium: 'gas',
    label,
});
const gasOutput = (id, label) => ({
    id,
    direction: 'output',
    kind: 'material',
    medium: 'gas',
    label,
});
const define = (definition) => Object.freeze({
    ...definition,
    searchTerms: Object.freeze([...definition.searchTerms]),
    ports: Object.freeze(definition.ports.map(port => Object.freeze({ ...port }))),
    ...(definition.parameters ? {
        parameters: Object.freeze(definition.parameters.map(parameter => Object.freeze({
            ...parameter,
            ...(parameter.choices ? { choices: Object.freeze(parameter.choices.map(choice => Object.freeze({ ...choice }))) } : {}),
        }))),
    } : {}),
    ...(definition.runtimeDefaults ? { runtimeDefaults: Object.freeze({ ...definition.runtimeDefaults }) } : {}),
});
export const APPARATUS_DEFINITIONS = Object.freeze([
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
        description: 'Primary crusher for reducing run-of-mine rock to a coarse plant feed with limited direct liberation.',
        searchTerms: ['jaw crusher', 'primary crusher', 'primary crushing', 'run of mine', 'rom', 'ore'],
        physicalWidthMeters: 14, physicalHeightMeters: 9,
        ports: [solidInput('feed', 'feed'), solidOutput('product', 'product')],
        parameters: [
            { id: 'jawProductSizeMm', label: 'Nominal product size', unit: 'mm', min: 120, max: 250, step: 130, defaultValue: 120,
                choices: [{ value: 120, label: '120 mm' }, { value: 250, label: '250 mm' }] },
        ],
        runtimeDefaults: { throughputKgPerSecond: 8, ratedPowerKw: 8, maxFeedParticleSizeMm: 1000 },
    }),
    define({
        id: 'cone-crusher', nodeType: 'coneCrusher', label: 'Cone Crusher', category: 'apparatus', order: 30,
        description: 'Secondary or tertiary crusher for reducing coarse rock to mill-ready sizes.',
        searchTerms: ['cone crusher', 'secondary crusher', 'tertiary crusher', 'size reduction', 'ore'],
        physicalWidthMeters: 14, physicalHeightMeters: 9,
        ports: [solidInput('feed', 'feed'), solidOutput('product', 'product')],
        parameters: [
            { id: 'coneProductSizeMm', label: 'Nominal product size', unit: 'mm', min: 5, max: 60, step: 5, defaultValue: 25,
                choices: [{ value: 5, label: '5 mm' }, { value: 15, label: '15 mm' }, { value: 25, label: '25 mm' }, { value: 60, label: '60 mm' }] },
        ],
        runtimeDefaults: { throughputKgPerSecond: 5, ratedPowerKw: 10, maxFeedParticleSizeMm: 250 },
    }),
    define({
        id: 'ball-mill', nodeType: 'ballMill', label: 'Ball Mill', category: 'apparatus', order: 40,
        description: 'Fine grinding equipment that reduces mill-ready feed into the sub-millimetre regime.',
        searchTerms: ['ball mill', 'mill', 'milling', 'grinding', 'comminution', 'liberation'],
        physicalWidthMeters: 18, physicalHeightMeters: 10,
        ports: [solidInput('feed', 'feed'), solidOutput('product', 'product')],
        parameters: [
            { id: 'millProductSizeMm', label: 'Nominal product size', unit: 'mm', min: 0.032, max: 0.5, step: 0.001, defaultValue: 0.25,
                choices: [{ value: 0.5, label: '500 µm' }, { value: 0.25, label: '250 µm' }, { value: 0.125, label: '125 µm' }, { value: 0.063, label: '63 µm' }, { value: 0.032, label: '32 µm' }] },
        ],
        runtimeDefaults: { throughputKgPerSecond: 2, ratedPowerKw: 75, maxFeedParticleSizeMm: 25 },
    }),
    define({
        id: 'screen', nodeType: 'screen', label: 'Screen', category: 'apparatus', order: 50,
        description: 'Separates solid particulate material into explicit undersize and oversize streams.',
        searchTerms: ['screen', 'sieve', 'screening', 'size separation', 'undersize', 'oversize'],
        physicalWidthMeters: 14, physicalHeightMeters: 10,
        ports: [solidInput('feed', 'feed'), solidOutput('undersize', 'undersize'), solidOutput('oversize', 'oversize')],
        parameters: [
            { id: 'apertureSizeMm', label: 'Aperture size', unit: 'mm', min: 1, max: 120, step: 1, defaultValue: 25,
                choices: [{ value: 1, label: '≤1 mm' }, { value: 5, label: '≤5 mm' }, { value: 15, label: '≤15 mm' }, { value: 25, label: '≤25 mm' }, { value: 60, label: '≤60 mm' }, { value: 120, label: '≤120 mm' }] },
        ],
        runtimeDefaults: { throughputKgPerSecond: 4 },
    }),
    define({
        id: 'splitter', nodeType: 'splitter', label: 'Splitter', category: 'apparatus', order: 60,
        description: 'Divides one stored particulate feed into two explicitly conserved material outputs.',
        searchTerms: ['splitter', 'split', 'branch', 'routing', 'fan out', 'ratio'],
        physicalWidthMeters: 12, physicalHeightMeters: 9,
        ports: [solidInput('feed', 'feed'), solidOutput('output-a', 'A'), solidOutput('output-b', 'B')],
        parameters: [
            { id: 'splitFractionToA', label: 'Split to output A', unit: '', min: 0, max: 1, step: 0.01, defaultValue: 0.5 },
        ],
        runtimeDefaults: { throughputKgPerSecond: 10 },
    }),
    define({
        id: 'material-merger', nodeType: 'merger', label: 'Material Merger', category: 'apparatus', order: 70,
        description: 'Combines two stored particulate feeds into one conserved material output without changing their descriptors.',
        searchTerms: ['merger', 'merge', 'combine', 'junction', 'routing', 'fan in'],
        physicalWidthMeters: 12, physicalHeightMeters: 9,
        ports: [solidInput('input-a', 'A'), solidInput('input-b', 'B'), solidOutput('product', 'product')],
        runtimeDefaults: { throughputKgPerSecond: 10 },
    }),
    define({
        id: 'feeder', nodeType: 'feeder', label: 'Feeder', category: 'apparatus', order: 80,
        description: 'Meters stored particulate material into downstream equipment at a configured mass-flow setpoint.',
        searchTerms: ['feeder', 'feed', 'meter', 'flow control', 'rate', 'throughput'],
        physicalWidthMeters: 12, physicalHeightMeters: 8,
        ports: [solidInput('feed', 'feed'), solidOutput('product', 'product')],
        parameters: [
            { id: 'flowRateKgPerSecond', label: 'Feed rate', unit: 'kg/s', min: 0, max: 10, step: 0.1, defaultValue: 4 },
        ],
        runtimeDefaults: { throughputKgPerSecond: 10 },
    }),
    define({
        id: 'magnetic-separator', nodeType: 'magSep', label: 'Dry Drum Magnetic Separator', category: 'apparatus', order: 90,
        description: 'Dry coarse magnetic preconcentrator for recovering strongly magnetic material before fine grinding.',
        searchTerms: ['magnetic separator', 'dry drum', 'separator', 'magnetic', 'concentrate', 'tailings'],
        physicalWidthMeters: 16, physicalHeightMeters: 10,
        ports: [solidInput('feed', 'feed'), solidOutput('concentrate', 'concentrate'), solidOutput('tailings', 'tailings')],
        parameters: [
            { id: 'fieldStrength', label: 'Field strength', unit: '', min: 0, max: 1, step: 0.01, defaultValue: 0.6 },
        ],
        runtimeDefaults: { throughputKgPerSecond: 4, maxFeedParticleSizeMm: 25 },
    }),
    define({
        id: 'electric-roasting-furnace', nodeType: 'roastingFurnace', label: 'Electric Roasting Furnace', category: 'apparatus', order: 95,
        description: 'Continuous electric roasting apparatus with retained thermal state and explicit gas exhaust.',
        searchTerms: ['roasting furnace', 'furnace', 'roast', 'thermal', 'thermochemical', 'goethite'],
        physicalWidthMeters: 20, physicalHeightMeters: 12,
        ports: [solidInput('feed', 'feed'), solidOutput('solid-product', 'solid product'), gasOutput('gas-exhaust', 'gas exhaust')],
        parameters: [
            { id: 'temperatureSetpointK', label: 'Temperature setpoint', unit: 'K', min: 300, max: 1400, step: 10, defaultValue: 900 },
        ],
        runtimeDefaults: {
            ratedHeaterPowerKw: 60,
            maximumOperatingTemperatureK: 1200,
            maximumSolidThroughputKgPerSecond: 4,
            effectiveChamberHoldUpKg: 20,
            heatLossCoefficientWPerK: 25,
            internalZoneCount: 4,
        },
    }),
    define({
        id: 'exhaust-vent', nodeType: 'exhaustVent', label: 'Exhaust Vent', category: 'container', order: 96,
        description: 'Auditable environmental gas boundary that records discharged process gas.',
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
export function apparatusDefinitionById(id) {
    return APPARATUS_DEFINITIONS.find(definition => definition.id === id) ?? null;
}
export function apparatusDefinitionsByCategory(category) {
    return APPARATUS_DEFINITIONS.filter(definition => definition.category === category);
}
