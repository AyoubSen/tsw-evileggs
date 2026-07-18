import { z } from 'zod'
import {
  MAP_REGISTRY_VERSION,
  getMap,
  mapIdsForMode,
  type MapId,
  type MatchMode,
} from '../maps/registry'
import { TURN_DURATIONS, type LocalMatchConfig, type TurnDuration } from '../match/config'
import { MAX_WORLD_COORDINATE, POWER_MAX_PERCENT, POWER_MIN_PERCENT } from '../shared/constants'
import type { MatchCommandInput, CommandRejection } from '../simulation/match/MatchCommand'
import type { MatchEvent, SimulationMatchResult } from '../simulation/match/MatchEvent'
import type { SerializedMatchState } from '../simulation/match/MatchState'
import { SIMULATION_SNAPSHOT_VERSION } from '../simulation/match/MatchState'
import { WEAPON_ORDER, WEAPON_REGISTRY_VERSION } from '../weapons/registry'
import {
  PLAYER_ACCESSORIES,
  PLAYER_ACCENT_COLORS,
  PLAYER_APPEARANCE_REGISTRY_VERSION,
  PLAYER_BODIES,
  PLAYER_FACES,
  PLAYER_PATTERNS,
  PLAYER_PRIMARY_COLORS,
  PLAYER_VICTORY_STYLES,
  type PlayerAppearance,
} from '../players/appearanceRegistry'
import { APP_VERSION } from '../version'
import type { ArsenalRules } from '../match/arsenal'

export const PRIVATE_MATCH_ROOM = 'private_match'
export const PROTOCOL_VERSION = 'private-room-16'
export { SIMULATION_SNAPSHOT_VERSION }
export const CLIENT_BUILD_VERSION = APP_VERSION
export const ROOM_CODE_LENGTH = 6
export const ROOM_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/
export const NETWORK_MESSAGE_TYPE = 'room'
export const MAX_NETWORK_MESSAGE_BYTES = 2048

export type CompatibilityVersions = {
  protocol: string
  snapshot: number
  maps: string
  weapons: string
  appearances: string
  build: string
}

export const CURRENT_COMPATIBILITY: CompatibilityVersions = {
  protocol: PROTOCOL_VERSION,
  snapshot: SIMULATION_SNAPSHOT_VERSION,
  maps: MAP_REGISTRY_VERSION,
  weapons: WEAPON_REGISTRY_VERSION,
  appearances: PLAYER_APPEARANCE_REGISTRY_VERSION,
  build: CLIENT_BUILD_VERSION,
}

export type RoomPhase = 'waiting' | 'starting' | 'playing' | 'reconnecting' | 'results' | 'disposed'

export type ClientMatchCommand = MatchCommandInput

export type ClientRoomMessage =
  | { type: 'set-ready'; ready: boolean }
  | {
      type: 'command'
      commandId: number
      expectedTurn: number
      matchGeneration: number
      command: ClientMatchCommand
    }
  | {
      type: 'request-snapshot'
      lastKnownTick: number
      lastEventSequence: number
      lastTerrainSequence: number
    }
  | { type: 'rematch-vote'; wantsRematch: boolean }
  | { type: 'latency-ping'; nonce: number }

export type NetworkCommandRejection =
  | CommandRejection
  | 'duplicate-command'
  | 'future-turn'
  | 'wrong-match'
  | 'rate-limited'
  | 'malformed-message'

export type FullSnapshotMessage = {
  type: 'full-snapshot'
  snapshot: SerializedMatchState
  checksum: string
  lastEventSequence: number
  lastTerrainSequence: number
  matchGeneration: number
}

export type ServerRoomMessage =
  | {
      type: 'command-result'
      commandId: number
      accepted: boolean
      reason?: NetworkCommandRejection
      authoritativeTick: number
      matchGeneration: number
    }
  | {
      type: 'simulation-events'
      matchGeneration: number
      fromSequence: number
      events: MatchEvent[]
    }
  | FullSnapshotMessage
  | {
      type: 'match-result'
      matchGeneration: number
      result: SimulationMatchResult
      reason: 'normal' | 'forfeit'
    }
  | { type: 'room-error'; code: string; message: string }
  | { type: 'latency-pong'; nonce: number }

