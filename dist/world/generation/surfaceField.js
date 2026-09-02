import { deterministicUnit } from '../random.js';
import { PLANET_MAP_HEIGHT, PLANET_MAP_WIDTH } from '../scale.js';
import { wrappedValueNoise } from './generationNoise.js';
import { geologicalHistoryFromPlateSample } from './geologicalHistory.js';
import { samplePlateModel } from './tectonics.js';
export const CANONICAL_SURFACE_COLUMNS = 176;
export const CANONICAL_SURFACE_ROWS = 88;
const PLANET_SURFACE_FIELDS = new WeakMap();
export function environmentContextForPlanet(planet) {
    let surfaceField = PLANET_SURFACE_FIELDS.get(planet);
    if (!surfaceField) {
        surfaceField = generateSurfaceField(planet.seed, planet.tectonicPlates, planet.seaLevelRaw);
        PLANET_SURFACE_FIELDS.set(planet, surfaceField);
    }
    return { seed: planet.seed, plates: planet.tectonicPlates, seaLevelRaw: planet.seaLevelRaw, surfaceField };
}
export function registerPlanetSurfaceField(planet, surfaceField) {
    PLANET_SURFACE_FIELDS.set(planet, surfaceField);
}
function clamp01(value) { return Math.max(0, Math.min(1, value)); }
function round(value, digits = 6) { return Number(value.toFixed(digits)); }
export function rawSurfaceElevation(seed, plates, point) {
    const plate = samplePlateModel(plates, point);
    const history = geologicalHistoryFromPlateSample(seed, point, plate);
    const macro = (wrappedValueNoise(seed, 'surface:macro', point, 1024) - 0.5) * 0.78;
    const meso = (wrappedValueNoise(seed, 'surface:meso', point, 512) - 0.5) * 0.36;
    const detail = (wrappedValueNoise(seed, 'surface:detail', point, 256) - 0.5) * 0.12;
    // Long-lived crustal thickening/uplift and rift/trench/basin subsidence now
    // shape topography explicitly instead of a one-off boundary elevation offset.
    const historyEffect = history.upliftIndex * 0.42 - history.subsidenceIndex * 0.36;
    const thicknessReference = plate.plate.crustType === 'continental' ? 35 : 7.2;
    const isostaticThicknessEffect = (history.crustThicknessKm - thicknessReference)
        * (plate.plate.crustType === 'continental' ? 0.012 : 0.018);
    return plate.plate.crustBias + macro + meso + detail + historyEffect + isostaticThicknessEffect;
}
function fieldIndex(field, column, row) {
    return row * (field.columns + 1) + column;
}
export function surfaceFieldRawAtVertex(field, column, row) {
    return field.rawElevations[fieldIndex(field, column, row)];
}
export function sampleSurfaceFieldRaw(field, point) {
    const x = ((point.x % PLANET_MAP_WIDTH) + PLANET_MAP_WIDTH) % PLANET_MAP_WIDTH;
    const y = Math.max(0, Math.min(PLANET_MAP_HEIGHT, point.y));
    const column = Math.min(field.columns - 1, Math.floor(x / field.cellWidth));
    const row = Math.min(field.rows - 1, Math.floor(y / field.cellHeight));
    const tx = (x - column * field.cellWidth) / field.cellWidth;
    const ty = (y - row * field.cellHeight) / field.cellHeight;
    const northWest = surfaceFieldRawAtVertex(field, column, row);
    const northEast = surfaceFieldRawAtVertex(field, column + 1, row);
    const southEast = surfaceFieldRawAtVertex(field, column + 1, row + 1);
    const southWest = surfaceFieldRawAtVertex(field, column, row + 1);
    if ((row + column) % 2 === 0) {
        return ty <= tx
            ? (1 - tx) * northWest + (tx - ty) * northEast + ty * southEast
            : (1 - ty) * northWest + tx * southEast + (ty - tx) * southWest;
    }
    return tx + ty <= 1
        ? (1 - tx - ty) * northWest + tx * northEast + ty * southWest
        : (1 - ty) * northEast + (tx + ty - 1) * southEast + (1 - tx) * southWest;
}
export function generateSurfaceField(seed, plates, fixedSeaLevelRaw) {
    const columns = CANONICAL_SURFACE_COLUMNS;
    const rows = CANONICAL_SURFACE_ROWS;
    const cellWidth = PLANET_MAP_WIDTH / columns;
    const cellHeight = PLANET_MAP_HEIGHT / rows;
    const rawElevations = new Float64Array((columns + 1) * (rows + 1));
    const samples = [];
    const provisional = { columns, rows, cellWidth, cellHeight, rawElevations, seaLevelRaw: fixedSeaLevelRaw ?? 0 };
    for (let row = 0; row <= rows; row += 1) {
        for (let column = 0; column <= columns; column += 1) {
            const raw = rawSurfaceElevation(seed, plates, { x: column * cellWidth, y: row * cellHeight });
            rawElevations[fieldIndex(provisional, column, row)] = raw;
            if (column < columns && row < rows)
                samples.push(raw);
        }
    }
    const landFraction = 0.3 + deterministicUnit(seed, 'surface:land-fraction:v7') * 0.14;
    samples.sort((left, right) => left - right);
    provisional.seaLevelRaw = fixedSeaLevelRaw ?? round(samples[Math.floor(samples.length * (1 - landFraction))] ?? 0);
    return provisional;
}
export function chooseSeaLevel(seed, plates) {
    return generateSurfaceField(seed, plates).seaLevelRaw;
}
function boundaryActivity(type, proximity) {
    const intensity = type === 'interior' ? 0 : type === 'transform' ? 0.72 : 1;
    return clamp01(proximity * intensity);
}
export function samplePlanetEnvironment(context, point) {
    const x = ((point.x % PLANET_MAP_WIDTH) + PLANET_MAP_WIDTH) % PLANET_MAP_WIDTH;
    const y = Math.max(0, Math.min(PLANET_MAP_HEIGHT, point.y));
    const normalizedPoint = { x, y };
    const plate = samplePlateModel(context.plates, normalizedPoint);
    const history = geologicalHistoryFromPlateSample(context.seed, normalizedPoint, plate);
    const rawElevation = context.surfaceField
        ? sampleSurfaceFieldRaw(context.surfaceField, normalizedPoint)
        : rawSurfaceElevation(context.seed, context.plates, normalizedPoint);
    const signedElevation = rawElevation - context.seaLevelRaw;
    const roundedElevation = Math.round(Math.max(-7_500, Math.min(5_800, signedElevation * 7_200)));
    const surfaceElevationMeters = signedElevation < 0 ? Math.min(-1, roundedElevation) : Math.max(0, roundedElevation);
    const surfaceType = signedElevation >= 0 ? 'land' : 'ocean';
    const latitudeDeg = 90 - (y / PLANET_MAP_HEIGHT) * 180;
    const latitudeWarmth = 1 - Math.abs(latitudeDeg) / 90;
    const tectonicActivity = clamp01(0.06 + boundaryActivity(plate.boundaryType, plate.boundaryProximity) * 0.74
        + Math.max(history.orogenicInfluence, history.riftInfluence, history.ridgeInfluence, history.trenchInfluence) * 0.2);
    const reliefNoise = wrappedValueNoise(context.seed, 'surface:relief:v7', normalizedPoint, 256);
    const reliefMeters = Math.round(70 + reliefNoise * 900
        + history.orogenicInfluence * 2_000
        + history.riftInfluence * 850
        + history.ridgeInfluence * 1_050
        + history.trenchInfluence * 650);
    const moistureIndex = clamp01(wrappedValueNoise(context.seed, 'climate:moisture', normalizedPoint, 512) * 0.68 + latitudeWarmth * 0.22 + (surfaceType === 'ocean' ? 0.1 : 0));
    const volcanicActivity = clamp01((plate.boundaryType === 'convergent' ? 0.7 : plate.boundaryType === 'divergent' ? 0.58 : 0.12) * plate.boundaryProximity
        + history.orogenicInfluence * 0.12 + history.ridgeInfluence * 0.12
        + wrappedValueNoise(context.seed, 'geology:volcanic', normalizedPoint, 256) * 0.18);
    const sedimentaryBasinFactor = clamp01(wrappedValueNoise(context.seed, 'geology:sedimentary', normalizedPoint, 512) * 0.36
        + history.basinInfluence * 0.46
        + history.subsidenceIndex * 0.16
        + (surfaceElevationMeters < 800 ? 0.08 : 0));
    const thermalIndex = clamp01(latitudeWarmth * 0.82 + wrappedValueNoise(context.seed, 'climate:thermal', normalizedPoint, 1024) * 0.18 - Math.max(0, surfaceElevationMeters) / 30_000);
    return {
        surfaceType,
        surfaceElevationMeters,
        rawElevation: round(rawElevation),
        latitudeDeg: round(latitudeDeg, 3),
        meanElevationMeters: surfaceElevationMeters,
        reliefMeters,
        thermalIndex: round(thermalIndex, 4),
        moistureIndex: round(moistureIndex, 4),
        tectonicActivity: round(tectonicActivity, 4),
        volcanicActivity: round(volcanicActivity, 4),
        sedimentaryBasinFactor: round(sedimentaryBasinFactor, 4),
        plateId: plate.plate.id,
        boundaryType: plate.boundaryType,
        boundaryProximity: round(plate.boundaryProximity, 4),
        crustAgeMyr: history.crustAgeMyr,
        crustThicknessKm: history.crustThicknessKm,
        upliftIndex: history.upliftIndex,
        subsidenceIndex: history.subsidenceIndex,
        orogenicInfluence: history.orogenicInfluence,
        riftInfluence: history.riftInfluence,
        ridgeInfluence: history.ridgeInfluence,
        trenchInfluence: history.trenchInfluence,
        basinInfluence: history.basinInfluence,
    };
}
