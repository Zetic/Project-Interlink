use interlink_processes::{PackedFeederConfig, PackedFeederRuntime};
use interlink_routing::{
    PackedMergerConfig, PackedMergerRuntime, PackedSpeciesThermalTable, PackedSplitterConfig,
    PackedSplitterRuntime,
};
use wasm_bindgen::prelude::*;

use super::{js_error, WasmPackedHopper};

/// Browser-facing wrapper for the first Rust-owned apparatus execution path.
/// The Feeder owns its packed input/output streams internally and mutates two
/// Rust-owned Hopper inventories in one coarse tick call.
#[wasm_bindgen]
pub struct WasmPackedFeeder {
    inner: PackedFeederRuntime,
}

#[wasm_bindgen]
impl WasmPackedFeeder {
    #[wasm_bindgen(constructor)]
    pub fn new(
        flow_rate_kg_per_second: f64,
        throughput_kg_per_second: f64,
        enabled: bool,
    ) -> Result<WasmPackedFeeder, JsValue> {
        let config = PackedFeederConfig::new(
            flow_rate_kg_per_second,
            throughput_kg_per_second,
            enabled,
        )
        .map_err(js_error)?;
        Ok(Self {
            inner: PackedFeederRuntime::new(config),
        })
    }

    pub fn set_enabled(&mut self, enabled: bool) {
        self.inner.set_enabled(enabled);
    }

    pub fn set_flow_rate_kg_per_second(&mut self, value: f64) -> Result<(), JsValue> {
        self.inner.set_flow_rate_kg_per_second(value).map_err(js_error)
    }

    pub fn set_throughput_kg_per_second(&mut self, value: f64) -> Result<(), JsValue> {
        self.inner.set_throughput_kg_per_second(value).map_err(js_error)
    }

    pub fn tick_hopper_to_hopper(
        &mut self,
        source: &mut WasmPackedHopper,
        target: &mut WasmPackedHopper,
        dt: f64,
    ) -> Result<f64, JsValue> {
        let result = self
            .inner
            .tick_hopper_to_hopper(&mut source.inner, &mut target.inner, dt)
            .map_err(js_error)?;
        Ok(result.transferred_mass_kg)
    }

    pub fn operating_state(&self) -> String {
        self.inner.operating_state().as_str().to_string()
    }

    pub fn last_error(&self) -> String {
        self.inner.last_error().unwrap_or("").to_string()
    }

    pub fn input_total_mass_flow_kg_per_second(&self) -> f64 {
        self.inner.input_stream().total_mass_flow_kg_per_second()
    }

    pub fn output_total_mass_flow_kg_per_second(&self) -> f64 {
        self.inner.output_stream().total_mass_flow_kg_per_second()
    }

    pub fn input_specific_sensible_enthalpy_j_per_kg(&self) -> f64 {
        self.inner.input_stream().specific_sensible_enthalpy_j_per_kg()
    }

    pub fn output_specific_sensible_enthalpy_j_per_kg(&self) -> f64 {
        self.inner.output_stream().specific_sensible_enthalpy_j_per_kg()
    }

    pub fn output_species_ids(&self) -> Vec<u16> {
        self.inner.output_stream().solid_state().to_columns().species_ids
    }

    pub fn output_size_bin_ids(&self) -> Vec<u8> {
        self.inner.output_stream().solid_state().to_columns().size_bin_ids
    }

    pub fn output_liberation_class_ids(&self) -> Vec<u8> {
        self.inner
            .output_stream()
            .solid_state()
            .to_columns()
            .liberation_class_ids
    }

    pub fn output_texture_profile_ids(&self) -> Vec<u32> {
        self.inner
            .output_stream()
            .solid_state()
            .to_columns()
            .texture_profile_ids
    }

    pub fn output_quantities(&self) -> Vec<f64> {
        self.inner.output_stream().solid_state().to_columns().quantities
    }
}

/// Runtime-local thermal property table used by routing kernels that must match
/// the production constant-Cp equilibrium-energy calculation.
#[wasm_bindgen]
pub struct WasmPackedThermalTable {
    inner: PackedSpeciesThermalTable,
}

#[wasm_bindgen]
impl WasmPackedThermalTable {
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

impl Default for WasmPackedThermalTable {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen]
pub struct WasmPackedSplitter {
    inner: PackedSplitterRuntime,
}

#[wasm_bindgen]
impl WasmPackedSplitter {
    #[wasm_bindgen(constructor)]
    pub fn new(
        split_fraction_to_a: f64,
        throughput_kg_per_second: f64,
        enabled: bool,
    ) -> Result<Self, JsValue> {
        Ok(Self {
            inner: PackedSplitterRuntime::new(
                PackedSplitterConfig::new(
                    split_fraction_to_a,
                    throughput_kg_per_second,
                    enabled,
                )
                .map_err(js_error)?,
            ),
        })
    }

    pub fn set_enabled(&mut self, enabled: bool) {
        self.inner.set_enabled(enabled);
    }

    pub fn tick_hopper_to_hoppers(
        &mut self,
        source: &mut WasmPackedHopper,
        output_a: &mut WasmPackedHopper,
        output_b: &mut WasmPackedHopper,
        thermal: &WasmPackedThermalTable,
        dt: f64,
    ) -> Result<f64, JsValue> {
        Ok(self
            .inner
            .tick_hopper_to_hoppers(
                &mut source.inner,
                &mut output_a.inner,
                &mut output_b.inner,
                &thermal.inner,
                dt,
            )
            .map_err(js_error)?
            .transferred_mass_kg)
    }

