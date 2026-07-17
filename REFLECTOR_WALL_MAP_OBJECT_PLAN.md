# Reflector Wall Map Object Plan

## Status

Implemented.

Current baseline:

- Fifteen-weapon arsenal complete.
- Twelve official maps complete.
- Adaptive high-density rendering complete.
- Map format: `4`.
- Protocol: `private-room-12`.
- Snapshot: `9`.
- Map registry: `maps-9`.
- Weapon registry: `weapons-4`.
- Client build: `1.10.2`.
- Last full Vitest result: 22 files and 159 tests passed.
- Production web/server build passes with only the existing large web chunk warning.

## Goal

Ship a reusable Reflector Wall object system, expose it in the local map editor, and prove it on Ruined Foundry as the first official online-compatible pilot map.

The implementation must remain deterministic, server-authoritative, data-driven, and generic. Do not add map-ID branches or executable map scripts.

## Object Contract

Introduce map format v2 with a bounded discriminated object union. The first definition is:

```ts
type ReflectorWallDefinition = {
  id: string
  type: 'reflector-wall'
  start: Vector
  end: Vector
  thickness: number
  velocityRetention: number
}
```

Rules:

- IDs are author-stable, unique, bounded slugs.
- Endpoints use world coordinates and editor placement snaps to the terrain grid.
- Start with a maximum of 32 objects per map.
- Length, thickness, and velocity retention are finite and bounded.
- Objects remain inside world bounds and outside spawn safety volumes.
- Existing v1 maps and persisted editor drafts migrate to v2 with `objects: []`.
- Resolved objects are canonically sorted by ID.
- Unknown object kinds and unsupported fields are rejected.
- Objects contain JSON-compatible data only: no scripts, callbacks, URLs, or arbitrary executable behavior.

## Phase 1: Harden Map Identity

- Add a deterministic map-content hash covering dimensions, mode, metadata that affects compatibility, theme, spawns, terrain, and objects.
- Store the content hash in match state, snapshots, and internal replay metadata.
- Reject snapshot restoration when the installed map content differs.
- Update snapshot serialization validation.
- Bump snapshot compatibility because match state changes.

Primary files:

- `src/maps/mapDocument.ts`
- `src/maps/registry.ts`
- `src/simulation/match/MatchState.ts`
- `src/simulation/match/MatchSimulation.ts`
- `src/simulation/serialization/matchSerialization.ts`
- `src/simulation/replay/replay.ts`
- `src/network/protocol.ts`

## Phase 2: Add Typed Map Documents

- Extend `MapDocument` and `ResolvedMap` with typed objects.
- Add an explicit v1-to-v2 document migration.
- Update all official map constructors and helpers.
- Update the external PNG compiler metadata and output.
- Update `custom-draft`, browser import/export, and editor draft persistence.
- Validate IDs, geometry, count budgets, ordering, spawn clearance, unknown fields, and total complexity.
- Ensure canonical object ordering survives import, export, registry resolution, and test play.

Primary files:

- `src/maps/mapDocument.ts`
- `src/maps/registry.ts`
- `scripts/compile-map.ts`
- `maps-src/map.metadata.example.json`
- `maps-src/README.md`
- `src/app/MapEditor.tsx`
- `src/app/editorStorage.ts`

## Phase 3: Generic Projectile Contacts

- Replace the terminal-only projectile collision result with a discriminated contact result.
- Support boundary, player, terrain, and reflector contacts.
- Detect swept projectile-circle contact against reflector line capsules.
- Resolve collisions deterministically by:
  1. time of impact;
  2. contact priority;
  3. object ID.
- Reflect velocity around the authored surface normal.
- Apply `velocityRetention` after reflection.
- Reposition the projectile outside the reflector to avoid immediate repeated contact.
- Bound interactions per tick so future reflectors and portals cannot form infinite loops.
- Apply reflectors to every physical projectile, including grenades, drills, beacon bombs, Fork Rocket children, Old Shoe, and Cryo Shot.
- Keep Scatter Shot, Pocket Knife, Teleporter, players, and mines unaffected in this first slice.
- Keep all behavior generic; no official map ID checks belong in simulation code.

Primary files:

- `src/simulation/match/MatchSimulation.ts`
- `src/simulation/match/MatchState.ts` if projectile-local interaction bookkeeping is required
- A focused geometry/contact module under `src/simulation/`

## Phase 4: Authoritative Events and Compatibility

- Add a `projectile-reflected` event containing object ID, projectile ID, position, incoming velocity, and outgoing velocity.
- Drive all sparks, audio, and camera feedback from this authoritative event.
- Keep reflector definitions immutable, so no persistent runtime object Schema should be introduced unless implementation proves it necessary.
- Bump map registry, protocol, and client build versions.
- Bump individual official map revisions whenever object layouts change.
- Keep weapon registry unchanged unless weapon data changes.

Primary files:

