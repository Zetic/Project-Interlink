import { PLANET_MAP_HEIGHT } from '../scale.js';
import { valueNoise } from './geography.js';
function clamp01(value) { return Math.max(0, Math.min(1, value)); }
function rounded(value, digits = 4) { return Number(value.toFixed(digits)); }
export function createRegionEnvironment(seed, center) {
    const latitudeDeg = 90 - (center.y / PLANET_MAP_HEIGHT) * 180;
    const latitudeWarmth = 1 - Math.abs(latitudeDeg) / 90;
    const elevationTendency = valueNoise(seed, 'field:elevation', center, 330);
    const reliefTendency = clamp01(valueNoise(seed, 'field:relief', center, 210) * 0.7 + elevationTendency * 0.3);
    const moistureIndex = clamp01(valueNoise(seed, 'field:moisture', center, 470) * 0.72 + latitudeWarmth * 0.28);
    const tectonicActivity = clamp01(valueNoise(seed, 'field:tectonic', center, 250) ** 1.35);
    const volcanicActivity = clamp01(tectonicActivity * 0.68 + valueNoise(seed, 'field:volcanic', center, 180) * 0.32);
    const sedimentaryBasinFactor = clamp01(valueNoise(seed, 'field:sedimentary', center, 390) * 0.58 + (1 - reliefTendency) * 0.27 + moistureIndex * 0.15);
    const thermalIndex = clamp01(latitudeWarmth * 0.82 + valueNoise(seed, 'field:thermal', center, 520) * 0.18 - elevationTendency * 0.08);
    return {
        latitudeDeg: rounded(latitudeDeg, 3),
        meanElevationMeters: Math.round(80 + elevationTendency ** 1.45 * 3_650),
        reliefMeters: Math.round(45 + reliefTendency ** 1.35 * 2_250),
        thermalIndex: rounded(thermalIndex),
        moistureIndex: rounded(moistureIndex),
        tectonicActivity: rounded(tectonicActivity),
        volcanicActivity: rounded(volcanicActivity),
        sedimentaryBasinFactor: rounded(sedimentaryBasinFactor),
    };
}
