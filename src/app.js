/**
 * UI layer for the Planet Generator tech demo.
 * Handles user interactions and DOM rendering.
 * Generator logic is kept entirely separate.
 *
 * State layers:
 *   world     — serialisable simulation truth (createWorld)
 *   knowledge — player discovery state (createKnowledge / discoverFeature)
 *   uiState   — presentation-only (selected, counters) — never simulation truth
 */

import { createWorld } from './core/world/worldState.js';
import {
  createKnowledge,
  discoverFeature,
  isFeatureDiscovered,
  analyzeMaterialBatch,
  isBatchAnalyzed,
} from './core/world/knowledgeState.js';
import { rngFor } from './generator/random.js';
import { acquireSampleFromOccurrence, DEFAULT_SAMPLE_MASS_KG } from './core/materials/sampleAcquisition.js';
import { componentsPercent } from './core/materials/materialBatches.js';
import { CRUSHING_PROCESS_ID, listProcessDefinitions } from './core/processes/processDefinitions.js';
import { runProcessAndCommit } from './core/processes/processExecution.js';
import { initWorkspace, updateWorkspaceKnowledge } from './workspace/workspaceUI.js';

// ---------- Application state ----------

let world = null;
let knowledge = null;
let discoveryRng = null;

// UI-only state: nothing here is simulation truth
const uiState = {
  discoveredCount: 0,
  totalFeatureCount: 0,
  selectedOccurrenceId: null,
  selectedBatchId: null,
  selectedProcessId: CRUSHING_PROCESS_ID,
  processParametersByProcessId: {},
  lastProcessRunId: null,
  infoMessage: '',
  errorMessage: '',
};

// ---------- DOM helpers ----------

