import { apparatusDefinitionById, type ApparatusParameterDefinition } from '../apparatus/definitions.js';
import {
  disconnectConnection,
  removeMechanicalNode,
  setMechanicalNodeEnabled,
  setMechanicalNodeParameter,
} from '../graph/graphCommands.js';
import { connectionsForNode, mechanicalNodeById } from '../graph/graphQueries.js';
import type { MechanicalNode } from '../graph/types.js';
import type { AppState, AppStore } from '../state/appState.js';
import { resourceDefinitionById } from '../world/resources.js';
import { EARTH_SCALE_METERS_PER_WORLD_UNIT, formatPhysicalDistance, worldUnitsToMeters } from '../world/scale.js';
import type { Planet, Region, ResourceNode } from '../world/types.js';

function addRow(container: HTMLElement, label: string, value: string): void {
  const row = document.createElement('div'); row.className = 'ws-ins-row';
  const strong = document.createElement('b'); strong.textContent = `${label}: `;
  row.append(strong, document.createTextNode(value)); container.appendChild(row);
}
function addLiveRow(container: HTMLElement, label: string, key: string, value = '—'): void {
  const row = document.createElement('div'); row.className = 'ws-ins-row';
  const strong = document.createElement('b'); strong.textContent = `${label}: `;
  const live = document.createElement('span'); live.dataset.runtimeInspect = key; live.textContent = value;
  row.append(strong, live); container.appendChild(row);
}
function typeLabel(container: HTMLElement, value: string): void { const type = document.createElement('div'); type.className = 'ws-ins-type'; type.textContent = value; container.appendChild(type); }
function sectionTitle(container: HTMLElement, value: string): void { const title = document.createElement('div'); title.className = 'ws-ins-section-title'; title.textContent = value; container.appendChild(title); }
function speciesLabel(speciesId: string): string { return speciesId.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/(^|[- ])\w/g, value => value.toUpperCase()).replaceAll('-', ' '); }
function descriptorLabel(id: string): string { return id.replaceAll('-', ' '); }
function formatMass(value: number | null | undefined): string { return value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(2)} kg`; }
function formatRate(value: number | null | undefined): string { return value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(2)} kg/s`; }
function formatTemperature(value: number | null | undefined): string { return value == null || !Number.isFinite(value) ? 'Unavailable' : `${value.toFixed(2)} K`; }
function formatEnergy(value: number | null | undefined): string { return value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(2)} J`; }
function formatPower(value: number | null | undefined): string { return value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(2)} kW`; }
function runtimeStatus(state: Readonly<AppState>): string {
  const runtime = state.runtime;
  if (runtime.status === 'ready') {
    const connection = runtime.running ? 'Connected · running' : 'Connected · paused';
    return runtime.error ? `${connection} · warning: ${runtime.error}` : connection;
  }
  return runtime.status === 'error' ? `Error · ${runtime.error ?? 'unknown'}` : runtime.status;
}

