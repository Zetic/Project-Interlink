from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"anchor missing in {path}: {old[:160]!r}")
    p.write_text(text.replace(old, new, 1))


# MaterialStream reads compact Worker flow projection without replacing physical state.
replace_once(
    'src/simulation/materialStream.js',
    """export function totalMaterialStreamMassFlowKgPerSecond(stream) {\n  if (!Number.isFinite(stream?._cachedTotalMassFlowKgPerSecond)) refreshCachedTotalFlow(stream);\n  return stream._cachedTotalMassFlowKgPerSecond;\n}""",
    """export function totalMaterialStreamMassFlowKgPerSecond(stream) {\n  const projected = stream?._runtimePresentationMassFlowKgPerSecond;\n  if (Number.isFinite(projected) && projected >= 0) return projected;\n  if (!Number.isFinite(stream?._cachedTotalMassFlowKgPerSecond)) refreshCachedTotalFlow(stream);\n  return stream._cachedTotalMassFlowKgPerSecond;\n}""",
)

# Machine state labels are Worker-projected when Rust is authoritative.
replace_once(
    'src/simulation/simulationEngine.js',
    """export function getNodeOperatingState(node) {\n  if (!node) return null;\n  if (typeof apparatusRuntimeFor(node.nodeType)?.simulate === 'function') return node.enabled ? (node.operatingState ?? 'idle') : 'off';\n  return null;\n}""",
    """export function getNodeOperatingState(node) {\n  if (!node) return null;\n  const projected = node.runtimePresentation?.operatingState;\n  if (typeof projected === 'string') return projected;\n  if (typeof apparatusRuntimeFor(node.nodeType)?.simulate === 'function') return node.enabled ? (node.operatingState ?? 'idle') : 'off';\n  return null;\n}""",
)

# Furnace deletion safety must use Rust-retained mass after the cutover.
replace_once(
    'src/workspace/graph/nodeRemoval.js',
    """export function nodeOwnedMatterKg(node) {\n  if (node?.nodeType === 'hopper') return hopperStoredMassKg(node);\n  if (node?.nodeType === 'roastingFurnace') {\n    return roastingFurnaceChargeMassKg(node) + roastingFurnacePendingFeedMassKg(node);\n  }\n  return 0;\n}""",
    """export function nodeOwnedMatterKg(node) {\n  if (node?.nodeType === 'hopper') return hopperStoredMassKg(node);\n  if (node?.nodeType === 'roastingFurnace') {\n    const projected = node.runtimePresentation?.retainedMassKg;\n    if (Number.isFinite(projected) && projected >= 0) return projected;\n    return roastingFurnaceChargeMassKg(node) + roastingFurnacePendingFeedMassKg(node);\n  }\n  return 0;\n}""",
)

# Workspace scheduler state for one in-flight physics step and serialized edits.
replace_once(
    'src/workspace/workspaceState.js',
    """    simRunning: false,\n    simLastTime: null,""",
    """    simRunning: false,\n    realtimeRuntime: null,\n    runtimeReady: false,\n    runtimeError: null,\n    runtimeEpoch: 0,\n    runtimeMutationPending: 0,\n    runtimeMutationChain: null,\n    simStepInFlight: false,\n    simLastTime: null,""",
)

