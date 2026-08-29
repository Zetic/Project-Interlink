/* tslint:disable */
/* eslint-disable */

/**
 * Stateful Rust-owned comminution apparatus. A complete fixed-step operation
 * mutates two Rust-owned Hoppers and both process streams without material
 * populations crossing the JS/WASM boundary.
 */
export class WasmPackedComminutionMachine {
    free(): void;
    [Symbol.dispose](): void;
    abrasion_exposure_tonne_ai(): number;
    input_specific_sensible_enthalpy_j_per_kg(): number;
    input_total_mass_flow_kg_per_second(): number;
    last_bond_abrasion_index(): number;
    last_error(): string;
    last_power_kw(): number;
    last_specific_energy_kwh_per_t(): number;
    constructor(equipment: string, target_size_id: number, target_particle_size_mm: number, throughput_kg_per_second: number, rated_power_kw: number, enabled: boolean);
    operating_state(): string;
    output_liberation_class_ids(): Uint8Array;
    output_quantities(): Float64Array;
    output_size_bin_ids(): Uint8Array;
    output_species_ids(): Uint16Array;
    output_specific_sensible_enthalpy_j_per_kg(): number;
    output_texture_profile_ids(): Uint32Array;
    output_total_mass_flow_kg_per_second(): number;
    tick_hopper_to_hopper(source: WasmPackedHopper, target: WasmPackedHopper, tables: WasmPackedComminutionTables, dt: number): number;
}

/**
 * Browser-facing compiler target for comminution metadata. Canonical string
 * identifiers are resolved by JavaScript once; the Rust hot path uses numeric
 * IDs and numeric property tables only.
 */
export class WasmPackedComminutionTables {
    free(): void;
    [Symbol.dispose](): void;
    add_liberation_class(runtime_id: number, order_index: number): void;
    add_size_bin(runtime_id: number, order_index: number, max_mm: number, representative_mm: number, canonical: boolean): void;
    constructor();
    set_legacy_lt_one_mm_id(runtime_id: number): void;
    set_species_texture(texture_profile_id: number, species_id: number, d10_um: number, d50_um: number, d90_um: number, free: number, boundary: number, intergrown: number, included: number): void;
    set_texture_properties(texture_profile_id: number, bond_crushing_work_index_kwh_per_t: number, bond_ball_mill_work_index_kwh_per_t: number, bond_abrasion_index: number): void;
}

/**
 * Stateful Rust-owned Extractor. One coarse call advances occurrence reserve,
 * material generation, target Hopper storage, and the material output stream.
 */
export class WasmPackedExtractor {
    free(): void;
    [Symbol.dispose](): void;
    last_error(): string;
    constructor(rate_kg_per_second: number, enabled: boolean);
    operating_state(): string;
    output_liberation_class_ids(): Uint8Array;
    output_quantities(): Float64Array;
    output_size_bin_ids(): Uint8Array;
    output_species_ids(): Uint16Array;
    output_specific_sensible_enthalpy_j_per_kg(): number;
    output_texture_profile_ids(): Uint32Array;
    output_total_mass_flow_kg_per_second(): number;
    set_enabled(enabled: boolean): void;
    set_rate_kg_per_second(value: number): void;
    tick_occurrence_to_hopper(occurrence: WasmPackedResourceOccurrence, target: WasmPackedHopper, dt: number): number;
}

/**
 * Browser-facing wrapper for the first Rust-owned apparatus execution path.
 * The Feeder owns its packed input/output streams internally and mutates two
 * Rust-owned Hopper inventories in one coarse tick call.
 */
export class WasmPackedFeeder {
    free(): void;
    [Symbol.dispose](): void;
    input_specific_sensible_enthalpy_j_per_kg(): number;
    input_total_mass_flow_kg_per_second(): number;
    last_error(): string;
    constructor(flow_rate_kg_per_second: number, throughput_kg_per_second: number, enabled: boolean);
    operating_state(): string;
    output_liberation_class_ids(): Uint8Array;
    output_quantities(): Float64Array;
    output_size_bin_ids(): Uint8Array;
    output_species_ids(): Uint16Array;
    output_specific_sensible_enthalpy_j_per_kg(): number;
    output_texture_profile_ids(): Uint32Array;
    output_total_mass_flow_kg_per_second(): number;
    set_enabled(enabled: boolean): void;
    set_flow_rate_kg_per_second(value: number): void;
    set_throughput_kg_per_second(value: number): void;
    tick_hopper_to_hopper(source: WasmPackedHopper, target: WasmPackedHopper, dt: number): number;
}

/**
 * Rust-owned finite gas inventory. Species arrays are setup/debug snapshots;
 * mixing, stream receipt, and thermal exchange are coarse Rust operations.
 */
export class WasmPackedGasBody {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Conservative solid↔gas sensible heat exchange. Positive energy moved
     * from the Hopper's solid body into this gas body.
     */
    exchange_heat_with_hopper(hopper: WasmPackedHopper, thermal: WasmPackedThermalModel, conductance_w_per_k: number, dt: number): number;
    /**
     * Mix a complete incoming gas body into this inventory in one call.
     */
    mix_from(incoming: WasmPackedGasBody): number;
    constructor();
    push_species(species_id: number, quantity_kg: number): void;
    quantities(): Float64Array;
    /**
     * Consume one packed gas stream for dt seconds in one call.
     */
    receive_stream(stream: WasmPackedGasStream, dt: number): number;
    sensible_enthalpy_j(): number;
    set_sensible_enthalpy_j(value: number): void;
    set_temperature_k(thermal: WasmPackedThermalModel, temperature_k: number): void;
    species_ids(): Uint16Array;
    specific_sensible_enthalpy_j_per_kg(): number;
    temperature_k(thermal: WasmPackedThermalModel): number;
    total_mass_kg(): number;
}

/**
 * Continuous Rust-owned gas stream. Values are kg/s.
 */
export class WasmPackedGasStream {
    free(): void;
    [Symbol.dispose](): void;
    clear(): void;
    constructor();
    push_species_flow(species_id: number, rate_kg_per_second: number): void;
    quantities(): Float64Array;
    set_specific_sensible_enthalpy_j_per_kg(value: number): void;
    species_ids(): Uint16Array;
    specific_sensible_enthalpy_j_per_kg(): number;
    total_mass_flow_kg_per_second(): number;
}

