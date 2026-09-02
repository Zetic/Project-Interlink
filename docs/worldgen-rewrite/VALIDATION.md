# Planet Engine Validation

Worldgen acceptance focuses on numerical and physical behavior rather than gameplay clickability.

## WG-0

- Rust core has no gameplay dependency;
- browser and WASM protocol versions are explicit and equal;
- dense field dimensions are bounded and validated;
- same seed produces identical values/hash;
- different seeds produce different values/hash;
- native CLI executes the same core generator;
- separate WASM crate compiles for `wasm32-unknown-unknown`;
- Worker transfer uses dense typed data rather than per-cell objects;
- legacy v7 gameplay path remains untouched.

## WG-1 topology gates

The canonical spherical substrate is not accepted from visual inspection alone.

- exact hierarchy counts `V = 10×4^L+2`, `E = 30×4^L`, `F = 20×4^L`;
- Euler characteristic `V-E+F = 2`;
- total dual-cell area closes to `4π` steradians within strict tolerance;
- exactly twelve degree-five sites;
- every regular site degree six;
- reciprocal neighbors;
- no non-manifold edges: every primal edge belongs to exactly two faces;
- normalized unit positions;
- positive center-to-center geodesic edge lengths;
- positive dual-interface lengths;
- directed center distances and dual-interface lengths are symmetric across each neighbor pair;
- dense neighbor, center-distance, and interface-distance arrays remain index aligned;
- dual-cell area coefficient of variation remains within the defined topology quality bound;
- dual-interface variation is measured and remains within the defined finite-volume quality bound;
- inherited sample IDs and refinement provenance remain stable between levels;
- deterministic topology hash;
- latitude/longitude conversion round-trips within strict tolerance;
- tangent bases remain orthonormal, including polar anchors;
- local east/north/up meter coordinates round-trip through global Cartesian coordinates within strict tolerance.

The topology CLI reports cell-area, center-edge, and dual-interface distributions so changes to geometric quality are visible before downstream physics is added.

## WG-2 tectonic gates

Plate tectonics is accepted as a spherical kinematic partition, not by whether a diagnostic screenshot resembles Earth.

- identical seed + plate count + topology produces identical plate ownership, kinematics, boundaries, and tectonic hash;
- changing the stage seed changes tectonic identity;
- every topology sample has exactly one valid plate owner;
- every requested plate is non-empty and owns its deterministic seed sample;
- every plate forms one connected component on the canonical neighbor graph;
- summed plate control areas close to `4π` steradians;
- representative worlds keep plate areas and plate-seed spacing at macro scale rather than producing degenerate fragments;
- every rigid plate velocity is tangent to the spherical surface (`r·v ≈ 0`);
- plate reference speeds remain finite and within the intended tectonic-scale diagnostic range;
- every boundary joins samples owned by different plates;
- each inter-plate canonical neighbor edge is represented once in the undirected boundary set;
- boundary normal/shear rates are finite;
- convergent + divergent + transform counts exactly equal total boundary count;
- boundary classification follows the documented relative-motion rule rather than geographic labels;
- WASM/Worker arrays preserve one-to-one sample, plate, and boundary indexing;
- WG-2 source remains independent from legacy Region/Feature/NAV/gameplay contracts;
- no continental/oceanic crust, terrain, or geological-history fields are introduced into the WG-2 model.

The native `tectonics` CLI reports plate-area range, seed spacing, plate speed, boundary-type counts, and deterministic tectonic identity. Multi-seed regression tests are preferred over tuning a single visually attractive world.

## Later physical gates

Later stages add physical/statistical validation for crust distributions, geological-history/boundary relationships, hypsometry, climate zonation, drainage acyclicity, water routing, and sediment conservation.

Earth datasets are validation targets for distributions and morphology, not required generated outputs.
