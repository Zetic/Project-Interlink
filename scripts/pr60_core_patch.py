from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"anchor missing in {path}: {old[:100]!r}")
    p.write_text(text.replace(old, new, 1))


# Register the sibling module that owns edit-time topology mutation.
p = Path('rust/interlink-runtime/src/lib.rs')
text = p.read_text()
if 'mod live_reconfigure;' not in text:
    p.write_text('mod live_reconfigure;\n\n' + text)

# Keep canonical runtime IDs stable across recompile/reconfigure passes.
replace_once(
    'src/simulation/packedWorldRuntimeCompiler.js',
    "class RuntimeObjectIdTable {\n  constructor(label) {\n    this.label = label;\n    this.ids = new Map();\n    this.values = [];\n    this.sealed = false;\n  }",
    "class RuntimeObjectIdTable {\n  constructor(label, seedValues = []) {\n    this.label = label;\n    this.ids = new Map();\n    this.values = [];\n    this.sealed = false;\n    for (let id = 0; id < (seedValues?.length ?? 0); id++) {\n      const value = seedValues[id];\n      if (typeof value !== 'string' || value.length === 0) continue;\n      if (id >= PACKED_NO_RUNTIME_ID) throw new Error(`${label} runtime ID seed exceeds capacity`);\n      this.ids.set(value, id);\n      this.values[id] = value;\n    }\n  }"
)
replace_once(
    'src/simulation/packedWorldRuntimeCompiler.js',
    "export function compilePackedWorldRuntime(\n  world,\n  idTables = createPackedMaterialIdTables(),\n) {\n  const simulation = createWorldSimulation(world);\n  const nodeIds = new RuntimeObjectIdTable('node');\n  const siteIds = new RuntimeObjectIdTable('Site');\n  const occurrenceIds = new RuntimeObjectIdTable('ResourceOccurrence');\n  const transferIds = new RuntimeObjectIdTable('boundary transfer');",
    "export function compilePackedWorldRuntime(\n  world,\n  idTables = createPackedMaterialIdTables(),\n  runtimeIdSeeds = {},\n) {\n  const simulation = createWorldSimulation(world);\n  const nodeIds = new RuntimeObjectIdTable('node', runtimeIdSeeds.nodes);\n  const siteIds = new RuntimeObjectIdTable('Site', runtimeIdSeeds.sites);\n  const occurrenceIds = new RuntimeObjectIdTable('ResourceOccurrence', runtimeIdSeeds.occurrences);\n  const transferIds = new RuntimeObjectIdTable('boundary transfer', runtimeIdSeeds.transfers);"
)

