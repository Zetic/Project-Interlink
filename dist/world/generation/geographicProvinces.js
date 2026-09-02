import { polygonArea } from '../geometry.js';
import { samplePlanetEnvironment } from './surfaceField.js';
import { wrappedDistanceSquared } from './tectonics.js';
const SIGNIFICANT_TYPES = new Set([
    'mountain-range', 'volcanic-arc', 'rift-zone', 'plateau', 'sedimentary-basin',
    'coastal-plain', 'coastal-highlands', 'oceanic-trench', 'mid-ocean-ridge',
    'continental-shelf', 'continental-slope', 'ocean-plateau',
]);
const GENERIC_TYPES = new Set([
    'highlands', 'lowlands', 'interior-plain', 'abyssal-plain', 'ocean-basin',
]);
const MIN_SEED_COMPONENT_AREA = 35;
const GENERIC_SPLIT_TARGET_AREA = 12_000;
const MAX_GENERIC_SEEDS_PER_COMPONENT = 8;
function clamp01(value) { return Math.max(0, Math.min(1, value)); }
function round(value, digits = 6) { return Number(value.toFixed(digits)); }
function pointKey(point) { return `${point.x.toFixed(6)}:${point.y.toFixed(6)}`; }
function edgeKey(start, end) { const a = pointKey(start); const b = pointKey(end); return a < b ? `${a}|${b}` : `${b}|${a}`; }
function uniqueTraits(values) {
    return [...new Set(values)].sort();
}
function buildPatchGraph(patches) {
    const neighbors = Array.from({ length: patches.length }, () => []);
    const coastline = new Uint8Array(patches.length);
    const owners = new Map();
    for (let patchIndex = 0; patchIndex < patches.length; patchIndex += 1) {
        const polygon = patches[patchIndex].polygon;
        for (let index = 0; index < polygon.length; index += 1) {
            const key = edgeKey(polygon[index], polygon[(index + 1) % polygon.length]);
            const values = owners.get(key) ?? [];
            values.push(patchIndex);
            owners.set(key, values);
        }
    }
    for (const values of owners.values()) {
        if (values.length < 2)
            continue;
        for (let leftIndex = 0; leftIndex < values.length; leftIndex += 1) {
            for (let rightIndex = leftIndex + 1; rightIndex < values.length; rightIndex += 1) {
                const left = values[leftIndex];
                const right = values[rightIndex];
                const leftPatch = patches[left];
                const rightPatch = patches[right];
                if (leftPatch.surfaceType !== rightPatch.surfaceType) {
                    coastline[left] = 1;
                    coastline[right] = 1;
                    continue;
                }
                if (leftPatch.parentId !== rightPatch.parentId)
                    continue;
                neighbors[left].push(right);
                neighbors[right].push(left);
            }
        }
    }
    for (const values of neighbors)
        values.sort((left, right) => left - right);
    const coastDistance = new Int16Array(patches.length);
    coastDistance.fill(32_767);
    const queue = [];
    for (let index = 0; index < coastline.length; index += 1) {
        if (!coastline[index])
            continue;
        coastDistance[index] = 0;
        queue.push(index);
    }
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const current = queue[cursor];
        const nextDistance = coastDistance[current] + 1;
        if (nextDistance > 12)
            continue;
        for (const neighbor of neighbors[current]) {
            if (nextDistance >= coastDistance[neighbor])
                continue;
            coastDistance[neighbor] = nextDistance;
            queue.push(neighbor);
        }
    }
    return { neighbors, coastDistance };
}
function traitsForEnvironment(environment, surfaceType, coastDistance) {
    const traits = [];
    if (coastDistance <= 2)
        traits.push('coastal');
    if (environment.boundaryType === 'convergent' && environment.boundaryProximity > 0.42)
        traits.push('orogenic');
    if (environment.volcanicActivity > 0.58)
        traits.push('volcanic');
    if (environment.boundaryType === 'divergent' && environment.boundaryProximity > 0.45)
        traits.push('rift');
    if (environment.sedimentaryBasinFactor > 0.62)
        traits.push('sedimentary');
    if (environment.reliefMeters > 1_250)
        traits.push('high-relief');
    if (surfaceType === 'land' && environment.meanElevationMeters > 1_500)
        traits.push('elevated');
    if (surfaceType === 'ocean' && coastDistance <= 2)
        traits.push('shelf');
    if (surfaceType === 'ocean' && coastDistance >= 2 && coastDistance <= 5)
        traits.push('slope');
    if (surfaceType === 'ocean' && environment.boundaryType === 'divergent' && environment.boundaryProximity > 0.52)
        traits.push('ridge');
    if (surfaceType === 'ocean' && environment.boundaryType === 'convergent' && environment.boundaryProximity > 0.58)
        traits.push('trench');
    if (surfaceType === 'ocean' && environment.meanElevationMeters < -3_400)
        traits.push('abyssal');
    return uniqueTraits(traits);
}
function classifyLand(environment, coastDistance) {
    const elevation = Math.max(0, environment.meanElevationMeters);
    const relief = environment.reliefMeters;
    const highElevation = clamp01((elevation - 650) / 2_800);
    const highRelief = clamp01((relief - 650) / 2_200);
    const lowElevation = 1 - clamp01(elevation / 1_700);
    const lowRelief = 1 - clamp01(relief / 1_800);
    const convergent = environment.boundaryType === 'convergent' ? environment.boundaryProximity : 0;
    const divergent = environment.boundaryType === 'divergent' ? environment.boundaryProximity : 0;
    const coast = 1 - clamp01(coastDistance / 5);
    const rift = divergent * 0.72 + environment.tectonicActivity * 0.28;
    const volcanicArc = environment.volcanicActivity * 0.62 + convergent * 0.28 + environment.tectonicActivity * 0.1;
    const mountain = highRelief * 0.45 + highElevation * 0.3 + convergent * 0.25;
    const coastalHighlands = coast * 0.48 + highRelief * 0.34 + highElevation * 0.18;
    const coastalPlain = coast * 0.58 + lowRelief * 0.24 + lowElevation * 0.18;
    const basin = environment.sedimentaryBasinFactor * 0.58 + lowRelief * 0.24 + lowElevation * 0.18;
    const plateau = highElevation * 0.66 + lowRelief * 0.34;
    const highlands = highRelief * 0.55 + highElevation * 0.45;
    const lowlands = lowElevation * 0.58 + lowRelief * 0.42;
    if (rift > 0.62)
        return { type: 'rift-zone', confidence: rift };
    if (volcanicArc > 0.68)
        return { type: 'volcanic-arc', confidence: volcanicArc };
    if (mountain > 0.62)
        return { type: 'mountain-range', confidence: mountain };
    if (coastDistance <= 2 && coastalHighlands > 0.66)
        return { type: 'coastal-highlands', confidence: coastalHighlands };
    if (coastDistance <= 2 && coastalPlain > 0.64)
        return { type: 'coastal-plain', confidence: coastalPlain };
    if (basin > 0.68)
        return { type: 'sedimentary-basin', confidence: basin };
    if (plateau > 0.7)
        return { type: 'plateau', confidence: plateau };
    if (highlands > 0.62)
        return { type: 'highlands', confidence: highlands };
    if (lowlands > 0.72)
        return { type: 'lowlands', confidence: lowlands };
    return { type: 'interior-plain', confidence: Math.max(0.42, lowRelief * 0.55 + (1 - highElevation) * 0.2) };
}
function classifyOcean(environment, coastDistance) {
    const depth = Math.max(1, -environment.meanElevationMeters);
    const deep = clamp01((depth - 1_800) / 3_600);
    const shallow = 1 - clamp01(depth / 2_400);
    const highRelief = clamp01((environment.reliefMeters - 650) / 2_200);
    const lowRelief = 1 - clamp01(environment.reliefMeters / 1_700);
    const convergent = environment.boundaryType === 'convergent' ? environment.boundaryProximity : 0;
    const divergent = environment.boundaryType === 'divergent' ? environment.boundaryProximity : 0;
    const coast = 1 - clamp01(coastDistance / 6);
    const trench = convergent * 0.62 + deep * 0.23 + environment.tectonicActivity * 0.15;
    const ridge = divergent * 0.62 + highRelief * 0.2 + environment.volcanicActivity * 0.18;
    const shelf = coast * 0.65 + shallow * 0.35;
    const slope = coast * 0.45 + (1 - clamp01(Math.abs(depth - 2_200) / 1_900)) * 0.55;
    const plateau = shallow * 0.55 + highRelief * 0.45;
    const abyssal = deep * 0.7 + lowRelief * 0.3;
    if (trench > 0.64)
        return { type: 'oceanic-trench', confidence: trench };
    if (ridge > 0.6)
        return { type: 'mid-ocean-ridge', confidence: ridge };
    if (coastDistance <= 2 && shelf > 0.67)
        return { type: 'continental-shelf', confidence: shelf };
    if (coastDistance <= 5 && slope > 0.62)
        return { type: 'continental-slope', confidence: slope };
    if (plateau > 0.7)
        return { type: 'ocean-plateau', confidence: plateau };
    if (abyssal > 0.68)
        return { type: 'abyssal-plain', confidence: abyssal };
    return { type: 'ocean-basin', confidence: Math.max(0.44, deep * 0.28 + lowRelief * 0.22) };
}
function classifyPatch(patch, coastDistance, context) {
    const environment = samplePlanetEnvironment(context, patch.center);
    const classified = patch.surfaceType === 'land' ? classifyLand(environment, coastDistance) : classifyOcean(environment, coastDistance);
    return {
        geographicType: classified.type,
        geographicTraits: traitsForEnvironment(environment, patch.surfaceType, coastDistance),
        confidence: round(classified.confidence, 4),
        plateId: environment.plateId,
    };
}
function smoothClassifications(patches, graph, values) {
    let current = values.map(value => ({ ...value, geographicTraits: [...value.geographicTraits] }));
    for (let pass = 0; pass < 2; pass += 1) {
        const next = current.map(value => ({ ...value, geographicTraits: [...value.geographicTraits] }));
        for (let index = 0; index < patches.length; index += 1) {
            const value = current[index];
            if (SIGNIFICANT_TYPES.has(value.geographicType) && value.confidence >= 0.78)
                continue;
            const counts = new Map();
            for (const neighbor of graph.neighbors[index]) {
                const candidate = current[neighbor];
                const entry = counts.get(candidate.geographicType) ?? { count: 0, confidence: 0, traits: [] };
                entry.count += 1;
                entry.confidence += candidate.confidence;
                entry.traits.push(...candidate.geographicTraits);
                counts.set(candidate.geographicType, entry);
            }
            const best = [...counts.entries()].sort((left, right) => right[1].count - left[1].count || right[1].confidence - left[1].confidence || left[0].localeCompare(right[0]))[0];
            if (!best)
                continue;
            const neighborCount = graph.neighbors[index].length;
            if (best[1].count < 2 || best[1].count / Math.max(1, neighborCount) < 0.56)
                continue;
            const averageConfidence = best[1].confidence / best[1].count;
            if (best[0] !== value.geographicType && averageConfidence >= value.confidence - 0.04) {
                next[index] = {
                    geographicType: best[0],
                    geographicTraits: uniqueTraits([...value.geographicTraits, ...best[1].traits]),
                    confidence: round(Math.max(value.confidence * 0.86, averageConfidence * 0.94), 4),
                    plateId: value.plateId,
                };
            }
        }
        current = next;
    }
    return current;
}
function componentKey(classification) {
    return GENERIC_TYPES.has(classification.geographicType)
        ? `${classification.geographicType}:${classification.plateId}`
        : classification.geographicType;
}
function classificationComponents(patches, graph, classifications) {
    const visited = new Uint8Array(patches.length);
    const components = [];
    for (let start = 0; start < patches.length; start += 1) {
        if (visited[start])
            continue;
        const patch = patches[start];
        const key = componentKey(classifications[start]);
        const queue = [start];
        const indexes = [];
        visited[start] = 1;
        let area = 0;
        let confidence = 0;
        const traits = [];
        while (queue.length) {
            const current = queue.pop();
            indexes.push(current);
            area += polygonArea(patches[current].polygon);
            confidence += classifications[current].confidence;
            traits.push(...classifications[current].geographicTraits);
            for (const neighbor of graph.neighbors[current]) {
                if (visited[neighbor])
                    continue;
                const neighborPatch = patches[neighbor];
                if (neighborPatch.parentId !== patch.parentId || neighborPatch.surfaceType !== patch.surfaceType)
                    continue;
                if (componentKey(classifications[neighbor]) !== key)
                    continue;
                visited[neighbor] = 1;
                queue.push(neighbor);
            }
        }
        indexes.sort((left, right) => left - right);
        components.push({
            indexes,
            area,
            parentId: patch.parentId,
            surfaceType: patch.surfaceType,
            geographicType: classifications[start].geographicType,
            geographicTraits: uniqueTraits(traits),
            confidence: confidence / Math.max(1, indexes.length),
        });
    }
    return components.sort((left, right) => left.parentId.localeCompare(right.parentId) || left.geographicType.localeCompare(right.geographicType) || left.indexes[0] - right.indexes[0]);
}
function farthestPatchIndexes(component, patches, classifications, count) {
    const first = component.indexes.reduce((best, index) => classifications[index].confidence > classifications[best].confidence ? index : best, component.indexes[0]);
    const selected = [first];
    while (selected.length < Math.min(count, component.indexes.length)) {
        let candidate = component.indexes[0];
        let candidateDistance = -1;
        for (const index of component.indexes) {
            if (selected.includes(index))
                continue;
            let nearest = Infinity;
            for (const existing of selected)
                nearest = Math.min(nearest, wrappedDistanceSquared(patches[index].center, patches[existing].center));
            const weighted = nearest * (0.85 + classifications[index].confidence * 0.3);
            if (weighted > candidateDistance || (weighted === candidateDistance && index < candidate)) {
                candidate = index;
                candidateDistance = weighted;
            }
        }
        selected.push(candidate);
    }
    return selected;
}
function createProvinceSeeds(patches, graph, components, classifications) {
    const seeds = [];
    const parentsWithSeed = new Set();
    for (const component of components) {
        if (component.area < MIN_SEED_COMPONENT_AREA)
            continue;
        const splitCount = GENERIC_TYPES.has(component.geographicType)
            ? Math.max(1, Math.min(MAX_GENERIC_SEEDS_PER_COMPONENT, Math.ceil(component.area / GENERIC_SPLIT_TARGET_AREA)))
            : 1;
        const seedIndexes = farthestPatchIndexes(component, patches, classifications, splitCount);
        for (let ordinal = 0; ordinal < seedIndexes.length; ordinal += 1) {
            const patchIndex = seedIndexes[ordinal];
            const patch = patches[patchIndex];
            const classification = classifications[patchIndex];
            seeds.push({
                id: `province-${patch.parentId}-${component.geographicType}-${patch.id.replace(/^patch-/, '')}-${ordinal}`,
                patchIndex,
                point: patch.center,
                parentId: patch.parentId,
                surfaceType: patch.surfaceType,
                geographicType: component.geographicType,
                geographicTraits: uniqueTraits([...component.geographicTraits, ...classification.geographicTraits]),
                confidence: round(Math.max(component.confidence, classification.confidence), 4),
            });
            parentsWithSeed.add(patch.parentId);
        }
    }
    // Every disconnected parent-surface component needs a seed so islands and enclosed
    // basins cannot be attached to a remote Region merely because they share a parent ID.
    const seededPatches = new Set(seeds.map(seed => seed.patchIndex));
    const visited = new Uint8Array(patches.length);
    for (let start = 0; start < patches.length; start += 1) {
        if (visited[start])
            continue;
        const patch = patches[start];
        const queue = [start];
        const indexes = [];
        visited[start] = 1;
        let hasSeed = false;
        while (queue.length) {
            const current = queue.pop();
            indexes.push(current);
            if (seededPatches.has(current))
                hasSeed = true;
            for (const neighbor of graph.neighbors[current]) {
                if (visited[neighbor])
                    continue;
                if (patches[neighbor].parentId !== patch.parentId || patches[neighbor].surfaceType !== patch.surfaceType)
                    continue;
                visited[neighbor] = 1;
                queue.push(neighbor);
            }
        }
        if (hasSeed)
            continue;
        const patchIndex = indexes.reduce((best, index) => classifications[index].confidence > classifications[best].confidence ? index : best, indexes[0]);
        const fallbackPatch = patches[patchIndex];
        const classification = classifications[patchIndex];
        seeds.push({
            id: `province-${fallbackPatch.parentId}-${classification.geographicType}-${fallbackPatch.id.replace(/^patch-/, '')}-island`,
            patchIndex,
            point: fallbackPatch.center,
            parentId: fallbackPatch.parentId,
            surfaceType: fallbackPatch.surfaceType,
            geographicType: classification.geographicType,
            geographicTraits: classification.geographicTraits,
            confidence: classification.confidence,
        });
        seededPatches.add(patchIndex);
        parentsWithSeed.add(fallbackPatch.parentId);
    }
    return seeds.sort((left, right) => left.parentId.localeCompare(right.parentId) || left.id.localeCompare(right.id));
}
class MinHeap {
    values = [];
    get size() { return this.values.length; }
    push(value) {
        this.values.push(value);
        let index = this.values.length - 1;
        while (index > 0) {
            const parent = Math.floor((index - 1) / 2);
            if (!this.less(value, this.values[parent]))
                break;
            this.values[index] = this.values[parent];
            index = parent;
        }
        this.values[index] = value;
    }
    pop() {
        if (!this.values.length)
            return undefined;
        const root = this.values[0];
        const last = this.values.pop();
        if (this.values.length) {
            let index = 0;
            while (true) {
                const left = index * 2 + 1;
                const right = left + 1;
                if (left >= this.values.length)
                    break;
                let child = left;
                if (right < this.values.length && this.less(this.values[right], this.values[left]))
                    child = right;
                if (!this.less(this.values[child], last))
                    break;
                this.values[index] = this.values[child];
                index = child;
            }
            this.values[index] = last;
        }
        return root;
    }
    less(left, right) {
        return left.distance < right.distance || (left.distance === right.distance && (left.seedIndex < right.seedIndex || (left.seedIndex === right.seedIndex && left.patchIndex < right.patchIndex)));
    }
}
function semanticTransitionMultiplier(seed, classification) {
    if (classification.geographicType === seed.geographicType)
        return 0.52;
    const seedSignificant = SIGNIFICANT_TYPES.has(seed.geographicType);
    const targetSignificant = SIGNIFICANT_TYPES.has(classification.geographicType);
    if (seedSignificant && targetSignificant)
        return 3.8;
    if (seedSignificant || targetSignificant)
        return 2.25;
    if (GENERIC_TYPES.has(seed.geographicType) && GENERIC_TYPES.has(classification.geographicType))
        return 1.2;
    return 1.55;
}
function assignPatchesByGeographicAffinity(patches, graph, classifications, seeds) {
    const distance = new Float64Array(patches.length);
    distance.fill(Number.POSITIVE_INFINITY);
    const owner = new Int32Array(patches.length);
    owner.fill(-1);
    const heap = new MinHeap();
    for (let seedIndex = 0; seedIndex < seeds.length; seedIndex += 1) {
        const seed = seeds[seedIndex];
        distance[seed.patchIndex] = 0;
        owner[seed.patchIndex] = seedIndex;
        heap.push({ patchIndex: seed.patchIndex, seedIndex, distance: 0 });
    }
    while (heap.size) {
        const current = heap.pop();
        if (current.distance !== distance[current.patchIndex] || owner[current.patchIndex] !== current.seedIndex)
            continue;
        const seed = seeds[current.seedIndex];
        const currentPatch = patches[current.patchIndex];
        for (const neighbor of graph.neighbors[current.patchIndex]) {
            const nextPatch = patches[neighbor];
            if (nextPatch.parentId !== seed.parentId || nextPatch.surfaceType !== seed.surfaceType)
                continue;
            const step = Math.sqrt(wrappedDistanceSquared(currentPatch.center, nextPatch.center));
            const multiplier = semanticTransitionMultiplier(seed, classifications[neighbor]);
            const confidenceBonus = 1 - Math.min(0.22, classifications[neighbor].confidence * 0.14);
            const nextDistance = current.distance + Math.max(0.001, step * multiplier * confidenceBonus);
            const currentOwner = owner[neighbor];
            const winsTie = currentOwner < 0 || seed.id < seeds[currentOwner].id;
            if (nextDistance < distance[neighbor] - 1e-9 || (Math.abs(nextDistance - distance[neighbor]) <= 1e-9 && winsTie)) {
                distance[neighbor] = nextDistance;
                owner[neighbor] = current.seedIndex;
                heap.push({ patchIndex: neighbor, seedIndex: current.seedIndex, distance: nextDistance });
            }
        }
    }
    const fallbackSeedByParent = new Map();
    for (let index = 0; index < seeds.length; index += 1)
        if (!fallbackSeedByParent.has(seeds[index].parentId))
            fallbackSeedByParent.set(seeds[index].parentId, index);
    const assignments = seeds.map(seed => ({ seed, patches: [] }));
    for (let index = 0; index < patches.length; index += 1) {
        let seedIndex = owner[index];
        if (seedIndex < 0)
            seedIndex = fallbackSeedByParent.get(patches[index].parentId) ?? -1;
        if (seedIndex < 0)
            throw new Error(`No semantic geographic province reaches patch ${patches[index].id}.`);
        assignments[seedIndex].patches.push(patches[index]);
    }
    return assignments.filter(assignment => assignment.patches.length > 0).sort((left, right) => left.seed.id.localeCompare(right.seed.id));
}
/**
 * Regions are seeded by coherent generated geography rather than a geometric lattice.
 * Significant connected mountain, volcanic, rift, basin, coastal, shelf, ridge, and
 * trench structures become province seeds; generic interiors are only subdivided when
 * they become continent-scale. A multi-source geographic-affinity flood then produces
 * one connected ownership partition without making the technical mesh itself meaningful.
 */
export function generateGeographicProvinceAssignments(geography, context) {
    const graph = buildPatchGraph(geography.patches);
    const raw = geography.patches.map((patch, index) => classifyPatch(patch, graph.coastDistance[index], context));
    const classifications = smoothClassifications(geography.patches, graph, raw);
    const components = classificationComponents(geography.patches, graph, classifications);
    const seeds = createProvinceSeeds(geography.patches, graph, components, classifications);
    return assignPatchesByGeographicAffinity(geography.patches, graph, classifications, seeds);
}
