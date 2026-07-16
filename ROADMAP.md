# Mossfire Skirmish Product Roadmap

**Last reviewed:** 2026-07-16

## Purpose

This is the canonical long-term product roadmap for Mossfire Skirmish. It describes broad product direction and dependencies between major features; it is not a promise that every idea will be implemented. Read it before proposing or starting major work, and update it when milestones are completed, priorities change, or product decisions alter dependencies.

The roadmap distinguishes **Completed**, **In progress**, **Planned**, **Later**, **Exploratory**, and **Deferred** work. A status applies to the milestone as a whole; individual foundations may already exist. This document does not replace issue-level implementation plans, architecture decisions, or focused milestone specifications.

## Verified Current State

The following summary is based on active source and tests, not only earlier documentation.

| Status      | Area                         | Verified state                                                                                                                                                                                                                                                                                                                       |
| ----------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Completed   | Application and rendering    | React and Vite own the application shell; Phaser owns gameplay input and presentation. Local and online matches share the same scene through match-source abstractions.                                                                                                                                                              |
| Completed   | Authoritative simulation     | Framework-independent TypeScript simulation owns fixed 60 Hz stepping, turn phases, timers, movement, jumping, freeze counters, health, map-based ammunition, projectiles, persistent mines and bomb beacons, stable entity IDs, damage, falling, victory, and draws. Generic directional, target-position, and self activation plus an in-flight trigger command and events define the authority boundary.          |
| Completed   | Core artillery play          | Direct mouse-drag aiming, clickable weapon selection, per-player remembered aim, movement, jumping, deterministic per-turn wind, destructible terrain, and fifteen functional weapons are implemented: Basic Rocket, Precision Cannon, High-Arc Mortar, Timed Grenade, Scatter Shot, Cluster Charge, Terrain-Boring Drill, Deployable Mine, Pocket Knife, Bomb Beacon, Fork Rocket, Old Shoe, Siege Bazooka, Cryo Shot, and Teleporter. Fork Rocket splits on a second `Space`; Bomb Beacon's delayed barrage is obstacle-blocked; Cryo Shot locks only movement and jumping on the victim's next personal turn. |
| In progress | Current maps                 | Twelve official maps, four each for 1v1, 2v2, and 3v3, resolve through versioned documents with explicit dimensions, revisions, themes, material grids, and canonical `x`/`y` team spawns. The roster spans 960 x 540 through 2048 x 1152 worlds and includes multi-level structures, passages, galleries, and material-defined routes; typed special objects are not implemented. |
| In progress | Local play                   | Local hot-seat 1v1, 2v2, and 3v3 support names, mode-filtered maps, 20/30/45-second turns, pause, results, and rematches. Team modes provide alternating turns, eliminated-player skipping, team victory, friendly fire, individual ammunition, and six-player HUD presentation. The 3v3 path is pending user playtesting. |
| In progress | Private online play          | Colyseus hosts server-authoritative private 1v1, 2v2, and 3v3 rooms with mode-specific capacity, fixed balanced teams, all-player readiness, countdowns, validated intent commands, rate limits, synchronized state/effects, buffered interpolation, connection quality feedback, and cold-start feedback. The six-client path is pending user playtesting. |
| In progress | Recovery and lifecycle       | Tab-scoped refresh recovery, per-player reconnect deadlines, authoritative all-player pause/resume, team forfeit on a member leaving, snapshots, sequence-gap recovery, and unanimous mode-specific rematch voting are implemented for rooms up to six players. Six-player lifecycle behavior is pending user playtesting. Room codes and active rooms remain process-local. |
| Completed   | Preferences and presentation | Local preferences remember names, map, turn duration, audio settings, reduced motion, contrast, screen flash, camera shake, and aim-guide density. Synthesized audio, procedural visual effects, distinct held models and projectile presentation for all fifteen weapons, persistent mine/beacon and freeze presentation, clickable weapon selection, and per-player turn aim memory are implemented. Controls are not fully customizable.                                      |
| Completed   | Automated coverage           | Vitest suites cover simulation, protocol, server lifecycle, synchronization, interpolation, audio safety, serialization, and internal replay checksums. A Playwright two-browser private-room smoke test exists. Coverage is meaningful but not exhaustive.                                                                          |
| In progress | Production maturity          | The code supports separate frontend/server endpoints, strict production origin configuration, health checks, and deployment-oriented cold-start handling. Vercel frontend and Render server deployment are reported as operational project context, but provider manifests and deployment history are not stored in this repository. |
| Planned     | Replay product               | Snapshot serialization, deterministic command replay helpers, and checksums exist as internal/test foundations. Match recording, a durable replay format, viewer, playback controls, and sharing do not.                                                                                                                             |
| Planned     | Product expansion            | Accounts, database persistence, chat, public teams, dedicated spectator controls, online custom maps, advanced map objects, invite links, broader custom rules, profiles, statistics, cosmetic ownership, and public discovery are not implemented. A local visual map editor with import/export and authoritative test play is implemented. |

Current architectural constraints matter to future work: existing profile maps are adapted into the new document format at startup rather than stored as external files; terrain materials and multi-level collision exist but typed special objects do not; online team modes use fixed seats and pause everyone for any disconnect; camera modes support variable worlds but do not yet provide manual overview panning; and room lookup is process-local. Match snapshots are version 6 and include freeze counters, beacons, and stable next IDs; online compatibility is protocol `private-room-6`, weapon registry `weapons-4`, and build `1.4.0`. Existing architecture details remain documented in [README.md](README.md).

## Product Principles

