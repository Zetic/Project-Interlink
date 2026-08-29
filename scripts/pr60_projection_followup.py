from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"anchor missing in {path}: {old[:180]!r}")
    p.write_text(text.replace(old, new, 1))


# Avoid applying a stale physical snapshot merely to reflect pause/resume state.
replace_once(
    'src/workspace/workspaceController.js',
    """  Promise.resolve(wsState.realtimeRuntime.resume()).then(() => {\n    if (epoch !== wsState.runtimeEpoch) return;\n    projectRuntimeSnapshot(wsState.realtimeRuntime.snapshot);\n    updateWorldControls();\n  }).catch(error => handleRuntimeFailure(error, epoch));""",
    """  Promise.resolve(wsState.realtimeRuntime.resume()).then(() => {\n    if (epoch !== wsState.runtimeEpoch) return;\n    if (wsState.world?.simulation) wsState.world.simulation.running = true;\n    updateWorldControls();\n  }).catch(error => handleRuntimeFailure(error, epoch));""",
)
replace_once(
    'src/workspace/workspaceController.js',
    """    Promise.resolve(wsState.realtimeRuntime.pause())\n      .then(() => projectRuntimeSnapshot(wsState.realtimeRuntime?.snapshot))\n      .catch(error => handleRuntimeFailure(error, epoch));""",
    """    Promise.resolve(wsState.realtimeRuntime.pause())\n      .then(() => {\n        if (epoch === wsState.runtimeEpoch && wsState.world?.simulation) {\n          wsState.world.simulation.running = false;\n          updateWorldControls();\n        }\n      })\n      .catch(error => handleRuntimeFailure(error, epoch));""",
)

# Furnace node card consumes the projected Rust scalar instead of stale JS state.
replace_once(
    'src/workspace/workspaceController.js',
    """  if (node.nodeType === 'roastingFurnace') {\n    const temperatureC = Number.isFinite(node.actualChargeTemperatureK) ? node.actualChargeTemperatureK - 273.15 : null;""",
    """  if (node.nodeType === 'roastingFurnace') {\n    const projectedTemperatureK = node.runtimePresentation?.furnace?.actualChargeTemperatureK;\n    const chargeTemperatureK = Number.isFinite(projectedTemperatureK)\n      ? projectedTemperatureK\n      : node.actualChargeTemperatureK;\n    const temperatureC = Number.isFinite(chargeTemperatureK) ? chargeTemperatureK - 273.15 : null;""",
)

# Worker-authoritative Exhaust Vent detail never falls back to stale canonical gas inventory.
replace_once(
    'src/workspace/inspector/inspectionViewModel.js',
    """export function exhaustVentInspection(blueprint, vent) {\n  const gasBody = vent?.emittedGasBody ?? createGasMaterialBody(createGasMaterialState());\n  const bodyDetails = exhaustBodyInspection(gasBody);""",
    """export function exhaustVentInspection(blueprint, vent) {\n  const projected = vent?.runtimePresentation?.authority === 'rust-wasm-worker'\n    ? vent.runtimePresentation\n    : null;\n  const gasBody = vent?.emittedGasBody ?? createGasMaterialBody(createGasMaterialState());\n  const bodyDetails = projected\n    ? {\n      totalEmittedMassKg: projected.ventedGasMassKg ?? 0,\n      composition: [],\n      temperatureK: null,\n      sensibleEnthalpyJ: 0,\n      thermalError: (projected.ventedGasMassKg ?? 0) > 0\n        ? 'Detailed exhaust state is retained in the Rust/WASM Worker.'\n        : null,\n      detailsUnavailable: true,\n    }\n    : exhaustBodyInspection(gasBody);""",
)

