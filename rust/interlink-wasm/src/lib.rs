use interlink_core::{
    transfer_between_hoppers, FractionDescriptor, PackedHopperState, PackedSolidState,
    SIMULATION_STEP_SECONDS,
};
use wasm_bindgen::prelude::*;

mod comminution_bridge;
mod extraction_bridge;
mod process_bridge;
mod separation_bridge;
pub use comminution_bridge::{WasmPackedComminutionMachine, WasmPackedComminutionTables};
pub use extraction_bridge::{WasmPackedExtractor, WasmPackedResourceOccurrence};
pub use process_bridge::{
    WasmPackedFeeder, WasmPackedMerger, WasmPackedSplitter, WasmPackedThermalTable,
};
pub use separation_bridge::{
    WasmPackedMagneticSeparator, WasmPackedScreen, WasmPackedSeparationTables,
};

pub const WASM_RUNTIME_PROTOCOL_VERSION: u32 = 2;

#[wasm_bindgen]
pub fn runtime_protocol_version() -> u32 {
    WASM_RUNTIME_PROTOCOL_VERSION
}

#[wasm_bindgen]
pub fn simulation_step_seconds() -> f64 {
    SIMULATION_STEP_SECONDS
}

/// Browser-facing packed material primitive. Coarse state ownership is retained
/// inside WASM; column accessors are snapshots for debugging/parity during the
/// migration and should not become the eventual per-tick UI protocol.
#[wasm_bindgen]
pub struct WasmPackedSolidState {
    inner: PackedSolidState,
}

#[wasm_bindgen]
impl WasmPackedSolidState {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: PackedSolidState::new(),
        }
    }

    pub fn clear(&mut self) {
        self.inner.clear();
    }

    pub fn len(&self) -> usize {
        self.inner.len()
    }

    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }

    pub fn push_fraction(
        &mut self,
        species_id: u16,
        size_bin_id: u8,
        liberation_class_id: u8,
        texture_profile_id: u32,
        quantity: f64,
    ) -> Result<(), JsValue> {
        self.inner
            .push_fraction(
                FractionDescriptor {
                    species_id,
                    size_bin_id,
                    liberation_class_id,
                    texture_profile_id,
                },
                quantity,
            )
            .map_err(js_error)
    }

    pub fn total_quantity(&self) -> f64 {
        self.inner.total_quantity()
    }

    pub fn scale_in_place(&mut self, factor: f64) -> Result<(), JsValue> {
        self.inner.scale_in_place(factor).map_err(js_error)
    }

    pub fn species_ids(&self) -> Vec<u16> {
        self.inner.to_columns().species_ids
    }

    pub fn size_bin_ids(&self) -> Vec<u8> {
        self.inner.to_columns().size_bin_ids
    }

    pub fn liberation_class_ids(&self) -> Vec<u8> {
        self.inner.to_columns().liberation_class_ids
    }

    pub fn texture_profile_ids(&self) -> Vec<u32> {
        self.inner.to_columns().texture_profile_ids
    }

    pub fn quantities(&self) -> Vec<f64> {
        self.inner.to_columns().quantities
    }
}

impl Default for WasmPackedSolidState {
    fn default() -> Self {
        Self::new()
    }
}

/// First finite-inventory object exposed from the permanent Rust simulation
/// core. It mirrors current Hopper mass/capacity/enthalpy behavior but uses
/// packed numeric execution state internally.
#[wasm_bindgen]
pub struct WasmPackedHopper {
    inner: PackedHopperState,
}

#[wasm_bindgen]
impl WasmPackedHopper {
    #[wasm_bindgen(constructor)]
    pub fn new(capacity_kg: f64) -> Result<WasmPackedHopper, JsValue> {
        Ok(Self {
            inner: PackedHopperState::empty(capacity_kg).map_err(js_error)?,
        })
    }

    pub fn push_fraction(
        &mut self,
        species_id: u16,
        size_bin_id: u8,
        liberation_class_id: u8,
        texture_profile_id: u32,
        quantity_kg: f64,
    ) -> Result<(), JsValue> {
        let next_mass = self.inner.stored_mass_kg() + quantity_kg;
        if !quantity_kg.is_finite() || quantity_kg < 0.0 {
            return Err(JsValue::from_str("Hopper fraction quantity must be finite and non-negative"));
        }
        if next_mass > self.inner.capacity_kg() + interlink_core::SOLID_MATERIAL_TOLERANCE {
            return Err(JsValue::from_str("Hopper fraction would exceed capacity"));
        }
        self.inner
            .body_mut()
            .solid_state_mut()
            .push_fraction(
                FractionDescriptor {
                    species_id,
                    size_bin_id,
                    liberation_class_id,
                    texture_profile_id,
                },
                quantity_kg,
            )
            .map_err(js_error)
    }

    pub fn set_sensible_enthalpy_j(&mut self, sensible_enthalpy_j: f64) -> Result<(), JsValue> {
        self.inner
            .body_mut()
            .set_sensible_enthalpy_j(sensible_enthalpy_j)
            .map_err(js_error)
    }

    pub fn capacity_kg(&self) -> f64 {
        self.inner.capacity_kg()
    }

    pub fn stored_mass_kg(&self) -> f64 {
        self.inner.stored_mass_kg()
    }

    pub fn free_capacity_kg(&self) -> f64 {
        self.inner.free_capacity_kg()
    }

    pub fn sensible_enthalpy_j(&self) -> f64 {
        self.inner.body().sensible_enthalpy_j()
    }

    /// Receive a packed flow state in one coarse WASM call. Flow quantities are
    /// kg/s and are clipped only by Hopper capacity.
    pub fn receive_flow(
        &mut self,
        flow: &WasmPackedSolidState,
        dt: f64,
        specific_sensible_enthalpy_j_per_kg: f64,
    ) -> Result<f64, JsValue> {
        self.inner
            .receive_flow(
                &flow.inner,
                dt,
                specific_sensible_enthalpy_j_per_kg,
            )
            .map_err(js_error)
    }

    /// Conservative storage-to-storage transfer inside WASM. No material arrays
    /// cross the JS/WASM boundary for the operation itself.
    pub fn transfer_to(
        &mut self,
        target: &mut WasmPackedHopper,
        max_rate_kg_per_second: f64,
        dt: f64,
    ) -> Result<f64, JsValue> {
        transfer_between_hoppers(
            &mut self.inner,
            &mut target.inner,
            max_rate_kg_per_second,
            dt,
        )
        .map_err(js_error)
    }
}

fn js_error(message: String) -> JsValue {
    JsValue::from_str(&message)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bridge_uses_same_fixed_step_as_core() {
        assert_eq!(simulation_step_seconds(), 0.1);
        assert_eq!(runtime_protocol_version(), 2);
    }

    #[test]
    fn wasm_hopper_uses_rust_storage_semantics() {
        let mut source = WasmPackedHopper::new(100.0).unwrap();
        source.push_fraction(1, 2, 1, 0, 50.0).unwrap();
        source.set_sensible_enthalpy_j(5_000.0).unwrap();
        let mut target = WasmPackedHopper::new(20.0).unwrap();
        let moved = source.transfer_to(&mut target, 30.0, 1.0).unwrap();
        assert!((moved - 20.0).abs() < 1e-12);
        assert!((source.stored_mass_kg() - 30.0).abs() < 1e-12);
        assert!((target.stored_mass_kg() - 20.0).abs() < 1e-12);
        assert!((source.sensible_enthalpy_j() - 3_000.0).abs() < 1e-12);
        assert!((target.sensible_enthalpy_j() - 2_000.0).abs() < 1e-12);
    }
}
