export type MaterialPhysicalForm = 'solid-particulate' | 'gas';

export interface MaterialComponentFraction {
  speciesId: string;
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
  fragmentationProfileId: 'run-of-mine-rock' | 'coarse-solid';
}

export function compositionTotal(composition: readonly MaterialComponentFraction[]): number {
  return composition.reduce((total, component) => total + component.massFraction, 0);
}
