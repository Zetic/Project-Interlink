use interlink_comminution::{
    PackedComminutionConfig, PackedComminutionEquipment, PackedComminutionProperties,
    PackedComminutionRuntime, PackedComminutionTables, PackedSpeciesTexture,
};
use wasm_bindgen::prelude::*;

use super::{js_error, WasmPackedHopper};

/// Browser-facing compiler target for comminution metadata. Canonical string
/// identifiers are resolved by JavaScript once; the Rust hot path uses numeric
/// IDs and numeric property tables only.
#[wasm_bindgen]
pub struct WasmPackedComminutionTables {
    inner: PackedComminutionTables,
}

#[wasm_bindgen]
impl WasmPackedComminutionTables {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: PackedComminutionTables::new(),
        }
    }

    pub fn add_size_bin(
        &mut self,
        runtime_id: u8,
        order_index: u32,
        max_mm: f64,
        representative_mm: f64,
        canonical: bool,
    ) -> Result<(), JsValue> {
        self.inner
            .add_size_bin(
                runtime_id,
                order_index as usize,
                max_mm,
                representative_mm,
                canonical,
            )
            .map_err(js_error)
    }

    pub fn set_legacy_lt_one_mm_id(&mut self, runtime_id: u8) {
        self.inner.set_legacy_lt_one_mm_id(runtime_id);
    }

    pub fn add_liberation_class(&mut self, runtime_id: u8, order_index: u32) {
        self.inner
            .add_liberation_class(runtime_id, order_index as usize);
    }

    #[allow(clippy::too_many_arguments)]
    pub fn set_species_texture(
        &mut self,
        texture_profile_id: u32,
        species_id: u16,
        d10_um: f64,
        d50_um: f64,
        d90_um: f64,
        free: f64,
        boundary: f64,
        intergrown: f64,
        included: f64,
    ) -> Result<(), JsValue> {
        let texture = PackedSpeciesTexture::new(
            d10_um,
            d50_um,
            d90_um,
            [free, boundary, intergrown, included],
        )
        .map_err(js_error)?;
        self.inner
            .set_species_texture(texture_profile_id, species_id, texture);
        Ok(())
    }

    pub fn set_texture_properties(
        &mut self,
        texture_profile_id: u32,
        bond_crushing_work_index_kwh_per_t: f64,
        bond_ball_mill_work_index_kwh_per_t: f64,
        bond_abrasion_index: f64,
    ) -> Result<(), JsValue> {
        let properties = PackedComminutionProperties::new(
            bond_crushing_work_index_kwh_per_t,
            bond_ball_mill_work_index_kwh_per_t,
            bond_abrasion_index,
        )
        .map_err(js_error)?;
        self.inner
            .set_texture_properties(texture_profile_id, properties);
        Ok(())
    }
}

impl Default for WasmPackedComminutionTables {
    fn default() -> Self {
        Self::new()
    }
}

/// Stateful Rust-owned comminution apparatus. A complete fixed-step operation
/// mutates two Rust-owned Hoppers and both process streams without material
/// populations crossing the JS/WASM boundary.
#[wasm_bindgen]
pub struct WasmPackedComminutionMachine {
    inner: PackedComminutionRuntime,
}

#[wasm_bindgen]
impl WasmPackedComminutionMachine {
    #[wasm_bindgen(constructor)]
    pub fn new(
        equipment: &str,
        target_size_id: u8,
        target_particle_size_mm: f64,
        throughput_kg_per_second: f64,
        rated_power_kw: f64,
        enabled: bool,
    ) -> Result<Self, JsValue> {
        let equipment = PackedComminutionEquipment::from_name(equipment).map_err(js_error)?;
        let rated_power = if equipment == PackedComminutionEquipment::LegacyCrusher {
            None
        } else {
            Some(rated_power_kw)
        };
        let config = PackedComminutionConfig::new(
            equipment,
            target_size_id,
            target_particle_size_mm,
            throughput_kg_per_second,
            rated_power,
            enabled,
        )
        .map_err(js_error)?;
        Ok(Self {
            inner: PackedComminutionRuntime::new(config),
        })
    }

    pub fn tick_hopper_to_hopper(
        &mut self,
        source: &mut WasmPackedHopper,
        target: &mut WasmPackedHopper,
        tables: &WasmPackedComminutionTables,
        dt: f64,
    ) -> Result<f64, JsValue> {
        Ok(self
            .inner
            .tick_hopper_to_hopper(&mut source.inner, &mut target.inner, &tables.inner, dt)
            .map_err(js_error)?
            .transferred_mass_kg)
    }

    pub fn operating_state(&self) -> String {
        self.inner.operating_state().as_str().to_string()
    }

    pub fn last_error(&self) -> String {
        self.inner.last_error().unwrap_or("").to_string()
    }

    pub fn last_specific_energy_kwh_per_t(&self) -> f64 {
        self.inner.last_specific_energy_kwh_per_t()
    }

    pub fn last_power_kw(&self) -> f64 {
        self.inner.last_power_kw()
    }

    pub fn last_bond_abrasion_index(&self) -> f64 {
        self.inner.last_bond_abrasion_index()
    }

    pub fn abrasion_exposure_tonne_ai(&self) -> f64 {
        self.inner.abrasion_exposure_tonne_ai()
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
