# Worldgen Rewrite

This directory defines the greenfield Planet Engine rewrite that runs in parallel with Legacy Worldgen v7.

- [`VISION.md`](VISION.md) — mission and legacy-worldgen policy.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — Rust/WASM/Worker ownership and isolation.
- [`TOPOLOGY.md`](TOPOLOGY.md) — canonical hierarchical geodesic sphere and finite-volume geometry.
- [`TECTONICS.md`](TECTONICS.md) — deterministic spherical plate partitioning and rigid plate kinematics.
- [`GEOLOGY.md`](GEOLOGY.md) — dense crustal state, geological boundary regimes, and inferred geological memory.
- [`RESOLUTION.md`](RESOLUTION.md) — process-specific multiresolution policy.
- [`DETERMINISM.md`](DETERMINISM.md) — generator/stage identity and random-stream isolation.
- [`VALIDATION.md`](VALIDATION.md) — numerical, topology, and physical acceptance gates.

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

WG-1 generates no tectonics or downstream geography. Its topology is the fixed physical substrate consumed by later stages.

## WG-2 — spherical plate tectonics

WG-2 adds deterministic plate-scale physical truth without yet creating crust or terrain:

- seeded stochastic minimum-separation plate origins on the canonical sphere, permitting large and small macro plates rather than forcing near-equal territories;
- connected graph-Voronoi plate ownership using canonical geodesic edge distances;
- one rigid Euler pole/angular velocity per plate;
- plate area accounting from canonical dual-cell areas;
- boundary extraction from inter-plate neighbor edges;
- relative normal/shear kinematics and convergent/divergent/transform classification;
- deterministic tectonic identity independent from later geology;
- native, WASM, Worker, and browser plate diagnostics.

WG-2 intentionally stops before crustal state or terrain. Those derive from accepted plate truth rather than being embedded into the plate partition algorithm.

## WG-3 — crustal state and geological history

WG-3 introduces dense geological state on the same canonical topology:

- coherent continental, transitional, and oceanic crust independent from current plate borders;
- physical crust age, thickness, density, and relative buoyancy;
- oceanic crust age inferred from spreading-system distance and rate;
- convergent boundaries resolved into oceanic subduction, ocean-continent subduction, or continental collision;
- divergent boundaries resolved into oceanic ridges, continental rifts, or transitional divergence;
- deterministic subduction polarity from local crustal state and buoyancy;
- propagated orogenic, rift, ridge, subduction, trench, volcanic-arc, transform, subsidence, basin, and strain history fields;
- derived plate summaries, including area-based major/intermediate/minor classes and mixed crust fractions;
- native, WASM, Worker, and browser crust/history diagnostics.

WG-3 still generates no elevation or bathymetry. Its physical crust/history output is intended to constrain WG-4 initial terrain through isostasy and tectonic structure rather than direct terrain noise.