function el(id) {
  return document.getElementById(id);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getProcessDefinitionById(processId) {
  return listProcessDefinitions().find(proc => proc.id === processId) ?? null;
}

function initializeProcessParameterDefaults() {
  for (const processDefinition of listProcessDefinitions()) {
    uiState.processParametersByProcessId[processDefinition.id] = Object.fromEntries(
      (processDefinition.parameters ?? []).map(parameter => [parameter.id, parameter.defaultValue])
    );
  }
}

// ---------- Rendering ----------

function renderComposition(obj) {
  return Object.entries(obj)
    .map(([k, v]) => `${escHtml(k)}: ${v}%`)
    .join(' &middot; ');
}

function renderAtmosphere(atm) {
  if (!atm || (atm.pressureBar ?? 0) <= 0) return 'Effectively none';
  const comp = atm.composition && Object.keys(atm.composition).length > 0
    ? renderComposition(atm.composition)
    : 'Trace composition unavailable';
  return `${atm.pressureBar} bar &mdash; ${comp}`;
}

function renderResourcesTable(resources, mode) {
  if (!resources || resources.length === 0) return '<em>None</em>';
  return resources.map(r => {
    if (mode === 'region') {
      let line = `<span class="resource-name">${escHtml(r.name)}</span> &mdash; ${escHtml(r.quantityEstimate)}`;
      if (r.compositionNotes) line += ` <span class="resource-note">(${escHtml(r.compositionNotes)})</span>`;
      return `<li>${line}</li>`;
    } else {
      let line = `<span class="resource-name">${escHtml(r.name)}</span> &mdash; ${r.concentrationPercent}% &mdash; ${escHtml(r.quantityClass)}`;
      if (r.descriptor) line += ` &mdash; <em>${escHtml(r.descriptor)}</em>`;
      if (r.composition) {
        const compStr = Object.entries(r.composition).map(([k, v]) => `${k}: ${v}%`).join(', ');
        line += `<br><span class="resource-comp">${escHtml(compStr)}</span>`;
      }
      return `<li>${line}</li>`;
    }
  }).join('');
}

function renderFeature(feature) {
  // Resolve resource occurrence IDs to objects from world state
  const occurrences = feature.resourceOccurrences.map(
    id => (typeof id === 'string' ? world.resourceOccurrences[id] : id)
  ).filter(Boolean);
  return `
    <div class="feature discovered">
      <div class="feature-name">${escHtml(feature.name)}</div>
      <div class="feature-meta">
        Type: ${escHtml(feature.type)} &middot;
        Depth: ${feature.depthM} m &middot;
        Geometry: ${escHtml(feature.geometry)} &middot;
        Accessibility: ${escHtml(feature.accessibility)} &middot;
        Quantity: ${escHtml(feature.quantityClass)}
      </div>
      <div class="resource-section">
        <strong>Resources:</strong>
        <ul>${renderResourcesTable(occurrences, 'feature')}</ul>
      </div>
    </div>
  `;
}

function renderRegion(region) {
  // Resolve feature objects from world state
  const featureObjects = region.features.map(fid => world.features[fid]);
  const discoveredFeatures = featureObjects.filter(f => isFeatureDiscovered(knowledge, f.id));
  const undiscovered = featureObjects.filter(f => !isFeatureDiscovered(knowledge, f.id)).length;

  const featureHtml = discoveredFeatures.length > 0
    ? discoveredFeatures.map(renderFeature).join('')
    : '';

  return `
    <div class="region" id="region-${escHtml(region.id)}">
      <h3 class="region-name">${escHtml(region.name)}</h3>
      <div class="region-meta">
        Area: ${region.areaPercent}% &middot;
        Latitude: ${region.latitude}&deg; &middot;
        Elevation: ${region.elevationKm} km &middot;
        Relief: ${region.relief} &middot;
        Heat: ${region.heat} &middot;
        Moisture: ${region.moisture} &middot;
        Geologic Activity: ${region.geologicActivity} &middot;
        Age: ${escHtml(region.age)} &middot;
        Surface: ${escHtml(region.surfaceCover)}
      </div>
      <div class="region-comp">
        <strong>Local Composition:</strong> ${renderComposition(region.localComposition)}
      </div>
      <div class="resource-section">
        <strong>Background Resources:</strong>
        <ul>${renderResourcesTable(
          (region.backgroundResourceOccurrences ?? []).map(id => world.resourceOccurrences[id]).filter(Boolean),
          'region'
        )}</ul>
      </div>
      <div class="features-section" id="features-${escHtml(region.id)}">
        ${featureHtml}
        ${undiscovered > 0 ? `<div class="undiscovered-hint">${undiscovered} undiscovered feature(s)</div>` : ''}
      </div>
    </div>
  `;
}

function renderPlanet(planet) {
  el('planet-summary').innerHTML = `
    <div class="summary-grid">
      <div><strong>Name</strong> ${escHtml(planet.name)}</div>
      <div><strong>Type</strong> ${escHtml(planet.planetType)}</div>
      <div><strong>Seed</strong> ${escHtml(planet.seed)}</div>
      <div><strong>Schema / Generator</strong> v${world.schemaVersion} / v${world.generatorVersion}</div>
      <div><strong>Mass</strong> ${planet.massEarth} M&oplus;</div>
      <div><strong>Radius</strong> ${planet.radiusEarth} R&oplus;</div>
      <div><strong>Density</strong> ${planet.meanDensity} g/cm&sup3;</div>
      <div><strong>Gravity</strong> ${planet.gravityG} g</div>
      <div><strong>Escape Velocity</strong> ${planet.escapeVelocityKmS} km/s</div>
      <div><strong>Orbital Distance</strong> ${planet.orbitalDistanceAU} AU (e: ${planet.orbitalEccentricity})</div>
      <div><strong>Rotation</strong> ${planet.rotationHours} h</div>
      <div><strong>Axial Tilt</strong> ${planet.axialTiltDegrees}&deg;</div>
      <div><strong>Eq. Temperature</strong> ${planet.equilibriumTemperatureK} K</div>
      <div><strong>Mean Temperature</strong> ${planet.meanTemperatureK} K</div>
      <div><strong>Atmosphere</strong> ${renderAtmosphere(planet.atmosphere)}</div>
      <div><strong>Surface State</strong> ${escHtml(planet.surfaceState)}</div>
      <div><strong>Bulk Composition</strong> ${renderComposition(planet.bulkComposition)}</div>
      <div><strong>Core / Interior / Envelope</strong> ${planet.coreMassFraction} / ${planet.deepInteriorMassFraction} / ${planet.envelopeMassFraction}</div>
      <div><strong>Geologic Activity</strong> ${planet.geologicActivity}</div>
      <div><strong>Internal Heat</strong> ${escHtml(planet.internalHeat)}</div>
      <div><strong>Magnetic State</strong> ${escHtml(planet.magneticState)}</div>
      <div><strong>Biosphere</strong> ${planet.biospherePresent ? 'Present' : 'Absent'}</div>
    </div>
  `;

  // Resolve region objects from world state
  const regionObjects = planet.regions.map(rid => world.regions[rid]);
  el('regions-list').innerHTML = regionObjects.map(renderRegion).join('');
}

function updateDiscoveryCounter() {
  const total = Object.keys(world.features).length;
  const discovered = Object.keys(world.features).filter(id => isFeatureDiscovered(knowledge, id)).length;
  uiState.discoveredCount = discovered;
  uiState.totalFeatureCount = total;
  el('discovery-counter').textContent = `Features Discovered: ${discovered} / ${total}`;
  const btn = el('discover-btn');
  if (discovered >= total) {
    btn.disabled = true;
    el('all-discovered').style.display = 'block';
  } else {
    btn.disabled = false;
    el('all-discovered').style.display = 'none';
  }
}

function getProcessCompatibleOccurrences() {
  if (!world || !knowledge) return [];

  const occurrences = [];
  for (const feature of Object.values(world.features)) {
    if (!isFeatureDiscovered(knowledge, feature.id)) continue;

    for (const occurrenceId of feature.resourceOccurrences) {
      const occurrence = world.resourceOccurrences[occurrenceId];
      if (!occurrence?.composition) continue;
      if (occurrence.resourceId !== 'iron-ore') continue;
      occurrences.push(occurrence);
    }
  }

  return occurrences;
}

function renderBatchComponentTable(batch) {
  const percents = componentsPercent(batch.componentsKg);
  const rows = Object.entries(batch.componentsKg)
    .map(([componentId, massKg]) => `
      <tr>
        <td>${escHtml(componentId)}</td>
        <td>${massKg.toFixed(4)}</td>
        <td>${percents[componentId].toFixed(2)}%</td>
      </tr>
    `)
    .join('');

  return `
    <table class="matrix-table">
      <thead>
        <tr>
          <th>Component</th>
          <th>Mass (kg)</th>
          <th>Percent</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderBatches() {
  const batches = Object.values(world.materialBatches);
  if (batches.length === 0) {
    return '<em>No samples acquired yet.</em>';
  }

  const rows = batches.map(batch => {
    const analyzed = isBatchAnalyzed(knowledge, batch.id) ? 'Yes' : 'No';
    return `
      <tr>
        <td>${escHtml(batch.id)}</td>
        <td>${escHtml(batch.status)}</td>
        <td>${batch.totalMassKg.toFixed(4)}</td>
        <td>${batch.particleSizeMm.toFixed(2)}</td>
        <td>${escHtml((batch.provenance?.sourceOccurrenceIds ?? []).join(', ') || '-')}</td>
        <td>${escHtml(batch.resourceId ?? '-')}</td>
        <td>${analyzed}</td>
      </tr>
    `;
  }).join('');

  return `
    <table class="matrix-table">
      <thead>
        <tr>
          <th>Batch</th>
          <th>Status</th>
          <th>Total kg</th>
          <th>Particle (mm)</th>
          <th>Source Occurrences</th>
          <th>Resource</th>
          <th>Analyzed</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderLatestProcessResult() {
  if (!uiState.lastProcessRunId) return '<em>No process run yet.</em>';

  const result = world.processResults[uiState.lastProcessRunId];
  if (!result) return '<em>No process run yet.</em>';

  const outputRows = result.outputBatches.map(output => {
    const batch = world.materialBatches[output.batchId];
    const totalMassText = batch ? batch.totalMassKg.toFixed(4) : 'n/a';
    return `
      <tr>
        <td>${escHtml(output.outputId)}</td>
        <td>${escHtml(output.batchId)}</td>
        <td>${totalMassText}</td>
      </tr>
    `;
  }).join('');

  const parameterRows = Object.entries(result.parameters ?? {})
    .map(([parameterId, value]) => `<div><strong>${escHtml(parameterId)}:</strong> ${Number(value).toFixed(3)}</div>`)
    .join('');

  const outputDetails = result.outputBatches.map(output => {
    const batch = world.materialBatches[output.batchId];
    if (!batch) {
      return `
        <div class="batch-detail">
          <div><strong>${escHtml(output.outputId)}</strong> &mdash; ${escHtml(output.batchId)} (missing batch reference)</div>
        </div>
      `;
    }

    if (!isBatchAnalyzed(knowledge, batch.id)) {
      return `
        <div class="batch-detail">
          <div><strong>${escHtml(output.outputId)}</strong> &mdash; ${escHtml(output.batchId)}</div>
          <div><strong>Total Mass:</strong> ${batch.totalMassKg.toFixed(4)} kg</div>
          <div class="inline-note">Analyze this output batch to reveal constituent composition.</div>
        </div>
      `;
    }

    return `
      <div class="batch-detail">
        <div><strong>${escHtml(output.outputId)}</strong> &mdash; ${escHtml(output.batchId)}</div>
        <div><strong>Particle Size:</strong> ${batch.particleSizeMm.toFixed(2)} mm</div>
        ${renderBatchComponentTable(batch)}
      </div>
    `;
  }).join('');

  return `
    <div class="process-result">
      <div><strong>Process:</strong> ${escHtml(result.processId)}</div>
      <div><strong>Input Bindings:</strong> ${escHtml((result.inputBindings ?? []).map(binding => `${binding.inputId}: ${binding.batchId}`).join(', '))}</div>
      ${parameterRows}
      <div><strong>Mass In:</strong> ${result.metrics.massInKg.toFixed(6)} kg</div>
      <div><strong>Mass Out:</strong> ${result.metrics.massOutKg.toFixed(6)} kg</div>
      <div><strong>Balance Error:</strong> ${result.metrics.balanceErrorKg.toFixed(6)} kg</div>
      <table class="matrix-table">
        <thead>
          <tr>
            <th>Output</th>
            <th>Batch ID</th>
            <th>Total kg</th>
          </tr>
        </thead>
        <tbody>${outputRows}</tbody>
      </table>
      ${outputDetails}
    </div>
  `;
}

function renderSelectedBatchAnalysis() {
  if (!uiState.selectedBatchId) return '<em>Select a sample batch to inspect.</em>';

  const batch = world.materialBatches[uiState.selectedBatchId];
  if (!batch) return '<em>Selected batch not found.</em>';

  const analysis = knowledge.materialBatches[batch.id];
  if (!analysis) {
    return `
      <div>
        <div><strong>Batch:</strong> ${escHtml(batch.id)} &mdash; not analyzed yet.</div>
        <div><strong>Status:</strong> ${escHtml(batch.status)}</div>
        <div><strong>Total Mass:</strong> ${batch.totalMassKg.toFixed(4)} kg</div>
        <div><strong>Particle Size:</strong> ${batch.particleSizeMm.toFixed(2)} mm</div>
        <div class="inline-note">Run analysis to reveal constituent composition.</div>
      </div>
    `;
  }

  const analysisRows = Object.entries(analysis.componentMassesKg).map(([componentId, massKg]) => `
    <tr>
      <td>${escHtml(componentId)}</td>
      <td>${massKg.toFixed(4)}</td>
      <td>${analysis.componentPercents[componentId].toFixed(2)}%</td>
    </tr>
  `).join('');

  return `
    <div>
      <div><strong>Analyzed Batch:</strong> ${escHtml(batch.id)}</div>
      <div><strong>Particle Size:</strong> ${batch.particleSizeMm.toFixed(2)} mm</div>
      <div><strong>Provenance (occurrences):</strong> ${escHtml((batch.provenance?.sourceOccurrenceIds ?? []).join(', ') || '-')}</div>
      <div><strong>Analysis Order:</strong> ${analysis.analysisOrdinal}</div>
      <table class="matrix-table">
        <thead>
          <tr>
            <th>Component</th>
            <th>Mass (kg)</th>
            <th>Percent</th>
          </tr>
        </thead>
        <tbody>${analysisRows}</tbody>
      </table>
    </div>
  `;
}

function renderProcessingSection() {
  if (!world || !knowledge) return;

  const processCompatibleOccurrences = getProcessCompatibleOccurrences();

  if (uiState.selectedOccurrenceId && !processCompatibleOccurrences.some(occ => occ.id === uiState.selectedOccurrenceId)) {
    uiState.selectedOccurrenceId = processCompatibleOccurrences[0]?.id ?? null;
  }
  if (!uiState.selectedOccurrenceId && processCompatibleOccurrences.length > 0) {
    uiState.selectedOccurrenceId = processCompatibleOccurrences[0].id;
  }

  const availableBatches = Object.values(world.materialBatches).filter(batch => batch.status === 'available');
  if (uiState.selectedBatchId && !availableBatches.some(batch => batch.id === uiState.selectedBatchId)) {
    uiState.selectedBatchId = availableBatches[0]?.id ?? null;
  }
  if (!uiState.selectedBatchId && availableBatches.length > 0) {
    uiState.selectedBatchId = availableBatches[0].id;
  }
  const selectedBatchAnalyzed = uiState.selectedBatchId
    ? isBatchAnalyzed(knowledge, uiState.selectedBatchId)
    : false;

  const occurrenceOptionsHtml = processCompatibleOccurrences.length === 0
    ? '<option value="">No discovered iron-ore occurrences yet</option>'
    : processCompatibleOccurrences.map(occ => `
      <option value="${escHtml(occ.id)}" ${uiState.selectedOccurrenceId === occ.id ? 'selected' : ''}>
        ${escHtml(occ.name)} (${escHtml(occ.id)})
      </option>
    `).join('');

  const processOptionsHtml = listProcessDefinitions().map(proc => `
    <option value="${escHtml(proc.id)}" ${uiState.selectedProcessId === proc.id ? 'selected' : ''}>${escHtml(proc.name)}</option>
  `).join('');
  const selectedProcessDefinition = getProcessDefinitionById(uiState.selectedProcessId);
  const selectedProcessParameters = uiState.processParametersByProcessId[uiState.selectedProcessId] ?? {};
  const processParameterControlsHtml = (selectedProcessDefinition?.parameters ?? []).map(parameter => {
    const value = selectedProcessParameters[parameter.id] ?? parameter.defaultValue;
    return `
      <label for="process-param-${escHtml(parameter.id)}">${escHtml(parameter.id)}:</label>
      <input
        id="process-param-${escHtml(parameter.id)}"
        data-process-param-id="${escHtml(parameter.id)}"
        type="number"
        min="${parameter.min}"
        max="${parameter.max}"
        step="0.1"
        value="${value}"
      >
    `;
  }).join('');

  const batchOptionsHtml = availableBatches.length === 0
    ? '<option value="">No available batches</option>'
    : availableBatches.map(batch => `
      <option value="${escHtml(batch.id)}" ${uiState.selectedBatchId === batch.id ? 'selected' : ''}>
        ${escHtml(batch.id)} (${batch.totalMassKg.toFixed(3)} kg)
      </option>
    `).join('');

  el('processing-controls').innerHTML = `
    <div class="processing-grid">
      <div class="panel">
        <h3>1) Select Occurrence & Collect Sample</h3>
        <label for="occurrence-select">Process-Compatible Occurrence (discovered iron ore):</label>
        <select id="occurrence-select">${occurrenceOptionsHtml}</select>
        <label for="sample-mass-input">Sample Mass (kg):</label>
        <input id="sample-mass-input" type="number" min="0.1" step="0.1" value="${DEFAULT_SAMPLE_MASS_KG}">
        <button id="collect-sample-btn" ${processCompatibleOccurrences.length === 0 ? 'disabled' : ''}>Collect Sample</button>
      </div>

      <div class="panel">
        <h3>2) Analyze Sample</h3>
        <label for="batch-select">Available Batch:</label>
        <select id="batch-select">${batchOptionsHtml}</select>
        <button id="analyze-batch-btn" ${availableBatches.length === 0 ? 'disabled' : ''}>Analyze Sample</button>
        <div class="inline-note">Analysis records player knowledge separate from physical world state.</div>
      </div>

      <div class="panel">
        <h3>3) Run Process</h3>
        <label for="process-select">Process:</label>
        <select id="process-select">${processOptionsHtml}</select>
        ${processParameterControlsHtml}
        <button id="run-process-btn" ${availableBatches.length === 0 || !selectedBatchAnalyzed ? 'disabled' : ''}>Run Process</button>
        <div class="inline-note">${selectedBatchAnalyzed ? 'Selected batch is analyzed and ready for processing.' : 'Analyze the selected batch before processing.'}</div>
      </div>
    </div>
  `;

  el('processing-batches').innerHTML = renderBatches();
  el('analysis-result').innerHTML = renderSelectedBatchAnalysis();
  el('process-result').innerHTML = renderLatestProcessResult();

  const messageEl = el('processing-message');
  if (uiState.errorMessage) {
    messageEl.textContent = uiState.errorMessage;
    messageEl.className = 'status-message error';
  } else if (uiState.infoMessage) {
    messageEl.textContent = uiState.infoMessage;
    messageEl.className = 'status-message info';
  } else {
    messageEl.textContent = '';
    messageEl.className = 'status-message';
  }

  bindProcessingEventHandlers();
}

function bindProcessingEventHandlers() {
  const occurrenceSelect = el('occurrence-select');
  const batchSelect = el('batch-select');
  const processSelect = el('process-select');

  if (occurrenceSelect) {
    occurrenceSelect.addEventListener('change', () => {
      uiState.selectedOccurrenceId = occurrenceSelect.value || null;
      uiState.errorMessage = '';
      uiState.infoMessage = '';
    });
  }

  if (batchSelect) {
    batchSelect.addEventListener('change', () => {
      uiState.selectedBatchId = batchSelect.value || null;
      uiState.errorMessage = '';
      uiState.infoMessage = '';
      renderProcessingSection();
    });
  }

  if (processSelect) {
    processSelect.addEventListener('change', () => {
      uiState.selectedProcessId = processSelect.value;
      uiState.errorMessage = '';
      uiState.infoMessage = '';
      renderProcessingSection();
    });
  }

  const controlsRoot = el('processing-controls');
  if (controlsRoot) {
    controlsRoot.oninput = event => {
      const input = event.target;
      const parameterId = input?.getAttribute?.('data-process-param-id');
      if (!parameterId) return;

      const numericValue = parseFloat(input.value);
      if (!Number.isFinite(numericValue)) return;

      if (!uiState.processParametersByProcessId[uiState.selectedProcessId]) {
        uiState.processParametersByProcessId[uiState.selectedProcessId] = {};
      }
      uiState.processParametersByProcessId[uiState.selectedProcessId][parameterId] = numericValue;
    };
  }

  const collectButton = el('collect-sample-btn');
  if (collectButton) collectButton.addEventListener('click', onCollectSample);

  const analyzeButton = el('analyze-batch-btn');
  if (analyzeButton) analyzeButton.addEventListener('click', onAnalyzeBatch);

  const runProcessButton = el('run-process-btn');
  if (runProcessButton) runProcessButton.addEventListener('click', onRunProcess);
}

// ---------- Event handlers ----------

function onGeneratePlanet() {
  const seedInput = el('seed-input').value.trim();
  const seed = seedInput || String(Math.floor(Math.random() * 1e9));
  el('seed-input').value = seed;

  // Build world state (simulation truth) and knowledge state (player state) separately
  world = createWorld(seed);
  knowledge = createKnowledge(world);
  console.log('[Interlink] World state:', world);

  // Discovery RNG is UI-layer state — namespaced to avoid collision with generation
  discoveryRng = rngFor(seed + '-ui', 'discovery');

  uiState.selectedOccurrenceId = null;
  uiState.selectedBatchId = null;
  uiState.selectedProcessId = CRUSHING_PROCESS_ID;
  uiState.processParametersByProcessId = {};
  initializeProcessParameterDefaults();
  uiState.lastProcessRunId = null;
  uiState.infoMessage = '';
  uiState.errorMessage = '';

  const planet = world.planets[world.planetId];
  renderPlanet(planet);
  updateDiscoveryCounter();
  renderProcessingSection();

  el('planet-section').style.display = 'block';
  el('regions-section').style.display = 'block';
  el('discovery-section').style.display = 'block';
  el('processing-section').style.display = 'block';

  // Initialise the player-facing workspace with the new world + knowledge
  initWorkspace(world, knowledge);
}

function onDiscoverFeature() {
  if (!world || !knowledge) return;

  // Collect undiscovered feature IDs
  const undiscoveredIds = Object.keys(world.features).filter(id => !isFeatureDiscovered(knowledge, id));
  if (undiscoveredIds.length === 0) return;

  const idx = discoveryRng.int(0, undiscoveredIds.length - 1);
  const featureId = undiscoveredIds[idx];

  // Reveal discovery in knowledge state only — world state is untouched
  discoverFeature(knowledge, featureId);

  // Re-render only the affected region's features section
  const feature = world.features[featureId];
  const regionId = feature.regionId;
  const region = world.regions[regionId];
  const featuresEl = document.getElementById(`features-${regionId}`);
  if (featuresEl) {
    const featureObjects = region.features.map(fid => world.features[fid]);
    const discoveredFeatures = featureObjects.filter(f => isFeatureDiscovered(knowledge, f.id));
    const undiscoveredCount = featureObjects.filter(f => !isFeatureDiscovered(knowledge, f.id)).length;
    featuresEl.innerHTML =
      discoveredFeatures.map(renderFeature).join('') +
      (undiscoveredCount > 0 ? `<div class="undiscovered-hint">${undiscoveredCount} undiscovered feature(s)</div>` : '');
  }

  updateDiscoveryCounter();
  renderProcessingSection();

  // Sync discovery state to the player workspace
  updateWorkspaceKnowledge(knowledge);
}

function onCollectSample() {
  if (!world || !knowledge) return;

  try {
    const occurrenceId = el('occurrence-select')?.value;
    const sampleMassKg = parseFloat(el('sample-mass-input')?.value ?? DEFAULT_SAMPLE_MASS_KG);
    const batch = acquireSampleFromOccurrence(world, occurrenceId, sampleMassKg);

    uiState.selectedBatchId = batch.id;
    uiState.errorMessage = '';
    uiState.infoMessage = `Collected ${batch.totalMassKg.toFixed(3)} kg sample as ${batch.id} from ${occurrenceId}.`;
    renderProcessingSection();
  } catch (error) {
    uiState.errorMessage = error.message;
    uiState.infoMessage = '';
    renderProcessingSection();
  }
}

function onAnalyzeBatch() {
  if (!world || !knowledge) return;

  try {
    const batchId = el('batch-select')?.value;
    if (!batchId) throw new Error('No available sample batch selected');

    analyzeMaterialBatch(knowledge, world, batchId);
    uiState.selectedBatchId = batchId;
    uiState.errorMessage = '';
    uiState.infoMessage = `Analyzed batch ${batchId}.`;
    renderProcessingSection();
  } catch (error) {
    uiState.errorMessage = error.message;
    uiState.infoMessage = '';
    renderProcessingSection();
  }
}

function onRunProcess() {
  if (!world || !knowledge) return;

  try {
    const processId = el('process-select')?.value;
    const batchId = el('batch-select')?.value;
    if (!batchId) throw new Error('No available sample batch selected for processing');
    if (!isBatchAnalyzed(knowledge, batchId)) {
      throw new Error('Analyze the selected batch before processing');
    }

    const parameters = {
      ...(uiState.processParametersByProcessId[processId] ?? {}),
    };
    const processResult = runProcessAndCommit(world, processId, { feed: batchId }, parameters);

    uiState.lastProcessRunId = processResult.id;
    uiState.selectedBatchId = processResult.outputBatches[0]?.batchId ?? null;
    uiState.errorMessage = '';
    uiState.infoMessage = `Process run ${processResult.id} completed with balance error ${processResult.metrics.balanceErrorKg.toFixed(6)} kg.`;
    renderProcessingSection();
  } catch (error) {
    uiState.errorMessage = error.message;
    uiState.infoMessage = '';
    renderProcessingSection();
  }
}

// ---------- Init ----------

// Mode toggle: player view ↔ debug view
let currentMode = 'player'; // default to player workspace

function setMode(mode) {
  currentMode = mode;
  el('player-view').style.display = mode === 'player' ? '' : 'none';
  el('debug-view').style.display  = mode === 'debug'  ? '' : 'none';
  el('mode-toggle-btn').textContent = mode === 'player' ? 'Debug View' : 'Player View';
}

document.addEventListener('DOMContentLoaded', () => {
  setMode('player');

  el('mode-toggle-btn').addEventListener('click', () => {
    setMode(currentMode === 'player' ? 'debug' : 'player');
  });

  el('generate-btn').addEventListener('click', onGeneratePlanet);
  el('discover-btn').addEventListener('click', onDiscoverFeature);
  el('seed-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') onGeneratePlanet();
  });
});
