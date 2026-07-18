import type {
  PlayerAccessoryId,
  PlayerAppearance,
  PlayerBodyId,
  PlayerFaceId,
  PlayerPatternId,
  PlayerVictoryStyleId,
} from './appearanceRegistry'
import { PLAYER_ACCESSORIES, PLAYER_BODIES } from './appearanceRegistry'
import type { PoseKind } from '../game/weaponVisualRecipes'
import type { WeaponId } from '../weapons/registry'
import { getWeaponVisual } from '../game/weaponVisualRecipes'

export type PlayerVisualRole = 'primary' | 'accent' | 'ink' | 'face' | 'shine'
export type PlayerVisualPoint = Readonly<{ x: number; y: number }>
export type PlayerPoseId = 'idle' | 'aim' | 'fire' | 'throw' | 'place' | 'melee' | 'defeated' | 'victory'
export type PlayerExpressionState = 'normal' | 'hurt' | 'frozen' | 'defeated' | 'victory'
export const PLAYER_RENDER_LAYERS = ['rear-accessories', 'rear-arm-hands', 'body-pattern-face', 'front-accessories', 'front-arm-hands', 'weapon', 'team-overlay', 'status-overlay'] as const
export type PlayerRenderLayer = (typeof PLAYER_RENDER_LAYERS)[number]
export type PlayerRig = Readonly<{
  shoulder: PlayerVisualPoint
  rearHand: PlayerVisualPoint
  frontHand: PlayerVisualPoint
  weaponGrip: PlayerVisualPoint
  faceSafe: PlayerVisualPoint
  accessory: PlayerVisualPoint
  accessoryFit: Readonly<{ x: number; y: number; scale: number }>
}>
export type ResolvedPlayerPose = Readonly<{
  id: PlayerPoseId
  rig: PlayerRig
  rearArm: Readonly<{ shoulder: PlayerVisualPoint; hand: PlayerVisualPoint }>
  frontArm: Readonly<{ shoulder: PlayerVisualPoint; hand: PlayerVisualPoint }> | null
  weaponOrigin: PlayerVisualPoint
  bodyOffset: PlayerVisualPoint
  weaponRotation: number
}>
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
  face: readonly PlayerVisualPrimitive[]
  rearAccessories: readonly PlayerVisualPrimitive[]
  frontAccessories: readonly PlayerVisualPrimitive[]
}>
export type ResolvedPlayerComposition = Readonly<{
  origin: PlayerVisualPoint
  direction: PlayerVisualPoint
  scale: number
  mirror: boolean
  pose: ResolvedPlayerPose
  progress: number
  recipe: PlayerVisualRecipe
  weaponId?: WeaponId
  weaponScale: number
  layers: typeof PLAYER_RENDER_LAYERS
}>