1. **Private play first.** Private rooms with friends are the primary online experience. Public matchmaking is not a near-term priority.
2. **Server authority.** Online outcomes remain server-authoritative. Clients send intentions, never damage, collision, inventory, or victory claims.
3. **Local mode remains supported.** Major online features should not unnecessarily remove local play. Shared simulation rules should continue to serve both modes where practical.
4. **Original identity.** Do not copy Bad Eggs Online, Worms, ShellShock Live, or any other game's assets, branding, maps, weapon designs, characters, audio, or UI. Inspiration must result in original work.
5. **Configurable fun.** Private-room options and custom rules are more valuable than competitive ranking for this product direction.
6. **No pay-to-win.** Future customization or monetization, if any, must not grant gameplay advantages.
7. **User-generated content is data, not executable code.** Custom maps must use validated, versioned, deterministic data formats and contain no executable scripts.
8. **Accessibility and usability are product features.** Keyboard rebinding, readable and scalable UI, reduced motion, color-independent indicators, volume and flash controls, keyboard navigation, and localization belong in product planning rather than final cleanup.
9. **Presentation does not decide outcomes.** Character, weapon, projectile, trail, and impact visuals remain separate from authoritative simulation identifiers and behavior.
10. **Scale only for demonstrated need.** Preserve a simple deployable architecture until measured usage justifies distributed coordination or horizontal scaling.

## Priority Categories

**NOW / NEXT:** Choose one coherent milestone or named sub-milestone at a time from Milestones 2-4: personalization and controls, weapon/projectile presentation, or the first bounded slice of advanced map architecture. Milestone 4 carries higher architectural risk and must be split as described there. Further mechanically distinct map work follows the remaining advanced-map architecture rather than adding map-specific simulation behavior.

**LATER:** Milestones 6-16 have a known place in the product direction but depend on foundations, product decisions, or operational capacity that do not yet exist. Accessibility and operational work within these milestones should still be applied incrementally to earlier features.

**EXPLORATORY:** Milestone 17 requires design validation and should begin with constrained experiments, not a commitment to a full feature line.

**DEFERRED:** Milestone 18 is intentionally not prioritized. Deferred work must not silently displace private-room improvements.

## Ordered Milestones

### 1. Foundation: Local and Private 1v1

**Status:** Completed

**Purpose:** Establish one authoritative artillery simulation that supports both local hot-seat and private online play.

**Player-facing outcome:** Friends can choose a map and turn duration, play locally or through a room code, recover from a short disconnect or refresh, finish by victory/draw/forfeit, and vote for an online rematch.

**Main systems affected:** React/Vite shell, Phaser scene, `MatchSimulation`, terrain mask, map and weapon registries, local/online match sources, Colyseus room, protocol, snapshots, effects, audio, preferences, and automated tests.

**Dependencies:** None; this is the foundation for every later milestone.

**Broad scope:** Deterministic fixed-step simulation, destructible terrain, the initial four-map roster, the current fifteen-weapon arsenal, generic selected-weapon activation handlers and the Fork Rocket trigger, persistent authoritative mines and bomb beacons, fixed canonical Teleporter surface targeting, Cryo movement-only turn locks, movement/jumping, direct drag aiming, clickable weapon selection, per-player turn aim memory, wind, local preferences, local 1v1, private online 1v1, room codes, ready flow, reconnect/refresh recovery, rematches, synchronized effects, interpolation, audio, connection feedback, deployable frontend/server configuration, and simulation/server/client/browser tests.

**Explicitly out of scope:** Accounts, persistent database, chat, team play, spectators, custom maps, mechanically rich map objects, user-facing replays, public matchmaking, rankings, and horizontal scaling.

**Major risks:** Simple character/terrain collision, full terrain redraws, growing terrain-operation histories, JavaScript-runtime assumptions for floating-point determinism, in-memory room codes, limited browser coverage, and version identifiers that require deliberate migration.

**Unresolved design decisions:** Whether to harden current physics before broader modes; how long the existing protocol/snapshot versions remain supported; which current presentation assets are temporary; and whether deployment configuration should become repository-managed.

**Completion indicators:** Active code and tests demonstrate the listed local and private 1v1 lifecycle. This status does not imply production-scale operations or exhaustive balance and browser coverage.

### 2. Personalization and Controls

**Status:** Planned; NOW / NEXT candidate

**Purpose:** Give each player a recognizable local identity and comfortable, predictable input without requiring an account.

**Player-facing outcome:** Players can rebind controls, keep their own aim preferences, and create a readable original character appearance that persists on the current device.

**Main systems affected:** Preferences schema and migration, input command mapping, How to Play and contextual hints, local setup, lobby identity, actor rendering, online room state, validation, and accessibility UI.

**Dependencies:** Existing preferences and player identity. Account synchronization is a later enhancement, not a prerequisite.

**Broad scope:** Fully rebindable keyboard controls; AZERTY and QWERTY support; conflict detection; reset to defaults; local persistence; practical menu-navigation bindings; accessibility alternatives; prevention of browser-default conflicts; and current bindings in help and hints. Remember each player's last ballistic direction and appropriate power independently; decide global-versus-per-weapon memory; keep Teleporter targeting separate; allow Scatter Shot its own directional memory if useful; define sensible new-match defaults and rematch behavior; and let online clients retain only input/presentation preference while the server validates fire commands.

Player model customization includes modular original body parts or character components, colors, faces, accessories, outlines, clear player/team readability, a preview screen, local persistence first, later account-backed persistence, server-validated cosmetic identifiers online, and no gameplay advantage. Procedural placeholder characters may eventually be replaced or supplemented by original custom artwork.

**Explicitly out of scope:** Authentication, cloud sync, cosmetic ownership or purchases, gameplay-affecting equipment, account inventory, weapon/projectile skins, and a final large asset catalog.

**Major risks:** Breaking existing controls, inaccessible binding UI, ambiguous aim-memory rules across weapon modes, unreadable color combinations, preference migration failures, and trusting arbitrary client cosmetic payloads.

**Unresolved design decisions:** Is ballistic aim memory global or per weapon? Is power remembered for every variable-power weapon? Do rematches preserve aim memory? Which appearance slots form the first stable cosmetic schema? Which bindings are reserved by the browser or operating system?

**Completion indicators:** Every gameplay keyboard action can be rebound and restored; conflicts and browser defaults are handled; help reflects current bindings; ballistic, Scatter, and Teleporter memories do not overwrite one another; two local and online players render validated distinct appearances; preferences survive reload and migrate safely; and tests cover mapping, aim-memory isolation, validation, and persistence.

### 3. Distinct Weapon and Projectile Presentation

**Status:** Implemented; visual playtesting and tuning pending

**Purpose:** Make weapon choice and projectile state immediately readable while preserving simulation authority.

