import type {
  PlayerAccessoryId,
  PlayerAppearance,
  PlayerBodyId,
  PlayerFaceId,
  PlayerPatternId,
} from './appearanceRegistry'

export type PlayerVisualRole = 'primary' | 'accent' | 'ink' | 'face' | 'shine'
export type PlayerVisualPoint = Readonly<{ x: number; y: number }>
export type PlayerPathCommand =
  | Readonly<{ kind: 'move' | 'line'; x: number; y: number }>
  | Readonly<{ kind: 'curve'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }>
  | Readonly<{ kind: 'close' }>
type PrimitiveBase = Readonly<{ fill?: PlayerVisualRole; stroke?: PlayerVisualRole; strokeWidth?: number }>
export type PlayerVisualPrimitive = PrimitiveBase &
  (
    | Readonly<{ kind: 'path'; commands: readonly PlayerPathCommand[] }>
    | Readonly<{ kind: 'circle'; cx: number; cy: number; radius: number }>
    | Readonly<{ kind: 'ellipse'; cx: number; cy: number; radiusX: number; radiusY: number }>
  )
export type PlayerVisualRecipe = Readonly<{
  viewBox: Readonly<{ width: 128; height: 120 }>
  body: PlayerVisualPrimitive
  pattern: readonly PlayerVisualPrimitive[]
  details: readonly PlayerVisualPrimitive[]
}>

const M = (x: number, y: number): PlayerPathCommand => ({ kind: 'move', x, y })
const L = (x: number, y: number): PlayerPathCommand => ({ kind: 'line', x, y })
const C = (x1: number, y1: number, x2: number, y2: number, x: number, y: number): PlayerPathCommand =>
  ({ kind: 'curve', x1, y1, x2, y2, x, y })
const Z: PlayerPathCommand = { kind: 'close' }
const path = (commands: readonly PlayerPathCommand[], fill?: PlayerVisualRole, stroke?: PlayerVisualRole, strokeWidth?: number): PlayerVisualPrimitive =>
  ({ kind: 'path', commands, fill, stroke, strokeWidth })
const circle = (cx: number, cy: number, radius: number, fill?: PlayerVisualRole, stroke?: PlayerVisualRole, strokeWidth?: number): PlayerVisualPrimitive =>
  ({ kind: 'circle', cx, cy, radius, fill, stroke, strokeWidth })
const ellipse = (cx: number, cy: number, radiusX: number, radiusY: number, fill?: PlayerVisualRole, stroke?: PlayerVisualRole, strokeWidth?: number): PlayerVisualPrimitive =>
  ({ kind: 'ellipse', cx, cy, radiusX, radiusY, fill, stroke, strokeWidth })

const BODIES: Record<PlayerBodyId, PlayerVisualPrimitive> = {
  classic: path([M(28, 66), C(28, 39, 43, 15, 64, 15), C(85, 15, 100, 39, 100, 66), C(100, 91, 87, 103, 64, 103), C(41, 103, 28, 91, 28, 66), Z], 'primary', 'ink', 3),
  round: path([M(24, 58), C(24, 31, 40, 18, 64, 18), C(88, 18, 104, 31, 104, 58), C(104, 87, 89, 101, 64, 101), C(39, 101, 24, 87, 24, 58), Z], 'primary', 'ink', 3),
  tall: path([M(32, 66), C(32, 34, 43, 10, 64, 10), C(85, 10, 96, 34, 96, 66), C(96, 91, 85, 103, 64, 103), C(43, 103, 32, 91, 32, 66), Z], 'primary', 'ink', 3),
  scrambled: path([M(22, 63), C(26, 50, 24, 38, 35, 29), C(44, 21, 55, 25, 64, 17), C(74, 25, 85, 21, 94, 30), C(104, 40, 99, 53, 106, 65), C(98, 75, 98, 90, 82, 96), C(69, 101, 59, 92, 46, 96), C(32, 89, 31, 74, 22, 63), Z], 'primary', 'ink', 3),
}

const PATTERNS: Record<PlayerPatternId, readonly PlayerVisualPrimitive[]> = {
  solid: [],
  spots: [circle(45, 43, 5, 'accent'), circle(79, 38, 4, 'accent'), circle(39, 75, 4, 'accent'), circle(83, 78, 6, 'accent')],
  stripes: [0, 18, 36].map((offset) => path([M(39 + offset, 31), C(47 + offset, 48, 49 + offset, 71, 43 + offset, 89)], undefined, 'accent', 7)),
  split: [path([M(64, 16), L(95, 30), L(99, 83), L(83, 99), L(64, 102), Z], 'accent')],
  zigzag: [path([M(34, 43), L(45, 53), L(56, 43), L(67, 53), L(78, 43), L(93, 54)], undefined, 'accent', 5), path([M(31, 72), L(43, 82), L(55, 72), L(67, 82), L(79, 72), L(96, 82)], undefined, 'accent', 5)],
  speckled: [circle(42, 38, 2.2, 'accent'), circle(75, 31, 1.6, 'accent'), circle(88, 54, 2, 'accent'), circle(37, 68, 1.5, 'accent'), circle(59, 84, 2.2, 'accent'), circle(83, 80, 1.5, 'accent')],
}

