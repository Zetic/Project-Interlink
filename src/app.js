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
import { createKnowledge, discoverFeature, isFeatureDiscovered } from './core/world/knowledgeState.js';
import { rngFor, hashSeed } from './generator/random.js';

// ---------- Application state ----------

let world = null;
let knowledge = null;
let discoveryRng = null;

// UI-only state: nothing here is simulation truth
const uiState = {
  discoveredCount: 0,
  totalFeatureCount: 0,
};

// ---------- DOM helpers ----------

function el(id) {
  return document.getElementById(id);
}

function qs(sel) {
  return document.querySelector(sel);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
    }  }).join('');
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

  const planet = world.planets[world.planetId];
  renderPlanet(planet);
  updateDiscoveryCounter();

  el('planet-section').style.display = 'block';
  el('regions-section').style.display = 'block';
  el('discovery-section').style.display = 'block';
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
}

// ---------- Init ----------

document.addEventListener('DOMContentLoaded', () => {
  el('generate-btn').addEventListener('click', onGeneratePlanet);
  el('discover-btn').addEventListener('click', onDiscoverFeature);
  el('seed-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') onGeneratePlanet();
  });
});
