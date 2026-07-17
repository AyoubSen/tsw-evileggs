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
    frontArm: oneHanded ? null : { shoulder: { x: rig.shoulder.x + 6, y: rig.shoulder.y - 7 }, hand: rig.frontHand },
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
