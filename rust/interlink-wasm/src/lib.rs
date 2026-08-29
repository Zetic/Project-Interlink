use interlink_core::{
    FractionDescriptor, PackedSolidState, SIMULATION_STEP_SECONDS,
};
use wasm_bindgen::prelude::*;

pub const WASM_RUNTIME_PROTOCOL_VERSION: u32 = 2;

#[wasm_bindgen]
pub fn runtime_protocol_version() -> u32 {
    WASM_RUNTIME_PROTOCOL_VERSION
}

#[wasm_bindgen]
pub fn simulation_step_seconds() -> f64 {
    SIMULATION_STEP_SECONDS
}

/// First browser-facing Rust simulation primitive. This deliberately exposes
/// coarse packed-state operations rather than one WASM call per simulation
/// fraction. The authoritative runtime will eventually own instances inside a
/// Worker and exchange commands/snapshots with the UI thread.
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
            .map_err(|message| JsValue::from_str(&message))
    }

    pub fn total_quantity(&self) -> f64 {
        self.inner.total_quantity()
    }

    pub fn scale_in_place(&mut self, factor: f64) -> Result<(), JsValue> {
        self.inner
            .scale_in_place(factor)
            .map_err(|message| JsValue::from_str(&message))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bridge_uses_same_fixed_step_as_core() {
        assert_eq!(simulation_step_seconds(), 0.1);
        assert_eq!(runtime_protocol_version(), 2);
    }
}
