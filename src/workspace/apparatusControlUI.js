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

export function installApparatusControlUI(documentRef = globalThis.document) {
  const stopGeneric = installGenericApparatusInspectorUI(documentRef);
  const stopChoices = installChoiceControls(documentRef);
  return () => {
    stopChoices?.();
    stopGeneric?.();
  };
}
