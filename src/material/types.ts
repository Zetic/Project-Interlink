export type MaterialPhysicalForm = 'solid-particulate' | 'liquid' | 'gas' | 'bulk-solid' | 'product';

export interface MaterialComponentFraction {
  speciesId: string;
  massFraction: number;
}

export type LiberationClassId = 'locked' | 'partial' | 'mostly-liberated' | 'liberated';
export type FragmentationProfileId = 'run-of-mine-rock' | 'coarse-solid';

export interface GrainSizeDistributionUm {
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

export interface MineralSpeciesTexture {
  grainSizeUm: GrainSizeDistributionUm;
  occurrenceModes: MineralOccurrenceModes;
}

export interface ComminutionProperties {
  bondCrushingWorkIndexKWhPerT: number;
  bondBallMillWorkIndexKWhPerT: number;
  bondAbrasionIndex: number;
}

export interface MineralTextureProfile {
  id: string;
  speciesTextures: Record<string, MineralSpeciesTexture>;
  comminutionProperties?: ComminutionProperties;
}

export interface SolidParticulatePopulation {
  speciesId: string;
  particleSizeBinId: string;
  liberationClassId: LiberationClassId;
  textureProfileId: string | null;
  massFraction: number;
}

/**
 * Authoring-time description of a naturally occurring extractable source.
 * This is initial world data only: remaining reserve, material inventories,
 * stream rates, and all physical mutation are runtime-owned by Rust/WASM.
 */
export interface ResourceSourceDefinition {
  physicalForm: 'solid-particulate';
  composition: MaterialComponentFraction[];
  initialReserveMassKg: number | null;
  fragmentationProfileId: FragmentationProfileId;
  mineralTexture: MineralTextureProfile | null;
  comminutionProperties: ComminutionProperties | null;
}

/**
 * Cross-form matter vocabulary. These DTO contracts describe the information
 * that may be authored/projected for each form; authoritative mutable bodies
 * remain Rust-owned once material enters the production runtime.
 */
export interface SolidParticulateBodyDescriptor {
  physicalForm: 'solid-particulate';
  populations: SolidParticulatePopulation[];
  sensibleEnthalpyJ: number;
}

export interface FluidComponentAmount {
  speciesId: string;
  massKg: number;
}

export interface LiquidBodyDescriptor {
  physicalForm: 'liquid';
  components: FluidComponentAmount[];
  sensibleEnthalpyJ: number;
  pressurePa?: number;
}

export interface GasBodyDescriptor {
  physicalForm: 'gas';
  components: FluidComponentAmount[];
  sensibleEnthalpyJ: number;
  pressurePa?: number;
}

export interface BulkSolidBodyDescriptor {
  physicalForm: 'bulk-solid';
  composition: MaterialComponentFraction[];
  massKg: number;
  sensibleEnthalpyJ: number;
  gradeId?: string;
}

export interface ProductBodyDescriptor {
  physicalForm: 'product';
  productId: string;
  quantity: number;
  gradeId?: string;
}

export type MaterialBodyDescriptor =
  | SolidParticulateBodyDescriptor
  | LiquidBodyDescriptor
  | GasBodyDescriptor
  | BulkSolidBodyDescriptor
  | ProductBodyDescriptor;

export function compositionTotal(composition: readonly MaterialComponentFraction[]): number {
  return composition.reduce((total, component) => total + component.massFraction, 0);
}
