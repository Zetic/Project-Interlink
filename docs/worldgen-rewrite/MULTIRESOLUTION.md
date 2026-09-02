# WG-3.75 Multiresolution Physical Inheritance

WG-3.75 makes resolution changes an explicit deterministic operation instead of rerunning accepted physics at a finer level.

```text
coarse WG-2/WG-3/WG-3.5 truth
        ↓
WG-1 stable sample ancestry
        ↓
WG-3.75 refinement operators
        ↓
finer physical substrate for WG-4
```

## Contracts

- Existing sample IDs are preserved exactly.
- Continuous scalar/vector fields use hierarchical midpoint interpolation.
- Categorical fields use a deterministic geodesic nearest-coarse-source map on the fine graph.
- Domain-sensitive continuous fields use constrained interpolation so a midpoint does not average values across a categorical discontinuity.
- The provenance map has its own deterministic hash.
- The inherited physical state identity combines the refinement stage version, provenance hash, physical-parameter hash, and accepted WG-2/WG-3/WG-3.5 hashes.

The high-level `inherit_physical_state` bundle carries plate ownership, crust properties/history, lithospheric mechanics, structural state, and refined kinematic domains onto a finer topology. It does not add new geology or terrain. Fine-scale physics may later add detail, but inherited coarse samples remain exact.

## Operator choice

Crust properties are constrained by crust province. Mechanical strength/weakness/elastic thickness and fragmentation-related fields are constrained by WG-3.5 kinematic domain. Broad geological influence and mantle-support fields are interpolated continuously because those physical influences are allowed to cross present-day domain boundaries.

## Non-goals

WG-3.75 does not calculate elevation, bathymetry, sea level, hydrology, erosion, climate, lithology, resources, or gameplay geography.