function renderPlanet(container: HTMLElement, planet: Planet): void {
  typeLabel(container, 'PLANET'); addRow(container, 'Name', planet.name); addRow(container, 'Seed', planet.seed); addRow(container, 'Map', `${planet.width} × ${planet.height}`);
  addRow(container, 'Physical scale', `${formatPhysicalDistance(planet.physicalWidthMeters)} × ${formatPhysicalDistance(planet.physicalHeightMeters)}`); addRow(container, 'World unit', `≈ ${formatPhysicalDistance(EARTH_SCALE_METERS_PER_WORLD_UNIT)}`);
  addRow(container, 'Regions', String(planet.regions.length)); addRow(container, 'Resource nodes', String(planet.resourceNodes.length));
}
function renderRegion(container: HTMLElement, planet: Planet, region: Region): void {
  typeLabel(container, 'REGION'); addRow(container, 'Name', region.name); addRow(container, 'ID', region.id); addRow(container, 'Bounds', `${region.bounds.x.toFixed(0)}, ${region.bounds.y.toFixed(0)} · ${region.bounds.width.toFixed(0)} × ${region.bounds.height.toFixed(0)}`);
  addRow(container, 'Approx. extent', `${formatPhysicalDistance(worldUnitsToMeters(region.bounds.width))} × ${formatPhysicalDistance(worldUnitsToMeters(region.bounds.height))}`); addRow(container, 'Resource nodes', String(region.resourceNodeIds.length)); addRow(container, 'Planet', planet.name);
}
function renderResource(container: HTMLElement, planet: Planet, resource: ResourceNode): void {
  const definition = resourceDefinitionById(resource.resourceId); const region = planet.regions.find(candidate => candidate.id === resource.regionId); typeLabel(container, 'FEATURE');
  addRow(container, 'Name', resource.name); addRow(container, 'Feature type', 'Mineral Deposit'); addRow(container, 'Resource', definition?.name ?? resource.resourceId); addRow(container, 'Category', definition?.category ?? 'unknown'); addRow(container, 'Region', region?.name ?? resource.regionId);
  addRow(container, 'Coordinates', `${resource.position.x.toFixed(6)}, ${resource.position.y.toFixed(6)}`); addRow(container, 'Map position', `${formatPhysicalDistance(worldUnitsToMeters(resource.position.x))}, ${formatPhysicalDistance(worldUnitsToMeters(resource.position.y))}`);
  sectionTitle(container, 'Material source');
  addRow(container, 'Physical form', resource.source.physicalForm); addRow(container, 'Fragmentation', resource.source.fragmentationProfileId.replaceAll('-', ' ')); addRow(container, 'Initial reserve', resource.source.initialReserveMassKg == null ? 'Unbounded' : `${resource.source.initialReserveMassKg.toLocaleString()} kg`);
  for (const component of resource.source.composition) addRow(container, speciesLabel(component.speciesId), `${(component.massFraction * 100).toFixed(2)}%`);
  if (resource.source.mineralTexture) { addRow(container, 'Texture lineage', resource.source.mineralTexture.id); addRow(container, 'Textured species', String(Object.keys(resource.source.mineralTexture.speciesTextures).length)); }
  if (resource.source.comminutionProperties) {
    addRow(container, 'Bond CWi', `${resource.source.comminutionProperties.bondCrushingWorkIndexKWhPerT.toFixed(2)} kWh/t`);
    addRow(container, 'Bond BWi', `${resource.source.comminutionProperties.bondBallMillWorkIndexKWhPerT.toFixed(2)} kWh/t`);
    addRow(container, 'Abrasion index', resource.source.comminutionProperties.bondAbrasionIndex.toFixed(3));
  }
  const port = resource.ports.find(candidate => candidate.id === resource.resourceAccessPortId); if (port) addRow(container, 'Output', `${port.label} · ${port.kind}`);
  sectionTitle(container, 'Runtime'); addLiveRow(container, 'Status', 'runtime-status'); addLiveRow(container, 'Extracted', 'source-extracted'); addLiveRow(container, 'Remaining', 'source-remaining');
}

function setParameter(store: AppStore, node: MechanicalNode, parameter: ApparatusParameterDefinition, control: HTMLInputElement | HTMLSelectElement): void {
  const value = Number(control.value);
  try { store.setGraph(setMechanicalNodeParameter(store.getState().graph, node.id, parameter.id, value)); }
  catch { control.value = String(node.parameters[parameter.id] ?? parameter.defaultValue); }
}

function renderParameter(container: HTMLElement, node: MechanicalNode, parameter: ApparatusParameterDefinition, store: AppStore): void {
  const row = document.createElement('label'); row.className = 'ws-ins-config-row';
  const label = document.createElement('span'); label.textContent = parameter.unit ? `${parameter.label} (${parameter.unit})` : parameter.label;
  const current = String(node.parameters[parameter.id] ?? parameter.defaultValue);
  if (parameter.choices?.length) {
    const select = document.createElement('select'); select.value = current;
    for (const choice of parameter.choices) { const option = document.createElement('option'); option.value = String(choice.value); option.textContent = choice.label; select.appendChild(option); }
    select.addEventListener('change', () => setParameter(store, node, parameter, select)); row.append(label, select);
  } else {
    const input = document.createElement('input'); input.type = 'number'; input.min = String(parameter.min); if (parameter.max != null) input.max = String(parameter.max); input.step = String(parameter.step); input.value = current;
    input.addEventListener('change', () => setParameter(store, node, parameter, input)); row.append(label, input);
  }
  container.appendChild(row);
}