export type CreateRoomOptions = {
  playerName: string
  mode: Extract<MatchMode, '1v1' | '2v2' | '3v3'>
  mapId: MapId
  projectileBoundaryMode: LocalMatchConfig['projectileBoundaryMode']
  turnDurationSeconds: TurnDuration
  arsenal: ArsenalRules
  compatibility: CompatibilityVersions
  playerAppearance: PlayerAppearance
  gameTicket: string
}

export type JoinRoomOptions = {
  playerName: string
  compatibility: CompatibilityVersions
  playerAppearance: PlayerAppearance
  gameTicket?: string
}

const ONLINE_MAP_ORDER = [
  ...mapIdsForMode('1v1'),
  ...mapIdsForMode('2v2'),
  ...mapIdsForMode('3v3'),
] as [MapId, ...MapId[]]

const ONLINE_PROJECTILE_BOUNDARY_MODES = new Set(
  ONLINE_MAP_ORDER.flatMap((mapId) => getMap(mapId).projectileBoundary.supportedModes),
)

const compatibilitySchema = z
  .object({
    protocol: z.string().max(40),
    snapshot: z.number().int().nonnegative(),
    maps: z.string().max(40),
    weapons: z.string().max(40),
    appearances: z.string().max(40),
    build: z.string().max(40),
  })
  .strict()

const playerAppearanceSchema = z
  .object({
    version: z.literal(2),
    body: z.enum(PLAYER_BODIES.map(({ id }) => id)),
    primaryColor: z.enum(PLAYER_PRIMARY_COLORS.map(({ id }) => id)),
    accentColor: z.enum(PLAYER_ACCENT_COLORS.map(({ id }) => id)),
    pattern: z.enum(PLAYER_PATTERNS.map(({ id }) => id)),
    face: z.enum(PLAYER_FACES.map(({ id }) => id)),
    victoryStyle: z.enum(PLAYER_VICTORY_STYLES.map(({ id }) => id)),
    accessory: z.enum(PLAYER_ACCESSORIES.map(({ id }) => id)),
  })
  .strict()

const gameTicketSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
const ammunitionValueSchema = z.union([z.literal('unlimited'), z.number().int().min(0).max(99)])
const arsenalSchema = z
  .object({
    presetId: z.enum(['standard', 'classic', 'chaos', 'custom']),
    ammunition: z.object(
      Object.fromEntries(WEAPON_ORDER.map((id) => [id, ammunitionValueSchema])) as Record<
        (typeof WEAPON_ORDER)[number],
        typeof ammunitionValueSchema
      >,
    ).strict(),
  })
  .strict()
  .refine((value) => WEAPON_ORDER.some((id) => value.ammunition[id] === 'unlimited'), {
    message: 'At least one weapon must have unlimited ammunition.',
    path: ['ammunition'],
  })

export const createRoomOptionsSchema = z
  .object({
    playerName: z.string().max(64),
    mode: z.enum(['1v1', '2v2', '3v3']),
    mapId: z.enum(ONLINE_MAP_ORDER),
    projectileBoundaryMode: z.string().refine(
      (value): value is LocalMatchConfig['projectileBoundaryMode'] =>
        ONLINE_PROJECTILE_BOUNDARY_MODES.has(value as LocalMatchConfig['projectileBoundaryMode']),
      { message: 'Projectile boundary mode is not recognized.' },
    ),
    turnDurationSeconds: z.union(TURN_DURATIONS.map((value) => z.literal(value))),
    arsenal: arsenalSchema,
    compatibility: compatibilitySchema,
    playerAppearance: playerAppearanceSchema,
    gameTicket: gameTicketSchema,
  })
  .strict()
  .refine((value) => getMap(value.mapId).mode === value.mode, {
    message: 'Selected map does not support the requested room mode.',
    path: ['mapId'],
  })
  .refine(
    (value) =>
      getMap(value.mapId).projectileBoundary.supportedModes.includes(value.projectileBoundaryMode),
    {
      message: 'Selected map does not support the requested projectile boundary mode.',
      path: ['projectileBoundaryMode'],
    },
  )

