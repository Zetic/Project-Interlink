# Project Interlink — Patch Notes

This file records the development history of Project Interlink on a **commit-by-commit basis**.

Unlike a release changelog, planning commits, merge commits, documentation changes, and repository housekeeping are included so the full project history remains readable without inspecting Git diffs.

Entries are listed newest first.

## Entry Types

- **Feature** — adds new behavior or capabilities
- **Simulation** — changes procedural or physical simulation behavior
- **Architecture** — changes internal system structure or state ownership
- **Fix** — corrects a bug, inconsistency, or security issue
- **Documentation** — changes project guidance or documentation
- **Planning** — Copilot planning commit with no source-code change
- **Merge** — integrates a pull request; normally adds no behavior beyond its contained commits
- **Housekeeping** — repository administration with no simulation/gameplay effect

---

# 2026-08-18 — Testing Phase Preparation

## `5ac93fe` — Remove temporary issue template placeholder

**Type:** Housekeeping

### Changed
- Removed a temporary `.github/ISSUE_TEMPLATE/.keep` placeholder.

### Impact
No simulation, UI, or gameplay changes. This reversed the immediately preceding placeholder-directory setup and left no lasting product change.

---

## `1a54cb2` — Initialize issue template directory

**Type:** Housekeeping

### Changed
- Temporarily added a placeholder file under `.github/ISSUE_TEMPLATE/` while preparing GitHub issue infrastructure.

### Impact
No simulation, UI, or gameplay changes. The placeholder was removed in the following commit.

---

## `e390a43` — Remove temporary issue template placeholder

**Type:** Housekeeping

### Changed
- Removed a temporary `.github/ISSUE_TEMPLATE/.keep` placeholder.

### Impact
No simulation, UI, or gameplay changes. This reverted the immediately preceding temporary directory placeholder.

---

## `7992493` — Initialize issue template directory

**Type:** Housekeeping

### Changed
- Temporarily added an issue-template directory placeholder.

### Impact
No simulation, UI, or gameplay changes. The placeholder was removed in the next commit.

---

## `785d111` — Update README for post-foundation project state

**Type:** Documentation

### Changed
- Updated the README to describe the planet generator as the first real Interlink simulation subsystem rather than a disposable tech demo.
- Documented the completed World State / Player Knowledge / UI State architecture.
- Documented deterministic namespaced RNG and versioned generated worlds as established foundations.
- Shifted the near-term roadmap toward automated simulation regression testing before deeper geology.
- Documented current prototype weaknesses in regional, feature, and resource generation.

### Why it matters
The public project description now matches the code after the foundation refactor and makes the next development priority explicit.

### Player-visible impact
None.

---

## `b3cd295` — Update Copilot guidance for post-foundation testing phase

**Type:** Documentation / Development Guidance

### Changed
- Updated `.github/copilot-instructions.md` to treat the architecture promotion as complete.
- Added automated simulation contracts and regression tests as the immediate development priority.
- Defined determinism, World State integrity, Knowledge State isolation, numeric invariants, and domain compatibility as contracts future changes should preserve.
- Added guidance for broad deterministic multi-seed testing.
- Added guidance for a lightweight GitHub Actions test check.
- Explicitly warned against redoing the established architecture without a concrete need.

### Why it matters
Copilot is now instructed to protect the simulation foundation before making larger geological or gameplay changes.

### Player-visible impact
None.

---

# 2026-08-18 — Interlink Core Architecture

## `159b89e` — Merge PR #5: Promote planet generator into Interlink core simulation architecture

**Type:** Merge

### Changed
- Merged PR #5 into `main`.
- Integrated the World State, Player Knowledge, UI-state separation, version metadata, stable references, resource occurrences, and namespaced RNG work from `7c68009`.

### Impact
No additional behavior beyond the commits contained in PR #5.

---

## `7c68009` — Promote planet generator into Interlink core simulation architecture

**Type:** Architecture

