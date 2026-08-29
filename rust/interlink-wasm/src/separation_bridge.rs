use interlink_routing::PackedSpeciesThermalTable;
use interlink_separation::{
    PackedMagneticSeparatorConfig, PackedMagneticSeparatorRuntime, PackedScreenConfig,
    PackedScreenRuntime, PackedSeparationTables,
};
use wasm_bindgen::prelude::*;

use super::{js_error, WasmPackedHopper};

/// Browser-facing setup table for packed classification/separation. Canonical
/// string identifiers and material-property definitions are resolved once in
/// JavaScript; Screen/Magnetic-Separator ticks consume numeric tables only.
#[wasm_bindgen]
pub struct WasmPackedSeparationTables {
    inner: PackedSeparationTables,
    thermal: PackedSpeciesThermalTable,
}

#[wasm_bindgen]
impl WasmPackedSeparationTables {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: PackedSeparationTables::new(),
            thermal: PackedSpeciesThermalTable::new(),
        }
    }

    pub fn add_size_bin(
        &mut self,
        runtime_id: u8,
        max_mm: f64,
        magnetic_suitability: f64,
    ) -> Result<(), JsValue> {
        self.inner
            .add_size_bin(runtime_id, max_mm, magnetic_suitability)
            .map_err(js_error)
    }

    pub fn add_liberation_class(
        &mut self,
        runtime_id: u8,
        recovery_factor: f64,
    ) -> Result<(), JsValue> {
        self.inner
            .add_liberation_class(runtime_id, recovery_factor)
            .map_err(js_error)
    }

    pub fn set_species_magnetic_response(
        &mut self,
        runtime_id: u16,
        normalized_separation_coefficient: f64,
    ) -> Result<(), JsValue> {
        self.inner
            .set_species_magnetic_response(runtime_id, normalized_separation_coefficient)
            .map_err(js_error)
    }

    pub fn set_specific_heat_capacity_j_per_kg_k(
        &mut self,
        runtime_id: u16,
        value: f64,
    ) -> Result<(), JsValue> {
        self.thermal
            .set_specific_heat_capacity_j_per_kg_k(runtime_id, value)
            .map_err(js_error)
    }
}

impl Default for WasmPackedSeparationTables {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen]
pub struct WasmPackedScreen {
    inner: PackedScreenRuntime,
}