/**
 * Browser adapter for the compiled numeric goethite-dehydroxylation model.
 * Canonical reaction definitions and texture IDs are resolved in JavaScript once;
 * the per-tick solve remains entirely inside Rust.
 */
export class WasmPackedGoethiteReaction {
    free(): void;
    [Symbol.dispose](): void;
    constructor(source_species_id: number, solid_product_species_id: number, gas_product_species_id: number, source_mass_per_extent_kg: number, solid_product_mass_per_extent_kg: number, gas_product_mass_per_extent_kg: number, reaction_enthalpy_j_per_mol_extent: number, activation_energy_j_per_mol: number, pre_exponential_factor_per_second: number);
    set_product_texture_mapping(source_texture_profile_id: number, product_texture_profile_id: number): void;
    set_size_factor(size_bin_id: number, factor: number): void;
}

/**
 * First finite-inventory object exposed from the permanent Rust simulation
 * core. It mirrors current Hopper mass/capacity/enthalpy behavior but uses
 * packed numeric execution state internally.
 */
export class WasmPackedHopper {
    free(): void;
    [Symbol.dispose](): void;
    capacity_kg(): number;
    free_capacity_kg(): number;
    constructor(capacity_kg: number);
    push_fraction(species_id: number, size_bin_id: number, liberation_class_id: number, texture_profile_id: number, quantity_kg: number): void;
    /**
     * Receive a packed flow state in one coarse WASM call. Flow quantities are
     * kg/s and are clipped only by Hopper capacity.
     */
    receive_flow(flow: WasmPackedSolidState, dt: number, specific_sensible_enthalpy_j_per_kg: number): number;
    sensible_enthalpy_j(): number;
    set_sensible_enthalpy_j(sensible_enthalpy_j: number): void;
    stored_mass_kg(): number;
    /**
     * Conservative storage-to-storage transfer inside WASM. No material arrays
     * cross the JS/WASM boundary for the operation itself.
     */
    transfer_to(target: WasmPackedHopper, max_rate_kg_per_second: number, dt: number): number;
}

export class WasmPackedMagneticSeparator {
    free(): void;
    [Symbol.dispose](): void;
    concentrate_liberation_class_ids(): Uint8Array;
    concentrate_quantities(): Float64Array;
    concentrate_size_bin_ids(): Uint8Array;
    concentrate_species_ids(): Uint16Array;
    concentrate_specific_sensible_enthalpy_j_per_kg(): number;
    concentrate_texture_profile_ids(): Uint32Array;
    concentrate_total_mass_flow_kg_per_second(): number;
    input_total_mass_flow_kg_per_second(): number;
    last_error(): string;
    constructor(field_strength: number, max_feed_particle_size_mm: number, throughput_kg_per_second: number, enabled: boolean);
    operating_state(): string;
    set_enabled(enabled: boolean): void;
    set_field_strength(value: number): void;
    set_max_feed_particle_size_mm(value: number): void;
    set_throughput_kg_per_second(value: number): void;
    tailings_liberation_class_ids(): Uint8Array;
    tailings_quantities(): Float64Array;
    tailings_size_bin_ids(): Uint8Array;
    tailings_species_ids(): Uint16Array;
    tailings_specific_sensible_enthalpy_j_per_kg(): number;
    tailings_texture_profile_ids(): Uint32Array;
    tailings_total_mass_flow_kg_per_second(): number;
    tick_hopper_to_hoppers(source: WasmPackedHopper, concentrate: WasmPackedHopper, tailings: WasmPackedHopper, tables: WasmPackedSeparationTables, dt: number): number;
}

export class WasmPackedMerger {
    free(): void;
    [Symbol.dispose](): void;
    input_a_total_mass_flow_kg_per_second(): number;
    input_b_total_mass_flow_kg_per_second(): number;
    last_error(): string;
    constructor(throughput_kg_per_second: number, enabled: boolean);
    operating_state(): string;
    output_specific_sensible_enthalpy_j_per_kg(): number;
    output_total_mass_flow_kg_per_second(): number;
    set_enabled(enabled: boolean): void;
    tick_hoppers_to_hopper(input_a: WasmPackedHopper, input_b: WasmPackedHopper, output: WasmPackedHopper, thermal: WasmPackedThermalTable, dt: number): number;
}

/**
 * Browser-facing packed ResourceOccurrence. Canonical resource strings,
 * composition, texture metadata, and fragmentation are compiled in JavaScript
 * during setup; extraction ticks operate only on numeric packed state.
 */
export class WasmPackedResourceOccurrence {
    free(): void;
    [Symbol.dispose](): void;
    extracted_mass_kg(): number;
    is_depleted(): boolean;
    is_finite(): boolean;
    material_template_total_kg(): number;
    constructor();
    push_material_fraction(species_id: number, size_bin_id: number, liberation_class_id: number, texture_profile_id: number, quantity_per_kg: number): void;
    remaining_mass_kg(): number;
    set_finite_reserve_mass_kg(value: number): void;
}

/**
 * Coarse browser adapter for a complete Rust-owned Roasting Furnace. The
 * furnace keeps all zone, pending-feed, gas-inventory, stream and diagnostic
 * state inside WASM between calls.
 */
