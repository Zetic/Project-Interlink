use interlink_processes::{PackedFeederConfig, PackedFeederRuntime};
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
        self.inner
            .set_flow_rate_kg_per_second(value)
            .map_err(js_error)
    }

    pub fn set_throughput_kg_per_second(&mut self, value: f64) -> Result<(), JsValue> {
        self.inner
            .set_throughput_kg_per_second(value)
            .map_err(js_error)
    }

    /// Advance one Hopper -> Feeder -> Hopper identity-process step entirely in
    /// Rust-owned state. Only the scalar result crosses the JS/WASM boundary.
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
        self.inner
            .input_stream()
            .specific_sensible_enthalpy_j_per_kg()
    }

    pub fn output_specific_sensible_enthalpy_j_per_kg(&self) -> f64 {
        self.inner
            .output_stream()
            .specific_sensible_enthalpy_j_per_kg()
    }

    // Snapshot accessors are migration/debug aids. Production worker snapshots
    // should eventually be coarser and selective rather than pulling every
    // column after every fixed step.
    pub fn output_species_ids(&self) -> Vec<u16> {
        self.inner
            .output_stream()
            .solid_state()
            .to_columns()
            .species_ids
    }

    pub fn output_size_bin_ids(&self) -> Vec<u8> {
        self.inner
            .output_stream()
            .solid_state()
            .to_columns()
            .size_bin_ids
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
        self.inner
            .output_stream()
            .solid_state()
            .to_columns()
            .quantities
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
        assert!((feeder.output_total_mass_flow_kg_per_second() - 5.0).abs() < 1e-12);
        assert!((feeder.output_specific_sensible_enthalpy_j_per_kg() - 100.0).abs() < 1e-12);
        assert!((source.stored_mass_kg() - 49.5).abs() < 1e-12);
        assert!((target.stored_mass_kg() - 0.5).abs() < 1e-12);
    }
}