**Player-facing outcome:** The active character visibly holds the selected weapon, aims and fires with a weapon-appropriate pose, and every projectile has a recognizable silhouette, trail, transition, and impact presentation.

**Main systems affected:** Phaser actor/projectile renderers, presentation event mapping, animation state, asset loading, cosmetic hooks, snapshot reconstruction, reduced-motion behavior, and performance budgets.

**Dependencies:** Existing weapon registry, projectile IDs, events, interpolation, and snapshot recovery. Player appearance work can precede or follow this milestone if render interfaces stay modular.

**Broad scope:** A client-only procedural presentation registry now defines visible held models, grip/muzzle geometry, colors, recoil, projectile silhouettes, bounded trails, effects, and reduced-motion policy for all fifteen weapons. Characters use weapon-specific aiming/rest/firing poses with correct handed mirroring. Rockets, cannon shells, mortar shells, grenades, cluster parents and children, drills, beacon bombs, fork parents and children, shoes, siege rockets, and cryo capsules reconstruct from authoritative state; Pocket Knife, Scatter, and Teleporter use sequenced transient effects, while deployed mines, active beacons, and player freeze state reconstruct from persistent authoritative state. Same-match snapshots clear stale event effects while restoring selected weapons, live projectiles, mines, beacons, and frozen players without changing simulation outcomes.

**Explicitly out of scope:** New weapon mechanics, balance changes solely to fit art, gameplay-affecting skins, cosmetic ownership, and simulation collision based on rendered sprite bounds.

**Major risks:** Presentation state drifting from authoritative state, incorrect left/right mirroring, duplicate effects after snapshots, excessive asset/bundle cost, and reduced-motion regressions.

**Unresolved design decisions:** Procedural toy-tech silhouettes are the current workflow, and Scatter remains an instantaneous trace. Future decisions include whether selected models later migrate to trusted SVG/atlas artwork, how skins compose with base models, and whether live remote pre-fire aim should remain intentionally private.

**Completion indicators:** All fifteen weapons and every projectile subtype are visually distinguishable in both orientations; activation/recoil/impact transitions respond to authoritative events; reconnect does not lose or duplicate relevant long-lived visuals, including mines, beacons, and freeze state; reduced-motion settings remain effective; and visual substitutions leave deterministic checksums unchanged.

### 4. Advanced Map Architecture

**Status:** In progress; active NOW / NEXT milestone

**Purpose:** Replace fixed procedural surface assumptions with reusable, deterministic, data-driven world dimensions, materials, objects, and boundary rules.

**Player-facing outcome:** Official maps can support larger and more varied arenas with clearly communicated surfaces and projectile interactions instead of only different terrain curves.

**Main systems affected:** Map registry/schema, terrain representation, `MatchSimulation`, collision dispatch, projectile integration, spawn validation, camera transforms, pointer-to-world input, snapshots, protocol/registry versions, map preview, renderer, and tests.

**Dependencies:** Current deterministic simulation and map registry. This milestone must precede advanced official maps and the stable custom-map format.

**Broad scope:** Make world dimensions independent of the current fixed viewport; add camera tracking and zoom, with aiming overview where useful and a minimap only if it proves useful; preserve correct pointer coordinates under transforms; support longer projectile travel, performance limits, snapshot sizing, and interpolation over larger spaces. Define reusable data-driven terrain materials, map objects, and map-defined boundary behavior rather than scattering map-specific conditionals through `MatchSimulation`.

Mechanics include destructible and indestructible terrain; reflective walls that bounce projectiles; horizontal wraparound boundaries where projectiles exiting one side return from the other; paired portals; one-way projectile barriers; low-friction and high-bounce surfaces; and explicit material rules. Moving platforms are allowed only if deterministic and server-authoritative. Environmental hazards follow only after a generic mechanic system exists. Map-specific wind rules are allowed only when clearly communicated to players.

**Suggested sub-milestones:** 4A establishes variable dimensions, camera/zoom, pointer transforms, and performance measurements. Variable dimensions, camera-aware input, fixed-screen HUD rendering, full-map/action-following modes, and larger maps are implemented; manual overview controls and performance measurements remain. 4B establishes the versioned material/object model with destructible and indestructible regions. Versioned row-RLE map documents, external source compilation, explicit vertical spawns, material terrain, and local multi-level collision are implemented; typed objects remain. 4C adds reflective, wraparound, portal, and one-way projectile behavior through that generic model. 4D hardens snapshots, reconnect, interpolation, validation, and registry migration before custom maps depend on the architecture.

**Explicitly out of scope:** A user-facing editor, uploaded maps, executable map scripts, one-off map checks embedded in simulation control flow, teams, broad environmental hazard catalogs, and public map discovery.

**Major risks:** Nondeterministic collision ordering, portal/reflection loops, high-speed tunnelling, pointer-coordinate mismatch under camera transforms, oversized snapshots, interpolation artifacts, terrain format incompatibility, and unacceptable rendering cost.

**Unresolved design decisions:** Raster, vector, tile, or hybrid terrain format; material granularity; object ordering and stable IDs; camera bounds and zoom rules; projectile behavior at portal/boundary edge cases; how indestructible regions interact with the occupancy mask; and whether players ever wrap or only projectiles do.

**Completion indicators:** At least one test map demonstrates variable dimensions, camera/pointer correctness, destructible and indestructible terrain, reflection, horizontal projectile wraparound, and paired portals through generic map data; local, server, snapshot, reconnect, and deterministic replay tests agree; malformed mechanics are rejected; and no map ID branches are added to `MatchSimulation`.

### 5. Larger and Mechanically Distinct Official Maps

**Status:** In progress; twelve-map baseline roster implemented

**Purpose:** Turn the map roster into meaningful mechanical and visual variety while validating the advanced architecture with curated content.

**Player-facing outcome:** Players choose genuinely different battlefields with distinct sizes, routes, firing problems, visual identities, and supported player counts.

**Main systems affected:** Official map data/assets, map selection and previews, camera, terrain/material rendering, spawn validation, performance budgets, room configuration, and balance/playability tests.

**Dependencies:** Advanced map architecture. Team-capable spawn design should be coordinated with Milestone 9.