export type CompactPlayerRecipe = Readonly<{
  body: PlayerVisualPrimitive
  patternMarks: readonly PlayerVisualPrimitive[]
  accessoryMarks: readonly PlayerVisualPrimitive[]
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
  spots: [circle(48, 45, 4, 'accent'), circle(77, 42, 3, 'accent'), circle(47, 74, 3, 'accent'), circle(78, 76, 4, 'accent')],
  stripes: [0, 14, 28].map((offset) => path([M(43 + offset, 38), C(47 + offset, 50, 47 + offset, 67, 43 + offset, 82)], undefined, 'accent', 5)),
  split: [path([M(64, 29), L(82, 36), L(84, 78), L(76, 87), L(64, 90), Z], 'accent')],
  zigzag: [path([M(43, 45), L(51, 52), L(59, 45), L(67, 52), L(75, 45), L(84, 52)], undefined, 'accent', 4), path([M(43, 71), L(51, 78), L(59, 71), L(67, 78), L(75, 71), L(84, 78)], undefined, 'accent', 4)],
  speckled: [circle(47, 42, 2, 'accent'), circle(73, 38, 1.5, 'accent'), circle(82, 54, 2, 'accent'), circle(45, 67, 1.5, 'accent'), circle(59, 82, 2, 'accent'), circle(79, 78, 1.5, 'accent')],
  chevron: [path([M(40, 48), L(64, 62), L(88, 48)], undefined, 'accent', 5), path([M(40, 68), L(64, 82), L(88, 68)], undefined, 'accent', 5)],
  rings: [circle(50, 48, 8, undefined, 'accent', 4), circle(76, 72, 10, undefined, 'accent', 4)],
  cracked: [path([M(62, 30), L(56, 50), L(66, 59), L(57, 76), L(63, 91)], undefined, 'accent', 4), path([M(57, 76), L(45, 82)], undefined, 'accent', 3)],
  confetti: [path([M(45, 44), L(51, 49), M(75, 39), L(80, 46), M(43, 70), L(50, 67), M(72, 75), L(80, 80)], undefined, 'accent', 4), circle(62, 41, 2, 'accent'), circle(60, 84, 2, 'accent')],
  bands: [path([M(34, 48), C(49, 54, 79, 54, 94, 48), M(31, 73), C(48, 79, 80, 79, 97, 73)], undefined, 'accent', 7)],
  polka: [circle(48, 44, 7, 'accent'), circle(78, 53, 6, 'accent'), circle(58, 80, 7, 'accent')],
  diamonds: [path([M(49, 38), L(58, 49), L(49, 60), L(40, 49), Z, M(77, 61), L(87, 73), L(77, 85), L(67, 73), Z], 'accent')],
  checker: [path([M(42, 40), L(54, 40), L(54, 52), L(42, 52), Z, M(66, 40), L(78, 40), L(78, 52), L(66, 52), Z, M(54, 52), L(66, 52), L(66, 64), L(54, 64), Z, M(78, 52), L(88, 52), L(88, 64), L(78, 64), Z, M(42, 64), L(54, 64), L(54, 76), L(42, 76), Z, M(66, 64), L(78, 64), L(78, 76), L(66, 76), Z], 'accent')],
  sash: [path([M(42, 31), L(54, 28), L(88, 87), L(76, 92), Z], 'accent')],
  drip: [path([M(34, 39), C(48, 32, 80, 32, 94, 39), L(94, 49), L(83, 49), L(80, 63), L(73, 49), L(61, 49), L(57, 59), L(52, 49), L(34, 49), Z], 'accent')],
  flames: [path([M(39, 86), C(42, 70, 52, 72, 50, 57), C(61, 65, 62, 48, 67, 40), C(75, 55, 72, 68, 82, 61), C(88, 72, 90, 80, 89, 88), Z], 'accent')],
  scales: [40, 56, 72].map((x) => path([M(x, 47), C(x + 5, 55, x + 11, 55, x + 16, 47), M(x, 65), C(x + 5, 73, x + 11, 73, x + 16, 65)], undefined, 'accent', 3)),
  target: [circle(64, 64, 20, undefined, 'accent', 5), circle(64, 64, 7, 'accent')],
  bolts: [path([M(48, 37), L(59, 37), L(53, 52), L(64, 52), L(46, 75), L(51, 57), L(41, 57), Z, M(76, 56), L(86, 56), L(81, 67), L(89, 67), L(74, 84), L(78, 71), L(70, 71), Z], 'accent')],
  hearts: [path([M(42, 50), C(42, 40, 54, 41, 57, 49), C(60, 41, 72, 40, 72, 50), C(67, 59, 59, 64, 57, 67), C(54, 63, 46, 59, 42, 50), Z], 'accent'), circle(79, 76, 6, 'accent')],
  stars: [path([M(53, 36), L(57, 46), L(68, 46), L(59, 53), L(63, 64), L(53, 57), L(43, 64), L(47, 53), L(38, 46), L(49, 46), Z, M(79, 65), L(82, 72), L(90, 73), L(84, 78), L(86, 86), L(79, 81), L(72, 86), L(74, 78), L(68, 73), L(76, 72), Z], 'accent')],
  waves: [path([M(36, 48), C(44, 39, 52, 57, 60, 48), C(68, 39, 76, 57, 92, 47), M(34, 72), C(44, 63, 52, 81, 60, 72), C(68, 63, 77, 81, 94, 70)], undefined, 'accent', 4)],
  camo: [path([M(41, 43), C(48, 35, 57, 39, 58, 47), C(55, 55, 44, 55, 41, 43), Z, M(70, 65), C(80, 55, 91, 62, 87, 75), C(79, 84, 67, 77, 70, 65), Z], 'accent'), ellipse(50, 80, 7, 4, 'accent')],
  honeycomb: [path([M(45, 40), L(53, 35), L(61, 40), L(61, 50), L(53, 55), L(45, 50), Z, M(65, 54), L(73, 49), L(81, 54), L(81, 64), L(73, 69), L(65, 64), Z, M(45, 68), L(53, 63), L(61, 68), L(61, 78), L(53, 83), L(45, 78), Z], undefined, 'accent', 3)],
  'yolk-splash': [circle(64, 62, 13, 'accent'), path([M(64, 43), L(60, 33), M(48, 51), L(39, 45), M(80, 51), L(89, 44), M(47, 72), L(38, 78), M(81, 73), L(91, 80), M(64, 81), L(63, 92)], undefined, 'accent', 5)],
  'battle-scars': [path([M(43, 45), L(57, 57), M(39, 53), L(48, 61), M(72, 68), L(87, 81), M(78, 65), L(88, 73)], undefined, 'accent', 4)],
  sprinkles: [path([M(44, 43), L(49, 39), M(62, 45), L(64, 52), M(79, 40), L(84, 45), M(45, 69), L(51, 74), M(67, 78), L(73, 74), M(82, 65), L(85, 72)], undefined, 'accent', 4)],
}

