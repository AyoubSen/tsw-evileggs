# Mossfire Skirmish

An original browser artillery game with local hot-seat and private online 1v1 play. It takes broad inspiration from the readable, turn-based projectile play found in classic artillery games, but is not a remake or clone of any existing game. The characters, maps, UI, naming, and code are original placeholder work.

Mossfire Skirmish is an original turn-based artillery game with destructible terrain, timed turns, movement, pull-back aiming, five weapons, and selectable maps.

See the canonical [product roadmap](ROADMAP.md) for verified status, priorities, and major feature dependencies.

## Run locally

Prerequisites: Node.js 22+ and pnpm 10+.

```sh
pnpm install
pnpm dev
```

`pnpm dev` runs Vite and the Colyseus server together. Use `pnpm dev:web` or `pnpm dev:server` to run one side. Copy `.env.example` to `.env` when the defaults are not suitable. `VITE_COLYSEUS_URL` selects the browser endpoint, `PORT` selects the server port, and `ALLOWED_WEB_ORIGINS` is the comma-separated HTTP/WebSocket origin allowlist. Production startup fails when that allowlist is missing.

Other useful commands:

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm test:server
pnpm test:browser
pnpm build
pnpm format:check
```

## Controls

- `Q` or `A`: move the active character left.
- `D`: move the active character right.
- `Z` or `W`: make one modest tactical jump. Release the key before jumping again.
- Primary mouse drag: pull backward from the firing direction and choose power from pull distance. Releasing locks the aim; it does not fire.
- `1`–`5`: select Basic Rocket, Timed Grenade, Scatter Shot, Cluster Charge, or Teleporter.
- `Space`: activate the selected weapon on the active player's turn.
- `R`: open the pause menu during a legal input turn.

Use the main menu to start a local match or create/join a private online room. Escape pauses local play; online it opens only the local menu and never pauses the server.

## Maps

- **Rolling Hills**: broad, forgiving slopes with open long-range firing lanes.
- **Twin Peaks**: elevated side spawns and a central valley for high arcs.
- **Broken Crossing**: a fractured low crossing that rewards careful movement.
- **Crater Basin**: uneven outer ridges surrounding a close central bowl.

The movement aliases use physical browser keyboard codes, so both AZERTY and QWERTY layouts work without configuration. Ballistic weapons use world-space pull-back aiming. Teleporter instead points at a safe map destination. Each input turn lasts 30 seconds. Ammunition is per player: Rocket is unlimited; Grenade and Scatter have 3 uses; Cluster and Teleporter have 2.

## Arsenal

- **Basic Rocket**: variable-power ballistic explosion; unlimited ammunition.
- **Timed Grenade**: variable-power bouncing projectile with a 3-second fuse; 3 uses.
- **Scatter Shot**: deterministic seven-pellet short-range burst; 3 uses.
- **Cluster Charge**: variable-power parent charge that releases five child explosives; 2 uses.
- **Teleporter**: moves the player to a valid supported target without damage; 2 uses.

Successful activation consumes ammunition once and locks input until the action and world settling finish. A simultaneous elimination is a draw.

## Technology and architecture

- **React + Vite** owns the page shell and starts/destroys the game canvas in `src/app/App.tsx`.
- **MatchSimulation** in `src/simulation/match/MatchSimulation.ts` owns players, fixed-tick movement, turns, timer, ammunition, every weapon, projectiles, terrain mutations, damage, falling, and victory without depending on Phaser or browser APIs.
- **Typed commands and events** in `src/simulation/match/` form the authority boundary used by both local and server-hosted play.
- **Match sources** in `src/game/matchSource.ts`, `src/game/LocalMatchSource.ts`, and `src/network/OnlineMatchSource.ts` let one Phaser scene consume either local authority or synchronized server state.
- **Phaser** converts keyboard and pointer intent into commands, renders read-only source state, interpolates online entity positions through the online source, and consumes events in `src/game/scenes/MatchScene.ts`.
- **PrivateMatchRoom** in `server/rooms/PrivateMatchRoom.ts` owns the online `MatchSimulation`, 60 Hz command/tick loop, ready/countdown flow, Schema projection, snapshots, sequenced events, disconnect pause, forfeit, and rematch.
- **Colyseus Schema** patches player/projectile and room state every 50 ms (20 Hz). The authoritative simulation still runs at 60 Hz; clients interpolate only visual positions between patches.
- **Private room codes** are six-character aliases held by the single-process registry in `server/roomCodeRegistry.ts` and resolved by `server/app.config.ts`. They are invitations, not authentication secrets.
- **Shared protocol validation** and explicit protocol/snapshot/map/weapon/build versions live in `src/network/protocol.ts`.
- **Weapon registry and inventories** live in `src/weapons/registry.ts`; shared definitions are separate from scene runtime behaviour.
- **Map registry** lives in `src/maps/registry.ts`; it owns terrain profiles and spawn points independently of scenes.
- **Serialization and replay** live in `src/simulation/serialization/` and `src/simulation/replay/`. Snapshots store the map plus ordered terrain operations rather than texture data.

The simulation advances at 60 fixed ticks per second. Local Phaser play uses a capped accumulator; online rooms use the server room interval and deterministic FIFO command ordering. Authoritative state uses plain JSON-compatible objects and arrays; Phaser graphics, input objects, and effects never enter snapshots.

## Terrain implementation

`TerrainMask` is a compact `Uint8Array` occupancy grid at half the logical canvas resolution (2 game pixels per cell). Terrain begins as a deterministic rolling ground fill. Explosive weapons remove occupied cells inside their configured terrain radius. The same mask is used for rendering, projectile collision, and character ground detection, so visible holes and gameplay collision stay aligned.

This approach is simple and reliable for the small maps. Rendering scans each occupancy column into solid runs every frame, which is intentionally unoptimized but transparent and acceptable for this prototype. Online clients reconstruct the initial terrain from the map registry and apply duplicate-safe ordered subtraction operations. A future milestone may compact long operation histories into periodic terrain checkpoints.

## Physics and turns

The match uses a capped fixed-step simulation (up to 1/60 s per step). Ballistic projectiles integrate explicit velocity, gravity, and deterministic per-turn horizontal wind, with swept point samples every three logical pixels to reduce terrain tunnelling. A projectile explodes on terrain, a character, or map exit. Explosions remove terrain, use linear radial damage falloff, and apply radial knockback with a small upward lift. The aiming guide renders only the first eight fixed simulation steps near the firing character, using the same wind-aware integration as a real projectile.

Characters use simple gravity, horizontal damping, and terrain surface checks. During input, they can walk across gentle rises and descend into craters, but cannot climb a rise greater than 12 px per movement step. Movement and jumping are unrestricted until firing or timeout. A jump applies a 310 px/s upward impulse and may include a small horizontal push from a held movement key. It requires grounded support and key release before another jump. Characters fall into newly created craters and are eliminated if they fall below the map. After impact, the game waits for character velocity and ground state to settle before switching turns. A draw is possible if both fall or are reduced to zero health in one blast.

The 30-second timer runs only in the input phase. Firing freezes it immediately. A timeout cancels any drag, displays `Time expired` briefly, and switches players without spawning a rocket. The new active player starts with a full timer and a sensible facing-relative default aim.

## Gameplay tuning

- World: 960 x 540 px; players spawn at x=175 and x=785, roughly 610 px apart.
- Aim: any world-space drag direction; `0°` is right, `90°` is up, and `180°` is left.
- Power: 30% to 100%; Basic Rocket launch speed is `950 * power / 100`, or 285 to 950 px/s.
- Gravity: 700 px/s²; fixed simulation step: 1/60 s.
- Wind: deterministic -45 to 45 px/s² horizontal acceleration, in steps of 5, selected at each turn start.
- Movement: 105 px/s while the input timer is active; jumps have no movement cost.
- Turn timer: 30 seconds per player input phase.
- Mouse pull: 36 to 180 logical px maps linearly from 30% to 100% power. The firing arrow points opposite the pull and is clamped to this range.

At the default 68% power and 45°, the rocket's ideal level-ground range is about 593 px, intentionally close to the starting opponent distance once its muzzle height is included. Full power permits forgiving high arcs and map-crossing shots, while minimum power supports nearby crater shots.

## Tests

Vitest tests cover command validation, wind determinism, fixed-step physics, pause and timer authority, all five weapons, terrain reconstruction, serialization, replay checksums, effect deduplication, audio safety, interpolation, room codes, server command authority, snapshots, reconnection, forfeit, and rematch. Run simulation-only tests with `pnpm test:simulation` and online tests with `pnpm test:server`. The Playwright smoke test uses installed headless Edge and two isolated browser contexts.

## Known limitations

- Character collision is deliberately simple: it is ground/surface based rather than a full capsule-vs-terrain solver, so steep crater walls can look rough.
- Sound effects are synthesized with Web Audio; there is no music or recorded sound library.
- Procedural effects and characters are intentionally lightweight and do not use custom sprite artwork.
- The trajectory guide intentionally shows only its initial 8/60 s segment and does not predict impacts.
- The terrain renderer redraws the entire small mask each frame rather than caching a texture.
- Terrain operation history currently grows for the life of a match. A long-running server should compact old operations into periodic terrain snapshots.
- The event queue is capped and intended to be drained every simulation update; events are presentation notifications, not reconstruction data.
- Character physics remain intentionally simple, and authoritative floating-point math assumes the same JavaScript runtime semantics on server and replay hosts.
- Private-room lookup is intentionally in-memory and single-process. Restarting the server invalidates room codes and active matches.
- There are no accounts, authentication, public matchmaking, database, Redis, rankings, spectators, or horizontal scaling.
- Online rendering uses buffered interpolation and bounded extrapolation without rollback or local movement prediction, so very high latency still affects responsiveness.
- A separately deployed web client must set `VITE_COLYSEUS_URL` to the public TLS endpoint; the server must set its public port/address and exact `ALLOWED_WEB_ORIGINS`. HTTPS pages require WSS/HTTPS for the game server.

# tsw-evileggs
