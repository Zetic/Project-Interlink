/* @ts-self-types="./interlink_worldgen_wasm.d.ts" */

export class WasmWorldgenDiagnostic {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmWorldgenDiagnosticFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmworldgendiagnostic_free(ptr, 0);
    }
    /**
     * @returns {string}
     */
    field_hash_hex() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmworldgendiagnostic_field_hash_hex(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    generator_version() {
        const ret = wasm.wasmworldgendiagnostic_generator_version(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    height() {
        const ret = wasm.wasmworldgendiagnostic_height(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    maximum() {
        const ret = wasm.wasmworldgendiagnostic_maximum(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    mean() {
        const ret = wasm.wasmworldgendiagnostic_mean(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    minimum() {
        const ret = wasm.wasmworldgendiagnostic_minimum(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {string} seed
     * @param {number} width
     * @param {number} height
     */
    constructor(seed, width, height) {
        const ptr0 = passStringToWasm0(seed, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmworldgendiagnostic_new(ptr0, len0, width, height);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        WasmWorldgenDiagnosticFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {bigint}
     */
    sample_count() {
        const ret = wasm.wasmworldgendiagnostic_sample_count(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * @returns {string}
     */
    stage_id() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmworldgendiagnostic_stage_id(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    stage_seed_hex() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmworldgendiagnostic_stage_seed_hex(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    stage_version() {
        const ret = wasm.wasmworldgendiagnostic_stage_version(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {Uint16Array}
     */
    values() {
        const ret = wasm.wasmworldgendiagnostic_values(this.__wbg_ptr);
        var v1 = getArrayU16FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 2, 2);
        return v1;
    }
    /**
     * @returns {number}
     */
    width() {
        const ret = wasm.wasmworldgendiagnostic_width(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) WasmWorldgenDiagnostic.prototype[Symbol.dispose] = WasmWorldgenDiagnostic.prototype.free;

export class WasmWorldgenTopology {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmWorldgenTopologyFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmworldgentopology_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    area_coefficient_of_variation() {
        const ret = wasm.wasmworldgentopology_area_coefficient_of_variation(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Float64Array}
     */
    area_steradians() {
        const ret = wasm.wasmworldgentopology_area_steradians(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    birth_levels() {
        const ret = wasm.wasmworldgentopology_birth_levels(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {number}
     */
    edge_coefficient_of_variation() {
        const ret = wasm.wasmworldgentopology_edge_coefficient_of_variation(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    edge_count() {
        const ret = wasm.wasmworldgentopology_edge_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    face_count() {
        const ret = wasm.wasmworldgentopology_face_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {Uint32Array}
     */
    faces() {
        const ret = wasm.wasmworldgentopology_faces(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {number}
     */
    five_neighbor_count() {
        const ret = wasm.wasmworldgentopology_five_neighbor_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    generator_version() {
        const ret = wasm.wasmworldgentopology_generator_version(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    interface_coefficient_of_variation() {
        const ret = wasm.wasmworldgentopology_interface_coefficient_of_variation(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    level() {
        const ret = wasm.wasmworldgentopology_level(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    maximum_area_steradians() {
        const ret = wasm.wasmworldgentopology_maximum_area_steradians(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    maximum_edge_arc_radians() {
        const ret = wasm.wasmworldgentopology_maximum_edge_arc_radians(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    maximum_interface_arc_radians() {
        const ret = wasm.wasmworldgentopology_maximum_interface_arc_radians(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    mean_area_steradians() {
        const ret = wasm.wasmworldgentopology_mean_area_steradians(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    mean_edge_arc_radians() {
        const ret = wasm.wasmworldgentopology_mean_edge_arc_radians(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    mean_interface_arc_radians() {
        const ret = wasm.wasmworldgentopology_mean_interface_arc_radians(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    minimum_area_steradians() {
        const ret = wasm.wasmworldgentopology_minimum_area_steradians(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    minimum_edge_arc_radians() {
        const ret = wasm.wasmworldgentopology_minimum_edge_arc_radians(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    minimum_interface_arc_radians() {
        const ret = wasm.wasmworldgentopology_minimum_interface_arc_radians(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Float64Array}
     */
    neighbor_arc_lengths_rad() {
        const ret = wasm.wasmworldgentopology_neighbor_arc_lengths_rad(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {Float64Array}
     */
    neighbor_interface_arc_lengths_rad() {
        const ret = wasm.wasmworldgentopology_neighbor_interface_arc_lengths_rad(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {Uint32Array}
     */
    neighbor_offsets() {
        const ret = wasm.wasmworldgentopology_neighbor_offsets(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {Uint32Array}
     */
    neighbors() {
        const ret = wasm.wasmworldgentopology_neighbors(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @param {number} level
     */
    constructor(level) {
        const ret = wasm.wasmworldgentopology_new(level);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        WasmWorldgenTopologyFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {Uint32Array}
     */
    parent_edges() {
        const ret = wasm.wasmworldgentopology_parent_edges(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {Float64Array}
     */
    positions() {
        const ret = wasm.wasmworldgentopology_positions(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {number}
     */
    sample_count() {
        const ret = wasm.wasmworldgentopology_sample_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    six_neighbor_count() {
        const ret = wasm.wasmworldgentopology_six_neighbor_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string}
     */
    topology_hash_hex() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmworldgentopology_topology_hash_hex(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    total_area_steradians() {
        const ret = wasm.wasmworldgentopology_total_area_steradians(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) WasmWorldgenTopology.prototype[Symbol.dispose] = WasmWorldgenTopology.prototype.free;

/**
 * @returns {number}
 */
export function worldgen_engine_version() {
    const ret = wasm.worldgen_engine_version();
    return ret >>> 0;
}

/**
 * @returns {number}
 */
export function worldgen_protocol_version() {
    const ret = wasm.worldgen_protocol_version();
    return ret >>> 0;
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_bb96b2010945f0bc: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./interlink_worldgen_wasm_bg.js": import0,
    };
}

const WasmWorldgenDiagnosticFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmworldgendiagnostic_free(ptr, 1));
const WasmWorldgenTopologyFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmworldgentopology_free(ptr, 1));

function getArrayF64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
}

function getArrayU16FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint16ArrayMemory0().subarray(ptr / 2, ptr / 2 + len);
}

function getArrayU32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedFloat64ArrayMemory0 = null;
function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint16ArrayMemory0 = null;
function getUint16ArrayMemory0() {
    if (cachedUint16ArrayMemory0 === null || cachedUint16ArrayMemory0.byteLength === 0) {
        cachedUint16ArrayMemory0 = new Uint16Array(wasm.memory.buffer);
    }
    return cachedUint16ArrayMemory0;
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedFloat64ArrayMemory0 = null;
    cachedUint16ArrayMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('interlink_worldgen_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
