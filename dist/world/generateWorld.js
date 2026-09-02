import { generateLandmasses } from './generation/geography.js';
import { generateRegions } from './generation/regions.js';
import { generateResourceFeatures } from './generation/resourceFeatures.js';
import { createRng } from './random.js';
import { EARTH_SCALE_PHYSICAL_HEIGHT_METERS, EARTH_SCALE_PHYSICAL_WIDTH_METERS, PLANET_MAP_HEIGHT, PLANET_MAP_WIDTH, } from './scale.js';
export { PLANET_MAP_HEIGHT, PLANET_MAP_WIDTH } from './scale.js';
export const WORLD_GENERATOR_VERSION = 2;
const PLANET_NAMES = ['Aethon', 'Boras', 'Caldris', 'Draven', 'Eryndor', 'Feraxis', 'Galneth', 'Havar'];
export function generateWorld(seedInput) {
    const seed = String(seedInput || 'default-seed');
    const planetRng = createRng(seed, `planet:v${WORLD_GENERATOR_VERSION}`);
    const landmasses = generateLandmasses(seed);
    const regions = generateRegions(seed, landmasses);
    const resourceNodes = generateResourceFeatures(seed, regions);
    const planet = {
        id: `planet-${seed.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 48) || 'default'}`,
        seed,
        generatorVersion: WORLD_GENERATOR_VERSION,
        name: planetRng.pick(PLANET_NAMES),
        width: PLANET_MAP_WIDTH,
        height: PLANET_MAP_HEIGHT,
        physicalWidthMeters: EARTH_SCALE_PHYSICAL_WIDTH_METERS,
        physicalHeightMeters: EARTH_SCALE_PHYSICAL_HEIGHT_METERS,
        landmasses,
        regions,
        resourceNodes,
    };
    return { planet };
}
