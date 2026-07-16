# Map Foundation v1

**Status:** Implemented. Online 2v2 has been playtested, and the first local custom-map editor milestone is implemented pending user playtesting.

## Goal

Replace procedural height-only maps with a deterministic, data-driven foundation that supports buildings, multiple walkable levels, overhangs, caves, destructible and indestructible materials, explicit team spawns, and later user-authored maps.

## Active Sequence

1. Complete Map Foundation v1.
2. Prove it with local 1v1 and 2v2 play on Ruined Foundry.
3. Resume online 2v2 with four-seat rooms, team lobby flow, reconnect/forfeit policy, and rematch quorum. Implemented and playtested.
4. Build the local custom-map editor against the proven map document after the online 2v2 playtest. Implemented; pending editor playtesting.
5. Add 3v3 after online 2v2 and six-player maps are ready.

Online admission and transfer of custom maps remain deliberately deferred. Editor drafts are local-only and test through the existing local authoritative simulation.

## Runtime Contract

Foundation v1 uses a versioned `MapDocument` that contains:

* immutable map identity and revision;
* supported match mode and world dimensions;
* a fixed-size material grid encoded with row run-length encoding;
* explicit `x`/`y` team spawns and facing;
* a bounded visual theme;
* no executable scripts or map-specific simulation callbacks.

The runtime resolves documents into typed material cells before constructing `MatchSimulation`. Official and future custom maps use the same resolved representation.

## Initial Materials

* Empty: no collision.
* Soil: solid and destructible.
* Brick: solid and destructible.
* Stone: solid and indestructible.
* Steel: solid and indestructible.

## Authoring Workflow

Official map collision masks may be painted in Aseprite, Krita, GIMP, or another image editor using an exact color palette. A build-time compiler converts the source image and metadata into the canonical map document used by browser and server.

The local editor paints the same materials, places validated team spawns, previews bounded theme colors, tests through the authoritative simulation, and imports or exports the same document format. Browser drafts stay on the current device. Arbitrary scripts, remote assets, and map-defined code remain prohibited.

## Foundation v1 Completion

* `MapDocument` and `ResolvedMap` are shared by local and server simulation.
* Terrain uses material IDs rather than binary occupancy.
* Explosions preserve indestructible materials.
* Character support queries work on local floors instead of only the uppermost surface.
* Spawns include explicit vertical placement and validation.
* Rendering distinguishes materials and redraws after terrain mutations.
* Ruined Foundry demonstrates buildings, internal floors, roofs, steel supports, and destructible routes.
* Existing 1v1 and local 2v2 maps remain playable through the new resolver.
* The local editor provides brush, line, rectangle, fill, spawn, history, validation, browser draft storage, import/export, and test-play controls.

## Deferred Work

* Moving platforms and dynamic hazards.
* Portals, reflectors, and one-way projectile barriers.
* Persistent uploads, ownership, discovery, and moderation.
* Online custom-map admission and transfer.
