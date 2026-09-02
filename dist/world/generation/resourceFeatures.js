import { createResourceSource } from '../../material/resourceSources.js';
import { pointInPolygon, polygonArea } from '../geometry.js';
import { createRng } from '../random.js';
import { RESOURCE_DEFINITIONS, resourceDefinitionById } from '../resources.js';
import { wrappedValueNoise } from './generationNoise.js';
import { samplePlanetEnvironment } from './surfaceField.js';
function clamp01(value) { return Math.max(0.01, Math.min(1, value)); }
function environmentSuitability(environment, resourceId) {
    switch (resourceId) {
        case 'iron-ore': return clamp01(0.18 + environment.tectonicActivity * 0.28 + environment.orogenicInfluence * 0.18 + environment.reliefMeters / 9_500);
        case 'copper-ore': return clamp01(0.04 + environment.volcanicActivity * 0.5 + environment.orogenicInfluence * 0.18 + environment.tectonicActivity * 0.18);
        case 'aluminum-ore': return clamp01(0.04 + environment.thermalIndex * 0.46 + environment.moistureIndex * 0.43);
        case 'limestone': return clamp01(0.05 + environment.sedimentaryBasinFactor * 0.65 + environment.basinInfluence * 0.12 + (1 - environment.reliefMeters / 3_500) * 0.14);
        case 'silica-sand': return clamp01(0.08 + environment.sedimentaryBasinFactor * 0.4 + environment.basinInfluence * 0.1 + (1 - environment.reliefMeters / 3_000) * 0.28);
        case 'coal': return clamp01(0.03 + environment.sedimentaryBasinFactor * 0.43 + environment.basinInfluence * 0.12 + environment.moistureIndex * 0.22 + environment.thermalIndex * 0.1);
        case 'water-ice': return clamp01(0.01 + (1 - environment.thermalIndex) * 0.9);
        default: return 0.01;
    }
}
export function resourceSuitability(region, resourceId) {
    return region.surfaceType === 'land' ? environmentSuitability(region.environment, resourceId) : 0.01;
}
export function resourcePotentialAt(context, point, resourceId) {
    const environment = samplePlanetEnvironment(context, point);
    return resourcePotentialForEnvironment(context, point, resourceId, environment);
}
function resourcePotentialForEnvironment(context, point, resourceId, environment) {
    if (environment.surfaceType !== 'land')
        return 0;
    const province = wrappedValueNoise(context.seed, `resource:province:${resourceId}`, point, 256);
    const local = wrappedValueNoise(context.seed, `resource:local:${resourceId}`, point, 64);
    return clamp01(environmentSuitability(environment, resourceId) * 0.67 + province * 0.25 + local * 0.08);
}
function weightedResource(rng, potentials) {
    const weights = potentials.map(potential => potential ** 1.8);
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
    for (let attempt = 0; attempt < 48; attempt += 1) {
        const point = { x: Number(rng.range(region.bounds.x, region.bounds.x + region.bounds.width).toFixed(6)),
            y: Number(rng.range(region.bounds.y, region.bounds.y + region.bounds.height).toFixed(6)) };
        if (pointInPolygon(point, region.polygon))
            return point;
    }
    return region.center;
}
function candidateCountForRegion(region) {
    const worldArea = polygonArea(region.polygon);
    return Math.max(2, Math.min(96, Math.ceil(worldArea / 650)));
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
        throw new Error('Generator v7 requires land and an Iron Ore definition.');
    const candidates = landRegions.flatMap(region => Array.from({ length: candidateCountForRegion(region) }, (_, index) => {
        const point = candidatePoint(seed, region, index);
        const environment = samplePlanetEnvironment(context, point);
        const potentials = RESOURCE_DEFINITIONS.map(definition => resourcePotentialForEnvironment(context, point, definition.id, environment));
        return { region, point, index, potentials };
    }));
    const ironIndex = RESOURCE_DEFINITIONS.findIndex(definition => definition.id === 'iron-ore');
    const starting = candidates.reduce((best, candidate) => candidate.potentials[ironIndex] > best.potentials[ironIndex] ? candidate : best);
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
        const definition = weightedResource(rng, candidate.potentials);
        const potential = candidate.potentials[RESOURCE_DEFINITIONS.indexOf(definition)];
        if (potential > 0.54 && rng.next() < 0.025 + potential * 0.105)
            append(candidate.region, definition, candidate.point);
    }
    return nodes;
}
