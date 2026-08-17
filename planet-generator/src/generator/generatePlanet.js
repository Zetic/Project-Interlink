/**
 * Main planet generator.
 * Returns a plain JavaScript planet object with no DOM dependencies.
 */

import { createRNG, hashSeed } from './random.js';
import { generateRegions } from './generateRegions.js';

const PLANET_TYPES = [
  { type: 'Rocky', compositionProfile: { silicates: 60, ironMetals: 25, waterVolatiles: 5, carbonCompounds: 4, sulfurCompounds: 4, other: 2 } },
  { type: 'Iron-Rich', compositionProfile: { silicates: 35, ironMetals: 50, waterVolatiles: 4, carbonCompounds: 4, sulfurCompounds: 5, other: 2 } },
  { type: 'Silicate-Rich', compositionProfile: { silicates: 72, ironMetals: 14, waterVolatiles: 6, carbonCompounds: 4, sulfurCompounds: 2, other: 2 } },
  { type: 'Volcanic', compositionProfile: { silicates: 55, ironMetals: 28, waterVolatiles: 3, carbonCompounds: 3, sulfurCompounds: 9, other: 2 } },
  { type: 'Arid', compositionProfile: { silicates: 62, ironMetals: 20, waterVolatiles: 4, carbonCompounds: 5, sulfurCompounds: 6, other: 3 } },
  { type: 'Temperate', compositionProfile: { silicates: 58, ironMetals: 22, waterVolatiles: 10, carbonCompounds: 5, sulfurCompounds: 3, other: 2 } },
  { type: 'Ocean-Rich', compositionProfile: { silicates: 45, ironMetals: 18, waterVolatiles: 28, carbonCompounds: 4, sulfurCompounds: 3, other: 2 } },
  { type: 'Ice-Rich', compositionProfile: { silicates: 40, ironMetals: 16, waterVolatiles: 36, carbonCompounds: 3, sulfurCompounds: 3, other: 2 } },
  { type: 'Carbon-Rich', compositionProfile: { silicates: 38, ironMetals: 20, waterVolatiles: 5, carbonCompounds: 28, sulfurCompounds: 6, other: 3 } },
];

const PLANET_NAMES = [
  'Aethon', 'Boras', 'Caldris', 'Draven', 'Eryndor', 'Feraxis', 'Galneth',
  'Havar', 'Ixara', 'Jorveth', 'Kryne', 'Luneth', 'Mordex', 'Navorn',
  'Oxaris', 'Pyrath', 'Quellis', 'Ryndor', 'Solven', 'Tarvex', 'Uryndal',
  'Vyrath', 'Wolthen', 'Xoros', 'Yethris', 'Zorven',
];

const ATMOSPHERE_GASES = ['N2', 'CO2', 'O2', 'Ar', 'H2O', 'CH4', 'SO2', 'He'];

function normaliseToHundred(obj) {
  const total = Object.values(obj).reduce((a, b) => a + b, 0);
  const result = {};
  const keys = Object.keys(obj);
  let sum = 0;
  for (let i = 0; i < keys.length - 1; i++) {
    result[keys[i]] = parseFloat(((obj[keys[i]] / total) * 100).toFixed(1));
    sum += result[keys[i]];
  }
  result[keys[keys.length - 1]] = parseFloat((100 - sum).toFixed(1));
  return result;
}

function generateAtmosphere(planetType, rng, equilibriumTempK) {
  // No atmosphere for very small/hot planets — simplified: always give some atmosphere
  const pressureBar = parseFloat(rng.range(0.001, 3.5).toFixed(3));

  let compRaw = {};
  if (equilibriumTempK < 200) {
    compRaw = { N2: rng.range(40, 80), CO2: rng.range(5, 20), Ar: rng.range(2, 10), CH4: rng.range(1, 15), other: rng.range(1, 5) };
  } else if (equilibriumTempK > 350) {
    compRaw = { CO2: rng.range(50, 90), N2: rng.range(5, 30), SO2: rng.range(1, 10), Ar: rng.range(1, 5), other: rng.range(1, 3) };
  } else {
    compRaw = { N2: rng.range(50, 80), CO2: rng.range(3, 20), Ar: rng.range(1, 10), H2O: rng.range(0.5, 5), other: rng.range(0.5, 3) };
    if (rng.random() > 0.5) compRaw.O2 = rng.range(1, 21);
  }

  return {
    pressureBar,
    composition: normaliseToHundred(compRaw),
  };
}

