/* @ts-self-types="./interlink_wasm.d.ts" */

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
     * @returns {number}
     */
    profile_apparatus_total_duration_ms() {
        const ret = wasm.wasmpackedworldruntime_profile_apparatus_total_duration_ms(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} node_id
     * @returns {number}
     */
    profile_node_calls(node_id) {
        const ret = wasm.wasmpackedworldruntime_profile_node_calls(this.__wbg_ptr, node_id);
        return ret >>> 0;
    }
    /**
     * @returns {Uint32Array}
     */
    profile_node_ids() {
        const ret = wasm.wasmpackedworldruntime_profile_node_ids(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @param {number} node_id
     * @returns {number}
     */
    profile_node_max_duration_ms(node_id) {
        const ret = wasm.wasmpackedworldruntime_profile_node_max_duration_ms(this.__wbg_ptr, node_id);
        return ret;
    }
    /**
     * @param {number} node_id
     * @returns {number}
     */
    profile_node_total_duration_ms(node_id) {
        const ret = wasm.wasmpackedworldruntime_profile_node_total_duration_ms(this.__wbg_ptr, node_id);
        return ret;
    }
    /**
     * @returns {number}
     */
    profile_tick_count() {
        const ret = wasm.wasmpackedworldruntime_profile_tick_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    profile_tick_max_duration_ms() {
        const ret = wasm.wasmpackedworldruntime_profile_tick_max_duration_ms(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    profile_tick_total_duration_ms() {
        const ret = wasm.wasmpackedworldruntime_profile_tick_total_duration_ms(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {boolean}
     */
    profiling_enabled() {
        const ret = wasm.wasmpackedworldruntime_profiling_enabled(this.__wbg_ptr);
        return ret !== 0;
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
    reset_profiling_stats() {
        wasm.wasmpackedworldruntime_reset_profiling_stats(this.__wbg_ptr);
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
     * @param {boolean} enabled
     */
    set_profiling_enabled(enabled) {
        wasm.wasmpackedworldruntime_set_profiling_enabled(this.__wbg_ptr, enabled);
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
        __wbg_now_a5e43af595f1b51e: function() {
            const ret = performance.now();
            return ret;
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

const WasmPackedWorldRuntimeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpackedworldruntime_free(ptr, 1));

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