**Broad scope:** The official registry now contains twelve maps, with four maps for each of 1v1, 2v2, and 3v3; Crater Basin has been retired. Current worlds range from 960 x 540 to 2048 x 1152 and include profile terrain, fractured bridges, terraces, team-scale structures, passages, galleries, and permanent material skeletons. Further scope includes separated islands, asymmetric layouts, custom spawn zones, map-specific environmental presentation, and selected reusable mechanics such as portals, reflective surfaces, wraparound projectiles, or one-way barriers. Those mechanics must be generic map data rather than map-specific simulation code.

**Explicitly out of scope:** Cosmetic reskins presented as new maps, arbitrary map-specific simulation code, unvalidated user maps, random hazards without readable rules, and a minimap unless playtesting demonstrates a need.

**Major risks:** Maps that are novel but not playable, camera disorientation, long inactive travel time, poor spawn fairness, team incompatibility, performance cliffs, and mechanics that are difficult to explain.

**Unresolved design decisions:** Initial target map sizes; which mechanic combinations belong in the first official set; symmetric versus asymmetric competitive expectations; whether map-specific wind is desirable; and criteria for retiring or revising current maps.

**Completion indicators:** The official roster contains multiple maps whose mechanics, scale, layout, and presentation are observably different; every spawn zone passes automated safety checks for supported modes; camera and pointer behavior remain correct; maps stay within measured simulation/render/network budgets; and rule differences are visible before and during play.

### 6. Optional Accounts and Persistent Identity

**Status:** Later

**Purpose:** Add durable cross-device identity and a trustworthy ownership boundary while preserving frictionless guest private play.

**Player-facing outcome:** A player may register securely, keep a display name/profile/preferences/customization across devices, inspect or end sessions, and delete the account; guests can still join a friend's private room.

**Main systems affected:** Authentication, account/session UI, server identity boundary, database and migrations, profile service, preferences, privacy controls, room joins, audit/error handling, and deployment secrets.

**Dependencies:** A selected authentication and database approach, a privacy model, secure production operations, and stable identifiers for synchronized settings and cosmetics.

**Broad scope:** Optional registered accounts; secure authentication; persistent display name; player profile; cloud-synchronized preferences, character customization, and control bindings; statistics foundations; account deletion and privacy controls; session management; and database-backed persistence. Define guest-to-account migration where useful. Accounts are required before durable cross-device identity, persistent customization, uploaded-map ownership, reports, social relationships, and reliable statistics can exist.

**Explicitly out of scope:** Requiring authentication to join a friend's private room unless a later explicit product decision changes this; public matchmaking; ranking; pay-to-win entitlements; collecting unnecessary personal data; and assuming a display name is a unique account identifier.

**Major risks:** Account takeover, privacy or deletion failures, guest/account identity confusion, database migration loss, secret leakage, abuse through names, provider lock-in, and outages blocking otherwise playable private rooms.

**Unresolved design decisions:** Authentication provider versus owned credentials; supported login methods; guest progression migration; display-name uniqueness and moderation; data retention; regional/privacy obligations; session limits; and which preferences win during first cloud sync.

**Completion indicators:** Guests retain the current private-room path; registered users can sign in/out across devices, manage sessions, sync supported preferences/customization, request deletion, and recover safely from partial outages; server code derives identity from verified sessions; database migrations/backups are exercised; and privacy/security tests cover critical flows.

### 7. Private-Room Chat and Social Safety

**Status:** Later

**Purpose:** Let friends communicate inside private lobbies and matches without treating private rooms as free from moderation, privacy, abuse, or storage concerns.

**Player-facing outcome:** Players can exchange safe text or quick emotes, mute or hide chat, and later block/report identity-backed users.

**Main systems affected:** Room protocol and schema, lobby/match UI, server validation, rate limiting, text rendering, accessibility, moderation policy, privacy/retention, account relationships, and operational tooling.

**Dependencies:** Basic private chat can work for guests after policy and validation design. Durable block/report relationships, sanctions, and reliable reports depend on optional accounts and persistence.

**Broad scope:** Private-room lobby chat; in-match chat; mute; hide chat; message-length limits; per-user and room rate limits; server-side validation; safe text rendering with no arbitrary HTML; optional quick emotes; readable keyboard focus behavior; and clear retention behavior. Once accounts exist, add block/report support, player-name moderation, privacy settings, account sanctions where necessary, and moderation tools. Establish chat filtering, moderation, storage, and retention policy before any broad public use.

**Explicitly out of scope:** Global chat, direct messages, public channels, arbitrary HTML/Markdown, permanent chat history by default, automated sanctions without policy, and public discovery.

**Major risks:** Harassment, impersonation, spam, unsafe rendering, accidental message retention, reports without actionable evidence, chat obscuring controls, and guest evasion of social controls.

**Unresolved design decisions:** Whether guest chat is enabled by default; whether messages are ephemeral or retained briefly for reports; filter policy; report evidence; behavior after blocking inside the same active room; and whether dead players may chat during team games.

**Completion indicators:** Lobby and in-match chat pass validation, rate-limit, escaping, focus, mute/hide, reconnect, and accessibility tests; no arbitrary markup executes; policy and retention are documented; and identity-backed block/report behavior exists before chat is exposed beyond private rooms.

### 8. Custom Match Rules, Presets, and Invite Links

**Status:** Later; high-value private-room milestone

**Purpose:** Make private rooms replayable and expressive without depending on public matchmaking.

**Player-facing outcome:** A host can share a safe room link, configure a match, and show every participant the active rules before readiness; preferred configurations can later be saved as presets.

**Main systems affected:** Match configuration model, lobby/host authority, protocol validation, simulation initialization, map/weapon registries, invite routing, URL handling, preferences/accounts, room lifecycle, and tests.

**Dependencies:** Existing room codes and configuration. Team options depend on team simulation; map mechanic rules depend on advanced map architecture; cloud presets depend on accounts, while local presets do not.

**Broad scope:** Turn duration; starting health; wind strength or disabled wind; explicit or random map choice; team size when supported; friendly fire; weapon availability; starting ammunition; duplicate weapons; movement and jump rules; terrain-destruction multiplier only if deterministic and technically safe; and sudden-death options later. Validate all settings server-side, version the configuration, and display active rules clearly in the lobby and match. Support locally saved presets first and account sync later.

