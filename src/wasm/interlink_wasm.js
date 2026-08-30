/* @ts-self-types="./interlink_wasm.d.ts" */

/**
 * Stateful Rust-owned comminution apparatus. A complete fixed-step operation
 * mutates two Rust-owned Hoppers and both process streams without material
 * populations crossing the JS/WASM boundary.
 */
export class WasmPackedComminutionMachine {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPackedComminutionMachineFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpackedcomminutionmachine_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    abrasion_exposure_tonne_ai() {
        const ret = wasm.wasmpackedcomminutionmachine_abrasion_exposure_tonne_ai(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    input_specific_sensible_enthalpy_j_per_kg() {
        const ret = wasm.wasmpackedcomminutionmachine_input_specific_sensible_enthalpy_j_per_kg(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    input_total_mass_flow_kg_per_second() {
        const ret = wasm.wasmpackedcomminutionmachine_input_total_mass_flow_kg_per_second(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    last_bond_abrasion_index() {
        const ret = wasm.wasmpackedcomminutionmachine_last_bond_abrasion_index(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {string}
     */
    last_error() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmpackedcomminutionmachine_last_error(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    last_power_kw() {
        const ret = wasm.wasmpackedcomminutionmachine_last_power_kw(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    last_specific_energy_kwh_per_t() {
        const ret = wasm.wasmpackedcomminutionmachine_last_specific_energy_kwh_per_t(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {string} equipment
     * @param {number} target_size_id
     * @param {number} target_particle_size_mm
     * @param {number} throughput_kg_per_second
     * @param {number} rated_power_kw
     * @param {boolean} enabled
     */
    constructor(equipment, target_size_id, target_particle_size_mm, throughput_kg_per_second, rated_power_kw, enabled) {
        const ptr0 = passStringToWasm0(equipment, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmpackedcomminutionmachine_new(ptr0, len0, target_size_id, target_particle_size_mm, throughput_kg_per_second, rated_power_kw, enabled);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        WasmPackedComminutionMachineFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {string}
     */
    operating_state() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmpackedcomminutionmachine_operating_state(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {Uint8Array}
     */
    output_liberation_class_ids() {
        const ret = wasm.wasmpackedcomminutionmachine_output_liberation_class_ids(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Float64Array}
     */
    output_quantities() {
        const ret = wasm.wasmpackedcomminutionmachine_output_quantities(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    output_size_bin_ids() {
        const ret = wasm.wasmpackedcomminutionmachine_output_size_bin_ids(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint16Array}
     */
    output_species_ids() {
        const ret = wasm.wasmpackedcomminutionmachine_output_species_ids(this.__wbg_ptr);
        var v1 = getArrayU16FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 2, 2);
        return v1;
    }
    /**
     * @returns {number}
     */
    output_specific_sensible_enthalpy_j_per_kg() {
        const ret = wasm.wasmpackedcomminutionmachine_output_specific_sensible_enthalpy_j_per_kg(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Uint32Array}
     */
    output_texture_profile_ids() {
        const ret = wasm.wasmpackedcomminutionmachine_output_texture_profile_ids(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {number}
     */
    output_total_mass_flow_kg_per_second() {
        const ret = wasm.wasmpackedcomminutionmachine_output_total_mass_flow_kg_per_second(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {WasmPackedHopper} source
     * @param {WasmPackedHopper} target
     * @param {WasmPackedComminutionTables} tables
     * @param {number} dt
     * @returns {number}
     */
    tick_hopper_to_hopper(source, target, tables, dt) {
        _assertClass(source, WasmPackedHopper);
        _assertClass(target, WasmPackedHopper);
        _assertClass(tables, WasmPackedComminutionTables);
        const ret = wasm.wasmpackedcomminutionmachine_tick_hopper_to_hopper(this.__wbg_ptr, source.__wbg_ptr, target.__wbg_ptr, tables.__wbg_ptr, dt);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
}
if (Symbol.dispose) WasmPackedComminutionMachine.prototype[Symbol.dispose] = WasmPackedComminutionMachine.prototype.free;

/**
 * Browser-facing compiler target for comminution metadata. Canonical string
 * identifiers are resolved by JavaScript once; the Rust hot path uses numeric
 * IDs and numeric property tables only.
 */
export class WasmPackedComminutionTables {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPackedComminutionTablesFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpackedcomminutiontables_free(ptr, 0);
    }
    /**
     * @param {number} runtime_id
     * @param {number} order_index
     */
    add_liberation_class(runtime_id, order_index) {
        wasm.wasmpackedcomminutiontables_add_liberation_class(this.__wbg_ptr, runtime_id, order_index);
    }
    /**
     * @param {number} runtime_id
     * @param {number} order_index
     * @param {number} max_mm
     * @param {number} representative_mm
     * @param {boolean} canonical
     */
    add_size_bin(runtime_id, order_index, max_mm, representative_mm, canonical) {
        const ret = wasm.wasmpackedcomminutiontables_add_size_bin(this.__wbg_ptr, runtime_id, order_index, max_mm, representative_mm, canonical);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    constructor() {
        const ret = wasm.wasmpackedcomminutiontables_new();
        this.__wbg_ptr = ret;
        WasmPackedComminutionTablesFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {number} runtime_id
     */
    set_legacy_lt_one_mm_id(runtime_id) {
        wasm.wasmpackedcomminutiontables_set_legacy_lt_one_mm_id(this.__wbg_ptr, runtime_id);
    }
    /**
     * @param {number} texture_profile_id
     * @param {number} species_id
     * @param {number} d10_um
     * @param {number} d50_um
     * @param {number} d90_um
     * @param {number} free
     * @param {number} boundary
     * @param {number} intergrown
     * @param {number} included
     */
    set_species_texture(texture_profile_id, species_id, d10_um, d50_um, d90_um, free, boundary, intergrown, included) {
        const ret = wasm.wasmpackedcomminutiontables_set_species_texture(this.__wbg_ptr, texture_profile_id, species_id, d10_um, d50_um, d90_um, free, boundary, intergrown, included);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} texture_profile_id
     * @param {number} bond_crushing_work_index_kwh_per_t
     * @param {number} bond_ball_mill_work_index_kwh_per_t
     * @param {number} bond_abrasion_index
     */
    set_texture_properties(texture_profile_id, bond_crushing_work_index_kwh_per_t, bond_ball_mill_work_index_kwh_per_t, bond_abrasion_index) {
        const ret = wasm.wasmpackedcomminutiontables_set_texture_properties(this.__wbg_ptr, texture_profile_id, bond_crushing_work_index_kwh_per_t, bond_ball_mill_work_index_kwh_per_t, bond_abrasion_index);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
}
if (Symbol.dispose) WasmPackedComminutionTables.prototype[Symbol.dispose] = WasmPackedComminutionTables.prototype.free;

/**
 * Stateful Rust-owned Extractor. One coarse call advances occurrence reserve,
 * material generation, target Hopper storage, and the material output stream.
 */
export class WasmPackedExtractor {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPackedExtractorFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpackedextractor_free(ptr, 0);
    }
    /**
     * @returns {string}
     */
    last_error() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmpackedextractor_last_error(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} rate_kg_per_second
     * @param {boolean} enabled
     */
    constructor(rate_kg_per_second, enabled) {
        const ret = wasm.wasmpackedextractor_new(rate_kg_per_second, enabled);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        WasmPackedExtractorFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {string}
     */
    operating_state() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmpackedextractor_operating_state(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {Uint8Array}
     */
    output_liberation_class_ids() {
        const ret = wasm.wasmpackedextractor_output_liberation_class_ids(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Float64Array}
     */
    output_quantities() {
        const ret = wasm.wasmpackedextractor_output_quantities(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    output_size_bin_ids() {
        const ret = wasm.wasmpackedextractor_output_size_bin_ids(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint16Array}
     */
    output_species_ids() {
        const ret = wasm.wasmpackedextractor_output_species_ids(this.__wbg_ptr);
        var v1 = getArrayU16FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 2, 2);
        return v1;
    }
    /**
     * @returns {number}
     */
    output_specific_sensible_enthalpy_j_per_kg() {
        const ret = wasm.wasmpackedextractor_output_specific_sensible_enthalpy_j_per_kg(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Uint32Array}
     */
    output_texture_profile_ids() {
        const ret = wasm.wasmpackedextractor_output_texture_profile_ids(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {number}
     */
    output_total_mass_flow_kg_per_second() {
        const ret = wasm.wasmpackedextractor_output_total_mass_flow_kg_per_second(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {boolean} enabled
     */
    set_enabled(enabled) {
        wasm.wasmpackedextractor_set_enabled(this.__wbg_ptr, enabled);
    }
    /**
     * @param {number} value
     */
    set_rate_kg_per_second(value) {
        const ret = wasm.wasmpackedextractor_set_rate_kg_per_second(this.__wbg_ptr, value);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {WasmPackedResourceOccurrence} occurrence
     * @param {WasmPackedHopper} target
     * @param {number} dt
     * @returns {number}
     */
    tick_occurrence_to_hopper(occurrence, target, dt) {
        _assertClass(occurrence, WasmPackedResourceOccurrence);
        _assertClass(target, WasmPackedHopper);
        const ret = wasm.wasmpackedextractor_tick_occurrence_to_hopper(this.__wbg_ptr, occurrence.__wbg_ptr, target.__wbg_ptr, dt);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
}
if (Symbol.dispose) WasmPackedExtractor.prototype[Symbol.dispose] = WasmPackedExtractor.prototype.free;

/**
 * Browser-facing wrapper for the first Rust-owned apparatus execution path.
 * The Feeder owns its packed input/output streams internally and mutates two
 * Rust-owned Hopper inventories in one coarse tick call.
 */
export class WasmPackedFeeder {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPackedFeederFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpackedfeeder_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    input_specific_sensible_enthalpy_j_per_kg() {
        const ret = wasm.wasmpackedfeeder_input_specific_sensible_enthalpy_j_per_kg(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    input_total_mass_flow_kg_per_second() {
        const ret = wasm.wasmpackedfeeder_input_total_mass_flow_kg_per_second(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {string}
     */
    last_error() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmpackedfeeder_last_error(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} flow_rate_kg_per_second
     * @param {number} throughput_kg_per_second
     * @param {boolean} enabled
     */
    constructor(flow_rate_kg_per_second, throughput_kg_per_second, enabled) {
        const ret = wasm.wasmpackedfeeder_new(flow_rate_kg_per_second, throughput_kg_per_second, enabled);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        WasmPackedFeederFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {string}
     */
    operating_state() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmpackedfeeder_operating_state(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {Uint8Array}
     */
    output_liberation_class_ids() {
        const ret = wasm.wasmpackedfeeder_output_liberation_class_ids(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Float64Array}
     */
    output_quantities() {
        const ret = wasm.wasmpackedfeeder_output_quantities(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    output_size_bin_ids() {
        const ret = wasm.wasmpackedfeeder_output_size_bin_ids(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint16Array}
     */
    output_species_ids() {
        const ret = wasm.wasmpackedfeeder_output_species_ids(this.__wbg_ptr);
        var v1 = getArrayU16FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 2, 2);
        return v1;
    }
    /**
     * @returns {number}
     */
    output_specific_sensible_enthalpy_j_per_kg() {
        const ret = wasm.wasmpackedfeeder_output_specific_sensible_enthalpy_j_per_kg(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Uint32Array}
     */
    output_texture_profile_ids() {
        const ret = wasm.wasmpackedfeeder_output_texture_profile_ids(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {number}
     */
    output_total_mass_flow_kg_per_second() {
        const ret = wasm.wasmpackedfeeder_output_total_mass_flow_kg_per_second(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {boolean} enabled
     */
    set_enabled(enabled) {
        wasm.wasmpackedfeeder_set_enabled(this.__wbg_ptr, enabled);
    }
    /**
     * @param {number} value
     */
    set_flow_rate_kg_per_second(value) {
        const ret = wasm.wasmpackedfeeder_set_flow_rate_kg_per_second(this.__wbg_ptr, value);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} value
     */
    set_throughput_kg_per_second(value) {
        const ret = wasm.wasmpackedfeeder_set_throughput_kg_per_second(this.__wbg_ptr, value);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {WasmPackedHopper} source
     * @param {WasmPackedHopper} target
     * @param {number} dt
     * @returns {number}
     */
    tick_hopper_to_hopper(source, target, dt) {
        _assertClass(source, WasmPackedHopper);
        _assertClass(target, WasmPackedHopper);
        const ret = wasm.wasmpackedfeeder_tick_hopper_to_hopper(this.__wbg_ptr, source.__wbg_ptr, target.__wbg_ptr, dt);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
}
if (Symbol.dispose) WasmPackedFeeder.prototype[Symbol.dispose] = WasmPackedFeeder.prototype.free;

/**
 * Rust-owned finite gas inventory. Species arrays are setup/debug snapshots;
 * mixing, stream receipt, and thermal exchange are coarse Rust operations.
 */
export class WasmPackedGasBody {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPackedGasBodyFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpackedgasbody_free(ptr, 0);
    }
    /**
     * Conservative solid↔gas sensible heat exchange. Positive energy moved
     * from the Hopper's solid body into this gas body.
     * @param {WasmPackedHopper} hopper
     * @param {WasmPackedThermalModel} thermal
     * @param {number} conductance_w_per_k
     * @param {number} dt
     * @returns {number}
     */
    exchange_heat_with_hopper(hopper, thermal, conductance_w_per_k, dt) {
        _assertClass(hopper, WasmPackedHopper);
        _assertClass(thermal, WasmPackedThermalModel);
        const ret = wasm.wasmpackedgasbody_exchange_heat_with_hopper(this.__wbg_ptr, hopper.__wbg_ptr, thermal.__wbg_ptr, conductance_w_per_k, dt);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
    /**
     * Mix a complete incoming gas body into this inventory in one call.
     * @param {WasmPackedGasBody} incoming
     * @returns {number}
     */
    mix_from(incoming) {
        _assertClass(incoming, WasmPackedGasBody);
        const ret = wasm.wasmpackedgasbody_mix_from(this.__wbg_ptr, incoming.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
    constructor() {
        const ret = wasm.wasmpackedgasbody_new();
        this.__wbg_ptr = ret;
        WasmPackedGasBodyFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {number} species_id
     * @param {number} quantity_kg
     */
    push_species(species_id, quantity_kg) {
        const ret = wasm.wasmpackedgasbody_push_species(this.__wbg_ptr, species_id, quantity_kg);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @returns {Float64Array}
     */
    quantities() {
        const ret = wasm.wasmpackedgasbody_quantities(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * Consume one packed gas stream for dt seconds in one call.
     * @param {WasmPackedGasStream} stream
     * @param {number} dt
     * @returns {number}
     */
    receive_stream(stream, dt) {
        _assertClass(stream, WasmPackedGasStream);
        const ret = wasm.wasmpackedgasbody_receive_stream(this.__wbg_ptr, stream.__wbg_ptr, dt);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
    /**
     * @returns {number}
     */
    sensible_enthalpy_j() {
        const ret = wasm.wasmpackedgasbody_sensible_enthalpy_j(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} value
     */
    set_sensible_enthalpy_j(value) {
        const ret = wasm.wasmpackedgasbody_set_sensible_enthalpy_j(this.__wbg_ptr, value);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {WasmPackedThermalModel} thermal
     * @param {number} temperature_k
     */
    set_temperature_k(thermal, temperature_k) {
        _assertClass(thermal, WasmPackedThermalModel);
        const ret = wasm.wasmpackedgasbody_set_temperature_k(this.__wbg_ptr, thermal.__wbg_ptr, temperature_k);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @returns {Uint16Array}
     */
    species_ids() {
        const ret = wasm.wasmpackedgasbody_species_ids(this.__wbg_ptr);
        var v1 = getArrayU16FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 2, 2);
        return v1;
    }
    /**
     * @returns {number}
     */
    specific_sensible_enthalpy_j_per_kg() {
        const ret = wasm.wasmpackedgasbody_specific_sensible_enthalpy_j_per_kg(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {WasmPackedThermalModel} thermal
     * @returns {number}
     */
    temperature_k(thermal) {
        _assertClass(thermal, WasmPackedThermalModel);
        const ret = wasm.wasmpackedgasbody_temperature_k(this.__wbg_ptr, thermal.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
    /**
     * @returns {number}
     */
    total_mass_kg() {
        const ret = wasm.wasmpackedgasbody_total_mass_kg(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) WasmPackedGasBody.prototype[Symbol.dispose] = WasmPackedGasBody.prototype.free;

/**
 * Continuous Rust-owned gas stream. Values are kg/s.
 */
export class WasmPackedGasStream {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPackedGasStreamFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpackedgasstream_free(ptr, 0);
    }
    clear() {
        wasm.wasmpackedgasstream_clear(this.__wbg_ptr);
    }
    constructor() {
        const ret = wasm.wasmpackedgasstream_new();
        this.__wbg_ptr = ret;
        WasmPackedGasStreamFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {number} species_id
     * @param {number} rate_kg_per_second
     */
    push_species_flow(species_id, rate_kg_per_second) {
        const ret = wasm.wasmpackedgasstream_push_species_flow(this.__wbg_ptr, species_id, rate_kg_per_second);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @returns {Float64Array}
     */
    quantities() {
        const ret = wasm.wasmpackedgasstream_quantities(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @param {number} value
     */
    set_specific_sensible_enthalpy_j_per_kg(value) {
        const ret = wasm.wasmpackedgasstream_set_specific_sensible_enthalpy_j_per_kg(this.__wbg_ptr, value);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @returns {Uint16Array}
     */
    species_ids() {
        const ret = wasm.wasmpackedgasstream_species_ids(this.__wbg_ptr);
        var v1 = getArrayU16FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 2, 2);
        return v1;
    }
    /**
     * @returns {number}
     */
    specific_sensible_enthalpy_j_per_kg() {
        const ret = wasm.wasmpackedgasstream_specific_sensible_enthalpy_j_per_kg(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    total_mass_flow_kg_per_second() {
        const ret = wasm.wasmpackedgasstream_total_mass_flow_kg_per_second(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) WasmPackedGasStream.prototype[Symbol.dispose] = WasmPackedGasStream.prototype.free;

/**
 * Browser adapter for the compiled numeric goethite-dehydroxylation model.
 * Canonical reaction definitions and texture IDs are resolved in JavaScript once;
 * the per-tick solve remains entirely inside Rust.
 */
export class WasmPackedGoethiteReaction {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPackedGoethiteReactionFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpackedgoethitereaction_free(ptr, 0);
    }
    /**
     * @param {number} source_species_id
     * @param {number} solid_product_species_id
     * @param {number} gas_product_species_id
     * @param {number} source_mass_per_extent_kg
     * @param {number} solid_product_mass_per_extent_kg
     * @param {number} gas_product_mass_per_extent_kg
     * @param {number} reaction_enthalpy_j_per_mol_extent
     * @param {number} activation_energy_j_per_mol
     * @param {number} pre_exponential_factor_per_second
     */
    constructor(source_species_id, solid_product_species_id, gas_product_species_id, source_mass_per_extent_kg, solid_product_mass_per_extent_kg, gas_product_mass_per_extent_kg, reaction_enthalpy_j_per_mol_extent, activation_energy_j_per_mol, pre_exponential_factor_per_second) {
        const ret = wasm.wasmpackedgoethitereaction_new(source_species_id, solid_product_species_id, gas_product_species_id, source_mass_per_extent_kg, solid_product_mass_per_extent_kg, gas_product_mass_per_extent_kg, reaction_enthalpy_j_per_mol_extent, activation_energy_j_per_mol, pre_exponential_factor_per_second);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        WasmPackedGoethiteReactionFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {number} source_texture_profile_id
     * @param {number} product_texture_profile_id
     */
    set_product_texture_mapping(source_texture_profile_id, product_texture_profile_id) {
        const ret = wasm.wasmpackedgoethitereaction_set_product_texture_mapping(this.__wbg_ptr, source_texture_profile_id, product_texture_profile_id);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} size_bin_id
     * @param {number} factor
     */
    set_size_factor(size_bin_id, factor) {
        const ret = wasm.wasmpackedgoethitereaction_set_size_factor(this.__wbg_ptr, size_bin_id, factor);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
}
if (Symbol.dispose) WasmPackedGoethiteReaction.prototype[Symbol.dispose] = WasmPackedGoethiteReaction.prototype.free;

/**
 * First finite-inventory object exposed from the permanent Rust simulation
 * core. It mirrors current Hopper mass/capacity/enthalpy behavior but uses
 * packed numeric execution state internally.
 */
export class WasmPackedHopper {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPackedHopperFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpackedhopper_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    capacity_kg() {
        const ret = wasm.wasmpackedhopper_capacity_kg(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    free_capacity_kg() {
        const ret = wasm.wasmpackedhopper_free_capacity_kg(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} capacity_kg
     */
    constructor(capacity_kg) {
        const ret = wasm.wasmpackedhopper_new(capacity_kg);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        WasmPackedHopperFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {number} species_id
     * @param {number} size_bin_id
     * @param {number} liberation_class_id
     * @param {number} texture_profile_id
     * @param {number} quantity_kg
     */
    push_fraction(species_id, size_bin_id, liberation_class_id, texture_profile_id, quantity_kg) {
        const ret = wasm.wasmpackedhopper_push_fraction(this.__wbg_ptr, species_id, size_bin_id, liberation_class_id, texture_profile_id, quantity_kg);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Receive a packed flow state in one coarse WASM call. Flow quantities are
     * kg/s and are clipped only by Hopper capacity.
     * @param {WasmPackedSolidState} flow
     * @param {number} dt
     * @param {number} specific_sensible_enthalpy_j_per_kg
     * @returns {number}
     */
    receive_flow(flow, dt, specific_sensible_enthalpy_j_per_kg) {
        _assertClass(flow, WasmPackedSolidState);
        const ret = wasm.wasmpackedhopper_receive_flow(this.__wbg_ptr, flow.__wbg_ptr, dt, specific_sensible_enthalpy_j_per_kg);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
    /**
     * @returns {number}
     */
    sensible_enthalpy_j() {
        const ret = wasm.wasmpackedhopper_sensible_enthalpy_j(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} sensible_enthalpy_j
     */
    set_sensible_enthalpy_j(sensible_enthalpy_j) {
        const ret = wasm.wasmpackedhopper_set_sensible_enthalpy_j(this.__wbg_ptr, sensible_enthalpy_j);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @returns {number}
     */
    stored_mass_kg() {
        const ret = wasm.wasmpackedhopper_stored_mass_kg(this.__wbg_ptr);
        return ret;
    }
    /**
     * Conservative storage-to-storage transfer inside WASM. No material arrays
     * cross the JS/WASM boundary for the operation itself.
     * @param {WasmPackedHopper} target
     * @param {number} max_rate_kg_per_second
     * @param {number} dt
     * @returns {number}
     */
    transfer_to(target, max_rate_kg_per_second, dt) {
        _assertClass(target, WasmPackedHopper);
        const ret = wasm.wasmpackedhopper_transfer_to(this.__wbg_ptr, target.__wbg_ptr, max_rate_kg_per_second, dt);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
}
if (Symbol.dispose) WasmPackedHopper.prototype[Symbol.dispose] = WasmPackedHopper.prototype.free;

export class WasmPackedMagneticSeparator {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPackedMagneticSeparatorFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpackedmagneticseparator_free(ptr, 0);
    }
    /**
     * @returns {Uint8Array}
     */
    concentrate_liberation_class_ids() {
        const ret = wasm.wasmpackedmagneticseparator_concentrate_liberation_class_ids(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Float64Array}
     */
    concentrate_quantities() {
        const ret = wasm.wasmpackedmagneticseparator_concentrate_quantities(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    concentrate_size_bin_ids() {
        const ret = wasm.wasmpackedmagneticseparator_concentrate_size_bin_ids(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint16Array}
     */
    concentrate_species_ids() {
        const ret = wasm.wasmpackedmagneticseparator_concentrate_species_ids(this.__wbg_ptr);
        var v1 = getArrayU16FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 2, 2);
        return v1;
    }
    /**
     * @returns {number}
     */
    concentrate_specific_sensible_enthalpy_j_per_kg() {
        const ret = wasm.wasmpackedmagneticseparator_concentrate_specific_sensible_enthalpy_j_per_kg(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Uint32Array}
     */
    concentrate_texture_profile_ids() {
        const ret = wasm.wasmpackedmagneticseparator_concentrate_texture_profile_ids(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {number}
     */
    concentrate_total_mass_flow_kg_per_second() {
        const ret = wasm.wasmpackedmagneticseparator_concentrate_total_mass_flow_kg_per_second(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    input_total_mass_flow_kg_per_second() {
        const ret = wasm.wasmpackedmagneticseparator_input_total_mass_flow_kg_per_second(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {string}
     */
    last_error() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmpackedmagneticseparator_last_error(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} field_strength
     * @param {number} max_feed_particle_size_mm
     * @param {number} throughput_kg_per_second
     * @param {boolean} enabled
     */
    constructor(field_strength, max_feed_particle_size_mm, throughput_kg_per_second, enabled) {
        const ret = wasm.wasmpackedmagneticseparator_new(field_strength, max_feed_particle_size_mm, throughput_kg_per_second, enabled);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        WasmPackedMagneticSeparatorFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {string}
     */
    operating_state() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmpackedmagneticseparator_operating_state(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {boolean} enabled
     */
    set_enabled(enabled) {
        wasm.wasmpackedmagneticseparator_set_enabled(this.__wbg_ptr, enabled);
    }
    /**
     * @param {number} value
     */
    set_field_strength(value) {
        const ret = wasm.wasmpackedmagneticseparator_set_field_strength(this.__wbg_ptr, value);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} value
     */
    set_max_feed_particle_size_mm(value) {
        const ret = wasm.wasmpackedmagneticseparator_set_max_feed_particle_size_mm(this.__wbg_ptr, value);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} value
     */
    set_throughput_kg_per_second(value) {
        const ret = wasm.wasmpackedmagneticseparator_set_throughput_kg_per_second(this.__wbg_ptr, value);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @returns {Uint8Array}
     */
    tailings_liberation_class_ids() {
        const ret = wasm.wasmpackedmagneticseparator_tailings_liberation_class_ids(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Float64Array}
     */
    tailings_quantities() {
        const ret = wasm.wasmpackedmagneticseparator_tailings_quantities(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    tailings_size_bin_ids() {
        const ret = wasm.wasmpackedmagneticseparator_tailings_size_bin_ids(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint16Array}
     */
    tailings_species_ids() {
        const ret = wasm.wasmpackedmagneticseparator_tailings_species_ids(this.__wbg_ptr);
        var v1 = getArrayU16FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 2, 2);
        return v1;
    }
    /**
     * @returns {number}
     */
    tailings_specific_sensible_enthalpy_j_per_kg() {
        const ret = wasm.wasmpackedmagneticseparator_tailings_specific_sensible_enthalpy_j_per_kg(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Uint32Array}
     */
    tailings_texture_profile_ids() {
        const ret = wasm.wasmpackedmagneticseparator_tailings_texture_profile_ids(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {number}
     */
    tailings_total_mass_flow_kg_per_second() {
        const ret = wasm.wasmpackedmagneticseparator_tailings_total_mass_flow_kg_per_second(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {WasmPackedHopper} source
     * @param {WasmPackedHopper} concentrate
     * @param {WasmPackedHopper} tailings
     * @param {WasmPackedSeparationTables} tables
     * @param {number} dt
     * @returns {number}
     */
    tick_hopper_to_hoppers(source, concentrate, tailings, tables, dt) {
        _assertClass(source, WasmPackedHopper);
        _assertClass(concentrate, WasmPackedHopper);
        _assertClass(tailings, WasmPackedHopper);
        _assertClass(tables, WasmPackedSeparationTables);
        const ret = wasm.wasmpackedmagneticseparator_tick_hopper_to_hoppers(this.__wbg_ptr, source.__wbg_ptr, concentrate.__wbg_ptr, tailings.__wbg_ptr, tables.__wbg_ptr, dt);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
}
if (Symbol.dispose) WasmPackedMagneticSeparator.prototype[Symbol.dispose] = WasmPackedMagneticSeparator.prototype.free;

export class WasmPackedMerger {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPackedMergerFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpackedmerger_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    input_a_total_mass_flow_kg_per_second() {
        const ret = wasm.wasmpackedmerger_input_a_total_mass_flow_kg_per_second(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    input_b_total_mass_flow_kg_per_second() {
        const ret = wasm.wasmpackedmerger_input_b_total_mass_flow_kg_per_second(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {string}
     */
    last_error() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmpackedmerger_last_error(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} throughput_kg_per_second
     * @param {boolean} enabled
     */
    constructor(throughput_kg_per_second, enabled) {
        const ret = wasm.wasmpackedmerger_new(throughput_kg_per_second, enabled);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        WasmPackedMergerFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {string}
     */
    operating_state() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmpackedmerger_operating_state(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    output_specific_sensible_enthalpy_j_per_kg() {
        const ret = wasm.wasmpackedmerger_output_specific_sensible_enthalpy_j_per_kg(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    output_total_mass_flow_kg_per_second() {
        const ret = wasm.wasmpackedmerger_output_total_mass_flow_kg_per_second(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {boolean} enabled
     */
    set_enabled(enabled) {
        wasm.wasmpackedmerger_set_enabled(this.__wbg_ptr, enabled);
    }
    /**
     * @param {WasmPackedHopper} input_a
     * @param {WasmPackedHopper} input_b
     * @param {WasmPackedHopper} output
     * @param {WasmPackedThermalTable} thermal
     * @param {number} dt
     * @returns {number}
     */
    tick_hoppers_to_hopper(input_a, input_b, output, thermal, dt) {
        _assertClass(input_a, WasmPackedHopper);
        _assertClass(input_b, WasmPackedHopper);
        _assertClass(output, WasmPackedHopper);
        _assertClass(thermal, WasmPackedThermalTable);
        const ret = wasm.wasmpackedmerger_tick_hoppers_to_hopper(this.__wbg_ptr, input_a.__wbg_ptr, input_b.__wbg_ptr, output.__wbg_ptr, thermal.__wbg_ptr, dt);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
}
if (Symbol.dispose) WasmPackedMerger.prototype[Symbol.dispose] = WasmPackedMerger.prototype.free;

/**
 * Browser-facing packed ResourceOccurrence. Canonical resource strings,
 * composition, texture metadata, and fragmentation are compiled in JavaScript
 * during setup; extraction ticks operate only on numeric packed state.
 */
export class WasmPackedResourceOccurrence {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPackedResourceOccurrenceFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpackedresourceoccurrence_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    extracted_mass_kg() {
        const ret = wasm.wasmpackedresourceoccurrence_extracted_mass_kg(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {boolean}
     */
    is_depleted() {
        const ret = wasm.wasmpackedresourceoccurrence_is_depleted(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {boolean}
     */
    is_finite() {
        const ret = wasm.wasmpackedresourceoccurrence_is_finite(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    material_template_total_kg() {
        const ret = wasm.wasmpackedresourceoccurrence_material_template_total_kg(this.__wbg_ptr);
        return ret;
    }
    constructor() {
        const ret = wasm.wasmpackedresourceoccurrence_new();
        this.__wbg_ptr = ret;
        WasmPackedResourceOccurrenceFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {number} species_id
     * @param {number} size_bin_id
     * @param {number} liberation_class_id
     * @param {number} texture_profile_id
     * @param {number} quantity_per_kg
     */
    push_material_fraction(species_id, size_bin_id, liberation_class_id, texture_profile_id, quantity_per_kg) {
        const ret = wasm.wasmpackedresourceoccurrence_push_material_fraction(this.__wbg_ptr, species_id, size_bin_id, liberation_class_id, texture_profile_id, quantity_per_kg);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @returns {number}
     */
    remaining_mass_kg() {
        const ret = wasm.wasmpackedresourceoccurrence_remaining_mass_kg(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} value
     */
    set_finite_reserve_mass_kg(value) {
        const ret = wasm.wasmpackedresourceoccurrence_set_finite_reserve_mass_kg(this.__wbg_ptr, value);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
}
if (Symbol.dispose) WasmPackedResourceOccurrence.prototype[Symbol.dispose] = WasmPackedResourceOccurrence.prototype.free;

/**
 * Coarse browser adapter for a complete Rust-owned Roasting Furnace. The
 * furnace keeps all zone, pending-feed, gas-inventory, stream and diagnostic
 * state inside WASM between calls.
 */
export class WasmPackedRoastingFurnace {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPackedRoastingFurnaceFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpackedroastingfurnace_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    actual_charge_temperature_k() {
        const ret = wasm.wasmpackedroastingfurnace_actual_charge_temperature_k(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    charge_mass_kg() {
        const ret = wasm.wasmpackedroastingfurnace_charge_mass_kg(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Float64Array}
     */
    gas_exhaust_quantities() {
        const ret = wasm.wasmpackedroastingfurnace_gas_exhaust_quantities(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {Uint16Array}
     */
    gas_exhaust_species_ids() {
        const ret = wasm.wasmpackedroastingfurnace_gas_exhaust_species_ids(this.__wbg_ptr);
        var v1 = getArrayU16FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 2, 2);
        return v1;
    }
    /**
     * @returns {number}
     */
    gas_exhaust_total_mass_flow_kg_per_second() {
        const ret = wasm.wasmpackedroastingfurnace_gas_exhaust_total_mass_flow_kg_per_second(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    gas_inventory_mass_kg() {
        const ret = wasm.wasmpackedroastingfurnace_gas_inventory_mass_kg(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} dt
     * @returns {number}
     */
    input_capacity_kg(dt) {
        const ret = wasm.wasmpackedroastingfurnace_input_capacity_kg(this.__wbg_ptr, dt);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
    /**
     * @returns {string}
     */
    last_error() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmpackedroastingfurnace_last_error(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    last_feed_rate_kg_per_second() {
        const ret = wasm.wasmpackedroastingfurnace_last_feed_rate_kg_per_second(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    last_goethite_conversion_fraction() {
        const ret = wasm.wasmpackedroastingfurnace_last_goethite_conversion_fraction(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    last_heat_loss_power_kw() {
        const ret = wasm.wasmpackedroastingfurnace_last_heat_loss_power_kw(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    last_heater_power_kw() {
        const ret = wasm.wasmpackedroastingfurnace_last_heater_power_kw(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    last_product_rate_kg_per_second() {
        const ret = wasm.wasmpackedroastingfurnace_last_product_rate_kg_per_second(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    last_reaction_power_kw() {
        const ret = wasm.wasmpackedroastingfurnace_last_reaction_power_kw(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    last_solver_evaluation_count() {
        const ret = wasm.wasmpackedroastingfurnace_last_solver_evaluation_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} temperature_setpoint_k
     * @param {number} rated_heater_power_kw
     * @param {number} maximum_operating_temperature_k
     * @param {number} maximum_solid_throughput_kg_per_second
     * @param {number} effective_chamber_hold_up_kg
     * @param {number} heat_loss_coefficient_w_per_k
     * @param {number} internal_zone_count
     * @param {boolean} enabled
     */
    constructor(temperature_setpoint_k, rated_heater_power_kw, maximum_operating_temperature_k, maximum_solid_throughput_kg_per_second, effective_chamber_hold_up_kg, heat_loss_coefficient_w_per_k, internal_zone_count, enabled) {
        const ret = wasm.wasmpackedroastingfurnace_new(temperature_setpoint_k, rated_heater_power_kw, maximum_operating_temperature_k, maximum_solid_throughput_kg_per_second, effective_chamber_hold_up_kg, heat_loss_coefficient_w_per_k, internal_zone_count, enabled);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        WasmPackedRoastingFurnaceFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {string}
     */
    operating_state() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmpackedroastingfurnace_operating_state(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    pending_feed_mass_kg() {
        const ret = wasm.wasmpackedroastingfurnace_pending_feed_mass_kg(this.__wbg_ptr);
        return ret;
    }
    /**
     * Migration convenience: atomically move a metered share from an existing
     * Rust Hopper into the furnace staging buffer. The final graph scheduler can
     * route process outputs directly without this helper.
     * @param {WasmPackedHopper} source
     * @param {number} requested_rate_kg_per_second
     * @param {number} dt
     * @returns {number}
     */
    receive_from_hopper(source, requested_rate_kg_per_second, dt) {
        _assertClass(source, WasmPackedHopper);
        const ret = wasm.wasmpackedroastingfurnace_receive_from_hopper(this.__wbg_ptr, source.__wbg_ptr, requested_rate_kg_per_second, dt);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
    /**
     * @param {boolean} enabled
     */
    set_enabled(enabled) {
        wasm.wasmpackedroastingfurnace_set_enabled(this.__wbg_ptr, enabled);
    }
    /**
     * @param {number} value
     */
    set_temperature_setpoint_k(value) {
        const ret = wasm.wasmpackedroastingfurnace_set_temperature_setpoint_k(this.__wbg_ptr, value);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @returns {number}
     */
    solid_product_total_mass_flow_kg_per_second() {
        const ret = wasm.wasmpackedroastingfurnace_solid_product_total_mass_flow_kg_per_second(this.__wbg_ptr);
        return ret;
    }
    /**
     * Advance one complete furnace fixed step with a solid-product Hopper and
     * unbounded ExhaustVent gas inventory. Zone heating, reaction solves,
     * residence movement, product backpressure and gas venting are one Rust call.
     * @param {WasmPackedHopper} product_hopper
     * @param {WasmPackedGasBody} gas_vent
     * @param {WasmPackedThermalModel} thermal
     * @param {WasmPackedGoethiteReaction} reaction
     * @param {number} dt
     * @returns {number}
     */
    tick_to_hopper_and_vent(product_hopper, gas_vent, thermal, reaction, dt) {
        _assertClass(product_hopper, WasmPackedHopper);
        _assertClass(gas_vent, WasmPackedGasBody);
        _assertClass(thermal, WasmPackedThermalModel);
        _assertClass(reaction, WasmPackedGoethiteReaction);
        const ret = wasm.wasmpackedroastingfurnace_tick_to_hopper_and_vent(this.__wbg_ptr, product_hopper.__wbg_ptr, gas_vent.__wbg_ptr, thermal.__wbg_ptr, reaction.__wbg_ptr, dt);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
    /**
     * @returns {Float64Array}
     */
    zone_temperatures_k() {
        const ret = wasm.wasmpackedroastingfurnace_zone_temperatures_k(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
}
if (Symbol.dispose) WasmPackedRoastingFurnace.prototype[Symbol.dispose] = WasmPackedRoastingFurnace.prototype.free;

export class WasmPackedScreen {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPackedScreenFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpackedscreen_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    input_total_mass_flow_kg_per_second() {
        const ret = wasm.wasmpackedscreen_input_total_mass_flow_kg_per_second(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {string}
     */
    last_error() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmpackedscreen_last_error(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} aperture_size_mm
     * @param {number} throughput_kg_per_second
     * @param {boolean} enabled
     */
    constructor(aperture_size_mm, throughput_kg_per_second, enabled) {
        const ret = wasm.wasmpackedscreen_new(aperture_size_mm, throughput_kg_per_second, enabled);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        WasmPackedScreenFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {string}
     */
    operating_state() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmpackedscreen_operating_state(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {Uint8Array}
     */
    oversize_liberation_class_ids() {
        const ret = wasm.wasmpackedscreen_oversize_liberation_class_ids(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Float64Array}
     */
    oversize_quantities() {
        const ret = wasm.wasmpackedscreen_oversize_quantities(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    oversize_size_bin_ids() {
        const ret = wasm.wasmpackedscreen_oversize_size_bin_ids(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint16Array}
     */
    oversize_species_ids() {
        const ret = wasm.wasmpackedscreen_oversize_species_ids(this.__wbg_ptr);
        var v1 = getArrayU16FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 2, 2);
        return v1;
    }
    /**
     * @returns {number}
     */
    oversize_specific_sensible_enthalpy_j_per_kg() {
        const ret = wasm.wasmpackedscreen_oversize_specific_sensible_enthalpy_j_per_kg(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Uint32Array}
     */
    oversize_texture_profile_ids() {
        const ret = wasm.wasmpackedscreen_oversize_texture_profile_ids(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {number}
     */
    oversize_total_mass_flow_kg_per_second() {
        const ret = wasm.wasmpackedscreen_oversize_total_mass_flow_kg_per_second(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} value
     */
    set_aperture_size_mm(value) {
        const ret = wasm.wasmpackedscreen_set_aperture_size_mm(this.__wbg_ptr, value);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {boolean} enabled
     */
    set_enabled(enabled) {
        wasm.wasmpackedscreen_set_enabled(this.__wbg_ptr, enabled);
    }
    /**
     * @param {number} value
     */
    set_throughput_kg_per_second(value) {
        const ret = wasm.wasmpackedscreen_set_throughput_kg_per_second(this.__wbg_ptr, value);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {WasmPackedHopper} source
     * @param {WasmPackedHopper} undersize
     * @param {WasmPackedHopper} oversize
     * @param {WasmPackedSeparationTables} tables
     * @param {number} dt
     * @returns {number}
     */
    tick_hopper_to_hoppers(source, undersize, oversize, tables, dt) {
        _assertClass(source, WasmPackedHopper);
        _assertClass(undersize, WasmPackedHopper);
        _assertClass(oversize, WasmPackedHopper);
        _assertClass(tables, WasmPackedSeparationTables);
        const ret = wasm.wasmpackedscreen_tick_hopper_to_hoppers(this.__wbg_ptr, source.__wbg_ptr, undersize.__wbg_ptr, oversize.__wbg_ptr, tables.__wbg_ptr, dt);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
    /**
     * @returns {Uint8Array}
     */
    undersize_liberation_class_ids() {
        const ret = wasm.wasmpackedscreen_undersize_liberation_class_ids(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Float64Array}
     */
    undersize_quantities() {
        const ret = wasm.wasmpackedscreen_undersize_quantities(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    undersize_size_bin_ids() {
        const ret = wasm.wasmpackedscreen_undersize_size_bin_ids(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint16Array}
     */
    undersize_species_ids() {
        const ret = wasm.wasmpackedscreen_undersize_species_ids(this.__wbg_ptr);
        var v1 = getArrayU16FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 2, 2);
        return v1;
    }
    /**
     * @returns {number}
     */
    undersize_specific_sensible_enthalpy_j_per_kg() {
        const ret = wasm.wasmpackedscreen_undersize_specific_sensible_enthalpy_j_per_kg(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Uint32Array}
     */
    undersize_texture_profile_ids() {
        const ret = wasm.wasmpackedscreen_undersize_texture_profile_ids(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {number}
     */
    undersize_total_mass_flow_kg_per_second() {
        const ret = wasm.wasmpackedscreen_undersize_total_mass_flow_kg_per_second(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) WasmPackedScreen.prototype[Symbol.dispose] = WasmPackedScreen.prototype.free;

/**
 * Browser-facing setup table for packed classification/separation. Canonical
 * string identifiers and material-property definitions are resolved once in
 * JavaScript; Screen/Magnetic-Separator ticks consume numeric tables only.
 */
export class WasmPackedSeparationTables {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPackedSeparationTablesFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpackedseparationtables_free(ptr, 0);
    }
    /**
     * @param {number} runtime_id
     * @param {number} recovery_factor
     */
    add_liberation_class(runtime_id, recovery_factor) {
        const ret = wasm.wasmpackedseparationtables_add_liberation_class(this.__wbg_ptr, runtime_id, recovery_factor);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} runtime_id
     * @param {number} max_mm
     * @param {number} magnetic_suitability
     */
    add_size_bin(runtime_id, max_mm, magnetic_suitability) {
        const ret = wasm.wasmpackedseparationtables_add_size_bin(this.__wbg_ptr, runtime_id, max_mm, magnetic_suitability);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    constructor() {
        const ret = wasm.wasmpackedseparationtables_new();
        this.__wbg_ptr = ret;
        WasmPackedSeparationTablesFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {number} runtime_id
     * @param {number} normalized_separation_coefficient
     */
    set_species_magnetic_response(runtime_id, normalized_separation_coefficient) {
        const ret = wasm.wasmpackedseparationtables_set_species_magnetic_response(this.__wbg_ptr, runtime_id, normalized_separation_coefficient);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} runtime_id
     * @param {number} value
     */
    set_specific_heat_capacity_j_per_kg_k(runtime_id, value) {
        const ret = wasm.wasmpackedseparationtables_set_specific_heat_capacity_j_per_kg_k(this.__wbg_ptr, runtime_id, value);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
}
if (Symbol.dispose) WasmPackedSeparationTables.prototype[Symbol.dispose] = WasmPackedSeparationTables.prototype.free;

/**
 * Browser-facing packed material primitive. Coarse state ownership is retained
 * inside WASM; column accessors are snapshots for debugging/parity during the
 * migration and should not become the eventual per-tick UI protocol.
 */
export class WasmPackedSolidState {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPackedSolidStateFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpackedsolidstate_free(ptr, 0);
    }
    clear() {
        wasm.wasmpackedsolidstate_clear(this.__wbg_ptr);
    }
    /**
     * @returns {boolean}
     */
    is_empty() {
        const ret = wasm.wasmpackedsolidstate_is_empty(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    len() {
        const ret = wasm.wasmpackedsolidstate_len(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {Uint8Array}
     */
    liberation_class_ids() {
        const ret = wasm.wasmpackedsolidstate_liberation_class_ids(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    constructor() {
        const ret = wasm.wasmpackedsolidstate_new();
        this.__wbg_ptr = ret;
        WasmPackedSolidStateFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {number} species_id
     * @param {number} size_bin_id
     * @param {number} liberation_class_id
     * @param {number} texture_profile_id
     * @param {number} quantity
     */
    push_fraction(species_id, size_bin_id, liberation_class_id, texture_profile_id, quantity) {
        const ret = wasm.wasmpackedsolidstate_push_fraction(this.__wbg_ptr, species_id, size_bin_id, liberation_class_id, texture_profile_id, quantity);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @returns {Float64Array}
     */
    quantities() {
        const ret = wasm.wasmpackedsolidstate_quantities(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @param {number} factor
     */
    scale_in_place(factor) {
        const ret = wasm.wasmpackedsolidstate_scale_in_place(this.__wbg_ptr, factor);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @returns {Uint8Array}
     */
    size_bin_ids() {
        const ret = wasm.wasmpackedsolidstate_size_bin_ids(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint16Array}
     */
    species_ids() {
        const ret = wasm.wasmpackedsolidstate_species_ids(this.__wbg_ptr);
        var v1 = getArrayU16FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 2, 2);
        return v1;
    }
    /**
     * @returns {Uint32Array}
     */
    texture_profile_ids() {
        const ret = wasm.wasmpackedsolidstate_texture_profile_ids(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {number}
     */
    total_quantity() {
        const ret = wasm.wasmpackedsolidstate_total_quantity(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) WasmPackedSolidState.prototype[Symbol.dispose] = WasmPackedSolidState.prototype.free;

export class WasmPackedSplitter {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPackedSplitterFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpackedsplitter_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    input_total_mass_flow_kg_per_second() {
        const ret = wasm.wasmpackedsplitter_input_total_mass_flow_kg_per_second(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {string}
     */
    last_error() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmpackedsplitter_last_error(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} split_fraction_to_a
     * @param {number} throughput_kg_per_second
     * @param {boolean} enabled
     */
    constructor(split_fraction_to_a, throughput_kg_per_second, enabled) {
        const ret = wasm.wasmpackedsplitter_new(split_fraction_to_a, throughput_kg_per_second, enabled);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        WasmPackedSplitterFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {string}
     */
    operating_state() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmpackedsplitter_operating_state(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    output_a_specific_sensible_enthalpy_j_per_kg() {
        const ret = wasm.wasmpackedsplitter_output_a_specific_sensible_enthalpy_j_per_kg(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    output_a_total_mass_flow_kg_per_second() {
        const ret = wasm.wasmpackedsplitter_output_a_total_mass_flow_kg_per_second(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    output_b_specific_sensible_enthalpy_j_per_kg() {
        const ret = wasm.wasmpackedsplitter_output_b_specific_sensible_enthalpy_j_per_kg(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    output_b_total_mass_flow_kg_per_second() {
        const ret = wasm.wasmpackedsplitter_output_b_total_mass_flow_kg_per_second(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {boolean} enabled
     */
    set_enabled(enabled) {
        wasm.wasmpackedsplitter_set_enabled(this.__wbg_ptr, enabled);
    }
    /**
     * @param {WasmPackedHopper} source
     * @param {WasmPackedHopper} output_a
     * @param {WasmPackedHopper} output_b
     * @param {WasmPackedThermalTable} thermal
     * @param {number} dt
     * @returns {number}
     */
    tick_hopper_to_hoppers(source, output_a, output_b, thermal, dt) {
        _assertClass(source, WasmPackedHopper);
        _assertClass(output_a, WasmPackedHopper);
        _assertClass(output_b, WasmPackedHopper);
        _assertClass(thermal, WasmPackedThermalTable);
        const ret = wasm.wasmpackedsplitter_tick_hopper_to_hoppers(this.__wbg_ptr, source.__wbg_ptr, output_a.__wbg_ptr, output_b.__wbg_ptr, thermal.__wbg_ptr, dt);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
}
if (Symbol.dispose) WasmPackedSplitter.prototype[Symbol.dispose] = WasmPackedSplitter.prototype.free;

/**
 * Thermal property model used by the gas/thermal migration path. It wraps the
 * same runtime-local constant-Cp table type already used by Rust routing.
 */
export class WasmPackedThermalModel {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPackedThermalModelFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpackedthermalmodel_free(ptr, 0);
    }
    constructor() {
        const ret = wasm.wasmpackedthermalmodel_new();
        this.__wbg_ptr = ret;
        WasmPackedThermalModelFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {number} species_id
     * @param {number} value
     */
    set_specific_heat_capacity_j_per_kg_k(species_id, value) {
        const ret = wasm.wasmpackedthermalmodel_set_specific_heat_capacity_j_per_kg_k(this.__wbg_ptr, species_id, value);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
}
if (Symbol.dispose) WasmPackedThermalModel.prototype[Symbol.dispose] = WasmPackedThermalModel.prototype.free;

/**
 * Runtime-local thermal property table used by routing kernels that must match
 * the production constant-Cp equilibrium-energy calculation.
 */
export class WasmPackedThermalTable {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPackedThermalTableFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpackedthermaltable_free(ptr, 0);
    }
    constructor() {
        const ret = wasm.wasmpackedthermaltable_new();
        this.__wbg_ptr = ret;
        WasmPackedThermalTableFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {number} species_id
     * @param {number} value
     */
    set_specific_heat_capacity_j_per_kg_k(species_id, value) {
        const ret = wasm.wasmpackedthermaltable_set_specific_heat_capacity_j_per_kg_k(this.__wbg_ptr, species_id, value);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
}
if (Symbol.dispose) WasmPackedThermalTable.prototype[Symbol.dispose] = WasmPackedThermalTable.prototype.free;

/**
 * Browser adapter for the complete packed graph/world runtime. Setup calls are
 * intentionally bulk-oriented and happen when compiling/importing a world. Once
 * sealed, normal simulation advances through one `tick_fixed()` call; no
 * per-apparatus or per-fraction JavaScript loop is required.
 */
export class WasmPackedWorldRuntime {
    static __wrap(ptr) {
        const obj = Object.create(WasmPackedWorldRuntime.prototype);
        obj.__wbg_ptr = ptr;
        WasmPackedWorldRuntimeFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPackedWorldRuntimeFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpackedworldruntime_free(ptr, 0);
    }
    /**
     * @param {number} transfer_id
     * @param {number} source_hopper_id
     * @param {number} target_hopper_id
     * @param {number} capacity_kg_per_second
     * @param {number} priority
     * @param {number} ordinal
     */
    add_boundary_transfer(transfer_id, source_hopper_id, target_hopper_id, capacity_kg_per_second, priority, ordinal) {
        const ret = wasm.wasmpackedworldruntime_add_boundary_transfer(this.__wbg_ptr, transfer_id, source_hopper_id, target_hopper_id, capacity_kg_per_second, priority, ordinal);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} site_id
     * @param {number} node_id
     * @param {number} ordinal
     * @param {number} equipment_kind
     * @param {number} target_size_id
     * @param {number} target_particle_size_mm
     * @param {number} throughput_kg_per_second
     * @param {number} rated_power_kw
     * @param {boolean} enabled
     * @param {number} input_hopper_id
     * @param {number} output_hopper_id
     */
    add_comminution(site_id, node_id, ordinal, equipment_kind, target_size_id, target_particle_size_mm, throughput_kg_per_second, rated_power_kw, enabled, input_hopper_id, output_hopper_id) {
        const ret = wasm.wasmpackedworldruntime_add_comminution(this.__wbg_ptr, site_id, node_id, ordinal, equipment_kind, target_size_id, target_particle_size_mm, throughput_kg_per_second, rated_power_kw, enabled, input_hopper_id, output_hopper_id);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} runtime_id
     * @param {number} order_index
     */
    add_comminution_liberation_class(runtime_id, order_index) {
        wasm.wasmpackedworldruntime_add_comminution_liberation_class(this.__wbg_ptr, runtime_id, order_index);
    }
    /**
     * @param {number} runtime_id
     * @param {number} order_index
     * @param {number} max_mm
     * @param {number} representative_mm
     * @param {boolean} canonical
     */
    add_comminution_size_bin(runtime_id, order_index, max_mm, representative_mm, canonical) {
        const ret = wasm.wasmpackedworldruntime_add_comminution_size_bin(this.__wbg_ptr, runtime_id, order_index, max_mm, representative_mm, canonical);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} node_id
     * @param {Uint16Array} species_ids
     * @param {Float64Array} quantities
     * @param {number} sensible_enthalpy_j
     */
    add_exhaust_vent_state(node_id, species_ids, quantities, sensible_enthalpy_j) {
        const ptr0 = passArray16ToWasm0(species_ids, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF64ToWasm0(quantities, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmpackedworldruntime_add_exhaust_vent_state(this.__wbg_ptr, node_id, ptr0, len0, ptr1, len1, sensible_enthalpy_j);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} site_id
     * @param {number} node_id
     * @param {number} ordinal
     * @param {number} rate_kg_per_second
     * @param {boolean} enabled
     * @param {number} occurrence_id
     * @param {number} output_hopper_id
     */
    add_extractor(site_id, node_id, ordinal, rate_kg_per_second, enabled, occurrence_id, output_hopper_id) {
        const ret = wasm.wasmpackedworldruntime_add_extractor(this.__wbg_ptr, site_id, node_id, ordinal, rate_kg_per_second, enabled, occurrence_id, output_hopper_id);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} site_id
     * @param {number} node_id
     * @param {number} ordinal
     * @param {number} flow_rate_kg_per_second
     * @param {number} throughput_kg_per_second
     * @param {boolean} enabled
     * @param {number} input_hopper_id
     * @param {number} output_target_kind
     * @param {number} output_target_id
     */
    add_feeder(site_id, node_id, ordinal, flow_rate_kg_per_second, throughput_kg_per_second, enabled, input_hopper_id, output_target_kind, output_target_id) {
        const ret = wasm.wasmpackedworldruntime_add_feeder(this.__wbg_ptr, site_id, node_id, ordinal, flow_rate_kg_per_second, throughput_kg_per_second, enabled, input_hopper_id, output_target_kind, output_target_id);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} node_id
     * @param {number} capacity_kg
     * @param {Uint16Array} species_ids
     * @param {Uint8Array} size_bin_ids
     * @param {Uint8Array} liberation_class_ids
     * @param {Uint32Array} texture_profile_ids
     * @param {Float64Array} quantities
     * @param {number} sensible_enthalpy_j
     */
    add_hopper_state(node_id, capacity_kg, species_ids, size_bin_ids, liberation_class_ids, texture_profile_ids, quantities, sensible_enthalpy_j) {
        const ptr0 = passArray16ToWasm0(species_ids, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(size_bin_ids, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray8ToWasm0(liberation_class_ids, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArray32ToWasm0(texture_profile_ids, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passArrayF64ToWasm0(quantities, wasm.__wbindgen_malloc);
        const len4 = WASM_VECTOR_LEN;
        const ret = wasm.wasmpackedworldruntime_add_hopper_state(this.__wbg_ptr, node_id, capacity_kg, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, sensible_enthalpy_j);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} site_id
     * @param {number} node_id
     * @param {number} ordinal
     * @param {number} field_strength
     * @param {number} max_feed_particle_size_mm
     * @param {number} throughput_kg_per_second
     * @param {boolean} enabled
     * @param {number} input_hopper_id
     * @param {number} concentrate_hopper_id
     * @param {number} tailings_hopper_id
     */
    add_magnetic_separator(site_id, node_id, ordinal, field_strength, max_feed_particle_size_mm, throughput_kg_per_second, enabled, input_hopper_id, concentrate_hopper_id, tailings_hopper_id) {
        const ret = wasm.wasmpackedworldruntime_add_magnetic_separator(this.__wbg_ptr, site_id, node_id, ordinal, field_strength, max_feed_particle_size_mm, throughput_kg_per_second, enabled, input_hopper_id, concentrate_hopper_id, tailings_hopper_id);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} site_id
     * @param {number} node_id
     * @param {number} ordinal
     * @param {number} throughput_kg_per_second
     * @param {boolean} enabled
     * @param {number} input_a_hopper_id
     * @param {number} input_b_hopper_id
     * @param {number} output_hopper_id
     */
    add_merger(site_id, node_id, ordinal, throughput_kg_per_second, enabled, input_a_hopper_id, input_b_hopper_id, output_hopper_id) {
        const ret = wasm.wasmpackedworldruntime_add_merger(this.__wbg_ptr, site_id, node_id, ordinal, throughput_kg_per_second, enabled, input_a_hopper_id, input_b_hopper_id, output_hopper_id);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} occurrence_id
     * @param {Uint16Array} species_ids
     * @param {Uint8Array} size_bin_ids
     * @param {Uint8Array} liberation_class_ids
     * @param {Uint32Array} texture_profile_ids
     * @param {Float64Array} quantities_per_kg
     * @param {boolean} finite_reserve
     * @param {number} reserve_mass_kg
     */
    add_occurrence_state(occurrence_id, species_ids, size_bin_ids, liberation_class_ids, texture_profile_ids, quantities_per_kg, finite_reserve, reserve_mass_kg) {
        const ptr0 = passArray16ToWasm0(species_ids, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(size_bin_ids, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray8ToWasm0(liberation_class_ids, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArray32ToWasm0(texture_profile_ids, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passArrayF64ToWasm0(quantities_per_kg, wasm.__wbindgen_malloc);
        const len4 = WASM_VECTOR_LEN;
        const ret = wasm.wasmpackedworldruntime_add_occurrence_state(this.__wbg_ptr, occurrence_id, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, finite_reserve, reserve_mass_kg);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} site_id
     * @param {number} node_id
     * @param {number} ordinal
     * @param {number} temperature_setpoint_k
     * @param {number} rated_heater_power_kw
     * @param {number} maximum_operating_temperature_k
     * @param {number} maximum_solid_throughput_kg_per_second
     * @param {number} effective_chamber_hold_up_kg
     * @param {number} heat_loss_coefficient_w_per_k
     * @param {number} internal_zone_count
     * @param {boolean} enabled
     * @param {number} product_target_kind
     * @param {number} product_target_id
     * @param {number} gas_vent_id
     */
    add_roasting_furnace(site_id, node_id, ordinal, temperature_setpoint_k, rated_heater_power_kw, maximum_operating_temperature_k, maximum_solid_throughput_kg_per_second, effective_chamber_hold_up_kg, heat_loss_coefficient_w_per_k, internal_zone_count, enabled, product_target_kind, product_target_id, gas_vent_id) {
        const ret = wasm.wasmpackedworldruntime_add_roasting_furnace(this.__wbg_ptr, site_id, node_id, ordinal, temperature_setpoint_k, rated_heater_power_kw, maximum_operating_temperature_k, maximum_solid_throughput_kg_per_second, effective_chamber_hold_up_kg, heat_loss_coefficient_w_per_k, internal_zone_count, enabled, product_target_kind, product_target_id, gas_vent_id);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} site_id
     * @param {number} node_id
     * @param {number} ordinal
     * @param {number} aperture_size_mm
     * @param {number} throughput_kg_per_second
     * @param {boolean} enabled
     * @param {number} input_hopper_id
     * @param {number} undersize_hopper_id
     * @param {number} oversize_hopper_id
     */
    add_screen(site_id, node_id, ordinal, aperture_size_mm, throughput_kg_per_second, enabled, input_hopper_id, undersize_hopper_id, oversize_hopper_id) {
        const ret = wasm.wasmpackedworldruntime_add_screen(this.__wbg_ptr, site_id, node_id, ordinal, aperture_size_mm, throughput_kg_per_second, enabled, input_hopper_id, undersize_hopper_id, oversize_hopper_id);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} runtime_id
     * @param {number} recovery_factor
     */
    add_separation_liberation_class(runtime_id, recovery_factor) {
        const ret = wasm.wasmpackedworldruntime_add_separation_liberation_class(this.__wbg_ptr, runtime_id, recovery_factor);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} runtime_id
     * @param {number} max_mm
     * @param {number} magnetic_suitability
     */
    add_separation_size_bin(runtime_id, max_mm, magnetic_suitability) {
        const ret = wasm.wasmpackedworldruntime_add_separation_size_bin(this.__wbg_ptr, runtime_id, max_mm, magnetic_suitability);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} site_id
     */
    add_site(site_id) {
        const ret = wasm.wasmpackedworldruntime_add_site(this.__wbg_ptr, site_id);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} site_id
     * @param {number} source_hopper_id
     * @param {number} target_hopper_id
     * @param {number} rate_kg_per_second
     */
    add_site_passive_storage_link(site_id, source_hopper_id, target_hopper_id, rate_kg_per_second) {
        const ret = wasm.wasmpackedworldruntime_add_site_passive_storage_link(this.__wbg_ptr, site_id, source_hopper_id, target_hopper_id, rate_kg_per_second);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} site_id
     * @param {number} node_id
     * @param {number} ordinal
     * @param {number} split_fraction_to_a
     * @param {number} throughput_kg_per_second
     * @param {boolean} enabled
     * @param {number} input_hopper_id
     * @param {number} output_a_hopper_id
     * @param {number} output_b_hopper_id
     */
    add_splitter(site_id, node_id, ordinal, split_fraction_to_a, throughput_kg_per_second, enabled, input_hopper_id, output_a_hopper_id, output_b_hopper_id) {
        const ret = wasm.wasmpackedworldruntime_add_splitter(this.__wbg_ptr, site_id, node_id, ordinal, split_fraction_to_a, throughput_kg_per_second, enabled, input_hopper_id, output_a_hopper_id, output_b_hopper_id);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} steps
     * @returns {number}
     */
    advance_fixed_steps(steps) {
        const ret = wasm.wasmpackedworldruntime_advance_fixed_steps(this.__wbg_ptr, steps);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * @param {number} source_species_id
     * @param {number} solid_product_species_id
     * @param {number} gas_product_species_id
     * @param {number} source_mass_per_extent_kg
     * @param {number} solid_product_mass_per_extent_kg
     * @param {number} gas_product_mass_per_extent_kg
     * @param {number} reaction_enthalpy_j_per_mol_extent
     * @param {number} activation_energy_j_per_mol
     * @param {number} pre_exponential_factor_per_second
     */
    begin_goethite_reaction(source_species_id, solid_product_species_id, gas_product_species_id, source_mass_per_extent_kg, solid_product_mass_per_extent_kg, gas_product_mass_per_extent_kg, reaction_enthalpy_j_per_mol_extent, activation_energy_j_per_mol, pre_exponential_factor_per_second) {
        const ret = wasm.wasmpackedworldruntime_begin_goethite_reaction(this.__wbg_ptr, source_species_id, solid_product_species_id, gas_product_species_id, source_mass_per_extent_kg, solid_product_mass_per_extent_kg, gas_product_mass_per_extent_kg, reaction_enthalpy_j_per_mol_extent, activation_energy_j_per_mol, pre_exponential_factor_per_second);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    begin_live_reconfigure() {
        wasm.wasmpackedworldruntime_begin_live_reconfigure(this.__wbg_ptr);
    }
    /**
     * @param {number} transfer_id
     * @returns {number}
     */
    boundary_last_moved_kg(transfer_id) {
        const ret = wasm.wasmpackedworldruntime_boundary_last_moved_kg(this.__wbg_ptr, transfer_id);
        return ret;
    }
    /**
     * @param {number} transfer_id
     * @returns {number}
     */
    boundary_last_rate_kg_per_second(transfer_id) {
        const ret = wasm.wasmpackedworldruntime_boundary_last_rate_kg_per_second(this.__wbg_ptr, transfer_id);
        return ret;
    }
    /**
     * @returns {WasmPackedWorldRuntime}
     */
    clone_for_live_reconfigure() {
        const ret = wasm.wasmpackedworldruntime_clone_for_live_reconfigure(this.__wbg_ptr);
        return WasmPackedWorldRuntime.__wrap(ret);
    }
    commit_goethite_reaction() {
        const ret = wasm.wasmpackedworldruntime_commit_goethite_reaction(this.__wbg_ptr);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @returns {number}
     */
    elapsed_seconds() {
        const ret = wasm.wasmpackedworldruntime_elapsed_seconds(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} node_id
     * @returns {Float64Array}
     */
    exhaust_vent_quantities(node_id) {
        const ret = wasm.wasmpackedworldruntime_exhaust_vent_quantities(this.__wbg_ptr, node_id);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @param {number} node_id
     * @returns {number}
     */
    exhaust_vent_sensible_enthalpy_j(node_id) {
        const ret = wasm.wasmpackedworldruntime_exhaust_vent_sensible_enthalpy_j(this.__wbg_ptr, node_id);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
    /**
     * @param {number} node_id
     * @returns {Uint16Array}
     */
    exhaust_vent_species_ids(node_id) {
        const ret = wasm.wasmpackedworldruntime_exhaust_vent_species_ids(this.__wbg_ptr, node_id);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU16FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 2, 2);
        return v1;
    }
    /**
     * @param {number} node_id
     * @returns {number}
     */
    exhaust_vent_temperature_k(node_id) {
        const ret = wasm.wasmpackedworldruntime_exhaust_vent_temperature_k(this.__wbg_ptr, node_id);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
    /**
     * @param {Uint32Array} active_machine_ids
     */
    finish_live_reconfigure(active_machine_ids) {
        const ptr0 = passArray32ToWasm0(active_machine_ids, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmpackedworldruntime_finish_live_reconfigure(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} node_id
     * @returns {number}
     */
    furnace_actual_charge_temperature_k(node_id) {
        const ret = wasm.wasmpackedworldruntime_furnace_actual_charge_temperature_k(this.__wbg_ptr, node_id);
        return ret;
    }
    /**
     * @param {number} node_id
     * @returns {number}
     */
    furnace_charge_mass_kg(node_id) {
        const ret = wasm.wasmpackedworldruntime_furnace_charge_mass_kg(this.__wbg_ptr, node_id);
        return ret;
    }
    /**
     * @param {number} node_id
     * @returns {number}
     */
    furnace_last_feed_rate_kg_per_second(node_id) {
        const ret = wasm.wasmpackedworldruntime_furnace_last_feed_rate_kg_per_second(this.__wbg_ptr, node_id);
        return ret;
    }
    /**
     * @param {number} node_id
     * @returns {number}
     */
    furnace_last_goethite_conversion_fraction(node_id) {
        const ret = wasm.wasmpackedworldruntime_furnace_last_goethite_conversion_fraction(this.__wbg_ptr, node_id);
        return ret;
    }
    /**
     * @param {number} node_id
     * @returns {number}
     */
    furnace_last_heat_loss_power_kw(node_id) {
        const ret = wasm.wasmpackedworldruntime_furnace_last_heat_loss_power_kw(this.__wbg_ptr, node_id);
        return ret;
    }
    /**
     * @param {number} node_id
     * @returns {number}
     */
    furnace_last_heater_power_kw(node_id) {
        const ret = wasm.wasmpackedworldruntime_furnace_last_heater_power_kw(this.__wbg_ptr, node_id);
        return ret;
    }
    /**
     * @param {number} node_id
     * @returns {number}
     */
    furnace_last_product_rate_kg_per_second(node_id) {
        const ret = wasm.wasmpackedworldruntime_furnace_last_product_rate_kg_per_second(this.__wbg_ptr, node_id);
        return ret;
    }
    /**
     * @param {number} node_id
     * @returns {number}
     */
    furnace_last_reaction_power_kw(node_id) {
        const ret = wasm.wasmpackedworldruntime_furnace_last_reaction_power_kw(this.__wbg_ptr, node_id);
        return ret;
    }
    /**
     * @param {number} node_id
     * @returns {number}
     */
    furnace_last_solver_evaluation_count(node_id) {
        const ret = wasm.wasmpackedworldruntime_furnace_last_solver_evaluation_count(this.__wbg_ptr, node_id);
        return ret >>> 0;
    }
    /**
     * @param {number} node_id
     * @returns {number}
     */
    furnace_pending_feed_mass_kg(node_id) {
        const ret = wasm.wasmpackedworldruntime_furnace_pending_feed_mass_kg(this.__wbg_ptr, node_id);
        return ret;
    }
    /**
     * @param {number} node_id
     * @returns {number}
     */
    furnace_zone_count(node_id) {
        const ret = wasm.wasmpackedworldruntime_furnace_zone_count(this.__wbg_ptr, node_id);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * @param {number} node_id
     * @param {number} zone_index
     * @returns {Uint8Array}
     */
    furnace_zone_liberation_class_ids(node_id, zone_index) {
        const ret = wasm.wasmpackedworldruntime_furnace_zone_liberation_class_ids(this.__wbg_ptr, node_id, zone_index);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @param {number} node_id
     * @param {number} zone_index
     * @returns {number}
     */
    furnace_zone_mass_kg(node_id, zone_index) {
        const ret = wasm.wasmpackedworldruntime_furnace_zone_mass_kg(this.__wbg_ptr, node_id, zone_index);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
    /**
     * @param {number} node_id
     * @param {number} zone_index
     * @returns {Float64Array}
     */
    furnace_zone_quantities(node_id, zone_index) {
        const ret = wasm.wasmpackedworldruntime_furnace_zone_quantities(this.__wbg_ptr, node_id, zone_index);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @param {number} node_id
     * @param {number} zone_index
     * @returns {number}
     */
    furnace_zone_sensible_enthalpy_j(node_id, zone_index) {
        const ret = wasm.wasmpackedworldruntime_furnace_zone_sensible_enthalpy_j(this.__wbg_ptr, node_id, zone_index);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
    /**
     * @param {number} node_id
     * @param {number} zone_index
     * @returns {Uint8Array}
     */
    furnace_zone_size_bin_ids(node_id, zone_index) {
        const ret = wasm.wasmpackedworldruntime_furnace_zone_size_bin_ids(this.__wbg_ptr, node_id, zone_index);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @param {number} node_id
     * @param {number} zone_index
     * @returns {Uint16Array}
     */
    furnace_zone_species_ids(node_id, zone_index) {
        const ret = wasm.wasmpackedworldruntime_furnace_zone_species_ids(this.__wbg_ptr, node_id, zone_index);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU16FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 2, 2);
        return v1;
    }
    /**
     * @param {number} node_id
     * @param {number} zone_index
     * @returns {number}
     */
    furnace_zone_temperature_k(node_id, zone_index) {
        const ret = wasm.wasmpackedworldruntime_furnace_zone_temperature_k(this.__wbg_ptr, node_id, zone_index);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
    /**
     * @param {number} node_id
     * @param {number} zone_index
     * @returns {Uint32Array}
     */
    furnace_zone_texture_profile_ids(node_id, zone_index) {
        const ret = wasm.wasmpackedworldruntime_furnace_zone_texture_profile_ids(this.__wbg_ptr, node_id, zone_index);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @param {number} node_id
     * @returns {Uint8Array}
     */
    hopper_liberation_class_ids(node_id) {
        const ret = wasm.wasmpackedworldruntime_hopper_liberation_class_ids(this.__wbg_ptr, node_id);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @param {number} node_id
     * @returns {Float64Array}
     */
    hopper_quantities(node_id) {
        const ret = wasm.wasmpackedworldruntime_hopper_quantities(this.__wbg_ptr, node_id);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @param {number} node_id
     * @returns {number}
     */
    hopper_sensible_enthalpy_j(node_id) {
        const ret = wasm.wasmpackedworldruntime_hopper_sensible_enthalpy_j(this.__wbg_ptr, node_id);
        return ret;
    }
    /**
     * @param {number} node_id
     * @returns {Uint8Array}
     */
    hopper_size_bin_ids(node_id) {
        const ret = wasm.wasmpackedworldruntime_hopper_size_bin_ids(this.__wbg_ptr, node_id);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @param {number} node_id
     * @returns {Uint16Array}
     */
    hopper_species_ids(node_id) {
        const ret = wasm.wasmpackedworldruntime_hopper_species_ids(this.__wbg_ptr, node_id);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU16FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 2, 2);
        return v1;
    }
    /**
     * @param {number} node_id
     * @returns {number}
     */
    hopper_stored_mass_kg(node_id) {
        const ret = wasm.wasmpackedworldruntime_hopper_stored_mass_kg(this.__wbg_ptr, node_id);
        return ret;
    }
    /**
     * @param {number} node_id
     * @returns {number}
     */
    hopper_temperature_k(node_id) {
        const ret = wasm.wasmpackedworldruntime_hopper_temperature_k(this.__wbg_ptr, node_id);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
    /**
     * @param {number} node_id
     * @returns {Uint32Array}
     */
    hopper_texture_profile_ids(node_id) {
        const ret = wasm.wasmpackedworldruntime_hopper_texture_profile_ids(this.__wbg_ptr, node_id);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @param {number} node_id
     * @param {Uint32Array} zone_lengths
     * @param {Uint16Array} zone_species_ids
     * @param {Uint8Array} zone_size_bin_ids
     * @param {Uint8Array} zone_liberation_class_ids
     * @param {Uint32Array} zone_texture_profile_ids
     * @param {Float64Array} zone_quantities
     * @param {Float64Array} zone_sensible_enthalpies_j
     * @param {Uint16Array} pending_species_ids
     * @param {Uint8Array} pending_size_bin_ids
     * @param {Uint8Array} pending_liberation_class_ids
     * @param {Uint32Array} pending_texture_profile_ids
     * @param {Float64Array} pending_quantities
     * @param {number} pending_sensible_enthalpy_j
     * @param {Uint16Array} gas_species_ids
     * @param {Float64Array} gas_quantities
     * @param {number} gas_sensible_enthalpy_j
     */
    import_roasting_furnace_state(node_id, zone_lengths, zone_species_ids, zone_size_bin_ids, zone_liberation_class_ids, zone_texture_profile_ids, zone_quantities, zone_sensible_enthalpies_j, pending_species_ids, pending_size_bin_ids, pending_liberation_class_ids, pending_texture_profile_ids, pending_quantities, pending_sensible_enthalpy_j, gas_species_ids, gas_quantities, gas_sensible_enthalpy_j) {
        const ptr0 = passArray32ToWasm0(zone_lengths, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray16ToWasm0(zone_species_ids, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray8ToWasm0(zone_size_bin_ids, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArray8ToWasm0(zone_liberation_class_ids, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passArray32ToWasm0(zone_texture_profile_ids, wasm.__wbindgen_malloc);
        const len4 = WASM_VECTOR_LEN;
        const ptr5 = passArrayF64ToWasm0(zone_quantities, wasm.__wbindgen_malloc);
        const len5 = WASM_VECTOR_LEN;
        const ptr6 = passArrayF64ToWasm0(zone_sensible_enthalpies_j, wasm.__wbindgen_malloc);
        const len6 = WASM_VECTOR_LEN;
        const ptr7 = passArray16ToWasm0(pending_species_ids, wasm.__wbindgen_malloc);
        const len7 = WASM_VECTOR_LEN;
        const ptr8 = passArray8ToWasm0(pending_size_bin_ids, wasm.__wbindgen_malloc);
        const len8 = WASM_VECTOR_LEN;
        const ptr9 = passArray8ToWasm0(pending_liberation_class_ids, wasm.__wbindgen_malloc);
        const len9 = WASM_VECTOR_LEN;
        const ptr10 = passArray32ToWasm0(pending_texture_profile_ids, wasm.__wbindgen_malloc);
        const len10 = WASM_VECTOR_LEN;
        const ptr11 = passArrayF64ToWasm0(pending_quantities, wasm.__wbindgen_malloc);
        const len11 = WASM_VECTOR_LEN;
        const ptr12 = passArray16ToWasm0(gas_species_ids, wasm.__wbindgen_malloc);
        const len12 = WASM_VECTOR_LEN;
        const ptr13 = passArrayF64ToWasm0(gas_quantities, wasm.__wbindgen_malloc);
        const len13 = WASM_VECTOR_LEN;
        const ret = wasm.wasmpackedworldruntime_import_roasting_furnace_state(this.__wbg_ptr, node_id, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5, ptr6, len6, ptr7, len7, ptr8, len8, ptr9, len9, ptr10, len10, ptr11, len11, pending_sensible_enthalpy_j, ptr12, len12, ptr13, len13, gas_sensible_enthalpy_j);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} site_id
     * @param {number} elapsed_seconds
     * @param {number} extracted_kg
     */
    import_site_stats(site_id, elapsed_seconds, extracted_kg) {
        const ret = wasm.wasmpackedworldruntime_import_site_stats(this.__wbg_ptr, site_id, elapsed_seconds, extracted_kg);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} value
     */
    import_world_elapsed_seconds(value) {
        const ret = wasm.wasmpackedworldruntime_import_world_elapsed_seconds(this.__wbg_ptr, value);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    constructor() {
        const ret = wasm.wasmpackedworldruntime_new();
        this.__wbg_ptr = ret;
        WasmPackedWorldRuntimeFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {number}
     */
    no_runtime_id() {
        const ret = wasm.wasmpackedworldruntime_no_runtime_id(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} node_id
     * @param {number} input_index
     * @returns {number}
     */
    node_input_mass_flow_kg_per_second(node_id, input_index) {
        const ret = wasm.wasmpackedworldruntime_node_input_mass_flow_kg_per_second(this.__wbg_ptr, node_id, input_index);
        return ret;
    }
    /**
     * @param {number} node_id
     * @returns {string}
     */
    node_last_error(node_id) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmpackedworldruntime_node_last_error(this.__wbg_ptr, node_id);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} node_id
     * @returns {string}
     */
    node_operating_state(node_id) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmpackedworldruntime_node_operating_state(this.__wbg_ptr, node_id);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} node_id
     * @param {number} output_index
     * @returns {number}
     */
    node_output_mass_flow_kg_per_second(node_id, output_index) {
        const ret = wasm.wasmpackedworldruntime_node_output_mass_flow_kg_per_second(this.__wbg_ptr, node_id, output_index);
        return ret;
    }
    /**
     * @param {number} occurrence_id
     * @returns {number}
     */
    occurrence_extracted_mass_kg(occurrence_id) {
        const ret = wasm.wasmpackedworldruntime_occurrence_extracted_mass_kg(this.__wbg_ptr, occurrence_id);
        return ret;
    }
    /**
     * @param {number} occurrence_id
     * @returns {number}
     */
    occurrence_remaining_mass_kg(occurrence_id) {
        const ret = wasm.wasmpackedworldruntime_occurrence_remaining_mass_kg(this.__wbg_ptr, occurrence_id);
        return ret;
    }
    pause() {
        wasm.wasmpackedworldruntime_pause(this.__wbg_ptr);
    }
    /**
     * @param {number} node_id
     */
    remove_exhaust_vent_live(node_id) {
        wasm.wasmpackedworldruntime_remove_exhaust_vent_live(this.__wbg_ptr, node_id);
    }
    /**
     * @param {number} node_id
     */
    remove_hopper_if_empty_live(node_id) {
        const ret = wasm.wasmpackedworldruntime_remove_hopper_if_empty_live(this.__wbg_ptr, node_id);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} node_id
     * @param {Uint16Array} species_ids
     * @param {Float64Array} quantities
     * @param {number} sensible_enthalpy_j
     */
    replace_exhaust_vent_state_live(node_id, species_ids, quantities, sensible_enthalpy_j) {
        const ptr0 = passArray16ToWasm0(species_ids, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF64ToWasm0(quantities, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmpackedworldruntime_replace_exhaust_vent_state_live(this.__wbg_ptr, node_id, ptr0, len0, ptr1, len1, sensible_enthalpy_j);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} node_id
     * @param {number} capacity_kg
     * @param {Uint16Array} species_ids
     * @param {Uint8Array} size_bin_ids
     * @param {Uint8Array} liberation_class_ids
     * @param {Uint32Array} texture_profile_ids
     * @param {Float64Array} quantities
     * @param {number} sensible_enthalpy_j
     */
    replace_hopper_state_live(node_id, capacity_kg, species_ids, size_bin_ids, liberation_class_ids, texture_profile_ids, quantities, sensible_enthalpy_j) {
        const ptr0 = passArray16ToWasm0(species_ids, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(size_bin_ids, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray8ToWasm0(liberation_class_ids, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArray32ToWasm0(texture_profile_ids, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passArrayF64ToWasm0(quantities, wasm.__wbindgen_malloc);
        const len4 = WASM_VECTOR_LEN;
        const ret = wasm.wasmpackedworldruntime_replace_hopper_state_live(this.__wbg_ptr, node_id, capacity_kg, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, sensible_enthalpy_j);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    resume() {
        wasm.wasmpackedworldruntime_resume(this.__wbg_ptr);
    }
    /**
     * @returns {boolean}
     */
    running() {
        const ret = wasm.wasmpackedworldruntime_running(this.__wbg_ptr);
        return ret !== 0;
    }
    seal() {
        wasm.wasmpackedworldruntime_seal(this.__wbg_ptr);
    }
    /**
     * @param {number} runtime_id
     */
    set_comminution_legacy_lt_one_mm_id(runtime_id) {
        wasm.wasmpackedworldruntime_set_comminution_legacy_lt_one_mm_id(this.__wbg_ptr, runtime_id);
    }
    /**
     * @param {number} texture_profile_id
     * @param {number} species_id
     * @param {number} d10_um
     * @param {number} d50_um
     * @param {number} d90_um
     * @param {number} free
     * @param {number} boundary
     * @param {number} intergrown
     * @param {number} included
     */
    set_comminution_species_texture(texture_profile_id, species_id, d10_um, d50_um, d90_um, free, boundary, intergrown, included) {
        const ret = wasm.wasmpackedworldruntime_set_comminution_species_texture(this.__wbg_ptr, texture_profile_id, species_id, d10_um, d50_um, d90_um, free, boundary, intergrown, included);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} texture_profile_id
     * @param {number} cwi_kwh_per_t
     * @param {number} bwi_kwh_per_t
     * @param {number} abrasion_index
     */
    set_comminution_texture_properties(texture_profile_id, cwi_kwh_per_t, bwi_kwh_per_t, abrasion_index) {
        const ret = wasm.wasmpackedworldruntime_set_comminution_texture_properties(this.__wbg_ptr, texture_profile_id, cwi_kwh_per_t, bwi_kwh_per_t, abrasion_index);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} source_texture_profile_id
     * @param {number} product_texture_profile_id
     */
    set_reaction_product_texture_mapping(source_texture_profile_id, product_texture_profile_id) {
        const ret = wasm.wasmpackedworldruntime_set_reaction_product_texture_mapping(this.__wbg_ptr, source_texture_profile_id, product_texture_profile_id);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} size_bin_id
     * @param {number} factor
     */
    set_reaction_size_factor(size_bin_id, factor) {
        const ret = wasm.wasmpackedworldruntime_set_reaction_size_factor(this.__wbg_ptr, size_bin_id, factor);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} runtime_id
     * @param {number} coefficient
     */
    set_species_magnetic_response(runtime_id, coefficient) {
        const ret = wasm.wasmpackedworldruntime_set_species_magnetic_response(this.__wbg_ptr, runtime_id, coefficient);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} species_id
     * @param {number} value
     */
    set_specific_heat_capacity_j_per_kg_k(species_id, value) {
        const ret = wasm.wasmpackedworldruntime_set_specific_heat_capacity_j_per_kg_k(this.__wbg_ptr, species_id, value);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} site_id
     * @returns {number}
     */
    site_elapsed_seconds(site_id) {
        const ret = wasm.wasmpackedworldruntime_site_elapsed_seconds(this.__wbg_ptr, site_id);
        return ret;
    }
    /**
     * @param {number} site_id
     * @returns {number}
     */
    site_extracted_kg(site_id) {
        const ret = wasm.wasmpackedworldruntime_site_extracted_kg(this.__wbg_ptr, site_id);
        return ret;
    }
    /**
     * @param {number} site_id
     * @param {number} link_index
     * @returns {number}
     */
    site_passive_link_last_moved_kg(site_id, link_index) {
        const ret = wasm.wasmpackedworldruntime_site_passive_link_last_moved_kg(this.__wbg_ptr, site_id, link_index);
        return ret;
    }
    /**
     * @param {number} site_id
     * @param {number} link_index
     * @returns {number}
     */
    site_passive_link_last_rate_kg_per_second(site_id, link_index) {
        const ret = wasm.wasmpackedworldruntime_site_passive_link_last_rate_kg_per_second(this.__wbg_ptr, site_id, link_index);
        return ret;
    }
    /**
     * @returns {boolean}
     */
    tick_fixed() {
        const ret = wasm.wasmpackedworldruntime_tick_fixed(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] !== 0;
    }
    /**
     * @param {number} site_id
     * @param {number} node_id
     * @param {number} ordinal
     * @param {number} equipment_kind
     * @param {number} target_size_bin_id
     * @param {number} target_particle_size_mm
     * @param {number} throughput_kg_per_second
     * @param {number} rated_power_kw
     * @param {boolean} enabled
     * @param {number} input_hopper_id
     * @param {number} output_hopper_id
     */
    upsert_comminution_live(site_id, node_id, ordinal, equipment_kind, target_size_bin_id, target_particle_size_mm, throughput_kg_per_second, rated_power_kw, enabled, input_hopper_id, output_hopper_id) {
        const ret = wasm.wasmpackedworldruntime_upsert_comminution_live(this.__wbg_ptr, site_id, node_id, ordinal, equipment_kind, target_size_bin_id, target_particle_size_mm, throughput_kg_per_second, rated_power_kw, enabled, input_hopper_id, output_hopper_id);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} site_id
     * @param {number} node_id
     * @param {number} ordinal
     * @param {number} rate_kg_per_second
     * @param {boolean} enabled
     * @param {number} occurrence_id
     * @param {number} output_hopper_id
     */
    upsert_extractor_live(site_id, node_id, ordinal, rate_kg_per_second, enabled, occurrence_id, output_hopper_id) {
        const ret = wasm.wasmpackedworldruntime_upsert_extractor_live(this.__wbg_ptr, site_id, node_id, ordinal, rate_kg_per_second, enabled, occurrence_id, output_hopper_id);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} site_id
     * @param {number} node_id
     * @param {number} ordinal
     * @param {number} flow_rate_kg_per_second
     * @param {number} throughput_kg_per_second
     * @param {boolean} enabled
     * @param {number} input_hopper_id
     * @param {number} output_target_kind
     * @param {number} output_target_id
     */
    upsert_feeder_live(site_id, node_id, ordinal, flow_rate_kg_per_second, throughput_kg_per_second, enabled, input_hopper_id, output_target_kind, output_target_id) {
        const ret = wasm.wasmpackedworldruntime_upsert_feeder_live(this.__wbg_ptr, site_id, node_id, ordinal, flow_rate_kg_per_second, throughput_kg_per_second, enabled, input_hopper_id, output_target_kind, output_target_id);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} site_id
     * @param {number} node_id
     * @param {number} ordinal
     * @param {number} field_strength
     * @param {number} max_feed_particle_size_mm
     * @param {number} throughput_kg_per_second
     * @param {boolean} enabled
     * @param {number} input_hopper_id
     * @param {number} concentrate_hopper_id
     * @param {number} tailings_hopper_id
     */
    upsert_magnetic_separator_live(site_id, node_id, ordinal, field_strength, max_feed_particle_size_mm, throughput_kg_per_second, enabled, input_hopper_id, concentrate_hopper_id, tailings_hopper_id) {
        const ret = wasm.wasmpackedworldruntime_upsert_magnetic_separator_live(this.__wbg_ptr, site_id, node_id, ordinal, field_strength, max_feed_particle_size_mm, throughput_kg_per_second, enabled, input_hopper_id, concentrate_hopper_id, tailings_hopper_id);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} site_id
     * @param {number} node_id
     * @param {number} ordinal
     * @param {number} throughput_kg_per_second
     * @param {boolean} enabled
     * @param {number} input_a_hopper_id
     * @param {number} input_b_hopper_id
     * @param {number} output_hopper_id
     */
    upsert_merger_live(site_id, node_id, ordinal, throughput_kg_per_second, enabled, input_a_hopper_id, input_b_hopper_id, output_hopper_id) {
        const ret = wasm.wasmpackedworldruntime_upsert_merger_live(this.__wbg_ptr, site_id, node_id, ordinal, throughput_kg_per_second, enabled, input_a_hopper_id, input_b_hopper_id, output_hopper_id);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} site_id
     * @param {number} node_id
     * @param {number} ordinal
     * @param {number} temperature_setpoint_k
     * @param {number} rated_heater_power_kw
     * @param {number} maximum_operating_temperature_k
     * @param {number} maximum_solid_throughput_kg_per_second
     * @param {number} effective_chamber_hold_up_kg
     * @param {number} heat_loss_coefficient_w_per_k
     * @param {number} internal_zone_count
     * @param {boolean} enabled
     * @param {number} product_target_kind
     * @param {number} product_target_id
     * @param {number} gas_vent_id
     * @param {boolean} preserve_retained_state
     */
    upsert_roasting_furnace_live(site_id, node_id, ordinal, temperature_setpoint_k, rated_heater_power_kw, maximum_operating_temperature_k, maximum_solid_throughput_kg_per_second, effective_chamber_hold_up_kg, heat_loss_coefficient_w_per_k, internal_zone_count, enabled, product_target_kind, product_target_id, gas_vent_id, preserve_retained_state) {
        const ret = wasm.wasmpackedworldruntime_upsert_roasting_furnace_live(this.__wbg_ptr, site_id, node_id, ordinal, temperature_setpoint_k, rated_heater_power_kw, maximum_operating_temperature_k, maximum_solid_throughput_kg_per_second, effective_chamber_hold_up_kg, heat_loss_coefficient_w_per_k, internal_zone_count, enabled, product_target_kind, product_target_id, gas_vent_id, preserve_retained_state);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} site_id
     * @param {number} node_id
     * @param {number} ordinal
     * @param {number} aperture_size_mm
     * @param {number} throughput_kg_per_second
     * @param {boolean} enabled
     * @param {number} input_hopper_id
     * @param {number} undersize_hopper_id
     * @param {number} oversize_hopper_id
     */
    upsert_screen_live(site_id, node_id, ordinal, aperture_size_mm, throughput_kg_per_second, enabled, input_hopper_id, undersize_hopper_id, oversize_hopper_id) {
        const ret = wasm.wasmpackedworldruntime_upsert_screen_live(this.__wbg_ptr, site_id, node_id, ordinal, aperture_size_mm, throughput_kg_per_second, enabled, input_hopper_id, undersize_hopper_id, oversize_hopper_id);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} site_id
     * @param {number} node_id
     * @param {number} ordinal
     * @param {number} split_fraction_to_a
     * @param {number} throughput_kg_per_second
     * @param {boolean} enabled
     * @param {number} input_hopper_id
     * @param {number} output_a_hopper_id
     * @param {number} output_b_hopper_id
     */
    upsert_splitter_live(site_id, node_id, ordinal, split_fraction_to_a, throughput_kg_per_second, enabled, input_hopper_id, output_a_hopper_id, output_b_hopper_id) {
        const ret = wasm.wasmpackedworldruntime_upsert_splitter_live(this.__wbg_ptr, site_id, node_id, ordinal, split_fraction_to_a, throughput_kg_per_second, enabled, input_hopper_id, output_a_hopper_id, output_b_hopper_id);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} node_id
     * @returns {number}
     */
    vented_gas_mass_kg(node_id) {
        const ret = wasm.wasmpackedworldruntime_vented_gas_mass_kg(this.__wbg_ptr, node_id);
        return ret;
    }
}
if (Symbol.dispose) WasmPackedWorldRuntime.prototype[Symbol.dispose] = WasmPackedWorldRuntime.prototype.free;

/**
 * @returns {number}
 */
export function runtime_protocol_version() {
    const ret = wasm.runtime_protocol_version();
    return ret >>> 0;
}

/**
 * @returns {number}
 */
export function simulation_step_seconds() {
    const ret = wasm.simulation_step_seconds();
    return ret;
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_bb96b2010945f0bc: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./interlink_wasm_bg.js": import0,
    };
}

const WasmPackedComminutionMachineFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpackedcomminutionmachine_free(ptr, 1));
const WasmPackedComminutionTablesFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpackedcomminutiontables_free(ptr, 1));
const WasmPackedExtractorFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpackedextractor_free(ptr, 1));
const WasmPackedFeederFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpackedfeeder_free(ptr, 1));
const WasmPackedGasBodyFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpackedgasbody_free(ptr, 1));
const WasmPackedGasStreamFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpackedgasstream_free(ptr, 1));
const WasmPackedGoethiteReactionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpackedgoethitereaction_free(ptr, 1));
const WasmPackedHopperFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpackedhopper_free(ptr, 1));
const WasmPackedMagneticSeparatorFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpackedmagneticseparator_free(ptr, 1));
const WasmPackedMergerFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpackedmerger_free(ptr, 1));
const WasmPackedResourceOccurrenceFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpackedresourceoccurrence_free(ptr, 1));
const WasmPackedRoastingFurnaceFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpackedroastingfurnace_free(ptr, 1));
const WasmPackedScreenFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpackedscreen_free(ptr, 1));
const WasmPackedSeparationTablesFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpackedseparationtables_free(ptr, 1));
const WasmPackedSolidStateFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpackedsolidstate_free(ptr, 1));
const WasmPackedSplitterFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpackedsplitter_free(ptr, 1));
const WasmPackedThermalModelFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpackedthermalmodel_free(ptr, 1));
const WasmPackedThermalTableFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpackedthermaltable_free(ptr, 1));
const WasmPackedWorldRuntimeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpackedworldruntime_free(ptr, 1));

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}

function getArrayF64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
}

function getArrayU16FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint16ArrayMemory0().subarray(ptr / 2, ptr / 2 + len);
}

function getArrayU32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedFloat64ArrayMemory0 = null;
function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint16ArrayMemory0 = null;
function getUint16ArrayMemory0() {
    if (cachedUint16ArrayMemory0 === null || cachedUint16ArrayMemory0.byteLength === 0) {
        cachedUint16ArrayMemory0 = new Uint16Array(wasm.memory.buffer);
    }
    return cachedUint16ArrayMemory0;
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passArray16ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 2, 2) >>> 0;
    getUint16ArrayMemory0().set(arg, ptr / 2);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF64ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 8, 8) >>> 0;
    getFloat64ArrayMemory0().set(arg, ptr / 8);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedFloat64ArrayMemory0 = null;
    cachedUint16ArrayMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('interlink_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