### Added
- `src/core/world/versions.js` with initial `SCHEMA_VERSION = 1` and `GENERATOR_VERSION = 1`.
- `src/core/world/worldState.js` with `createWorld()` and `validateWorld()`.
- `src/core/world/knowledgeState.js` with player discovery state and validation.
- Deterministic `rngFor(rootSeed, namespace)` substreams.
- Stable feature resource-occurrence IDs.
- Explicit feature-to-region back-references.

### Changed
- Replaced the planet object as the application's root simulation container with a serializable World State.
- Flattened permanent world entities into ID-indexed maps for planets, regions, features, and feature resource occurrences.
- Removed `discovered` from physical feature objects.
- Moved feature discovery into Player Knowledge State.
- Separated presentation-only UI state from simulation truth.
- Changed `feature.resources` to `feature.resourceOccurrences`.
- Updated the UI to resolve regions, features, and resource occurrences through World State IDs.
- Updated generation to use independent namespaced RNG streams for major domains.
- Displayed schema/generator version information in the planet summary.
- Strengthened validation around references and state-layer boundaries.

### Why it matters
This is the commit that promoted the original planet-generation tech demo into a durable Interlink simulation foundation.

The project now follows the core separation:

```text
World / Simulation State
        ↓
Player Knowledge State
        ↓
Application / UI State
```

Discovering something reveals existing physical state rather than mutating the world itself.

### Player-visible impact
- Existing Generate Planet and Discover Feature behavior remains recognizable.
- Schema and generator versions are now visible in the planet summary.

### Developer impact
This established the state architecture intended to support future surveying, extraction, material processing, automation, and persistent simulation systems.

---

## `f7965f3` — Initial plan

**Type:** Planning

### Changed
- Added Copilot's implementation plan for the Interlink core architecture refactor.

### Impact
No source-code changes.

---

## `9f01d31` — Remove temporary foundation issue draft

**Type:** Housekeeping

### Changed
- Removed a temporary repository file used while drafting the foundation issue.

### Impact
No simulation or gameplay changes. The draft had already served its temporary purpose.

---

## `def7870` — Add foundation issue draft

**Type:** Housekeeping / Documentation

### Changed
- Temporarily added a foundation issue draft file to the repository.

### Impact
No simulation or gameplay changes. The temporary file was removed shortly afterward.

---

## `3d3224c` — Remove unnecessary placeholder file

**Type:** Housekeeping

### Changed
- Removed a temporary placeholder file created while preparing the GitHub issue-template directory.

### Impact
No simulation or gameplay changes.

---

## `57cedd8` — Prepare GitHub issue template directory

**Type:** Housekeeping

### Changed
- Added a temporary placeholder so the GitHub issue-template directory existed in the repository.

### Impact
No simulation or gameplay changes. The placeholder was removed in the following commit.

---

## `0f74ae5` — Update README for current Interlink project state

**Type:** Documentation

### Changed
- Replaced the original two-line repository description with a full description of Project Interlink.
- Documented the planet generator as the current working subsystem.
- Documented the causal planet-generation pipeline.
- Added the long-term systems-driven game direction.
- Added resource/feedstock philosophy.
- Added the intended World State / Player Knowledge / UI State architecture as upcoming foundation work.
- Added the near-term roadmap and local web-app run instructions.

### Why it matters
The README began describing the broader Interlink game rather than only the standalone planet-generation prototype.

### Player-visible impact
None.

---

## `c7eab8f` — Update Copilot instructions with Interlink foundation architecture

**Type:** Documentation / Development Guidance

### Changed
- Expanded repository-level Copilot guidance around the intended permanent Interlink architecture.
- Defined separate World State, Player Knowledge State, and UI State responsibilities.
- Added guidance for a root serializable world object.
- Added definition-versus-occurrence modeling guidance.
- Added stable namespaced deterministic RNG guidance.
- Added schema/generator versioning guidance.
- Reinforced dependency direction from data definitions through simulation and into UI.
- Clarified that the existing tech-demo code should be promoted rather than discarded.

### Why it matters
This commit set the architectural rails later implemented by PR #5.

### Player-visible impact
None.

---

# 2026-08-18 — Causal Planet Generation

