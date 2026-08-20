import { listProcessDefinitions } from '../core/processes/processDefinitions.js';

const parameterDefinitionsById = new Map();

for (const processDefinition of listProcessDefinitions()) {
  for (const parameter of processDefinition.parameters ?? []) {
    if (!parameter.choices?.length) continue;
    const existing = parameterDefinitionsById.get(parameter.id) ?? [];
    existing.push(parameter);
    parameterDefinitionsById.set(parameter.id, existing);
  }
}

function choiceSignature(parameter) {
  return JSON.stringify({
    unit: parameter.unit ?? null,
    choices: parameter.choices.map(choice => ({ value: choice.value, label: choice.label ?? null })),
  });
}

export function apparatusChoiceParameterDefinition(parameterId) {
  const matches = parameterDefinitionsById.get(parameterId) ?? [];
  if (!matches.length) return null;
  const signature = choiceSignature(matches[0]);
  if (matches.some(parameter => choiceSignature(parameter) !== signature)) return null;
  return matches[0];
}

function choiceDisplayLabel(parameter, choice) {
  const label = String(choice.label ?? choice.value);
  const unitSuffix = parameter.unit ? ` ${parameter.unit}` : '';
  return unitSuffix && label.endsWith(unitSuffix)
    ? label.slice(0, -unitSuffix.length)
    : label;
}

export function apparatusParameterSelectionOptions(parameterId, currentValue) {
  const parameter = apparatusChoiceParameterDefinition(parameterId);
  if (!parameter) return null;

  const numericCurrentValue = Number(currentValue);
  const isCanonical = parameter.choices.some(choice => choice.value === numericCurrentValue);
  const options = [];

  if (Number.isFinite(numericCurrentValue) && !isCanonical) {
    options.push({
      value: numericCurrentValue,
      label: `${numericCurrentValue} (legacy)`,
      selected: true,
      disabled: true,
      legacy: true,
    });
  }

  for (const choice of parameter.choices) {
    options.push({
      value: choice.value,
      label: choiceDisplayLabel(parameter, choice),
      selected: choice.value === numericCurrentValue,
      disabled: false,
      legacy: false,
    });
  }

  return options;
}

export function upgradeApparatusParameterControl(input) {
  if (!input?.matches?.('input.ws-apparatus-parameter[data-parameter-id]')) return input;
  const options = apparatusParameterSelectionOptions(input.dataset.parameterId, input.value);
  if (!options) return input;

  const documentRef = input.ownerDocument;
  const select = documentRef.createElement('select');
  select.className = input.className;
  select.disabled = input.disabled;
  select.dataset.nodeId = input.dataset.nodeId ?? '';
  select.dataset.parameterId = input.dataset.parameterId;

  for (const optionDefinition of options) {
    const option = documentRef.createElement('option');
    option.value = String(optionDefinition.value);
    option.textContent = optionDefinition.label;
    option.selected = optionDefinition.selected;
    option.disabled = optionDefinition.disabled;
    select.appendChild(option);
  }

  input.replaceWith(select);
  return select;
}

export function upgradeApparatusParameterControls(root) {
  if (!root) return;
  if (root.matches?.('input.ws-apparatus-parameter[data-parameter-id]')) {
    upgradeApparatusParameterControl(root);
  }
  root.querySelectorAll?.('input.ws-apparatus-parameter[data-parameter-id]')
    .forEach(upgradeApparatusParameterControl);
}

export function installApparatusControlUI(documentRef = globalThis.document) {
  const root = documentRef?.body ?? documentRef?.documentElement;
  if (!root) return () => {};

  upgradeApparatusParameterControls(root);
  const Observer = documentRef?.defaultView?.MutationObserver ?? globalThis.MutationObserver;
  if (!Observer) return () => {};

  const observer = new Observer(records => {
    for (const record of records) {
      for (const addedNode of record.addedNodes ?? []) {
        if (addedNode?.nodeType === 1) upgradeApparatusParameterControls(addedNode);
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}