# Inspector: never present stale JS fractions as authoritative Worker detail.
replace_once(
    'src/workspace/inspector/inspectionViewModel.js',
    """export function hopperInspection(hopper) {\n  const revision = hopper?.materialRevision ?? 0;\n  const materialBody = hopper?.materialBody ?? null;\n  const cached = HOPPER_INSPECTION_CACHE.get(hopper);""",
    """export function hopperInspection(hopper) {\n  const revision = hopper?.materialRevision ?? 0;\n  const materialBody = hopper?.materialBody ?? null;\n  const runtimePresentation = hopper?.runtimePresentation ?? null;\n  const workerProjected = runtimePresentation?.authority === 'rust-wasm-worker';\n  const cached = HOPPER_INSPECTION_CACHE.get(hopper);""",
)
replace_once(
    'src/workspace/inspector/inspectionViewModel.js',
    """    && cached.materialBody === materialBody\n    && cached.capacityKg === hopper?.capacityKg""",
    """    && cached.materialBody === materialBody\n    && cached.runtimePresentation === runtimePresentation\n    && cached.capacityKg === hopper?.capacityKg""",
)
replace_once(
    'src/workspace/inspector/inspectionViewModel.js',
    """  const storedMassKg = hopperStoredMassKg(hopper);\n  const thermal = thermalDetailsForBody(materialBody, storedMassKg);\n  const compositionSummary = hopperCompositionKg(hopper);\n  const compositionRows = summaryRows(compositionSummary, storedMassKg, speciesLabel);""",
    """  const storedMassKg = hopperStoredMassKg(hopper);\n  const thermal = workerProjected\n    ? {\n      temperatureK: null,\n      sensibleEnthalpyJ: runtimePresentation.sensibleEnthalpyJ ?? 0,\n      thermalError: storedMassKg > 0 ? 'Detailed material state is retained in the Rust/WASM Worker.' : null,\n    }\n    : thermalDetailsForBody(materialBody, storedMassKg);\n  const compositionSummary = workerProjected ? {} : hopperCompositionKg(hopper);\n  const compositionRows = summaryRows(compositionSummary, storedMassKg, speciesLabel);""",
)
replace_once(
    'src/workspace/inspector/inspectionViewModel.js',
    """    particleSizeDistribution: summaryRows(hopperParticleSizeDistributionKg(hopper), storedMassKg, sizeBinLabel),\n    liberationDistribution: summaryRows(hopperLiberationDistributionKg(hopper), storedMassKg, liberationLabel),\n  };\n  HOPPER_INSPECTION_CACHE.set(hopper, {\n    revision,\n    materialBody,""",
    """    particleSizeDistribution: workerProjected ? [] : summaryRows(hopperParticleSizeDistributionKg(hopper), storedMassKg, sizeBinLabel),\n    liberationDistribution: workerProjected ? [] : summaryRows(hopperLiberationDistributionKg(hopper), storedMassKg, liberationLabel),\n    detailsUnavailable: workerProjected,\n  };\n  HOPPER_INSPECTION_CACHE.set(hopper, {\n    revision,\n    materialBody,\n    runtimePresentation,""",
)