const EYES = (kind: PlayerFaceId): readonly PlayerVisualPrimitive[] => {
  if (kind === 'sleepy') return [path([M(45, 57), C(48, 59, 52, 59, 55, 57)], undefined, 'ink', 2.5), path([M(73, 57), C(76, 59, 80, 59, 83, 57)], undefined, 'ink', 2.5)]
  if (kind === 'determined') return [path([M(44, 52), L(55, 57)], undefined, 'ink', 2.5), path([M(73, 57), L(84, 52)], undefined, 'ink', 2.5), circle(51, 59, 2.3, 'ink'), circle(77, 59, 2.3, 'ink')]
  if (kind === 'wink') return [path([M(44, 57), C(48, 53, 52, 53, 56, 57)], undefined, 'ink', 2.5), circle(78, 57, 3, 'ink')]
  if (kind === 'starstruck') return [path([M(50, 51), L(52, 55), L(56, 56), L(53, 59), L(54, 63), L(50, 61), L(46, 63), L(47, 59), L(44, 56), L(48, 55), Z], 'ink'), path([M(78, 51), L(80, 55), L(84, 56), L(81, 59), L(82, 63), L(78, 61), L(74, 63), L(75, 59), L(72, 56), L(76, 55), Z], 'ink')]
  if (kind === 'suspicious') return [path([M(44, 55), L(56, 57)], undefined, 'ink', 2.5), path([M(72, 57), L(84, 53)], undefined, 'ink', 2.5), circle(51, 59, 2.3, 'ink'), circle(77, 59, 2.3, 'ink')]
  if (kind === 'angry' || kind === 'battlecry' || kind === 'focused') return [path([M(43, 51), L(56, 56)], undefined, 'ink', 3), path([M(72, 56), L(85, 51)], undefined, 'ink', 3), circle(51, 58, 2.5, 'ink'), circle(77, 58, 2.5, 'ink')]
  if (kind === 'ecstatic' || kind === 'laughing' || kind === 'bashful') return [path([M(43, 58), C(48, 50, 53, 50, 57, 58)], undefined, 'ink', 2.5), path([M(71, 58), C(76, 50, 81, 50, 85, 58)], undefined, 'ink', 2.5)]
  if (kind === 'nervous' || kind === 'pleading') return [ellipse(50, 57, 4, 5, 'face', 'ink', 2), ellipse(78, 57, 4, 5, 'face', 'ink', 2), circle(50, 59, 1.8, 'ink'), circle(78, 59, 1.8, 'ink')]
  if (kind === 'dizzy') return [path([M(44, 53), L(56, 62), M(56, 53), L(44, 62), M(72, 53), L(84, 62), M(84, 53), L(72, 62)], undefined, 'ink', 2.5)]
  if (kind === 'cool' || kind === 'unimpressed') return [path([M(43, 57), L(56, 57), M(72, 57), L(85, 57)], undefined, 'ink', 3)]
  if (kind === 'sad' || kind === 'pout') return [path([M(44, 58), C(48, 54, 52, 54, 56, 58)], undefined, 'ink', 2.5), path([M(72, 58), C(76, 54, 80, 54, 84, 58)], undefined, 'ink', 2.5)]
  if (kind === 'robot') return [path([M(44, 52), L(56, 52), L(56, 62), L(44, 62), Z, M(72, 52), L(84, 52), L(84, 62), L(72, 62), Z], undefined, 'ink', 2.5), circle(50, 57, 2, 'accent'), circle(78, 57, 2, 'accent')]
  if (kind === 'shocked') return [ellipse(50, 57, 4, 6, 'face', 'ink', 2.5), ellipse(78, 57, 4, 6, 'face', 'ink', 2.5)]
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
  wink: path([M(53, 71), C(60, 79, 69, 79, 76, 70)], undefined, 'ink', 2.5),
  starstruck: path([M(52, 70), C(58, 82, 70, 82, 76, 70), Z], 'face', 'ink', 2),
  goofy: path([M(51, 70), C(57, 80, 70, 83, 77, 71), C(69, 76, 59, 75, 51, 70), Z], 'face', 'ink', 2),
  suspicious: path([M(55, 74), L(73, 72)], undefined, 'ink', 2.5),
  angry: path([M(54, 78), C(60, 69, 69, 69, 75, 78)], undefined, 'ink', 3),
  ecstatic: ellipse(64, 74, 8, 10, 'face', 'ink', 2.5),
  nervous: path([M(53, 73), L(58, 70), L(63, 74), L(68, 70), L(75, 74)], undefined, 'ink', 2.5),
  dizzy: path([M(55, 74), C(60, 70, 68, 79, 74, 74)], undefined, 'ink', 2.5),
  cool: path([M(53, 72), C(61, 78, 69, 77, 76, 70)], undefined, 'ink', 2.5),
  sad: path([M(54, 78), C(60, 69, 68, 69, 74, 78)], undefined, 'ink', 2.5),
  pout: circle(64, 75, 4, undefined, 'ink', 2.5),
  tongue: path([M(52, 70), C(58, 82, 70, 82, 76, 70), C(70, 75, 58, 75, 52, 70), Z], 'face', 'ink', 2),
  vampire: path([M(52, 69), C(58, 80, 70, 80, 76, 69), L(72, 79), L(68, 73), L(60, 73), L(56, 79), Z], 'face', 'ink', 2),
  robot: path([M(53, 71), L(58, 76), L(63, 71), L(68, 76), L(75, 71)], undefined, 'ink', 2.5),
  focused: path([M(55, 75), L(73, 75)], undefined, 'ink', 3),
  bashful: path([M(54, 71), C(60, 77, 68, 77, 74, 71)], undefined, 'ink', 2.5),
  shocked: ellipse(64, 76, 7, 9, 'face', 'ink', 2.5),
  laughing: path([M(51, 69), C(58, 84, 71, 84, 77, 69), Z], 'accent', 'ink', 2),
  unimpressed: path([M(55, 75), L(73, 74)], undefined, 'ink', 2.5),
  pleading: path([M(55, 73), C(61, 78, 68, 78, 74, 73)], undefined, 'ink', 2.5),
  battlecry: path([M(53, 69), L(75, 69), L(72, 82), L(56, 82), Z], 'face', 'ink', 2.5),
  snickering: path([M(52, 71), C(59, 78, 69, 78, 76, 70), C(70, 73, 59, 74, 52, 71), Z], 'face', 'ink', 2),
}

