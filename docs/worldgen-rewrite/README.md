# Worldgen Rewrite

This directory defines the greenfield Planet Engine rewrite that runs in parallel with Legacy Worldgen v7.

- [`VISION.md`](VISION.md) — mission and legacy-worldgen policy.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — Rust/WASM/Worker ownership and isolation.
- [`TOPOLOGY.md`](TOPOLOGY.md) — canonical hierarchical geodesic-sphere decision for WG-1.
- [`RESOLUTION.md`](RESOLUTION.md) — process-specific multiresolution policy.
- [`DETERMINISM.md`](DETERMINISM.md) — generator/stage identity and random-stream isolation.
- [`VALIDATION.md`](VALIDATION.md) — numerical, topology, and later physical acceptance gates.

The complete rewrite blueprint from planning is reflected across these reviewable architecture documents.

WG-0 is infrastructure only. It introduces the separate Rust worldgen core, WASM package, native CLI, browser Worker protocol, and diagnostic lab using a deterministic synthetic field. No physical terrain generation is added and the existing game remains on Legacy Worldgen v7.