replace_once(
    'src/workspace/inspector/inspectionViewModel.js',
    """  const stateRef = stream.physicalForm === MATERIAL_FORMS.GAS ? stream.gasState : stream.solidState;\n  const cached = STREAM_INSPECTION_CACHE.get(stream);""",
    """  const stateRef = stream.physicalForm === MATERIAL_FORMS.GAS ? stream.gasState : stream.solidState;\n  const projectedFlow = stream._runtimePresentationMassFlowKgPerSecond;\n  const workerProjected = Number.isFinite(projectedFlow) && projectedFlow >= 0;\n  const cached = STREAM_INSPECTION_CACHE.get(stream);""",
)
replace_once(
    'src/workspace/inspector/inspectionViewModel.js',
    """    && cached.stateRef === stateRef\n    && cached.physicalForm === stream.physicalForm""",
    """    && cached.stateRef === stateRef\n    && cached.projectedFlow === projectedFlow\n    && cached.physicalForm === stream.physicalForm""",
)
replace_once(
    'src/workspace/inspector/inspectionViewModel.js',
    """  const compositionSummary = gas\n    ? { ...(stream.gasState?.speciesMassKg ?? {}) }\n    : summarizeSolidMaterialBySpecies(stream.solidState);\n  const thermal = streamThermalDetails(stream, totalFlowKgPerSecond);""",
    """  const compositionSummary = workerProjected\n    ? {}\n    : (gas\n      ? { ...(stream.gasState?.speciesMassKg ?? {}) }\n      : summarizeSolidMaterialBySpecies(stream.solidState));\n  const thermal = workerProjected\n    ? {\n      temperatureK: null,\n      specificSensibleEnthalpyJPerKg: 0,\n      thermalError: totalFlowKgPerSecond > 0 ? 'Detailed stream state is retained in the Rust/WASM Worker.' : null,\n    }\n    : streamThermalDetails(stream, totalFlowKgPerSecond);""",
)
replace_once(
    'src/workspace/inspector/inspectionViewModel.js',
    """    particleSizeDistribution: gas\n      ? []\n      : summaryRows(summarizeSolidMaterialBySizeBin(stream.solidState), totalFlowKgPerSecond, sizeBinLabel),\n    liberationDistribution: gas\n      ? []\n      : summaryRows(summarizeSolidMaterialByLiberationClass(stream.solidState), totalFlowKgPerSecond, liberationLabel),""",
    """    particleSizeDistribution: gas || workerProjected\n      ? []\n      : summaryRows(summarizeSolidMaterialBySizeBin(stream.solidState), totalFlowKgPerSecond, sizeBinLabel),\n    liberationDistribution: gas || workerProjected\n      ? []\n      : summaryRows(summarizeSolidMaterialByLiberationClass(stream.solidState), totalFlowKgPerSecond, liberationLabel),""",
)
replace_once(
    'src/workspace/inspector/inspectionViewModel.js',
    """    thermalError: thermal.thermalError,\n  };\n  STREAM_INSPECTION_CACHE.set(stream, {\n    stateRef,""",
    """    thermalError: thermal.thermalError,\n    detailsUnavailable: workerProjected,\n  };\n  STREAM_INSPECTION_CACHE.set(stream, {\n    stateRef,\n    projectedFlow,""",
)
replace_once(
    'src/workspace/inspector/inspectionViewModel.js',
    """    lastError: node?.lastError ?? null,""",
    """    lastError: node?.runtimePresentation?.lastError ?? node?.lastError ?? null,""",
)
replace_once(
    'src/workspace/inspector/inspectionViewModel.js',
    """  if (node?.nodeType === 'roastingFurnace') {\n    const chargeMassKg = roastingFurnaceChargeMassKg(node);\n    const pendingFeedMassKg = roastingFurnacePendingFeedMassKg(node);""",
    """  if (node?.nodeType === 'roastingFurnace') {\n    const projectedFurnace = node.runtimePresentation?.furnace ?? null;\n    const chargeMassKg = projectedFurnace?.chargeMassKg ?? roastingFurnaceChargeMassKg(node);\n    const pendingFeedMassKg = projectedFurnace?.pendingFeedMassKg ?? roastingFurnacePendingFeedMassKg(node);""",
)
replace_once(
    'src/workspace/inspector/inspectionViewModel.js',
    """      chargeTemperatureK: chargeMassKg > 0 ? (node.actualChargeTemperatureK ?? null) : null,\n      temperatureSetpointK: node.temperatureSetpointK,\n      ratedHeaterPowerKw: node.ratedHeaterPowerKw,\n      actualHeaterPowerKw: node.lastHeaterPowerKw ?? 0,\n      heatLossPowerKw: node.lastHeatLossPowerKw ?? 0,\n      reactionPowerKw: node.lastReactionPowerKw ?? 0,""",
    """      chargeTemperatureK: chargeMassKg > 0\n        ? (projectedFurnace?.actualChargeTemperatureK ?? node.actualChargeTemperatureK ?? null)\n        : null,\n      temperatureSetpointK: node.temperatureSetpointK,\n      ratedHeaterPowerKw: node.ratedHeaterPowerKw,\n      actualHeaterPowerKw: projectedFurnace?.lastHeaterPowerKw ?? node.lastHeaterPowerKw ?? 0,\n      heatLossPowerKw: projectedFurnace ? 0 : (node.lastHeatLossPowerKw ?? 0),\n      reactionPowerKw: projectedFurnace?.lastReactionPowerKw ?? node.lastReactionPowerKw ?? 0,""",
)
replace_once(
    'src/workspace/inspector/inspectionViewModel.js',
    """      zones: (node.zones ?? []).map((zone, index) => furnaceZoneInspection(zone, index, zoneCapacityKg)),\n    };""",
    """      zones: projectedFurnace ? [] : (node.zones ?? []).map((zone, index) => furnaceZoneInspection(zone, index, zoneCapacityKg)),\n      detailsUnavailable: Boolean(projectedFurnace),\n    };""",
)