# Seed both material and object ID vocabularies from the currently running Worker.
replace_once(
    'src/simulation/packedWorldWorkerSetup.js',
    "import { compilePackedWorldRuntime } from './packedWorldRuntimeCompiler.js';",
    "import { compilePackedWorldRuntime } from './packedWorldRuntimeCompiler.js';\nimport { createPackedMaterialIdTablesFromValues } from './packedRuntimeCompiler.js';\nimport { getNodePortDefinitions } from './simulationEngine.js';"
)
replace_once(
    'src/simulation/packedWorldWorkerSetup.js',
    "export function compilePackedWorldWorkerSetup(world) {\n  const compiled = compilePackedWorldRuntime(world);",
    "function canonicalRuntimeNode(world, canonicalNodeId) {\n  for (const blueprint of Object.values(world?.simulation?.sessions ?? {})) {\n    if (blueprint?.nodes?.[canonicalNodeId]) return blueprint.nodes[canonicalNodeId];\n  }\n  for (const workspace of Object.values(world?.simulation?.workspaces ?? {})) {\n    if (workspace?.nodes?.[canonicalNodeId]) return workspace.nodes[canonicalNodeId];\n  }\n  return null;\n}\n\nfunction materialPortIds(node, direction) {\n  return getNodePortDefinitions(node)\n    .filter(port => port.kind === 'material' && port.direction === direction)\n    .map(port => port.id);\n}\n\nexport function compilePackedWorldWorkerSetup(world, { previousSetup = null } = {}) {\n  const idTables = previousSetup\n    ? createPackedMaterialIdTablesFromValues(previousSetup.materialIds)\n    : undefined;\n  const compiled = compilePackedWorldRuntime(\n    world,\n    idTables,\n    previousSetup?.runtimeIds ?? {},\n  );"
)
replace_once(
    'src/simulation/packedWorldWorkerSetup.js',
    "    machines: cloneRows(compiled.machines).map(machine => ({\n      ...machine,\n      outputTarget: machine.outputTarget ? { ...machine.outputTarget } : undefined,\n      productTarget: machine.productTarget ? { ...machine.productTarget } : undefined,\n    })),",
    "    machines: cloneRows(compiled.machines).map(machine => {\n      const canonicalNodeId = compiled.runtimeIds.nodeIds.valueFor(machine.nodeId);\n      const node = canonicalRuntimeNode(world, canonicalNodeId);\n      return {\n        ...machine,\n        canonicalNodeId,\n        inputPortIds: materialPortIds(node, 'input'),\n        outputPortIds: materialPortIds(node, 'output'),\n        outputTarget: machine.outputTarget ? { ...machine.outputTarget } : undefined,\n        productTarget: machine.productTarget ? { ...machine.productTarget } : undefined,\n      };\n    }),"
)
replace_once(
    'src/simulation/packedWorldWorkerSetup.js',
    "        outputMassFlowKgPerSecond: Array.from(\n          { length: outputCount(machine) },\n          (_, index) => wasmWorld.node_output_mass_flow_kg_per_second(machine.nodeId, index),\n        ),",
    "        inputMassFlowKgPerSecond: machine.inputPortIds.map(\n          (_, index) => wasmWorld.node_input_mass_flow_kg_per_second(machine.nodeId, index),\n        ),\n        outputMassFlowKgPerSecond: Array.from(\n          { length: outputCount(machine) },\n          (_, index) => wasmWorld.node_output_mass_flow_kg_per_second(machine.nodeId, index),\n        ),"
)
replace_once(
    'src/simulation/packedWorldWorkerSetup.js',
    "          lastReactionPowerKw: wasmWorld.furnace_last_reaction_power_kw(machine.nodeId),",
    "          lastReactionPowerKw: wasmWorld.furnace_last_reaction_power_kw(machine.nodeId),\n          chargeMassKg: wasmWorld.furnace_charge_mass_kg(machine.nodeId),\n          pendingFeedMassKg: wasmWorld.furnace_pending_feed_mass_kg(machine.nodeId),"
)

# Append a second wasm-bindgen impl block rather than perturbing the proven setup bridge.
bridge = Path('rust/interlink-wasm/src/runtime_bridge.rs')
text = bridge.read_text()
marker = "\nimpl Default for WasmPackedWorldRuntime {"
if marker not in text:
    raise SystemExit('runtime bridge default impl anchor missing')
