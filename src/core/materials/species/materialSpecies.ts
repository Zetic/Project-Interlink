import type { MaterialSpecies, MaterialSpeciesInput } from '../types.js';

function defineSpecies({
  id,
  name,
  formula = null,
  kind = 'mineral',
  magneticResponse = 0,
  densityKgPerM3 = null,
  thermal = null,
  chemistry = null,
}: MaterialSpeciesInput): MaterialSpecies {
  if (!id || typeof id !== 'string') throw new Error('Material species id must be a non-empty string');
  if (!Number.isFinite(magneticResponse) || magneticResponse < 0 || magneticResponse > 1) {
    throw new Error(`Material species '${id}' magnetic response must be within [0, 1]`);
  }
  if (densityKgPerM3 != null && (!Number.isFinite(densityKgPerM3) || densityKgPerM3 <= 0)) {
    throw new Error(`Material species '${id}' densityKgPerM3 must be a finite positive number`);
  }
  if (thermal != null && (!Number.isFinite(thermal.specificHeatCapacityJPerKgK) || thermal.specificHeatCapacityJPerKgK <= 0)) {
    throw new Error(`Material species '${id}' thermal specificHeatCapacityJPerKgK must be a finite positive number`);
  }
  if (chemistry != null) {
    if (!Number.isFinite(chemistry.molarMassKgPerMol) || chemistry.molarMassKgPerMol <= 0) {
      throw new Error(`Material species '${id}' chemistry molarMassKgPerMol must be a finite positive number`);
    }
    for (const [element, atoms] of Object.entries(chemistry.elementalComposition ?? {})) {
      if (!element || !Number.isFinite(atoms) || atoms <= 0) {
        throw new Error(`Material species '${id}' chemistry elementalComposition must contain positive atom counts`);
      }
    }
  }
  return Object.freeze({
    id,
    name,
    formula,
    kind,
    physicalProperties: Object.freeze({
      ...(densityKgPerM3 == null ? {} : { densityKgPerM3 }),
      magneticResponse: Object.freeze({ normalizedSeparationCoefficient: magneticResponse }),
      ...(thermal ? { thermal: Object.freeze({ ...thermal }) } : {}),
    }),
    ...(chemistry ? {
      chemistry: Object.freeze({
        molarMassKgPerMol: chemistry.molarMassKgPerMol,
        elementalComposition: Object.freeze({ ...chemistry.elementalComposition }),
      }),
    } : {}),
  });
}

