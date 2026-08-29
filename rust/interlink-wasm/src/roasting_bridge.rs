use interlink_roasting::{
    PackedRoastingFurnaceConfig, PackedRoastingFurnaceRuntime,
};
use interlink_thermochemistry::{
    PackedGoethiteReactionConfig, PackedGoethiteReactionTables,
};
use wasm_bindgen::prelude::*;

use super::{
    js_error, WasmPackedGasBody, WasmPackedHopper, WasmPackedThermalModel,
};

/// Browser adapter for the compiled numeric goethite-dehydroxylation model.
/// Canonical reaction definitions and texture IDs are resolved in JavaScript once;
/// the per-tick solve remains entirely inside Rust.
#[wasm_bindgen]
pub struct WasmPackedGoethiteReaction {
    pub(crate) inner: PackedGoethiteReactionTables,
}

#[wasm_bindgen]
impl WasmPackedGoethiteReaction {
    #[wasm_bindgen(constructor)]
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        source_species_id: u16,
        solid_product_species_id: u16,
        gas_product_species_id: u16,
        source_mass_per_extent_kg: f64,
        solid_product_mass_per_extent_kg: f64,
        gas_product_mass_per_extent_kg: f64,
        reaction_enthalpy_j_per_mol_extent: f64,
        activation_energy_j_per_mol: f64,
        pre_exponential_factor_per_second: f64,
    ) -> Result<Self, JsValue> {
        let config = PackedGoethiteReactionConfig::new(
            source_species_id,
            solid_product_species_id,
            gas_product_species_id,
            source_mass_per_extent_kg,
            solid_product_mass_per_extent_kg,
            gas_product_mass_per_extent_kg,
            reaction_enthalpy_j_per_mol_extent,
            activation_energy_j_per_mol,
            pre_exponential_factor_per_second,
        )
        .map_err(js_error)?;
        Ok(Self {
            inner: PackedGoethiteReactionTables::new(config),
        })
    }

    pub fn set_size_factor(&mut self, size_bin_id: u8, factor: f64) -> Result<(), JsValue> {
        self.inner.set_size_factor(size_bin_id, factor).map_err(js_error)
    }

    pub fn set_product_texture_mapping(
        &mut self,
        source_texture_profile_id: u32,
        product_texture_profile_id: u32,
    ) -> Result<(), JsValue> {
        self.inner
            .set_product_texture_mapping(source_texture_profile_id, product_texture_profile_id)
            .map_err(js_error)
    }
}

/// Coarse browser adapter for a complete Rust-owned Roasting Furnace. The
/// furnace keeps all zone, pending-feed, gas-inventory, stream and diagnostic
/// state inside WASM between calls.
#[wasm_bindgen]
pub struct WasmPackedRoastingFurnace {
    inner: PackedRoastingFurnaceRuntime,
}