function generateVolatileInventory(rng, planetType) {
  return {
    waterIce: parseFloat(rng.range(0, 40).toFixed(1)),
    co2Ice: parseFloat(rng.range(0, 20).toFixed(1)),
    carbonaceousVolatiles: parseFloat(rng.range(0, 10).toFixed(1)),
    sulfurousVolatiles: parseFloat(rng.range(0, 5).toFixed(1)),
  };
}

export function generatePlanet(seedInput) {
  const seedStr = String(seedInput ?? Math.floor(Math.random() * 1e9));
  const numericSeed = hashSeed(seedStr);
  const rng = createRNG(numericSeed);

  // Pick planet type
  const pt = rng.pick(PLANET_TYPES);
  const name = rng.pick(PLANET_NAMES);

  // Orbital
  const orbitalDistanceAU = parseFloat(rng.range(0.3, 2.5).toFixed(3));
  const orbitalEccentricity = parseFloat(rng.range(0, 0.35).toFixed(3));

  // Mass & radius (Earth units)
  const massEarth = parseFloat(rng.range(0.1, 4.0).toFixed(3));
  const compositionModifier = 0.85 + (pt.compositionProfile.ironMetals / 100) * 0.3;
  const radiusEarth = parseFloat((Math.pow(massEarth, 0.27) * compositionModifier).toFixed(3));

  // Derived
  const gravityG = parseFloat((massEarth / (radiusEarth * radiusEarth)).toFixed(3));
  const escapeVelocityKmS = parseFloat((11.186 * Math.sqrt(massEarth / radiusEarth)).toFixed(3));
  const volumeEarth = (4 / 3) * Math.PI * Math.pow(radiusEarth, 3);
  const meanDensity = parseFloat((massEarth / volumeEarth * 5.51).toFixed(2)); // g/cm³ (Earth = 5.51)

  // Temperature
  const albedoMod = 1 + (pt.compositionProfile.waterVolatiles - 10) * 0.005;
  const equilibriumTemperatureK = parseFloat(((278 / Math.sqrt(orbitalDistanceAU)) * albedoMod).toFixed(1));
  const atmosphere = generateAtmosphere(pt.type, rng, equilibriumTemperatureK);
  const greenhouseAdj = atmosphere.pressureBar * 15 * (((atmosphere.composition.CO2 || 0) + (atmosphere.composition.CH4 || 0)) / 100);
  const meanTemperatureK = parseFloat((equilibriumTemperatureK + greenhouseAdj).toFixed(1));

  const rotationHours = parseFloat(rng.range(8, 120).toFixed(1));
  const axialTiltDegrees = parseFloat(rng.range(0, 45).toFixed(1));

  // Interior structure
  const coreFrac = parseFloat(rng.range(0.15, 0.40).toFixed(3));
  const deepFrac = parseFloat(rng.range(0.30, 0.55).toFixed(3));
  const envFrac = parseFloat((1 - coreFrac - deepFrac).toFixed(3));

  // Ensure fractions sum to 1 (float correction)
  const fracSum = coreFrac + deepFrac + envFrac;
  const correctedCore = parseFloat((coreFrac + (1 - fracSum)).toFixed(3));

  // Geologic & magnetic
  const geologicActivity = parseFloat(rng.range(0, 1).toFixed(2));
  const internalHeat = rng.pick(['Low', 'Moderate', 'High', 'Extreme']);
  const magneticState = rng.pick(['None', 'Weak', 'Moderate', 'Strong', 'Extreme']);

  // Surface state
  const surfaceState = chooseSurfaceState(meanTemperatureK, atmosphere.pressureBar, pt, rng);

  // Bulk composition
  const bulkComposition = normaliseToHundred({ ...pt.compositionProfile });

  // Volatile inventory
  const volatileInventory = generateVolatileInventory(rng, pt.type);

  // Biosphere
  const biospherePresent = canHaveBiosphere(meanTemperatureK, volatileInventory, atmosphere) && rng.random() > 0.45;

  // Assemble planet (without regions first for biosphere reference)
  const planet = {
    id: `planet-${numericSeed}`,
    seed: seedStr,
    name,
    planetType: pt.type,

    orbitalDistanceAU,
    orbitalEccentricity,

    massEarth,
    radiusEarth,
    meanDensity,
    gravityG,
    escapeVelocityKmS,

    rotationHours,
    axialTiltDegrees,

    bulkComposition,
    volatileInventory,

    coreMassFraction: correctedCore,
    deepInteriorMassFraction: deepFrac,
    envelopeMassFraction: envFrac,

    equilibriumTemperatureK,
    meanTemperatureK,
    atmosphere,
    surfaceState,

    internalHeat,
    geologicActivity,
    magneticState,

    biospherePresent,

    regions: [],
  };

  // Generate regions
  planet.regions = generateRegions(planet, rng);

  // Validate before returning
  validatePlanet(planet);

  return planet;
}