const SPECIES: MaterialSpecies[] = [
  defineSpecies({ id: 'hematite', name: 'Hematite', formula: 'Fe2O3', magneticResponse: 0.55, densityKgPerM3: 5260, thermal: { specificHeatCapacityJPerKgK: 650 }, chemistry: { molarMassKgPerMol: 0.159687, elementalComposition: { Fe: 2, O: 3 } } }),
  defineSpecies({ id: 'magnetite', name: 'Magnetite', formula: 'Fe3O4', magneticResponse: 1, densityKgPerM3: 5170, thermal: { specificHeatCapacityJPerKgK: 670 }, chemistry: { molarMassKgPerMol: 0.231531, elementalComposition: { Fe: 3, O: 4 } } }),
  defineSpecies({ id: 'goethite', name: 'Goethite', formula: 'FeO(OH)', magneticResponse: 0.35, densityKgPerM3: 4000, thermal: { specificHeatCapacityJPerKgK: 650 }, chemistry: { molarMassKgPerMol: 0.088851, elementalComposition: { Fe: 1, O: 2, H: 1 } } }),
  defineSpecies({ id: 'quartz', name: 'Quartz', formula: 'SiO2', magneticResponse: 0, densityKgPerM3: 2650, thermal: { specificHeatCapacityJPerKgK: 740 }, chemistry: { molarMassKgPerMol: 0.0600843, elementalComposition: { Si: 1, O: 2 } } }),
  defineSpecies({ id: 'waterVapor', name: 'Water Vapor', formula: 'H2O', kind: 'molecular-gas', magneticResponse: 0, thermal: { specificHeatCapacityJPerKgK: 1900 }, chemistry: { molarMassKgPerMol: 0.018015, elementalComposition: { H: 2, O: 1 } } }),
  defineSpecies({ id: 'chalcopyrite', name: 'Chalcopyrite', formula: 'CuFeS2', magneticResponse: 0.05, densityKgPerM3: 4200 }),
  defineSpecies({ id: 'bornite', name: 'Bornite', formula: 'Cu5FeS4', magneticResponse: 0.03, densityKgPerM3: 5100 }),
  defineSpecies({ id: 'pyrite', name: 'Pyrite', formula: 'FeS2', magneticResponse: 0.02, densityKgPerM3: 5010 }),
  defineSpecies({ id: 'gibbsite', name: 'Gibbsite', formula: 'Al(OH)3', magneticResponse: 0, densityKgPerM3: 2420 }),
  defineSpecies({ id: 'boehmite', name: 'Boehmite', formula: 'AlO(OH)', magneticResponse: 0, densityKgPerM3: 3010 }),
  defineSpecies({ id: 'kaolinite', name: 'Kaolinite', formula: 'Al2Si2O5(OH)4', magneticResponse: 0.005, densityKgPerM3: 2600 }),
  defineSpecies({ id: 'sphalerite', name: 'Sphalerite', formula: 'ZnS', magneticResponse: 0.005, densityKgPerM3: 4100 }),
  defineSpecies({ id: 'galena', name: 'Galena', formula: 'PbS', magneticResponse: 0, densityKgPerM3: 7600 }),
  defineSpecies({ id: 'pentlandite', name: 'Pentlandite', formula: '(Fe,Ni)9S8', magneticResponse: 0.12, densityKgPerM3: 4600 }),
  defineSpecies({ id: 'pyrrhotite', name: 'Pyrrhotite', formula: 'Fe1-xS', magneticResponse: 0.7, densityKgPerM3: 4600 }),
  defineSpecies({ id: 'plagioclase', name: 'Plagioclase', formula: '(Na,Ca)(Si,Al)4O8', magneticResponse: 0.005, densityKgPerM3: 2700 }),
  defineSpecies({ id: 'augite', name: 'Augite', formula: '(Ca,Na)(Mg,Fe,Al,Ti)(Si,Al)2O6', magneticResponse: 0.08, densityKgPerM3: 3400 }),
  defineSpecies({ id: 'olivine', name: 'Olivine', formula: '(Mg,Fe)2SiO4', magneticResponse: 0.08, densityKgPerM3: 3300 }),
  defineSpecies({ id: 'orthoclase', name: 'Orthoclase', formula: 'KAlSi3O8', magneticResponse: 0.005, densityKgPerM3: 2560 }),
  defineSpecies({ id: 'biotite', name: 'Biotite', formula: 'K(Mg,Fe)3AlSi3O10(F,OH)2', magneticResponse: 0.12, densityKgPerM3: 3100 }),
  defineSpecies({ id: 'calcite', name: 'Calcite', formula: 'CaCO3', magneticResponse: 0, densityKgPerM3: 2710 }),
  defineSpecies({ id: 'dolomite', name: 'Dolomite', formula: 'CaMg(CO3)2', magneticResponse: 0, densityKgPerM3: 2850 }),
  defineSpecies({ id: 'illite', name: 'Illite', formula: '(K,H3O)(Al,Mg,Fe)2(Si,Al)4O10[(OH)2,H2O]', magneticResponse: 0.01, densityKgPerM3: 2750 }),
  defineSpecies({ id: 'waterIce', name: 'Water Ice', formula: 'H2O', kind: 'molecular-solid', magneticResponse: 0, densityKgPerM3: 917 }),
  defineSpecies({ id: 'cellulose', name: 'Cellulose', formula: '(C6H10O5)n', kind: 'biopolymer', magneticResponse: 0, densityKgPerM3: 1500 }),
  defineSpecies({ id: 'lignin', name: 'Lignin', formula: null, kind: 'biopolymer', magneticResponse: 0, densityKgPerM3: 1300 }),
  defineSpecies({ id: 'graphite', name: 'Graphite', formula: 'C', magneticResponse: 0.01, densityKgPerM3: 2260 }),
  defineSpecies({ id: 'ilmenite', name: 'Ilmenite', formula: 'FeTiO3', magneticResponse: 0.65, densityKgPerM3: 4790 }),
  defineSpecies({ id: 'rutile', name: 'Rutile', formula: 'TiO2', magneticResponse: 0.01, densityKgPerM3: 4230 }),
  defineSpecies({ id: 'pyrolusite', name: 'Pyrolusite', formula: 'MnO2', magneticResponse: 0.15, densityKgPerM3: 5000 }),
  defineSpecies({ id: 'rhodochrosite', name: 'Rhodochrosite', formula: 'MnCO3', magneticResponse: 0.02, densityKgPerM3: 3700 }),
  defineSpecies({ id: 'sulfur', name: 'Sulfur', formula: 'S', kind: 'element', magneticResponse: 0, densityKgPerM3: 2070 }),
  defineSpecies({ id: 'halite', name: 'Halite', formula: 'NaCl', magneticResponse: 0, densityKgPerM3: 2170 }),
  defineSpecies({ id: 'fluorapatite', name: 'Fluorapatite', formula: 'Ca5(PO4)3F', magneticResponse: 0.01, densityKgPerM3: 3200 }),
  defineSpecies({ id: 'methaneHydrate', name: 'Methane Hydrate', formula: 'CH4·5.75H2O', kind: 'clathrate', magneticResponse: 0, densityKgPerM3: 900 }),
  defineSpecies({ id: 'monazite', name: 'Monazite', formula: '(Ce,La,Nd,Th)PO4', magneticResponse: 0.02, densityKgPerM3: 5000 }),
  defineSpecies({ id: 'bastnasite', name: 'Bastnasite', formula: '(Ce,La)CO3F', magneticResponse: 0.01, densityKgPerM3: 4900 }),
  defineSpecies({ id: 'xenotime', name: 'Xenotime', formula: 'YPO4', magneticResponse: 0.01, densityKgPerM3: 4500 }),
  defineSpecies({ id: 'gypsum', name: 'Gypsum', formula: 'CaSO4·2H2O', magneticResponse: 0, densityKgPerM3: 2320 }),
  defineSpecies({ id: 'silicaGlass', name: 'Silica-rich Volcanic Glass', formula: 'SiO2', kind: 'amorphous-solid', magneticResponse: 0, densityKgPerM3: 2200 }),
];