export class WasmPackedRoastingFurnace {
    free(): void;
    [Symbol.dispose](): void;
    actual_charge_temperature_k(): number;
    charge_mass_kg(): number;
    gas_exhaust_quantities(): Float64Array;
    gas_exhaust_species_ids(): Uint16Array;
    gas_exhaust_total_mass_flow_kg_per_second(): number;
    gas_inventory_mass_kg(): number;
    input_capacity_kg(dt: number): number;
    last_error(): string;
    last_feed_rate_kg_per_second(): number;
    last_goethite_conversion_fraction(): number;
    last_heat_loss_power_kw(): number;
    last_heater_power_kw(): number;
    last_product_rate_kg_per_second(): number;
    last_reaction_power_kw(): number;
    last_solver_evaluation_count(): number;
    constructor(temperature_setpoint_k: number, rated_heater_power_kw: number, maximum_operating_temperature_k: number, maximum_solid_throughput_kg_per_second: number, effective_chamber_hold_up_kg: number, heat_loss_coefficient_w_per_k: number, internal_zone_count: number, enabled: boolean);
    operating_state(): string;
    pending_feed_mass_kg(): number;
    /**
     * Migration convenience: atomically move a metered share from an existing
     * Rust Hopper into the furnace staging buffer. The final graph scheduler can
     * route process outputs directly without this helper.
     */
    receive_from_hopper(source: WasmPackedHopper, requested_rate_kg_per_second: number, dt: number): number;
    set_enabled(enabled: boolean): void;
    set_temperature_setpoint_k(value: number): void;
    solid_product_total_mass_flow_kg_per_second(): number;
    /**
     * Advance one complete furnace fixed step with a solid-product Hopper and
     * unbounded ExhaustVent gas inventory. Zone heating, reaction solves,
     * residence movement, product backpressure and gas venting are one Rust call.
     */
    tick_to_hopper_and_vent(product_hopper: WasmPackedHopper, gas_vent: WasmPackedGasBody, thermal: WasmPackedThermalModel, reaction: WasmPackedGoethiteReaction, dt: number): number;
    zone_temperatures_k(): Float64Array;
}

export class WasmPackedScreen {
    free(): void;
    [Symbol.dispose](): void;
    input_total_mass_flow_kg_per_second(): number;
    last_error(): string;
    constructor(aperture_size_mm: number, throughput_kg_per_second: number, enabled: boolean);
    operating_state(): string;
    oversize_liberation_class_ids(): Uint8Array;
    oversize_quantities(): Float64Array;
    oversize_size_bin_ids(): Uint8Array;
    oversize_species_ids(): Uint16Array;
    oversize_specific_sensible_enthalpy_j_per_kg(): number;
    oversize_texture_profile_ids(): Uint32Array;
    oversize_total_mass_flow_kg_per_second(): number;
    set_aperture_size_mm(value: number): void;
    set_enabled(enabled: boolean): void;
    set_throughput_kg_per_second(value: number): void;
    tick_hopper_to_hoppers(source: WasmPackedHopper, undersize: WasmPackedHopper, oversize: WasmPackedHopper, tables: WasmPackedSeparationTables, dt: number): number;
    undersize_liberation_class_ids(): Uint8Array;
    undersize_quantities(): Float64Array;
    undersize_size_bin_ids(): Uint8Array;
    undersize_species_ids(): Uint16Array;
    undersize_specific_sensible_enthalpy_j_per_kg(): number;
    undersize_texture_profile_ids(): Uint32Array;
    undersize_total_mass_flow_kg_per_second(): number;
}

/**
 * Browser-facing setup table for packed classification/separation. Canonical
 * string identifiers and material-property definitions are resolved once in
 * JavaScript; Screen/Magnetic-Separator ticks consume numeric tables only.
 */
export class WasmPackedSeparationTables {
    free(): void;
    [Symbol.dispose](): void;
    add_liberation_class(runtime_id: number, recovery_factor: number): void;
    add_size_bin(runtime_id: number, max_mm: number, magnetic_suitability: number): void;
    constructor();
    set_species_magnetic_response(runtime_id: number, normalized_separation_coefficient: number): void;
    set_specific_heat_capacity_j_per_kg_k(runtime_id: number, value: number): void;
}

/**
 * Browser-facing packed material primitive. Coarse state ownership is retained
 * inside WASM; column accessors are snapshots for debugging/parity during the
 * migration and should not become the eventual per-tick UI protocol.
 */
export class WasmPackedSolidState {
    free(): void;
    [Symbol.dispose](): void;
    clear(): void;
    is_empty(): boolean;
    len(): number;
    liberation_class_ids(): Uint8Array;
    constructor();
    push_fraction(species_id: number, size_bin_id: number, liberation_class_id: number, texture_profile_id: number, quantity: number): void;
    quantities(): Float64Array;
    scale_in_place(factor: number): void;
    size_bin_ids(): Uint8Array;
    species_ids(): Uint16Array;
    texture_profile_ids(): Uint32Array;
    total_quantity(): number;
}

export class WasmPackedSplitter {
    free(): void;
    [Symbol.dispose](): void;
    input_total_mass_flow_kg_per_second(): number;
    last_error(): string;
    constructor(split_fraction_to_a: number, throughput_kg_per_second: number, enabled: boolean);
    operating_state(): string;
    output_a_specific_sensible_enthalpy_j_per_kg(): number;
    output_a_total_mass_flow_kg_per_second(): number;
    output_b_specific_sensible_enthalpy_j_per_kg(): number;
    output_b_total_mass_flow_kg_per_second(): number;
    set_enabled(enabled: boolean): void;
    tick_hopper_to_hoppers(source: WasmPackedHopper, output_a: WasmPackedHopper, output_b: WasmPackedHopper, thermal: WasmPackedThermalTable, dt: number): number;
}

/**
 * Thermal property model used by the gas/thermal migration path. It wraps the
 * same runtime-local constant-Cp table type already used by Rust routing.
 */
export class WasmPackedThermalModel {
    free(): void;
    [Symbol.dispose](): void;
    constructor();
    set_specific_heat_capacity_j_per_kg_k(species_id: number, value: number): void;
}

/**
 * Runtime-local thermal property table used by routing kernels that must match
 * the production constant-Cp equilibrium-energy calculation.
 */
export class WasmPackedThermalTable {
    free(): void;
    [Symbol.dispose](): void;
    constructor();
    set_specific_heat_capacity_j_per_kg_k(species_id: number, value: number): void;
}

/**
 * Browser adapter for the complete packed graph/world runtime. Setup calls are
 * intentionally bulk-oriented and happen when compiling/importing a world. Once
 * sealed, normal simulation advances through one `tick_fixed()` call; no
 * per-apparatus or per-fraction JavaScript loop is required.
 */