# Project all cheap furnace diagnostics currently owned by Rust.
replace_once(
    'src/workspace/inspector/inspectionViewModel.js',
    """    const feedRateKgPerSecond = actualFeedKgPerSecond > 0\n      ? actualFeedKgPerSecond\n      : (node.lastFeedRateKgPerSecond ?? 0);""",
    """    const feedRateKgPerSecond = projectedFurnace?.lastFeedRateKgPerSecond\n      ?? (actualFeedKgPerSecond > 0 ? actualFeedKgPerSecond : (node.lastFeedRateKgPerSecond ?? 0));""",
)
replace_once(
    'src/workspace/inspector/inspectionViewModel.js',
    """      heatLossPowerKw: projectedFurnace ? 0 : (node.lastHeatLossPowerKw ?? 0),\n      reactionPowerKw: projectedFurnace?.lastReactionPowerKw ?? node.lastReactionPowerKw ?? 0,\n      goethiteConversionPercent: (node.lastGoethiteConversionFraction ?? 0) * 100,""",
    """      heatLossPowerKw: projectedFurnace?.lastHeatLossPowerKw ?? node.lastHeatLossPowerKw ?? 0,\n      reactionPowerKw: projectedFurnace?.lastReactionPowerKw ?? node.lastReactionPowerKw ?? 0,\n      goethiteConversionPercent: (projectedFurnace?.lastGoethiteConversionFraction\n        ?? node.lastGoethiteConversionFraction\n        ?? 0) * 100,""",
)
replace_once(
    'src/workspace/inspector/inspectionViewModel.js',
    """      solverEvaluationCount: node.lastSolverEvaluationCount ?? 0,""",
    """      solverEvaluationCount: projectedFurnace?.lastSolverEvaluationCount\n        ?? node.lastSolverEvaluationCount\n        ?? 0,""",
)

# Rust storage links retain their actual scalar transfer result for presentation.
replace_once(
    'rust/interlink-runtime/src/lib.rs',
    """pub struct PackedStorageLink {\n    pub source_hopper_id: RuntimeNodeId,\n    pub target_hopper_id: RuntimeNodeId,\n    pub rate_kg_per_second: f64,\n}""",
    """pub struct PackedStorageLink {\n    pub source_hopper_id: RuntimeNodeId,\n    pub target_hopper_id: RuntimeNodeId,\n    pub rate_kg_per_second: f64,\n    pub last_moved_kg: f64,\n    pub last_rate_kg_per_second: f64,\n}""",
)
replace_once(
    'rust/interlink-runtime/src/lib.rs',
    """        site.passive_storage_links.push(PackedStorageLink {\n            source_hopper_id,\n            target_hopper_id,\n            rate_kg_per_second,\n        });""",
    """        site.passive_storage_links.push(PackedStorageLink {\n            source_hopper_id,\n            target_hopper_id,\n            rate_kg_per_second,\n            last_moved_kg: 0.0,\n            last_rate_kg_per_second: 0.0,\n        });""",
)
replace_once(
    'rust/interlink-runtime/src/lib.rs',
    """    pub fn boundary_transfer(&self, id: RuntimeTransferId) -> Option<&PackedBoundaryTransfer> {\n        self.boundary_transfers\n            .iter()\n            .find(|transfer| transfer.id == id)\n    }""",
    """    pub fn boundary_transfer(&self, id: RuntimeTransferId) -> Option<&PackedBoundaryTransfer> {\n        self.boundary_transfers\n            .iter()\n            .find(|transfer| transfer.id == id)\n    }\n\n    pub fn site_passive_storage_link(\n        &self,\n        site_id: RuntimeSiteId,\n        link_index: usize,\n    ) -> Option<&PackedStorageLink> {\n        self.sites.get(&site_id)?.passive_storage_links.get(link_index)\n    }""",
)
replace_once(
    'rust/interlink-runtime/src/lib.rs',
    """            for link in passive_links {\n                self.execute_storage_link(link, dt)?;\n            }""",
    """            for (link_index, link) in passive_links.into_iter().enumerate() {\n                let moved = self.execute_storage_link(link, dt)?;\n                if let Some(runtime_link) = self\n                    .sites\n                    .get_mut(&site_id)\n                    .and_then(|site| site.passive_storage_links.get_mut(link_index))\n                {\n                    runtime_link.last_moved_kg = moved;\n                    runtime_link.last_rate_kg_per_second = moved / dt;\n                }\n            }""",
)
replace_once(
    'rust/interlink-runtime/src/lib.rs',
    """                PackedStorageLink {\n                    source_hopper_id: transfer.source_hopper_id,\n                    target_hopper_id: transfer.target_hopper_id,\n                    rate_kg_per_second: transfer.capacity_kg_per_second,\n                },""",
    """                PackedStorageLink {\n                    source_hopper_id: transfer.source_hopper_id,\n                    target_hopper_id: transfer.target_hopper_id,\n                    rate_kg_per_second: transfer.capacity_kg_per_second,\n                    last_moved_kg: 0.0,\n                    last_rate_kg_per_second: 0.0,\n                },""",
)

