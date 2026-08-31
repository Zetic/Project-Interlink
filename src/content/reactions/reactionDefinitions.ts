export const GOETHITE_DEHYDROXYLATION_REACTION_ID = 'goethite-dehydroxylation';

export const REACTION_DEFINITIONS = Object.freeze({
  [GOETHITE_DEHYDROXYLATION_REACTION_ID]: Object.freeze({
    id: GOETHITE_DEHYDROXYLATION_REACTION_ID,
    name: 'Goethite Dehydroxylation',
    reactants: Object.freeze([
      Object.freeze({ speciesId: 'goethite', stoichiometricMoles: 2 }),
    ]),
    products: Object.freeze([
      Object.freeze({ speciesId: 'hematite', stoichiometricMoles: 1, physicalForm: 'solid-particulate' }),
      Object.freeze({ speciesId: 'waterVapor', stoichiometricMoles: 1, physicalForm: 'gas' }),
    ]),
    thermochemistry: Object.freeze({
      // Rounded endothermic prototype assumption for 2 FeO(OH) -> Fe2O3 + H2O.
      // It deliberately avoids falsely precise temperature-dependent data.
      reactionEnthalpyJPerMolExtent: 90000,
    }),
    kinetics: Object.freeze({
      model: 'arrhenius-first-order',
      activationEnergyJPerMol: 90000,
      preExponentialFactorPerSecond: 60000,
      referenceParticleSizeM: 1e-4,
      particleSizeExponent: 0.35,
      minimumParticleSizeFactor: 0.1,
      maximumParticleSizeFactor: 5,
    }),
  }),
});

export function getReactionDefinition(reactionId) {
  return REACTION_DEFINITIONS[reactionId] ?? null;
}