# Workspace switches from direct worldSimulationTick to the realtime facade.
replace_once(
    'src/workspace/workspaceController.js',
    """  removeBoundaryTransfer,\n  getSimulationWorkspace,\n  pauseWorldSimulation,\n  resumeWorldSimulation,\n  worldSimulationTick,\n} from '../simulation/worldSimulation.js';""",
    """  removeBoundaryTransfer,\n  getSimulationWorkspace,\n} from '../simulation/worldSimulation.js';\nimport {\n  createRealtimeRuntime,\n  REALTIME_RUNTIME_BACKENDS,\n} from '../simulation/realtimeRuntime.js';\nimport {\n  applyRustWorkerRuntimeSnapshot,\n  clearRustWorkerRuntimePresentation,\n} from '../simulation/runtimePresentation.js';""",
)
replace_once(
    'src/workspace/workspaceController.js',
    """function currentPlanet() { return wsState.world?.planets?.[wsState.world?.planetId] ?? null; }\n\nfunction requestPlayerWorldGeneration(seed) {""",
    """function currentPlanet() { return wsState.world?.planets?.[wsState.world?.planetId] ?? null; }\n\nfunction runtimeUsesRustWorker() {\n  return wsState.realtimeRuntime?.backend === REALTIME_RUNTIME_BACKENDS.RUST_WASM_WORKER;\n}\n\nfunction projectRuntimeSnapshot(snapshot) {\n  if (!snapshot || !wsState.world || !runtimeUsesRustWorker()) return;\n  applyRustWorkerRuntimeSnapshot(wsState.world, wsState.realtimeRuntime, snapshot);\n}\n\nfunction handleRuntimeFailure(error, epoch = wsState.runtimeEpoch) {\n  if (epoch !== wsState.runtimeEpoch) return;\n  wsState.runtimeError = error instanceof Error ? error : new Error(String(error));\n  wsState.simRunning = false;\n  wsState.simStepInFlight = false;\n  if (wsState.world?.simulation) wsState.world.simulation.running = false;\n  if (wsState.simRafId != null) cancelAnimationFrame(wsState.simRafId);\n  wsState.simRafId = null;\n  inspector.message = `Simulation runtime error: ${wsState.runtimeError.message}`;\n  inspector.renderKey = null;\n  updateWorldControls();\n  if (wsState.currentLevel === 'site') updateInspector(true);\n}\n\nfunction queueRuntimeReconfigure({ resetNodeIds = [] } = {}) {\n  const runtime = wsState.realtimeRuntime;\n  if (!runtime || runtime.backend === REALTIME_RUNTIME_BACKENDS.MAIN_THREAD) return Promise.resolve(null);\n  const epoch = wsState.runtimeEpoch;\n  wsState.runtimeMutationPending += 1;\n  const previous = wsState.runtimeMutationChain ?? Promise.resolve();\n  const task = previous.catch(() => null).then(async () => {\n    if (epoch !== wsState.runtimeEpoch) return null;\n    const payload = await runtime.reconfigure(wsState.world, { resetNodeIds });\n    if (epoch !== wsState.runtimeEpoch) return null;\n    projectRuntimeSnapshot(payload?.snapshot ?? runtime.snapshot);\n    renderRealtimePresentation();\n    return payload;\n  }).catch(error => {\n    handleRuntimeFailure(error, epoch);\n    return null;\n  }).finally(() => {\n    if (epoch === wsState.runtimeEpoch) wsState.runtimeMutationPending = Math.max(0, wsState.runtimeMutationPending - 1);\n  });\n  wsState.runtimeMutationChain = task;\n  return task;\n}\n\nfunction requestPlayerWorldGeneration(seed) {""",
)

