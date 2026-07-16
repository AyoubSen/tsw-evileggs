# Mossfire Skirmish

An original browser artillery game with local hot-seat and private online 1v1, 2v2, and 3v3 play. It takes broad inspiration from the readable, turn-based projectile play found in classic artillery games, but is not a remake or clone of any existing game. The characters, maps, UI, naming, and code are original placeholder work.

Mossfire Skirmish is an original turn-based artillery game with destructible terrain, timed turns, movement, pull-back aiming, five weapons, and selectable maps.

See the canonical [product roadmap](ROADMAP.md) for verified status, priorities, and major feature dependencies.

## Run locally

Prerequisites: Node.js 22+ and pnpm 10+.

```sh
pnpm install
pnpm dev
```

`pnpm dev` runs Vite and the Colyseus server together. Use `pnpm dev:web` or `pnpm dev:server` to run one side. Copy `.env.example` to `.env` when the defaults are not suitable. `VITE_GAME_HTTP_BASE_URL` selects the custom health and room-code HTTP base. `VITE_COLYSEUS_URL` separately selects the Colyseus SDK endpoint used for matchmaking and realtime transport. `PORT` selects the server port, and `ALLOWED_WEB_ORIGINS` is the comma-separated HTTP/WebSocket origin allowlist. Production online play fails clearly when either browser endpoint is missing, and server startup fails when the origin allowlist is missing.

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
- `C`: switch between the full-map view and the action-following camera.

Use the main menu to start a local match or create/join a private online room. Escape pauses local play; online it opens only the local menu and never pauses the server.

## Maps

- **Rolling Hills (1v1, 960 x 540)**: broad, forgiving slopes with open long-range firing lanes.
- **Twin Peaks (1v1, 1280 x 720)**: reinforced mesas meet at a destructible central saddle.
- **Broken Crossing (1v1, 1280 x 720)**: a fractured upper causeway hangs over a dependable lower route.
- **Sunken Garden (1v1, 1440 x 810)**: terraced ramps descend into a sheltered garden floor.
- **Canopy Rift (2v2, 1600 x 900)**: mirrored root shelves trade exposed crests for protected inner ground.
- **Ruined Foundry (2v2, 1440 x 810)**: brick workshops, internal floors, steel supports, and a shattered central span create multi-level routes.
- **Switchback Quarry (2v2, 1600 x 900)**: open quarry benches switch back around a permanent central outcrop.
- **Dry Aqueduct (2v2, 1536 x 864)**: broken upper decks cross stone arches above a continuous dry channel.
- **Triad Reach (3v3, 1920 x 1080)**: three open ridge ranges descend toward broad central shelves.
- **Sundered Crown (3v3, 1920 x 1080)**: a broken crown joins upper lanes above a permanent lower passage.
- **Lantern Vault (3v3, 1920 x 1080)**: cavern galleries climb through three broad ceiling shafts.
- **Fossil Wake (3v3, 2048 x 1152)**: permanent fossil ribs rise through a destructible basin and broken scaffolds.

The movement aliases use physical browser keyboard codes, so both AZERTY and QWERTY layouts work without configuration. Ballistic weapons use world-space pull-back aiming. Teleporter instead points at a safe map destination. Local and online team modes alternate Team Comet and Team Ember players, skip eliminated players, keep ammunition per player, and enable friendly fire. Online seats are assigned `A1, B1, A2, B2` for 2v2 and `A1, B1, A2, B2, A3, B3` for 3v3; every player must ready and unanimously approve rematches. Each input turn lasts 20, 30, or 45 seconds. Rocket is unlimited; Grenade and Scatter have 3 uses; Cluster and Teleporter have 2.

## Arsenal

- **Basic Rocket**: variable-power ballistic explosion; unlimited ammunition.
- **Timed Grenade**: variable-power bouncing projectile with a 3-second fuse; 3 uses.
- **Scatter Shot**: deterministic seven-pellet short-range burst; 3 uses.
- **Cluster Charge**: variable-power parent charge that releases five child explosives; 2 uses.
- **Teleporter**: moves the player to a valid supported target without damage; 2 uses.

Successful activation consumes ammunition once and locks input until the action and world settling finish. A simultaneous elimination is a draw.

Every player visibly carries the selected weapon through a procedural toy-tech model. Held models rotate through the full aim range, mirror their grip correctly, recoil from authoritative firing events, and remain cosmetic-only. Rockets, grenades, cluster canisters and children use distinct state-reconstructed silhouettes and bounded trails; Scatter Shot and Teleporter use dedicated transient traces, sparks, and rings. Reconnect restores held weapons and live projectiles without replaying old flashes or impacts.

## Technology and architecture

