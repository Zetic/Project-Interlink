export interface ThermalState {
  sensibleEnthalpyJ: number;
}

export interface ThermalProperties {
  specificHeatCapacityJPerKgK: number;
}

export interface MaterialChemistry {
  molarMassKgPerMol: number;
  elementalComposition: Readonly<Record<string, number>>;
}

export interface MaterialSpecies {
  id: string;
  name: string;
  formula: string | null;
  kind: string;
  physicalProperties: Readonly<{
    densityKgPerM3?: number;
    magneticResponse: Readonly<{ normalizedSeparationCoefficient: number }>;
    thermal?: Readonly<ThermalProperties>;
  }>;
  chemistry?: Readonly<MaterialChemistry>;
}

export interface MaterialSpeciesInput {
  id: string;
  name: string;
  formula?: string | null;
  kind?: string;
  magneticResponse?: number;
  densityKgPerM3?: number | null;
  thermal?: ThermalProperties | null;
  chemistry?: {
    molarMassKgPerMol: number;
    elementalComposition: Record<string, number>;
  } | null;
}

export interface ComminutionProperties {
  bondCrushingWorkIndexKWhPerT: number;
  bondBallMillWorkIndexKWhPerT: number;
  bondAbrasionIndex: number;
}

export interface GrainSizeDistribution {
  d10: number;
  d50: number;
  d90: number;
}

export interface MineralOccurrenceModes {
  free: number;
  boundary: number;
  intergrown: number;
  included: number;
}

export interface SpeciesMineralTexture {
  grainSizeUm: GrainSizeDistribution;
  occurrenceModes: MineralOccurrenceModes;
}

export interface MineralTextureProfile {
  id: string;
  speciesTextures: Record<string, SpeciesMineralTexture>;
  comminutionProperties?: ComminutionProperties;
}

export interface SolidFractionDescriptor {
  speciesId: string;
  sizeBinId: string;
  liberationClassId: string;
  textureProfileId: string | null;
}

export interface SolidFraction extends SolidFractionDescriptor {
  quantity: number;
}

export interface SolidFractionInput {
  speciesId: string;
  sizeBinId: string;
  liberationClassId: string;
  textureProfileId?: string | null;
  quantity?: number;
  massKg?: number;
  rateKgPerSecond?: number;
}

export interface SolidMaterialState {
  fractions: Record<string, number>;
  textureProfiles: Record<string, MineralTextureProfile>;
}

export interface SolidMaterialBody {
  physicalForm: 'solid-particulate';
  solidState: SolidMaterialState;
  thermalState: ThermalState;
}

export interface GasMaterialState {
  speciesMassKg: Record<string, number>;
}

export interface GasMaterialBody {
  physicalForm: string;
  gasState: GasMaterialState;
  thermalState: ThermalState;
}
