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

- total dual-cell area closes to `4πR²` within tolerance;
- expected vertex count for each subdivision level;
- exactly twelve degree-five sites;
- all regular sites degree six;
- reciprocal neighbors;
- normalized unit positions;
- no duplicate edges;
- deterministic topology hash;
- tangent-frame forward/inverse round-trip within strict tolerance.

## Later physical gates

Later stages add physical/statistical validation for crust distributions, boundary relationships, hypsometry, climate zonation, drainage acyclicity, water routing, and sediment conservation.

Earth datasets are validation targets for distributions and morphology, not required generated outputs.
