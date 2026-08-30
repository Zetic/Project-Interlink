/* tslint:disable */
/* eslint-disable */

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
    begin_live_reconfigure(): void;
    boundary_last_moved_kg(transfer_id: number): number;
    boundary_last_rate_kg_per_second(transfer_id: number): number;
    clone_for_live_reconfigure(): WasmPackedWorldRuntime;
    commit_goethite_reaction(): void;
    elapsed_seconds(): number;
    exhaust_vent_quantities(node_id: number): Float64Array;
    exhaust_vent_sensible_enthalpy_j(node_id: number): number;
    exhaust_vent_species_ids(node_id: number): Uint16Array;
    exhaust_vent_temperature_k(node_id: number): number;
    finish_live_reconfigure(active_machine_ids: Uint32Array): void;
    furnace_actual_charge_temperature_k(node_id: number): number;
    furnace_charge_mass_kg(node_id: number): number;
    furnace_last_feed_rate_kg_per_second(node_id: number): number;
    furnace_last_goethite_conversion_fraction(node_id: number): number;
    furnace_last_heat_loss_power_kw(node_id: number): number;
    furnace_last_heater_power_kw(node_id: number): number;
    furnace_last_product_rate_kg_per_second(node_id: number): number;
    furnace_last_reaction_power_kw(node_id: number): number;
    furnace_last_solver_evaluation_count(node_id: number): number;
    furnace_pending_feed_mass_kg(node_id: number): number;
    furnace_zone_count(node_id: number): number;
    furnace_zone_liberation_class_ids(node_id: number, zone_index: number): Uint8Array;
    furnace_zone_mass_kg(node_id: number, zone_index: number): number;
    furnace_zone_quantities(node_id: number, zone_index: number): Float64Array;
    furnace_zone_sensible_enthalpy_j(node_id: number, zone_index: number): number;
    furnace_zone_size_bin_ids(node_id: number, zone_index: number): Uint8Array;
    furnace_zone_species_ids(node_id: number, zone_index: number): Uint16Array;
    furnace_zone_temperature_k(node_id: number, zone_index: number): number;
    furnace_zone_texture_profile_ids(node_id: number, zone_index: number): Uint32Array;
    hopper_liberation_class_ids(node_id: number): Uint8Array;
    hopper_quantities(node_id: number): Float64Array;
    hopper_sensible_enthalpy_j(node_id: number): number;
    hopper_size_bin_ids(node_id: number): Uint8Array;
    hopper_species_ids(node_id: number): Uint16Array;
    hopper_stored_mass_kg(node_id: number): number;
    hopper_temperature_k(node_id: number): number;
    hopper_texture_profile_ids(node_id: number): Uint32Array;
    import_roasting_furnace_state(node_id: number, zone_lengths: Uint32Array, zone_species_ids: Uint16Array, zone_size_bin_ids: Uint8Array, zone_liberation_class_ids: Uint8Array, zone_texture_profile_ids: Uint32Array, zone_quantities: Float64Array, zone_sensible_enthalpies_j: Float64Array, pending_species_ids: Uint16Array, pending_size_bin_ids: Uint8Array, pending_liberation_class_ids: Uint8Array, pending_texture_profile_ids: Uint32Array, pending_quantities: Float64Array, pending_sensible_enthalpy_j: number, gas_species_ids: Uint16Array, gas_quantities: Float64Array, gas_sensible_enthalpy_j: number): void;
    import_site_stats(site_id: number, elapsed_seconds: number, extracted_kg: number): void;
    import_world_elapsed_seconds(value: number): void;
    constructor();
    no_runtime_id(): number;
    node_input_mass_flow_kg_per_second(node_id: number, input_index: number): number;
    node_last_error(node_id: number): string;
    node_operating_state(node_id: number): string;
    node_output_mass_flow_kg_per_second(node_id: number, output_index: number): number;
    occurrence_extracted_mass_kg(occurrence_id: number): number;
    occurrence_remaining_mass_kg(occurrence_id: number): number;
    pause(): void;
    profile_apparatus_total_duration_ms(): number;
    profile_node_calls(node_id: number): number;
    profile_node_ids(): Uint32Array;
    profile_node_max_duration_ms(node_id: number): number;
    profile_node_total_duration_ms(node_id: number): number;
    profile_tick_count(): number;
    profile_tick_max_duration_ms(): number;
    profile_tick_total_duration_ms(): number;
    profiling_enabled(): boolean;
    remove_exhaust_vent_live(node_id: number): void;
    remove_hopper_if_empty_live(node_id: number): void;
    replace_exhaust_vent_state_live(node_id: number, species_ids: Uint16Array, quantities: Float64Array, sensible_enthalpy_j: number): void;
    replace_hopper_state_live(node_id: number, capacity_kg: number, species_ids: Uint16Array, size_bin_ids: Uint8Array, liberation_class_ids: Uint8Array, texture_profile_ids: Uint32Array, quantities: Float64Array, sensible_enthalpy_j: number): void;
    reset_profiling_stats(): void;
    resume(): void;
    running(): boolean;
    seal(): void;
    set_comminution_legacy_lt_one_mm_id(runtime_id: number): void;
    set_comminution_species_texture(texture_profile_id: number, species_id: number, d10_um: number, d50_um: number, d90_um: number, free: number, boundary: number, intergrown: number, included: number): void;
    set_comminution_texture_properties(texture_profile_id: number, cwi_kwh_per_t: number, bwi_kwh_per_t: number, abrasion_index: number): void;
    set_profiling_enabled(enabled: boolean): void;
    set_reaction_product_texture_mapping(source_texture_profile_id: number, product_texture_profile_id: number): void;
    set_reaction_size_factor(size_bin_id: number, factor: number): void;
    set_species_magnetic_response(runtime_id: number, coefficient: number): void;
    set_specific_heat_capacity_j_per_kg_k(species_id: number, value: number): void;
    site_elapsed_seconds(site_id: number): number;
    site_extracted_kg(site_id: number): number;
    site_passive_link_last_moved_kg(site_id: number, link_index: number): number;
    site_passive_link_last_rate_kg_per_second(site_id: number, link_index: number): number;
    tick_fixed(): boolean;
    upsert_comminution_live(site_id: number, node_id: number, ordinal: number, equipment_kind: number, target_size_bin_id: number, target_particle_size_mm: number, throughput_kg_per_second: number, rated_power_kw: number, enabled: boolean, input_hopper_id: number, output_hopper_id: number): void;
    upsert_extractor_live(site_id: number, node_id: number, ordinal: number, rate_kg_per_second: number, enabled: boolean, occurrence_id: number, output_hopper_id: number): void;
    upsert_feeder_live(site_id: number, node_id: number, ordinal: number, flow_rate_kg_per_second: number, throughput_kg_per_second: number, enabled: boolean, input_hopper_id: number, output_target_kind: number, output_target_id: number): void;
    upsert_magnetic_separator_live(site_id: number, node_id: number, ordinal: number, field_strength: number, max_feed_particle_size_mm: number, throughput_kg_per_second: number, enabled: boolean, input_hopper_id: number, concentrate_hopper_id: number, tailings_hopper_id: number): void;
    upsert_merger_live(site_id: number, node_id: number, ordinal: number, throughput_kg_per_second: number, enabled: boolean, input_a_hopper_id: number, input_b_hopper_id: number, output_hopper_id: number): void;
    upsert_roasting_furnace_live(site_id: number, node_id: number, ordinal: number, temperature_setpoint_k: number, rated_heater_power_kw: number, maximum_operating_temperature_k: number, maximum_solid_throughput_kg_per_second: number, effective_chamber_hold_up_kg: number, heat_loss_coefficient_w_per_k: number, internal_zone_count: number, enabled: boolean, product_target_kind: number, product_target_id: number, gas_vent_id: number, preserve_retained_state: boolean): void;
    upsert_screen_live(site_id: number, node_id: number, ordinal: number, aperture_size_mm: number, throughput_kg_per_second: number, enabled: boolean, input_hopper_id: number, undersize_hopper_id: number, oversize_hopper_id: number): void;
    upsert_splitter_live(site_id: number, node_id: number, ordinal: number, split_fraction_to_a: number, throughput_kg_per_second: number, enabled: boolean, input_hopper_id: number, output_a_hopper_id: number, output_b_hopper_id: number): void;
    vented_gas_mass_kg(node_id: number): number;
}

