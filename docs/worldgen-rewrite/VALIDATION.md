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
- a fixed five-seed L5/18-plate regression requires at least four worlds to contain both a plate larger than `1.5×` mean area and a plate smaller than `0.65×` mean area, preventing regression toward near-equal tessellation;
- every rigid plate velocity is tangent to the spherical surface (`r·v ≈ 0`);
- plate reference speeds remain finite and within the intended tectonic-scale diagnostic range;
- every boundary joins samples owned by different plates;
- each inter-plate canonical neighbor edge is represented once in the undirected boundary set;
- boundary normal/shear rates are finite;
- convergent + divergent + transform counts exactly equal total boundary count;
- boundary classification follows the documented relative-motion rule rather than geographic labels;
- WASM/Worker arrays preserve one-to-one sample, plate, and boundary indexing;
- WG-2 source remains independent from legacy Region/Feature/NAV/gameplay contracts.

The native `tectonics` CLI reports plate-area range, seed spacing, plate speed, boundary-type counts, and deterministic tectonic identity. Multi-seed regression tests are preferred over tuning a single visually attractive world.

## WG-3 crust and geological-history gates

WG-3 is accepted only if dense crustal state remains physically distinct and causally linked to accepted WG-2 kinematics.

- same seed + accepted topology/tectonics produces identical geology hash and ordered dense fields;
- all crust/history arrays have exactly one value per topology sample, are finite, and remain within documented physical/index bounds;
- continental + transitional + oceanic control areas close to total spherical area;
- continental crust is substantially older, thicker, and less dense/more buoyant than oceanic crust in ensemble statistics;
- oceanic ages remain within the supported young-oceanic range and the youngest oceanic samples preferentially occur near active spreading systems;
- oceanic crust age increases statistically with geodesic distance from spreading systems rather than being independent random texture;
- each WG-2 boundary edge is preserved exactly once by WG-3 geological interpretation;
- transform boundaries remain transform regimes;
- divergent boundaries resolve only to oceanic ridge, continental rift, or transitional divergence;
- convergent boundaries resolve only to oceanic subduction, ocean-continent subduction, or continental collision;
- subduction regimes carry a non-null polarity and preferentially select the lower-buoyancy/oceanic side according to the documented rule;
- trench and volcanic-arc histories appear on opposite sides of polarized subduction systems;
- continental collision and overriding-margin histories raise orogenic influence and can thicken continental/transitional crust;
- continental rifting raises extension history and can thin continental/transitional crust;
- all bounded history fields remain in `[0,1]`;
- plate crust fractions sum to one and are area-weighted rather than sample-count weighted;
- `Major` / `Intermediate` / `Minor` labels are derived from continuous plate area and never replace that physical quantity;
- representative worlds include mixed-crust plates, demonstrating that plate identity is not synonymous with crust type;
- multi-seed validation checks distributions across several planets instead of tuning one showcase seed;
- WASM/Worker sample, boundary, and plate-summary arrays preserve one-to-one indexing;
- WG-3 adds no elevation, bathymetry, terrain, lithology, climate, hydrology, resources, Regions, or gameplay state.

The native `geology` CLI reports crust fractions, continental/oceanic age and thickness separation, derived plate scale-class counts, geological boundary regimes, deterministic tectonic/geology identities, and elapsed generation time.

## Later physical gates

Later stages add validation for hypsometry and isostatic response, lithologic distributions, climate zonation, drainage acyclicity, water routing, erosion/sediment conservation, and glacial/coastal morphology.

Earth datasets are validation targets for distributions and morphology, not required generated outputs.