export class WasmPackedWorldRuntime {
    free(): void;
    [Symbol.dispose](): void;
    add_boundary_transfer(transfer_id: number, source_hopper_id: number, target_hopper_id: number, capacity_kg_per_second: number, priority: number, ordinal: number): void;
    add_comminution(site_id: number, node_id: number, ordinal: number, equipment_kind: number, target_size_id: number, target_particle_size_mm: number, throughput_kg_per_second: number, rated_power_kw: number, enabled: boolean, input_hopper_id: number, output_hopper_id: number): void;
    add_comminution_liberation_class(runtime_id: number, order_index: number): void;
    add_comminution_size_bin(runtime_id: number, order_index: number, max_mm: number, representative_mm: number, canonical: boolean): void;
    add_exhaust_vent_state(node_id: number, species_ids: Uint16Array, quantities: Float64Array, sensible_enthalpy_j: number): void;
    add_extractor(site_id: number, node_id: number, ordinal: number, rate_kg_per_second: number, enabled: boolean, occurrence_id: number, output_hopper_id: number): void;
    add_feeder(site_id: number, node_id: number, ordinal: number, flow_rate_kg_per_second: number, throughput_kg_per_second: number, enabled: boolean, input_hopper_id: number, output_target_kind: number, output_target_id: number): void;
    add_hopper_state(node_id: number, capacity_kg: number, species_ids: Uint16Array, size_bin_ids: Uint8Array, liberation_class_ids: Uint8Array, texture_profile_ids: Uint32Array, quantities: Float64Array, sensible_enthalpy_j: number): void;
    add_magnetic_separator(site_id: number, node_id: number, ordinal: number, field_strength: number, max_feed_particle_size_mm: number, throughput_kg_per_second: number, enabled: boolean, input_hopper_id: number, concentrate_hopper_id: number, tailings_hopper_id: number): void;
    add_merger(site_id: number, node_id: number, ordinal: number, throughput_kg_per_second: number, enabled: boolean, input_a_hopper_id: number, input_b_hopper_id: number, output_hopper_id: number): void;
    add_occurrence_state(occurrence_id: number, species_ids: Uint16Array, size_bin_ids: Uint8Array, liberation_class_ids: Uint8Array, texture_profile_ids: Uint32Array, quantities_per_kg: Float64Array, finite_reserve: boolean, reserve_mass_kg: number): void;
    add_roasting_furnace(site_id: number, node_id: number, ordinal: number, temperature_setpoint_k: number, rated_heater_power_kw: number, maximum_operating_temperature_k: number, maximum_solid_throughput_kg_per_second: number, effective_chamber_hold_up_kg: number, heat_loss_coefficient_w_per_k: number, internal_zone_count: number, enabled: boolean, product_target_kind: number, product_target_id: number, gas_vent_id: number): void;
    add_screen(site_id: number, node_id: number, ordinal: number, aperture_size_mm: number, throughput_kg_per_second: number, enabled: boolean, input_hopper_id: number, undersize_hopper_id: number, oversize_hopper_id: number): void;
    add_separation_liberation_class(runtime_id: number, recovery_factor: number): void;
    add_separation_size_bin(runtime_id: number, max_mm: number, magnetic_suitability: number): void;
    add_site(site_id: number): void;
    add_site_passive_storage_link(site_id: number, source_hopper_id: number, target_hopper_id: number, rate_kg_per_second: number): void;
    add_splitter(site_id: number, node_id: number, ordinal: number, split_fraction_to_a: number, throughput_kg_per_second: number, enabled: boolean, input_hopper_id: number, output_a_hopper_id: number, output_b_hopper_id: number): void;
    advance_fixed_steps(steps: number): number;
    begin_goethite_reaction(source_species_id: number, solid_product_species_id: number, gas_product_species_id: number, source_mass_per_extent_kg: number, solid_product_mass_per_extent_kg: number, gas_product_mass_per_extent_kg: number, reaction_enthalpy_j_per_mol_extent: number, activation_energy_j_per_mol: number, pre_exponential_factor_per_second: number): void;
    boundary_last_moved_kg(transfer_id: number): number;
    boundary_last_rate_kg_per_second(transfer_id: number): number;
    commit_goethite_reaction(): void;
    elapsed_seconds(): number;
    furnace_actual_charge_temperature_k(node_id: number): number;
    furnace_last_heater_power_kw(node_id: number): number;
    furnace_last_reaction_power_kw(node_id: number): number;
    hopper_sensible_enthalpy_j(node_id: number): number;
    hopper_stored_mass_kg(node_id: number): number;
    import_roasting_furnace_state(node_id: number, zone_lengths: Uint32Array, zone_species_ids: Uint16Array, zone_size_bin_ids: Uint8Array, zone_liberation_class_ids: Uint8Array, zone_texture_profile_ids: Uint32Array, zone_quantities: Float64Array, zone_sensible_enthalpies_j: Float64Array, pending_species_ids: Uint16Array, pending_size_bin_ids: Uint8Array, pending_liberation_class_ids: Uint8Array, pending_texture_profile_ids: Uint32Array, pending_quantities: Float64Array, pending_sensible_enthalpy_j: number, gas_species_ids: Uint16Array, gas_quantities: Float64Array, gas_sensible_enthalpy_j: number): void;
    import_site_stats(site_id: number, elapsed_seconds: number, extracted_kg: number): void;
    import_world_elapsed_seconds(value: number): void;
    constructor();
    no_runtime_id(): number;
    node_last_error(node_id: number): string;
    node_operating_state(node_id: number): string;
    node_output_mass_flow_kg_per_second(node_id: number, output_index: number): number;
    occurrence_extracted_mass_kg(occurrence_id: number): number;
    occurrence_remaining_mass_kg(occurrence_id: number): number;
    pause(): void;
    resume(): void;
    running(): boolean;
    seal(): void;
    set_comminution_legacy_lt_one_mm_id(runtime_id: number): void;
    set_comminution_species_texture(texture_profile_id: number, species_id: number, d10_um: number, d50_um: number, d90_um: number, free: number, boundary: number, intergrown: number, included: number): void;
    set_comminution_texture_properties(texture_profile_id: number, cwi_kwh_per_t: number, bwi_kwh_per_t: number, abrasion_index: number): void;
    set_reaction_product_texture_mapping(source_texture_profile_id: number, product_texture_profile_id: number): void;
    set_reaction_size_factor(size_bin_id: number, factor: number): void;
    set_species_magnetic_response(runtime_id: number, coefficient: number): void;
    set_specific_heat_capacity_j_per_kg_k(species_id: number, value: number): void;
    site_elapsed_seconds(site_id: number): number;
    site_extracted_kg(site_id: number): number;
    tick_fixed(): boolean;
    vented_gas_mass_kg(node_id: number): number;
}

