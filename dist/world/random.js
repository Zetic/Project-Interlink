function hashString(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}
function mulberry32(seed) {
    let state = seed >>> 0;
    return () => {
        state += 0x6d2b79f5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}
export function createRng(seed, namespace = 'root') {
    const nextValue = mulberry32(hashString(`${seed}::${namespace}`));
    return {
        next() {
            return nextValue();
        },
        range(min, max) {
            return min + (max - min) * nextValue();
        },
        int(min, max) {
            if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
                throw new Error(`Invalid integer range ${min}..${max}.`);
            }
            return min + Math.floor(nextValue() * (max - min + 1));
        },
        pick(values) {
            if (values.length === 0)
                throw new Error('Cannot pick from an empty collection.');
            return values[Math.floor(nextValue() * values.length)];
        },
    };
}