export function runtime_protocol_version(): number;

export function simulation_step_seconds(): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmpackedworldruntime_free: (a: number, b: number) => void;
    readonly runtime_protocol_version: () => number;
    readonly simulation_step_seconds: () => number;
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
    readonly wasmpackedworldruntime_begin_live_reconfigure: (a: number) => void;
    readonly wasmpackedworldruntime_boundary_last_moved_kg: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_boundary_last_rate_kg_per_second: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_clone_for_live_reconfigure: (a: number) => number;
    readonly wasmpackedworldruntime_commit_goethite_reaction: (a: number) => [number, number];
    readonly wasmpackedworldruntime_elapsed_seconds: (a: number) => number;
    readonly wasmpackedworldruntime_exhaust_vent_quantities: (a: number, b: number) => [number, number, number, number];
    readonly wasmpackedworldruntime_exhaust_vent_sensible_enthalpy_j: (a: number, b: number) => [number, number, number];
    readonly wasmpackedworldruntime_exhaust_vent_species_ids: (a: number, b: number) => [number, number, number, number];
    readonly wasmpackedworldruntime_exhaust_vent_temperature_k: (a: number, b: number) => [number, number, number];
    readonly wasmpackedworldruntime_finish_live_reconfigure: (a: number, b: number, c: number) => [number, number];
    readonly wasmpackedworldruntime_furnace_actual_charge_temperature_k: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_furnace_charge_mass_kg: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_furnace_last_feed_rate_kg_per_second: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_furnace_last_goethite_conversion_fraction: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_furnace_last_heat_loss_power_kw: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_furnace_last_heater_power_kw: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_furnace_last_product_rate_kg_per_second: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_furnace_last_reaction_power_kw: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_furnace_last_solver_evaluation_count: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_furnace_pending_feed_mass_kg: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_furnace_zone_count: (a: number, b: number) => [number, number, number];
    readonly wasmpackedworldruntime_furnace_zone_liberation_class_ids: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmpackedworldruntime_furnace_zone_mass_kg: (a: number, b: number, c: number) => [number, number, number];
    readonly wasmpackedworldruntime_furnace_zone_quantities: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmpackedworldruntime_furnace_zone_sensible_enthalpy_j: (a: number, b: number, c: number) => [number, number, number];
    readonly wasmpackedworldruntime_furnace_zone_size_bin_ids: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmpackedworldruntime_furnace_zone_species_ids: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmpackedworldruntime_furnace_zone_temperature_k: (a: number, b: number, c: number) => [number, number, number];
    readonly wasmpackedworldruntime_furnace_zone_texture_profile_ids: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmpackedworldruntime_hopper_liberation_class_ids: (a: number, b: number) => [number, number, number, number];
    readonly wasmpackedworldruntime_hopper_quantities: (a: number, b: number) => [number, number, number, number];
    readonly wasmpackedworldruntime_hopper_sensible_enthalpy_j: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_hopper_size_bin_ids: (a: number, b: number) => [number, number, number, number];
    readonly wasmpackedworldruntime_hopper_species_ids: (a: number, b: number) => [number, number, number, number];
    readonly wasmpackedworldruntime_hopper_stored_mass_kg: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_hopper_temperature_k: (a: number, b: number) => [number, number, number];
    readonly wasmpackedworldruntime_hopper_texture_profile_ids: (a: number, b: number) => [number, number, number, number];
    readonly wasmpackedworldruntime_import_roasting_furnace_state: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number, s: number, t: number, u: number, v: number, w: number, x: number, y: number, z: number, a1: number, b1: number, c1: number, d1: number, e1: number, f1: number) => [number, number];
    readonly wasmpackedworldruntime_import_site_stats: (a: number, b: number, c: number, d: number) => [number, number];
    readonly wasmpackedworldruntime_import_world_elapsed_seconds: (a: number, b: number) => [number, number];
    readonly wasmpackedworldruntime_new: () => number;
    readonly wasmpackedworldruntime_no_runtime_id: (a: number) => number;
    readonly wasmpackedworldruntime_node_input_mass_flow_kg_per_second: (a: number, b: number, c: number) => number;
    readonly wasmpackedworldruntime_node_last_error: (a: number, b: number) => [number, number];
    readonly wasmpackedworldruntime_node_operating_state: (a: number, b: number) => [number, number];
    readonly wasmpackedworldruntime_node_output_mass_flow_kg_per_second: (a: number, b: number, c: number) => number;
    readonly wasmpackedworldruntime_occurrence_extracted_mass_kg: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_occurrence_remaining_mass_kg: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_pause: (a: number) => void;
    readonly wasmpackedworldruntime_profile_apparatus_total_duration_ms: (a: number) => number;
    readonly wasmpackedworldruntime_profile_node_calls: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_profile_node_ids: (a: number) => [number, number];
    readonly wasmpackedworldruntime_profile_node_max_duration_ms: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_profile_node_total_duration_ms: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_profile_tick_count: (a: number) => number;
    readonly wasmpackedworldruntime_profile_tick_max_duration_ms: (a: number) => number;
    readonly wasmpackedworldruntime_profile_tick_total_duration_ms: (a: number) => number;
    readonly wasmpackedworldruntime_profiling_enabled: (a: number) => number;
    readonly wasmpackedworldruntime_remove_exhaust_vent_live: (a: number, b: number) => void;
    readonly wasmpackedworldruntime_remove_hopper_if_empty_live: (a: number, b: number) => [number, number];
    readonly wasmpackedworldruntime_replace_exhaust_vent_state_live: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly wasmpackedworldruntime_replace_hopper_state_live: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number) => [number, number];
    readonly wasmpackedworldruntime_reset_profiling_stats: (a: number) => void;
    readonly wasmpackedworldruntime_resume: (a: number) => void;
    readonly wasmpackedworldruntime_running: (a: number) => number;
    readonly wasmpackedworldruntime_seal: (a: number) => void;
    readonly wasmpackedworldruntime_set_comminution_legacy_lt_one_mm_id: (a: number, b: number) => void;
    readonly wasmpackedworldruntime_set_comminution_species_texture: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number];
    readonly wasmpackedworldruntime_set_comminution_texture_properties: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly wasmpackedworldruntime_set_profiling_enabled: (a: number, b: number) => void;
    readonly wasmpackedworldruntime_set_reaction_product_texture_mapping: (a: number, b: number, c: number) => [number, number];
    readonly wasmpackedworldruntime_set_reaction_size_factor: (a: number, b: number, c: number) => [number, number];
    readonly wasmpackedworldruntime_set_species_magnetic_response: (a: number, b: number, c: number) => [number, number];
    readonly wasmpackedworldruntime_set_specific_heat_capacity_j_per_kg_k: (a: number, b: number, c: number) => [number, number];
    readonly wasmpackedworldruntime_site_elapsed_seconds: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_site_extracted_kg: (a: number, b: number) => number;
    readonly wasmpackedworldruntime_site_passive_link_last_moved_kg: (a: number, b: number, c: number) => number;
    readonly wasmpackedworldruntime_site_passive_link_last_rate_kg_per_second: (a: number, b: number, c: number) => number;
    readonly wasmpackedworldruntime_tick_fixed: (a: number) => [number, number, number];
    readonly wasmpackedworldruntime_upsert_comminution_live: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => [number, number];
    readonly wasmpackedworldruntime_upsert_extractor_live: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
    readonly wasmpackedworldruntime_upsert_feeder_live: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number];
    readonly wasmpackedworldruntime_upsert_magnetic_separator_live: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => [number, number];
    readonly wasmpackedworldruntime_upsert_merger_live: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number];
    readonly wasmpackedworldruntime_upsert_roasting_furnace_live: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number) => [number, number];
    readonly wasmpackedworldruntime_upsert_screen_live: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number];
    readonly wasmpackedworldruntime_upsert_splitter_live: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number];
    readonly wasmpackedworldruntime_vented_gas_mass_kg: (a: number, b: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
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
