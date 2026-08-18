/**
 * Main planet generator.
 * Returns a plain JavaScript planet object with no DOM dependencies.
 */

import { createRNG, hashSeed, rngFor } from './random.js';
import { generateRegions } from './generateRegions.js';

const PLANET_NAMES = [
  'Aethon', 'Boras', 'Caldris', 'Draven', 'Eryndor', 'Feraxis', 'Galneth',
  'Havar', 'Ixara', 'Jorveth', 'Kryne', 'Luneth', 'Mordex', 'Navorn',
  'Oxaris', 'Pyrath', 'Quellis', 'Ryndor', 'Solven', 'Tarvex', 'Uryndal',
  'Vyrath', 'Wolthen', 'Xoros', 'Yethris', 'Zorven',
];

const AGE_COOLING_SPAN_GYR = 11;

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

function round(value, decimals = 3) {
  return parseFloat(value.toFixed(decimals));
}

function normaliseToHundred(obj) {
  const total = Object.values(obj).reduce((a, b) => a + b, 0);
  if (total <= 0) return {};
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

function generateBaseState(rng) {
  const orbitalDistanceAU = round(rng.range(0.25, 2.8), 3);
  const orbitalEccentricity = round(rng.range(0, 0.35), 3);
  const massEarth = round(rng.range(0.08, 4.5), 3);
  const axialTiltDegrees = round(rng.range(0, 55), 1);
  const ageGyr = round(rng.range(0.5, 10), 2);
  const closeOrbit = orbitalDistanceAU < 0.35;
  const likelyTidalLock = closeOrbit && rng.random() > 0.55;
  const rotationHours = likelyTidalLock
    ? round(rng.range(120, 1400), 1)
    : round(rng.range(8, 120), 1);

  return {
    orbitalDistanceAU,
    orbitalEccentricity,
    massEarth,
    rotationHours,
    axialTiltDegrees,
    ageGyr,
  };
}

function generateBulkMatter(base, rng) {
  const innerSystemFactor = clamp((1.5 - base.orbitalDistanceAU) / 1.5, 0, 1);
  const outerSystemFactor = clamp((base.orbitalDistanceAU - 0.8) / 2, 0, 1);
  const ironBias = rng.range(-6, 6);
  const silicateBias = rng.range(-8, 8);

  const silicates = 44 + silicateBias + innerSystemFactor * 18 - outerSystemFactor * 10;
  const ironMetals = 20 + innerSystemFactor * 22 + ironBias - outerSystemFactor * 8;
  const waterVolatiles = 6 + outerSystemFactor * 22 + (1 - innerSystemFactor) * 8 + rng.range(-3, 6);
  const carbonCompounds = 3 + outerSystemFactor * 12 + (1 - innerSystemFactor) * 4 + rng.range(-2, 5);
  const sulfurCompounds = 2 + innerSystemFactor * 8 + rng.range(-1.5, 2.5);
  const other = 2 + rng.range(0, 4);

  const bulkComposition = normaliseToHundred({
    silicates: Math.max(1, silicates),
    ironMetals: Math.max(1, ironMetals),
    waterVolatiles: Math.max(0.5, waterVolatiles),
    carbonCompounds: Math.max(0.5, carbonCompounds),
    sulfurCompounds: Math.max(0.5, sulfurCompounds),
    other: Math.max(0.5, other),
  });

  const volatileInventory = generateVolatileInventory(base, bulkComposition, rng);
  return { bulkComposition, volatileInventory };
}

function generateVolatileInventory(base, bulkComposition, rng) {
  const orbitalColdFactor = clamp((base.orbitalDistanceAU - 0.7) / 2.1, 0, 1);
  const retentionMassFactor = clamp(base.massEarth / 1.5, 0.2, 2.5);
  const volatileRetention = clamp(0.45 + retentionMassFactor * 0.25 + orbitalColdFactor * 0.4, 0.2, 1.8);

  return {
    waterIce: round(clamp((bulkComposition.waterVolatiles * volatileRetention * rng.range(0.4, 1.2)) + orbitalColdFactor * 8, 0, 50), 1),
    co2Ice: round(clamp((bulkComposition.carbonCompounds * volatileRetention * rng.range(0.25, 0.9)) + orbitalColdFactor * 4, 0, 25), 1),
    carbonaceousVolatiles: round(clamp((bulkComposition.carbonCompounds * rng.range(0.3, 0.9)), 0, 20), 1),
    sulfurousVolatiles: round(clamp((bulkComposition.sulfurCompounds * rng.range(0.25, 0.8)), 0, 12), 1),
  };
}

function generateThermalEnvironment(base, bulkMatter, rng) {
  const albedo = clamp(
    0.16 +
      (bulkMatter.bulkComposition.waterVolatiles / 100) * 0.24 +
      (bulkMatter.bulkComposition.silicates / 100) * 0.08 +
      rng.range(-0.03, 0.03),
    0.08,
    0.72
  );
  const eccentricityHeating = 1 + base.orbitalEccentricity * 0.08;
  const equilibriumTemperatureK = round(
    (278 / Math.sqrt(base.orbitalDistanceAU)) * Math.pow(1 - albedo, 0.25) * eccentricityHeating,
    1
  );

  return { albedo, equilibriumTemperatureK };
}

function generateInteriorStructure(base, bulkMatter, thermal, rng) {
  const ironFactor = bulkMatter.bulkComposition.ironMetals / 100;
  const volatileFactor = bulkMatter.bulkComposition.waterVolatiles / 100;
  const massFactor = clamp(base.massEarth / 2.2, 0.1, 2.8);
  const thermalFactor = clamp(thermal.equilibriumTemperatureK / 320, 0.3, 2.5);

  const coreRaw = 0.18 + ironFactor * 0.33 + massFactor * 0.06 + rng.range(-0.025, 0.025);
  const deepRaw = 0.42 + (1 - volatileFactor) * 0.1 + rng.range(-0.035, 0.035);
  const envelopeRaw = 0.08 + volatileFactor * 0.26 + (1 / thermalFactor) * 0.03 + rng.range(-0.02, 0.02);
  const total = coreRaw + deepRaw + envelopeRaw;

  let coreMassFraction = clamp(coreRaw / total, 0.1, 0.65);
  let deepInteriorMassFraction = clamp(deepRaw / total, 0.15, 0.8);
  let envelopeMassFraction = 1 - coreMassFraction - deepInteriorMassFraction;

  if (envelopeMassFraction < 0.01) {
    const deficit = 0.01 - envelopeMassFraction;
    envelopeMassFraction = 0.01;
    deepInteriorMassFraction = clamp(deepInteriorMassFraction - deficit, 0.15, 0.8);
    coreMassFraction = 1 - deepInteriorMassFraction - envelopeMassFraction;
  }

  deepInteriorMassFraction = round(deepInteriorMassFraction, 3);
  envelopeMassFraction = round(envelopeMassFraction, 3);
  coreMassFraction = round(1 - deepInteriorMassFraction - envelopeMassFraction, 3);

  return {
    coreMassFraction,
    deepInteriorMassFraction,
    envelopeMassFraction,
  };
}

function derivePhysicalDimensions(base, bulkMatter, structure) {
  const ironIndex = bulkMatter.bulkComposition.ironMetals / 100;
  const volatileIndex = (bulkMatter.bulkComposition.waterVolatiles + bulkMatter.bulkComposition.carbonCompounds) / 100;
  const structureIndex = structure.envelopeMassFraction - structure.coreMassFraction;

  const radiusModifier = clamp(1 - ironIndex * 0.18 + volatileIndex * 0.12 + structureIndex * 0.1, 0.72, 1.35);
  const radiusEarth = round(Math.pow(base.massEarth, 0.275) * radiusModifier, 3);
  const gravityG = round(base.massEarth / (radiusEarth * radiusEarth), 3);
  const escapeVelocityKmS = round(11.186 * Math.sqrt(base.massEarth / radiusEarth), 3);
  const volumeEarth = (4 / 3) * Math.PI * Math.pow(radiusEarth, 3);
  const meanDensity = round((base.massEarth / volumeEarth) * 5.51, 2);

  return { radiusEarth, gravityG, escapeVelocityKmS, meanDensity };
}

function generateAtmosphere(base, bulkMatter, thermal, dimensions, rng) {
  const volatileSupply = clamp(
    (bulkMatter.volatileInventory.waterIce + bulkMatter.volatileInventory.co2Ice + bulkMatter.volatileInventory.carbonaceousVolatiles) / 65,
    0,
    2
  );
  const retentionScore = clamp(
    (dimensions.escapeVelocityKmS / 11.186) * 0.55 +
      (dimensions.gravityG / 1) * 0.2 +
      (275 / Math.max(120, thermal.equilibriumTemperatureK)) * 0.25,
    0,
    2.5
  );
  const atmosphericPotential = volatileSupply * retentionScore;
  const effectivelyAirless = atmosphericPotential < 0.28 || (thermal.equilibriumTemperatureK > 620 && retentionScore < 1.1);

  if (effectivelyAirless) {
    return {
      pressureBar: 0,
      composition: {},
      retained: false,
    };
  }

  const pressureBar = round(clamp(atmosphericPotential * rng.range(0.12, 0.95), 0.01, 8), 3);
  let compRaw;

  if (thermal.equilibriumTemperatureK < 180) {
    compRaw = { N2: rng.range(35, 75), CO2: rng.range(8, 30), CH4: rng.range(2, 20), Ar: rng.range(1, 8), He: rng.range(0.2, 3) };
  } else if (thermal.equilibriumTemperatureK > 390) {
    compRaw = { CO2: rng.range(45, 88), N2: rng.range(8, 35), SO2: rng.range(1, 16), Ar: rng.range(0.5, 6), H2O: rng.range(0.2, 5) };
  } else {
    compRaw = { N2: rng.range(45, 82), CO2: rng.range(2, 24), Ar: rng.range(0.5, 8), H2O: rng.range(0.2, 8), CH4: rng.range(0.1, 4) };
    if (pressureBar > 0.2 && thermal.equilibriumTemperatureK > 250 && thermal.equilibriumTemperatureK < 335 && rng.random() > 0.62) {
      compRaw.O2 = rng.range(1, 20);
    }
  }

  return {
    pressureBar,
    composition: normaliseToHundred(compRaw),
    retained: true,
  };
}

function generateActiveState(base, structure, rng) {
  // Simplified cooling horizon: young worlds retain more radiogenic/primordial heat.
  const ageCooling = clamp(1 - (base.ageGyr - 0.5) / AGE_COOLING_SPAN_GYR, 0.05, 1);
  const massHeat = clamp(Math.pow(base.massEarth, 0.35), 0.25, 1.8);
  const coreEffect = clamp((structure.coreMassFraction - 0.15) / 0.45, 0, 1.25);
  const internalHeatScore = clamp(ageCooling * 0.42 + massHeat * 0.28 + coreEffect * 0.3 + rng.range(-0.07, 0.07), 0, 1);
  const tidalActivity = clamp((1 / Math.max(0.2, base.orbitalDistanceAU)) * base.orbitalEccentricity * 0.32, 0, 0.45);
  const geologicActivity = round(clamp(internalHeatScore * 0.8 + tidalActivity + rng.range(-0.12, 0.12), 0, 1), 2);
  const internalHeat = heatLabel(internalHeatScore);

  const rotationFactor = clamp(1 - (base.rotationHours / 300), 0, 1);
  const dynamoScore = clamp(coreEffect * 0.45 + internalHeatScore * 0.32 + rotationFactor * 0.23 + rng.range(-0.08, 0.08), 0, 1);
  const magneticState = magneticLabel(dynamoScore);

  return {
    geologicActivity,
    internalHeat,
    magneticState,
  };
}

function heatLabel(score) {
  if (score < 0.2) return 'Very Low';
  if (score < 0.4) return 'Low';
  if (score < 0.65) return 'Moderate';
  if (score < 0.85) return 'High';
  return 'Extreme';
}

function magneticLabel(score) {
  if (score < 0.15) return 'None';
  if (score < 0.35) return 'Weak';
  if (score < 0.6) return 'Moderate';
  if (score < 0.82) return 'Strong';
  return 'Extreme';
}

function deriveExteriorState(bulkMatter, thermal, atmosphere, activeState, rng) {
  const greenhouseGasPercent = (atmosphere.composition.CO2 || 0) + (atmosphere.composition.CH4 || 0) + (atmosphere.composition.H2O || 0) * 0.5;
  const greenhouseAdj = atmosphere.pressureBar > 0
    ? atmosphere.pressureBar * 9.5 * (greenhouseGasPercent / 100)
    : 0;
  const meanTemperatureK = round(thermal.equilibriumTemperatureK + greenhouseAdj, 1);
  const surfaceState = chooseSurfaceState(meanTemperatureK, atmosphere, bulkMatter.volatileInventory, activeState.geologicActivity, rng);
  const biosphereEligible = canHaveBiosphere(meanTemperatureK, bulkMatter.volatileInventory, atmosphere);
  const biosphereChance = clamp(
    0.35 +
      (atmosphere.pressureBar > 0.5 ? 0.2 : 0) +
      (bulkMatter.volatileInventory.waterIce > 8 ? 0.25 : 0) -
      (activeState.geologicActivity > 0.9 ? 0.12 : 0),
    0.1,
    0.85
  );
  const biospherePresent = biosphereEligible && rng.random() < biosphereChance;

  return { meanTemperatureK, surfaceState, biospherePresent };
}

function classifyPlanetType(planet) {
  const waterVol = planet.bulkComposition.waterVolatiles || 0;
  const iron = planet.bulkComposition.ironMetals || 0;
  const silicates = planet.bulkComposition.silicates || 0;
  const carbon = planet.bulkComposition.carbonCompounds || 0;
  const pressureBar = planet.atmosphere?.pressureBar ?? 0;

  if (pressureBar < 0.01 && planet.meanTemperatureK < 220 && waterVol > 20) return 'Ice-Rich';
  if (pressureBar > 0.2 && waterVol > 16 && planet.meanTemperatureK >= 258 && planet.meanTemperatureK <= 340) return 'Ocean-Rich';
  if (planet.meanTemperatureK > 450 && pressureBar > 0.15) return 'Greenhouse';
  if (iron > 32) return 'Iron-Rich';
  if (planet.geologicActivity > 0.72) return 'Volcanic';
  if (carbon > 20) return 'Carbon-Rich';
  if (silicates > 52 && waterVol < 14) return 'Silicate-Rich';
  if (pressureBar < 0.03 || waterVol < 8) return 'Arid';
  if (planet.meanTemperatureK >= 255 && planet.meanTemperatureK <= 330 && pressureBar >= 0.2) return 'Temperate';
  return 'Rocky';
}

export function generatePlanet(seedInput) {
  const seedStr = String(seedInput ?? 'default-seed');
  const numericSeed = hashSeed(seedStr);
  // Top-level RNG for planet name pick; all subsystems use namespaced streams
  const rng = createRNG(numericSeed);
  const name = rng.pick(PLANET_NAMES);

  // Each generation domain gets its own namespaced RNG stream so that changes
  // to one domain do not reshuffle unrelated domains for the same seed.
  const baseRng        = rngFor(seedStr, 'planet:base');
  const bulkRng        = rngFor(seedStr, 'planet:bulk');
  const thermalRng     = rngFor(seedStr, 'planet:thermal');
  const interiorRng    = rngFor(seedStr, 'planet:interior');
  const atmosphereRng  = rngFor(seedStr, 'planet:atmosphere');
  const activeRng      = rngFor(seedStr, 'planet:active');
  const exteriorRng    = rngFor(seedStr, 'planet:exterior');

  // A. Base state
  const base = generateBaseState(baseRng);
  // B. Bulk matter
  const bulkMatter = generateBulkMatter(base, bulkRng);
  // C. Thermal environment
  const thermal = generateThermalEnvironment(base, bulkMatter, thermalRng);
  // D. Interior partitioning
  const structure = generateInteriorStructure(base, bulkMatter, thermal, interiorRng);
  // E. Physical dimensions (deterministic derivation — no RNG needed)
  const dimensions = derivePhysicalDimensions(base, bulkMatter, structure);
  // F. Atmosphere
  const atmosphere = generateAtmosphere(base, bulkMatter, thermal, dimensions, atmosphereRng);
  // G. Active state
  const activeState = generateActiveState(base, structure, activeRng);
  // H. Exterior state
  const exterior = deriveExteriorState(bulkMatter, thermal, atmosphere, activeState, exteriorRng);

  // Assemble planet (without regions first for biosphere reference)
  const planet = {
    id: `planet-${numericSeed}`,
    seed: seedStr,
    name,
    orbitalDistanceAU: base.orbitalDistanceAU,
    orbitalEccentricity: base.orbitalEccentricity,

    massEarth: base.massEarth,
    radiusEarth: dimensions.radiusEarth,
    meanDensity: dimensions.meanDensity,
    gravityG: dimensions.gravityG,
    escapeVelocityKmS: dimensions.escapeVelocityKmS,

    rotationHours: base.rotationHours,
    axialTiltDegrees: base.axialTiltDegrees,

    bulkComposition: bulkMatter.bulkComposition,
    volatileInventory: bulkMatter.volatileInventory,

    coreMassFraction: structure.coreMassFraction,
    deepInteriorMassFraction: structure.deepInteriorMassFraction,
    envelopeMassFraction: structure.envelopeMassFraction,

    equilibriumTemperatureK: thermal.equilibriumTemperatureK,
    meanTemperatureK: exterior.meanTemperatureK,
    atmosphere,
    surfaceState: exterior.surfaceState,

    internalHeat: activeState.internalHeat,
    geologicActivity: activeState.geologicActivity,
    magneticState: activeState.magneticState,

    biospherePresent: exterior.biospherePresent,

    regions: [],
  };

  planet.planetType = classifyPlanetType(planet);

  // Generate regions — pass the root seed so region/feature sub-systems can
  // derive independent namespaced RNG streams.
  const regionRng = rngFor(seedStr, 'planet:regions');
  planet.regions = generateRegions(planet, regionRng, seedStr);

  // Validate before returning
  validatePlanet(planet);

  return planet;
}

function chooseSurfaceState(tempK, atmosphere, volatileInventory, geologicActivity, rng) {
  const pressureBar = atmosphere?.pressureBar || 0;
  const waterVol = volatileInventory?.waterIce || 0;

  if (tempK > 700) return 'Molten / Extreme Heat';
  if (tempK < 145) return 'Frozen / Deep Cryogenic';
  if (pressureBar < 0.01) {
    if (tempK < 240 && waterVol > 8) return 'Airless Ice / Rock';
    return tempK > 350 ? 'Airless Hot Rock' : 'Airless Rocky';
  }
  if (tempK < 255) return 'Frozen';
  if (tempK > 373 && pressureBar < 0.2) return 'Dry / High Temperature';
  if (waterVol > 15 && tempK >= 260 && tempK <= 350) return rng.pick(['Liquid Water Present', 'Partial Ocean', 'Shallow Seas']);
  if (geologicActivity > 0.75 && tempK > 320) return 'Active Volcanism';
  if (waterVol > 18 && tempK < 260) return 'Ice Sheets / Frozen';
  return rng.pick(['Rocky', 'Arid', 'Semi-Arid', 'Mixed Terrain']);
}

function canHaveBiosphere(tempK, volatileInventory, atmosphere) {
  const tempOk = tempK > 250 && tempK < 360;
  const waterOk = (volatileInventory.waterIce || 0) > 5;
  const atmoOk = (atmosphere?.pressureBar || 0) > 0.1;
  const chemistryOk = ((atmosphere?.composition?.SO2 || 0) < 15);
  return tempOk && waterOk && atmoOk && chemistryOk;
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
  const nonNeg = ['massEarth', 'radiusEarth', 'gravityG', 'escapeVelocityKmS', 'meanDensity', 'equilibriumTemperatureK', 'meanTemperatureK'];
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
    const atmoComp = planet.atmosphere.composition || {};
    const atmoSum = Object.values(atmoComp).reduce((a, b) => a + b, 0);
    if ((planet.atmosphere.pressureBar || 0) > 0.001 && Math.abs(atmoSum - 100) > 1) {
      errors.push(`Atmosphere composition sums to ${atmoSum}`);
    }
    if ((planet.atmosphere.pressureBar || 0) <= 0.001 && atmoSum > 0.01) {
      errors.push(`Airless atmosphere should not have composition sum ${atmoSum}`);
    }
  }

  // Region areas ~100
  const areaSum = planet.regions.reduce((a, r) => a + r.areaPercent, 0);
  if (Math.abs(areaSum - 100) > 1.5) errors.push(`Region areas sum to ${areaSum}`);

  // Feature invariants
  for (const region of planet.regions) {
    for (const feature of region.features) {
      // Feature ID must belong to this region
      if (!feature.id.startsWith(`feature-${region.id}`)) {
        errors.push(`Feature ${feature.id} in wrong region ${region.id}`);
      }
      // Physical features must not carry player-discovery state
      if ('discovered' in feature) {
        errors.push(`Feature ${feature.id} contains 'discovered' — move to knowledgeState`);
      }
      // Feature must carry regionId back-reference
      if (feature.regionId !== region.id) {
        errors.push(`Feature ${feature.id} has wrong regionId '${feature.regionId}', expected '${region.id}'`);
      }
      // Resource occurrences should be an array
      if (!Array.isArray(feature.resourceOccurrences)) {
        errors.push(`Feature ${feature.id} missing resourceOccurrences array`);
      }
    }
  }

  // Biological resources only when biosphere exists
  if (!planet.biospherePresent) {
    const bioIds = new Set(['wood', 'plant-biomass', 'peat', 'organic-soil', 'coal', 'guano', 'latex', 'reef-material']);
    for (const region of planet.regions) {
      for (const r of region.backgroundResourceOccurrences) {
        if (bioIds.has(r.resourceId)) errors.push(`Biological resource ${r.resourceId} in region without biosphere`);
      }
      for (const feature of region.features) {
        for (const r of feature.resourceOccurrences) {
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
