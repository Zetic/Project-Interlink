export const MATERIAL_SPECIES = Object.freeze({
  hematite: Object.freeze({
    id: 'hematite',
    name: 'Hematite',
    formula: 'Fe2O3',
    kind: 'mineral',
    physicalProperties: Object.freeze({
      magneticResponse: Object.freeze({ susceptibility: 0.55, entrainmentFactor: 0.01 }),
    }),
  }),
  magnetite: Object.freeze({
    id: 'magnetite',
    name: 'Magnetite',
    formula: 'Fe3O4',
    kind: 'mineral',
    physicalProperties: Object.freeze({
      magneticResponse: Object.freeze({ susceptibility: 1, entrainmentFactor: 0.005 }),
    }),
  }),
  goethite: Object.freeze({
    id: 'goethite',
    name: 'Goethite',
    formula: 'FeO(OH)',
    kind: 'mineral',
    physicalProperties: Object.freeze({
      magneticResponse: Object.freeze({ susceptibility: 0.35, entrainmentFactor: 0.01 }),
    }),
  }),
  quartz: Object.freeze({
    id: 'quartz',
    name: 'Quartz',
    formula: 'SiO2',
    kind: 'mineral',
    physicalProperties: Object.freeze({
      magneticResponse: Object.freeze({ susceptibility: 0, entrainmentFactor: 0.02 }),
    }),
  }),
  quartzAndGangue: Object.freeze({
    id: 'quartzAndGangue',
    name: 'Quartz / Gangue Mixture',
    formula: null,
    kind: 'pseudo-species',
    description: 'Legacy unresolved gangue mixture placeholder retained for prototype compatibility.',
    physicalProperties: Object.freeze({
      magneticResponse: Object.freeze({ susceptibility: 0, entrainmentFactor: 0.02 }),
    }),
  }),
  'gangue-mixture': Object.freeze({
    id: 'gangue-mixture',
    name: 'Gangue Mixture',
    formula: null,
    kind: 'pseudo-species',
    description: 'Unresolved non-ore mineral mixture placeholder for prototype catalogs.',
    physicalProperties: Object.freeze({
      magneticResponse: Object.freeze({ susceptibility: 0, entrainmentFactor: 0.02 }),
    }),
  }),
});

export function listMaterialSpecies() {
  return Object.values(MATERIAL_SPECIES);
}

export function getMaterialSpecies(speciesId) {
  return MATERIAL_SPECIES[speciesId] ?? null;
}

export function requireMaterialSpecies(speciesId) {
  const species = getMaterialSpecies(speciesId);
  if (!species) throw new Error(`Unsupported material species '${speciesId}'`);
  return species;
}