const STATE_FACES: Record<Exclude<PlayerExpressionState, 'normal' | 'victory'>, readonly PlayerVisualPrimitive[]> = {
  hurt: [path([M(43, 53), L(55, 60), M(55, 53), L(43, 60)], undefined, 'ink', 2.5), path([M(73, 60), L(85, 53), M(73, 53), L(85, 60)], undefined, 'ink', 2.5), path([M(54, 78), C(60, 69, 69, 69, 75, 78)], undefined, 'ink', 2.5)],
  frozen: [path([M(44, 57), L(55, 57)], undefined, 'ink', 3), path([M(73, 57), L(84, 57)], undefined, 'ink', 3), path([M(54, 75), L(74, 75)], undefined, 'ink', 2.5)],
  defeated: [path([M(44, 53), L(55, 62), M(55, 53), L(44, 62)], undefined, 'ink', 2.5), path([M(73, 53), L(84, 62), M(84, 53), L(73, 62)], undefined, 'ink', 2.5), path([M(54, 77), C(60, 70, 68, 70, 75, 77)], undefined, 'ink', 2.5)],
}

const VICTORY_FACES: Record<PlayerVictoryStyleId, readonly PlayerVisualPrimitive[]> = {
  proud: [circle(50, 57, 3, 'ink'), circle(78, 57, 3, 'ink'), path([M(51, 69), C(58, 82, 71, 82, 77, 69)], 'face', 'ink', 2)],
  excited: [path([M(43, 58), C(48, 50, 53, 50, 57, 58)], undefined, 'ink', 2.5), path([M(71, 58), C(76, 50, 81, 50, 85, 58)], undefined, 'ink', 2.5), ellipse(64, 75, 8, 10, 'face', 'ink', 2.5)],
  smug: [path([M(44, 57), L(55, 55)], undefined, 'ink', 2.5), path([M(73, 55), L(84, 57)], undefined, 'ink', 2.5), path([M(53, 73), C(62, 79, 70, 75, 76, 69)], undefined, 'ink', 2.5)],
  calm: [path([M(44, 57), C(48, 60, 52, 60, 56, 57)], undefined, 'ink', 2.5), path([M(72, 57), C(76, 60, 80, 60, 84, 57)], undefined, 'ink', 2.5), path([M(55, 72), C(61, 77, 68, 77, 74, 72)], undefined, 'ink', 2.5)],
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
  beanie: [path([M(38, 34), C(42, 12, 84, 12, 90, 34), Z], 'accent', 'ink', 3), path([M(36, 33), L(92, 33), L(92, 41), L(36, 41), Z], 'accent', 'ink', 2.5), circle(64, 13, 5, 'accent', 'ink', 2)],
  'cowboy-hat': [path([M(42, 31), L(48, 13), C(57, 18, 71, 18, 80, 13), L(86, 31), Z], 'accent', 'ink', 3), path([M(26, 34), C(45, 39, 84, 39, 103, 32), C(93, 44, 38, 45, 26, 34), Z], 'accent', 'ink', 2.5)],
  'wizard-hat': [path([M(42, 34), L(68, 2), L(87, 35), Z], 'accent', 'ink', 3), path([M(34, 35), C(51, 30, 79, 30, 96, 36), C(79, 43, 50, 43, 34, 35), Z], 'accent', 'ink', 2.5)],
  antenna: [path([M(54, 34), L(50, 12), M(74, 34), L(80, 12)], undefined, 'ink', 3), circle(49, 9, 5, 'accent', 'ink', 2), circle(81, 9, 5, 'accent', 'ink', 2)],
  halo: [ellipse(64, 13, 25, 7, undefined, 'accent', 4)],
  horns: [path([M(43, 31), C(28, 24, 31, 8, 40, 5), C(37, 17, 43, 20, 50, 24), Z], 'accent', 'ink', 2.5), path([M(85, 31), C(100, 24, 97, 8, 88, 5), C(91, 17, 85, 20, 78, 24), Z], 'accent', 'ink', 2.5)],
  monocle: [circle(78, 58, 10, undefined, 'accent', 3), path([M(87, 65), C(92, 73, 91, 83, 88, 91)], undefined, 'ink', 2)],
  'heart-glasses': [path([M(38, 55), C(41, 47, 49, 49, 51, 54), C(54, 49, 62, 48, 64, 55), C(60, 64, 53, 68, 51, 70), C(48, 67, 40, 63, 38, 55), Z], 'accent', 'ink', 2), path([M(64, 55), C(67, 47, 75, 49, 77, 54), C(80, 49, 88, 48, 90, 55), C(86, 64, 79, 68, 77, 70), C(74, 67, 66, 63, 64, 55), Z], 'accent', 'ink', 2)],
  mustache: [path([M(64, 70), C(57, 63, 48, 67, 47, 75), C(53, 78, 60, 76, 64, 72), C(68, 76, 75, 78, 81, 75), C(80, 67, 71, 63, 64, 70), Z], 'accent', 'ink', 2)],
  scarf: [path([M(35, 83), C(50, 91, 78, 91, 93, 82), L(91, 94), C(75, 103, 51, 102, 37, 94), Z], 'accent', 'ink', 2.5), path([M(82, 92), L(94, 106), L(83, 108), L(75, 96), Z], 'accent', 'ink', 2)],
  flower: [circle(42, 26, 5, 'accent', 'ink', 2), circle(52, 26, 5, 'accent', 'ink', 2), circle(47, 18, 5, 'accent', 'ink', 2), circle(47, 34, 5, 'accent', 'ink', 2), circle(47, 26, 4, 'face', 'ink', 1.5)],
  'cat-ears': [path([M(38, 32), L(40, 8), L(57, 27), Z], 'accent', 'ink', 3), path([M(71, 27), L(88, 8), L(90, 33), Z], 'accent', 'ink', 3)],
  'bunny-ears': [ellipse(49, 15, 7, 14, 'accent', 'ink', 3), ellipse(79, 15, 7, 14, 'accent', 'ink', 3)],
  'dog-ears': [path([M(42, 27), C(29, 18, 18, 24, 23, 43), C(29, 54, 39, 43, 48, 31), Z], 'accent', 'ink', 3), path([M(86, 27), C(99, 18, 110, 24, 105, 43), C(99, 54, 89, 43, 80, 31), Z], 'accent', 'ink', 3)],
  'fox-ears': [path([M(37, 32), L(43, 4), L(59, 28), Z], 'accent', 'ink', 3), path([M(69, 28), L(87, 4), L(92, 33), Z], 'accent', 'ink', 3)],
  'top-hat': [path([M(45, 31), L(47, 5), L(81, 5), L(84, 31), Z], 'accent', 'ink', 3), path([M(34, 31), L(94, 31), L(94, 39), L(34, 39), Z], 'accent', 'ink', 2.5)],
  beret: [path([M(38, 32), C(42, 11, 80, 8, 91, 28), C(78, 35, 54, 39, 38, 32), Z], 'accent', 'ink', 3), path([M(63, 12), L(59, 6)], undefined, 'ink', 3)],
  'chef-hat': [path([M(43, 33), L(42, 24), C(31, 17, 39, 6, 50, 10), C(54, 2, 69, 2, 70, 11), C(83, 4, 96, 15, 86, 25), L(86, 33), Z], 'face', 'ink', 3), path([M(40, 32), L(88, 32), L(88, 40), L(40, 40), Z], 'accent', 'ink', 2)],
  'viking-helmet': [path([M(40, 31), C(47, 12, 81, 12, 88, 31), L(85, 39), L(43, 39), Z], 'accent', 'ink', 3), path([M(43, 25), C(29, 24, 27, 10, 34, 5), C(34, 17, 42, 17, 48, 20), Z, M(85, 25), C(99, 24, 101, 10, 94, 5), C(94, 17, 86, 17, 80, 20), Z], 'face', 'ink', 2.5)],
  'party-hat': [path([M(43, 34), L(67, 3), L(87, 35), Z], 'accent', 'ink', 3), circle(67, 4, 4, 'face', 'ink', 2)],
  'propeller-cap': [path([M(39, 34), C(45, 15, 82, 15, 89, 34), Z], 'accent', 'ink', 3), path([M(64, 17), L(64, 8), M(43, 7), C(51, 2, 59, 4, 64, 8), C(72, 2, 82, 3, 88, 8), C(77, 13, 70, 11, 64, 8), C(57, 13, 49, 12, 43, 7)], undefined, 'ink', 2.5)],
  sprout: [path([M(64, 31), C(64, 21, 63, 14, 59, 8)], undefined, 'ink', 3), path([M(60, 17), C(45, 17, 44, 6, 47, 3), C(57, 3, 62, 9, 60, 17), Z, M(61, 13), C(69, 3, 80, 6, 82, 10), C(78, 19, 69, 20, 61, 13), Z], 'accent', 'ink', 2)],
  'mushroom-cap': [path([M(31, 32), C(36, 5, 91, 5, 97, 32), C(83, 37, 46, 37, 31, 32), Z], 'accent', 'ink', 3), circle(52, 19, 5, 'face'), circle(77, 15, 4, 'face')],
  goggles: [circle(50, 57, 11, 'face', 'accent', 3), circle(78, 57, 11, 'face', 'accent', 3), path([M(61, 57), L(67, 57)], undefined, 'ink', 3)],
  visor: [path([M(38, 51), C(51, 46, 77, 46, 90, 51), L(87, 63), C(73, 59, 55, 59, 41, 63), Z], 'accent', 'ink', 2.5)],
  bandage: [path([M(42, 47), L(60, 54), L(57, 63), L(39, 56), Z], 'face', 'ink', 2), path([M(46, 51), L(44, 58), M(54, 54), L(52, 61)], undefined, 'accent', 1.5)],
  headphones: [path([M(37, 61), C(34, 33, 94, 33, 91, 61)], undefined, 'ink', 4), path([M(32, 55), L(43, 52), L(45, 71), L(34, 73), Z, M(96, 55), L(85, 52), L(83, 71), L(94, 73), Z], 'accent', 'ink', 2.5)],
  earmuffs: [path([M(36, 59), C(35, 38, 93, 38, 92, 59)], undefined, 'accent', 4), circle(36, 61, 9, 'accent', 'ink', 2.5), circle(92, 61, 9, 'accent', 'ink', 2.5)],
  'bow-tie': [path([M(64, 83), L(45, 74), L(47, 94), Z, M(64, 83), L(83, 74), L(81, 94), Z], 'accent', 'ink', 2.5), circle(64, 83, 5, 'face', 'ink', 2)],
  cape: [path([M(35, 68), C(24, 77, 20, 91, 24, 98), C(39, 96, 48, 91, 51, 78), Z], 'accent', 'ink', 3)],
  collar: [path([M(35, 83), L(45, 76), L(53, 86), L(64, 78), L(75, 86), L(84, 76), L(94, 83), C(79, 99, 50, 99, 35, 83), Z], 'face', 'ink', 2.5)],
  medal: [path([M(55, 79), L(61, 86), L(67, 79), L(73, 82), L(68, 89), L(60, 89), Z], 'accent', 'ink', 2), circle(64, 92, 7, 'accent', 'ink', 2.5)],
  leaf: [path([M(61, 31), C(48, 20, 50, 7, 55, 4), C(68, 10, 69, 21, 61, 31), Z], 'accent', 'ink', 2.5), path([M(62, 29), C(69, 15, 81, 13, 87, 17), C(83, 28, 73, 32, 62, 29), Z], 'accent', 'ink', 2.5)],
  feather: [path([M(58, 32), C(54, 17, 68, 4, 84, 4), C(87, 18, 75, 30, 58, 32), Z], 'accent', 'ink', 2.5), path([M(59, 31), L(80, 8)], undefined, 'ink', 2)],
  'tiny-flag': [path([M(55, 34), L(55, 5)], undefined, 'ink', 3), path([M(57, 6), L(84, 11), L(57, 20), Z], 'accent', 'ink', 2)],
  'eggshell-hat': [path([M(35, 30), L(43, 19), L(51, 28), L(61, 17), L(71, 28), L(81, 18), L(92, 31), C(76, 38, 51, 38, 35, 30), Z], 'face', 'ink', 3)],
}