export const MATERIAL_SPECIES: Readonly<Record<string, MaterialSpecies>> = Object.freeze(
  Object.fromEntries(SPECIES.map(species => [species.id, species])),
);

const LEGACY_CONSTITUENT_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  quartzAndGangue: 'quartz',
  'gangue-mixture': 'quartz',
  gangue: 'quartz',
  ironOxides: 'hematite',
});

export function canonicalMaterialSpeciesId(speciesId: string): string {
  if (typeof speciesId !== 'string' || !speciesId) {
    throw new Error('Material constituent id must be a non-empty string');
  }
  if (speciesId.includes('|')) {
    throw new Error(`Material constituent id '${speciesId}' cannot contain '|'`);
  }
  return LEGACY_CONSTITUENT_ALIASES[speciesId] ?? speciesId;
}

export function requireMaterialConstituentId(speciesId: string): string {
  return canonicalMaterialSpeciesId(speciesId);
}

export function listMaterialSpecies(): MaterialSpecies[] {
  return Object.values(MATERIAL_SPECIES);
}

export function getMaterialSpecies(speciesId: string): MaterialSpecies | null {
  const canonicalId = canonicalMaterialSpeciesId(speciesId);
  return MATERIAL_SPECIES[canonicalId] ?? null;
}

export function requireMaterialSpecies(speciesId: string): MaterialSpecies {
  const canonicalId = canonicalMaterialSpeciesId(speciesId);
  const species = MATERIAL_SPECIES[canonicalId];
  if (!species) throw new Error(`Unsupported material species '${speciesId}'`);
  return species;
}

export function materialSpeciesDensityKgPerM3(speciesId: string): number | undefined {
  return requireMaterialSpecies(speciesId).physicalProperties.densityKgPerM3;
}
