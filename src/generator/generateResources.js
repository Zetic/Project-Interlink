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
    'sandstone': 'Quartz grains with carbonate/feldspar cement',
    'limestone': 'Calcite-dominant carbonate rock',
    'shale': 'Fine clay minerals, silica, and minor sulfide',
    'clay': 'Kaolinite / illite mix',
    'sand': 'Quartz-dominated granular material',
    'regolith': 'Weathered silicate minerals and iron oxide',
    'water-ice': 'H2O ice',
    'saline-water': 'NaCl-dominated saline water',
    'fresh-water': 'Low-mineral liquid water',
    'atmospheric-gas': 'Ambient atmospheric mixture',
    'wood': 'Cellulose and lignin-rich plant material',
    'plant-biomass': 'Cellulose and lignin-rich plant material',
    'peat': 'Partially decomposed lignocellulosic material',
    'organic-soil': 'Mineral soil with lignocellulosic organic matter',
    'carbon-rich-rock': 'Graphitic siliceous rock',
    'permafrost': 'Ice-cemented silicate soil',
    'mixed-sediment': 'Quartz, feldspar, clay, and carbonate sediment',
    'carbonate-rock': 'Calcite / dolomite matrix',
    'gypsum': 'CaSO4·2H2O evaporite',
    'obsidian': 'Silica-rich volcanic glass',
    'pumice': 'Silica-rich vesicular volcanic glass',
  };
  return notes[resource.id] || resource.name;
}

function featureDescriptor(resource, rng) {
  const descriptors = {
    'iron-ore': rng.pick(['Hematite-rich', 'Magnetite-rich', 'Goethite-bearing', 'Mixed oxide']),
    'copper-ore': rng.pick(['Chalcopyrite-rich', 'Bornite-bearing', 'Pyrite-bearing', 'Porphyry-type']),
    'aluminum-ore': rng.pick(['Gibbsite-dominant', 'Boehmite-rich', 'Lateritic bauxite']),
    'zinc-ore': rng.pick(['Sphalerite-rich', 'Galena-bearing', 'Carbonate-hosted']),
    'nickel-ore': rng.pick(['Pentlandite-bearing', 'Pyrrhotite-rich', 'Sulfide-rich']),
    'titanium-ore': rng.pick(['Ilmenite-dominant', 'Rutile-bearing', 'Mixed titanium oxide']),
    'manganese-ore': rng.pick(['Pyrolusite-rich', 'Rhodochrosite-bearing', 'Mixed manganese mineralization']),
    'sulfur': rng.pick(['Native sulfur', 'Volcanic sublimate', 'Hydrothermal']),
    'halite': rng.pick(['Bedded evaporite', 'Domal', 'Caprock']),
    'phosphate-rock': rng.pick(['Fluorapatite-rich', 'Carbonate-bearing', 'Nodular']),
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
    'rare-earth-ore': rng.pick(['Monazite-rich', 'Bastnasite-rich', 'Xenotime-bearing', 'Mixed rare-earth mineralization']),
  };
  return descriptors[resource.id] || compositionNote(resource);
}

/**
 * Composition templates use concrete chemical/mineral species only. Resource
 * classes such as "iron ore", "gangue", or "iron oxides" are never emitted as
 * material constituents. Solid resources all receive a concrete composition so
 * downstream property-driven apparatus can reason about every generated fraction.
 */
