# Map Boundary Behavior Plan

## Goal

Let a match choose how physical projectiles interact with world edges without adding map-specific simulation branches.

## Status

Implemented for local and private online matches. Maps declare supported modes, the selected rule is authoritative, and reconnects, snapshots, rematches, and result summaries preserve it.

## Modes

- `open`: a projectile leaving the supported world bounds is removed. This is the current behavior.
- `reflect`: projectiles bounce from the world perimeter using a map-defined velocity-retention value.
- `wrap`: projectiles crossing a horizontal edge re-enter from the opposite edge with velocity and overshoot preserved.

## Map Contract

Each map declares a default boundary mode and the bounded set of modes it supports. Local setup and private-room configuration may select only a supported mode. Current official maps and new editor drafts support all three modes with `open` as the default; imported v1-v3 documents migrate conservatively to `open` only.

The selected mode belongs to authoritative match configuration and state, not client preferences. It must be included in snapshots, replay checksums, room validation, rematches, and the visible rules summary.

## Implemented Flow

1. The strict map definition and v1-v3 migration establish supported modes, a default, and reflection retention.
2. Local and online match configuration validates the selected mode against the chosen map.
3. Analytical projectile contacts implement `open`, `reflect`, and horizontal `wrap` deterministically.
4. Boundary, reflector, and portal interactions preserve remaining movement under a shared per-tick cap.
5. Local setup, private-room creation, lobby summaries, results, snapshots, reconnects, and rematches preserve the rule.

Map-editor controls for changing a map's supported set and default remain a later authoring improvement. Current drafts retain imported boundary metadata and new drafts receive the shared default policy.

Players do not wrap in the initial scope. Local projectile portals remain map objects and are independent from world-boundary behavior.