const EYES = (kind: PlayerFaceId): readonly PlayerVisualPrimitive[] => {
  if (kind === 'sleepy') return [path([M(45, 57), C(48, 59, 52, 59, 55, 57)], undefined, 'ink', 2.5), path([M(73, 57), C(76, 59, 80, 59, 83, 57)], undefined, 'ink', 2.5)]
  if (kind === 'determined') return [path([M(44, 52), L(55, 57)], undefined, 'ink', 2.5), path([M(73, 57), L(84, 52)], undefined, 'ink', 2.5), circle(51, 59, 2.3, 'ink'), circle(77, 59, 2.3, 'ink')]
  return [circle(50, 57, kind === 'grin' ? 3.5 : 3, 'ink'), circle(78, 57, kind === 'grin' ? 3.5 : 3, 'ink')]
}
const MOUTHS: Record<PlayerFaceId, PlayerVisualPrimitive> = {
  smile: path([M(53, 71), C(59, 80, 69, 80, 75, 71)], undefined, 'ink', 2.5),
  grin: path([M(52, 70), C(58, 82, 70, 82, 76, 70), C(69, 74, 59, 74, 52, 70), Z], 'face', 'ink', 2),
  determined: path([M(54, 74), C(61, 70, 68, 70, 74, 74)], undefined, 'ink', 2.5),
  surprised: circle(64, 75, 6, undefined, 'ink', 2.5),
  sleepy: path([M(55, 73), C(61, 76, 67, 76, 73, 73)], undefined, 'ink', 2.5),
  mischief: path([M(53, 72), C(62, 79, 70, 74, 75, 69)], undefined, 'ink', 2.5),
  stoic: path([M(55, 75), L(73, 75)], undefined, 'ink', 2.5),
  cheery: path([M(51, 69), C(58, 84, 71, 84, 77, 69)], 'accent', 'ink', 2),
}

const ACCESSORIES: Record<PlayerAccessoryId, readonly PlayerVisualPrimitive[]> = {
  none: [],
  cap: [path([M(37, 31), C(50, 10, 75, 12, 88, 31), L(88, 39), L(38, 39), Z], 'accent', 'ink', 3), path([M(77, 37), C(88, 36, 97, 38, 102, 40), C(95, 45, 85, 45, 77, 43), Z], 'accent', 'ink', 2.5)],
  crown: [path([M(40, 31), L(45, 10), L(59, 23), L(67, 6), L(77, 23), L(91, 10), L(87, 35), Z], 'accent', 'ink', 3)],
  headband: [path([M(32, 37), C(51, 29, 77, 29, 96, 37), L(96, 46), C(76, 39, 52, 39, 32, 46), Z], 'accent', 'ink', 2.5)],
  glasses: [circle(50, 58, 10, undefined, 'accent', 3), circle(78, 58, 10, undefined, 'accent', 3), path([M(60, 58), L(68, 58)], undefined, 'accent', 3)],
  eyepatch: [path([M(34, 43), L(83, 61)], undefined, 'ink', 2.5), circle(77, 58, 9, 'accent', 'ink', 2)],
  bow: [path([M(37, 31), L(18, 20), L(20, 44), Z], 'accent', 'ink', 2.5), path([M(37, 31), L(57, 19), L(55, 44), Z], 'accent', 'ink', 2.5), circle(37, 31, 4, 'accent', 'ink', 2)],
  mohawk: [path([M(44, 25), L(52, 6), L(61, 21), L(69, 2), L(76, 22), L(86, 9), L(88, 33), Z], 'accent', 'ink', 3)],
}

export function getPlayerVisualRecipe(appearance: Readonly<PlayerAppearance>): PlayerVisualRecipe {
  return {
    viewBox: { width: 128, height: 120 },
    body: BODIES[appearance.body],
    pattern: PATTERNS[appearance.pattern],
    details: [
      path([M(43, 33), C(49, 26, 58, 23, 65, 24)], undefined, 'shine', 4),
      ...EYES(appearance.face),
      MOUTHS[appearance.face],
      ...ACCESSORIES[appearance.accessory],
    ],
  }
}

export function playerPathData(commands: readonly PlayerPathCommand[]): string {
  return commands.map((command) => command.kind === 'close' ? 'Z' : command.kind === 'curve' ? `C${command.x1} ${command.y1} ${command.x2} ${command.y2} ${command.x} ${command.y}` : `${command.kind === 'move' ? 'M' : 'L'}${command.x} ${command.y}`).join(' ')
}