export const joinRoomOptionsSchema = z
  .object({
    playerName: z.string().max(64),
    compatibility: compatibilitySchema,
    playerAppearance: playerAppearanceSchema,
    gameTicket: gameTicketSchema.optional(),
  })
  .strict()

const vectorSchema = z.object({ x: z.number().finite(), y: z.number().finite() }).strict()

const matchCommandSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('move'),
      direction: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
      pressed: z.boolean(),
    })
    .strict(),
  z.object({ type: z.literal('jump') }).strict(),
  z.object({ type: z.literal('select-weapon'), weaponId: z.enum(WEAPON_ORDER) }).strict(),
  z
    .object({
      type: z.literal('activate-weapon'),
      activation: z.discriminatedUnion('kind', [
        z
          .object({
            kind: z.literal('directional'),
            aimDirection: vectorSchema.refine(
              (value) => {
                const magnitude = Math.hypot(value.x, value.y)
                return magnitude >= 0.999 && magnitude <= 1.001
              },
              { message: 'Aim direction must be normalized' },
            ),
            power: z.number().finite().min(POWER_MIN_PERCENT).max(POWER_MAX_PERCENT),
          })
          .strict(),
        z
          .object({
            kind: z.literal('target-position'),
            target: vectorSchema.refine(
              (value) =>
                value.x >= 0 &&
                value.x <= MAX_WORLD_COORDINATE &&
                value.y >= 0 &&
                value.y <= MAX_WORLD_COORDINATE,
              { message: 'Weapon target is outside the map' },
            ),
          })
          .strict(),
      ]),
    })
    .strict(),
  z.object({ type: z.literal('trigger-weapon') }).strict(),
])

export const clientRoomMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set-ready'), ready: z.boolean() }).strict(),
  z
    .object({
      type: z.literal('command'),
      commandId: z.number().int().safe().positive(),
      expectedTurn: z.number().int().safe().positive(),
      matchGeneration: z.number().int().safe().positive(),
      command: matchCommandSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('request-snapshot'),
      lastKnownTick: z.number().int().safe().nonnegative(),
      lastEventSequence: z.number().int().safe().nonnegative(),
      lastTerrainSequence: z.number().int().safe().nonnegative(),
    })
    .strict(),
  z.object({ type: z.literal('rematch-vote'), wantsRematch: z.boolean() }).strict(),
  z
    .object({ type: z.literal('latency-ping'), nonce: z.number().int().safe().nonnegative() })
    .strict(),
])

export function normalizeRoomCode(value: string): string {
  return value.toUpperCase().replace(/\s+/g, '').slice(0, ROOM_CODE_LENGTH)
}

export function isRoomCode(value: string): boolean {
  return ROOM_CODE_PATTERN.test(normalizeRoomCode(value))
}

export function compatibilityError(value: CompatibilityVersions): string | null {
  if (value.protocol !== CURRENT_COMPATIBILITY.protocol) return 'Protocol version does not match.'
  if (value.snapshot !== CURRENT_COMPATIBILITY.snapshot)
    return 'Simulation snapshot version does not match.'
  if (value.maps !== CURRENT_COMPATIBILITY.maps) return 'Map registry version does not match.'
  if (value.weapons !== CURRENT_COMPATIBILITY.weapons)
    return 'Weapon registry version does not match.'
  if (value.appearances !== CURRENT_COMPATIBILITY.appearances)
    return 'Player appearance registry version does not match.'
  if (value.build !== CURRENT_COMPATIBILITY.build) return 'Client build version does not match.'
  return null
}