function transformPrimitive(item: PlayerVisualPrimitive, x: number, y: number, scale: number): PlayerVisualPrimitive {
  const point = (px: number, py: number) => ({ x: 64 + (px - 64) * scale + x, y: 29 + (py - 29) * scale + y })
  if (item.kind === 'circle') {
    const center = point(item.cx, item.cy)
    return { ...item, cx: center.x, cy: center.y, radius: item.radius * scale }
  }
  if (item.kind === 'ellipse') {
    const center = point(item.cx, item.cy)
    return { ...item, cx: center.x, cy: center.y, radiusX: item.radiusX * scale, radiusY: item.radiusY * scale }
  }
  return { ...item, commands: item.commands.map((command) => {
    if (command.kind === 'close') return command
    const end = point(command.x, command.y)
    if (command.kind !== 'curve') return { ...command, ...end }
    const first = point(command.x1, command.y1)
    const second = point(command.x2, command.y2)
    return { ...command, x1: first.x, y1: first.y, x2: second.x, y2: second.y, ...end }
  }) }
}

export type AccessoryFitResult = Readonly<{ safe: boolean; bounds: Readonly<{ left: number; top: number; right: number; bottom: number }>; primitives: readonly PlayerVisualPrimitive[]; reason?: string }>

function primitiveBounds(items: readonly PlayerVisualPrimitive[]) {
  const points: { x: number; y: number }[] = []
  for (const item of items) {
    if (item.kind === 'circle') points.push({ x: item.cx - item.radius, y: item.cy - item.radius }, { x: item.cx + item.radius, y: item.cy + item.radius })
    else if (item.kind === 'ellipse') points.push({ x: item.cx - item.radiusX, y: item.cy - item.radiusY }, { x: item.cx + item.radiusX, y: item.cy + item.radiusY })
    else for (const command of item.commands) {
      if (command.kind === 'close') continue
      points.push({ x: command.x, y: command.y })
      if (command.kind === 'curve') points.push({ x: command.x1, y: command.y1 }, { x: command.x2, y: command.y2 })
    }
  }
  return { left: Math.min(...points.map((p) => p.x), 64), top: Math.min(...points.map((p) => p.y), 60), right: Math.max(...points.map((p) => p.x), 64), bottom: Math.max(...points.map((p) => p.y), 60) }
}

