# Canonical Planetary Topology

WG-1 will implement the production topology selected by the rewrite blueprint: a hierarchical icosahedral geodesic sphere.

## Construction

- begin with a canonical regular icosahedron;
- subdivide each triangular face into four;
- normalize inserted vertices onto the unit sphere;
- treat mesh vertices as physical sample sites;
- use the vertex-neighbor graph for physical processes;
- use the dual Voronoi/Goldberg cell around each vertex as its surface-area domain.

Almost all sites have six neighbors. Exactly twelve have five neighbors, as required on a closed spherical topology.

## Algorithm boundary

Physical algorithms consume a narrow topology contract conceptually providing:

```text
sample_count
unit_position(sample)
physical_area(sample)
neighbors(sample)
edge_distance(sample, neighbor)
local_tangent_basis(sample)
```

Production storage can remain specialized and dense. Topology independence is an algorithm boundary, not a requirement for heap-polymorphic world cells.

## Why the legacy equirectangular grid is not canonical

The current 4096 × 2048 coordinate space remains useful as a map projection and compatibility space, but it is not the new physical topology. The geodesic sphere removes polar singular rows and an artificial physical longitude seam while improving area uniformity and directional isotropy.

## Deep zoom and engineering coordinates

A spherical world remains compatible with meter-scale placement. A global surface anchor is represented by a high-precision unit direction and altitude. Local facilities use an east/north/up tangent frame in meters. The existing floating-origin principle therefore extends naturally from planetary to engineering scale.
