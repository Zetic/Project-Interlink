export const PLANET_MAP_WIDTH = 4096;
export const PLANET_MAP_HEIGHT = 2048;
// The logical 2:1 map is interpreted at approximately Earth equatorial scale.
export const EARTH_SCALE_PHYSICAL_WIDTH_METERS = 40_075_000;
export const EARTH_SCALE_PHYSICAL_HEIGHT_METERS = 20_037_500;
export const EARTH_SCALE_METERS_PER_WORLD_UNIT = EARTH_SCALE_PHYSICAL_WIDTH_METERS / PLANET_MAP_WIDTH;
export const EARTH_SCALE_WORLD_UNITS_PER_METER = 1 / EARTH_SCALE_METERS_PER_WORLD_UNIT;
export function metersToWorldUnits(meters) {
    return meters * EARTH_SCALE_WORLD_UNITS_PER_METER;
}
export function worldUnitsToMeters(worldUnits) {
    return worldUnits * EARTH_SCALE_METERS_PER_WORLD_UNIT;
}
export function formatPhysicalDistance(meters) {
    const absolute = Math.abs(meters);
    if (absolute >= 1_000_000)
        return `${(meters / 1000).toFixed(0)} km`;
    if (absolute >= 100_000)
        return `${(meters / 1000).toFixed(1)} km`;
    if (absolute >= 10_000)
        return `${(meters / 1000).toFixed(2)} km`;
    if (absolute >= 1000)
        return `${(meters / 1000).toFixed(2)} km`;
    if (absolute >= 100)
        return `${meters.toFixed(0)} m`;
    if (absolute >= 10)
        return `${meters.toFixed(1)} m`;
    if (absolute >= 1)
        return `${meters.toFixed(2)} m`;
    if (absolute >= 0.01)
        return `${(meters * 100).toFixed(1)} cm`;
    return `${(meters * 1000).toFixed(1)} mm`;
}