export function resolveAccessoryFit(body: PlayerBodyId, accessory: PlayerAccessoryId): AccessoryFitResult {
  const metadata = PLAYER_ACCESSORIES.find((entry) => entry.id === accessory)!.recipe
  const rig = getPlayerRig(body)
  const fitY = metadata.category === 'face' ? rig.faceSafe.y - 64 : rig.accessoryFit.y
  const fitScale = metadata.category === 'face' ? 1 : rig.accessoryFit.scale
  const primitives = ACCESSORIES[accessory].map((item) => transformPrimitive(item, rig.accessoryFit.x, fitY, fitScale))
  const bounds = primitiveBounds(primitives)
  const safe = metadata.occludesEyes < 2 && !metadata.occludesMouth && bounds.left >= 0 && bounds.right <= 128 && bounds.top >= 0 && bounds.bottom <= 110
  return Object.freeze({ safe, bounds: Object.freeze(bounds), primitives: Object.freeze(primitives), reason: safe ? undefined : 'Accessory metadata or fitted geometry exceeds the character safe area.' })
}

export function getPlayerVisualRecipe(appearance: Readonly<PlayerAppearance>, expressionState: PlayerExpressionState = 'normal'): PlayerVisualRecipe {
  const metadata = PLAYER_ACCESSORIES.find((entry) => entry.id === appearance.accessory)!.recipe
  const fit = resolveAccessoryFit(appearance.body, appearance.accessory)
  if (!fit.safe) throw new Error(`Unsafe accessory ${appearance.accessory} for body ${appearance.body}: ${fit.reason}`)
  const accessories = fit.primitives
  const rearAccessory = metadata.category === 'rear'
  return {
    viewBox: { width: 128, height: 120 },
    body: BODIES[appearance.body],
    pattern: PATTERNS[appearance.pattern],
    face: [
      path([M(43, 33), C(49, 26, 58, 23, 65, 24)], undefined, 'shine', 4),
      ...(expressionState === 'normal' ? [...EYES(appearance.face), MOUTHS[appearance.face]] : expressionState === 'victory' ? VICTORY_FACES[appearance.victoryStyle] : STATE_FACES[expressionState]),
    ],
    rearAccessories: rearAccessory ? accessories : [],
    frontAccessories: rearAccessory ? [] : accessories,
  }
}