- **React + Vite** owns the page shell and starts/destroys the game canvas in `src/app/App.tsx`.
- **MatchSimulation** in `src/simulation/match/MatchSimulation.ts` owns players, fixed-tick movement, turns, timer, ammunition, every weapon, projectiles, terrain mutations, damage, falling, and victory without depending on Phaser or browser APIs.
- **Typed commands and events** in `src/simulation/match/` form the authority boundary used by both local and server-hosted play.
- **Match sources** in `src/game/matchSource.ts`, `src/game/LocalMatchSource.ts`, and `src/network/OnlineMatchSource.ts` let one Phaser scene consume either local authority or synchronized server state.
- **Phaser** converts keyboard and pointer intent into commands, renders read-only source state, interpolates online entity positions through the online source, and consumes events in `src/game/scenes/MatchScene.ts`.
- **PrivateMatchRoom** in `server/rooms/PrivateMatchRoom.ts` owns mode-specific two/four/six-player capacity, fixed team seats, the online `MatchSimulation`, 60 Hz command/tick loop, ready/countdown flow, Schema projection, snapshots, sequenced events, disconnect pause, team forfeit, and unanimous rematch.
- **Colyseus Schema** patches player/projectile and room state every 50 ms (20 Hz). The authoritative simulation still runs at 60 Hz; clients interpolate only visual positions between patches.
- **Private room codes** are six-character aliases held by the single-process registry in `server/roomCodeRegistry.ts` and resolved by `server/app.config.ts`. They are invitations, not authentication secrets.
- **Shared protocol validation** and explicit protocol/snapshot/map/weapon/build versions live in `src/network/protocol.ts`.
- **Weapon registry and inventories** live in `src/weapons/registry.ts`; shared definitions are separate from scene runtime behaviour.
- **Weapon presentation registry** in `src/game/weaponPresentation.ts` owns client-only model geometry, colors, recoil, trails, and reduced-motion policy without affecting simulation checksums or collision.
- **Map documents and registry** live in `src/maps/`; they own versioned material grids, world dimensions, visual themes, and explicit `x`/`y` team spawns independently of scenes. `maps-src/README.md` documents external PNG authoring.
- **Serialization and replay** live in `src/simulation/serialization/` and `src/simulation/replay/`. Snapshots store the map plus ordered terrain operations rather than texture data.

The simulation advances at 60 fixed ticks per second. Local Phaser play uses a capped accumulator; online rooms use the server room interval and deterministic FIFO command ordering. Authoritative state uses plain JSON-compatible objects and arrays; Phaser graphics, input objects, and effects never enter snapshots.

## Terrain implementation

`TerrainMask` is a compact `Uint8Array` material grid at half the logical canvas resolution (2 game pixels per cell). Empty, soil, brick, stone, and steel cells share one authoritative mask. Soil and brick are destructible; stone and steel survive explosions. The same mask is used for rendering, projectile collision, local floor/ceiling/wall support, and terrain mutation, so visible structures and gameplay collision stay aligned.

Versioned map documents encode material rows with deterministic run-length encoding. Existing profile maps resolve through this document seam, while Ruined Foundry demonstrates explicit multi-level structures. Rendering rebuilds material runs only after terrain changes. Online clients reconstruct the immutable base map and apply duplicate-safe ordered subtraction operations. A future milestone may compact long operation histories into periodic terrain checkpoints.

## Physics and turns

The match uses a capped fixed-step simulation (up to 1/60 s per step). Ballistic projectiles integrate explicit velocity, gravity, and deterministic per-turn horizontal wind, with swept point samples every three logical pixels to reduce terrain tunnelling. A projectile explodes on terrain, a character, or map exit. Explosions remove terrain, use linear radial damage falloff, and apply radial knockback with a small upward lift. The aiming guide renders only the first eight fixed simulation steps near the firing character, using the same wind-aware integration as a real projectile.

Characters use simple gravity, horizontal damping, local support searches, and lightweight wall/ceiling probes. They can stand on internal floors rather than always resolving to the uppermost terrain surface. During input, they can walk across gentle rises and descend into craters, but cannot climb a rise greater than 12 px per movement step. Movement and jumping are unrestricted until firing or timeout. A jump applies a 310 px/s upward impulse and may include a small horizontal push from a held movement key. It requires grounded support and key release before another jump. Characters fall into newly created craters and are eliminated if they fall below the map. After impact, the game waits for character velocity and ground state to settle before switching turns. A draw is possible if both teams fall or are reduced to zero health in one blast.

The selected 20-, 30-, or 45-second timer runs only in the input phase. Firing freezes it immediately. A timeout cancels any drag, displays `Time expired` briefly, and switches players without spawning a rocket. The new active player starts with a full timer and a sensible facing-relative default aim.

## Gameplay tuning