function renderMechanical(container: HTMLElement, node: MechanicalNode, store: AppStore): void {
  const definition = apparatusDefinitionById(node.definitionId); typeLabel(container, node.category.toUpperCase());
  addRow(container, 'Name', node.label); addRow(container, 'Definition', definition?.label ?? node.definitionId); addRow(container, 'Node type', node.nodeType);
  addRow(container, 'Coordinates', `${node.position.x.toFixed(6)}, ${node.position.y.toFixed(6)}`); addRow(container, 'Footprint', `${node.physicalWidthMeters} m × ${node.physicalHeightMeters} m`);

  sectionTitle(container, 'Configuration');
  const enabledRow = document.createElement('div'); enabledRow.className = 'ws-ins-config-row';
  const enabledLabel = document.createElement('span'); enabledLabel.textContent = `Enabled: ${node.enabled ? 'Yes' : 'No'}`;
  const toggle = document.createElement('button'); toggle.type = 'button'; toggle.textContent = node.enabled ? 'Disable' : 'Enable'; toggle.addEventListener('click', () => store.setGraph(setMechanicalNodeEnabled(store.getState().graph, node.id, !node.enabled)));
  enabledRow.append(enabledLabel, toggle); container.appendChild(enabledRow);
  for (const parameter of definition?.parameters ?? []) renderParameter(container, node, parameter, store);

  sectionTitle(container, 'Runtime'); addLiveRow(container, 'Status', 'runtime-status');
  if (node.nodeType === 'hopper') {
    addLiveRow(container, 'Stored', 'hopper-stored'); addLiveRow(container, 'Free', 'hopper-free');
    const detail = document.createElement('div'); detail.dataset.runtimeDetail = `hopper:${node.id}`; container.appendChild(detail);
  } else if (node.nodeType === 'exhaustVent') {
    addLiveRow(container, 'Emitted gas', 'vent-emitted'); addLiveRow(container, 'Temperature', 'vent-temperature');
    const detail = document.createElement('div'); detail.dataset.runtimeDetail = `exhaustVent:${node.id}`; container.appendChild(detail);
  } else {
    addLiveRow(container, 'Operating', 'node-operating'); addLiveRow(container, 'Actual rate', 'node-actual-rate'); addLiveRow(container, 'Blocked reason', 'node-blocked');
    if (node.nodeType === 'extractor') addLiveRow(container, 'Source', 'extractor-source');
    if (node.nodeType === 'roastingFurnace') {
      addLiveRow(container, 'Charge temperature', 'furnace-temperature'); addLiveRow(container, 'Goethite conversion', 'furnace-conversion');
      const detail = document.createElement('div'); detail.dataset.runtimeDetail = `furnace:${node.id}`; container.appendChild(detail);
    }
  }

  sectionTitle(container, 'Ports'); for (const port of node.ports) addRow(container, port.label, `${port.direction} · ${port.kind} · ${port.medium}`);
  const connections = connectionsForNode(store.getState().graph, node.id); sectionTitle(container, `Connections (${connections.length})`);
  for (const connection of connections) {
    const row = document.createElement('div'); row.className = 'ws-ins-connection-row'; const text = document.createElement('span'); text.textContent = `${connection.from.nodeId}:${connection.from.portId} → ${connection.to.nodeId}:${connection.to.portId}`;
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Disconnect'; button.addEventListener('click', () => store.setGraph(disconnectConnection(store.getState().graph, connection.id))); row.append(text, button); container.appendChild(row);
  }
  const actions = document.createElement('div'); actions.className = 'ws-ins-actions'; const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove Node'; remove.addEventListener('click', () => { store.setGraph(removeMechanicalNode(store.getState().graph, node.id)); store.setSelection({ type: 'planet' }); }); actions.appendChild(remove); container.appendChild(actions);
}