# New Site session must be compiled into the authoritative Worker.
replace_once(
    'src/workspace/workspaceController.js',
    """    registerSimulationSession(wsState.world, siteId, session.blueprint, session.boundaryNode?.childWorkspaceId);\n    invalidateNavigationIndex();\n  }""",
    """    registerSimulationSession(wsState.world, siteId, session.blueprint, session.boundaryNode?.childWorkspaceId);\n    invalidateNavigationIndex();\n    queueRuntimeReconfigure();\n  }""",
)

# Node placement synchronizes topology/config after the canonical authoring edit.
replace_once(
    'src/workspace/workspaceController.js',
    """    invalidateNavigationIndex();\n    renderSiteNodes();\n    renderNavigationDrawer();""",
    """    invalidateNavigationIndex();\n    queueRuntimeReconfigure();\n    renderSiteNodes();\n    renderNavigationDrawer();""",
)

# Boundary transfer connection synchronizes Rust routing.
replace_once(
    'src/workspace/workspaceController.js',
    """        inspector.selectedTransferId = transfer.id;\n        inspector.selectedSystemId = null;\n        inspector.message = 'Transfer connected.';""",
    """        inspector.selectedTransferId = transfer.id;\n        inspector.selectedSystemId = null;\n        inspector.message = 'Transfer connected.';\n        queueRuntimeReconfigure();""",
)

# Boundary transfer disconnect synchronizes Rust routing.
replace_once(
    'src/workspace/workspaceController.js',
    """        disconnectGraphConnection(graph, button.dataset.connId, {\n          'boundary-transfer': connection => removeBoundaryTransfer(wsState.world, connection.id),\n        });\n        inspector.selectedTransferId = null;""",
    """        disconnectGraphConnection(graph, button.dataset.connId, {\n          'boundary-transfer': connection => removeBoundaryTransfer(wsState.world, connection.id),\n        });\n        queueRuntimeReconfigure();\n        inspector.selectedTransferId = null;""",
)

# Site material connection synchronizes Rust topology.
replace_once(
    'src/workspace/workspaceController.js',
    """    if (connection) {\n      inspector.selectedConnId = connection.id;\n      inspector.selectedNodeId = null;\n      inspector.message = '';\n    }""",
    """    if (connection) {\n      inspector.selectedConnId = connection.id;\n      inspector.selectedNodeId = null;\n      inspector.message = '';\n      queueRuntimeReconfigure();\n    }""",
)

# Inspector parameter and enable commands synchronize machine config.
replace_once(
    'src/workspace/workspaceController.js',
    """    setApparatusParameter(\n      wsState.blueprint,\n      input.dataset.nodeId,\n      input.dataset.parameterId,\n      Number(input.value),\n    );\n    inspector.message = '';""",
    """    setApparatusParameter(\n      wsState.blueprint,\n      input.dataset.nodeId,\n      input.dataset.parameterId,\n      Number(input.value),\n    );\n    queueRuntimeReconfigure();\n    inspector.message = '';""",
)
replace_once(
    'src/workspace/workspaceController.js',
    """    if (node) setNodeEnabled(wsState.blueprint, node.id, !node.enabled);\n    inspector.renderKey = null;""",
    """    if (node) {\n      setNodeEnabled(wsState.blueprint, node.id, !node.enabled);\n      queueRuntimeReconfigure();\n    }\n    inspector.renderKey = null;""",
)

# Blueprint disconnect commands synchronize after all affected edges are removed.
replace_once(
    'src/workspace/workspaceController.js',
    """  inspector.renderKey = null;\n  renderSiteNodes();\n}\n\nfunction onToggleWorldSimulation() {""",
    """  queueRuntimeReconfigure();\n  inspector.renderKey = null;\n  renderSiteNodes();\n}\n\nfunction onToggleWorldSimulation() {""",
)

