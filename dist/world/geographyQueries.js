import { environmentContextForPlanet, samplePlanetEnvironment } from './generation/surfaceField.js';
import { worldSpatialIndexFor } from './spatialIndex.js';
export function geographicLocationAt(planet, point, index = worldSpatialIndexFor(planet)) {
    const region = index.regionContaining(point);
    if (!region)
        return null;
    const parent = region.parentKind === 'continent' ? index.continentById(region.parentId) : index.oceanById(region.parentId);
    if (!parent)
        return null;
    return { region, parent, environment: samplePlanetEnvironment(environmentContextForPlanet(planet), point) };
}
export function geographicLocationKey(planet, point, cellSize = 16) {
    const context = geographicLocationAt(planet, point);
    if (!context)
        return `none:${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`;
    return `${context.parent.id}:${context.region.id}:${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`;
}