## `9c6d6fa` — Merge PR #3: Refactor planet generation into causal passes

**Type:** Merge

### Changed
- Merged PR #3 into `main`.
- Integrated the causal planet-generation work from `19c5f29`, `da17e65`, and `7687489`.

### Impact
No additional behavior beyond the commits contained in PR #3.

---

## `7687489` — Finalize causal planet pass generation details

**Type:** Simulation / Fix

### Changed
- Reworked interior-fraction correction so core, deep interior, and envelope fractions remain coherent and sum correctly after minimum-envelope enforcement.
- Adjusted derived planet classification thresholds.
- Made `Iron-Rich` classification possible from sufficiently high generated iron content rather than requiring an airless planet.
- Broadened the generated `Silicate-Rich` classification threshold.
- Restored deterministic `default-seed` behavior when `generatePlanet()` is called without a seed.
- Removed an unnecessary temporary `planetType: null` assignment before derived classification.

### Why it matters
This stabilized the first causal planet generator and corrected edge cases introduced during the larger refactor.

### Player-visible impact
Planet classifications and generated interior fractions became more consistent.

---

## `da17e65` — Polish causal classification and validation handling

**Type:** Simulation / Fix

### Changed
- Pulled the simplified planetary cooling horizon into a named constant.
- Improved atmosphere-safe planet classification using a pressure fallback.
- Simplified volcanic classification to follow generated geological activity directly.
- Changed temporary unseeded generation handling during development.
- Removed the placeholder assumption that a newly constructed planet begins classified as `Rocky`; classification instead occurs after physical generation.

### Why it matters
This tightened the relationship between generated physical state and the human-readable classification assigned afterward.

### Player-visible impact
Generated planet labels better reflected their simulated properties.

---

## `19c5f29` — Refactor planet generation into causal passes

**Type:** Simulation / Architecture

### Changed
- Removed the original predefined `PLANET_TYPES` composition/archetype table as the primary source of planet properties.
- Rebuilt generation as causal passes for base state, bulk matter, thermal environment, interior structure, physical dimensions, atmosphere, internal activity, exterior state, and final classification.
- Added generated planetary age and used it in retained internal-heat calculations.
- Made close-orbit planets capable of very slow rotation as a simplified tidal-effect approximation.
- Made orbital distance influence bulk composition and volatile availability.
- Added albedo/eccentricity influence to equilibrium temperature.
- Made interior structure respond to composition, mass, and thermal conditions.
- Made radius depend on generated composition and structural fractions.
- Derived gravity, escape velocity, and density from mass and radius.
- Added atmospheric-retention logic based on volatile supply, gravity/escape velocity, and temperature.
- Allowed planets to be effectively airless.
- Made atmospheric composition respond to thermal conditions.
- Linked age, mass, and core structure to internal heat and geological activity.
- Linked magnetic state to core structure, internal heat, and rotation.
- Made surface state and biosphere eligibility depend on generated environmental conditions.
- Converted planet type into a **post-generation classification** rather than an input archetype.
- Updated UI atmosphere rendering to support airless planets.

### Why it matters
This was the first major shift from a randomized planet-description generator toward Interlink's causal simulation philosophy:

```text
Generate causes
    ↓
Derive consequences
    ↓
Classify the resulting world
```

### Player-visible impact
Planets began producing more internally related combinations of composition, atmosphere, temperature, geology, surface state, and classification.

---

## `3cd71b6` — Initial plan

**Type:** Planning

### Changed
- Added Copilot's implementation plan for the causal planet-generation refactor.

### Impact
No source-code changes.

---

# 2026-08-18 — Interlink Design Direction

## `e114b9b` — Add Copilot instructions for Interlink design direction

**Type:** Documentation / Development Guidance

### Added
- Created `.github/copilot-instructions.md` as repository-level guidance for GitHub Copilot.

