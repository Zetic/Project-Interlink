import { samplePlanetEnvironment } from './surfaceField.js';
/** Canonical regional summary sampled from the same surface field used for land/ocean ownership. */
export function createRegionEnvironment(context, center) {
    return samplePlanetEnvironment(context, center);
}
