use interlink_core::SIMULATION_STEP_SECONDS;
use wasm_bindgen::prelude::*;

mod runtime_bridge;
pub use runtime_bridge::WasmPackedWorldRuntime;

pub const WASM_RUNTIME_PROTOCOL_VERSION: u32 = 6;

#[wasm_bindgen]
pub fn runtime_protocol_version() -> u32 {
    WASM_RUNTIME_PROTOCOL_VERSION
}

#[wasm_bindgen]
pub fn simulation_step_seconds() -> f64 {
    SIMULATION_STEP_SECONDS
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
        assert_eq!(runtime_protocol_version(), 6);
    }
}
