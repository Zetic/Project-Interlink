from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    if old not in text:
        if new in text:
            return
        raise SystemExit(f"expected text not found in {path}: {old[:120]!r}")
    target.write_text(text.replace(old, new, 1))


wasm_lib = Path("rust/interlink-worldgen-wasm/src/lib.rs")
text = wasm_lib.read_text()
if "mod inheritance_bridge;" not in text:
    text = "mod inheritance_bridge;\npub use inheritance_bridge::WasmWorldgenInheritance;\n" + text
text = text.replace("pub const WORLDGEN_WASM_PROTOCOL_VERSION: u32 = 5;", "pub const WORLDGEN_WASM_PROTOCOL_VERSION: u32 = 6;")
text = text.replace("assert_eq!(worldgen_protocol_version(), 5);", "assert_eq!(worldgen_protocol_version(), 6);")
if "inheritance_bridge_exposes_fine_physics_and_boundaries" not in text:
    marker = "    #[test] fn lithosphere_bridge_exposes_mechanics_and_refinement_fields() {\n"
    start = text.index(marker)
    end_marker = "    }\n}"
    end = text.index(end_marker, start)
    insertion = """    #[test] fn inheritance_bridge_exposes_fine_physics_and_boundaries() {
        let inherited = WasmWorldgenInheritance::new("wasm-wg3-75".to_owned(), 2, 3, 10).unwrap();
        let samples = inherited.fine_sample_count() as usize;
        assert_eq!(inherited.plate_ids().len(), samples);
        assert_eq!(inherited.crust_kind().len(), samples);
        assert_eq!(inherited.strength_index().len(), samples);
        assert_eq!(inherited.nearest_coarse_source().len(), samples);
        assert_eq!(inherited.inherited_sample_mask().len(), samples);
        assert_eq!(inherited.boundary_samples().len(), inherited.fine_boundary_edge_count() as usize * 2);
        assert_eq!(inherited.boundary_kinds().len(), inherited.fine_boundary_edge_count() as usize);
        assert_eq!(inherited.geological_boundary_regimes().len(), inherited.fine_boundary_edge_count() as usize);
        assert_eq!(inherited.boundary_coarse_source_indices().len(), inherited.fine_boundary_edge_count() as usize);
        assert!(inherited.equivalent_global_water_depth_m() > 0.0);
    }
"""
    text = text[:end + len("    }\n")] + insertion + text[end + len("    }\n"):]
wasm_lib.write_text(text)

replace_once(
    ".github/workflows/test.yml",
    "          cargo run -p interlink-worldgen-cli -- lithosphere --seed ci-wg3-5 --level 5 --plates 18\n",
    "          cargo run -p interlink-worldgen-cli -- lithosphere --seed ci-wg3-5 --level 5 --plates 18\n          cargo run -p interlink-worldgen-cli -- inheritance --seed ci-wg3-75 --coarse-level 4 --level 6 --plates 18\n          cargo run -p interlink-worldgen-cli -- profile\n",
)
