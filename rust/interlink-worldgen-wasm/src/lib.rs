use interlink_worldgen::{generate_synthetic, SyntheticDiagnostic, SyntheticRequest, WORLDGEN_ENGINE_VERSION};
use wasm_bindgen::prelude::*;

pub const WORLDGEN_WASM_PROTOCOL_VERSION: u32 = 1;

#[wasm_bindgen]
pub fn worldgen_protocol_version() -> u32 {
    WORLDGEN_WASM_PROTOCOL_VERSION
}

#[wasm_bindgen]
pub fn worldgen_engine_version() -> u32 {
    WORLDGEN_ENGINE_VERSION
}

#[wasm_bindgen]
pub struct WasmWorldgenDiagnostic {
    inner: SyntheticDiagnostic,
}

#[wasm_bindgen]
impl WasmWorldgenDiagnostic {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: String, width: u32, height: u32) -> Result<WasmWorldgenDiagnostic, JsValue> {
        let request = SyntheticRequest::new(seed, width, height);
        let inner = generate_synthetic(&request).map_err(|error| JsValue::from_str(&error.to_string()))?;
        Ok(Self { inner })
    }

    pub fn generator_version(&self) -> u32 { self.inner.generator_version }
    pub fn stage_id(&self) -> String { self.inner.stage.id.to_owned() }
    pub fn stage_version(&self) -> u32 { self.inner.stage.version }
    pub fn stage_seed_hex(&self) -> String { format!("{:016x}", self.inner.stage.derived_seed) }
    pub fn width(&self) -> u32 { self.inner.field.width() }
    pub fn height(&self) -> u32 { self.inner.field.height() }
    pub fn sample_count(&self) -> u64 { self.inner.statistics.sample_count }
    pub fn minimum(&self) -> u16 { self.inner.statistics.minimum }
    pub fn maximum(&self) -> u16 { self.inner.statistics.maximum }
    pub fn mean(&self) -> f64 { self.inner.statistics.mean }
    pub fn field_hash_hex(&self) -> String { self.inner.statistics.hash_hex() }
    pub fn values(&self) -> Vec<u16> { self.inner.field.values().to_vec() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wasm_protocol_and_engine_versions_are_explicit() {
        assert_eq!(worldgen_protocol_version(), 1);
        assert_eq!(worldgen_engine_version(), WORLDGEN_ENGINE_VERSION);
    }
}
