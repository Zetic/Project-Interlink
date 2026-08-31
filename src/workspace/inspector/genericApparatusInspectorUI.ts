import { getApparatusDefinition } from '../../content/apparatus/definitions.js';
import { apparatusNodeFactoryFor } from '../../simulation/apparatus/registry.js';
import { machineInspection } from './inspectionViewModel.js';
import { wsState, inspector } from '../workspaceState.js';
import { escHtml } from '../shell/utils.js';

function displayValue(value) {
  return value == null ? '—' : String(value);
}

function parameterMarkup(node, parameter) {
  if (!parameter.playerConfigurable) return '';
  const unit = parameter.unit ? ` ${escHtml(parameter.unit)}` : '';
  const min = parameter.min == null ? '' : ` min="${escHtml(parameter.min)}"`;
  const max = parameter.max == null ? '' : ` max="${escHtml(parameter.max)}"`;
  return `<div class="ws-ins-row"><label><b>${escHtml(parameter.label)}:</b> <input class="ws-apparatus-parameter" data-node-id="${escHtml(node.id)}" data-parameter-id="${escHtml(parameter.id)}" type="${escHtml(parameter.controlType ?? 'number')}"${min}${max} step="any" value="${escHtml(node[parameter.id])}">${unit}</label></div>`;
}

/**
 * Definition-driven fallback Inspector markup for future active apparatus.
 * Current machines may keep richer specialized projections; a newly registered
 * apparatus still receives working state, enable, capability, flow, parameter,
 * and diagnostic controls without adding another node-type branch to the
 * workspace controller.
 */
export function genericApparatusInspectorMarkup(
  node,
  definition = getApparatusDefinition(node?.nodeType),
  details = null,
) {
  if (!node || !definition) return '';
  const state = node.enabled ? (node.operatingState ?? 'idle') : 'off';
  const capabilities = (definition.capabilities ?? []).map(capability => {
    const unit = capability.unit ? ` ${escHtml(capability.unit)}` : '';
    return `<div class="ws-ins-row"><b>${escHtml(capability.label)}:</b> ${escHtml(displayValue(node[capability.id]))}${unit}</div>`;
  }).join('');
  const parameters = (definition.parameters ?? []).map(parameter => parameterMarkup(node, parameter)).join('');
  const flow = details
    ? `<div class="ws-ins-row"><b>Actual feed:</b> <span data-live="generic-machine-feed">${details.actualFeedKgPerSecond.toFixed(3)}</span> kg/s</div><div class="ws-ins-row"><b>Actual product:</b> <span data-live="generic-machine-product">${details.actualProductKgPerSecond.toFixed(3)}</span> kg/s</div>`
    : '';
  return `<div class="ws-generic-apparatus-inspector" data-generic-apparatus-inspector="${escHtml(node.id)}"><div class="ws-ins-row"><b>State:</b> <span data-live="state">${escHtml(state)}</span></div><div class="ws-ins-row"><b>Enabled:</b> <button class="ws-btn-enable" data-node-id="${escHtml(node.id)}">${node.enabled ? 'On' : 'Off'}</button></div>${capabilities}${flow}${parameters}<div class="ws-ins-note" data-live="error"${node.lastError ? '' : ' hidden'}>${escHtml(node.lastError ?? '')}</div></div>`;
}

function inspectorBodies(root) {
  const bodies = new Set();
  if (root?.matches?.('#ws-inspector-body')) bodies.add(root);
  const ancestor = root?.closest?.('#ws-inspector-body');
  if (ancestor) bodies.add(ancestor);
  root?.querySelectorAll?.('#ws-inspector-body').forEach(body => bodies.add(body));
  return [...bodies];
}

function setTextIfChanged(element, value) {
  if (element && element.textContent !== value) element.textContent = value;
}

function refreshGenericApparatusInspector(body, node) {
  const generic = body.querySelector?.('[data-generic-apparatus-inspector]');
  if (!generic) return;
  const details = machineInspection(wsState.blueprint, node);
  setTextIfChanged(generic.querySelector?.('[data-live="state"]'), details.operatingState);
  setTextIfChanged(generic.querySelector?.('[data-live="generic-machine-feed"]'), details.actualFeedKgPerSecond.toFixed(3));
  setTextIfChanged(generic.querySelector?.('[data-live="generic-machine-product"]'), details.actualProductKgPerSecond.toFixed(3));
  const error = generic.querySelector?.('[data-live="error"]');
  if (error) {
    const message = details.lastError ?? '';
    setTextIfChanged(error, message);
    if (error.hidden !== !message) error.hidden = !message;
  }
}

export function upgradeGenericApparatusInspector(root) {
  for (const body of inspectorBodies(root)) {
    const node = wsState.blueprint?.nodes?.[inspector.selectedNodeId];
    const definition = getApparatusDefinition(node?.nodeType);
    const factory = apparatusNodeFactoryFor(node?.nodeType);
    if (!node || !definition || typeof factory?.create !== 'function') continue;

    if (body.querySelector?.('[data-generic-apparatus-inspector]')) {
      refreshGenericApparatusInspector(body, node);
      continue;
    }
    // Current apparatus may intentionally have richer built-in Inspector views.
    // Their enable control identifies that specialized view and suppresses the
    // fallback. Future registered apparatus need no controller branch.
    if (body.querySelector?.('.ws-btn-enable')) continue;

    const details = machineInspection(wsState.blueprint, node);
    const markup = genericApparatusInspectorMarkup(node, definition, details);
    if (markup) body.insertAdjacentHTML('beforeend', markup);
  }
}

export function installGenericApparatusInspectorUI(documentRef = globalThis.document) {
  const root = documentRef?.body ?? documentRef?.documentElement;
  if (!root) return () => {};
  upgradeGenericApparatusInspector(root);
  const Observer = documentRef?.defaultView?.MutationObserver ?? globalThis.MutationObserver;
  if (!Observer) return () => {};
  const observer = new Observer(records => {
    for (const record of records) {
      // innerHTML updates report the existing Inspector body as record.target;
      // inspecting it directly is what makes the fallback reliable when the
      // controller renders an otherwise-unknown future apparatus.
      if (record.target?.nodeType === 1) upgradeGenericApparatusInspector(record.target);
      for (const addedNode of record.addedNodes ?? []) {
        if (addedNode?.nodeType === 1) upgradeGenericApparatusInspector(addedNode);
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}