if 'pub fn begin_live_reconfigure(&mut self)' not in text:
    extra = r'''

#[wasm_bindgen]
impl WasmPackedWorldRuntime {
    pub fn begin_live_reconfigure(&mut self) {
        self.inner.begin_live_reconfigure();
    }

    #[allow(clippy::too_many_arguments)]
    pub fn replace_hopper_state_live(
        &mut self,
        node_id: u32,
        capacity_kg: f64,
        species_ids: Vec<u16>,
        size_bin_ids: Vec<u8>,
        liberation_class_ids: Vec<u8>,
        texture_profile_ids: Vec<u32>,
        quantities: Vec<f64>,
        sensible_enthalpy_j: f64,
    ) -> Result<(), JsValue> {
        let body = solid_body_from_columns(
            species_ids,
            size_bin_ids,
            liberation_class_ids,
            texture_profile_ids,
            quantities,
            sensible_enthalpy_j,
        ).map_err(js_error)?;
        let hopper = PackedHopperState::new(capacity_kg, body).map_err(js_error)?;
        self.inner.replace_hopper_live(node_id, hopper).map_err(js_error)
    }

    pub fn remove_hopper_if_empty_live(&mut self, node_id: u32) -> Result<(), JsValue> {
        self.inner.remove_hopper_if_empty_live(node_id).map_err(js_error)
    }

    pub fn replace_exhaust_vent_state_live(
        &mut self,
        node_id: u32,
        species_ids: Vec<u16>,
        quantities: Vec<f64>,
        sensible_enthalpy_j: f64,
    ) -> Result<(), JsValue> {
        let body = gas_body_from_columns(species_ids, quantities, sensible_enthalpy_j)
            .map_err(js_error)?;
        self.inner.replace_exhaust_vent_live(node_id, body).map_err(js_error)
    }

    pub fn remove_exhaust_vent_live(&mut self, node_id: u32) {
        self.inner.remove_exhaust_vent_live(node_id);
    }

    pub fn upsert_extractor_live(
        &mut self,
        site_id: u32,
        node_id: u32,
        ordinal: u32,
        rate_kg_per_second: f64,
        enabled: bool,
        occurrence_id: u32,
        output_hopper_id: u32,
    ) -> Result<(), JsValue> {
        let runtime = PackedExtractorRuntime::new(
            PackedExtractorConfig::new(rate_kg_per_second, enabled).map_err(js_error)?,
        );
        self.inner.upsert_extractor_live(
            site_id, node_id, ordinal, runtime,
            optional_id(occurrence_id), optional_id(output_hopper_id),
        ).map_err(js_error)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn upsert_merger_live(
        &mut self,
        site_id: u32,
        node_id: u32,
        ordinal: u32,
        throughput_kg_per_second: f64,
        enabled: bool,
        input_a_hopper_id: u32,
        input_b_hopper_id: u32,
        output_hopper_id: u32,
    ) -> Result<(), JsValue> {
        let runtime = PackedMergerRuntime::new(
            PackedMergerConfig::new(throughput_kg_per_second, enabled).map_err(js_error)?,
        );
        self.inner.upsert_merger_live(
            site_id, node_id, ordinal, runtime,
            optional_id(input_a_hopper_id), optional_id(input_b_hopper_id),
            optional_id(output_hopper_id),
        ).map_err(js_error)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn upsert_feeder_live(
        &mut self,
        site_id: u32,
        node_id: u32,
        ordinal: u32,
        flow_rate_kg_per_second: f64,
        throughput_kg_per_second: f64,
        enabled: bool,
        input_hopper_id: u32,
        output_target_kind: u8,
        output_target_id: u32,
    ) -> Result<(), JsValue> {
        let runtime = PackedFeederRuntime::new(
            PackedFeederConfig::new(flow_rate_kg_per_second, throughput_kg_per_second, enabled)
                .map_err(js_error)?,
        );
        self.inner.upsert_feeder_live(
            site_id, node_id, ordinal, runtime,
            optional_id(input_hopper_id),
            solid_target(output_target_kind, output_target_id).map_err(js_error)?,
        ).map_err(js_error)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn upsert_comminution_live(
        &mut self,
        site_id: u32,
        node_id: u32,
        ordinal: u32,
        equipment_kind: u8,
        target_size_bin_id: u8,
        target_particle_size_mm: f64,
        throughput_kg_per_second: f64,
        rated_power_kw: f64,
        enabled: bool,
        input_hopper_id: u32,
        output_hopper_id: u32,
    ) -> Result<(), JsValue> {
        let (equipment, phase) = comminution_equipment(equipment_kind).map_err(js_error)?;
        let runtime = PackedComminutionRuntime::new(
            interlink_comminution::PackedComminutionConfig::new(
                equipment,
                target_size_bin_id,
                target_particle_size_mm,
                throughput_kg_per_second,
                rated_power_kw,
                enabled,
            ).map_err(js_error)?,
        );
        self.inner.upsert_comminution_live(
            site_id, node_id, phase, ordinal, runtime,
            optional_id(input_hopper_id), optional_id(output_hopper_id),
        ).map_err(js_error)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn upsert_screen_live(
        &mut self,
        site_id: u32,
        node_id: u32,
        ordinal: u32,
        aperture_size_mm: f64,
        throughput_kg_per_second: f64,
        enabled: bool,
        input_hopper_id: u32,
        undersize_hopper_id: u32,
        oversize_hopper_id: u32,
    ) -> Result<(), JsValue> {
        let runtime = PackedScreenRuntime::new(
            PackedScreenConfig::new(aperture_size_mm, throughput_kg_per_second, enabled)
                .map_err(js_error)?,
        );
        self.inner.upsert_screen_live(
            site_id, node_id, ordinal, runtime,
            optional_id(input_hopper_id), optional_id(undersize_hopper_id),
            optional_id(oversize_hopper_id),
        ).map_err(js_error)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn upsert_splitter_live(
        &mut self,
        site_id: u32,
        node_id: u32,
        ordinal: u32,
        split_fraction_to_a: f64,
        throughput_kg_per_second: f64,
        enabled: bool,
        input_hopper_id: u32,
        output_a_hopper_id: u32,
        output_b_hopper_id: u32,
    ) -> Result<(), JsValue> {
        let runtime = PackedSplitterRuntime::new(
            PackedSplitterConfig::new(split_fraction_to_a, throughput_kg_per_second, enabled)
                .map_err(js_error)?,
        );
        self.inner.upsert_splitter_live(
            site_id, node_id, ordinal, runtime,
            optional_id(input_hopper_id), optional_id(output_a_hopper_id),
            optional_id(output_b_hopper_id),
        ).map_err(js_error)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn upsert_magnetic_separator_live(
        &mut self,
        site_id: u32,
        node_id: u32,
        ordinal: u32,
        field_strength: f64,
        max_feed_particle_size_mm: f64,
        throughput_kg_per_second: f64,
        enabled: bool,
        input_hopper_id: u32,
        concentrate_hopper_id: u32,
        tailings_hopper_id: u32,
    ) -> Result<(), JsValue> {
        let runtime = PackedMagneticSeparatorRuntime::new(
            PackedMagneticSeparatorConfig::new(
                field_strength,
                max_feed_particle_size_mm,
                throughput_kg_per_second,
                enabled,
            ).map_err(js_error)?,
        );
        self.inner.upsert_magnetic_separator_live(
            site_id, node_id, ordinal, runtime,
            optional_id(input_hopper_id), optional_id(concentrate_hopper_id),
            optional_id(tailings_hopper_id),
        ).map_err(js_error)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn upsert_roasting_furnace_live(
        &mut self,
        site_id: u32,
        node_id: u32,
        ordinal: u32,
        temperature_setpoint_k: f64,
        rated_heater_power_kw: f64,
        maximum_operating_temperature_k: f64,
        maximum_solid_throughput_kg_per_second: f64,
        effective_chamber_hold_up_kg: f64,
        heat_loss_coefficient_w_per_k: f64,
        internal_zone_count: u32,
        enabled: bool,
        product_target_kind: u8,
        product_target_id: u32,
        gas_vent_id: u32,
        preserve_retained_state: bool,
    ) -> Result<(), JsValue> {
        let runtime = PackedRoastingFurnaceRuntime::new(
            PackedRoastingFurnaceConfig::new(
                temperature_setpoint_k,
                rated_heater_power_kw,
                maximum_operating_temperature_k,
                maximum_solid_throughput_kg_per_second,
                effective_chamber_hold_up_kg,
                heat_loss_coefficient_w_per_k,
                internal_zone_count as usize,
                enabled,
            ).map_err(js_error)?,
        );
        self.inner.upsert_roasting_furnace_live(
            site_id, node_id, ordinal, runtime,
            solid_target(product_target_kind, product_target_id).map_err(js_error)?,
            optional_id(gas_vent_id), preserve_retained_state,
        ).map_err(js_error)
    }

    pub fn finish_live_reconfigure(&mut self, active_machine_ids: Vec<u32>) -> Result<(), JsValue> {
        self.inner.finish_live_reconfigure(&active_machine_ids).map_err(js_error)
    }

    pub fn node_input_mass_flow_kg_per_second(&self, node_id: u32, input_index: u32) -> f64 {
        self.inner
            .node_input_mass_flow_kg_per_second(node_id, input_index as usize)
            .unwrap_or(0.0)
    }

    pub fn furnace_charge_mass_kg(&self, node_id: u32) -> f64 {
        self.inner.furnace_charge_mass_kg(node_id).unwrap_or(0.0)
    }

    pub fn furnace_pending_feed_mass_kg(&self, node_id: u32) -> f64 {
        self.inner.furnace_pending_feed_mass_kg(node_id).unwrap_or(0.0)
    }
}
'''
    text = text.replace(marker, extra + marker, 1)
    bridge.write_text(text)
