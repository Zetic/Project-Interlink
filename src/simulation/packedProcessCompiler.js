import { MATERIAL_FORMS } from '../core/materials/materialForms.js';
import { compileSolidMaterialStateForRuntime } from './packedRuntimeCompiler.js';
import { PackedSolidRuntimeStream } from './packedProcessRuntime.js';

/**
 * Compile one canonical solid MaterialStream into runtime-local packed state.
 * Runtime ID tables should be shared with the Hopper/material compiler for the
 * whole execution graph so the same canonical descriptor maps to one numeric ID.
 */
export function compileMaterialStreamForRuntime(stream, idTables) {
  if (!stream || typeof stream !== 'object') throw new Error('canonical material stream is required');
  if (stream.physicalForm !== MATERIAL_FORMS.SOLID_PARTICULATE) {
    throw new Error(`Packed process runtime currently supports solid-particulate streams, received '${stream.physicalForm}'`);
  }
  const { packed, idTables: resolvedIdTables } = compileSolidMaterialStateForRuntime(stream.solidState, idTables);
  return {
    packed: new PackedSolidRuntimeStream(
      packed,
      stream.specificSensibleEnthalpyJPerKg ?? 0,
    ),
    idTables: resolvedIdTables,
  };
}
