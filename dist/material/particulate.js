export const PARTICLE_SIZE_BINS = Object.freeze([
    { id: 'lt-0.004mm', name: '<4 µm', minMm: 0, maxMm: 0.004, representativeMm: 0.002 },
    { id: '0.004-0.008mm', name: '4–8 µm', minMm: 0.004, maxMm: 0.008, representativeMm: 0.006 },
    { id: '0.008-0.016mm', name: '8–16 µm', minMm: 0.008, maxMm: 0.016, representativeMm: 0.012 },
    { id: '0.016-0.032mm', name: '16–32 µm', minMm: 0.016, maxMm: 0.032, representativeMm: 0.024 },
    { id: '0.032-0.063mm', name: '32–63 µm', minMm: 0.032, maxMm: 0.063, representativeMm: 0.0475 },
    { id: '0.063-0.125mm', name: '63–125 µm', minMm: 0.063, maxMm: 0.125, representativeMm: 0.094 },
    { id: '0.125-0.25mm', name: '125–250 µm', minMm: 0.125, maxMm: 0.25, representativeMm: 0.1875 },
    { id: '0.25-0.5mm', name: '250–500 µm', minMm: 0.25, maxMm: 0.5, representativeMm: 0.375 },
    { id: '0.5-1mm', name: '0.5–1 mm', minMm: 0.5, maxMm: 1, representativeMm: 0.75 },
    { id: '1-5mm', name: '1–5 mm', minMm: 1, maxMm: 5, representativeMm: 3 },
    { id: '5-15mm', name: '5–15 mm', minMm: 5, maxMm: 15, representativeMm: 10 },
    { id: '15-25mm', name: '15–25 mm', minMm: 15, maxMm: 25, representativeMm: 20 },
    { id: '25-60mm', name: '25–60 mm', minMm: 25, maxMm: 60, representativeMm: 42.5 },
    { id: '60-120mm', name: '60–120 mm', minMm: 60, maxMm: 120, representativeMm: 90 },
    { id: '120-250mm', name: '120–250 mm', minMm: 120, maxMm: 250, representativeMm: 185 },
    { id: '250-500mm', name: '250–500 mm', minMm: 250, maxMm: 500, representativeMm: 375 },
    { id: '500-1000mm', name: '500–1000 mm', minMm: 500, maxMm: 1000, representativeMm: 750 },
    { id: '1000mm-plus', name: '1000+ mm', minMm: 1000, maxMm: Number.POSITIVE_INFINITY, representativeMm: 1200 },
]);
export const LIBERATION_CLASSES = Object.freeze([
    Object.freeze({ id: 'locked', name: 'Locked', recoveryFactor: 0.25 }),
    Object.freeze({ id: 'partial', name: 'Partial', recoveryFactor: 0.55 }),
    Object.freeze({ id: 'mostly-liberated', name: 'Mostly Liberated', recoveryFactor: 0.8 }),
    Object.freeze({ id: 'liberated', name: 'Liberated', recoveryFactor: 1 }),
]);
const PARTICLE_SIZE_BIN_BY_ID = new Map(PARTICLE_SIZE_BINS.map((bin, index) => [bin.id, { ...bin, index }]));
const LEGACY_PARTICLE_SIZE_BIN_BY_ID = new Map([
    ['120mm-plus', { id: '120mm-plus', name: '120+ mm (legacy)', minMm: 120, maxMm: Number.POSITIVE_INFINITY, representativeMm: 140, index: 14 }],
]);
const LIBERATION_CLASS_BY_ID = new Map(LIBERATION_CLASSES.map((item, index) => [item.id, { ...item, index }]));
const FRAGMENTATION_TEMPLATES = Object.freeze({
    'coarse-solid': Object.freeze([
        Object.freeze({ particleSizeBinId: '60-120mm', liberationShares: Object.freeze({ locked: 0.75, partial: 0.25 }), massShare: 0.65 }),
        Object.freeze({ particleSizeBinId: '120mm-plus', liberationShares: Object.freeze({ locked: 0.9, partial: 0.1 }), massShare: 0.35 }),
    ]),
    'run-of-mine-rock': Object.freeze([
        Object.freeze({ particleSizeBinId: '120-250mm', liberationShares: Object.freeze({ locked: 0.97, partial: 0.03 }), massShare: 0.20 }),
        Object.freeze({ particleSizeBinId: '250-500mm', liberationShares: Object.freeze({ locked: 0.985, partial: 0.015 }), massShare: 0.45 }),
        Object.freeze({ particleSizeBinId: '500-1000mm', liberationShares: Object.freeze({ locked: 0.995, partial: 0.005 }), massShare: 0.35 }),
    ]),
});
export function particleSizeBinById(id) {
    return PARTICLE_SIZE_BIN_BY_ID.get(id) ?? LEGACY_PARTICLE_SIZE_BIN_BY_ID.get(id) ?? null;
}
export function liberationClassById(id) {
    return LIBERATION_CLASS_BY_ID.get(id) ?? null;
}
export function validateMineralTextureProfile(profile) {
    if (!profile.id || profile.id.includes('|'))
        throw new Error('Mineral texture profile requires a non-empty id without |.');
    const entries = Object.entries(profile.speciesTextures);
    if (!entries.length)
        throw new Error(`Mineral texture '${profile.id}' must contain species textures.`);
    for (const [speciesId, texture] of entries) {
        const { d10, d50, d90 } = texture.grainSizeUm;
        if (![d10, d50, d90].every(value => Number.isFinite(value) && value > 0) || !(d10 < d50 && d50 < d90)) {
            throw new Error(`Mineral texture '${profile.id}' species '${speciesId}' must satisfy 0 < d10 < d50 < d90.`);
        }
        const values = Object.values(texture.occurrenceModes);
        if (values.some(value => !Number.isFinite(value) || value < 0 || value > 1)) {
            throw new Error(`Mineral texture '${profile.id}' species '${speciesId}' occurrence modes must be in [0, 1].`);
        }
        const total = values.reduce((sum, value) => sum + value, 0);
        if (Math.abs(total - 1) > 0.005)
            throw new Error(`Mineral texture '${profile.id}' species '${speciesId}' occurrence modes must sum to 1.`);
    }
    return profile;
}
export function materializeSolidParticulateUnit(source) {
    if (source.physicalForm !== 'solid-particulate')
        throw new Error(`Unsupported source physical form '${source.physicalForm}'.`);
    const template = FRAGMENTATION_TEMPLATES[source.fragmentationProfileId];
    if (!template)
        throw new Error(`Unknown fragmentation profile '${source.fragmentationProfileId}'.`);
    const textureProfileId = source.mineralTexture?.id ?? null;
    const populations = [];
    for (const component of source.composition) {
        for (const size of template) {
            if (!particleSizeBinById(size.particleSizeBinId))
                throw new Error(`Unknown particle-size bin '${size.particleSizeBinId}'.`);
            for (const [liberationClassId, liberationShare] of Object.entries(size.liberationShares)) {
                if (!liberationClassById(liberationClassId))
                    throw new Error(`Unknown liberation class '${liberationClassId}'.`);
                const massFraction = component.massFraction * size.massShare * liberationShare;
                if (massFraction <= 1e-12)
                    continue;
                populations.push({
                    speciesId: component.speciesId,
                    particleSizeBinId: size.particleSizeBinId,
                    liberationClassId,
                    textureProfileId,
                    massFraction,
                });
            }
        }
    }
    const total = populations.reduce((sum, population) => sum + population.massFraction, 0);
    if (Math.abs(total - 1) > 1e-8)
        throw new Error(`Materialized particulate source must total 1 kg; got ${total}.`);
    return populations;
}