const COMPACT_ACCESSORY_MARKS: Record<PlayerAccessoryId, readonly PlayerVisualPrimitive[]> = {
  none: [], cap: [path([M(43, 42), L(83, 42), L(91, 46)], undefined, 'accent', 4)],
  crown: [path([M(45, 42), L(50, 32), L(59, 40), L(66, 29), L(75, 40), L(84, 32), L(87, 43)], undefined, 'accent', 3)],
  headband: [path([M(42, 44), L(86, 44)], undefined, 'accent', 5)],
  glasses: [circle(53, 58, 6, undefined, 'accent', 3), circle(75, 58, 6, undefined, 'accent', 3)],
  eyepatch: [circle(75, 58, 6, 'accent', 'ink', 2)],
  bow: [path([M(43, 43), L(31, 36), L(32, 49), Z], 'accent'), path([M(43, 43), L(54, 36), L(53, 49), Z], 'accent')],
  mohawk: [path([M(48, 40), L(54, 29), L(61, 39), L(68, 27), L(76, 40)], undefined, 'accent', 4)],
  beanie: [path([M(44, 41), C(49, 28, 79, 28, 85, 41)], undefined, 'accent', 5)],
  'cowboy-hat': [path([M(38, 40), L(90, 40), M(49, 38), L(53, 29), L(77, 29), L(82, 38)], undefined, 'accent', 3)],
  'wizard-hat': [path([M(43, 41), L(65, 24), L(86, 41)], undefined, 'accent', 4)],
  antenna: [path([M(54, 39), L(50, 27), M(74, 39), L(79, 27)], undefined, 'accent', 3)],
  halo: [ellipse(64, 31, 19, 5, undefined, 'accent', 3)],
  horns: [path([M(49, 39), L(39, 27), M(79, 39), L(89, 27)], undefined, 'accent', 4)],
  monocle: [circle(75, 58, 6, undefined, 'accent', 3)],
  'heart-glasses': [circle(53, 58, 6, undefined, 'accent', 3), circle(75, 58, 6, undefined, 'accent', 3)],
  mustache: [path([M(50, 70), C(57, 76, 61, 72, 64, 69), C(68, 72, 72, 76, 79, 70)], undefined, 'accent', 4)],
  scarf: [path([M(43, 82), C(55, 88, 74, 88, 86, 82)], undefined, 'accent', 5)],
  flower: [circle(48, 37, 6, 'accent')],
  'cat-ears': [path([M(46, 40), L(42, 28), L(57, 38), M(72, 38), L(86, 28), L(82, 41)], undefined, 'accent', 4)],
  'bunny-ears': [ellipse(51, 31, 5, 12, undefined, 'accent', 3), ellipse(77, 31, 5, 12, undefined, 'accent', 3)],
  'dog-ears': [path([M(45, 39), L(31, 32), L(35, 51), M(83, 39), L(97, 32), L(93, 51)], undefined, 'accent', 4)],
  'fox-ears': [path([M(46, 40), L(43, 25), L(57, 38), M(71, 38), L(86, 25), L(82, 40)], undefined, 'accent', 4)],
  'top-hat': [path([M(48, 39), L(49, 25), L(79, 25), L(81, 39), M(39, 40), L(89, 40)], undefined, 'accent', 4)],
  beret: [path([M(42, 39), C(47, 27, 78, 25, 88, 37), C(75, 42, 55, 43, 42, 39)], undefined, 'accent', 4)],
  'chef-hat': [path([M(44, 40), L(44, 33), C(37, 27, 47, 21, 53, 26), C(58, 18, 69, 20, 70, 27), C(81, 21, 90, 30, 84, 35), L(84, 40)], undefined, 'accent', 3)],
  'viking-helmet': [path([M(44, 40), C(48, 29, 80, 29, 84, 40), M(47, 35), L(38, 26), M(81, 35), L(90, 26)], undefined, 'accent', 4)],
  'party-hat': [path([M(45, 40), L(66, 23), L(84, 40)], undefined, 'accent', 4)],
  'propeller-cap': [path([M(43, 40), C(48, 28, 80, 28, 85, 40), M(64, 29), L(64, 22), M(51, 22), C(57, 19, 61, 20, 64, 22), C(70, 19, 76, 20, 81, 23)], undefined, 'accent', 3)],
  sprout: [path([M(64, 40), L(61, 27), M(61, 31), C(52, 31, 49, 25, 50, 22), C(58, 22, 62, 26, 61, 31), M(61, 28), C(68, 21, 76, 23, 79, 26)], undefined, 'accent', 3)],
  'mushroom-cap': [path([M(37, 39), C(42, 22, 86, 22, 91, 39), C(78, 43, 50, 43, 37, 39)], undefined, 'accent', 4)],
  goggles: [circle(53, 58, 7, undefined, 'accent', 3), circle(75, 58, 7, undefined, 'accent', 3)],
  visor: [path([M(42, 53), C(53, 49, 75, 49, 86, 53), L(84, 62), C(72, 59, 56, 59, 44, 62), Z], 'accent', 'ink', 2)],
  bandage: [path([M(44, 51), L(59, 56), L(56, 63), L(41, 58), Z], 'face', 'accent', 2)],
  headphones: [path([M(39, 61), C(38, 42, 90, 42, 89, 61), M(38, 55), L(45, 54), L(46, 68), L(39, 69), Z, M(90, 55), L(83, 54), L(82, 68), L(89, 69), Z], undefined, 'accent', 4)],
  earmuffs: [path([M(39, 59), C(39, 43, 89, 43, 89, 59)], undefined, 'accent', 4), circle(39, 61, 6, 'accent'), circle(89, 61, 6, 'accent')],
  'bow-tie': [path([M(64, 79), L(50, 73), L(51, 86), Z, M(64, 79), L(78, 73), L(77, 86), Z], 'accent')],
  cape: [path([M(43, 72), C(34, 79, 32, 90, 34, 98), C(45, 94, 50, 86, 51, 77)], undefined, 'accent', 5)],
  collar: [path([M(42, 82), L(50, 77), L(57, 85), L(64, 79), L(71, 85), L(78, 77), L(86, 82)], undefined, 'accent', 4)],
  medal: [path([M(58, 79), L(64, 88), L(70, 79)], undefined, 'accent', 3), circle(64, 92, 6, 'accent')],
  leaf: [path([M(62, 39), C(52, 33, 52, 24, 56, 22), C(65, 26, 67, 33, 62, 39), M(63, 37), C(69, 28, 78, 29, 82, 32)], undefined, 'accent', 3)],
  feather: [path([M(58, 40), C(58, 29, 69, 21, 81, 22), C(81, 32, 71, 39, 58, 40), M(60, 39), L(78, 24)], undefined, 'accent', 3)],
  'tiny-flag': [path([M(55, 41), L(55, 23), M(57, 24), L(79, 28), L(57, 34), Z], undefined, 'accent', 3)],
  'eggshell-hat': [path([M(40, 38), L(47, 31), L(54, 38), L(63, 30), L(72, 38), L(81, 31), L(88, 39)], undefined, 'accent', 4)],
}