    pub fn operating_state(&self) -> String {
        self.inner.operating_state().as_str().to_string()
    }

    pub fn last_error(&self) -> String {
        self.inner.last_error().unwrap_or("").to_string()
    }

    pub fn input_total_mass_flow_kg_per_second(&self) -> f64 {
        self.inner.input_stream().total_mass_flow_kg_per_second()
    }

    pub fn output_a_total_mass_flow_kg_per_second(&self) -> f64 {
        self.inner.output_a_stream().total_mass_flow_kg_per_second()
    }

    pub fn output_b_total_mass_flow_kg_per_second(&self) -> f64 {
        self.inner.output_b_stream().total_mass_flow_kg_per_second()
    }

    pub fn output_a_specific_sensible_enthalpy_j_per_kg(&self) -> f64 {
        self.inner
            .output_a_stream()
            .specific_sensible_enthalpy_j_per_kg()
    }

    pub fn output_b_specific_sensible_enthalpy_j_per_kg(&self) -> f64 {
        self.inner
            .output_b_stream()
            .specific_sensible_enthalpy_j_per_kg()
    }
}

#[wasm_bindgen]
pub struct WasmPackedMerger {
    inner: PackedMergerRuntime,
}

#[wasm_bindgen]
impl WasmPackedMerger {
    #[wasm_bindgen(constructor)]
    pub fn new(throughput_kg_per_second: f64, enabled: bool) -> Result<Self, JsValue> {
        Ok(Self {
            inner: PackedMergerRuntime::new(
                PackedMergerConfig::new(throughput_kg_per_second, enabled).map_err(js_error)?,
            ),
        })
    }

    pub fn set_enabled(&mut self, enabled: bool) {
        self.inner.set_enabled(enabled);
    }

    pub fn tick_hoppers_to_hopper(
        &mut self,
        input_a: &mut WasmPackedHopper,
        input_b: &mut WasmPackedHopper,
        output: &mut WasmPackedHopper,
        thermal: &WasmPackedThermalTable,
        dt: f64,
    ) -> Result<f64, JsValue> {
        Ok(self
            .inner
            .tick_hoppers_to_hopper(
                &mut input_a.inner,
                &mut input_b.inner,
                &mut output.inner,
                &thermal.inner,
                dt,
            )
            .map_err(js_error)?
            .output_mass_kg)
    }

    pub fn operating_state(&self) -> String {
        self.inner.operating_state().as_str().to_string()
    }

    pub fn last_error(&self) -> String {
        self.inner.last_error().unwrap_or("").to_string()
    }

    pub fn input_a_total_mass_flow_kg_per_second(&self) -> f64 {
        self.inner.input_a_stream().total_mass_flow_kg_per_second()
    }

    pub fn input_b_total_mass_flow_kg_per_second(&self) -> f64 {
        self.inner.input_b_stream().total_mass_flow_kg_per_second()
    }

    pub fn output_total_mass_flow_kg_per_second(&self) -> f64 {
        self.inner.output_stream().total_mass_flow_kg_per_second()
    }

    pub fn output_specific_sensible_enthalpy_j_per_kg(&self) -> f64 {
        self.inner.output_stream().specific_sensible_enthalpy_j_per_kg()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn thermal() -> WasmPackedThermalTable {
        let mut table = WasmPackedThermalTable::new();
        table
            .set_specific_heat_capacity_j_per_kg_k(1, 650.0)
            .unwrap();
        table
            .set_specific_heat_capacity_j_per_kg_k(2, 740.0)
            .unwrap();
        table
    }

    #[test]
    fn wasm_feeder_executes_inside_rust_owned_hoppers() {
        let mut source = WasmPackedHopper::new(100.0).unwrap();
        source.push_fraction(1, 2, 1, 0, 50.0).unwrap();
        source.set_sensible_enthalpy_j(5_000.0).unwrap();
        let mut target = WasmPackedHopper::new(100.0).unwrap();
        let mut feeder = WasmPackedFeeder::new(5.0, 8.0, true).unwrap();
        let moved = feeder
            .tick_hopper_to_hopper(&mut source, &mut target, 0.1)
            .unwrap();
        assert!((moved - 0.5).abs() < 1e-12);
        assert_eq!(feeder.operating_state(), "running");
    }

    #[test]
    fn wasm_splitter_and_merger_keep_multiport_state_inside_rust() {
        let thermal = thermal();
        let mut source = WasmPackedHopper::new(100.0).unwrap();
        source.push_fraction(1, 2, 1, 0, 50.0).unwrap();
        source.set_sensible_enthalpy_j(5_000.0).unwrap();
        let mut a = WasmPackedHopper::new(100.0).unwrap();
        let mut b = WasmPackedHopper::new(100.0).unwrap();
        let mut splitter = WasmPackedSplitter::new(0.25, 8.0, true).unwrap();
        let moved = splitter
            .tick_hopper_to_hoppers(&mut source, &mut a, &mut b, &thermal, 0.1)
            .unwrap();
        assert!((moved - 0.8).abs() < 1e-12);
        assert_eq!(splitter.operating_state(), "running");

        let mut output = WasmPackedHopper::new(100.0).unwrap();
        let mut merger = WasmPackedMerger::new(8.0, true).unwrap();
        let merged = merger
            .tick_hoppers_to_hopper(&mut a, &mut b, &mut output, &thermal, 0.1)
            .unwrap();
        assert!((merged - 0.8).abs() < 1e-12);
        assert_eq!(merger.operating_state(), "running");
    }
}
