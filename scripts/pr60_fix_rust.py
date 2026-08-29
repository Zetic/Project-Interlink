from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'anchor missing in {path}: {old[:100]!r}')
    p.write_text(text.replace(old, new, 1))

replace_once(
    'rust/interlink-wasm/src/lib.rs',
    'pub const WASM_RUNTIME_PROTOCOL_VERSION: u32 = 3;',
    'pub const WASM_RUNTIME_PROTOCOL_VERSION: u32 = 4;',
)

replace_once(
    'rust/interlink-wasm/src/runtime_bridge.rs',
    '''        let (equipment, phase) = comminution_equipment(equipment_kind).map_err(js_error)?;\n        let runtime = PackedComminutionRuntime::new(\n            interlink_comminution::PackedComminutionConfig::new(\n                equipment,\n                target_size_bin_id,\n                target_particle_size_mm,\n                throughput_kg_per_second,\n                rated_power_kw,\n                enabled,\n            )''',
    '''        let (equipment, phase) = comminution_equipment(equipment_kind).map_err(js_error)?;\n        let rated_power =\n            (equipment != PackedComminutionEquipment::LegacyCrusher).then_some(rated_power_kw);\n        let runtime = PackedComminutionRuntime::new(\n            interlink_comminution::PackedComminutionConfig::new(\n                equipment,\n                target_size_bin_id,\n                target_particle_size_mm,\n                throughput_kg_per_second,\n                rated_power,\n                enabled,\n            )''',
)

replace_once(
    'rust/interlink-wasm/src/runtime_bridge.rs',
    '''    pub fn begin_live_reconfigure(&mut self) {\n        self.inner.begin_live_reconfigure();\n    }''',
    '''    pub fn clone_for_live_reconfigure(&self) -> WasmPackedWorldRuntime {\n        WasmPackedWorldRuntime {\n            inner: self.inner.clone(),\n            reaction_builder: None,\n        }\n    }\n\n    pub fn begin_live_reconfigure(&mut self) {\n        self.inner.begin_live_reconfigure();\n    }''',
)
