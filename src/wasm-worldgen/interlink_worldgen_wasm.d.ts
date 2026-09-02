/* tslint:disable */
/* eslint-disable */

export class WasmWorldgenDiagnostic {
    free(): void;
    [Symbol.dispose](): void;
    field_hash_hex(): string;
    generator_version(): number;
    height(): number;
    maximum(): number;
    mean(): number;
    minimum(): number;
    constructor(seed: string, width: number, height: number);
    sample_count(): bigint;
    stage_id(): string;
    stage_seed_hex(): string;
    stage_version(): number;
    values(): Uint16Array;
    width(): number;
}

export class WasmWorldgenTectonics {
    free(): void;
    [Symbol.dispose](): void;
    boundary_edge_count(): number;
    boundary_kinds(): Uint8Array;
    boundary_normal_rates_m_per_year(): Float64Array;
    boundary_plate_ids(): Uint16Array;
    boundary_samples(): Uint32Array;
    boundary_shear_rates_m_per_year(): Float64Array;
    convergent_edge_count(): number;
    divergent_edge_count(): number;
    faces(): Uint32Array;
    generator_version(): number;
    level(): number;
    maximum_plate_area_fraction(): number;
    mean_plate_area_fraction(): number;
    mean_reference_speed_mm_per_year(): number;
    minimum_plate_area_fraction(): number;
    minimum_seed_separation_rad(): number;
    neighbor_offsets(): Uint32Array;
    neighbors(): Uint32Array;
    constructor(seed: string, level: number, plate_count: number);
    plate_angular_velocities_rad_per_myr(): Float64Array;
    plate_area_steradians(): Float64Array;
    plate_count(): number;
    plate_euler_poles(): Float64Array;
    plate_ids(): Uint16Array;
    plate_seed_samples(): Uint32Array;
    positions(): Float64Array;
    sample_count(): number;
    stage_id(): string;
    stage_seed_hex(): string;
    stage_version(): number;
    tectonic_hash_hex(): string;
    topology_hash_hex(): string;
    transform_edge_count(): number;
}

export class WasmWorldgenTopology {
    free(): void;
    [Symbol.dispose](): void;
    area_coefficient_of_variation(): number;
    area_steradians(): Float64Array;
    birth_levels(): Uint8Array;
    edge_coefficient_of_variation(): number;
    edge_count(): number;
    face_count(): number;
    faces(): Uint32Array;
    five_neighbor_count(): number;
    generator_version(): number;
    interface_coefficient_of_variation(): number;
    level(): number;
    maximum_area_steradians(): number;
    maximum_edge_arc_radians(): number;
    maximum_interface_arc_radians(): number;
    mean_area_steradians(): number;
    mean_edge_arc_radians(): number;
    mean_interface_arc_radians(): number;
    minimum_area_steradians(): number;
    minimum_edge_arc_radians(): number;
    minimum_interface_arc_radians(): number;
    neighbor_arc_lengths_rad(): Float64Array;
    neighbor_interface_arc_lengths_rad(): Float64Array;
    neighbor_offsets(): Uint32Array;
    neighbors(): Uint32Array;
    constructor(level: number);
    parent_edges(): Uint32Array;
    positions(): Float64Array;
    sample_count(): number;
    six_neighbor_count(): number;
    topology_hash_hex(): string;
    total_area_steradians(): number;
}

export function worldgen_engine_version(): number;

