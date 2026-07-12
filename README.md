# Project Shellshock

An original local browser artillery-game prototype. It takes broad inspiration from the readable, turn-based projectile play found in classic artillery games, but is not a remake or clone of any existing game. The characters, map, UI, naming, and code are original placeholder work.

## Current milestone: Map Architecture and Local Match Flow

This repository proves a local artillery match with destructible terrain, timed turns, movement, pull-back aiming, five original placeholder weapons, and selectable original maps. It deliberately has no accounts, networking, bots, menus, progression, or mobile controls.

## Run locally

Prerequisites: Node.js 22+ and pnpm 10+.

```sh
pnpm install
pnpm dev
```

Other useful commands:

```sh
pnpm typecheck
pnpm lint
pnpm test
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
- `R`: restart the match at any time.

Before a match, use Left/Right or A/D to choose a map and Enter/Space to start; clicking a listed map also starts it. After victory, Enter rematches the same map and M returns to map selection.

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
- **Phaser** owns the active match input, render loop, and draw calls in `src/game/scenes/MatchScene.ts`.
- **Pure simulation helpers** in `src/simulation/` contain projectile integration, damage/knockback falloff, and turn transition logic. These are intentionally independent of Phaser to make a future server-authoritative simulation extraction practical.
- **Weapon registry and inventories** live in `src/weapons/registry.ts`; shared definitions are separate from scene runtime behaviour.
- **Map registry** lives in `src/maps/registry.ts`; it owns terrain profiles and spawn points independently of scenes.
- **MapSelectScene** owns the small pre-match selector; `MatchScene` receives the chosen map ID through Phaser scene data.
- **Shared numerical game data** is in `src/shared/`.

The prototype keeps Phaser from becoming the conceptual source of truth for projectile math and damage. The scene orchestrates those pure functions and performs rendering/input only where Phaser is useful.

## Terrain implementation

`TerrainMask` is a compact `Uint8Array` occupancy grid at half the logical canvas resolution (2 game pixels per cell). Terrain begins as a deterministic rolling ground fill. A rocket removes all occupied cells whose centers lie inside its blast circle. The same mask is used for rendering, projectile collision, and character ground detection, so visible holes and gameplay collision stay aligned.

This approach is simple and reliable for one small map. Rendering scans each occupancy column into solid runs every frame, which is intentionally unoptimized but transparent and acceptable for this prototype. A future milestone should cache/redraw terrain only after destruction and improve terrain-side collision.

## Physics and turns

The match uses a capped fixed-step simulation (up to 1/60 s per step). Rockets integrate explicit velocity and gravity, with swept point samples every three logical pixels to reduce terrain tunnelling. A projectile explodes on terrain, a character, or map exit. Explosions remove terrain, use linear radial damage falloff, and apply radial knockback with a small upward lift. The aiming guide renders only the first eight fixed simulation steps near the firing character, using the exact launch velocity and gravity applied to a real rocket.

Characters use simple gravity, horizontal damping, and terrain surface checks. During input, they can walk across gentle rises and descend into craters, but cannot climb a rise greater than 12 px per movement step. Movement and jumping are unrestricted until firing or timeout. A jump applies a 310 px/s upward impulse and may include a small horizontal push from a held movement key. It requires grounded support and key release before another jump. Characters fall into newly created craters and are eliminated if they fall below the map. After impact, the game waits for character velocity and ground state to settle before switching turns. A draw is possible if both fall or are reduced to zero health in one blast.

The 30-second timer runs only in the input phase. Firing freezes it immediately. A timeout cancels any drag, displays `Time expired` briefly, and switches players without spawning a rocket. The new active player starts with a full timer and a sensible facing-relative default aim.

## Gameplay tuning

- World: 960 x 540 px; players spawn at x=175 and x=785, roughly 610 px apart.
- Aim: any world-space drag direction; `0°` is right, `90°` is up, and `180°` is left.
- Power: 30% to 100%; Basic Rocket launch speed is `950 * power / 100`, or 285 to 950 px/s.
- Gravity: 700 px/s²; fixed simulation step: 1/60 s.
- Movement: 105 px/s while the input timer is active; jumps have no movement cost.
- Turn timer: 30 seconds per player input phase.
- Mouse pull: 36 to 180 logical px maps linearly from 30% to 100% power. The firing arrow points opposite the pull and is clamped to this range.

At the default 68% power and 45°, the rocket's ideal level-ground range is about 593 px, intentionally close to the starting opponent distance once its muzzle height is included. Full power permits forgiving high arcs and map-crossing shots, while minimum power supports nearby crater shots.

## Tests

Vitest tests cover keyboard aliases, pull-back direction/power clamping, responsive canvas-to-world conversion, jump eligibility, launch velocity, short fixed-step guide integration, timer progression/pausing/expiration, input permissions, turn transitions/victory detection, circular terrain removal, and weapon validation. Browser rendering and pointer integration remain manual testing concerns.

## Known limitations

- Character collision is deliberately simple: it is ground/surface based rather than a full capsule-vs-terrain solver, so steep crater walls can look rough.
- There is one map, no sound, no particles, and no mobile controls.
- Scatter traces are simulation-only in this prototype; their impact feedback is limited to damage and knockback.
- The trajectory guide intentionally shows only its initial 8/60 s segment and does not predict impacts.
- The terrain renderer redraws the entire small mask each frame rather than caching a texture.
- This is local hot-seat only and contains no networking or persistence.

# tsw-evileggs
