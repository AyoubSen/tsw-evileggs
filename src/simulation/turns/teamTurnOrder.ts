import type { TeamId } from '../../maps/registry'

export type TurnOrderPlayer = Readonly<{
  teamId: TeamId
  alive: boolean
}>

export type TeamTurnCursors = readonly [number, number]

export type ScheduledTurn = Readonly<{
  playerIndex: number
  cursors: [number, number]
}>

export function nextScheduledTurn(
  players: readonly TurnOrderPlayer[],
  activePlayerIndex: number,
  cursors: TeamTurnCursors,
): ScheduledTurn | null {
  const activePlayer = players[activePlayerIndex]
  if (!activePlayer) return null
  const targetTeam = (activePlayer.teamId === 0 ? 1 : 0) as TeamId
  const teamPlayerIndices = players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => player.teamId === targetTeam)
    .map(({ index }) => index)
  if (teamPlayerIndices.length === 0) return null
  const start = cursors[targetTeam] % teamPlayerIndices.length
  for (let offset = 0; offset < teamPlayerIndices.length; offset += 1) {
    const teamCursor = (start + offset) % teamPlayerIndices.length
    const playerIndex = teamPlayerIndices[teamCursor]
    if (!players[playerIndex].alive) continue
    const nextCursors: [number, number] = [cursors[0], cursors[1]]
    nextCursors[targetTeam] = (teamCursor + 1) % teamPlayerIndices.length
    return { playerIndex, cursors: nextCursors }
  }
  return null
}

export function upcomingTurnIndices(
  players: readonly TurnOrderPlayer[],
  activePlayerIndex: number,
  cursors: TeamTurnCursors,
  count: number,
): number[] {
  if (!players[activePlayerIndex] || count <= 0) return []
  const result = [activePlayerIndex]
  let currentIndex = activePlayerIndex
  let currentCursors: TeamTurnCursors = cursors
  while (result.length < count) {
    const next = nextScheduledTurn(players, currentIndex, currentCursors)
    if (!next) break
    result.push(next.playerIndex)
    currentIndex = next.playerIndex
    currentCursors = next.cursors
  }
  return result
}
