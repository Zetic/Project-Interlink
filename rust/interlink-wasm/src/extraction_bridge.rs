use interlink_core::FractionDescriptor;
use interlink_extraction::{
    PackedExtractorConfig, PackedExtractorRuntime, PackedResourceOccurrence,
};
use wasm_bindgen::prelude::*;

use super::{js_error, WasmPackedHopper};

/// Browser-facing packed ResourceOccurrence. Canonical resource strings,
/// composition, texture metadata, and fragmentation are compiled in JavaScript
/// during setup; extraction ticks operate only on numeric packed state.
#[wasm_bindgen]
pub struct WasmPackedResourceOccurrence {
    inner: PackedResourceOccurrence,
}

#[wasm_bindgen]
impl WasmPackedResourceOccurrence {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: PackedResourceOccurrence::default(),
        }
    }

    pub fn push_material_fraction(
        &mut self,
        species_id: u16,
        size_bin_id: u8,
        liberation_class_id: u8,
        texture_profile_id: u32,
        quantity_per_kg: f64,
    ) -> Result<(), JsValue> {
        self.inner
            .push_material_fraction(
                FractionDescriptor {
                    species_id,
                    size_bin_id,
                    liberation_class_id,
                    texture_profile_id,
                },
                quantity_per_kg,
            )
            .map_err(js_error)
    }

    pub fn set_finite_reserve_mass_kg(&mut self, value: f64) -> Result<(), JsValue> {
        self.inner
            .set_finite_reserve_mass_kg(value)
            .map_err(js_error)
    }

    pub fn material_template_total_kg(&self) -> f64 {
        self.inner.material_per_kg().total_quantity()
    }

    pub fn is_finite(&self) -> bool {
        self.inner.is_finite()
    }

    pub fn remaining_mass_kg(&self) -> f64 {
        self.inner.remaining_mass_kg().unwrap_or(f64::INFINITY)
    }

    pub fn extracted_mass_kg(&self) -> f64 {
        self.inner.extracted_mass_kg()
    }

    pub fn is_depleted(&self) -> bool {
        self.inner.is_depleted()
    }
}

impl Default for WasmPackedResourceOccurrence {
    fn default() -> Self {
        Self::new()
    }
}

/// Stateful Rust-owned Extractor. One coarse call advances occurrence reserve,
/// material generation, target Hopper storage, and the material output stream.
#[wasm_bindgen]
pub struct WasmPackedExtractor {
    inner: PackedExtractorRuntime,
}

#[wasm_bindgen]
impl WasmPackedExtractor {
    #[wasm_bindgen(constructor)]
    pub fn new(rate_kg_per_second: f64, enabled: bool) -> Result<Self, JsValue> {
        Ok(Self {
            inner: PackedExtractorRuntime::new(
                PackedExtractorConfig::new(rate_kg_per_second, enabled).map_err(js_error)?,
            ),
        })
    }

    pub fn set_enabled(&mut self, enabled: bool) {
        self.inner.set_enabled(enabled);
    }

    pub fn set_rate_kg_per_second(&mut self, value: f64) -> Result<(), JsValue> {
        self.inner.set_rate_kg_per_second(value).map_err(js_error)
    }

    pub fn tick_occurrence_to_hopper(
        &mut self,
        occurrence: &mut WasmPackedResourceOccurrence,
        target: &mut WasmPackedHopper,
        dt: f64,
    ) -> Result<f64, JsValue> {
        Ok(self
            .inner
            .tick_occurrence_to_hopper(&mut occurrence.inner, &mut target.inner, dt)
            .map_err(js_error)?
            .extracted_mass_kg)
    }

    pub fn operating_state(&self) -> String {
        self.inner.operating_state().as_str().to_string()
    }

    pub fn last_error(&self) -> String {
        self.inner.last_error().unwrap_or("").to_string()
    }

    pub fn output_total_mass_flow_kg_per_second(&self) -> f64 {
        self.inner.output_stream().total_mass_flow_kg_per_second()
    }

    pub fn output_specific_sensible_enthalpy_j_per_kg(&self) -> f64 {
        self.inner
            .output_stream()
            .specific_sensible_enthalpy_j_per_kg()
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

#[cfg(test)]
mod tests {
    use super::*;

    fn basalt_occurrence() -> WasmPackedResourceOccurrence {
        let mut occurrence = WasmPackedResourceOccurrence::new();
        occurrence.push_material_fraction(1, 10, 1, 0, 0.55).unwrap();
        occurrence.push_material_fraction(2, 10, 1, 0, 0.30).unwrap();
        occurrence.push_material_fraction(3, 10, 1, 0, 0.15).unwrap();
        occurrence
    }

    #[test]
    fn wasm_extractor_moves_current_prototype_rate_inside_rust() {
        let mut occurrence = basalt_occurrence();
        let mut hopper = WasmPackedHopper::new(100.0).unwrap();
        let mut extractor = WasmPackedExtractor::new(5.0, true).unwrap();
        let moved = extractor
            .tick_occurrence_to_hopper(&mut occurrence, &mut hopper, 0.1)
            .unwrap();
        assert!((moved - 0.5).abs() < 1e-12);
        assert!((hopper.stored_mass_kg() - 0.5).abs() < 1e-12);
        assert_eq!(extractor.operating_state(), "running");
        assert!(!occurrence.is_finite());
    }

    #[test]
    fn wasm_occurrence_can_use_explicit_future_finite_reserve() {
        let mut occurrence = basalt_occurrence();
        occurrence.set_finite_reserve_mass_kg(0.25).unwrap();
        let mut hopper = WasmPackedHopper::new(100.0).unwrap();
        let mut extractor = WasmPackedExtractor::new(5.0, true).unwrap();
        let first = extractor
            .tick_occurrence_to_hopper(&mut occurrence, &mut hopper, 0.1)
            .unwrap();
        let second = extractor
            .tick_occurrence_to_hopper(&mut occurrence, &mut hopper, 0.1)
            .unwrap();
        assert!((first - 0.25).abs() < 1e-12);
        assert_eq!(second, 0.0);
        assert!(occurrence.is_depleted());
        assert_eq!(extractor.operating_state(), "blocked");
    }
}