function chooseSurfaceState(tempK, pressureBar, pt, rng) {
  if (tempK > 700) return 'Molten / Extreme Heat';
  if (tempK < 150) return 'Frozen / Deep Cryogenic';
  if (tempK < 273) return 'Frozen';
  if (tempK > 373 && pressureBar < 0.1) return 'Dry / High Temperature';
  if (pt.type === 'Ocean-Rich' || pt.type === 'Temperate') return rng.pick(['Liquid Water Present', 'Partial Ocean', 'Shallow Seas']);
  if (pt.type === 'Ice-Rich') return 'Ice Sheets / Frozen';
  if (pt.type === 'Volcanic') return 'Active Volcanism';
  return rng.pick(['Rocky', 'Arid', 'Semi-Arid', 'Mixed Terrain']);
}

function canHaveBiosphere(tempK, volatileInventory, atmosphere) {
  const tempOk = tempK > 250 && tempK < 360;
  const waterOk = (volatileInventory.waterIce || 0) > 5;
  const atmoOk = (atmosphere?.pressureBar || 0) > 0.1;
  return tempOk && waterOk && atmoOk;
}

// ---- Validation ----

function validatePlanet(planet) {
  const errors = [];

  // Check for NaN / Infinity in numeric fields
  function checkNumeric(obj, path) {
    for (const [k, v] of Object.entries(obj)) {
      const fullPath = `${path}.${k}`;
      if (typeof v === 'number') {
        if (isNaN(v)) errors.push(`NaN at ${fullPath}`);
        if (!isFinite(v)) errors.push(`Infinity at ${fullPath}`);
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        checkNumeric(v, fullPath);
      }
    }
  }
  checkNumeric(planet, 'planet');

  // Non-negative
  const nonNeg = ['massEarth', 'radiusEarth', 'gravityG', 'escapeVelocityKmS', 'meanDensity', 'equilibriumTemperatureK'];
  for (const f of nonNeg) {
    if (planet[f] < 0) errors.push(`Negative ${f}: ${planet[f]}`);
  }

  // Fractions sum to ~1
  const fracSum = planet.coreMassFraction + planet.deepInteriorMassFraction + planet.envelopeMassFraction;
  if (Math.abs(fracSum - 1) > 0.01) errors.push(`Fractions sum to ${fracSum}, expected 1`);

  // Bulk composition ~100
  const compSum = Object.values(planet.bulkComposition).reduce((a, b) => a + b, 0);
  if (Math.abs(compSum - 100) > 1) errors.push(`Bulk composition sums to ${compSum}`);

  // Atmosphere composition ~100
  if (planet.atmosphere) {
    const atmoSum = Object.values(planet.atmosphere.composition).reduce((a, b) => a + b, 0);
    if (Math.abs(atmoSum - 100) > 1) errors.push(`Atmosphere composition sums to ${atmoSum}`);
  }

  // Region areas ~100
  const areaSum = planet.regions.reduce((a, r) => a + r.areaPercent, 0);
  if (Math.abs(areaSum - 100) > 1.5) errors.push(`Region areas sum to ${areaSum}`);

  // Feature parent regions
  for (const region of planet.regions) {
    for (const feature of region.features) {
      if (!feature.id.startsWith(`feature-${region.id}`)) {
        errors.push(`Feature ${feature.id} in wrong region ${region.id}`);
      }
    }
  }

  // Biological resources only when biosphere exists
  if (!planet.biospherePresent) {
    const bioIds = new Set(['wood', 'plant-biomass', 'peat', 'organic-soil', 'coal', 'guano', 'latex', 'reef-material']);
    for (const region of planet.regions) {
      for (const r of region.backgroundResources) {
        if (bioIds.has(r.resourceId)) errors.push(`Biological resource ${r.resourceId} in region without biosphere`);
      }
      for (const feature of region.features) {
        for (const r of feature.resources) {
          if (bioIds.has(r.resourceId)) errors.push(`Biological resource ${r.resourceId} in feature without biosphere`);
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error('[Planet Generator] Validation errors:', errors);
  }

  return errors;
}
