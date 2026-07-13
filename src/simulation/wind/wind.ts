export const WIND_MAX_ACCELERATION = 45
export const WIND_STEP = 5

function mix32(value: number): number {
  value ^= value >>> 16
  value = Math.imul(value, 0x7feb352d)
  value ^= value >>> 15
  value = Math.imul(value, 0x846ca68b)
  value ^= value >>> 16
  return value >>> 0
}

function rawWindForTurn(seed: number, turnNumber: number): number {
  const sample = mix32(((seed >>> 0) + Math.imul(Math.max(1, turnNumber), 0x9e3779b9)) >>> 0)
  const slots = (WIND_MAX_ACCELERATION * 2) / WIND_STEP + 1
  return (sample % slots) * WIND_STEP - WIND_MAX_ACCELERATION
}

/** A pure turn-indexed value avoids mutable PRNG state during snapshots and replay. */
export function windForTurn(seed: number, turnNumber: number): number {
  let previous = rawWindForTurn(seed, 1)
  for (let turn = 2; turn <= Math.max(1, turnNumber); turn += 1) {
    const sampled = rawWindForTurn(seed, turn)
    previous =
      sampled === previous
        ? sampled >= WIND_MAX_ACCELERATION
          ? -WIND_MAX_ACCELERATION
          : sampled + WIND_STEP
        : sampled
  }
  return previous
}