#[wasm_bindgen]
impl WasmPackedRoastingFurnace {
    #[wasm_bindgen(constructor)]
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        temperature_setpoint_k: f64,
        rated_heater_power_kw: f64,
        maximum_operating_temperature_k: f64,
        maximum_solid_throughput_kg_per_second: f64,
        effective_chamber_hold_up_kg: f64,
        heat_loss_coefficient_w_per_k: f64,
        internal_zone_count: usize,
        enabled: bool,
    ) -> Result<Self, JsValue> {
        let config = PackedRoastingFurnaceConfig::new(
            temperature_setpoint_k,
            rated_heater_power_kw,
            maximum_operating_temperature_k,
            maximum_solid_throughput_kg_per_second,
            effective_chamber_hold_up_kg,
            heat_loss_coefficient_w_per_k,
            internal_zone_count,
            enabled,
        )
        .map_err(js_error)?;
        Ok(Self {
            inner: PackedRoastingFurnaceRuntime::new(config),
        })
    }

    pub fn set_enabled(&mut self, enabled: bool) {
        self.inner.set_enabled(enabled);
    }

    pub fn set_temperature_setpoint_k(&mut self, value: f64) -> Result<(), JsValue> {
        self.inner.set_temperature_setpoint_k(value).map_err(js_error)
    }

    pub fn input_capacity_kg(&self, dt: f64) -> Result<f64, JsValue> {
        self.inner.input_capacity_kg(dt).map_err(js_error)
    }

    /// Migration convenience: atomically move a metered share from an existing
    /// Rust Hopper into the furnace staging buffer. The final graph scheduler can
    /// route process outputs directly without this helper.
    pub fn receive_from_hopper(
        &mut self,
        source: &mut WasmPackedHopper,
        requested_rate_kg_per_second: f64,
        dt: f64,
    ) -> Result<f64, JsValue> {
        self.inner
            .receive_from_hopper(
                &mut source.inner,
                requested_rate_kg_per_second,
                dt,
            )
            .map_err(js_error)
    }

    /// Advance one complete furnace fixed step with a solid-product Hopper and
    /// unbounded ExhaustVent gas inventory. Zone heating, reaction solves,
    /// residence movement, product backpressure and gas venting are one Rust call.
    pub fn tick_to_hopper_and_vent(
        &mut self,
        product_hopper: &mut WasmPackedHopper,
        gas_vent: &mut WasmPackedGasBody,
        thermal: &WasmPackedThermalModel,
        reaction: &WasmPackedGoethiteReaction,
        dt: f64,
    ) -> Result<f64, JsValue> {
        Ok(self
            .inner
            .tick_to_hopper_and_vent(
                Some(&mut product_hopper.inner),
                Some(&mut gas_vent.inner),
                &thermal.inner,
                &reaction.inner,
                dt,
            )
            .map_err(js_error)?
            .discharged_mass_kg)
    }

    pub fn operating_state(&self) -> String {
        self.inner.operating_state().as_str().to_string()
    }

    pub fn last_error(&self) -> String {
        self.inner.last_error().unwrap_or("").to_string()
    }

    pub fn charge_mass_kg(&self) -> f64 {
        self.inner.charge_mass_kg()
    }

    pub fn pending_feed_mass_kg(&self) -> f64 {
        self.inner.pending_feed_mass_kg()
    }

    pub fn gas_inventory_mass_kg(&self) -> f64 {
        self.inner.gas_inventory().total_mass_kg()
    }

    pub fn actual_charge_temperature_k(&self) -> f64 {
        self.inner.diagnostics().actual_charge_temperature_k
    }

    pub fn zone_temperatures_k(&self) -> Vec<f64> {
        self.inner.zone_temperatures_k().to_vec()
    }

    pub fn last_heater_power_kw(&self) -> f64 {
        self.inner.diagnostics().last_heater_power_kw
    }

    pub fn last_heat_loss_power_kw(&self) -> f64 {
        self.inner.diagnostics().last_heat_loss_power_kw
    }

    pub fn last_reaction_power_kw(&self) -> f64 {
        self.inner.diagnostics().last_reaction_power_kw
    }

    pub fn last_feed_rate_kg_per_second(&self) -> f64 {
        self.inner.diagnostics().last_feed_rate_kg_per_second
    }

    pub fn last_product_rate_kg_per_second(&self) -> f64 {
        self.inner.diagnostics().last_product_rate_kg_per_second
    }

    pub fn last_goethite_conversion_fraction(&self) -> f64 {
        self.inner.diagnostics().last_goethite_conversion_fraction
    }

    pub fn last_solver_evaluation_count(&self) -> usize {
        self.inner.diagnostics().last_solver_evaluation_count
    }

    pub fn solid_product_total_mass_flow_kg_per_second(&self) -> f64 {
        self.inner
            .solid_product_stream()
            .total_mass_flow_kg_per_second()
    }

    pub fn gas_exhaust_total_mass_flow_kg_per_second(&self) -> f64 {
        self.inner
            .gas_exhaust_stream()
            .total_mass_flow_kg_per_second()
    }

    pub fn gas_exhaust_species_ids(&self) -> Vec<u16> {
        self.inner
            .gas_exhaust_stream()
            .gas_state()
            .to_columns()
            .species_ids
    }

    pub fn gas_exhaust_quantities(&self) -> Vec<f64> {
        self.inner
            .gas_exhaust_stream()
            .gas_state()
            .to_columns()
            .quantities
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn thermal() -> WasmPackedThermalModel {
        let mut thermal = WasmPackedThermalModel::new();
        thermal.set_specific_heat_capacity_j_per_kg_k(1, 650.0).unwrap();
        thermal.set_specific_heat_capacity_j_per_kg_k(2, 650.0).unwrap();
        thermal.set_specific_heat_capacity_j_per_kg_k(3, 1900.0).unwrap();
        thermal
    }

    fn reaction() -> WasmPackedGoethiteReaction {
        let mut reaction = WasmPackedGoethiteReaction::new(
            1, 2, 3, 0.177702, 0.159687, 0.018015, 90_000.0, 90_000.0, 60_000.0,
        )
        .unwrap();
        reaction.set_size_factor(4, 1.0).unwrap();
        reaction
    }

    #[test]
    fn wasm_furnace_keeps_complete_tick_inside_rust() {
        let thermal = thermal();
        let reaction = reaction();
        let mut source = WasmPackedHopper::new(10.0).unwrap();
        source.push_fraction(1, 4, 1, 0, 0.5).unwrap();
        let mut product = WasmPackedHopper::new(10.0).unwrap();
        let mut vent = WasmPackedGasBody::new();
        let mut furnace = WasmPackedRoastingFurnace::new(
            900.0, 100.0, 1200.0, 5.0, 4.0, 20.0, 4, true,
        )
        .unwrap();
        let moved = furnace.receive_from_hopper(&mut source, 5.0, 0.1).unwrap();
        assert!((moved - 0.5).abs() < 1e-12);
        for _ in 0..80 {
            furnace
                .tick_to_hopper_and_vent(
                    &mut product,
                    &mut vent,
                    &thermal,
                    &reaction,
                    0.1,
                )
                .unwrap();
        }
        assert!(vent.total_mass_kg() > 0.0);
        assert!(furnace.actual_charge_temperature_k() > 298.15);
        assert!(furnace.last_solver_evaluation_count() > 0);
    }
}
