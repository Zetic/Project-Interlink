/** Compatibility entry point for definition-driven apparatus Inspector controls. */
import {
  installApparatusControlUI as installChoiceControls,
} from './inspector/apparatusControlUI.js';
import {
  installGenericApparatusInspectorUI,
} from './inspector/genericApparatusInspectorUI.js';

export {
  apparatusChoiceParameterDefinition,
  apparatusParameterSelectionOptions,
  upgradeApparatusParameterControl,
  upgradeApparatusParameterControls,
} from './inspector/apparatusControlUI.js';
export {
  genericApparatusInspectorMarkup,
  upgradeGenericApparatusInspector,
  installGenericApparatusInspectorUI,
} from './inspector/genericApparatusInspectorUI.js';

/**
 * Keep live composition disclosure controls responsive while simulation updates
 * replace their inner markup. Pointer activation toggles on pointer-down so the
 * intended state is established before a live update can replace the summary
 * element between mouse-down and click. Keyboard activation still toggles on
 * the synthesized click.
 */
export function installCompositionDisclosureUI(documentRef = globalThis.document) {
  const root = documentRef?.body ?? documentRef?.documentElement;
  if (!root?.addEventListener) return () => {};

  const summaryForEvent = event => event.target?.closest?.('.ws-ins-comp-details > summary') ?? null;

  const onPointerDown = event => {
    if (event.button != null && event.button !== 0) return;
    const summary = summaryForEvent(event);
    const details = summary?.parentElement;
    if (!details) return;
    details.open = !details.open;
    summary.focus?.({ preventScroll: true });
    event.preventDefault?.();
  };

  const onClick = event => {
    const summary = summaryForEvent(event);
    const details = summary?.parentElement;
    if (!details) return;
    event.preventDefault?.();
    // Pointer activation was already handled before a live DOM replacement
    // could interrupt the gesture. Keyboard/synthetic activation has detail=0.
    if ((event.detail ?? 0) === 0) details.open = !details.open;
  };

  root.addEventListener('pointerdown', onPointerDown, true);
  root.addEventListener('click', onClick, true);
  return () => {
    root.removeEventListener?.('click', onClick, true);
    root.removeEventListener?.('pointerdown', onPointerDown, true);
  };
}

export function installApparatusControlUI(documentRef = globalThis.document) {
  const stopCompositionDisclosure = installCompositionDisclosureUI(documentRef);
  const stopGeneric = installGenericApparatusInspectorUI(documentRef);
  const stopChoices = installChoiceControls(documentRef);
  return () => {
    stopChoices?.();
    stopGeneric?.();
    stopCompositionDisclosure?.();
  };
}
