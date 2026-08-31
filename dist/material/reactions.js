import { listMaterialSpecies, requireMaterialSpecies } from './species.js';
function elementTotals(participants) {
    const totals = new Map();
    for (const participant of participants) {
        if (!Number.isFinite(participant.stoichiometricMoles) || participant.stoichiometricMoles <= 0) {
            throw new Error(`Reaction participant '${participant.speciesId}' requires positive stoichiometric moles.`);
        }
        const chemistry = requireMaterialSpecies(participant.speciesId).chemistry;
        if (!chemistry)
            throw new Error(`Reaction species '${participant.speciesId}' is missing elemental chemistry data.`);
        for (const [element, atoms] of Object.entries(chemistry.elementalComposition)) {
            totals.set(element, (totals.get(element) ?? 0) + atoms * participant.stoichiometricMoles);
        }
    }
    return totals;
}
export function validateReactionDefinition(reaction) {
    if (!reaction.id || !reaction.name)
        throw new Error('Reaction definitions require id and name.');
    if (!reaction.reactants.length || !reaction.products.length)
        throw new Error(`Reaction '${reaction.id}' requires reactants and products.`);
    const reactants = elementTotals(reaction.reactants);
    const products = elementTotals(reaction.products);
    const elements = new Set([...reactants.keys(), ...products.keys()]);
    for (const element of elements) {
        if (Math.abs((reactants.get(element) ?? 0) - (products.get(element) ?? 0)) > 1e-9) {
            throw new Error(`Reaction '${reaction.id}' does not conserve element '${element}'.`);
        }
    }
    return reaction;
}
export const GOETHITE_DEHYDROXYLATION_REACTION = Object.freeze(validateReactionDefinition({
    id: 'goethite-dehydroxylation',
    name: 'Goethite Dehydroxylation',
    reactants: Object.freeze([
        Object.freeze({ speciesId: 'goethite', stoichiometricMoles: 2 }),
    ]),
    products: Object.freeze([
        Object.freeze({ speciesId: 'hematite', stoichiometricMoles: 1, physicalForm: 'solid-particulate' }),
        Object.freeze({ speciesId: 'waterVapor', stoichiometricMoles: 1, physicalForm: 'gas' }),
    ]),
    thermochemistry: Object.freeze({ reactionEnthalpyJPerMolExtent: 90000 }),
    kinetics: Object.freeze({
        model: 'arrhenius-first-order',
        activationEnergyJPerMol: 90000,
        preExponentialFactorPerSecond: 60000,
        referenceParticleSizeM: 1e-4,
        particleSizeExponent: 0.35,
        minimumParticleSizeFactor: 0.1,
        maximumParticleSizeFactor: 5,
    }),
}));
export const REACTION_DEFINITIONS = Object.freeze([
    GOETHITE_DEHYDROXYLATION_REACTION,
]);
export function elementsAvailableFromSpecies(speciesIds) {
    const elements = new Set();
    for (const speciesId of speciesIds) {
        const chemistry = requireMaterialSpecies(speciesId).chemistry;
        if (!chemistry)
            continue;
        for (const element of Object.keys(chemistry.elementalComposition))
            elements.add(element);
    }
    return elements;
}
/**
 * Candidate discovery only: thermodynamics and kinetics still determine which
 * of these registered species can actually form under process conditions.
 */
export function candidateSpeciesForFeed(speciesIds) {
    const available = elementsAvailableFromSpecies(speciesIds);
    return listMaterialSpecies().filter(species => {
        const chemistry = species.chemistry;
        if (!chemistry)
            return false;
        return Object.keys(chemistry.elementalComposition).every(element => available.has(element));
    });
}