- Viewport: 960 x 540 px. Official worlds range from Rolling Hills at 960 x 540 to Fossil Wake at 2048 x 1152. All maps retain a 16:9 world and use camera fitting or action tracking when larger than the viewport.
- Aim: any world-space drag direction; `0°` is right, `90°` is up, and `180°` is left.
- Power: 30% to 100%; Basic Rocket launch speed is `950 * power / 100`, or 285 to 950 px/s.
- Gravity: 700 px/s²; fixed simulation step: 1/60 s.
- Wind: deterministic -45 to 45 px/s² horizontal acceleration, in steps of 5, selected at each turn start.
- Movement: 105 px/s while grounded; jumps support capped 85 px/s mid-air steering while the input timer is active.
- Turn timer: 20, 30, or 45 seconds per player input phase; 30 seconds by default.
- Mouse pull: 36 to 180 logical px maps linearly from 30% to 100% power. The firing arrow points opposite the pull and is clamped to this range.

At the default 68% power and 45°, the rocket's ideal level-ground range is about 593 px, intentionally close to the starting opponent distance once its muzzle height is included. Full power permits forgiving high arcs and map-crossing shots, while minimum power supports nearby crater shots.

## Tests

Vitest tests cover command validation, wind determinism, fixed-step physics, pause and timer authority, all five weapons, terrain reconstruction, serialization, replay checksums, effect deduplication, audio safety, interpolation, room codes, server command authority, snapshots, reconnection, forfeit, and rematch. Run simulation-only tests with `pnpm test:simulation` and online tests with `pnpm test:server`. The Playwright smoke test uses installed headless Edge and two isolated browser contexts.

After deploying the server, verify the production health CORS response with:

```powershell
curl.exe -i -H "Origin: https://evileggs.vercel.app" https://tsw-evileggs.onrender.com/health
```

The response must include `Access-Control-Allow-Origin: https://evileggs.vercel.app`.

## Production deployment

The Vercel project must define these build-time variables:

```text
VITE_GAME_HTTP_BASE_URL=/game-server
VITE_COLYSEUS_URL=https://tsw-evileggs.onrender.com
```

`vercel.json` rewrites `/game-server/:path*` to `https://tsw-evileggs.onrender.com/:path*`. The browser therefore requests `/game-server/health` and `/game-server/api/private-rooms/:code` from the frontend origin. The rewrite preserves the server's safe health JSON and room-code resolver behavior. Colyseus matchmaking and its WebSocket still connect directly to Render through `VITE_COLYSEUS_URL`; they are not sent through the Vercel rewrite.

The Render service must define:

```text
ALLOWED_WEB_ORIGINS=https://evileggs.vercel.app
DEVELOPMENT_LOGGING=false
```

Keep `ENABLE_TEST_ROUTES` unset in production. The existing exact-origin CORS and WebSocket checks remain required and must not be replaced with a wildcard.

Vercel must redeploy after changing a frontend environment variable or `vercel.json`, because Vite embeds browser variables at build time. Render needs no environment change for the proxy itself. A content blocker, VPN, firewall, or network filter can still block the direct Colyseus matchmaking or WebSocket connection; the application reports that realtime-specific case without attempting to bypass the user's controls.

For local development, both public bases normally target the same local process:

```text
VITE_GAME_HTTP_BASE_URL=http://localhost:2567
VITE_COLYSEUS_URL=http://localhost:2567
```

When testing the deployed-style same-origin path locally, set `VITE_GAME_HTTP_BASE_URL=/game-server`; Vite proxies that prefix to `VITE_GAME_HTTP_PROXY_TARGET`, or to `VITE_COLYSEUS_URL` when no explicit proxy target is supplied.

## Known limitations

- Character collision is deliberately simple: it is ground/surface based rather than a full capsule-vs-terrain solver, so steep crater walls can look rough.
- Sound effects are synthesized with Web Audio; there is no music or recorded sound library.
- Procedural effects and characters are intentionally lightweight and do not use custom sprite artwork.
- The trajectory guide intentionally shows only its initial 8/60 s segment and does not predict impacts.
- Terrain graphics are rebuilt after terrain mutations rather than every frame, but larger worlds do not yet use chunked render textures.
- Terrain operation history currently grows for the life of a match. A long-running server should compact old operations into periodic terrain snapshots.
- The event queue is capped and intended to be drained every simulation update; events are presentation notifications, not reconstruction data.
- Character physics remain intentionally simple, and authoritative floating-point math assumes the same JavaScript runtime semantics on server and replay hosts.
- Private-room lookup is intentionally in-memory and single-process. Restarting the server invalidates room codes and active matches.
- Online 2v2 and 3v3 use fixed balanced team assignment; team choice, substitutions, and uneven teams are not supported.
- There are no accounts, authentication, public matchmaking, database, Redis, rankings, spectators, or horizontal scaling.
- Online rendering uses buffered interpolation and bounded extrapolation without rollback or local movement prediction, so very high latency still affects responsiveness.
- A separately deployed web client must set both browser endpoints. Custom HTTP can use the Vercel same-origin rewrite, but Colyseus matchmaking and WebSocket traffic remain direct to the public TLS server and may still be blocked by local privacy or network policy. The server must set its public port/address and exact `ALLOWED_WEB_ORIGINS`.

# tsw-evileggs
