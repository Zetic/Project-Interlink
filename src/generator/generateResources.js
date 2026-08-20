/** Resource-generation helpers. Resource distribution is a generator hint, not physical ownership. */

import {
  resources,
  getLocalizedResources,
  getRegionalResources,
  getResourceDefinition,
} from '../data/resourceDefinitions.js';

export { resources, getLocalizedResources, getRegionalResources, getResourceDefinition };

/**
 * Pick resource definitions matching any supplied tag.
 * `distribution` controls generation propensity only. Every generated occurrence
 * is ultimately owned by a physical Feature.
 */
export function resourcesByTags(tags, distribution = 'localized') {
  const pool = distribution === 'regional' ? getRegionalResources() : getLocalizedResources();
  const tagSet = new Set(tags);
  return pool.filter(resource => resource.tags.some(tag => tagSet.has(tag)));
}

/**
 * Pick resource definitions whose `occurrenceFamily` is in the supplied set.
 * This is the hard physical compatibility gate: only resources from valid families
 * are eligible regardless of environmental tags.
 */
export function resourcesByFamilies(familySet, distribution = 'localized') {
  const pool = distribution === 'regional' ? getRegionalResources() : getLocalizedResources();
  return pool.filter(resource => familySet.has(resource.occurrenceFamily));
}

const QUANTITY_CLASSES = ['Tiny', 'Small', 'Moderate', 'Large', 'Massive'];
const AVAILABILITY_CLASSES = ['Sparse', 'Limited', 'Moderate', 'Common', 'Abundant', 'Very Abundant'];

export function quantityClass(value) {
  const idx = Math.min(Math.floor(value * QUANTITY_CLASSES.length), QUANTITY_CLASSES.length - 1);
  return QUANTITY_CLASSES[idx];
}

export function availabilityClass(value) {
  const clamped = Math.max(0, Math.min(0.999999, value));
  const idx = Math.min(Math.floor(clamped * AVAILABILITY_CLASSES.length), AVAILABILITY_CLASSES.length - 1);
  return AVAILABILITY_CLASSES[idx];
}

/**
 * Generate a Feature-owned ResourceOccurrence. There are no Region-owned
 * occurrences: regional abundance is represented by access Sites/Features.
 */
export function makeFeatureResource(resource, rng, occurrenceId, featureId, {
  accessScope = 'localized',
  availabilityBias = 0,
} = {}) {
  if (!resource) throw new Error('Feature resource generation requires a ResourceDefinition');
  const concentration = parseFloat(rng.range(1, 80).toFixed(1));
  const qv = rng.random();
  const availabilityRoll = Math.max(0, Math.min(0.999999, rng.random() + availabilityBias));
  return {
    id: occurrenceId,
    resourceId: resource.id,
    name: resource.name,
    concentrationPercent: concentration,
    quantityClass: quantityClass(qv),
    availabilityClass: availabilityClass(availabilityRoll),
    accessScope,
    descriptor: featureDescriptor(resource, rng),
    composition: featureComposition(resource, rng),
    sourceType: 'feature',
    sourceId: featureId,
  };
}

function compositionNote(resource) {
  const notes = {
    'basalt': 'Plagioclase + pyroxene ± olivine',
    'granite': 'Quartz + feldspar + mica',
    'sandstone': 'Quartz grains with siliceous cement',
    'limestone': 'Calcite matrix with shell fragments',
    'shale': 'Fine clay minerals and silica',
    'clay': 'Kaolinite / illite mix',
    'sand': 'Quartz-dominated granular material',
    'regolith': 'Pulverised surface rock and dust',
    'water-ice': 'H2O ice with minor impurities',
    'saline-water': 'NaCl-dominated saline water',
    'fresh-water': 'Low-mineral liquid water',
    'atmospheric-gas': 'Ambient atmospheric mixture',
    'wood': 'Cellulose and lignin-rich plant material',
    'plant-biomass': 'Mixed organic plant matter',
    'peat': 'Partially decomposed organic material',
    'organic-soil': 'Humus-rich mineral soil',
    'carbon-rich-rock': 'Carbonaceous rock material',
    'permafrost': 'Ice-cemented soil and rock',
    'mixed-sediment': 'Heterogeneous detrital mix',
    'carbonate-rock': 'Calcite / dolomite matrix',
    'gypsum': 'CaSO4·2H2O evaporite',
    'obsidian': 'Rhyolitic volcanic glass',
    'pumice': 'Vesicular volcanic material',
  };
  return notes[resource.id] || resource.name;
}