export function worldgen_protocol_version(): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmworldgendiagnostic_free: (a: number, b: number) => void;
    readonly __wbg_wasmworldgentectonics_free: (a: number, b: number) => void;
    readonly __wbg_wasmworldgentopology_free: (a: number, b: number) => void;
    readonly wasmworldgendiagnostic_field_hash_hex: (a: number) => [number, number];
    readonly wasmworldgendiagnostic_generator_version: (a: number) => number;
    readonly wasmworldgendiagnostic_height: (a: number) => number;
    readonly wasmworldgendiagnostic_maximum: (a: number) => number;
    readonly wasmworldgendiagnostic_mean: (a: number) => number;
    readonly wasmworldgendiagnostic_minimum: (a: number) => number;
    readonly wasmworldgendiagnostic_new: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly wasmworldgendiagnostic_sample_count: (a: number) => bigint;
    readonly wasmworldgendiagnostic_stage_id: (a: number) => [number, number];
    readonly wasmworldgendiagnostic_stage_seed_hex: (a: number) => [number, number];
    readonly wasmworldgendiagnostic_stage_version: (a: number) => number;
    readonly wasmworldgendiagnostic_values: (a: number) => [number, number];
    readonly wasmworldgendiagnostic_width: (a: number) => number;
    readonly wasmworldgentectonics_boundary_edge_count: (a: number) => number;
    readonly wasmworldgentectonics_boundary_kinds: (a: number) => [number, number];
    readonly wasmworldgentectonics_boundary_normal_rates_m_per_year: (a: number) => [number, number];
    readonly wasmworldgentectonics_boundary_plate_ids: (a: number) => [number, number];
    readonly wasmworldgentectonics_boundary_samples: (a: number) => [number, number];
    readonly wasmworldgentectonics_boundary_shear_rates_m_per_year: (a: number) => [number, number];
    readonly wasmworldgentectonics_convergent_edge_count: (a: number) => number;
    readonly wasmworldgentectonics_divergent_edge_count: (a: number) => number;
    readonly wasmworldgentectonics_faces: (a: number) => [number, number];
    readonly wasmworldgentectonics_generator_version: (a: number) => number;
    readonly wasmworldgentectonics_level: (a: number) => number;
    readonly wasmworldgentectonics_maximum_plate_area_fraction: (a: number) => number;
    readonly wasmworldgentectonics_mean_plate_area_fraction: (a: number) => number;
    readonly wasmworldgentectonics_mean_reference_speed_mm_per_year: (a: number) => number;
    readonly wasmworldgentectonics_minimum_plate_area_fraction: (a: number) => number;
    readonly wasmworldgentectonics_minimum_seed_separation_rad: (a: number) => number;
    readonly wasmworldgentectonics_neighbor_offsets: (a: number) => [number, number];
    readonly wasmworldgentectonics_neighbors: (a: number) => [number, number];
    readonly wasmworldgentectonics_new: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly wasmworldgentectonics_plate_angular_velocities_rad_per_myr: (a: number) => [number, number];
    readonly wasmworldgentectonics_plate_area_steradians: (a: number) => [number, number];
    readonly wasmworldgentectonics_plate_count: (a: number) => number;
    readonly wasmworldgentectonics_plate_euler_poles: (a: number) => [number, number];
    readonly wasmworldgentectonics_plate_ids: (a: number) => [number, number];
    readonly wasmworldgentectonics_plate_seed_samples: (a: number) => [number, number];
    readonly wasmworldgentectonics_positions: (a: number) => [number, number];
    readonly wasmworldgentectonics_sample_count: (a: number) => number;
    readonly wasmworldgentectonics_stage_id: (a: number) => [number, number];
    readonly wasmworldgentectonics_stage_seed_hex: (a: number) => [number, number];
    readonly wasmworldgentectonics_stage_version: (a: number) => number;
    readonly wasmworldgentectonics_tectonic_hash_hex: (a: number) => [number, number];
    readonly wasmworldgentectonics_topology_hash_hex: (a: number) => [number, number];
    readonly wasmworldgentectonics_transform_edge_count: (a: number) => number;
    readonly wasmworldgentopology_area_coefficient_of_variation: (a: number) => number;
    readonly wasmworldgentopology_area_steradians: (a: number) => [number, number];
    readonly wasmworldgentopology_birth_levels: (a: number) => [number, number];
    readonly wasmworldgentopology_edge_coefficient_of_variation: (a: number) => number;
    readonly wasmworldgentopology_edge_count: (a: number) => number;
    readonly wasmworldgentopology_face_count: (a: number) => number;
    readonly wasmworldgentopology_faces: (a: number) => [number, number];
    readonly wasmworldgentopology_five_neighbor_count: (a: number) => number;
    readonly wasmworldgentopology_interface_coefficient_of_variation: (a: number) => number;
    readonly wasmworldgentopology_maximum_area_steradians: (a: number) => number;
    readonly wasmworldgentopology_maximum_edge_arc_radians: (a: number) => number;
    readonly wasmworldgentopology_maximum_interface_arc_radians: (a: number) => number;
    readonly wasmworldgentopology_mean_area_steradians: (a: number) => number;
    readonly wasmworldgentopology_mean_edge_arc_radians: (a: number) => number;
    readonly wasmworldgentopology_mean_interface_arc_radians: (a: number) => number;
    readonly wasmworldgentopology_minimum_edge_arc_radians: (a: number) => number;
    readonly wasmworldgentopology_minimum_interface_arc_radians: (a: number) => number;
    readonly wasmworldgentopology_neighbor_arc_lengths_rad: (a: number) => [number, number];
    readonly wasmworldgentopology_neighbor_interface_arc_lengths_rad: (a: number) => [number, number];
    readonly wasmworldgentopology_neighbor_offsets: (a: number) => [number, number];
    readonly wasmworldgentopology_neighbors: (a: number) => [number, number];
    readonly wasmworldgentopology_new: (a: number) => [number, number, number];
    readonly wasmworldgentopology_parent_edges: (a: number) => [number, number];
    readonly wasmworldgentopology_positions: (a: number) => [number, number];
    readonly wasmworldgentopology_six_neighbor_count: (a: number) => number;
    readonly wasmworldgentopology_topology_hash_hex: (a: number) => [number, number];
    readonly wasmworldgentopology_total_area_steradians: (a: number) => number;
    readonly worldgen_engine_version: () => number;
    readonly wasmworldgentopology_minimum_area_steradians: (a: number) => number;
    readonly wasmworldgentopology_sample_count: (a: number) => number;
    readonly wasmworldgentopology_generator_version: (a: number) => number;
    readonly worldgen_protocol_version: () => number;
    readonly wasmworldgentopology_level: (a: number) => number;
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