#[wasm_bindgen]
impl WasmPackedScreen {
    #[wasm_bindgen(constructor)]
    pub fn new(
        aperture_size_mm: f64,
        throughput_kg_per_second: f64,
        enabled: bool,
    ) -> Result<Self, JsValue> {
        Ok(Self {
            inner: PackedScreenRuntime::new(
                PackedScreenConfig::new(
                    aperture_size_mm,
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

    pub fn set_aperture_size_mm(&mut self, value: f64) -> Result<(), JsValue> {
        self.inner.set_aperture_size_mm(value).map_err(js_error)
    }

    pub fn set_throughput_kg_per_second(&mut self, value: f64) -> Result<(), JsValue> {
        self.inner
            .set_throughput_kg_per_second(value)
            .map_err(js_error)
    }

    pub fn tick_hopper_to_hoppers(
        &mut self,
        source: &mut WasmPackedHopper,
        undersize: &mut WasmPackedHopper,
        oversize: &mut WasmPackedHopper,
        tables: &WasmPackedSeparationTables,
        dt: f64,
    ) -> Result<f64, JsValue> {
        Ok(self
            .inner
            .tick_hopper_to_hoppers(
                &mut source.inner,
                &mut undersize.inner,
                &mut oversize.inner,
                &tables.inner,
                &tables.thermal,
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

    pub fn undersize_total_mass_flow_kg_per_second(&self) -> f64 {
        self.inner
            .undersize_stream()
            .total_mass_flow_kg_per_second()
    }

    pub fn oversize_total_mass_flow_kg_per_second(&self) -> f64 {
        self.inner.oversize_stream().total_mass_flow_kg_per_second()
    }

    pub fn undersize_specific_sensible_enthalpy_j_per_kg(&self) -> f64 {
        self.inner
            .undersize_stream()
            .specific_sensible_enthalpy_j_per_kg()
    }

    pub fn oversize_specific_sensible_enthalpy_j_per_kg(&self) -> f64 {
        self.inner
            .oversize_stream()
            .specific_sensible_enthalpy_j_per_kg()
    }

    pub fn undersize_species_ids(&self) -> Vec<u16> {
        self.inner
            .undersize_stream()
            .solid_state()
            .to_columns()
            .species_ids
    }

    pub fn undersize_size_bin_ids(&self) -> Vec<u8> {
        self.inner
            .undersize_stream()
            .solid_state()
            .to_columns()
            .size_bin_ids
    }

    pub fn undersize_liberation_class_ids(&self) -> Vec<u8> {
        self.inner
            .undersize_stream()
            .solid_state()
            .to_columns()
            .liberation_class_ids
    }

    pub fn undersize_texture_profile_ids(&self) -> Vec<u32> {
        self.inner
            .undersize_stream()
            .solid_state()
            .to_columns()
            .texture_profile_ids
    }

    pub fn undersize_quantities(&self) -> Vec<f64> {
        self.inner
            .undersize_stream()
            .solid_state()
            .to_columns()
            .quantities
    }

    pub fn oversize_species_ids(&self) -> Vec<u16> {
        self.inner
            .oversize_stream()
            .solid_state()
            .to_columns()
            .species_ids
    }

    pub fn oversize_size_bin_ids(&self) -> Vec<u8> {
        self.inner
            .oversize_stream()
            .solid_state()
            .to_columns()
            .size_bin_ids
    }

    pub fn oversize_liberation_class_ids(&self) -> Vec<u8> {
        self.inner
            .oversize_stream()
            .solid_state()
            .to_columns()
            .liberation_class_ids
    }

    pub fn oversize_texture_profile_ids(&self) -> Vec<u32> {
        self.inner
            .oversize_stream()
            .solid_state()
            .to_columns()
            .texture_profile_ids
    }

    pub fn oversize_quantities(&self) -> Vec<f64> {
        self.inner
            .oversize_stream()
            .solid_state()
            .to_columns()
            .quantities
    }
}

#[wasm_bindgen]
pub struct WasmPackedMagneticSeparator {
    inner: PackedMagneticSeparatorRuntime,
}

#[wasm_bindgen]
impl WasmPackedMagneticSeparator {
    #[wasm_bindgen(constructor)]
    pub fn new(
        field_strength: f64,
        max_feed_particle_size_mm: f64,
        throughput_kg_per_second: f64,
        enabled: bool,
    ) -> Result<Self, JsValue> {
        Ok(Self {
            inner: PackedMagneticSeparatorRuntime::new(
                PackedMagneticSeparatorConfig::new(
                    field_strength,
                    max_feed_particle_size_mm,
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

    pub fn set_field_strength(&mut self, value: f64) -> Result<(), JsValue> {
        self.inner.set_field_strength(value).map_err(js_error)
    }

    pub fn set_max_feed_particle_size_mm(&mut self, value: f64) -> Result<(), JsValue> {
        self.inner
            .set_max_feed_particle_size_mm(value)
            .map_err(js_error)
    }

    pub fn set_throughput_kg_per_second(&mut self, value: f64) -> Result<(), JsValue> {
        self.inner
            .set_throughput_kg_per_second(value)
            .map_err(js_error)
    }

    pub fn tick_hopper_to_hoppers(
        &mut self,
        source: &mut WasmPackedHopper,
        concentrate: &mut WasmPackedHopper,
        tailings: &mut WasmPackedHopper,
        tables: &WasmPackedSeparationTables,
        dt: f64,
    ) -> Result<f64, JsValue> {
        Ok(self
            .inner
            .tick_hopper_to_hoppers(
                &mut source.inner,
                &mut concentrate.inner,
                &mut tailings.inner,
                &tables.inner,
                &tables.thermal,
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

    pub fn concentrate_total_mass_flow_kg_per_second(&self) -> f64 {
        self.inner
            .concentrate_stream()
            .total_mass_flow_kg_per_second()
    }

    pub fn tailings_total_mass_flow_kg_per_second(&self) -> f64 {
        self.inner
            .tailings_stream()
            .total_mass_flow_kg_per_second()
    }

    pub fn concentrate_specific_sensible_enthalpy_j_per_kg(&self) -> f64 {
        self.inner
            .concentrate_stream()
            .specific_sensible_enthalpy_j_per_kg()
    }

    pub fn tailings_specific_sensible_enthalpy_j_per_kg(&self) -> f64 {
        self.inner
            .tailings_stream()
            .specific_sensible_enthalpy_j_per_kg()
    }

    pub fn concentrate_species_ids(&self) -> Vec<u16> {
        self.inner
            .concentrate_stream()
            .solid_state()
            .to_columns()
            .species_ids
    }

    pub fn concentrate_size_bin_ids(&self) -> Vec<u8> {
        self.inner
            .concentrate_stream()
            .solid_state()
            .to_columns()
            .size_bin_ids
    }

    pub fn concentrate_liberation_class_ids(&self) -> Vec<u8> {
        self.inner
            .concentrate_stream()
            .solid_state()
            .to_columns()
            .liberation_class_ids
    }

    pub fn concentrate_texture_profile_ids(&self) -> Vec<u32> {
        self.inner
            .concentrate_stream()
            .solid_state()
            .to_columns()
            .texture_profile_ids
    }

    pub fn concentrate_quantities(&self) -> Vec<f64> {
        self.inner
            .concentrate_stream()
            .solid_state()
            .to_columns()
            .quantities
    }

    pub fn tailings_species_ids(&self) -> Vec<u16> {
        self.inner
            .tailings_stream()
            .solid_state()
            .to_columns()
            .species_ids
    }

    pub fn tailings_size_bin_ids(&self) -> Vec<u8> {
        self.inner
            .tailings_stream()
            .solid_state()
            .to_columns()
            .size_bin_ids
    }

    pub fn tailings_liberation_class_ids(&self) -> Vec<u8> {
        self.inner
            .tailings_stream()
            .solid_state()
            .to_columns()
            .liberation_class_ids
    }

    pub fn tailings_texture_profile_ids(&self) -> Vec<u32> {
        self.inner
            .tailings_stream()
            .solid_state()
            .to_columns()
            .texture_profile_ids
    }

    pub fn tailings_quantities(&self) -> Vec<f64> {
        self.inner
            .tailings_stream()
            .solid_state()
            .to_columns()
            .quantities
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tables() -> WasmPackedSeparationTables {
        let mut tables = WasmPackedSeparationTables::new();
        tables.add_size_bin(1, 25.0, 1.0).unwrap();
        tables.add_size_bin(2, 60.0, 0.0).unwrap();
        tables.add_liberation_class(1, 1.0).unwrap();
        tables.set_species_magnetic_response(1, 1.0).unwrap();
        tables.set_species_magnetic_response(2, 0.0).unwrap();
        tables
            .set_specific_heat_capacity_j_per_kg_k(1, 670.0)
            .unwrap();
        tables
            .set_specific_heat_capacity_j_per_kg_k(2, 740.0)
            .unwrap();
        tables
    }

    #[test]
    fn wasm_screen_runs_one_coarse_three_hopper_tick() {
        let tables = tables();
        let mut source = WasmPackedHopper::new(100.0).unwrap();
        source.push_fraction(1, 1, 1, 0, 5.0).unwrap();
        source.push_fraction(2, 2, 1, 0, 5.0).unwrap();
        let mut undersize = WasmPackedHopper::new(100.0).unwrap();
        let mut oversize = WasmPackedHopper::new(100.0).unwrap();
        let mut screen = WasmPackedScreen::new(25.0, 10.0, true).unwrap();
        let moved = screen
            .tick_hopper_to_hoppers(
                &mut source,
                &mut undersize,
                &mut oversize,
                &tables,
                1.0,
            )
            .unwrap();
        assert!((moved - 10.0).abs() < 1e-12);
        assert!((undersize.stored_mass_kg() - 5.0).abs() < 1e-12);
        assert!((oversize.stored_mass_kg() - 5.0).abs() < 1e-12);
    }

    #[test]
    fn wasm_magnetic_separator_keeps_partition_inside_rust() {
        let tables = tables();
        let mut source = WasmPackedHopper::new(100.0).unwrap();
        source.push_fraction(1, 1, 1, 0, 10.0).unwrap();
        source.push_fraction(2, 1, 1, 0, 10.0).unwrap();
        let mut concentrate = WasmPackedHopper::new(100.0).unwrap();
        let mut tailings = WasmPackedHopper::new(100.0).unwrap();
        let mut separator =
            WasmPackedMagneticSeparator::new(0.5, 25.0, 20.0, true).unwrap();
        let moved = separator
            .tick_hopper_to_hoppers(
                &mut source,
                &mut concentrate,
                &mut tailings,
                &tables,
                1.0,
            )
            .unwrap();
        assert!((moved - 20.0).abs() < 1e-12);
        assert!((concentrate.stored_mass_kg() - 6.0).abs() < 1e-12);
        assert!((tailings.stored_mass_kg() - 14.0).abs() < 1e-12);
    }
}
