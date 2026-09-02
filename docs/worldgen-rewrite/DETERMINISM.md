# Determinism Contract

Planet Engine identity consists of a user-facing generator version plus seed, while each stage owns an isolated deterministic namespace.

Examples:

```text
planet:parameters:v1
tectonics:plate-seeds:v1
tectonics:plate-motion:v1
geology:history:v1
terrain:structure:v1
lithology:v1
climate:v1
hydrology:v1
```

Changing random draw count in a later stage must not rearrange earlier world truth.

WG-0 establishes this contract with a stable FNV-1a namespace hash plus a documented integer coordinate mixer. It deliberately avoids `DefaultHasher` and hash-map iteration order for persistent identity.

## Regression expectations

- same seed + engine/stage version → identical field hash;
- changed seed → materially different field hash;
- changed namespace → independent derived seed;
- persistent indexing must never depend on unordered iteration;
- field hashes include shape and ordered values.

Floating-point determinism requirements will be documented per physical stage as those stages are introduced. The WG-0 synthetic proof uses integer field generation specifically so infrastructure determinism can be tested independently from future numerical-model choices.
