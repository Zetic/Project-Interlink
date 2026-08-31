import {
  extractorOccurrenceEligibility,
  extractorOutputRates,
} from './extractorNode.js';
import {
  compileSolidMaterialStateForRuntime,
  createPackedMaterialIdTables,
} from './packedRuntimeCompiler.js';

const OCCURRENCE_TEMPLATE_TOLERANCE = 1e-8;

function validateReserveMass(value) {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error('packed ResourceOccurrence reserveMassKg must be null or a finite positive number');
  }
  return value;
}

/**
 * Compile one canonical Feature-owned solid ResourceOccurrence into a normalized
 * one-kilogram packed material template. The compiler deliberately reuses the
 * production occurrence materialization path so ore/non-ore fragmentation,
 * composition normalization, mineral texture lineage, and current eligibility
 * semantics remain the canonical setup source for Rust execution.
 *
 * Current generated worlds have qualitative `quantityClass` only; that value is
 * not a measured physical reserve and is therefore never converted into mass.
 * `reserveMassKg` is an explicit future-facing runtime option and defaults to an
 * unbounded occurrence, matching production behavior today.
 */
export function compileResourceOccurrenceForRuntime(
  occurrence,
  idTables = createPackedMaterialIdTables(),
  { reserveMassKg = null } = {},
) {
  if (!occurrence || typeof occurrence !== 'object' || Array.isArray(occurrence)) {
    throw new Error('canonical ResourceOccurrence is required');
  }
  if (typeof occurrence.id !== 'string' || occurrence.id.length === 0) {
    throw new Error('canonical ResourceOccurrence id must be a non-empty string');
  }
  if (occurrence.sourceType !== 'feature' || typeof occurrence.sourceId !== 'string' || occurrence.sourceId.length === 0) {
    throw new Error('packed extraction currently requires a Feature-owned ResourceOccurrence');
  }
  const eligibility = extractorOccurrenceEligibility(occurrence);
  if (!eligibility.ok) throw new Error(eligibility.reason);

  // An Extractor configured at exactly 1 kg/s produces the canonical one-unit
  // material template. This keeps the compiler synchronized with production's
  // run-of-mine/coarse-solid fragmentation policy without putting string/content
  // decisions into Rust hot loops.
  const canonicalMaterialPerKg = extractorOutputRates(
    { prototypeRateKgPerSecond: 1 },
    occurrence,
    1,
  );
  const { packed, idTables: resolvedTables } = compileSolidMaterialStateForRuntime(
    canonicalMaterialPerKg,
    idTables,
  );
  const templateMass = packed.totalQuantity();
  if (Math.abs(templateMass - 1) > OCCURRENCE_TEMPLATE_TOLERANCE) {
    throw new Error(`packed ResourceOccurrence material template must total 1 kg, got ${templateMass} kg`);
  }

  return {
    occurrence: {
      canonicalOccurrenceId: occurrence.id,
      canonicalFeatureId: occurrence.sourceId,
      canonicalResourceId: occurrence.resourceId ?? null,
      materialPerKg: packed,
      reserveMassKg: validateReserveMass(reserveMassKg),
    },
    idTables: resolvedTables,
  };
}

/**
 * Compile every currently extractable occurrence in a world into one runtime ID
 * space. Unsupported liquid/gas resources stay canonical and are intentionally
 * absent from this solid-extraction registry; their eligibility remains visible
 * in the returned `unsupported` map for diagnostics and future extractor types.
 */
export function compileExtractableWorldOccurrencesForRuntime(
  world,
  idTables = createPackedMaterialIdTables(),
) {
  if (!world?.resourceOccurrences || typeof world.resourceOccurrences !== 'object') {
    throw new Error('world resourceOccurrences are required');
  }
  const occurrences = {};
  const unsupported = {};
  let resolvedTables = idTables;
  for (const [occurrenceId, occurrence] of Object.entries(world.resourceOccurrences)) {
    const eligibility = extractorOccurrenceEligibility(occurrence);
    if (!eligibility.ok) {
      unsupported[occurrenceId] = eligibility.reason;
      continue;
    }
    const compiled = compileResourceOccurrenceForRuntime(occurrence, resolvedTables);
    resolvedTables = compiled.idTables;
    occurrences[occurrenceId] = compiled.occurrence;
  }
  return { occurrences, unsupported, idTables: resolvedTables };
}