export function runtime_protocol_version(): number;

export function simulation_step_seconds(): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmpackedcomminutionmachine_free: (a: number, b: number) => void;
    readonly __wbg_wasmpackedcomminutiontables_free: (a: number, b: number) => void;
    readonly __wbg_wasmpackedextractor_free: (a: number, b: number) => void;
    readonly __wbg_wasmpackedfeeder_free: (a: number, b: number) => void;
    readonly __wbg_wasmpackedgasbody_free: (a: number, b: number) => void;
    readonly __wbg_wasmpackedgasstream_free: (a: number, b: number) => void;
    readonly __wbg_wasmpackedgoethitereaction_free: (a: number, b: number) => void;
    readonly __wbg_wasmpackedhopper_free: (a: number, b: number) => void;
    readonly __wbg_wasmpackedmagneticseparator_free: (a: number, b: number) => void;
    readonly __wbg_wasmpackedmerger_free: (a: number, b: number) => void;
    readonly __wbg_wasmpackedresourceoccurrence_free: (a: number, b: number) => void;
    readonly __wbg_wasmpackedroastingfurnace_free: (a: number, b: number) => void;
    readonly __wbg_wasmpackedscreen_free: (a: number, b: number) => void;
    readonly __wbg_wasmpackedseparationtables_free: (a: number, b: number) => void;
    readonly __wbg_wasmpackedsolidstate_free: (a: number, b: number) => void;
    readonly __wbg_wasmpackedthermalmodel_free: (a: number, b: number) => void;
    readonly __wbg_wasmpackedworldruntime_free: (a: number, b: number) => void;
    readonly runtime_protocol_version: () => number;
    readonly simulation_step_seconds: () => number;
    readonly wasmpackedcomminutionmachine_abrasion_exposure_tonne_ai: (a: number) => number;
    readonly wasmpackedcomminutionmachine_input_specific_sensible_enthalpy_j_per_kg: (a: number) => number;
    readonly wasmpackedcomminutionmachine_input_total_mass_flow_kg_per_second: (a: number) => number;
    readonly wasmpackedcomminutionmachine_last_bond_abrasion_index: (a: number) => number;
    readonly wasmpackedcomminutionmachine_last_error: (a: number) => [number, number];
    readonly wasmpackedcomminutionmachine_last_power_kw: (a: number) => number;
    readonly wasmpackedcomminutionmachine_last_specific_energy_kwh_per_t: (a: number) => number;
    readonly wasmpackedcomminutionmachine_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number];
    readonly wasmpackedcomminutionmachine_operating_state: (a: number) => [number, number];
    readonly wasmpackedcomminutionmachine_output_liberation_class_ids: (a: number) => [number, number];
    readonly wasmpackedcomminutionmachine_output_quantities: (a: number) => [number, number];
    readonly wasmpackedcomminutionmachine_output_size_bin_ids: (a: number) => [number, number];
    readonly wasmpackedcomminutionmachine_output_species_ids: (a: number) => [number, number];
    readonly wasmpackedcomminutionmachine_output_specific_sensible_enthalpy_j_per_kg: (a: number) => number;
    readonly wasmpackedcomminutionmachine_output_texture_profile_ids: (a: number) => [number, number];
    readonly wasmpackedcomminutionmachine_output_total_mass_flow_kg_per_second: (a: number) => number;
    readonly wasmpackedcomminutionmachine_tick_hopper_to_hopper: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly wasmpackedcomminutiontables_add_liberation_class: (a: number, b: number, c: number) => void;
    readonly wasmpackedcomminutiontables_add_size_bin: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly wasmpackedcomminutiontables_new: () => number;
    readonly wasmpackedcomminutiontables_set_legacy_lt_one_mm_id: (a: number, b: number) => void;
    readonly wasmpackedcomminutiontables_set_species_texture: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number];
    readonly wasmpackedcomminutiontables_set_texture_properties: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly wasmpackedextractor_last_error: (a: number) => [number, number];
    readonly wasmpackedextractor_new: (a: number, b: number) => [number, number, number];
    readonly wasmpackedextractor_operating_state: (a: number) => [number, number];
    readonly wasmpackedextractor_output_liberation_class_ids: (a: number) => [number, number];
    readonly wasmpackedextractor_output_quantities: (a: number) => [number, number];
    readonly wasmpackedextractor_output_size_bin_ids: (a: number) => [number, number];
    readonly wasmpackedextractor_output_species_ids: (a: number) => [number, number];
    readonly wasmpackedextractor_output_specific_sensible_enthalpy_j_per_kg: (a: number) => number;
    readonly wasmpackedextractor_output_texture_profile_ids: (a: number) => [number, number];
    readonly wasmpackedextractor_output_total_mass_flow_kg_per_second: (a: number) => number;
    readonly wasmpackedextractor_set_enabled: (a: number, b: number) => void;
    readonly wasmpackedextractor_set_rate_kg_per_second: (a: number, b: number) => [number, number];
    readonly wasmpackedextractor_tick_occurrence_to_hopper: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly wasmpackedfeeder_input_total_mass_flow_kg_per_second: (a: number) => number;
    readonly wasmpackedfeeder_last_error: (a: number) => [number, number];
    readonly wasmpackedfeeder_new: (a: number, b: number, c: number) => [number, number, number];
    readonly wasmpackedfeeder_operating_state: (a: number) => [number, number];
    readonly wasmpackedfeeder_output_liberation_class_ids: (a: number) => [number, number];
    readonly wasmpackedfeeder_output_quantities: (a: number) => [number, number];
    readonly wasmpackedfeeder_output_size_bin_ids: (a: number) => [number, number];
    readonly wasmpackedfeeder_output_species_ids: (a: number) => [number, number];
    readonly wasmpackedfeeder_output_specific_sensible_enthalpy_j_per_kg: (a: number) => number;
    readonly wasmpackedfeeder_output_texture_profile_ids: (a: number) => [number, number];
    readonly wasmpackedfeeder_output_total_mass_flow_kg_per_second: (a: number) => number;
    readonly wasmpackedfeeder_set_enabled: (a: number, b: number) => void;
    readonly wasmpackedfeeder_set_flow_rate_kg_per_second: (a: number, b: number) => [number, number];
    readonly wasmpackedfeeder_set_throughput_kg_per_second: (a: number, b: number) => [number, number];
    readonly wasmpackedfeeder_tick_hopper_to_hopper: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly wasmpackedgasbody_exchange_heat_with_hopper: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly wasmpackedgasbody_mix_from: (a: number, b: number) => [number, number, number];
    readonly wasmpackedgasbody_new: () => number;
    readonly wasmpackedgasbody_push_species: (a: number, b: number, c: number) => [number, number];
    readonly wasmpackedgasbody_quantities: (a: number) => [number, number];
    readonly wasmpackedgasbody_receive_stream: (a: number, b: number, c: number) => [number, number, number];
    readonly wasmpackedgasbody_sensible_enthalpy_j: (a: number) => number;
    readonly wasmpackedgasbody_set_sensible_enthalpy_j: (a: number, b: number) => [number, number];
    readonly wasmpackedgasbody_set_temperature_k: (a: number, b: number, c: number) => [number, number];
    readonly wasmpackedgasbody_species_ids: (a: number) => [number, number];
    readonly wasmpackedgasbody_specific_sensible_enthalpy_j_per_kg: (a: number) => number;
    readonly wasmpackedgasbody_temperature_k: (a: number, b: number) => [number, number, number];
    readonly wasmpackedgasbody_total_mass_kg: (a: number) => number;
    readonly wasmpackedgasstream_clear: (a: number) => void;
    readonly wasmpackedgasstream_new: () => number;
    readonly wasmpackedgasstream_push_species_flow: (a: number, b: number, c: number) => [number, number];
    readonly wasmpackedgasstream_quantities: (a: number) => [number, number];
    readonly wasmpackedgasstream_set_specific_sensible_enthalpy_j_per_kg: (a: number, b: number) => [number, number];
    readonly wasmpackedgasstream_species_ids: (a: number) => [number, number];
    readonly wasmpackedgasstream_total_mass_flow_kg_per_second: (a: number) => number;
    readonly wasmpackedgoethitereaction_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number];
    readonly wasmpackedgoethitereaction_set_product_texture_mapping: (a: number, b: number, c: number) => [number, number];
    readonly wasmpackedgoethitereaction_set_size_factor: (a: number, b: number, c: number) => [number, number];
    readonly wasmpackedhopper_free_capacity_kg: (a: number) => number;
    readonly wasmpackedhopper_new: (a: number) => [number, number, number];
    readonly wasmpackedhopper_push_fraction: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly wasmpackedhopper_receive_flow: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly wasmpackedhopper_set_sensible_enthalpy_j: (a: number, b: number) => [number, number];
    readonly wasmpackedhopper_stored_mass_kg: (a: number) => number;
    readonly wasmpackedhopper_transfer_to: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly wasmpackedmagneticseparator_concentrate_liberation_class_ids: (a: number) => [number, number];
    readonly wasmpackedmagneticseparator_concentrate_quantities: (a: number) => [number, number];
    readonly wasmpackedmagneticseparator_concentrate_size_bin_ids: (a: number) => [number, number];
    readonly wasmpackedmagneticseparator_concentrate_species_ids: (a: number) => [number, number];
    readonly wasmpackedmagneticseparator_concentrate_texture_profile_ids: (a: number) => [number, number];
    readonly wasmpackedmagneticseparator_last_error: (a: number) => [number, number];
    readonly wasmpackedmagneticseparator_new: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly wasmpackedmagneticseparator_operating_state: (a: number) => [number, number];
    readonly wasmpackedmagneticseparator_set_enabled: (a: number, b: number) => void;
    readonly wasmpackedmagneticseparator_set_field_strength: (a: number, b: number) => [number, number];
    readonly wasmpackedmagneticseparator_set_max_feed_particle_size_mm: (a: number, b: number) => [number, number];
    readonly wasmpackedmagneticseparator_set_throughput_kg_per_second: (a: number, b: number) => [number, number];
    readonly wasmpackedmagneticseparator_tailings_liberation_class_ids: (a: number) => [number, number];
    readonly wasmpackedmagneticseparator_tailings_quantities: (a: number) => [number, number];
    readonly wasmpackedmagneticseparator_tailings_size_bin_ids: (a: number) => [number, number];
    readonly wasmpackedmagneticseparator_tailings_species_ids: (a: number) => [number, number];
    readonly wasmpackedmagneticseparator_tailings_specific_sensible_enthalpy_j_per_kg: (a: number) => number;
    readonly wasmpackedmagneticseparator_tailings_texture_profile_ids: (a: number) => [number, number];
    readonly wasmpackedmagneticseparator_tick_hopper_to_hoppers: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly wasmpackedmerger_last_error: (a: number) => [number, number];
    readonly wasmpackedmerger_new: (a: number, b: number) => [number, number, number];
    readonly wasmpackedmerger_operating_state: (a: number) => [number, number];
    readonly wasmpackedmerger_output_specific_sensible_enthalpy_j_per_kg: (a: number) => number;
    readonly wasmpackedmerger_output_total_mass_flow_kg_per_second: (a: number) => number;
    readonly wasmpackedmerger_set_enabled: (a: number, b: number) => void;
    readonly wasmpackedmerger_tick_hoppers_to_hopper: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly wasmpackedresourceoccurrence_extracted_mass_kg: (a: number) => number;
    readonly wasmpackedresourceoccurrence_is_depleted: (a: number) => number;
    readonly wasmpackedresourceoccurrence_is_finite: (a: number) => number;
    readonly wasmpackedresourceoccurrence_material_template_total_kg: (a: number) => number;
    readonly wasmpackedresourceoccurrence_new: () => number;
    readonly wasmpackedresourceoccurrence_push_material_fraction: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly wasmpackedresourceoccurrence_remaining_mass_kg: (a: number) => number;
    readonly wasmpackedresourceoccurrence_set_finite_reserve_mass_kg: (a: number, b: number) => [number, number];
    readonly wasmpackedroastingfurnace_charge_mass_kg: (a: number) => number;
    readonly wasmpackedroastingfurnace_gas_exhaust_quantities: (a: number) => [number, number];
    readonly wasmpackedroastingfurnace_gas_exhaust_species_ids: (a: number) => [number, number];
    readonly wasmpackedroastingfurnace_gas_exhaust_total_mass_flow_kg_per_second: (a: number) => number;
    readonly wasmpackedroastingfurnace_gas_inventory_mass_kg: (a: number) => number;
    readonly wasmpackedroastingfurnace_input_capacity_kg: (a: number, b: number) => [number, number, number];
    readonly wasmpackedroastingfurnace_last_error: (a: number) => [number, number];
    readonly wasmpackedroastingfurnace_last_feed_rate_kg_per_second: (a: number) => number;
    readonly wasmpackedroastingfurnace_last_goethite_conversion_fraction: (a: number) => number;
    readonly wasmpackedroastingfurnace_last_product_rate_kg_per_second: (a: number) => number;
    readonly wasmpackedroastingfurnace_last_solver_evaluation_count: (a: number) => number;
    readonly wasmpackedroastingfurnace_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number];
    readonly wasmpackedroastingfurnace_operating_state: (a: number) => [number, number];
    readonly wasmpackedroastingfurnace_pending_feed_mass_kg: (a: number) => number;
    readonly wasmpackedroastingfurnace_receive_from_hopper: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly wasmpackedroastingfurnace_set_enabled: (a: number, b: number) => void;
    readonly wasmpackedroastingfurnace_set_temperature_setpoint_k: (a: number, b: number) => [number, number];
    readonly wasmpackedroastingfurnace_tick_to_hopper_and_vent: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly wasmpackedroastingfurnace_zone_temperatures_k: (a: number) => [number, number];
    readonly wasmpackedscreen_last_error: (a: number) => [number, number];
    readonly wasmpackedscreen_new: (a: number, b: number, c: number) => [number, number, number];
    readonly wasmpackedscreen_operating_state: (a: number) => [number, number];
    readonly wasmpackedscreen_oversize_liberation_class_ids: (a: number) => [number, number];
    readonly wasmpackedscreen_oversize_quantities: (a: number) => [number, number];
    readonly wasmpackedscreen_oversize_size_bin_ids: (a: number) => [number, number];
    readonly wasmpackedscreen_oversize_species_ids: (a: number) => [number, number];
    readonly wasmpackedscreen_oversize_texture_profile_ids: (a: number) => [number, number];
    readonly wasmpackedscreen_set_aperture_size_mm: (a: number, b: number) => [number, number];
    readonly wasmpackedscreen_set_enabled: (a: number, b: number) => void;
    readonly wasmpackedscreen_set_throughput_kg_per_second: (a: number, b: number) => [number, number];
    readonly wasmpackedscreen_tick_hopper_to_hoppers: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly wasmpackedscreen_undersize_liberation_class_ids: (a: number) => [number, number];
    readonly wasmpackedscreen_undersize_quantities: (a: number) => [number, number];
    readonly wasmpackedscreen_undersize_size_bin_ids: (a: number) => [number, number];
    readonly wasmpackedscreen_undersize_species_ids: (a: number) => [number, number];
    readonly wasmpackedscreen_undersize_texture_profile_ids: (a: number) => [number, number];
    readonly wasmpackedseparationtables_add_liberation_class: (a: number, b: number, c: number) => [number, number];
    readonly wasmpackedseparationtables_add_size_bin: (a: number, b: number, c: number, d: number) => [number, number];
    readonly wasmpackedseparationtables_new: () => number;
    readonly wasmpackedseparationtables_set_species_magnetic_response: (a: number, b: number, c: number) => [number, number];
    readonly wasmpackedseparationtables_set_specific_heat_capacity_j_per_kg_k: (a: number, b: number, c: number) => [number, number];
    readonly wasmpackedsolidstate_clear: (a: number) => void;
    readonly wasmpackedsolidstate_is_empty: (a: number) => number;
    readonly wasmpackedsolidstate_len: (a: number) => number;
    readonly wasmpackedsolidstate_liberation_class_ids: (a: number) => [number, number];
    readonly wasmpackedsolidstate_new: () => number;
    readonly wasmpackedsolidstate_push_fraction: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly wasmpackedsolidstate_quantities: (a: number) => [number, number];
    readonly wasmpackedsolidstate_scale_in_place: (a: number, b: number) => [number, number];
    readonly wasmpackedsolidstate_size_bin_ids: (a: number) => [number, number];
    readonly wasmpackedsolidstate_species_ids: (a: number) => [number, number];
    readonly wasmpackedsolidstate_texture_profile_ids: (a: number) => [number, number];
    readonly wasmpackedsolidstate_total_quantity: (a: number) => number;
    readonly wasmpackedsplitter_new: (a: number, b: number, c: number) => [number, number, number];
    readonly wasmpackedsplitter_tick_hopper_to_hoppers: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly wasmpackedthermalmodel_new: () => number;
    readonly wasmpackedthermalmodel_set_specific_heat_capacity_j_per_kg_k: (a: number, b: number, c: number) => [number, number];
    readonly wasmpackedworldruntime_add_boundary_transfer: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly wasmpackedworldruntime_add_comminution: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => [number, number];
    readonly wasmpackedworldruntime_add_comminution_liberation_class: (a: number, b: number, c: number) => void;
    readonly wasmpackedworldruntime_add_comminution_size_bin: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly wasmpackedworldruntime_add_exhaust_vent_state: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly wasmpackedworldruntime_add_extractor: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
    readonly wasmpackedworldruntime_add_feeder: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number];
    readonly wasmpackedworldruntime_add_hopper_state: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number) => [number, number];
    readonly wasmpackedworldruntime_add_magnetic_separator: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => [number, number];
    readonly wasmpackedworldruntime_add_merger: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number];
    readonly wasmpackedworldruntime_add_occurrence_state: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number) => [number, number];
    readonly wasmpackedworldruntime_add_roasting_furnace: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number) => [number, number];
    readonly wasmpackedworldruntime_add_screen: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number];
    readonly wasmpackedworldruntime_add_separation_liberation_class: (a: number, b: number, c: number) => [number, number];
    readonly wasmpackedworldruntime_add_separation_size_bin: (a: number, b: number, c: number, d: number) => [number, number];
    readonly wasmpackedworldruntime_add_site: (a: number, b: number) => [number, number];
    readonly wasmpackedworldruntime_add_site_passive_storage_link: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly wasmpackedworldruntime_add_splitter: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number];
    readonly wasmpackedworldruntime_advance_fixed_steps: (a: number, b: number) => [number, number, number];
    readonly wasmpackedworldruntime_begin_goethite_reaction: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number];
    readonly wasmpackedworldruntime_boundary_last_moved_kg: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_boundary_last_rate_kg_per_second: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_commit_goethite_reaction: (a: number) => [number, number];
    readonly wasmpackedworldruntime_elapsed_seconds: (a: number) => number;
    readonly wasmpackedworldruntime_furnace_actual_charge_temperature_k: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_furnace_last_heater_power_kw: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_furnace_last_reaction_power_kw: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_hopper_sensible_enthalpy_j: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_hopper_stored_mass_kg: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_import_roasting_furnace_state: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number, s: number, t: number, u: number, v: number, w: number, x: number, y: number, z: number, a1: number, b1: number, c1: number, d1: number, e1: number, f1: number) => [number, number];
    readonly wasmpackedworldruntime_import_site_stats: (a: number, b: number, c: number, d: number) => [number, number];
    readonly wasmpackedworldruntime_import_world_elapsed_seconds: (a: number, b: number) => [number, number];
    readonly wasmpackedworldruntime_new: () => number;
    readonly wasmpackedworldruntime_no_runtime_id: (a: number) => number;
    readonly wasmpackedworldruntime_node_last_error: (a: number, b: number) => [number, number];
    readonly wasmpackedworldruntime_node_operating_state: (a: number, b: number) => [number, number];
    readonly wasmpackedworldruntime_node_output_mass_flow_kg_per_second: (a: number, b: number, c: number) => number;
    readonly wasmpackedworldruntime_occurrence_extracted_mass_kg: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_occurrence_remaining_mass_kg: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_pause: (a: number) => void;
    readonly wasmpackedworldruntime_resume: (a: number) => void;
    readonly wasmpackedworldruntime_running: (a: number) => number;
    readonly wasmpackedworldruntime_seal: (a: number) => void;
    readonly wasmpackedworldruntime_set_comminution_legacy_lt_one_mm_id: (a: number, b: number) => void;
    readonly wasmpackedworldruntime_set_comminution_species_texture: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number];
    readonly wasmpackedworldruntime_set_comminution_texture_properties: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly wasmpackedworldruntime_set_reaction_product_texture_mapping: (a: number, b: number, c: number) => [number, number];
    readonly wasmpackedworldruntime_set_reaction_size_factor: (a: number, b: number, c: number) => [number, number];
    readonly wasmpackedworldruntime_set_species_magnetic_response: (a: number, b: number, c: number) => [number, number];
    readonly wasmpackedworldruntime_set_specific_heat_capacity_j_per_kg_k: (a: number, b: number, c: number) => [number, number];
    readonly wasmpackedworldruntime_site_elapsed_seconds: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_site_extracted_kg: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_tick_fixed: (a: number) => [number, number, number];
    readonly wasmpackedworldruntime_vented_gas_mass_kg: (a: number, b: number) => number;
    readonly wasmpackedfeeder_input_specific_sensible_enthalpy_j_per_kg: (a: number) => number;
    readonly wasmpackedgasstream_specific_sensible_enthalpy_j_per_kg: (a: number) => number;
    readonly wasmpackedhopper_capacity_kg: (a: number) => number;
    readonly wasmpackedhopper_sensible_enthalpy_j: (a: number) => number;
    readonly wasmpackedmagneticseparator_concentrate_specific_sensible_enthalpy_j_per_kg: (a: number) => number;
    readonly wasmpackedmagneticseparator_concentrate_total_mass_flow_kg_per_second: (a: number) => number;
    readonly wasmpackedmagneticseparator_input_total_mass_flow_kg_per_second: (a: number) => number;
    readonly wasmpackedmagneticseparator_tailings_total_mass_flow_kg_per_second: (a: number) => number;
    readonly wasmpackedmerger_input_a_total_mass_flow_kg_per_second: (a: number) => number;
    readonly wasmpackedmerger_input_b_total_mass_flow_kg_per_second: (a: number) => number;
    readonly wasmpackedroastingfurnace_actual_charge_temperature_k: (a: number) => number;
    readonly wasmpackedroastingfurnace_last_heat_loss_power_kw: (a: number) => number;
    readonly wasmpackedroastingfurnace_last_heater_power_kw: (a: number) => number;
    readonly wasmpackedroastingfurnace_last_reaction_power_kw: (a: number) => number;
    readonly wasmpackedroastingfurnace_solid_product_total_mass_flow_kg_per_second: (a: number) => number;
    readonly wasmpackedscreen_input_total_mass_flow_kg_per_second: (a: number) => number;
    readonly wasmpackedscreen_oversize_specific_sensible_enthalpy_j_per_kg: (a: number) => number;
    readonly wasmpackedscreen_oversize_total_mass_flow_kg_per_second: (a: number) => number;
    readonly wasmpackedscreen_undersize_specific_sensible_enthalpy_j_per_kg: (a: number) => number;
    readonly wasmpackedscreen_undersize_total_mass_flow_kg_per_second: (a: number) => number;
    readonly wasmpackedsplitter_input_total_mass_flow_kg_per_second: (a: number) => number;
    readonly wasmpackedsplitter_output_a_specific_sensible_enthalpy_j_per_kg: (a: number) => number;
    readonly wasmpackedsplitter_output_a_total_mass_flow_kg_per_second: (a: number) => number;
    readonly wasmpackedsplitter_output_b_specific_sensible_enthalpy_j_per_kg: (a: number) => number;
    readonly wasmpackedsplitter_output_b_total_mass_flow_kg_per_second: (a: number) => number;
    readonly wasmpackedsplitter_set_enabled: (a: number, b: number) => void;
    readonly __wbg_wasmpackedsplitter_free: (a: number, b: number) => void;
    readonly wasmpackedsplitter_last_error: (a: number) => [number, number];
    readonly __wbg_wasmpackedthermaltable_free: (a: number, b: number) => void;
    readonly wasmpackedthermaltable_new: () => number;
    readonly wasmpackedsplitter_operating_state: (a: number) => [number, number];
    readonly wasmpackedthermaltable_set_specific_heat_capacity_j_per_kg_k: (a: number, b: number, c: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
