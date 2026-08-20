function defineSpecies({ id, name, formula = null, kind = 'mineral', magneticResponse = 0 }) {
  if (!id || typeof id !== 'string') throw new Error('Material species id must be a non-empty string');
  if (!Number.isFinite(magneticResponse) || magneticResponse < 0 || magneticResponse > 1) {
    throw new Error(`Material species '${id}' magnetic response must be within [0, 1]`);
  }
  return Object.freeze({
    id,
    name,
    formula,
    kind,
    physicalProperties: Object.freeze({
      // Gameplay-normalized magnetic-separation response. These coefficients are
      // deliberately not literal SI magnetic susceptibility values.
      magneticResponse: Object.freeze({ normalizedSeparationCoefficient: magneticResponse }),
    }),
  });
}

const SPECIES = [
  defineSpecies({ id: 'hematite', name: 'Hematite', formula: 'Fe2O3', magneticResponse: 0.55 }),
  defineSpecies({ id: 'magnetite', name: 'Magnetite', formula: 'Fe3O4', magneticResponse: 1 }),
  defineSpecies({ id: 'goethite', name: 'Goethite', formula: 'FeO(OH)', magneticResponse: 0.35 }),
  defineSpecies({ id: 'quartz', name: 'Quartz', formula: 'SiO2', magneticResponse: 0 }),
  defineSpecies({ id: 'chalcopyrite', name: 'Chalcopyrite', formula: 'CuFeS2', magneticResponse: 0.05 }),
  defineSpecies({ id: 'bornite', name: 'Bornite', formula: 'Cu5FeS4', magneticResponse: 0.03 }),
  defineSpecies({ id: 'pyrite', name: 'Pyrite', formula: 'FeS2', magneticResponse: 0.02 }),
  defineSpecies({ id: 'gibbsite', name: 'Gibbsite', formula: 'Al(OH)3', magneticResponse: 0 }),
  defineSpecies({ id: 'boehmite', name: 'Boehmite', formula: 'AlO(OH)', magneticResponse: 0 }),
  defineSpecies({ id: 'kaolinite', name: 'Kaolinite', formula: 'Al2Si2O5(OH)4', magneticResponse: 0.005 }),
  defineSpecies({ id: 'sphalerite', name: 'Sphalerite', formula: 'ZnS', magneticResponse: 0.005 }),
  defineSpecies({ id: 'galena', name: 'Galena', formula: 'PbS', magneticResponse: 0 }),
  defineSpecies({ id: 'pentlandite', name: 'Pentlandite', formula: '(Fe,Ni)9S8', magneticResponse: 0.12 }),
  defineSpecies({ id: 'pyrrhotite', name: 'Pyrrhotite', formula: 'Fe1-xS', magneticResponse: 0.7 }),
  defineSpecies({ id: 'plagioclase', name: 'Plagioclase', formula: '(Na,Ca)(Si,Al)4O8', magneticResponse: 0.005 }),
  defineSpecies({ id: 'augite', name: 'Augite', formula: '(Ca,Na)(Mg,Fe,Al,Ti)(Si,Al)2O6', magneticResponse: 0.08 }),
  defineSpecies({ id: 'olivine', name: 'Olivine', formula: '(Mg,Fe)2SiO4', magneticResponse: 0.08 }),
  defineSpecies({ id: 'orthoclase', name: 'Orthoclase', formula: 'KAlSi3O8', magneticResponse: 0.005 }),
  defineSpecies({ id: 'biotite', name: 'Biotite', formula: 'K(Mg,Fe)3AlSi3O10(F,OH)2', magneticResponse: 0.12 }),
  defineSpecies({ id: 'calcite', name: 'Calcite', formula: 'CaCO3', magneticResponse: 0 }),
  defineSpecies({ id: 'dolomite', name: 'Dolomite', formula: 'CaMg(CO3)2', magneticResponse: 0 }),
  defineSpecies({ id: 'illite', name: 'Illite', formula: '(K,H3O)(Al,Mg,Fe)2(Si,Al)4O10[(OH)2,H2O]', magneticResponse: 0.01 }),
  defineSpecies({ id: 'waterIce', name: 'Water Ice', formula: 'H2O', kind: 'molecular-solid', magneticResponse: 0 }),
  defineSpecies({ id: 'cellulose', name: 'Cellulose', formula: '(C6H10O5)n', kind: 'biopolymer', magneticResponse: 0 }),
  defineSpecies({ id: 'lignin', name: 'Lignin', formula: null, kind: 'biopolymer', magneticResponse: 0 }),
  defineSpecies({ id: 'graphite', name: 'Graphite', formula: 'C', magneticResponse: 0.01 }),
  defineSpecies({ id: 'ilmenite', name: 'Ilmenite', formula: 'FeTiO3', magneticResponse: 0.65 }),
  defineSpecies({ id: 'rutile', name: 'Rutile', formula: 'TiO2', magneticResponse: 0.01 }),
  defineSpecies({ id: 'pyrolusite', name: 'Pyrolusite', formula: 'MnO2', magneticResponse: 0.15 }),
  defineSpecies({ id: 'rhodochrosite', name: 'Rhodochrosite', formula: 'MnCO3', magneticResponse: 0.02 }),
  defineSpecies({ id: 'sulfur', name: 'Sulfur', formula: 'S', kind: 'element', magneticResponse: 0 }),
  defineSpecies({ id: 'halite', name: 'Halite', formula: 'NaCl', magneticResponse: 0 }),
  defineSpecies({ id: 'fluorapatite', name: 'Fluorapatite', formula: 'Ca5(PO4)3F', magneticResponse: 0.01 }),
  defineSpecies({ id: 'methaneHydrate', name: 'Methane Hydrate', formula: 'CH4·5.75H2O', kind: 'clathrate', magneticResponse: 0 }),
  defineSpecies({ id: 'monazite', name: 'Monazite', formula: '(Ce,La,Nd,Th)PO4', magneticResponse: 0.02 }),
  defineSpecies({ id: 'bastnasite', name: 'Bastnasite', formula: '(Ce,La)CO3F', magneticResponse: 0.01 }),
  defineSpecies({ id: 'xenotime', name: 'Xenotime', formula: 'YPO4', magneticResponse: 0.01 }),
  defineSpecies({ id: 'gypsum', name: 'Gypsum', formula: 'CaSO4·2H2O', magneticResponse: 0 }),
  defineSpecies({ id: 'silicaGlass', name: 'Silica-rich Volcanic Glass', formula: 'SiO2', kind: 'amorphous-solid', magneticResponse: 0 }),
];