Keep room codes. Add a shareable room URL that launches the game and pre-fills or resolves the room without authentication. Invalid and expired links must fail safely. A room link or code must not grant account-level authority, and reconnect credentials remain separate secrets.

**Explicitly out of scope:** Client-trusted rule enforcement, hidden host advantages, arbitrary scripts, ranked rule queues, mandatory accounts, exposing reconnect tokens in URLs, and technically unsafe terrain multipliers.

**Major risks:** Configuration combinations that deadlock or destabilize simulation, unclear lobby consent, host migration ambiguity, stale invite links, URL leakage, protocol fragmentation, and an untestable option matrix.

**Unresolved design decisions:** Who owns room settings and when they lock; whether all players must approve changes; initial preset catalog; random-map exclusions; how duplicate weapons work; which movement/jump options are genuinely fun; and whether links resolve codes or opaque invitations.

**Completion indicators:** Supported configurations are versioned, server-validated, visible before readiness, reproducible in snapshots/replays, and tested in local/online modes; invalid combinations fail clearly; presets round-trip safely; room codes still work; invite links open the correct join flow; and links carry no account or reconnect authority.

### 9. 2v2 Team Play

**Status:** Implemented and playtested as the foundation for 3v3

**Purpose:** Expand private play to four friends without treating teams as a simple room-capacity change.

**Player-facing outcome:** Four players can join, choose teams, play an understandable alternating turn order, reconnect, spectate after elimination, and win or lose as a team.

**Main systems affected:** Simulation player/team model, command ownership, turn scheduler, victory conditions, damage rules, inventories, room capacity and seats, lobby/ready flow, snapshots/protocol, reconnect/forfeit/rematch lifecycle, maps/spawns, camera, HUD, identity readability, bandwidth, and tests.

**Dependencies:** Larger team-compatible official maps and camera support; explicit team/spawn data; stable custom room configuration; and clear player identity presentation. Accounts are not required.

**Broad scope:** Local four-player hot-seat, mode-specific four-player online rooms, fixed balanced team assignment, alternating team turns, eliminated-player skipping, team victory/draw, team-readable names/colors/indicators, explicit team spawns, four-seat lobby/HUD, enabled friendly fire, individual ammunition, all-player reconnect pause, team forfeit on leave, all-player readiness, and unanimous rematches are implemented and playtested. Remaining work is bandwidth/snapshot observation and a later spectator policy for eliminated players.

**Explicitly out of scope:** Public team matchmaking, clans, ranking, AI substitutes, and assumptions that current 1v1 maps are automatically safe for four players.

**Major risks:** Turn-order edge cases, oversized state patches, confusing camera/HUD, unreadable teams, match abandonment, unfair spawns, long waits between turns, friendly-fire griefing, and combinatorial lifecycle tests.

**Unresolved design decisions:** Current rules establish enabled friendly fire, individual ammunition, fixed even teams, `A1, B1, A2, B2` rotation, team forfeit when a member leaves, and unanimous rematches. Eliminated-player spectator controls and whether a later lobby permits consensual team swapping remain unresolved.

**Completion indicators:** Four clients can complete, reconnect to, forfeit, and rematch a 2v2 game on validated team maps; turns alternate by documented rules and skip eliminated players; victory/draw rules are deterministic; lobby/HUD clearly show teams and active rules; lifecycle decisions are implemented consistently; and measured snapshots remain within an accepted budget.

### 10. 3v3 Expansion

**Status:** Implemented; six-client playtesting and performance observation pending

**Purpose:** Extend stable team play to six friends after four-player behavior and operations are understood.

**Player-facing outcome:** Six players can complete a private team match with readable turns, identities, camera behavior, and lifecycle handling.

**Main systems affected:** Room capacity, team turn scheduler, maps/spawns, camera/HUD, snapshots and bandwidth, server load, reconnect/rematch rules, spectator presentation, and browser/load tests.

**Dependencies:** Completed and observed 2v2; maps sized and validated for six players; performance/bandwidth evidence; and resolved team lifecycle rules.

**Broad scope:** Six-player local and private-online capacity, fixed three-player teams, canonical `A1, B1, A2, B2, A3, B3` spawn distribution, alternating turn pacing, six-player map/editor/HUD/lobby/results presentation, all-player readiness, unanimous rematches, team forfeit on leave, per-player reconnect deadlines, connection indicators, snapshots, and protocol compatibility are implemented. Six-client lifecycle playtesting and measured concurrency/bandwidth observation remain.

**Explicitly out of scope:** More than six active players, battle royale/free-for-all, public queues, tournaments, clans, and redesigning team rules independently from 2v2 without evidence.

**Major risks:** Excessive match length, player downtime, server or bandwidth pressure, six-way reconnect complexity, HUD crowding, and maps too large for readable aiming.

**Unresolved design decisions:** 3v3 currently reuses 2v2's alternating cadence, 20/30/45-second turn options, fixed seats, no substitutions, team forfeit on permanent leave, and unanimous rematches. Whether future six-player rooms need dedicated spectator controls, chat, substitutions, or different pacing remains unresolved.

**Completion indicators:** Six clients can finish the full lifecycle within measured server, bandwidth, and rendering budgets; team turns and victory remain deterministic; supported maps pass six-player spawn/playability checks; and UX testing confirms that active player, team state, and camera context remain clear.

### 11. Stable Custom-Map Format and Validation

**Status:** Later; first custom-map milestone

**Purpose:** Convert proven official-map architecture into a durable, deterministic data contract before building an editor or accepting uploads.

**Player-facing outcome:** Internally authored map files can be imported, validated, previewed, test-played, and rejected with useful errors using the same rules future creators will use.

**Main systems affected:** Versioned map schema, deterministic serialization, registry migration, validators, server admission, complexity budgets, preview/test-play tools, simulation snapshots, and security tests.

**Dependencies:** Advanced map architecture and several official maps that prove the required format. The dependency chain is: advanced map architecture -> stable map format -> validation -> editor -> storage and sharing -> discovery and moderation.

