import type { MapId } from '../maps/registry'
import type { RoomPhase } from './protocol'

export type OnlinePlayerView = {
  playerId: string
  sessionId: string
  seat: 0 | 1
  name: string
  connected: boolean
  ready: boolean
  wantsRematch: boolean
  x: number
  y: number
  health: number
}

export type OnlineRoomResultView = {
  available: boolean
  winnerSeat: number
  reason: string
  remainingHealth: number
  turnsTaken: number
  durationSeconds: number
}

export type OnlineRoomView = {
  roomCode: string
  phase: RoomPhase
  mapId: MapId
  turnDurationSeconds: 20 | 30 | 45
  countdownRemainingMs: number
  reconnectRemainingMs: number
  matchGeneration: number
  simulationTick: number
  turnNumber: number
  activePlayerSeat: number
  wind: number
  eventSequence: number
  terrainSequence: number
  projectileCount: number
  protocolVersion: string
  mapRegistryVersion: string
  weaponRegistryVersion: string
  players: OnlinePlayerView[]
  result: OnlineRoomResultView
}

type SchemaMap<T> = { values(): IterableIterator<T> }

type RawRoomState = Omit<OnlineRoomView, 'players' | 'result' | 'projectileCount'> & {
  players: SchemaMap<OnlinePlayerView>
  projectiles: SchemaMap<unknown>
  result: OnlineRoomResultView
}

export function roomViewFromSchema(state: RawRoomState): OnlineRoomView {
  return {
    roomCode: state.roomCode,
    phase: state.phase,
    mapId: state.mapId,
    turnDurationSeconds: state.turnDurationSeconds,
    countdownRemainingMs: state.countdownRemainingMs,
    reconnectRemainingMs: state.reconnectRemainingMs,
    matchGeneration: state.matchGeneration,
    simulationTick: state.simulationTick,
    turnNumber: state.turnNumber,
    activePlayerSeat: state.activePlayerSeat,
    wind: state.wind,
    eventSequence: state.eventSequence,
    terrainSequence: state.terrainSequence,
    projectileCount: [...state.projectiles.values()].length,
    protocolVersion: state.protocolVersion,
    mapRegistryVersion: state.mapRegistryVersion,
    weaponRegistryVersion: state.weaponRegistryVersion,
    players: [...state.players.values()]
      .map((player) => ({
        playerId: player.playerId,
        sessionId: player.sessionId,
        seat: player.seat,
        name: player.name,
        connected: player.connected,
        ready: player.ready,
        wantsRematch: player.wantsRematch,
        x: 'x' in player ? Number(player.x) : 0,
        y: 'y' in player ? Number(player.y) : 0,
        health: 'health' in player ? Number(player.health) : 100,
      }))
      .sort((left, right) => left.seat - right.seat),
    result: {
      available: state.result.available,
      winnerSeat: state.result.winnerSeat,
      reason: state.result.reason,
      remainingHealth: state.result.remainingHealth,
      turnsTaken: state.result.turnsTaken,
      durationSeconds: state.result.durationSeconds,
    },
  }
}
