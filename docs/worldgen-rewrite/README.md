# Worldgen Rewrite

This directory defines the greenfield Planet Engine rewrite that runs in parallel with Legacy Worldgen v7.

- [`VISION.md`](VISION.md) — mission and legacy-worldgen policy.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — Rust/WASM/Worker ownership and isolation.
- [`TOPOLOGY.md`](TOPOLOGY.md) — canonical hierarchical geodesic sphere and finite-volume geometry.
- [`RESOLUTION.md`](RESOLUTION.md) — process-specific multiresolution policy.
- [`DETERMINISM.md`](DETERMINISM.md) — generator/stage identity and random-stream isolation.
- [`VALIDATION.md`](VALIDATION.md) — numerical, topology, and later physical acceptance gates.

The complete rewrite blueprint from planning is reflected across these reviewable architecture documents.

## WG-0 — isolated engine foundation

WG-0 establishes the separate Rust worldgen core, independent WASM package, native CLI, dedicated browser Worker/protocol, and diagnostic lab. Its deterministic synthetic field is retained only as an end-to-end transport/determinism regression. Legacy Worldgen v7 remains the active gameplay path.

## WG-1 — canonical spherical topology

WG-1 introduces the first production planetary state:

- deterministic hierarchical icosahedral samples;
- stable refinement identity/provenance;
- dense 5/6-neighbor topology;
- spherical circumcentric dual-cell areas;
- center-to-center geodesic distances;
- shared dual-interface lengths for conservative finite-volume fluxes;
- latitude/longitude, great-circle, Cartesian-anchor, and local ENU coordinate contracts;
- native/WASM/browser topology diagnostics;
- committed worldgen WASM assets so the standalone lab is compatible with static GitHub Pages after merge.

WG-1 still generates no tectonics, terrain, climate, resources, Regions, or gameplay world. The next physical stage is spherical plate tectonics only after the topology acceptance gates pass.