**Broad scope:** Stable versioned data for dimensions, terrain drawing/geometry, materials, special map objects, spawn zones, portals, reflective surfaces, one-way barriers, boundary rules, and presentation metadata; deterministic serialization; import/export; map preview; validation; test-play mode; size and complexity limits; compatibility migration; server-side validation; and explicit prohibition of executable scripts.

**Explicitly out of scope:** Public uploads, ownership, revisions, sharing codes, discovery, ratings, moderation queues, arbitrary code, and promising permanent compatibility with every experimental format.

**Major risks:** Freezing an inadequate schema, denial-of-service maps, nondeterministic ordering, decompression or parser abuse, migration loss, oversized terrain/network payloads, and validators disagreeing with runtime behavior.

**Unresolved design decisions:** Canonical terrain encoding; compression envelope; stable object IDs; forward/backward compatibility policy; maximum dimensions/object counts; thumbnail data; migration support window; and whether import/export files are human-readable.

**Completion indicators:** A documented versioned schema round-trips deterministically; official maps can be represented or deliberately bridged; malformed, oversized, cyclic, unsafe, and unsupported maps are rejected identically on client and server; version fixtures and migrations are tested; and test-play uses the authoritative simulation.

### 12. Visual Map Editor

**Status:** Later

**Purpose:** Let players create valid maps without manually editing data files.

**Player-facing outcome:** A creator can draw, erase, configure, preview, validate, test-play, import, and export a map locally.

**Main systems affected:** Editor UI/canvas, terrain and object tools, map schema, validator, undo/redo, preview, test-play launcher, local file handling, accessibility, and performance limits.

**Dependencies:** Stable custom-map format and shared validation. Storage/accounts are not required for a local-only editor.

**Broad scope:** Terrain drawing and erasing; materials; indestructible areas; special map objects; spawn zones; portals and pair assignment; reflective surfaces; boundary rules; world size; map preview; validation feedback; test-play mode; deterministic serialization; import/export; and visible size/complexity budgets.

**Explicitly out of scope:** Executable scripting, public publishing, cloud saves, discovery, collaboration, arbitrary asset uploads, and bypassing server validation.

**Major risks:** Editor output diverging from runtime data, destructive mistakes, poor touch/keyboard accessibility, invalid portal/spawn configurations, huge files, and UI complexity overwhelming creators.

**Unresolved design decisions:** Desktop-first versus broader input support; undo history limits; terrain brush representation; local draft storage; whether creators can customize presentation assets; and how much validation runs continuously.

**Completion indicators:** A new user can create and test a valid map using every supported material/object; undo/redo and import/export preserve deterministic data; invalid states produce actionable feedback; complexity limits are visible; and exported maps pass independent server validation unchanged.

### 13. Map Storage, Sharing, Discovery, and Moderation

**Status:** Later

**Purpose:** Add accountable ownership and safe distribution after map creation and validation are stable.

**Player-facing outcome:** Registered creators can save revisions, share private or unlisted maps by code/link, optionally publish approved maps, and report unsafe or broken content.

**Main systems affected:** Accounts, database, object storage, map metadata/revisions, publishing workflow, links/codes, server validation/scanning, privacy, reports, moderation tools, discovery UI, backups, and migrations.

**Dependencies:** Optional accounts, database and upload storage, stable map format/validation, editor, social safety policy, moderation capacity, and operational observability.

**Broad scope:** Ownership; revisions; private, unlisted, and public visibility; map codes or links; server-side revalidation; file scanning; compatibility migration; reporting; moderation; takedown/audit flow; quotas; backups; and carefully scoped discovery. Public visibility must wait for adequate moderation; private/unlisted sharing may ship first.

**Explicitly out of scope:** Anonymous ownership, executable scripts, unscanned arbitrary assets, guaranteed support for every historical map version, uncontrolled public uploads, and ranking creators by engagement without deliberate design.

**Major risks:** Malicious or infringing content, moderation overload, storage abuse, broken revisions, map-code enumeration, privacy leaks, migration failures, and public discovery arriving before safety tools.

**Unresolved design decisions:** Quotas; revision retention; map-code permanence; visibility defaults; moderation roles and appeals; licensing/ownership terms; public publishing criteria; discovery ordering; and handling maps whose format version becomes unsupported.

**Completion indicators:** Authenticated creators can save and restore revisions; private/unlisted links enforce visibility; every upload is scanned and server-validated; quotas/backups/migrations are tested; reports reach usable moderation tooling; removal and privacy controls work; and public discovery remains disabled until moderation readiness is explicitly approved.

### 14. Replays and Spectating

**Status:** Later

**Purpose:** Turn deterministic simulation and online projection foundations into understandable viewing features without confusing reconnect snapshots with permanent history.

**Player-facing outcome:** Players can watch recorded matches with playback controls and, where room privacy permits, observe live or completed team play without issuing commands.

**Main systems affected:** Command recording, replay schema/storage, registry versioning, deterministic runner, viewer UI, playback controls, camera, room admission/roles, snapshots/events, bandwidth, privacy settings, and compatibility tests.

**Dependencies:** Stable command semantics and registry-version strategy. Shareable stored replays benefit from accounts/database. Spectating benefits from team lifecycle and larger-map camera work.

**Broad scope:** Record match configuration, map/weapon/registry versions, seed, and authoritative command stream; define a replay file/version; build viewer and playback controls; handle compatibility explicitly; and consider a shareable replay file or code later. No promise is made that every old replay survives every simulation version. Reconnect recovery and transient snapshots are not permanent replay storage.

Spectating includes joining permitted rooms in a spectator role; sending no authoritative commands; receiving snapshots/events; spectator limits; dead-player spectating; team-match use; and privacy controls in room setup. A delayed feed is needed only if cheating becomes relevant.

**Explicitly out of scope:** Treating current snapshots as archival replays, indefinite compatibility promises, spectator chat without social-safety rules, public broadcast infrastructure, and spectator authority over active matches.

**Major risks:** Replay divergence after registry changes, large command histories, seeking cost, hidden nondeterminism, spectator bandwidth, room-capacity abuse, privacy leaks, and information advantages in team play.

**Unresolved design decisions:** Replay retention and storage; checkpoint frequency for seeking; compatibility support window; file versus code sharing; whether private rooms allow spectators by default; spectator delay; and dead-player camera/chat freedoms.

