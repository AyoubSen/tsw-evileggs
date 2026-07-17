# Map Boundary Behavior Plan

## Goal

Let a match choose how physical projectiles interact with world edges without adding map-specific simulation branches.

## Modes

- `open`: a projectile leaving the supported world bounds is removed. This is the current behavior.
- `reflect`: projectiles bounce from the world perimeter using a map-defined velocity-retention value.
- `wrap`: projectiles crossing a horizontal edge re-enter from the opposite edge with velocity and overshoot preserved.

## Map Contract

Each map will declare a default boundary mode and the bounded set of modes it supports. Local setup and private-room configuration may select only a supported mode. Existing maps migrate to `open` only until their layouts and presentation are reviewed for reflection or wrapping.

The selected mode belongs to authoritative match configuration and state, not client preferences. It must be included in snapshots, replay checksums, room validation, rematches, and the visible rules summary.

## Implementation Order

1. Add the strict boundary definition to the map document and migrate existing maps to `open`.
2. Add the selected mode to local and online match configuration with server-side validation against the chosen map.
3. Generalize projectile boundary contacts so `open`, `reflect`, and `wrap` share deterministic time-of-impact ordering.
4. Preserve remaining substep movement after reflection or wrapping and cap boundary/object interactions per tick.
5. Add map-editor controls for supported modes and defaults.
6. Add setup/lobby selection, map preview labels, in-match rule communication, and reconnect restoration.
7. Pilot `reflect` and `wrap` on maps designed for readable edge trajectories before enabling them elsewhere.

Players do not wrap in the initial scope. Local projectile portals remain map objects and are independent from world-boundary behavior.
