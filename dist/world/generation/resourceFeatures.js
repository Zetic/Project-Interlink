import { createResourceSource } from '../../material/resourceSources.js';
import { createRng } from '../random.js';
import { RESOURCE_DEFINITIONS, resourceDefinitionById } from '../resources.js';
import { samplePlanetEnvironment, wrappedValueNoise } from './surfaceField.js';
function clamp01(value) { return Math.max(0.01, Math.min(1, value)); }
function environmentSuitability(environment, resourceId) {
    switch (resourceId) {
        case 'iron-ore': return clamp01(0.2 + environment.tectonicActivity * 0.38 + environment.reliefMeters / 8_500);
        case 'copper-ore': return clamp01(0.04 + environment.volcanicActivity * 0.6 + environment.tectonicActivity * 0.28);
        case 'aluminum-ore': return clamp01(0.04 + environment.thermalIndex * 0.46 + environment.moistureIndex * 0.43);
        case 'limestone': return clamp01(0.05 + environment.sedimentaryBasinFactor * 0.72 + (1 - environment.reliefMeters / 3_500) * 0.18);
        case 'silica-sand': return clamp01(0.08 + environment.sedimentaryBasinFactor * 0.45 + (1 - environment.reliefMeters / 3_000) * 0.32);
        case 'coal': return clamp01(0.03 + environment.sedimentaryBasinFactor * 0.5 + environment.moistureIndex * 0.25 + environment.thermalIndex * 0.12);
        case 'water-ice': return clamp01(0.01 + (1 - environment.thermalIndex) * 0.9);
        default: return 0.01;
    }
}
export function resourceSuitability(region, resourceId) {
    return region.surfaceType === 'land' ? environmentSuitability(region.environment, resourceId) : 0.01;
}
export function resourcePotentialAt(context, point, resourceId) {
    const environment = samplePlanetEnvironment(context, point);
    if (environment.surfaceType !== 'land')
        return 0;
    const province = wrappedValueNoise(context.seed, `resource:province:${resourceId}`, point, 256);
    const local = wrappedValueNoise(context.seed, `resource:local:${resourceId}`, point, 64);
    return clamp01(environmentSuitability(environment, resourceId) * 0.67 + province * 0.25 + local * 0.08);
}
function weightedResource(rng, context, point) {
    const weights = RESOURCE_DEFINITIONS.map(definition => resourcePotentialAt(context, point, definition.id) ** 1.8);
    let cursor = rng.range(0, weights.reduce((sum, weight) => sum + weight, 0));
    for (let index = 0; index < RESOURCE_DEFINITIONS.length; index += 1) {
        cursor -= weights[index];
        if (cursor <= 0)
            return RESOURCE_DEFINITIONS[index];
    }
    return RESOURCE_DEFINITIONS[RESOURCE_DEFINITIONS.length - 1];
}
function candidatePoint(seed, region, index) {
    const rng = createRng(seed, `${region.id}:resource-candidate:${index}`);
    return { x: Number(rng.range(region.bounds.x + region.bounds.width * 0.12, region.bounds.x + region.bounds.width * 0.88).toFixed(6)),
        y: Number(rng.range(region.bounds.y + region.bounds.height * 0.12, region.bounds.y + region.bounds.height * 0.88).toFixed(6)) };
}
function createNode(seed, region, definition, point, index) {
    const id = `${region.id}-feature-${index}`;
    return { id, name: `${definition.name} Deposit · ${region.name}`, resourceId: definition.id, regionId: region.id, position: point,
        nodeType: 'feature', featureType: 'mineral-deposit', source: createResourceSource(definition.id, createRng(seed, `${id}:source-composition`)),
        resourceAccessPortId: 'resource-access', ports: [{ id: 'resource-access', direction: 'output', kind: 'resource-access', medium: 'resource', label: 'resources' }] };
}
export function generateResourceFeatures(seed, regions, context) {
    const iron = resourceDefinitionById('iron-ore');
    const landRegions = regions.filter(region => region.surfaceType === 'land');
    if (!iron || landRegions.length === 0)
        throw new Error('Generator v3 requires land and an Iron Ore definition.');
    const candidates = landRegions.flatMap(region => [0, 1].map(index => ({ region, point: candidatePoint(seed, region, index), index })));
    const starting = candidates.reduce((best, candidate) => resourcePotentialAt(context, candidate.point, 'iron-ore') > resourcePotentialAt(context, best.point, 'iron-ore') ? candidate : best);
    const nodes = [];
    const localCounts = new Map();
    const append = (region, definition, point) => {
        const index = localCounts.get(region.id) ?? 0;
        localCounts.set(region.id, index + 1);
        const node = createNode(seed, region, definition, point, index);
        region.resourceNodeIds.push(node.id);
        nodes.push(node);
    };
    append(starting.region, iron, starting.point);
    for (const candidate of candidates) {
        if (candidate === starting)
            continue;
        const rng = createRng(seed, `${candidate.region.id}:feature-choice:${candidate.index}`);
        const definition = weightedResource(rng, context, candidate.point);
        const potential = resourcePotentialAt(context, candidate.point, definition.id);
        if (potential > 0.54 && rng.next() < 0.025 + potential * 0.105)
            append(candidate.region, definition, candidate.point);
    }
    return nodes;
}