# Player scheduler uses one asynchronous authoritative step at a time.
old_scheduler = """function startSimulation() {\n  if (wsState.simRunning || !wsState.world) return;\n  resumeWorldSimulation(wsState.world);\n  wsState.simRunning = true;\n  wsState.simLastTime = performance.now();\n  wsState.simAccumulatedS = 0;\n  wsState.simRafId = requestAnimationFrame(simLoop);\n  updateWorldControls();\n}\n\nfunction stopSimulation() {\n  wsState.simRunning = false;\n  if (wsState.world) pauseWorldSimulation(wsState.world);\n  if (wsState.simRafId != null) cancelAnimationFrame(wsState.simRafId);\n  wsState.simRafId = null;\n  updateWorldControls();\n}\n\nfunction renderRealtimePresentation() {\n  updateWorldControls();\n  if (wsState.currentLevel === 'site') {\n    renderSiteNodes();\n    return;\n  }\n  const definition = systemWorkspaceDefinition();\n  renderSystemConnections(el('ws-system-svg'), definition);\n  updateCompositeInspector();\n}\n\nfunction simLoop(now) {\n  if (!wsState.simRunning) return;\n  const elapsed = Math.min((now - wsState.simLastTime) / 1000, 0.25);\n  wsState.simLastTime = now;\n  wsState.simAccumulatedS += elapsed;\n  let advanced = false;\n  while (wsState.simAccumulatedS >= SIMULATION_STEP_S) {\n    const result = worldSimulationTick(wsState.world, SIMULATION_STEP_S);\n    advanced ||= result.advanced;\n    wsState.simAccumulatedS -= SIMULATION_STEP_S;\n  }\n  // RAF remains the wall-clock scheduler, but display frequency no longer\n  // dictates simulation presentation work. State-dependent DOM/Inspector work\n  // runs once after one or more authoritative 0.1 s steps, not on every monitor\n  // refresh between those steps. Direct interaction handlers remain immediate.\n  if (advanced) renderRealtimePresentation();\n  wsState.simRafId = requestAnimationFrame(simLoop);\n}"""
new_scheduler = """function startSimulation() {\n  if (wsState.simRunning || !wsState.world || !wsState.realtimeRuntime || wsState.runtimeError) return;\n  const epoch = wsState.runtimeEpoch;\n  wsState.simRunning = true;\n  wsState.world.simulation.running = true;\n  wsState.simLastTime = performance.now();\n  wsState.simAccumulatedS = 0;\n  Promise.resolve(wsState.realtimeRuntime.resume()).then(() => {\n    if (epoch !== wsState.runtimeEpoch) return;\n    projectRuntimeSnapshot(wsState.realtimeRuntime.snapshot);\n    updateWorldControls();\n  }).catch(error => handleRuntimeFailure(error, epoch));\n  wsState.simRafId = requestAnimationFrame(simLoop);\n  updateWorldControls();\n}\n\nfunction stopSimulation({ pauseRuntime = true } = {}) {\n  const epoch = wsState.runtimeEpoch;\n  wsState.simRunning = false;\n  if (wsState.world?.simulation) wsState.world.simulation.running = false;\n  if (pauseRuntime && wsState.realtimeRuntime) {\n    Promise.resolve(wsState.realtimeRuntime.pause())\n      .then(() => projectRuntimeSnapshot(wsState.realtimeRuntime?.snapshot))\n      .catch(error => handleRuntimeFailure(error, epoch));\n  }\n  if (wsState.simRafId != null) cancelAnimationFrame(wsState.simRafId);\n  wsState.simRafId = null;\n  updateWorldControls();\n}\n\nfunction renderRealtimePresentation() {\n  updateWorldControls();\n  if (wsState.currentLevel === 'site') {\n    renderSiteNodes();\n    return;\n  }\n  const definition = systemWorkspaceDefinition();\n  renderSystemConnections(el('ws-system-svg'), definition);\n  updateCompositeInspector();\n}\n\nfunction simLoop(now) {\n  if (!wsState.simRunning) return;\n  const elapsed = Math.min((now - wsState.simLastTime) / 1000, 0.25);\n  wsState.simLastTime = now;\n  wsState.simAccumulatedS += elapsed;\n\n  // Never queue catch-up physics. The Worker owns the fixed scheduler state and\n  // the browser permits at most one outstanding 0.1 s step; slow hardware makes\n  // world time advance more slowly instead of creating an unbounded backlog.\n  if (\n    wsState.simAccumulatedS >= SIMULATION_STEP_S\n    && !wsState.simStepInFlight\n    && wsState.runtimeMutationPending === 0\n    && wsState.realtimeRuntime\n  ) {\n    const epoch = wsState.runtimeEpoch;\n    wsState.simAccumulatedS -= SIMULATION_STEP_S;\n    wsState.simStepInFlight = true;\n    Promise.resolve(wsState.realtimeRuntime.stepFixed(SIMULATION_STEP_S)).then(result => {\n      if (epoch !== wsState.runtimeEpoch) return;\n      projectRuntimeSnapshot(result?.snapshot ?? wsState.realtimeRuntime.snapshot);\n      if (result?.advanced) renderRealtimePresentation();\n    }).catch(error => handleRuntimeFailure(error, epoch)).finally(() => {\n      if (epoch === wsState.runtimeEpoch) wsState.simStepInFlight = false;\n    });\n  }\n  wsState.simRafId = requestAnimationFrame(simLoop);\n}"""
replace_once('src/workspace/workspaceController.js', old_scheduler, new_scheduler)

