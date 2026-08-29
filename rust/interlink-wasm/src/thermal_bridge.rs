use interlink_thermal::{
    exchange_heat_between_solid_and_gas, gas_body_temperature_k,
    set_gas_body_temperature_k, PackedGasBody, PackedGasState, PackedGasStream,
    PackedSpeciesThermalTable,
};
use wasm_bindgen::prelude::*;

use super::{js_error, WasmPackedHopper};

/// Thermal property model used by the gas/thermal migration path. It wraps the
/// same runtime-local constant-Cp table type already used by Rust routing.
#[wasm_bindgen]
pub struct WasmPackedThermalModel {
    pub(crate) inner: PackedSpeciesThermalTable,
}

#[wasm_bindgen]
impl WasmPackedThermalModel {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: PackedSpeciesThermalTable::new(),
        }
    }

    pub fn set_specific_heat_capacity_j_per_kg_k(
        &mut self,
        species_id: u16,
        value: f64,
    ) -> Result<(), JsValue> {
        self.inner
            .set_specific_heat_capacity_j_per_kg_k(species_id, value)
            .map_err(js_error)
    }
}

impl Default for WasmPackedThermalModel {
    fn default() -> Self {
        Self::new()
    }
}

/// Rust-owned finite gas inventory. Species arrays are setup/debug snapshots;
/// mixing, stream receipt, and thermal exchange are coarse Rust operations.
#[wasm_bindgen]
pub struct WasmPackedGasBody {
    pub(crate) inner: PackedGasBody,
}

#[wasm_bindgen]
impl WasmPackedGasBody {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: PackedGasBody::empty(),
        }
    }

    pub fn push_species(&mut self, species_id: u16, quantity_kg: f64) -> Result<(), JsValue> {
        self.inner
            .gas_state_mut()
            .push_species(species_id, quantity_kg)
            .map_err(js_error)
    }

    pub fn set_sensible_enthalpy_j(&mut self, value: f64) -> Result<(), JsValue> {
        self.inner.set_sensible_enthalpy_j(value).map_err(js_error)
    }

    pub fn total_mass_kg(&self) -> f64 {
        self.inner.total_mass_kg()
    }

    pub fn sensible_enthalpy_j(&self) -> f64 {
        self.inner.sensible_enthalpy_j()
    }

    pub fn specific_sensible_enthalpy_j_per_kg(&self) -> f64 {
        self.inner.specific_sensible_enthalpy_j_per_kg()
    }

    pub fn temperature_k(&self, thermal: &WasmPackedThermalModel) -> Result<f64, JsValue> {
        gas_body_temperature_k(&self.inner, &thermal.inner).map_err(js_error)
    }

    pub fn set_temperature_k(
        &mut self,
        thermal: &WasmPackedThermalModel,
        temperature_k: f64,
    ) -> Result<(), JsValue> {
        set_gas_body_temperature_k(&mut self.inner, &thermal.inner, temperature_k)
            .map_err(js_error)
    }

    pub fn species_ids(&self) -> Vec<u16> {
        self.inner.gas_state().to_columns().species_ids
    }

    pub fn quantities(&self) -> Vec<f64> {
        self.inner.gas_state().to_columns().quantities
    }

    /// Mix a complete incoming gas body into this inventory in one call.
    pub fn mix_from(&mut self, incoming: &WasmPackedGasBody) -> Result<f64, JsValue> {
        self.inner.add_body(&incoming.inner).map_err(js_error)
    }

    /// Consume one packed gas stream for dt seconds in one call.
    pub fn receive_stream(
        &mut self,
        stream: &WasmPackedGasStream,
        dt: f64,
    ) -> Result<f64, JsValue> {
        self.inner
            .receive_flow(
                stream.inner.gas_state(),
                dt,
                stream.inner.specific_sensible_enthalpy_j_per_kg(),
            )
            .map_err(js_error)
    }

    /// Conservative solid↔gas sensible heat exchange. Positive energy moved
    /// from the Hopper's solid body into this gas body.
    pub fn exchange_heat_with_hopper(
        &mut self,
        hopper: &mut WasmPackedHopper,
        thermal: &WasmPackedThermalModel,
        conductance_w_per_k: f64,
        dt: f64,
    ) -> Result<f64, JsValue> {
        exchange_heat_between_solid_and_gas(
            hopper.inner.body_mut(),
            &mut self.inner,
            &thermal.inner,
            conductance_w_per_k,
            dt,
        )
        .map_err(js_error)
    }
}

impl Default for WasmPackedGasBody {
    fn default() -> Self {
        Self::new()
    }
}

/// Continuous Rust-owned gas stream. Values are kg/s.
#[wasm_bindgen]
pub struct WasmPackedGasStream {
    pub(crate) inner: PackedGasStream,
}

#[wasm_bindgen]
impl WasmPackedGasStream {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: PackedGasStream::new(),
        }
    }

    pub fn clear(&mut self) {
        self.inner.clear();
    }

    pub fn push_species_flow(
        &mut self,
        species_id: u16,
        rate_kg_per_second: f64,
    ) -> Result<(), JsValue> {
        let mut state: PackedGasState = self.inner.gas_state().clone();
        state
            .push_species(species_id, rate_kg_per_second)
            .map_err(js_error)?;
        let specific = self.inner.specific_sensible_enthalpy_j_per_kg();
        self.inner.set_flow(&state, specific).map_err(js_error)
    }

    pub fn set_specific_sensible_enthalpy_j_per_kg(
        &mut self,
        value: f64,
    ) -> Result<(), JsValue> {
        let state = self.inner.gas_state().clone();
        self.inner.set_flow(&state, value).map_err(js_error)
    }

    pub fn total_mass_flow_kg_per_second(&self) -> f64 {
        self.inner.total_mass_flow_kg_per_second()
    }

    pub fn specific_sensible_enthalpy_j_per_kg(&self) -> f64 {
        self.inner.specific_sensible_enthalpy_j_per_kg()
    }

    pub fn species_ids(&self) -> Vec<u16> {
        self.inner.gas_state().to_columns().species_ids
    }

    pub fn quantities(&self) -> Vec<f64> {
        self.inner.gas_state().to_columns().quantities
    }
}

impl Default for WasmPackedGasStream {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wasm_gas_body_derives_temperature_from_sensible_enthalpy() {
        let mut thermal = WasmPackedThermalModel::new();
        thermal
            .set_specific_heat_capacity_j_per_kg_k(1, 1900.0)
            .unwrap();
        let mut gas = WasmPackedGasBody::new();
        gas.push_species(1, 2.0).unwrap();
        gas.set_temperature_k(&thermal, 500.0).unwrap();
        assert!((gas.temperature_k(&thermal).unwrap() - 500.0).abs() < 1e-10);
        assert!((gas.total_mass_kg() - 2.0).abs() < 1e-12);
    }

    #[test]
    fn wasm_gas_stream_receipt_stays_inside_rust_state() {
        let mut stream = WasmPackedGasStream::new();
        stream.push_species_flow(1, 2.0).unwrap();
        stream
            .set_specific_sensible_enthalpy_j_per_kg(1000.0)
            .unwrap();
        let mut inventory = WasmPackedGasBody::new();
        let accepted = inventory.receive_stream(&stream, 0.25).unwrap();
        assert!((accepted - 0.5).abs() < 1e-12);
        assert!((inventory.total_mass_kg() - 0.5).abs() < 1e-12);
        assert!((inventory.sensible_enthalpy_j() - 500.0).abs() < 1e-12);
    }
}