# WASM scalar accessors for passive links and furnace diagnostics.
replace_once(
    'rust/interlink-wasm/src/runtime_bridge.rs',
    """    pub fn furnace_last_reaction_power_kw(&self, node_id: u32) -> f64 {\n        self.inner\n            .furnace_diagnostics(node_id)\n            .map(|value| value.last_reaction_power_kw)\n            .unwrap_or(0.0)\n    }""",
    """    pub fn furnace_last_reaction_power_kw(&self, node_id: u32) -> f64 {\n        self.inner\n            .furnace_diagnostics(node_id)\n            .map(|value| value.last_reaction_power_kw)\n            .unwrap_or(0.0)\n    }\n\n    pub fn furnace_last_heat_loss_power_kw(&self, node_id: u32) -> f64 {\n        self.inner\n            .furnace_diagnostics(node_id)\n            .map(|value| value.last_heat_loss_power_kw)\n            .unwrap_or(0.0)\n    }\n\n    pub fn furnace_last_feed_rate_kg_per_second(&self, node_id: u32) -> f64 {\n        self.inner\n            .furnace_diagnostics(node_id)\n            .map(|value| value.last_feed_rate_kg_per_second)\n            .unwrap_or(0.0)\n    }\n\n    pub fn furnace_last_product_rate_kg_per_second(&self, node_id: u32) -> f64 {\n        self.inner\n            .furnace_diagnostics(node_id)\n            .map(|value| value.last_product_rate_kg_per_second)\n            .unwrap_or(0.0)\n    }\n\n    pub fn furnace_last_goethite_conversion_fraction(&self, node_id: u32) -> f64 {\n        self.inner\n            .furnace_diagnostics(node_id)\n            .map(|value| value.last_goethite_conversion_fraction)\n            .unwrap_or(0.0)\n    }\n\n    pub fn furnace_last_solver_evaluation_count(&self, node_id: u32) -> u32 {\n        self.inner\n            .furnace_diagnostics(node_id)\n            .map(|value| value.last_solver_evaluation_count as u32)\n            .unwrap_or(0)\n    }\n\n    pub fn site_passive_link_last_moved_kg(&self, site_id: u32, link_index: u32) -> f64 {\n        self.inner\n            .site_passive_storage_link(site_id, link_index as usize)\n            .map(|value| value.last_moved_kg)\n            .unwrap_or(0.0)\n    }\n\n    pub fn site_passive_link_last_rate_kg_per_second(\n        &self,\n        site_id: u32,\n        link_index: u32,\n    ) -> f64 {\n        self.inner\n            .site_passive_storage_link(site_id, link_index as usize)\n            .map(|value| value.last_rate_kg_per_second)\n            .unwrap_or(0.0)\n    }""",
)

# Preserve the canonical passive connection identity and stable per-Site index.
replace_once(
    'src/simulation/packedWorldRuntimeCompiler.js',
    """    passiveLinks.push({\n      siteId,\n      sourceHopperId: nodeIds.idFor(source.id),\n      targetHopperId: nodeIds.idFor(target.id),\n      rateKgPerSecond: DEFAULT_PASSIVE_STORAGE_TRANSFER_KG_PER_SECOND,\n    });""",
    """    passiveLinks.push({\n      siteId,\n      siteLinkIndex: passiveLinks.length,\n      canonicalConnectionId: connection.id,\n      sourceHopperId: nodeIds.idFor(source.id),\n      targetHopperId: nodeIds.idFor(target.id),\n      rateKgPerSecond: DEFAULT_PASSIVE_STORAGE_TRANSFER_KG_PER_SECOND,\n    });""",
)