**Completion indicators:** Recorded command streams reproduce verified checksums for supported versions; the viewer provides stable play/pause/speed/seek behavior; unsupported versions fail clearly; share/export behavior does not expose private data; spectators cannot submit game commands; room privacy and limits are enforced; and reconnect continues to use its separate snapshot path.

### 15. Profiles, Statistics, Cosmetics, and Optional Challenges

**Status:** Later

**Purpose:** Add durable self-expression and history without turning the game toward ranked or pay-to-win design.

**Player-facing outcome:** Registered players can view a privacy-controlled profile and statistics, choose owned cosmetic loadouts, and optionally pursue lightweight achievements or private challenges.

**Main systems affected:** Accounts/database, event/stat pipeline, profiles/privacy, cosmetic registries and asset loading, loadout validation, moderation, replay/audit evidence, and challenge definitions.

**Dependencies:** Optional accounts and persistence; stable player/weapon/projectile appearance identifiers; server-authoritative events; privacy controls; and operational migrations/backups.

**Broad scope:** Games played, wins/losses/draws, damage dealt, self-damage, favorite weapon, map history, and team statistics later. Weapon accuracy is included only if it can be measured fairly across rockets, pellets, area damage, and utility weapons. Avoid competitive ranking unless deliberately introduced later.

Cosmetics include original character cosmetics, weapon skins, projectile skins, victory presentation, profile badges, and cosmetic loadouts; IDs and ownership are server-validated and grant no gameplay advantage. Optional later achievements and challenges may cover weapons, private goals, and map exploration; online awards require server validation and should avoid grind-heavy design or dependence on ranked matchmaking.

**Explicitly out of scope:** Gameplay bonuses, purchasable power, copied assets, default public profiles, misleading cross-weapon accuracy, mandatory grinding, and an implicit ranked ladder.

**Major risks:** Incorrect or farmable statistics, privacy violations, entitlement fraud, asset/bundle growth, cosmetic readability harming teams, achievement boosting, and metrics distorting game design.

**Unresolved design decisions:** Which stats are public by default; treatment of guest/local/private custom-rule matches; fair accuracy definitions; cosmetic acquisition model; asset delivery; challenge cadence; and whether statistics can be reset or deleted separately.

**Completion indicators:** Profile visibility obeys privacy settings; server-validated events update documented statistics idempotently; deletion/export policies include profile data; loadouts validate ownership and preserve team readability; cosmetics cannot alter simulation state; and achievements, if shipped, have anti-duplication and authority tests.

### 16. Accessibility, Localization, and Operational Hardening

**Status:** Later as a consolidation milestone; incremental work starts earlier

**Purpose:** Make growth features usable by more players and keep private-room service reliable without premature distributed architecture.

**Player-facing outcome:** The interface remains readable, controllable, translatable, and resilient as maps, teams, accounts, chat, and user content expand.

**Main systems affected:** Design system, input/focus, rendering/effects/audio, string/catalog architecture, layout, database/storage operations, server deployment, logging/metrics, terrain snapshots, registries, and build delivery.

**Dependencies:** None for incremental accessibility fixes. Full localization benefits from stable UI terminology. Database/upload operations depend on the related account and map milestones.

**Broad scope:** Control rebinding; color-blind-safe and color-independent player/team indicators; scalable UI; high-contrast mode; reduced motion; screen-flash controls; complete volume controls; readable fonts; keyboard menu navigation; translated interface; language-independent map and weapon identifiers; and right-to-left layout evaluation if Arabic is supported.

Operational scope includes persistent database hardening, secure account storage, user-uploaded map storage, backups, migrations, observability, error tracking, room metrics, deployment health, abuse rate limits, map-file scanning and validation, room-code resilience, server restart behavior, periodic terrain snapshot compaction, registry-version migration strategy, and bundle-size/lazy-loading improvements. Add Redis only when multi-process coordination becomes necessary, and horizontal scaling only when real usage demands it.

**Explicitly out of scope:** Claiming accessibility from a settings checklist alone, machine-translated releases without review, Redis or microservices without measured need, silent breaking registry migrations, and collecting excessive telemetry.

**Major risks:** Accessibility regressions in custom canvas UI, text expansion breaking layouts, incorrect right-to-left assumptions, lost persistent data, unobservable room failures, upload abuse, stale room codes after restart, migration incompatibility, and growing bundles/assets.

**Unresolved design decisions:** Initial languages and review process; accessibility target/standard; telemetry and retention policy; backup/recovery objectives; when room persistence is desirable; compaction format and cadence; thresholds for Redis/scaling; and supported registry migration window.

**Completion indicators:** Critical flows are keyboard-operable and usable without color alone; motion/flash/audio settings affect all new presentation; representative text expansion and selected translations pass layout review; right-to-left behavior is evaluated before Arabic commitment; backups/restores and migrations are exercised; errors and room health are observable; rate limits cover abuse surfaces; terrain histories compact without state divergence; and scaling changes are justified by measurements.

### 17. Bots and Training Mode

**Status:** Exploratory; later

**Purpose:** Improve offline learning and create legal-command agents that can support simulation testing after game rules stabilize.

**Player-facing outcome:** Players can practice trajectories and weapons against stationary targets before any attempt at a credible bot opponent.

**Main systems affected:** Local match setup, training scenarios, command API, simulation runner, trajectory feedback, bot decision loop, deterministic fixtures, and balance tooling.

**Dependencies:** Stable simulation rules and weapon/map registries. A basic bot follows successful target-practice and training experiments.

**Broad scope:** Stationary target practice first; trajectory and weapon training; constrained scenario feedback; and only later a basic bot that uses the same legal player commands as humans. Bots must not mutate authoritative state directly. Deterministic bots may later help automated balance testing.

**Explicitly out of scope:** Server-side cheating, direct state mutation, replacing disconnected players without a team-product decision, advanced machine learning, a campaign, and promises of competitive AI.

**Major risks:** Misleading trajectory instruction, bots exploiting information unavailable to players, brittle behavior across maps, simulation changes invalidating tuning, and large effort with less value than private-room features.

**Unresolved design decisions:** Training scenario format; amount of aim assistance; whether wind is fixed or variable; bot knowledge limits; deterministic think budgets; and whether bot matches affect future statistics or achievements.

