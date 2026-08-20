import { getApparatusDefinition } from '../../content/apparatus/definitions.js';
import { apparatusRuntimeFor } from '../../simulation/apparatus/registry.js';
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
 * apparatus still receives working state, enable, capability, and parameter
 * controls without adding another node-type branch to the workspace controller.
 */
export function genericApparatusInspectorMarkup(node, definition = getApparatusDefinition(node?.nodeType)) {
  if (!node || !definition) return '';
  const state = node.enabled ? (node.operatingState ?? 'idle') : 'off';
  const capabilities = (definition.capabilities ?? []).map(capability => {
    const unit = capability.unit ? ` ${escHtml(capability.unit)}` : '';
    return `<div class="ws-ins-row"><b>${escHtml(capability.label)}:</b> ${escHtml(displayValue(node[capability.id]))}${unit}</div>`;
  }).join('');
  const parameters = (definition.parameters ?? []).map(parameter => parameterMarkup(node, parameter)).join('');
  return `<div class="ws-generic-apparatus-inspector" data-generic-apparatus-inspector="${escHtml(node.id)}"><div class="ws-ins-row"><b>State:</b> <span data-live="state">${escHtml(state)}</span></div><div class="ws-ins-row"><b>Enabled:</b> <button class="ws-btn-enable" data-node-id="${escHtml(node.id)}">${node.enabled ? 'On' : 'Off'}</button></div>${capabilities}${parameters}<div class="ws-ins-note" data-live="error"${node.lastError ? '' : ' hidden'}>${escHtml(node.lastError ?? '')}</div></div>`;
}

function inspectorBodies(root) {
  const bodies = [];
  if (root?.matches?.('#ws-inspector-body')) bodies.push(root);
  root?.querySelectorAll?.('#ws-inspector-body').forEach(body => bodies.push(body));
  return bodies;
}

export function upgradeGenericApparatusInspector(root) {
  for (const body of inspectorBodies(root)) {
    if (body.querySelector('.ws-btn-enable, [data-generic-apparatus-inspector]')) continue;
    const node = wsState.blueprint?.nodes?.[inspector.selectedNodeId];
    const definition = getApparatusDefinition(node?.nodeType);
    const runtime = apparatusRuntimeFor(node?.nodeType);
    if (!node || !definition || typeof runtime?.simulate !== 'function') continue;
    const markup = genericApparatusInspectorMarkup(node, definition);
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
      for (const addedNode of record.addedNodes ?? []) {
        if (addedNode?.nodeType === 1) upgradeGenericApparatusInspector(addedNode);
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}