# Compact Worker snapshot now includes actual passive-link flow and complete cheap furnace scalars.
replace_once(
    'src/simulation/packedWorldWorkerSetup.js',
    """          lastReactionPowerKw: wasmWorld.furnace_last_reaction_power_kw(machine.nodeId),\n          chargeMassKg: wasmWorld.furnace_charge_mass_kg(machine.nodeId),\n          pendingFeedMassKg: wasmWorld.furnace_pending_feed_mass_kg(machine.nodeId),""",
    """          lastReactionPowerKw: wasmWorld.furnace_last_reaction_power_kw(machine.nodeId),\n          lastHeatLossPowerKw: wasmWorld.furnace_last_heat_loss_power_kw(machine.nodeId),\n          lastFeedRateKgPerSecond: wasmWorld.furnace_last_feed_rate_kg_per_second(machine.nodeId),\n          lastProductRateKgPerSecond: wasmWorld.furnace_last_product_rate_kg_per_second(machine.nodeId),\n          lastGoethiteConversionFraction: wasmWorld.furnace_last_goethite_conversion_fraction(machine.nodeId),\n          lastSolverEvaluationCount: wasmWorld.furnace_last_solver_evaluation_count(machine.nodeId),\n          chargeMassKg: wasmWorld.furnace_charge_mass_kg(machine.nodeId),\n          pendingFeedMassKg: wasmWorld.furnace_pending_feed_mass_kg(machine.nodeId),""",
)
replace_once(
    'src/simulation/packedWorldWorkerSetup.js',
    """    boundaryTransfers: setup.boundaryTransfers.map(transfer => ({\n      id: transfer.canonicalTransferId,""",
    """    passiveLinks: setup.passiveLinks.map(link => ({\n      id: link.canonicalConnectionId,\n      lastMovedKg: wasmWorld.site_passive_link_last_moved_kg(link.siteId, link.siteLinkIndex),\n      lastRateKgPerSecond: wasmWorld.site_passive_link_last_rate_kg_per_second(link.siteId, link.siteLinkIndex),\n    })),\n    boundaryTransfers: setup.boundaryTransfers.map(transfer => ({\n      id: transfer.canonicalTransferId,""",
)

# Browser projection applies those passive-link scalar rates to existing streams.
replace_once(
    'src/simulation/runtimePresentation.js',
    """function streamForConnection(blueprint, connectionId) {\n  return Object.values(blueprint?.streams ?? {}).find(stream => stream.connectionId === connectionId) ?? null;\n}""",
    """function streamForConnection(blueprint, connectionId) {\n  return Object.values(blueprint?.streams ?? {}).find(stream => stream.connectionId === connectionId) ?? null;\n}\n\nfunction streamForConnectionAcrossWorld(world, connectionId) {\n  for (const blueprint of uniqueBlueprints(world)) {\n    const stream = streamForConnection(blueprint, connectionId);\n    if (stream) return stream;\n  }\n  return null;\n}""",
)
replace_once(
    'src/simulation/runtimePresentation.js',
    """  for (const ventSnapshot of snapshot.exhaustVents ?? []) {\n    const node = runtimeNode(world, ventSnapshot.id);\n    if (!node) continue;\n    setHidden(node, 'runtimePresentation', {\n      authority: RUST_WORKER_PRESENTATION_AUTHORITY,\n      ventedGasMassKg: ventSnapshot.ventedGasMassKg ?? 0,\n    });\n  }\n\n  for (const transferSnapshot of snapshot.boundaryTransfers ?? []) {""",
    """  for (const ventSnapshot of snapshot.exhaustVents ?? []) {\n    const node = runtimeNode(world, ventSnapshot.id);\n    if (!node) continue;\n    setHidden(node, 'runtimePresentation', {\n      authority: RUST_WORKER_PRESENTATION_AUTHORITY,\n      ventedGasMassKg: ventSnapshot.ventedGasMassKg ?? 0,\n    });\n  }\n\n  for (const linkSnapshot of snapshot.passiveLinks ?? []) {\n    const stream = streamForConnectionAcrossWorld(world, linkSnapshot.id);\n    setStreamFlow(stream, linkSnapshot.lastRateKgPerSecond ?? 0);\n  }\n\n  for (const transferSnapshot of snapshot.boundaryTransfers ?? []) {""",
)
