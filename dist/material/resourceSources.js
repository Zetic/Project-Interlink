import { requireMaterialSpecies } from './species.js';
import { validateMineralTextureProfile } from './particulate.js';
export const RESOURCE_SOURCE_TEMPLATES = Object.freeze({
    'iron-ore': Object.freeze({
        composition: Object.freeze([
            Object.freeze({ speciesId: 'hematite', minFraction: 0.20, maxFraction: 0.70 }),
            Object.freeze({ speciesId: 'magnetite', minFraction: 0.05, maxFraction: 0.30 }),
            Object.freeze({ speciesId: 'goethite', minFraction: 0.02, maxFraction: 0.15 }),
            Object.freeze({ speciesId: 'quartz', minFraction: 0.05, maxFraction: 0.25 }),
        ]),
        fragmentationProfileId: 'run-of-mine-rock', initialReserveMassKg: null,
    }),
    'copper-ore': Object.freeze({
        composition: Object.freeze([
            Object.freeze({ speciesId: 'chalcopyrite', minFraction: 0.45, maxFraction: 0.60 }),
            Object.freeze({ speciesId: 'bornite', minFraction: 0.05, maxFraction: 0.15 }),
            Object.freeze({ speciesId: 'pyrite', minFraction: 0.05, maxFraction: 0.15 }),
            Object.freeze({ speciesId: 'quartz', minFraction: 0.15, maxFraction: 0.35 }),
        ]),
        fragmentationProfileId: 'run-of-mine-rock', initialReserveMassKg: null,
    }),
    'aluminum-ore': Object.freeze({
        composition: Object.freeze([
            Object.freeze({ speciesId: 'gibbsite', minFraction: 0.40, maxFraction: 0.60 }),
            Object.freeze({ speciesId: 'boehmite', minFraction: 0.10, maxFraction: 0.25 }),
            Object.freeze({ speciesId: 'kaolinite', minFraction: 0.10, maxFraction: 0.25 }),
            Object.freeze({ speciesId: 'hematite', minFraction: 0.05, maxFraction: 0.20 }),
        ]),
        fragmentationProfileId: 'run-of-mine-rock', initialReserveMassKg: null,
    }),
    limestone: Object.freeze({
        composition: Object.freeze([
            Object.freeze({ speciesId: 'calcite', minFraction: 0.75, maxFraction: 0.90 }),
            Object.freeze({ speciesId: 'dolomite', minFraction: 0.05, maxFraction: 0.20 }),
            Object.freeze({ speciesId: 'quartz', minFraction: 0.01, maxFraction: 0.10 }),
        ]),
        fragmentationProfileId: 'coarse-solid', initialReserveMassKg: null,
    }),
    'silica-sand': Object.freeze({
        composition: Object.freeze([
            Object.freeze({ speciesId: 'quartz', minFraction: 0.85, maxFraction: 0.98 }),
            Object.freeze({ speciesId: 'plagioclase', minFraction: 0.02, maxFraction: 0.15 }),
        ]),
        fragmentationProfileId: 'coarse-solid', initialReserveMassKg: null,
    }),
    coal: Object.freeze({
        composition: Object.freeze([
            Object.freeze({ speciesId: 'graphite', minFraction: 0.65, maxFraction: 0.85 }),
            Object.freeze({ speciesId: 'kaolinite', minFraction: 0.10, maxFraction: 0.25 }),
            Object.freeze({ speciesId: 'pyrite', minFraction: 0.02, maxFraction: 0.10 }),
        ]),
        fragmentationProfileId: 'coarse-solid', initialReserveMassKg: null,
    }),
    'water-ice': Object.freeze({
        composition: Object.freeze([Object.freeze({ speciesId: 'waterIce', minFraction: 1, maxFraction: 1 })]),
        fragmentationProfileId: 'coarse-solid', initialReserveMassKg: null,
    }),
});
const ORE_GRAIN_D50_RANGES_UM = Object.freeze({
    'iron-ore': Object.freeze([45, 450]),
    'copper-ore': Object.freeze([20, 250]),
    'aluminum-ore': Object.freeze([60, 600]),
});
const ORE_COMMINUTION_RANGES = Object.freeze({
    'iron-ore': Object.freeze({ cwi: Object.freeze([6, 16]), bwi: Object.freeze([9, 22]), ai: Object.freeze([0.20, 0.65]) }),
    'copper-ore': Object.freeze({ cwi: Object.freeze([7, 18]), bwi: Object.freeze([10, 24]), ai: Object.freeze([0.25, 0.75]) }),
    'aluminum-ore': Object.freeze({ cwi: Object.freeze([4, 14]), bwi: Object.freeze([7, 18]), ai: Object.freeze([0.05, 0.35]) }),
});
function validateTemplate(template, resourceId) {
    if (!template.composition.length)
        throw new Error(`Resource '${resourceId}' has no material composition.`);
    for (const range of template.composition)
        requireMaterialSpecies(range.speciesId);
    const minTotal = template.composition.reduce((sum, range) => sum + range.minFraction, 0);
    const maxTotal = template.composition.reduce((sum, range) => sum + range.maxFraction, 0);
    if (minTotal > 1 + 1e-12 || maxTotal < 1 - 1e-12)
        throw new Error(`Resource '${resourceId}' composition bounds cannot sum to 100%.`);
}
function sampleBoundedComposition(template, rng) {
    const ranges = template.composition;
    const values = ranges.map(range => range.minFraction);
    let remaining = 1 - values.reduce((sum, value) => sum + value, 0);
    for (let index = 0; index < ranges.length; index += 1) {
        const range = ranges[index];
        const capacity = range.maxFraction - range.minFraction;
        const laterCapacity = ranges.slice(index + 1).reduce((sum, later) => sum + (later.maxFraction - later.minFraction), 0);
        const minimumAdd = Math.max(0, remaining - laterCapacity);
        const maximumAdd = Math.min(capacity, remaining);
        const add = index === ranges.length - 1 ? remaining : rng.range(minimumAdd, maximumAdd);
        values[index] += add;
        remaining -= add;
    }
    if (Math.abs(remaining) > 1e-9)
        throw new Error('Resource composition sampling failed to close to 100%.');
    return ranges.map((range, index) => ({ speciesId: range.speciesId, massFraction: Number(values[index].toFixed(12)) }));
}
function logUniform(rng, min, max) {
    return Math.exp(rng.range(Math.log(min), Math.log(max)));
}
function normalizedOccurrenceModes(rng, complexity) {
    const raw = {
        free: Math.max(0.05, (1.45 - 0.95 * complexity) * rng.range(0.85, 1.15)),
        boundary: Math.max(0.05, rng.range(0.85, 1.15)),
        intergrown: Math.max(0.05, (0.55 + 1.25 * complexity) * rng.range(0.85, 1.15)),
        included: Math.max(0.02, (0.15 + 0.85 * complexity) * rng.range(0.85, 1.15)),
    };
    const total = Object.values(raw).reduce((sum, value) => sum + value, 0);
    const free = Number((raw.free / total).toFixed(4));
    const boundary = Number((raw.boundary / total).toFixed(4));
    const intergrown = Number((raw.intergrown / total).toFixed(4));
    const included = Number(Math.max(0, 1 - free - boundary - intergrown).toFixed(4));
    return { free, boundary, intergrown, included };
}
function stableProfileHash(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}
function createMineralTexture(resourceId, composition, rng) {
    const d50Range = ORE_GRAIN_D50_RANGES_UM[resourceId];
    if (!d50Range)
        return null;
    const occurrenceD50Um = logUniform(rng, d50Range[0], d50Range[1]);
    const complexity = rng.range(0.15, 0.85);
    const speciesTextures = {};
    for (const component of composition) {
        const d50 = occurrenceD50Um * logUniform(rng, 0.8, 1.25);
        speciesTextures[component.speciesId] = {
            grainSizeUm: {
                d10: Number((d50 * rng.range(0.30, 0.60)).toFixed(1)),
                d50: Number(d50.toFixed(1)),
                d90: Number((d50 * rng.range(1.8, 3.5)).toFixed(1)),
            },
            occurrenceModes: normalizedOccurrenceModes(rng, complexity),
        };
    }
    const fingerprint = stableProfileHash(JSON.stringify({ resourceId, composition, speciesTextures }));
    return validateMineralTextureProfile({ id: `texture-${resourceId}-${fingerprint}`, speciesTextures });
}
function createComminutionProperties(resourceId, rng) {
    const ranges = ORE_COMMINUTION_RANGES[resourceId];
    if (!ranges)
        return null;
    return {
        bondCrushingWorkIndexKWhPerT: Number(rng.range(ranges.cwi[0], ranges.cwi[1]).toFixed(2)),
        bondBallMillWorkIndexKWhPerT: Number(rng.range(ranges.bwi[0], ranges.bwi[1]).toFixed(2)),
        bondAbrasionIndex: Number(rng.range(ranges.ai[0], ranges.ai[1]).toFixed(3)),
    };
}
export function createResourceSource(resourceId, rng) {
    const template = RESOURCE_SOURCE_TEMPLATES[resourceId];
    if (!template)
        throw new Error(`No source template for resource '${resourceId}'.`);
    validateTemplate(template, resourceId);
    const composition = sampleBoundedComposition(template, rng);
    const total = composition.reduce((sum, component) => sum + component.massFraction, 0);
    composition[composition.length - 1].massFraction = Number((composition[composition.length - 1].massFraction + (1 - total)).toFixed(12));
    const comminutionProperties = createComminutionProperties(resourceId, rng);
    const mineralTexture = createMineralTexture(resourceId, composition, rng);
    if (mineralTexture && comminutionProperties)
        mineralTexture.comminutionProperties = { ...comminutionProperties };
    return {
        physicalForm: 'solid-particulate', composition,
        initialReserveMassKg: template.initialReserveMassKg,
        fragmentationProfileId: template.fragmentationProfileId,
        mineralTexture,
        comminutionProperties,
    };
}