export function getCompactPlayerRecipe(appearance: Readonly<PlayerAppearance>): CompactPlayerRecipe {
  return Object.freeze({ body: BODIES[appearance.body], patternMarks: PATTERNS[appearance.pattern], accessoryMarks: COMPACT_ACCESSORY_MARKS[appearance.accessory] })
}

export function resolvePlayerComposition(options: Readonly<{ appearance: Readonly<PlayerAppearance>; origin?: PlayerVisualPoint; direction?: PlayerVisualPoint; scale?: number; mirror?: boolean; pose?: PlayerPoseId; progress?: number; weaponId?: WeaponId; expressionState?: PlayerExpressionState }>): ResolvedPlayerComposition {
  const progress = Math.max(0, Math.min(1, options.progress ?? 1))
  const weapon = options.weaponId ? getWeaponVisual(options.weaponId) : undefined
  return Object.freeze({
    origin: options.origin ?? { x: 64, y: 60 }, direction: options.direction ?? { x: options.mirror ? -1 : 1, y: 0 },
    scale: options.scale ?? 1, mirror: options.mirror ?? false, progress,
    pose: resolvePlayerPose(options.appearance.body, options.pose ?? 'idle', weapon?.pose, progress),
    recipe: getPlayerVisualRecipe(options.appearance, options.expressionState), weaponId: options.weaponId,
    weaponScale: weapon?.heldScale ?? 1, layers: PLAYER_RENDER_LAYERS,
  })
}

export function getPlayerRig(body: PlayerBodyId): PlayerRig {
  return PLAYER_BODIES.find((entry) => entry.id === body)!.recipe.rig
}

export function poseIdForWeapon(pose: PoseKind, firing = false): PlayerPoseId {
  if (pose === 'throw') return 'throw'
  if (pose === 'place') return 'place'
  if (pose === 'one-hand') return 'melee'
  return firing ? 'fire' : 'aim'
}

export function resolvePlayerPose(
  body: PlayerBodyId,
  id: PlayerPoseId,
  weaponPose: PoseKind = 'two-hand',
  fireProgress = 1,
): ResolvedPlayerPose {
  const rig = getPlayerRig(body)
  const oneHanded = weaponPose === 'one-hand' || weaponPose === 'throw' || weaponPose === 'place'
  const poseRotation = id === 'melee' ? -0.72 + fireProgress * 1.18 : id === 'throw' ? -0.9 * (1 - fireProgress) : id === 'place' ? 0.35 * (1 - fireProgress) : 0
  const bodyOffset = id === 'defeated' ? { x: 0, y: 5 } : id === 'victory' ? { x: 0, y: -3 } : { x: 0, y: 0 }
  return {
    id,
    rig,
    rearArm: { shoulder: rig.shoulder, hand: rig.rearHand },
    frontArm: oneHanded ? null : { shoulder: { x: rig.shoulder.x + 6, y: rig.shoulder.y - 2 }, hand: rig.frontHand },
    weaponOrigin: rig.weaponGrip,
    bodyOffset,
    weaponRotation: poseRotation,
  }
}

export function resolveWeaponHandAnchors(
  pose: ResolvedPlayerPose,
  grip: PlayerVisualPoint,
  bodyLength: number,
  muzzleX: number,
  modelScale: number,
): Readonly<{ grip: PlayerVisualPoint; support: PlayerVisualPoint | null }> {
  return {
    grip: { x: grip.x * modelScale, y: grip.y * modelScale },
    support: pose.frontArm ? {
      x: Math.min(bodyLength * 0.62, muzzleX - 5) * modelScale,
      y: grip.y * 0.35 * modelScale,
    } : null,
  }
}

export function playerPathData(commands: readonly PlayerPathCommand[]): string {
  return commands.map((command) => command.kind === 'close' ? 'Z' : command.kind === 'curve' ? `C${command.x1} ${command.y1} ${command.x2} ${command.y2} ${command.x} ${command.y}` : `${command.kind === 'move' ? 'M' : 'L'}${command.x} ${command.y}`).join(' ')
}
