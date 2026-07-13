import { z } from 'zod'
import { MAP_ORDER, MAP_REGISTRY_VERSION, type MapId } from '../maps/registry'
import { TURN_DURATIONS, type TurnDuration } from '../match/config'
import { POWER_MAX_PERCENT, POWER_MIN_PERCENT, GAME_HEIGHT, GAME_WIDTH } from '../shared/constants'
import type { MatchCommandInput, CommandRejection } from '../simulation/match/MatchCommand'
import type { MatchEvent, SimulationMatchResult } from '../simulation/match/MatchEvent'
import type { SerializedMatchState } from '../simulation/match/MatchState'
import { WEAPON_ORDER, WEAPON_REGISTRY_VERSION } from '../weapons/registry'

export const PRIVATE_MATCH_ROOM = 'private_match'
export const PROTOCOL_VERSION = 'private-room-1'
export const SIMULATION_SNAPSHOT_VERSION = 1
export const CLIENT_BUILD_VERSION = '0.5.0'
export const ROOM_CODE_LENGTH = 6
export const ROOM_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/
export const NETWORK_MESSAGE_TYPE = 'room'
export const MAX_NETWORK_MESSAGE_BYTES = 2048

export type CompatibilityVersions = {
  protocol: string
  snapshot: number
  maps: string
  weapons: string
  build: string
}

export const CURRENT_COMPATIBILITY: CompatibilityVersions = {
  protocol: PROTOCOL_VERSION,
  snapshot: SIMULATION_SNAPSHOT_VERSION,
  maps: MAP_REGISTRY_VERSION,
  weapons: WEAPON_REGISTRY_VERSION,
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
  | { type: 'simulation-events'; fromSequence: number; events: MatchEvent[] }
  | FullSnapshotMessage
  | { type: 'match-result'; result: SimulationMatchResult; reason: 'normal' | 'forfeit' }
  | { type: 'room-error'; code: string; message: string }

export type CreateRoomOptions = {
  playerName: string
  mapId: MapId
  turnDurationSeconds: TurnDuration
  compatibility: CompatibilityVersions
}

export type JoinRoomOptions = {
  playerName: string
  compatibility: CompatibilityVersions
}

const compatibilitySchema = z
  .object({
    protocol: z.string().max(40),
    snapshot: z.number().int().nonnegative(),
    maps: z.string().max(40),
    weapons: z.string().max(40),
    build: z.string().max(40),
  })
  .strict()

export const createRoomOptionsSchema = z
  .object({
    playerName: z.string().max(64),
    mapId: z.enum(MAP_ORDER as [MapId, ...MapId[]]),
    turnDurationSeconds: z.union(TURN_DURATIONS.map((value) => z.literal(value))),
    compatibility: compatibilitySchema,
  })
  .strict()

export const joinRoomOptionsSchema = z
  .object({
    playerName: z.string().max(64),
    compatibility: compatibilitySchema,
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
      type: z.literal('fire'),
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
      type: z.literal('teleport'),
      destination: vectorSchema.refine(
        (value) => value.x >= 0 && value.x <= GAME_WIDTH && value.y >= 0 && value.y <= GAME_HEIGHT,
        { message: 'Teleport target is outside the map' },
      ),
    })
    .strict(),
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
  if (value.build !== CURRENT_COMPATIBILITY.build) return 'Client build version does not match.'
  return null
}
