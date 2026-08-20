export const MATERIAL_SPECIES = Object.freeze({
  hematite: Object.freeze({
    id: 'hematite',
    name: 'Hematite',
    formula: 'Fe2O3',
    kind: 'mineral',
    physicalProperties: Object.freeze({
      // Gameplay-tuned separator coefficient, not literal SI magnetic susceptibility.
      magneticResponse: Object.freeze({ normalizedSeparationCoefficient: 0.55 }),
    }),
  }),
  magnetite: Object.freeze({
    id: 'magnetite',
    name: 'Magnetite',
    formula: 'Fe3O4',
    kind: 'mineral',
    physicalProperties: Object.freeze({
      magneticResponse: Object.freeze({ normalizedSeparationCoefficient: 1 }),
    }),
  }),
  goethite: Object.freeze({
    id: 'goethite',
    name: 'Goethite',
    formula: 'FeO(OH)',
    kind: 'mineral',
    physicalProperties: Object.freeze({
      magneticResponse: Object.freeze({ normalizedSeparationCoefficient: 0.35 }),
    }),
  }),
  quartz: Object.freeze({
    id: 'quartz',
    name: 'Quartz',
    formula: 'SiO2',
    kind: 'mineral',
    physicalProperties: Object.freeze({
      magneticResponse: Object.freeze({ normalizedSeparationCoefficient: 0 }),
    }),
  }),
  quartzAndGangue: Object.freeze({
    id: 'quartzAndGangue',
    name: 'Quartz / Gangue Mixture',
    formula: null,
    kind: 'pseudo-species',
    description: 'Legacy unresolved gangue mixture placeholder retained for prototype compatibility.',
    physicalProperties: Object.freeze({
      magneticResponse: Object.freeze({ normalizedSeparationCoefficient: 0 }),
    }),
  }),
  'gangue-mixture': Object.freeze({
    id: 'gangue-mixture',
    name: 'Gangue Mixture',
    formula: null,
    kind: 'pseudo-species',
    description: 'Unresolved non-ore mineral mixture placeholder for prototype catalogs.',
    physicalProperties: Object.freeze({
      magneticResponse: Object.freeze({ normalizedSeparationCoefficient: 0 }),
    }),
  }),
});

export function requireMaterialConstituentId(speciesId) {
  if (typeof speciesId !== 'string' || !speciesId) {
    throw new Error('Material constituent id must be a non-empty string');
  }
  if (speciesId.includes('|')) {
    throw new Error(`Material constituent id '${speciesId}' cannot contain '|'`);
  }
  return speciesId;
}

export function listMaterialSpecies() {
  return Object.values(MATERIAL_SPECIES);
}

export function getMaterialSpecies(speciesId) {
  return MATERIAL_SPECIES[speciesId] ?? null;
}

export function requireMaterialSpecies(speciesId) {
  requireMaterialConstituentId(speciesId);
  const species = getMaterialSpecies(speciesId);
  if (!species) throw new Error(`Unsupported material species '${speciesId}'`);
  return species;
}