function setLive(container: HTMLElement, key: string, value: string): void { const target = container.querySelector<HTMLElement>(`[data-runtime-inspect="${key}"]`); if (target) target.textContent = value; }
function renderMassDistribution(container: HTMLElement, title: string, values: Record<string, number>, label: (id: string) => string): void {
  sectionTitle(container, title); const entries = Object.entries(values).sort((a, b) => b[1] - a[1]); if (!entries.length) { addRow(container, title, 'Empty'); return; }
  for (const [id, kg] of entries) addRow(container, label(id), `${kg.toFixed(2)} kg`);
}
function detailRoot(container: HTMLElement, key: string): HTMLElement | null { return container.querySelector<HTMLElement>(`[data-runtime-detail="${key}"]`); }

function renderSelectedDetail(container: HTMLElement, node: MechanicalNode, state: Readonly<AppState>): void {
  if (node.nodeType === 'hopper') {
    const detail = state.runtime.details[`hopper:${node.id}`]; const root = detailRoot(container, `hopper:${node.id}`); if (!root) return; root.replaceChildren();
    if (detail?.kind !== 'hopper') return;
    sectionTitle(root, `Contained material · ${detail.storedMassKg.toFixed(2)} kg`); addRow(root, 'Statistical populations', String(detail.populationCount)); addRow(root, 'Sensible enthalpy', formatEnergy(detail.sensibleEnthalpyJ)); addRow(root, 'Temperature', formatTemperature(detail.temperatureK));
    renderMassDistribution(root, 'Composition', detail.compositionKg, speciesLabel); renderMassDistribution(root, 'Particle size', detail.particleSizeKg, descriptorLabel); renderMassDistribution(root, 'Liberation', detail.liberationKg, descriptorLabel); renderMassDistribution(root, 'Texture lineage', detail.textureKg, value => value); return;
  }
  if (node.nodeType === 'roastingFurnace') {
    const detail = state.runtime.details[`furnace:${node.id}`]; const root = detailRoot(container, `furnace:${node.id}`); if (!root) return; root.replaceChildren();
    if (detail?.kind !== 'furnace') return;
    sectionTitle(root, 'Thermal process detail'); addRow(root, 'Charge', formatMass(detail.chargeMassKg)); addRow(root, 'Pending feed', formatMass(detail.pendingFeedMassKg)); addRow(root, 'Feed rate', formatRate(detail.feedRateKgPerSecond)); addRow(root, 'Product rate', formatRate(detail.productRateKgPerSecond)); addRow(root, 'Heater power', formatPower(detail.heaterPowerKw)); addRow(root, 'Heat loss', formatPower(detail.heatLossPowerKw)); addRow(root, 'Reaction power', formatPower(detail.reactionPowerKw)); addRow(root, 'Zones', String(detail.zoneCount));
    detail.zoneMassKg.forEach((mass, index) => addRow(root, `Zone ${index + 1}`, `${formatMass(mass)} · ${formatTemperature(detail.zoneTemperatureK[index])}`)); return;
  }
  if (node.nodeType === 'exhaustVent') {
    const detail = state.runtime.details[`exhaustVent:${node.id}`]; const root = detailRoot(container, `exhaustVent:${node.id}`); if (!root) return; root.replaceChildren();
    if (detail?.kind !== 'exhaust-vent') return;
    sectionTitle(root, 'Emissions'); addRow(root, 'Emitted mass', formatMass(detail.emittedMassKg)); addRow(root, 'Sensible enthalpy', formatEnergy(detail.sensibleEnthalpyJ)); addRow(root, 'Temperature', formatTemperature(detail.temperatureK)); renderMassDistribution(root, 'Composition', detail.compositionKg, speciesLabel);
  }
}

