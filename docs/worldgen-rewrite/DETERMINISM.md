# Determinism Contract

Planet Engine identity consists of a user-facing generator version plus seed, while each stage owns an isolated deterministic namespace.

Current and planned examples:

```text
worldgen:foundation:synthetic:v1
worldgen:tectonics:plates:v1
geology:history:v1
terrain:structure:v1
lithology:v1
climate:v1
hydrology:v1
```

Changing random draw count in a later stage must not rearrange earlier world truth.

WG-0 establishes this contract with a stable FNV-1a namespace hash plus a documented integer mixer. It deliberately avoids `DefaultHasher` and hash-map iteration order for persistent identity.

WG-2 uses one isolated tectonic stage namespace, `worldgen:tectonics:plates:v1`, for deterministic plate seed placement and rigid Euler-pole kinematics. Its ordered tectonic hash covers the derived stage seed, plate seed samples, angular-velocity vectors, per-sample plate ownership, and boundary kinematics. Downstream crust/geology changes therefore cannot silently alter accepted WG-2 plate truth.

## Regression expectations

- same seed + engine/stage version → identical field or stage hash;
- changed seed → materially different identity;
- changed namespace → independent derived seed;
- persistent indexing must never depend on unordered iteration;
- field hashes include shape and ordered values;
- tectonic hashes include ordered ownership and boundary state;
- deterministic stochastic sampling must be derived from stable integer streams, not runtime RNG state.

Floating-point determinism requirements are documented per physical stage as those stages are introduced. WG-0's synthetic proof uses integer field generation specifically so infrastructure determinism can be tested independently from numerical-model choices; WG-1 topology and WG-2 kinematics additionally regression-test their deterministic floating-point output identities on the supported toolchain.