export const MATERIAL_SPECIES = Object.freeze(Object.fromEntries(SPECIES.map(species => [species.id, species])));

// Historical prototype inputs are canonicalized immediately when new material
// state is constructed. They are not species and are never emitted by generation.
const LEGACY_CONSTITUENT_ALIASES = Object.freeze({
  quartzAndGangue: 'quartz',
  'gangue-mixture': 'quartz',
  gangue: 'quartz',
  ironOxides: 'hematite',
});

export function canonicalMaterialSpeciesId(speciesId) {
  if (typeof speciesId !== 'string' || !speciesId) {
    throw new Error('Material constituent id must be a non-empty string');
  }
  if (speciesId.includes('|')) {
    throw new Error(`Material constituent id '${speciesId}' cannot contain '|'`);
  }
  return LEGACY_CONSTITUENT_ALIASES[speciesId] ?? speciesId;
}

export function requireMaterialConstituentId(speciesId) {
  return canonicalMaterialSpeciesId(speciesId);
}

export function listMaterialSpecies() {
  return Object.values(MATERIAL_SPECIES);
}

export function getMaterialSpecies(speciesId) {
  const canonicalId = canonicalMaterialSpeciesId(speciesId);
  return MATERIAL_SPECIES[canonicalId] ?? null;
}

export function requireMaterialSpecies(speciesId) {
  const canonicalId = canonicalMaterialSpeciesId(speciesId);
  const species = MATERIAL_SPECIES[canonicalId];
  if (!species) throw new Error(`Unsupported material species '${speciesId}'`);
  return species;
}