function featureDescriptor(resource, rng) {
  const descriptors = {
    'iron-ore': rng.pick(['Hematite-rich', 'Magnetite-rich', 'Siderite-bearing', 'Mixed oxide']),
    'copper-ore': rng.pick(['Chalcopyrite-rich', 'Bornite-bearing', 'Malachite-stained', 'Porphyry-type']),
    'aluminum-ore': rng.pick(['Gibbsite-dominant', 'Boehmite-rich', 'Lateritic bauxite']),
    'zinc-ore': rng.pick(['Sphalerite-rich', 'Smithsonite-bearing', 'Carbonate-hosted']),
    'nickel-ore': rng.pick(['Pentlandite-bearing', 'Garnierite-rich', 'Lateritic']),
    'titanium-ore': rng.pick(['Ilmenite-dominant', 'Rutile-bearing', 'Leucoxene']),
    'manganese-ore': rng.pick(['Pyrolusite', 'Rhodochrosite-bearing', 'Nodular']),
    'sulfur': rng.pick(['Native sulfur', 'Volcanic sublimate', 'Hydrothermal']),
    'halite': rng.pick(['Bedded evaporite', 'Domal', 'Caprock']),
    'phosphate-rock': rng.pick(['Apatite-rich', 'Francolite', 'Nodular']),
    'quartz': rng.pick(['Vein quartz', 'Quartzite', 'Chert nodules']),
    'graphite': rng.pick(['Flake graphite', 'Amorphous', 'Vein graphite']),
    'coal': rng.pick(['Anthracite', 'Bituminous', 'Sub-bituminous', 'Lignite']),
    'brine': rng.pick(['NaCl-dominated', 'Mg-rich', 'K-rich', 'Mixed evaporite']),
    'groundwater': rng.pick(['Confined aquifer', 'Unconfined aquifer', 'Karst system']),
    'natural-gas': rng.pick(['Dry methane', 'Wet gas', 'CO2-rich', 'N2-bearing']),
    'hydrocarbons': rng.pick(['Light fraction', 'Heavy crude', 'Bitumen-like', 'Mixed']),
    'gas-clathrate': rng.pick(['Methane clathrate', 'Mixed-gas clathrate', 'CO2 clathrate']),
    'ammonia-water-solution': rng.pick(['Dilute ammonia', 'Concentrated ammonia-water']),
    'magma': rng.pick(['Basaltic', 'Andesitic', 'Rhyolitic', 'Ultramafic']),
    'geothermal-fluid': rng.pick(['High-enthalpy steam', 'Mixed steam-water', 'Superheated brine']),
    'lithium-brine': rng.pick(['Li-Cl dominant', 'Li-B-rich', 'Evaporite-hosted']),
    'rare-earth-ore': rng.pick(['Monazite-rich', 'Bastnäsite', 'Xenotime-bearing', 'Ion-adsorption']),
  };
  return descriptors[resource.id] || compositionNote(resource);
}

function featureComposition(resource, rng) {
  // Detailed mixtures only exist where the current simulation has a useful template.
  // Other resources retain their coarse resource identity until deeper chemistry is implemented.
  const templates = {
    'iron-ore': () => normalise({ hematite: rng.int(20,70), magnetite: rng.int(5,30), goethite: rng.int(2,15), quartz: rng.int(5,25) }),
    'copper-ore': () => normalise({ chalcopyrite: rng.int(30,60), bornite: rng.int(5,20), pyrite: rng.int(5,15), quartzAndGangue: rng.int(10,30) }),
    'aluminum-ore': () => normalise({ gibbsite: rng.int(30,60), boehmite: rng.int(10,30), kaolinite: rng.int(5,20), ironOxides: rng.int(5,15) }),
    'zinc-ore': () => normalise({ sphalerite: rng.int(40,70), galena: rng.int(5,20), pyrite: rng.int(5,15), gangue: rng.int(5,20) }),
    'nickel-ore': () => normalise({ pentlandite: rng.int(30,60), pyrrhotite: rng.int(10,30), chalcopyrite: rng.int(5,15), gangue: rng.int(10,25) }),
    'brine': () => normalise({ NaCl: rng.int(30,70), MgCl2: rng.int(5,25), KCl: rng.int(2,15), CaSO4: rng.int(2,10), other: rng.int(1,5) }),
    'natural-gas': () => normalise({ CH4: rng.int(60,95), C2H6: rng.int(1,15), CO2: rng.int(1,10), N2: rng.int(1,8) }),
  };
  const fn = templates[resource.id];
  return fn ? fn() : null;
}

function normalise(obj) {
  const total = Object.values(obj).reduce((a, b) => a + b, 0);
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = parseFloat(((value / total) * 100).toFixed(1));
  }
  return result;
}