# Site reset explicitly resets retained Rust state for that rebuilt Site.
replace_once(
    'src/workspace/workspaceController.js',
    """  registerSimulationSession(wsState.world, siteId, session.blueprint, session.boundaryNode?.childWorkspaceId);\n  invalidateNavigationIndex();\n  wsState.blueprint = session.blueprint;""",
    """  registerSimulationSession(wsState.world, siteId, session.blueprint, session.boundaryNode?.childWorkspaceId);\n  invalidateNavigationIndex();\n  queueRuntimeReconfigure({ resetNodeIds: Object.keys(session.blueprint.nodes ?? {}) });\n  wsState.blueprint = session.blueprint;""",
)

# Successful node removal synchronizes topology after Worker-projected matter gate.
replace_once(
    'src/workspace/workspaceController.js',
    """  invalidateNavigationIndex();\n  renderSiteNodes();\n  renderNavigationDrawer();\n  renderNodeCatalogDrawer();\n  return result;""",
    """  invalidateNavigationIndex();\n  queueRuntimeReconfigure();\n  renderSiteNodes();\n  renderNavigationDrawer();\n  renderNodeCatalogDrawer();\n  return result;""",
)

# World initialization owns exactly one realtime runtime facade.
replace_once(
    'src/workspace/workspaceController.js',
    """export function initWorkspace(world, knowledge) {\n  if (wsState.world) stopSimulation();""",
    """export function initWorkspace(world, knowledge) {\n  if (wsState.world) stopSimulation({ pauseRuntime: false });\n  wsState.realtimeRuntime?.dispose();\n  if (wsState.world) clearRustWorkerRuntimePresentation(wsState.world);\n  wsState.runtimeEpoch += 1;\n  wsState.realtimeRuntime = null;\n  wsState.runtimeReady = false;\n  wsState.runtimeError = null;\n  wsState.runtimeMutationPending = 0;\n  wsState.runtimeMutationChain = null;\n  wsState.simStepInFlight = false;""",
)
replace_once(
    'src/workspace/workspaceController.js',
    """  renderWorkspace();\n  startSimulation();\n}""",
    """  renderWorkspace();\n\n  const epoch = wsState.runtimeEpoch;\n  try {\n    wsState.realtimeRuntime = createRealtimeRuntime(world);\n  } catch (error) {\n    handleRuntimeFailure(error, epoch);\n    return;\n  }\n  wsState.realtimeRuntime.ready.then(payload => {\n    if (epoch !== wsState.runtimeEpoch) return;\n    wsState.runtimeReady = true;\n    projectRuntimeSnapshot(payload?.snapshot ?? wsState.realtimeRuntime.snapshot);\n    renderRealtimePresentation();\n    startSimulation();\n  }).catch(error => handleRuntimeFailure(error, epoch));\n}""",
)