- `src/simulation/match/MatchEvent.ts`
- `src/network/protocol.ts`
- `server/rooms/PrivateMatchRoom.ts`
- `src/network/OnlineMatchSource.ts`
- `src/maps/registry.ts`

## Phase 5: Editor Support

- Add Reflector Wall to the object palette.
- Place walls by dragging between two endpoints.
- Add object hit testing, selection, endpoint handles, movement, deletion, and an inspector.
- Expose stable ID, length, thickness, velocity retention, and validation status.
- Include object actions and property commits in undo/redo.
- Render invalid objects in red and show an object-specific validation message.
- Preserve deterministic ordering during export.
- Migrate persisted editor draft version 1 to version 2.
- Fix editor test-play round trips so the current draft automatically survives leaving and returning without requiring a manual save.
- Keep the inspector usable in the existing desktop, tablet, and narrow mobile layouts.

Primary files:

- `src/app/MapEditor.tsx`
- `src/app/editorStorage.ts`
- `src/app/App.tsx`
- `src/app/styles.css`

## Phase 6: Pilot Official Map

Use Ruined Foundry as the first official reflector map.

- Add two symmetric angled reflector plates around the central combat lane.
- Match the steel industrial visual language.
- Do not obstruct player movement or spawn safety.
- Preserve team fairness through symmetric placement.
- Update the Ruined Foundry map revision.
- Add reflector symbols to map previews and a concise mechanic legend.
- Keep all behavior driven by the generic object definitions.

Primary files:

- `src/maps/registry.ts`
- `src/app/App.tsx`
- `src/app/styles.css`

## Phase 7: Presentation

- Add a dedicated static map-object graphics layer between terrain and actors.
- Cache static object drawing by match ID, map ID, and map revision.
- Draw reflectors as heavy steel rails with directional hatching or arrows so they do not rely on color alone.
- Add bounded contact sparks and a distinct metallic reflection sound.
- Restore static reflector visuals from the installed map after reconnect without replaying old effects.
- Ensure reduced-motion preferences suppress unsafe transient movement while preserving readable contact feedback.

Primary files:

- `src/game/scenes/MatchScene.ts`
- `src/audio/AudioDirector.ts`
- `src/game/presentation.ts`

## Collision Semantics

- Reflectors affect physical projectiles only.
- A reflector contact is non-terminal: the projectile continues with reflected velocity.
- A projectile should not lose ammunition or create a second action when reflected.
- Reflection does not damage or mutate the reflector.
- Terrain behind a reflector remains independently collidable.
- If two contacts occur at the same sampled time, use the documented contact priority and stable object ID.
- Reflection behavior must be identical in local play, private online play, snapshots, reconnects, and replay checksums.
- Initial implementation may defer the unused remainder of a fixed substep after reflection if that rule is deterministic and tested. If remaining-substep processing is implemented, cap interactions per tick.

## Verification

Add focused coverage for:

- v1 document and persisted draft migration.
- v2 canonical serialization and deterministic object ordering.
- Duplicate IDs, unknown kinds, unsupported fields, malformed geometry, invalid bounds, spawn overlap, and object-count limits.
- Horizontal, vertical, and angled reflection.
- Surface normals and retained velocity.
- High-speed swept collision without tunnelling.
- Stable tie ordering for overlapping contacts.
- Every physical projectile kind.
- No effect on Scatter Shot, Pocket Knife, Teleporter, players, and mines.
- Map-content hash mismatch rejection.
- Snapshot restoration and replay checksum determinism.
- Local editor placement, selection, editing, undo/redo, import/export, and test-play return retention.
- Private online behavior, event deduplication, and reconnect reconstruction.
- Existing maps remain behaviorally unchanged when `objects` is empty.
- Ruined Foundry remains spawn-safe and symmetric.

Run after implementation:

```sh
pnpm test:simulation
pnpm test:server
pnpm test
pnpm build
```

Run browser editor/private-room coverage only if the implementation adds or updates those tests and the environment supports them.

## Acceptance Criteria

- Reflector walls are authored as validated data, not map-specific code.
- Existing v1 maps and editor drafts migrate without data loss.
- The editor can place, select, configure, delete, undo, export, import, and test reflector walls.
- All physical projectiles reflect deterministically.
- Local and online outcomes match.
- Reconnect and snapshot restoration preserve the same map behavior.
- Ruined Foundry demonstrates the mechanic without compromising movement or spawn safety.
- Full tests and production build pass.
- Documentation and compatibility identifiers match the shipped implementation.

## Deferred

- One-way projectile barriers.
- Paired portals.
- Horizontal projectile wraparound.
- Low-friction and high-bounce terrain.
- Switches, destructible props, and environmental hazards.
- Moving platforms and player-carrying geometry.
- Online custom-map transfer, sharing, publishing, discovery, and moderation.

The expected next mechanic after reflectors is a one-way projectile barrier because it can reuse the same contact engine with a direction check. Portals should follow after deterministic remaining-substep and anti-loop behavior is proven.