function updateRuntimeProjection(container: HTMLElement, state: Readonly<AppState>): void {
  const selection = state.selection; const snapshot = state.runtime.snapshot; setLive(container, 'runtime-status', runtimeStatus(state));
  if (selection.type === 'resource') {
    const source = snapshot?.sources[selection.resourceNodeId]; setLive(container, 'source-extracted', formatMass(source?.extractedMassKg)); setLive(container, 'source-remaining', source?.remainingMassKg == null ? 'Unbounded' : formatMass(source.remainingMassKg)); return;
  }
  if (selection.type !== 'mechanical') return;
  const node = state.graph.nodes.find(candidate => candidate.id === selection.mechanicalNodeId); if (!node) return; const runtimeNode = snapshot?.nodes[node.id];
  setLive(container, 'node-operating', runtimeNode?.operatingState ?? '—'); setLive(container, 'node-actual-rate', formatRate(runtimeNode?.actualRateKgPerSecond)); setLive(container, 'node-blocked', runtimeNode?.blockedReason || '—');
  if (node.nodeType === 'extractor') {
    const sourceConnection = state.graph.connections.find(connection => connection.kind === 'resource-access' && connection.to.nodeId === node.id); const source = sourceConnection ? state.world?.planet.resourceNodes.find(resource => resource.id === sourceConnection.from.nodeId) : null; setLive(container, 'extractor-source', source?.name ?? '—');
  } else if (node.nodeType === 'hopper') {
    setLive(container, 'hopper-stored', formatMass(runtimeNode?.storedMassKg)); setLive(container, 'hopper-free', formatMass(runtimeNode?.freeCapacityKg));
  } else if (node.nodeType === 'roastingFurnace') {
    setLive(container, 'furnace-temperature', formatTemperature(runtimeNode?.temperatureK)); setLive(container, 'furnace-conversion', runtimeNode?.conversionFraction == null ? '—' : `${(runtimeNode.conversionFraction * 100).toFixed(2)}%`);
  } else if (node.nodeType === 'exhaustVent') {
    setLive(container, 'vent-emitted', formatMass(runtimeNode?.ventedGasMassKg)); setLive(container, 'vent-temperature', formatTemperature(runtimeNode?.temperatureK));
  }
  renderSelectedDetail(container, node, state);
}

export function installInspectorPanel(root: HTMLElement, store: AppStore): void {
  const container = root.querySelector<HTMLElement>('#ws-map-inspector-body'); if (!container) return;
  let lastWorld = store.getState().world; let lastGraph = store.getState().graph; let lastSelectionKey = '';
  store.subscribeDomains(['world', 'graph', 'selection', 'runtime'], state => {
    const selectionKey = state.selection.type === 'planet' ? 'planet' : state.selection.type === 'region' ? `region:${state.selection.regionId}` : state.selection.type === 'resource' ? `resource:${state.selection.resourceNodeId}` : `mechanical:${state.selection.mechanicalNodeId}`;
    const mustRebuild = state.world !== lastWorld || state.graph !== lastGraph || selectionKey !== lastSelectionKey;
    if (mustRebuild) {
      lastWorld = state.world; lastGraph = state.graph; lastSelectionKey = selectionKey; container.replaceChildren();
      const planet = state.world?.planet; if (!planet) { container.textContent = 'Generate a world to inspect it.'; return; }
      const selection = state.selection;
      if (selection.type === 'planet') renderPlanet(container, planet);
      else if (selection.type === 'region') { const region = planet.regions.find(candidate => candidate.id === selection.regionId); region ? renderRegion(container, planet, region) : container.append('Selected region is unavailable.'); }
      else if (selection.type === 'resource') { const resource = planet.resourceNodes.find(candidate => candidate.id === selection.resourceNodeId); resource ? renderResource(container, planet, resource) : container.append('Selected resource is unavailable.'); }
      else { const node = mechanicalNodeById(state.graph, selection.mechanicalNodeId); node ? renderMechanical(container, node, store) : container.append('Selected mechanical node is unavailable.'); }
    }
    updateRuntimeProjection(container, state);
  });
}
