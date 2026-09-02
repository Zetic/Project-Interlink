# Resolution Strategy

The Planet Engine has no universal `surfaceResolution`. Resolution belongs to a physical process.

For icosahedral subdivision level `L`, the sample count is approximately:

```text
N = 10 × 4^L + 2
```

Representative Earth-area scales from the rewrite blueprint:

| Level | Samples | Average area/sample | Characteristic spacing |
|---:|---:|---:|---:|
| 5 | 10,242 | ~49,800 km² | ~223 km |
| 6 | 40,962 | ~12,450 km² | ~112 km |
| 7 | 163,842 | ~3,113 km² | ~56 km |
| 8 | 655,362 | ~778 km² | ~28 km |
| 9 | 2,621,442 | ~195 km² | ~14 km |
| 10 | 10,485,762 | ~49 km² | ~7 km |

These are profiling candidates, not fixed stage assignments.

A likely early investigation is:

```text
plates / macro crust        L5–L6
geological history          L6–L7
initial terrain             L7
climate                     L7–L8
hydrology / global erosion  L8 initially
local refinement            separate chunked system later
```

Fine detail must refine coarse physical truth rather than independently regenerate it. Meter-scale detail is never materialized globally.