**Completion indicators:** Training scenarios cover core weapon behavior with clear reset/feedback; any bot issues only validated commands, receives no privileged state beyond its documented rules, behaves deterministically when required, and cannot bypass turn/physics authority; broader bot work proceeds only after player testing shows value.

### 18. Public Matchmaking

**Status:** Deferred

**Purpose:** Record a possible future direction without allowing it to drive current architecture or priorities.

**Player-facing outcome:** None planned in the near term. Private rooms, room codes, and invite links remain the primary online experience.

**Main systems affected:** If reconsidered: identity, moderation, queues, regional capacity, skill/rule matching, anti-abuse, sanctions, metrics, and operations.

**Dependencies:** A stable player base, proven service capacity, accounts where needed, mature moderation/social safety, abuse controls, and an explicit owner decision to reprioritize it.

**Broad scope:** Deliberately undefined until reconsideration. Do not design every system around hypothetical ranked matchmaking.

**Explicitly out of scope:** Near-term public queues, ranked ladders, competitive seasons, queue-driven rule restrictions, and delaying private-room value for speculative scale.

**Major risks:** Moderation burden, low-population queues, ranking toxicity, regional fragmentation, infrastructure cost, cheating incentives, and loss of the configurable private-play focus.

**Unresolved design decisions:** Whether public matchmaking should ever exist; casual versus ranked scope; identity requirements; region/rules/skill model; moderation staffing; and minimum sustainable player population.

**Completion indicators:** This milestone remains deferred until the owner explicitly changes its status after the dependencies are demonstrably met. Research or generic abstractions alone do not mark it started.

## Dependency Map

```text
advanced map architecture
  -> mechanically distinct official maps
  -> stable map data format
  -> validation
  -> custom map editor
  -> map storage and sharing
  -> discovery and moderation

optional accounts
  -> persistent profiles
  -> cloud customization and preferences
  -> identity-backed chat controls
  -> uploaded-map ownership and reports
  -> reliable statistics, cosmetics, and social relationships

larger maps and camera system
  -> team-compatible maps and spawn zones
  -> 2v2
  -> 3v3
  -> broader live and dead-player spectating requirements

deterministic command history
  -> internal replay tooling
  -> versioned recording and compatibility
  -> replay viewer
  -> replay sharing

custom room configuration
  -> team settings
  -> map rule configuration
  -> local and cloud-saved presets

social safety policy
  -> private-room chat
  -> identity-backed block/report
  -> public user-created map moderation
```

Dependencies guide sequencing but do not require shipping an entire chain at once. For example, local control rebinding does not wait for accounts, a local map editor does not wait for cloud storage, and private/unlisted map sharing may precede public discovery.

## Suggested Immediate Next Options

Choose one option; do not combine all three into one implementation task.

### Option A - Personalization and Controls

**Scope:** Control rebinding, remembered aim, local player appearance customization, visual weapon models, and visual projectile models. This can be split into a controls/aim sub-milestone and a presentation sub-milestone.

**Immediate player value:** High. Every local and online match becomes easier to control, more personal, and more readable.

**Architectural cost:** Moderate. It extends preferences, input mapping, and presentation while leaving authoritative gameplay rules mostly unchanged.

**Risk level:** Low to moderate if delivered in small slices; main risks are preference migration, input conflicts, and presentation/reconnect state.

**Unlocks later:** Cloud-synced preferences, cosmetic loadouts, stronger identity readability for teams, and a reusable visual asset pipeline.

### Option B - Advanced Map Foundation

**Scope:** Variable world dimensions, camera system, map materials, reflective surfaces, wraparound projectile boundaries, portals, indestructible terrain, and new official maps using those mechanics. Deliver this as the bounded 4A-4D sub-milestones rather than one implementation task.

**Immediate player value:** Medium at the foundation stage and high once official maps use it.

**Architectural cost:** High. It touches simulation collision, map representation, rendering, camera/input transforms, snapshots, protocol versions, and performance assumptions.

**Risk level:** High because deterministic mechanics and camera transforms affect the authority boundary and nearly every gameplay test.

**Unlocks later:** Genuinely distinct and larger maps, team-compatible arenas, a stable custom-map format, the editor, and user-created map sharing.

### Option C - Accounts Foundation

**Scope:** Optional authentication, database, profiles, cloud preference synchronization, and persistent customization while retaining guest private-room entry.

**Immediate player value:** Moderate at the current scale; strongest for players using multiple devices or wanting durable identity.

**Architectural cost:** High. It introduces security, privacy, database migrations/backups, session management, deployment secrets, and account/guest reconciliation.

**Risk level:** High because identity and data lifecycle errors have lasting security and privacy consequences.

**Unlocks later:** Persistent profiles/statistics, cloud customization, identity-backed block/report, social relationships, cosmetic ownership, uploaded-map ownership, and reliable moderation records.

**Recommendation:** Option A appears most sensible from the current codebase. It builds directly on working preferences and procedural presentation, gives visible value without changing authoritative outcomes, improves future team readability, and has fewer irreversible decisions than map-format or account foundations. The project owner decides; Option B is the stronger choice if user-created maps and team-scale arenas are the immediate strategic priority, while Option C is appropriate only when durable identity is worth the operational commitment.

## Roadmap Maintenance Rules

- Read `ROADMAP.md` before proposing or starting a major milestone.
- Verify active code and relevant tests before marking any feature completed; scaffolding, comments, old plans, or internal helpers are not completion.
- Update milestone status and completion indicators after work is actually completed.
- Add links to relevant architecture documents, decisions, protocols, or migration notes as they are created.
- Record changed dependencies, unresolved-decision outcomes, and explicit product decisions in the affected milestone.
- Do not silently reprioritize Deferred or Exploratory features.
- Do not implement the entire roadmap in one task. Propose one coherent next milestone or sub-milestone at a time.
- Preserve the private-room-first direction unless the project owner explicitly changes it.
- Preserve local play unless an explicit product decision accepts a regression.
- Keep implemented-state claims concise and evidence-based; move implementation detail to focused architecture documentation.
- Review the roadmap for duplicate or contradictory scope whenever milestones are split, merged, reordered, or completed.