function featureComposition(resource, rng) {
  const templates = {
    'basalt': () => normalise({ plagioclase: rng.int(45,60), augite: rng.int(20,35), olivine: rng.int(5,20) }),
    'granite': () => normalise({ quartz: rng.int(20,35), orthoclase: rng.int(25,40), plagioclase: rng.int(20,35), biotite: rng.int(5,15) }),
    'sandstone': () => normalise({ quartz: rng.int(70,90), calcite: rng.int(5,20), plagioclase: rng.int(2,10) }),
    'limestone': () => normalise({ calcite: rng.int(75,95), dolomite: rng.int(5,20), quartz: rng.int(1,8) }),
    'shale': () => normalise({ illite: rng.int(35,55), kaolinite: rng.int(15,30), quartz: rng.int(20,40), pyrite: rng.int(1,5) }),
    'clay': () => normalise({ kaolinite: rng.int(45,70), illite: rng.int(20,45), quartz: rng.int(5,15) }),
    'sand': () => normalise({ quartz: rng.int(80,98), plagioclase: rng.int(2,15) }),
    'regolith': () => normalise({ quartz: rng.int(30,50), plagioclase: rng.int(20,40), kaolinite: rng.int(10,25), hematite: rng.int(2,10) }),
    'water-ice': () => ({ waterIce: 100 }),
    'wood': () => normalise({ cellulose: rng.int(55,70), lignin: rng.int(30,45) }),
    'plant-biomass': () => normalise({ cellulose: rng.int(60,75), lignin: rng.int(25,40) }),
    'peat': () => normalise({ cellulose: rng.int(45,60), lignin: rng.int(40,55) }),
    'organic-soil': () => normalise({ quartz: rng.int(30,45), kaolinite: rng.int(20,35), cellulose: rng.int(15,25), lignin: rng.int(10,20) }),
    'carbon-rich-rock': () => normalise({ graphite: rng.int(35,60), quartz: rng.int(40,65) }),
    'permafrost': () => normalise({ waterIce: rng.int(45,65), quartz: rng.int(20,35), kaolinite: rng.int(10,20) }),

    'iron-ore': () => normalise({ hematite: rng.int(20,70), magnetite: rng.int(5,30), goethite: rng.int(2,15), quartz: rng.int(5,25) }),
    'copper-ore': () => normalise({ chalcopyrite: rng.int(30,60), bornite: rng.int(5,20), pyrite: rng.int(5,15), quartz: rng.int(10,30) }),
    'aluminum-ore': () => normalise({ gibbsite: rng.int(30,60), boehmite: rng.int(10,30), kaolinite: rng.int(5,20), hematite: rng.int(5,15) }),
    'zinc-ore': () => normalise({ sphalerite: rng.int(40,70), galena: rng.int(5,20), pyrite: rng.int(5,15), quartz: rng.int(5,20) }),
    'nickel-ore': () => normalise({ pentlandite: rng.int(30,60), pyrrhotite: rng.int(10,30), chalcopyrite: rng.int(5,15), quartz: rng.int(10,25) }),
    'titanium-ore': () => normalise({ ilmenite: rng.int(45,75), rutile: rng.int(10,30), quartz: rng.int(10,25) }),
    'manganese-ore': () => normalise({ pyrolusite: rng.int(45,75), rhodochrosite: rng.int(10,30), quartz: rng.int(10,25) }),
    'sulfur': () => ({ sulfur: 100 }),
    'halite': () => ({ halite: 100 }),
    'phosphate-rock': () => normalise({ fluorapatite: rng.int(60,80), calcite: rng.int(10,25), quartz: rng.int(5,15) }),
    'quartz': () => ({ quartz: 100 }),
    'graphite': () => ({ graphite: 100 }),
    'coal': () => normalise({ graphite: rng.int(65,85), kaolinite: rng.int(10,25), pyrite: rng.int(2,10) }),
    'gas-clathrate': () => ({ methaneHydrate: 100 }),
    'rare-earth-ore': () => normalise({ monazite: rng.int(30,55), bastnasite: rng.int(15,35), xenotime: rng.int(5,20), quartz: rng.int(10,25) }),
    'mixed-sediment': () => normalise({ quartz: rng.int(45,65), plagioclase: rng.int(15,30), kaolinite: rng.int(10,20), calcite: rng.int(5,15) }),
    'carbonate-rock': () => normalise({ calcite: rng.int(60,80), dolomite: rng.int(20,40) }),
    'gypsum': () => ({ gypsum: 100 }),
    'obsidian': () => ({ silicaGlass: 100 }),
    'pumice': () => normalise({ silicaGlass: rng.int(75,90), plagioclase: rng.int(10,25) }),

    // These phases are not yet accepted by the solid Extractor, but their
    // detailed templates also avoid placeholder constituents.
    'brine': () => normalise({ H2O: rng.int(80,95), NaCl: rng.int(3,15), MgCl2: rng.int(1,5), KCl: rng.int(1,3), CaSO4: rng.int(1,2) }),
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