### Defined
- Interlink's systems-first design philosophy.
- The principle: **Everything is a system, and every system can become a component of a larger system.**
- The planet generator as the first subsystem to build outward from.
- Causal procedural generation guidance.
- World truth versus discovery-state concepts.
- Regions and features as separate natural-resource sources.
- Raw resources as natural feedstocks rather than arbitrary tokens.
- Composition-preserving material philosophy.
- Long-term nested apparatus/process/facility/network design.
- Capability-based progression philosophy.
- The web application as the current implementation platform.

### Why it matters
This commit first gave coding agents the broader Interlink game-design context that was not present in the original tech-demo source.

### Player-visible impact
None.

---

# 2026-08-17 — Planet Generator Tech Demo

## `4a2a862` — Merge PR #1: Add planet generator tech demo

**Type:** Merge

### Changed
- Merged the first working planet-generator pull request into `main`.
- Integrated the initial generator and XSS fix from `0885454` and `735d972`.

### Impact
No additional behavior beyond the commits contained in PR #1.

---

## `735d972` — Fix HTML escaping for quotes

**Type:** Fix / Security

### Fixed
- Extended `escHtml()` to escape double quotes as `&quot;`.
- Extended `escHtml()` to escape single quotes as `&#39;`.

### Why it matters
Generated/displayed strings were already escaping `&`, `<`, and `>`. This completed basic HTML escaping for quote characters and reduced injection risk in dynamically rendered markup.

### Player-visible impact
No intended visual change.

---

## `0885454` — Add planet-generator tech demo

**Type:** Feature

### Added
- First working standalone Planet Generator web application.
- Static `index.html` interface with seed input, Generate Planet, region display, and Discover Feature controls.
- Utilitarian dark-theme stylesheet.
- Seeded Mulberry32 pseudo-random number generator.
- Raw natural-resource definition catalog.
- Planet generation module.
- Region generation module producing roughly 4–8 regions with constrained local variation.
- Feature generation with context-weighted feature types.
- Regional and feature resource generation.
- Generated ore/fluid descriptors and composition metadata for selected feedstocks.
- Initial generation validation.
- Hidden-feature discovery flow.
- Browser-console output of the generated planet for debugging.

### Architecture
- Kept generation logic in JavaScript modules separate from DOM rendering.
- Made the generator return plain JavaScript data suitable for later reuse outside the UI.
- Established deterministic seeded generation as a core property from the beginning.

### Initial simulation hierarchy

```text
Planet
  ↓
Regions
  ↓
Background Resources + Hidden Features
  ↓
Feature Resource Occurrences
```

### Why it matters
This commit created the first executable vertical slice from which Project Interlink later evolved.

### Player-visible impact
For the first time a user could enter a seed, generate a planet, inspect its regions/resources, and reveal pre-generated hidden features.

---

## `8a21b98` — Initial plan

**Type:** Planning

### Changed
- Added Copilot's initial implementation plan for the standalone planet-generation tech demo.

### Impact
No source-code changes.

---

## `53811da` — Initial commit

**Type:** Documentation

### Added
- Created the Project Interlink repository README.
- Described the initial repository as a procedural planet-generation sandbox for planets, regions, geological features, and natural-resource distributions.

### Why it matters
This established the repository and its original planet-generation scope.

### Player-visible impact
None; no application code existed yet.

---

# Development Arc So Far

The commit history currently shows five major stages:

```text
Repository created
        ↓
Standalone Planet Generator tech demo
        ↓
Interlink systems-design guidance established
        ↓
Planet generation refactored into causal simulation passes
        ↓
Tech demo promoted into versioned World / Knowledge / UI architecture
        ↓
Automated simulation-contract and regression-testing phase
```

The next planned implementation work is tracked in GitHub Issue #6: **Add simulation regression tests and generation invariants**.

---

# Patch Note Maintenance

When adding future entries:

1. Add the newest commit at the top of the appropriate development section or create a new section when the project enters a new phase.
2. Record what actually changed in the commit rather than simply repeating the commit message.
3. Separate player-visible effects from developer/architecture effects when useful.
4. Mark planning and merge-only commits clearly.
5. Record temporary/housekeeping commits honestly, even when they have no lasting gameplay effect.
6. Do not describe planned issue work as completed until it is actually merged.
