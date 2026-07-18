import type { SoundCue } from '../audio/AudioDirector'
import type { SimProjectile } from '../simulation/match/MatchState'
import type { WeaponId } from '../weapons/registry'
import { getWeaponPresentation } from './weaponPresentation'

export type ProjectileVisualKind = SimProjectile['kind']
export type PoseKind = 'two-hand' | 'one-hand' | 'throw' | 'place' | 'heavy' | 'device'
export type ActivationEffectKind = 'muzzle' | 'slash' | 'throw' | 'place' | 'warp'
export type TransitionStyle =
  | 'recoil'
  | 'snap'
  | 'lob'
  | 'scatter'
  | 'split'
  | 'spin'
  | 'drop'
  | 'slash'
  | 'signal'
  | 'throw'
  | 'siege-kick'
  | 'freeze'
  | 'warp'
export type ImpactStyle =
  | 'blast'
  | 'pierce'
  | 'heavy-blast'
  | 'bounce-blast'
  | 'pellet-hit'
  | 'cluster-burst'
  | 'drill-burst'
  | 'knife-strike'
  | 'knife-miss'
  | 'knife-blocked'
  | 'beacon-strike'
  | 'fork-burst'
  | 'shoe-thud'
  | 'siege-blast'
  | 'freeze-burst'
  | 'warp-arrival'

export type PaletteRole =
  | 'ink'
  | 'primary'
  | 'accent'
  | 'flash'
  | 'impact'
  | 'trail'
  | 'neutral'
  | 'shadow'
  | 'highlight'
  | 'success'
  | 'miss'
  | 'blocked'

export type SemanticPalette = Readonly<Record<PaletteRole, number>>
export type PaletteMode = 'standard' | 'high-contrast'
export type ShapePoint = Readonly<{ x: number; y: number }>

type PrimitiveBase = Readonly<{ alpha?: number }>
export type PolygonRecipe = PrimitiveBase &
  Readonly<{
    kind: 'polygon'
    points: readonly ShapePoint[]
    fill?: PaletteRole
    stroke?: PaletteRole
    strokeWidth?: number
  }>
export type LineRecipe = PrimitiveBase &
  Readonly<{
    kind: 'line'
    from: ShapePoint
    to: ShapePoint
    width: number
    color: PaletteRole
    outline?: PaletteRole
    outlineWidth?: number
  }>
export type CircleRecipe = PrimitiveBase &
  Readonly<{
    kind: 'circle'
    center: ShapePoint
    radius: number
    fill?: PaletteRole
    stroke?: PaletteRole
    strokeWidth?: number
  }>
export type EllipseRecipe = PrimitiveBase &
  Readonly<{
    kind: 'ellipse'
    center: ShapePoint
    radiusX: number
    radiusY: number
    fill?: PaletteRole
    stroke?: PaletteRole
    strokeWidth?: number
  }>
export type ShapePrimitive = PolygonRecipe | LineRecipe | CircleRecipe | EllipseRecipe
export type ShapeRecipe = Readonly<{
  primitives: readonly ShapePrimitive[]
}>

export type TrailSettings = Readonly<{
  color: PaletteRole
  sampleCount: number
  width: number
  alpha: number
  taper: number
}>
export type MotionSettings = Readonly<{
  recoilDurationMs: number
  recoilDistance: number
  trail: TrailSettings
  pulse: boolean
  spinRadiansPerSecond: number
  bobAmplitude: number
  transientDurationScale: number
}>
export type MotionRecipe = Readonly<{
  standard: MotionSettings
  reduced: MotionSettings
}>

export type WeaponVisualSoundCue = SoundCue

export type ProjectileVisualRecipe = Readonly<{
  shape: ShapeRecipe
  scale: number
  spinRadiansPerSecond: number
}>

export type MeleeOutcomeRecipe = Readonly<{
  palette: PaletteRole
  impactStyle: Extract<ImpactStyle, 'knife-strike' | 'knife-miss' | 'knife-blocked'>
  sound: WeaponVisualSoundCue
}>

type ProjectileKindsForWeapon<I extends WeaponId> = I extends 'cluster-charge'
  ? 'primary' | 'cluster-child'
  : I extends 'fork-rocket'
    ? 'primary' | 'fork-child'
    : I extends 'bomb-beacon'
      ? 'primary' | 'beacon-bomb'
      : I extends
            | 'scatter-shot'
            | 'pocket-knife'
            | 'teleporter'
        ? never
        : 'primary'

type NoProjectileRecipes = Readonly<{
  primary?: never
  'cluster-child'?: never
  'fork-child'?: never
  'beacon-bomb'?: never
}>

type ProjectileRecipeMap<I extends WeaponId> = [ProjectileKindsForWeapon<I>] extends [never]
  ? NoProjectileRecipes
  : Readonly<{
      [K in ProjectileKindsForWeapon<I>]: ProjectileVisualRecipe
    }>

export type WeaponVisualRecipe<I extends WeaponId = WeaponId> = Readonly<{
  id: I
  palettes: Readonly<Record<PaletteMode, SemanticPalette>>
  held: ShapeRecipe
  icon: ShapeRecipe
  heldScale: number
  iconScale: number
  pose: PoseKind
  activationEffect: ActivationEffectKind
  transitionStyle: TransitionStyle
  impactStyle: ImpactStyle
  audio: Readonly<{ fire: SoundCue; impact: WeaponVisualSoundCue }>
  motion: MotionRecipe
  projectiles: ProjectileRecipeMap<I>
  meleeOutcomes?: Readonly<Record<'hit' | 'miss' | 'blocked', MeleeOutcomeRecipe>>
}>

export type WeaponVisualRegistry = Readonly<{
  [I in WeaponId]: WeaponVisualRecipe<I>
}>

const point = (x: number, y: number): ShapePoint => ({ x, y })
const points = (values: readonly (readonly [number, number])[]): readonly ShapePoint[] =>
  values.map(([x, y]) => point(x, y))
const shape = (...primitives: readonly ShapePrimitive[]): ShapeRecipe => ({ primitives })
const polygon = (
  values: readonly (readonly [number, number])[],
  fill: PaletteRole,
  stroke: PaletteRole = 'ink',
  strokeWidth = 2.5,
): PolygonRecipe => ({ kind: 'polygon', points: points(values), fill, stroke, strokeWidth })
const line = (
  from: readonly [number, number],
  to: readonly [number, number],
  width: number,
  color: PaletteRole,
  outline: PaletteRole | undefined = 'ink',
  outlineWidth = 1.5,
): LineRecipe => ({
  kind: 'line',
  from: point(...from),
  to: point(...to),
  width,
  color,
  outline,
  outlineWidth,
})
const circle = (
  x: number,
  y: number,
  radius: number,
  fill: PaletteRole | undefined,
  stroke: PaletteRole | undefined = 'ink',
  strokeWidth = 2,
): CircleRecipe => ({ kind: 'circle', center: point(x, y), radius, fill, stroke, strokeWidth })
const ellipse = (
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  fill: PaletteRole | undefined,
  stroke: PaletteRole | undefined = 'ink',
  strokeWidth = 2,
): EllipseRecipe => ({
  kind: 'ellipse',
  center: point(x, y),
  radiusX,
  radiusY,
  fill,
  stroke,
  strokeWidth,
})
const projectile = (
  recipe: ShapeRecipe,
  scale = 1,
  spinRadiansPerSecond = 0,
): ProjectileVisualRecipe => ({ shape: recipe, scale, spinRadiansPerSecond })

function palettesFor(id: WeaponId): Readonly<Record<PaletteMode, SemanticPalette>> {
  const presentation = getWeaponPresentation(id)
  return {
    standard: {
      ink: 0x24313a,
      primary: presentation.colors.primary,
      accent: presentation.colors.accent,
      flash: presentation.colors.flash,
      impact: presentation.colors.impact,
      trail: presentation.trail.color,
      neutral: 0x9aa7aa,
      shadow: 0x172126,
      highlight: 0xeaf8f8,
      success: 0x57b89e,
      miss: 0x9aa7aa,
      blocked: 0xf2a93b,
    },
    'high-contrast': {
      ink: 0x000000,
      primary: 0xffffff,
      accent: 0xffd800,
      flash: 0xffffff,
      impact: 0xff334f,
      trail: 0x00e5ff,
      neutral: 0xd7e0e3,
      shadow: 0x000000,
      highlight: 0x00e5ff,
      success: 0x33ff66,
      miss: 0xc7c7c7,
      blocked: 0xff8c00,
    },
  }
}

function motionFor(
  id: WeaponId,
  spinRadiansPerSecond = 0,
  bobAmplitude = 0,
): MotionRecipe {
  const presentation = getWeaponPresentation(id)
  const standard: MotionSettings = {
    recoilDurationMs: presentation.recoil.durationMs,
    recoilDistance: presentation.recoil.distance,
    trail: {
      color: 'trail',
      sampleCount: presentation.trail.sampleCount,
      width: presentation.trail.width,
      alpha: 0.72,
      taper: 0.55,
    },
    pulse: true,
    spinRadiansPerSecond,
    bobAmplitude,
    transientDurationScale: 1,
  }
  return {
    standard,
    reduced: {
      recoilDurationMs: presentation.reducedMotionSafe.recoil
        ? presentation.recoil.durationMs
        : 0,
      recoilDistance: presentation.reducedMotionSafe.recoil
        ? presentation.recoil.distance
        : 0,
      trail: {
        ...standard.trail,
        sampleCount: presentation.reducedMotionSafe.trail
          ? presentation.trail.sampleCount
          : Math.min(1, presentation.trail.sampleCount),
        alpha: 0.58,
      },
      pulse: presentation.reducedMotionSafe.pulse,
      spinRadiansPerSecond: 0,
      bobAmplitude: 0,
      transientDurationScale: presentation.reducedMotionSafe.transient ? 1 : 0.35,
    },
  }
}

function defineWeapon<I extends WeaponId>(
  id: I,
  recipe: Omit<WeaponVisualRecipe<I>, 'id' | 'palettes' | 'motion'> &
    Readonly<{ motionSpin?: number; motionBob?: number }>,
): WeaponVisualRecipe<I> {
  const { motionSpin = 0, motionBob = 0, ...visual } = recipe
  return {
    id,
    palettes: palettesFor(id),
    motion: motionFor(id, motionSpin, motionBob),
    ...visual,
  }
}

const rocketProjectile = projectile(
  shape(
    polygon([[-10, -4], [4, -4], [10, -2.5], [14, 0], [10, 2.5], [4, 4], [-10, 4]], 'primary', 'ink', 2),
    polygon([[3, -4], [10, -2.5], [14, 0], [10, 2.5], [3, 4]], 'highlight', 'ink', 1.5),
    line([-5, -4], [-5, 4], 2, 'accent', 'ink', 0.8),
    circle(4, 0, 1.8, 'flash', 'ink', 1),
    polygon([[-7, -4], [-12, -8], [-2, -4]], 'accent', 'ink', 1.5),
    polygon([[-7, 4], [-12, 8], [-2, 4]], 'accent', 'ink', 1.5),
    polygon([[-11, -3], [-17, -5], [-14, 0], [-17, 5], [-11, 3]], 'flash', 'accent', 1.2),
    polygon([[-16, -2], [-21, 0], [-16, 2], [-13, 0]], 'highlight', 'flash', 1),
  ),
)

export const WEAPON_VISUALS = {
  'basic-rocket': defineWeapon('basic-rocket', {
    held: shape(
      polygon([[-13, -4], [2, -6], [8, -3], [7, 5], [-8, 7], [-14, 3]], 'shadow', 'ink', 2.5),
      polygon([[4, 4], [17, 4], [14, 9], [11, 17], [4, 15], [6, 8]], 'shadow', 'ink', 2.5),
      polygon([[-5, -7], [35, -7], [42, -5], [46, 0], [42, 5], [35, 7], [-5, 7], [-9, 3], [-9, -3]], 'primary', 'ink', 2.8),
      polygon([[1, -4], [31, -4], [35, -2], [35, 2], [31, 4], [1, 4]], 'accent', 'ink', 1.5),
      polygon([[33, -9], [42, -9], [47, -6], [47, 6], [42, 9], [33, 9]], 'accent', 'ink', 2.5),
      ellipse(45, 0, 4, 6, 'shadow', 'ink', 2),
      ellipse(45.5, 0, 1.7, 3.2, 'ink', 'highlight', 1),
      polygon([[7, -7], [11, -12], [22, -12], [25, -7]], 'shadow', 'ink', 2),
      line([11, -9], [21, -9], 2, 'highlight', undefined, 0),
      circle(7, 0, 2, 'shadow', 'highlight', 1),
      circle(15, 0, 1.4, 'shadow', 'highlight', 1),
      line([-2, -5], [27, -5], 1.5, 'highlight', undefined, 0),
    ),
    icon: shape(
      polygon([[-14, -5], [5, -5], [12, -3], [18, 0], [12, 3], [5, 5], [-14, 5]], 'primary', 'ink', 2.5),
      polygon([[5, -5], [12, -3], [18, 0], [12, 3], [5, 5]], 'highlight', 'ink', 1.5),
      line([-7, -5], [-7, 5], 2.5, 'accent', 'ink', 1),
      polygon([[-10, -5], [-16, -11], [-2, -5]], 'accent', 'ink', 2),
      polygon([[-10, 5], [-16, 11], [-2, 5]], 'accent', 'ink', 2),
      polygon([[-15, -3], [-21, 0], [-15, 3]], 'flash', 'accent', 1.5),
      circle(7, 0, 2.2, 'flash', 'ink', 1.2),
    ),
    heldScale: 1,
    iconScale: 1,
    pose: 'two-hand',
    activationEffect: 'muzzle',
    transitionStyle: 'recoil',
    impactStyle: 'blast',
    audio: { fire: 'rocket-fire', impact: 'rocket-impact' },
    projectiles: { primary: rocketProjectile },
  }),
  'precision-cannon': defineWeapon('precision-cannon', {
    held: shape(
      polygon([[-15, -3], [-3, -6], [5, -4], [6, 4], [-7, 7], [-15, 4]], 'shadow', 'ink', 2.5),
      polygon([[4, 3], [14, 3], [13, 8], [9, 16], [3, 14], [5, 7]], 'shadow', 'ink', 2.3),
      polygon([[-5, -6], [34, -6], [41, -4], [51, -2], [56, 0], [51, 2], [41, 4], [34, 6], [-5, 6], [-9, 3], [-9, -3]], 'primary', 'ink', 2.7),
      polygon([[3, -3], [34, -3], [41, -1.5], [51, -1.5], [55, 0], [51, 1.5], [41, 1.5], [34, 3], [3, 3]], 'shadow', 'ink', 1.3),
      line([13, 0], [52, 0], 2, 'flash', 'accent', 1),
      polygon([[29, -8], [34, -8], [37, -5], [37, 5], [34, 8], [29, 8]], 'accent', 'ink', 2),
      polygon([[38, -6], [42, -6], [45, -3], [45, 3], [42, 6], [38, 6]], 'accent', 'ink', 1.8),
      polygon([[8, -6], [12, -11], [24, -11], [28, -6]], 'shadow', 'ink', 2),
      polygon([[13, -9], [22, -9], [24, -7], [12, -7]], 'highlight', 'accent', 1),
      circle(18, -9, 2.2, 'flash', 'ink', 1),
      circle(8, 0, 2.4, 'accent', 'ink', 1.2),
      line([-1, -4], [26, -4], 1.4, 'highlight', undefined, 0),
    ),
    icon: shape(
      polygon([[-19, -4], [7, -4], [14, -2], [22, 0], [14, 2], [7, 4], [-19, 4]], 'primary', 'ink', 2.3),
      polygon([[-12, -2], [9, -2], [16, 0], [9, 2], [-12, 2]], 'shadow', 'ink', 1),
      line([-7, 0], [20, 0], 1.8, 'flash', 'accent', 1),
      polygon([[-2, -7], [3, -7], [6, -4], [6, 4], [3, 7], [-2, 7]], 'accent', 'ink', 1.8),
      polygon([[8, -5], [12, -5], [15, -3], [15, 3], [12, 5], [8, 5]], 'accent', 'ink', 1.5),
      circle(-11, 0, 2.2, 'flash', 'ink', 1),
    ),
    heldScale: 1,
    iconScale: 1,
    pose: 'two-hand',
    activationEffect: 'muzzle',
    transitionStyle: 'snap',
    impactStyle: 'pierce',
    audio: { fire: 'cannon-fire', impact: 'cannon-impact' },
    projectiles: {
      primary: projectile(
        shape(
          polygon([[-14, -2.5], [7, -2.5], [14, -1], [20, 0], [14, 1], [7, 2.5], [-14, 2.5]], 'primary', 'ink', 1.5),
          polygon([[5, -2.5], [14, -1], [20, 0], [14, 1], [5, 2.5]], 'highlight', 'ink', 1),
          line([-7, -2.5], [-7, 2.5], 1.8, 'accent', 'ink', 0.7),
          circle(7, 0, 1.4, 'flash', 'ink', 0.8),
          line([-23, 0], [-12, 0], 2, 'flash', 'accent', 0.8),
          line([-18, -3], [-9, -1.5], 1, 'trail', undefined, 0),
          line([-18, 3], [-9, 1.5], 1, 'trail', undefined, 0),
        ),
      ),
    },
  }),
  'high-arc-mortar': defineWeapon('high-arc-mortar', {
    held: shape(
      polygon([[-14, -3], [-2, -7], [8, -5], [9, 5], [-5, 8], [-14, 4]], 'shadow', 'ink', 2.7),
      polygon([[2, 5], [14, 4], [15, 9], [10, 17], [3, 15], [5, 9]], 'shadow', 'ink', 2.5),
      polygon([[-6, -7], [10, -8], [25, -13], [34, -16], [39, -12], [39, 12], [34, 16], [25, 13], [10, 8], [-6, 7], [-10, 3], [-10, -3]], 'primary', 'ink', 3),
      ellipse(13, 0, 9, 10, 'shadow', 'ink', 2.3),
      ellipse(13, 0, 5.5, 7, 'accent', 'ink', 1.7),
      circle(13, 0, 2.3, 'flash', 'ink', 1.2),
      polygon([[24, -14], [34, -18], [40, -15], [43, -10], [43, 10], [40, 15], [34, 18], [24, 14]], 'accent', 'ink', 2.7),
      ellipse(40, 0, 4.5, 10.5, 'shadow', 'ink', 2.2),
      ellipse(41, 0, 2.2, 6.5, 'ink', 'highlight', 1.2),
      polygon([[2, -8], [6, -14], [17, -16], [22, -12], [19, -9]], 'shadow', 'ink', 2),
      line([7, -12], [17, -13], 2, 'highlight', undefined, 0),
      line([-3, -5], [7, -6], 1.5, 'highlight', undefined, 0),
      circle(26, -8, 1.8, 'highlight', 'ink', 1),
      circle(26, 8, 1.8, 'highlight', 'ink', 1),
    ),
    icon: shape(
      polygon([[-16, -6], [0, -8], [12, -13], [18, -15], [22, -11], [22, 11], [18, 15], [12, 13], [0, 8], [-16, 6]], 'primary', 'ink', 2.7),
      ellipse(1, 0, 7, 8, 'shadow', 'ink', 2),
      ellipse(1, 0, 3.5, 5, 'accent', 'ink', 1.3),
      polygon([[10, -14], [19, -17], [24, -12], [24, 12], [19, 17], [10, 14]], 'accent', 'ink', 2.2),
      ellipse(21, 0, 3, 9, 'shadow', 'highlight', 1.5),
      circle(-11, 0, 2.3, 'flash', 'ink', 1),
    ),
    heldScale: 1,
    iconScale: 0.9,
    pose: 'heavy',
    activationEffect: 'muzzle',
    transitionStyle: 'lob',
    impactStyle: 'heavy-blast',
    audio: { fire: 'mortar-fire', impact: 'mortar-impact' },
    projectiles: {
      primary: projectile(
        shape(
          polygon([[-12, -5], [4, -5], [10, -3], [14, 0], [10, 3], [4, 5], [-12, 5], [-16, 2], [-16, -2]], 'primary', 'ink', 2.2),
          polygon([[3, -5], [10, -3], [14, 0], [10, 3], [3, 5]], 'highlight', 'ink', 1.3),
          polygon([[-12, -7], [-5, -5], [-5, 5], [-12, 7]], 'accent', 'ink', 1.7),
          line([-1, -5], [-1, 5], 2.2, 'accent', 'ink', 0.8),
          circle(5, 0, 2, 'flash', 'ink', 1),
          line([-14, -2], [-14, 2], 2, 'shadow', undefined, 0),
        ),
      ),
    },
  }),
  'timed-grenade': defineWeapon('timed-grenade', {
    held: shape(
      polygon([[-14, -3], [-2, -7], [8, -5], [9, 5], [-5, 8], [-14, 4]], 'shadow', 'ink', 2.6),
      polygon([[1, 5], [12, 4], [14, 8], [9, 17], [2, 15], [4, 9]], 'shadow', 'ink', 2.4),
      polygon([[-6, -7], [20, -7], [28, -11], [36, -9], [40, -5], [40, 5], [36, 9], [28, 11], [20, 7], [-6, 7], [-10, 3], [-10, -3]], 'primary', 'ink', 2.8),
      polygon([[18, -9], [29, -12], [36, -9], [39, -5], [39, 5], [36, 9], [29, 12], [18, 9]], 'accent', 'ink', 2.3),
      circle(27, 0, 8, 'shadow', 'ink', 2),
      circle(27, 0, 5.5, 'neutral', 'accent', 1.6),
      circle(27, 0, 1.8, 'flash', 'ink', 1),
      line([27, 0], [27, -3.7], 1.4, 'ink', undefined, 0),
      line([27, 0], [30, 2], 1.4, 'ink', undefined, 0),
      polygon([[36, -7], [43, -6], [46, -3], [46, 3], [43, 6], [36, 7]], 'shadow', 'ink', 2),
      ellipse(44, 0, 2.8, 4, 'ink', 'highlight', 1),
      polygon([[3, -7], [8, -12], [18, -12], [21, -7]], 'shadow', 'ink', 2),
      line([8, -10], [17, -10], 1.8, 'highlight', undefined, 0),
      line([-2, -5], [14, -5], 1.4, 'highlight', undefined, 0),
      circle(8, 0, 1.8, 'accent', 'ink', 1),
    ),
    icon: shape(
      circle(0, 2, 11, 'primary', 'ink', 2.7),
      polygon([[-8, -5], [-4, -10], [4, -10], [8, -5], [6, 8], [-6, 8]], 'accent', 'ink', 1.7),
      circle(0, 2, 6.5, 'neutral', 'ink', 1.7),
      circle(0, 2, 1.5, 'flash', 'ink', 1),
      line([0, 2], [0, -2.5], 1.5, 'ink', undefined, 0),
      line([0, 2], [3.5, 4], 1.5, 'ink', undefined, 0),
      polygon([[-5, -10], [-3, -15], [3, -15], [5, -10]], 'shadow', 'ink', 2),
      line([2, -15], [7, -18], 2, 'accent', 'ink', 1),
      circle(8.5, -18.5, 1.8, 'flash', 'ink', 1),
    ),
    heldScale: 1,
    iconScale: 0.9,
    pose: 'two-hand',
    activationEffect: 'muzzle',
    transitionStyle: 'lob',
    impactStyle: 'bounce-blast',
    audio: { fire: 'grenade-fire', impact: 'grenade-impact' },
    motionBob: 0.8,
    projectiles: {
      primary: projectile(
        shape(
          circle(0, 1, 8, 'primary', 'ink', 2.5),
          polygon([[-6, -4], [-3, -7], [3, -7], [6, -4], [5, 6], [-5, 6]], 'accent', 'ink', 1.5),
          circle(0, 1, 4.8, 'neutral', 'ink', 1.5),
          circle(0, 1, 1.3, 'flash', 'ink', 0.8),
          line([0, 1], [0, -2.5], 1.3, 'ink', undefined, 0),
          line([0, 1], [2.8, 2.8], 1.3, 'ink', undefined, 0),
          polygon([[-4, -7], [-3, -11], [3, -11], [4, -7]], 'shadow', 'ink', 1.7),
          line([2, -11], [6, -14], 1.7, 'accent', 'ink', 0.8),
          circle(7, -15, 1.5, 'flash', undefined, 0),
        ),
        1,
        4,
      ),
    },
  }),
  'scatter-shot': defineWeapon('scatter-shot', {
    held: shape(
      polygon([[-15, -3], [-3, -7], [8, -5], [9, 5], [-5, 8], [-15, 4]], 'shadow', 'ink', 2.7),
      polygon([[1, 5], [12, 4], [14, 8], [9, 17], [2, 15], [4, 9]], 'shadow', 'ink', 2.4),
      polygon([[-6, -7], [15, -7], [25, -11], [38, -15], [44, -12], [46, -7], [46, 7], [44, 12], [38, 15], [25, 11], [15, 7], [-6, 7], [-10, 3], [-10, -3]], 'primary', 'ink', 2.9),
      ellipse(13, 0, 7, 8.5, 'shadow', 'ink', 2),
      circle(13, 0, 4.2, 'accent', 'ink', 1.5),
      circle(13, 0, 1.7, 'flash', 'ink', 1),
      polygon([[22, -11], [39, -17], [45, -14], [48, -9], [48, -3], [24, -2]], 'accent', 'ink', 2.2),
      polygon([[24, -2], [48, -3], [50, 0], [48, 3], [24, 2]], 'neutral', 'ink', 2),
      polygon([[22, 11], [24, 2], [48, 3], [48, 9], [45, 14], [39, 17]], 'accent', 'ink', 2.2),
      ellipse(45, -9, 3.5, 4.2, 'shadow', 'highlight', 1.3),
      ellipse(48, 0, 3.2, 3.5, 'shadow', 'highlight', 1.3),
      ellipse(45, 9, 3.5, 4.2, 'shadow', 'highlight', 1.3),
      polygon([[2, -7], [7, -12], [17, -12], [21, -8], [18, -7]], 'shadow', 'ink', 2),
      line([7, -10], [16, -10], 1.7, 'highlight', undefined, 0),
      line([-2, -5], [8, -5], 1.4, 'highlight', undefined, 0),
    ),
    icon: shape(
      polygon([[-18, -6], [-3, -7], [8, -12], [17, -16], [22, -13], [25, -8], [25, 8], [22, 13], [17, 16], [8, 12], [-3, 7], [-18, 6]], 'primary', 'ink', 2.7),
      circle(-4, 0, 5.5, 'shadow', 'ink', 1.7),
      circle(-4, 0, 2.5, 'flash', 'accent', 1.2),
      polygon([[5, -12], [18, -17], [24, -13], [27, -7], [9, -2]], 'accent', 'ink', 1.8),
      polygon([[9, -2], [27, -7], [29, 0], [27, 7], [9, 2]], 'neutral', 'ink', 1.8),
      polygon([[5, 12], [9, 2], [27, 7], [24, 13], [18, 17]], 'accent', 'ink', 1.8),
      circle(23, -10, 2.5, 'shadow', 'highlight', 1),
      circle(26, 0, 2.5, 'shadow', 'highlight', 1),
      circle(23, 10, 2.5, 'shadow', 'highlight', 1),
    ),
    heldScale: 1,
    iconScale: 0.9,
    pose: 'two-hand',
    activationEffect: 'muzzle',
    transitionStyle: 'scatter',
    impactStyle: 'pellet-hit',
    audio: { fire: 'scatter-fire', impact: 'damage' },
    projectiles: {},
  }),
  'cluster-charge': defineWeapon('cluster-charge', {
    held: shape(
      polygon([[-15, -4], [-3, -9], [8, -7], [10, 6], [-5, 9], [-15, 5]], 'shadow', 'ink', 2.8),
      polygon([[0, 7], [13, 6], [15, 10], [10, 18], [2, 16], [4, 11]], 'shadow', 'ink', 2.5),
      polygon([[-7, -10], [33, -10], [40, -7], [45, -3], [45, 3], [40, 7], [33, 10], [-7, 10], [-11, 5], [-11, -5]], 'primary', 'ink', 3),
      polygon([[0, -7], [28, -7], [34, -4], [34, 4], [28, 7], [0, 7]], 'shadow', 'ink', 1.8),
      polygon([[1, -6], [10, -6], [13, -3], [13, 3], [10, 6], [1, 6], [-2, 3], [-2, -3]], 'accent', 'ink', 1.6),
      polygon([[12, -6], [21, -6], [24, -3], [24, 3], [21, 6], [12, 6], [9, 3], [9, -3]], 'neutral', 'ink', 1.6),
      polygon([[23, -6], [31, -6], [35, -3], [35, 3], [31, 6], [23, 6], [20, 3], [20, -3]], 'accent', 'ink', 1.6),
      circle(5.5, 0, 2.3, 'flash', 'ink', 1),
      circle(16.5, 0, 2.3, 'flash', 'ink', 1),
      circle(27.5, 0, 2.3, 'flash', 'ink', 1),
      polygon([[33, -9], [41, -8], [47, -4], [47, 4], [41, 8], [33, 9]], 'accent', 'ink', 2.2),
      ellipse(44, 0, 3.5, 5, 'shadow', 'highlight', 1.3),
      polygon([[2, -10], [7, -15], [22, -15], [27, -10]], 'shadow', 'ink', 2.2),
      line([8, -13], [21, -13], 1.8, 'highlight', undefined, 0),
      line([-3, -8], [29, -8], 1.4, 'highlight', undefined, 0),
    ),
    icon: shape(
      polygon([[-17, -10], [10, -10], [17, -7], [22, -3], [22, 3], [17, 7], [10, 10], [-17, 10], [-22, 5], [-22, -5]], 'primary', 'ink', 2.8),
      polygon([[-14, -7], [10, -7], [16, -3], [16, 3], [10, 7], [-14, 7]], 'shadow', 'ink', 1.6),
      polygon([[-13, -6], [-5, -6], [-2, -3], [-2, 3], [-5, 6], [-13, 6]], 'accent', 'ink', 1.4),
      polygon([[-3, -6], [5, -6], [8, -3], [8, 3], [5, 6], [-3, 6]], 'neutral', 'ink', 1.4),
      polygon([[7, -6], [13, -5], [17, -2], [17, 2], [13, 5], [7, 6]], 'accent', 'ink', 1.4),
      circle(-8, 0, 2, 'flash', 'ink', 1),
      circle(2, 0, 2, 'flash', 'ink', 1),
      circle(12, 0, 2, 'flash', 'ink', 1),
    ),
    heldScale: 1,
    iconScale: 0.9,
    pose: 'heavy',
    activationEffect: 'muzzle',
    transitionStyle: 'split',
    impactStyle: 'cluster-burst',
    audio: { fire: 'cluster-fire', impact: 'cluster-impact' },
    projectiles: {
      primary: projectile(
        shape(
          polygon([[-14, -6], [7, -6], [13, -3], [17, 0], [13, 3], [7, 6], [-14, 6], [-18, 3], [-18, -3]], 'primary', 'ink', 2.2),
          polygon([[-11, -4], [-4, -4], [-2, -2], [-2, 2], [-4, 4], [-11, 4]], 'accent', 'ink', 1.2),
          polygon([[-3, -4], [4, -4], [6, -2], [6, 2], [4, 4], [-3, 4]], 'neutral', 'ink', 1.2),
          polygon([[5, -4], [11, -3], [14, 0], [11, 3], [5, 4]], 'accent', 'ink', 1.2),
          circle(-7, 0, 1.5, 'flash', 'ink', 0.8),
          circle(1, 0, 1.5, 'flash', 'ink', 0.8),
          circle(9, 0, 1.5, 'flash', 'ink', 0.8),
        ),
      ),
      'cluster-child': projectile(
        shape(
          polygon([[-8, -4], [3, -5], [8, -2], [10, 0], [8, 2], [3, 5], [-8, 4], [-11, 0]], 'accent', 'ink', 1.8),
          polygon([[1, -4], [7, -2], [10, 0], [7, 2], [1, 4]], 'highlight', 'ink', 1),
          line([-4, -4], [-4, 4], 1.8, 'primary', 'ink', 0.7),
          circle(3, 0, 1.5, 'flash', 'ink', 0.7),
          polygon([[-8, -4], [-11, -7], [-3, -4]], 'primary', 'ink', 1),
          polygon([[-8, 4], [-11, 7], [-3, 4]], 'primary', 'ink', 1),
        ),
        0.82,
        6,
      ),
    },
  }),
  'terrain-boring-drill': defineWeapon('terrain-boring-drill', {
    held: shape(
      polygon([[-15, -4], [-4, -9], [8, -7], [10, 6], [-5, 9], [-15, 5]], 'shadow', 'ink', 2.8),
      polygon([[-1, 7], [11, 6], [14, 10], [9, 18], [1, 16], [3, 11]], 'shadow', 'ink', 2.5),
      polygon([[-7, -9], [17, -9], [24, -6], [27, -3], [27, 3], [24, 6], [17, 9], [-7, 9], [-11, 5], [-11, -5]], 'primary', 'ink', 3),
      ellipse(10, 0, 9, 9, 'shadow', 'ink', 2.2),
      circle(10, 0, 5.5, 'accent', 'ink', 1.7),
      circle(10, 0, 2.2, 'flash', 'ink', 1),
      polygon([[20, -8], [28, -10], [33, -8], [33, 8], [28, 10], [20, 8]], 'neutral', 'ink', 2.2),
      ellipse(29, 0, 4, 7, 'shadow', 'highlight', 1.3),
      polygon([[29, -7], [35, -11], [39, -8], [36, -4], [43, -7], [47, -3], [41, 0], [48, 3], [43, 7], [36, 4], [39, 8], [35, 11], [29, 7]], 'accent', 'ink', 2.1),
      polygon([[34, -6], [41, -8], [38, -3], [46, -4], [41, 0], [47, 4], [38, 3], [41, 8], [34, 6]], 'highlight', 'ink', 1.3),
      polygon([[2, -9], [7, -14], [18, -14], [22, -9]], 'shadow', 'ink', 2.2),
      line([7, -12], [17, -12], 1.8, 'highlight', undefined, 0),
      line([-3, -7], [18, -7], 1.5, 'highlight', undefined, 0),
      circle(-2, 0, 1.8, 'accent', 'ink', 1),
    ),
    icon: shape(
      polygon([[-20, -9], [-3, -9], [5, -6], [8, -3], [8, 3], [5, 6], [-3, 9], [-20, 9]], 'primary', 'ink', 2.8),
      ellipse(-5, 0, 7, 8, 'shadow', 'ink', 2),
      circle(-5, 0, 4, 'accent', 'ink', 1.4),
      polygon([[3, -8], [10, -12], [14, -8], [12, -4], [20, -7], [24, -3], [18, 0], [25, 3], [20, 7], [12, 4], [14, 8], [10, 12], [3, 8]], 'accent', 'ink', 2),
      polygon([[8, -6], [16, -8], [13, -3], [22, -4], [17, 0], [23, 4], [13, 3], [16, 8], [8, 6]], 'highlight', 'ink', 1.2),
      circle(-5, 0, 1.7, 'flash', 'ink', 1),
    ),
    heldScale: 1,
    iconScale: 0.9,
    pose: 'two-hand',
    activationEffect: 'muzzle',
    transitionStyle: 'spin',
    impactStyle: 'drill-burst',
    audio: { fire: 'drill-fire', impact: 'drill-impact' },
    motionSpin: 10,
    projectiles: {
      primary: projectile(
        shape(
          polygon([[-13, -6], [-3, -6], [3, -4], [5, -2], [5, 2], [3, 4], [-3, 6], [-13, 6]], 'primary', 'ink', 2.2),
          ellipse(-3, 0, 5, 5.5, 'shadow', 'ink', 1.6),
          circle(-3, 0, 2.5, 'flash', 'accent', 1),
          polygon([[0, -5], [6, -8], [9, -5], [7, -2], [13, -4], [17, 0], [13, 4], [7, 2], [9, 5], [6, 8], [0, 5]], 'accent', 'ink', 1.8),
          polygon([[5, -4], [11, -5], [8, -1.5], [15, 0], [8, 1.5], [11, 5], [5, 4]], 'highlight', 'ink', 1),
          line([-11, -3.5], [-5, -3.5], 1.2, 'highlight', undefined, 0),
        ),
        1,
        12,
      ),
    },
  }),
  'dirt-mounder': defineWeapon('dirt-mounder', {
    held: shape(
      polygon([[-13, -5], [-2, -9], [9, -7], [11, 7], [-4, 10], [-14, 5]], 'shadow', 'ink', 2.8),
      polygon([[0, 7], [11, 6], [14, 10], [9, 18], [1, 16], [3, 11]], 'shadow', 'ink', 2.4),
      polygon([[-7, -9], [27, -9], [36, -12], [43, -7], [46, 0], [43, 7], [36, 12], [27, 9], [-7, 9], [-11, 4], [-11, -4]], 'primary', 'ink', 3),
      ellipse(12, 0, 10, 10, 'accent', 'ink', 2),
      ellipse(12, 0, 6, 6, 'shadow', 'highlight', 1.5),
      circle(12, 0, 2.2, 'flash', 'ink', 1),
      polygon([[27, -9], [38, -13], [46, -8], [50, -3], [50, 3], [46, 8], [38, 13], [27, 9]], 'accent', 'ink', 2.3),
      ellipse(46, 0, 4, 6, 'shadow', 'highlight', 1.4),
      line([-2, -7], [25, -7], 1.5, 'highlight', undefined, 0),
    ),
    icon: shape(
      polygon([[-20, -9], [8, -9], [17, -13], [26, -9], [31, -4], [31, 4], [26, 9], [17, 13], [8, 9], [-20, 9]], 'primary', 'ink', 2.8),
      ellipse(-4, 0, 9, 9, 'accent', 'ink', 2),
      circle(-4, 0, 3, 'flash', 'shadow', 1.2),
      polygon([[7, -9], [18, -14], [28, -10], [34, -5], [34, 5], [28, 10], [18, 14], [7, 9]], 'accent', 'ink', 2.2),
      ellipse(29, 0, 3.5, 6.5, 'shadow', 'highlight', 1.3),
    ),
    heldScale: 1,
    iconScale: 0.88,
    pose: 'two-hand',
    activationEffect: 'muzzle',
    transitionStyle: 'lob',
    impactStyle: 'blast',
    audio: { fire: 'grenade-fire', impact: 'shoe-impact' },
    motionBob: 0.45,
    projectiles: {
      primary: projectile(
        shape(
          ellipse(0, 0, 10, 7, 'primary', 'ink', 2.2),
          polygon([[-7, -6], [5, -6], [9, -3], [9, 3], [5, 6], [-7, 6]], 'accent', 'ink', 1.4),
          line([-3, -6], [-3, 6], 2, 'highlight', 'ink', 0.8),
          circle(4, 0, 2, 'flash', 'ink', 1),
        ),
        1,
        5,
      ),
    },
  }),
  'wind-blaster': defineWeapon('wind-blaster', {
    held: shape(
      polygon([[-14, -4], [-3, -8], [8, -6], [10, 6], [-5, 9], [-14, 5]], 'shadow', 'ink', 2.7),
      polygon([[0, 6], [12, 5], [14, 9], [9, 17], [2, 15], [4, 10]], 'shadow', 'ink', 2.4),
      polygon([[-7, -8], [31, -8], [40, -12], [49, -8], [54, -3], [54, 3], [49, 8], [40, 12], [31, 8], [-7, 8], [-11, 4], [-11, -4]], 'primary', 'ink', 3),
      ellipse(12, 0, 8, 9, 'neutral', 'ink', 2),
      circle(12, 0, 4, 'accent', 'highlight', 1.3),
      circle(12, 0, 1.7, 'flash', 'ink', 0.8),
      line([21, -6], [39, -10], 2, 'accent', 'ink', 0.8),
      line([21, 0], [45, 0], 2, 'flash', 'accent', 0.8),
      line([21, 6], [39, 10], 2, 'accent', 'ink', 0.8),
      ellipse(50, 0, 5, 8, 'shadow', 'highlight', 1.5),
      line([-2, -6], [27, -6], 1.4, 'highlight', undefined, 0),
    ),
    icon: shape(
      polygon([[-23, -8], [8, -8], [18, -12], [29, -9], [36, -4], [36, 4], [29, 9], [18, 12], [8, 8], [-23, 8]], 'primary', 'ink', 2.8),
      circle(-7, 0, 7, 'neutral', 'ink', 1.7),
      circle(-7, 0, 3.5, 'accent', 'highlight', 1.2),
      line([5, -5], [27, -8], 2, 'accent', 'ink', 0.7),
      line([5, 0], [33, 0], 2, 'flash', 'accent', 0.7),
      line([5, 5], [27, 8], 2, 'accent', 'ink', 0.7),
      ellipse(32, 0, 4, 7, 'shadow', 'highlight', 1.3),
    ),
    heldScale: 1,
    iconScale: 0.86,
    pose: 'two-hand',
    activationEffect: 'muzzle',
    transitionStyle: 'recoil',
    impactStyle: 'blast',
    audio: { fire: 'cannon-fire', impact: 'cryo-impact' },
    motionSpin: 7,
    projectiles: {
      primary: projectile(
        shape(
          circle(0, 0, 8, 'accent', 'ink', 2),
          ellipse(0, 0, 11, 4, undefined, 'highlight', 1.5),
          ellipse(0, 0, 4, 11, undefined, 'flash', 1.3),
          circle(0, 0, 3, 'primary', 'highlight', 1),
        ),
        1,
        7,
      ),
    },
  }),
  'gravity-orb': defineWeapon('gravity-orb', {
    held: shape(
      polygon([[-14, -4], [-3, -8], [8, -6], [10, 6], [-5, 9], [-14, 5]], 'shadow', 'ink', 2.7),
      polygon([[0, 6], [12, 5], [14, 9], [9, 17], [2, 15], [4, 10]], 'shadow', 'ink', 2.4),
      polygon([[-7, -8], [28, -8], [37, -12], [45, -8], [49, -3], [49, 3], [45, 8], [37, 12], [28, 8], [-7, 8], [-11, 4], [-11, -4]], 'primary', 'ink', 3),
      circle(11, 0, 8, 'shadow', 'accent', 2),
      circle(11, 0, 4, 'accent', 'highlight', 1.3),
      circle(11, 0, 1.7, 'flash', 'ink', 0.8),
      ellipse(34, 0, 11, 13, undefined, 'accent', 2.5),
      ellipse(34, 0, 6, 9, 'shadow', 'flash', 1.5),
      circle(34, 0, 3, 'ink', 'highlight', 1),
      line([-2, -6], [25, -6], 1.4, 'highlight', undefined, 0),
    ),
    icon: shape(
      polygon([[-23, -8], [6, -8], [15, -12], [24, -9], [30, -4], [30, 4], [24, 9], [15, 12], [6, 8], [-23, 8]], 'primary', 'ink', 2.8),
      circle(-8, 0, 7, 'shadow', 'accent', 1.7),
      circle(-8, 0, 3, 'flash', 'ink', 1),
      ellipse(19, 0, 11, 14, undefined, 'accent', 2.4),
      ellipse(19, 0, 6, 9, 'shadow', 'flash', 1.4),
      circle(19, 0, 3, 'ink', 'highlight', 1),
    ),
    heldScale: 1,
    iconScale: 0.86,
    pose: 'two-hand',
    activationEffect: 'muzzle',
    transitionStyle: 'recoil',
    impactStyle: 'blast',
    audio: { fire: 'cryo-fire', impact: 'teleport' },
    motionSpin: 5,
    motionBob: 0.5,
    projectiles: {
      primary: projectile(
        shape(
          circle(0, 0, 7, 'shadow', 'ink', 2),
          circle(0, 0, 3.5, 'accent', 'highlight', 1.2),
          ellipse(0, 0, 13, 6, undefined, 'flash', 1.6),
          ellipse(0, 0, 6, 13, undefined, 'accent', 1.4),
          circle(0, 0, 1.8, 'flash', 'ink', 0.8),
        ),
        1,
        5,
      ),
    },
  }),
  'ricochet-rifle': defineWeapon('ricochet-rifle', {
    held: shape(
      polygon([[-16, -3], [-4, -7], [8, -5], [9, 5], [-6, 8], [-16, 4]], 'shadow', 'ink', 2.6),
      polygon([[3, 4], [14, 4], [14, 9], [10, 17], [3, 15], [6, 8]], 'shadow', 'ink', 2.4),
      polygon([[-7, -6], [36, -6], [45, -4], [58, -2], [63, 0], [58, 2], [45, 4], [36, 6], [-7, 6], [-11, 3], [-11, -3]], 'primary', 'ink', 2.8),
      polygon([[2, -3], [40, -3], [53, -1], [61, 0], [53, 1], [40, 3], [2, 3]], 'shadow', 'ink', 1.4),
      line([8, 0], [58, 0], 2.2, 'flash', 'accent', 1),
      polygon([[23, -8], [29, -8], [33, -5], [33, 5], [29, 8], [23, 8]], 'accent', 'ink', 1.8),
      circle(28, 0, 2.2, 'flash', 'ink', 1),
      polygon([[8, -6], [13, -12], [28, -12], [33, -6]], 'shadow', 'ink', 2),
      line([14, -10], [27, -10], 1.8, 'highlight', undefined, 0),
    ),
    icon: shape(
      polygon([[-25, -5], [11, -5], [22, -3], [34, 0], [22, 3], [11, 5], [-25, 5]], 'primary', 'ink', 2.7),
      polygon([[-17, -2], [13, -2], [28, 0], [13, 2], [-17, 2]], 'shadow', 'ink', 1.2),
      line([-10, 0], [32, 0], 2, 'flash', 'accent', 0.9),
      polygon([[-1, -7], [5, -7], [8, -4], [8, 4], [5, 7], [-1, 7]], 'accent', 'ink', 1.7),
      circle(3, 0, 2, 'flash', 'ink', 0.9),
    ),
    heldScale: 1,
    iconScale: 0.82,
    pose: 'two-hand',
    activationEffect: 'muzzle',
    transitionStyle: 'snap',
    impactStyle: 'pierce',
    audio: { fire: 'cannon-fire', impact: 'cannon-impact' },
    motionSpin: 12,
    projectiles: {
      primary: projectile(
        shape(
          polygon([[-9, -3], [5, -3], [11, 0], [5, 3], [-9, 3], [-13, 0]], 'accent', 'ink', 1.6),
          line([-7, 0], [8, 0], 1.8, 'flash', 'highlight', 0.7),
          circle(3, 0, 1.7, 'flash', 'ink', 0.7),
        ),
        0.9,
        12,
      ),
    },
  }),
  'pocket-knife': defineWeapon('pocket-knife', {
    held: shape(
      polygon([[-14, -5], [6, -6], [12, -3], [13, 3], [7, 6], [-14, 5], [-18, 2], [-18, -2]], 'primary', 'ink', 2.8),
      polygon([[-11, -2.5], [5, -3.5], [9, -1.5], [9, 1.5], [5, 3.5], [-11, 2.5]], 'shadow', 'ink', 1.4),
      polygon([[-8, -2], [3, -2.5], [6, -1], [6, 1], [3, 2.5], [-8, 2]], 'accent', 'ink', 1),
      line([-13, -4], [5, -5], 1.4, 'highlight', undefined, 0),
      circle(7, 0, 3.2, 'neutral', 'ink', 1.5),
      circle(7, 0, 1.4, 'flash', 'ink', 0.8),
      polygon([[9, -4], [14, -5], [18, -3], [18, 3], [14, 5], [9, 4]], 'shadow', 'ink', 2),
      polygon([[14, -3], [25, -6], [39, -4], [48, 0], [39, 4], [25, 6], [14, 3]], 'neutral', 'ink', 2.5),
      polygon([[18, 1], [39, 2], [48, 0], [39, 4], [25, 6], [14, 3]], 'highlight', 'ink', 1.2),
      polygon([[21, -5], [24, -8], [27, -5], [30, -8], [33, -4]], 'shadow', 'ink', 1.2),
      line([20, -2], [39, -2], 1.2, 'highlight', undefined, 0),
      circle(-10, 0, 1.5, 'accent', 'ink', 0.8),
    ),
    icon: shape(
      polygon([[-22, -7], [-3, -8], [4, -4], [5, 4], [-3, 8], [-22, 7], [-26, 3], [-26, -3]], 'primary', 'ink', 3),
      polygon([[-18, -3], [-5, -4], [0, -2], [0, 2], [-5, 4], [-18, 3]], 'accent', 'ink', 1.3),
      circle(-3, 0, 3.5, 'neutral', 'ink', 1.5),
      circle(-3, 0, 1.5, 'flash', 'ink', 0.8),
      polygon([[1, -5], [7, -7], [11, -4], [11, 4], [7, 7], [1, 5]], 'shadow', 'ink', 2),
      polygon([[7, -4], [18, -8], [31, -5], [38, 0], [31, 5], [18, 8], [7, 4]], 'neutral', 'ink', 2.7),
      polygon([[11, 1], [31, 2], [38, 0], [31, 5], [18, 8], [7, 4]], 'highlight', 'ink', 1.2),
      polygon([[15, -7], [18, -10], [21, -7], [24, -10], [28, -6]], 'shadow', 'ink', 1.2),
    ),
    heldScale: 1,
    iconScale: 0.82,
    pose: 'one-hand',
    activationEffect: 'slash',
    transitionStyle: 'slash',
    impactStyle: 'knife-strike',
    audio: { fire: 'knife-swing', impact: 'knife-hit' },
    projectiles: {},
    meleeOutcomes: {
      hit: { palette: 'impact', impactStyle: 'knife-strike', sound: 'knife-hit' },
      miss: { palette: 'miss', impactStyle: 'knife-miss', sound: 'knife-swing' },
      blocked: {
        palette: 'blocked',
        impactStyle: 'knife-blocked',
        sound: 'knife-block',
      },
    },
  }),
  'bomb-beacon': defineWeapon('bomb-beacon', {
    held: shape(
      polygon([[-14, -4], [-3, -8], [8, -6], [10, 6], [-5, 9], [-14, 5]], 'shadow', 'ink', 2.7),
      polygon([[0, 6], [12, 5], [14, 9], [9, 17], [2, 15], [4, 10]], 'shadow', 'ink', 2.4),
      polygon([[-7, -8], [25, -8], [33, -11], [39, -7], [42, -3], [42, 3], [39, 7], [33, 11], [25, 8], [-7, 8], [-11, 4], [-11, -4]], 'primary', 'ink', 2.9),
      polygon([[3, -5], [24, -5], [29, -2], [29, 2], [24, 5], [3, 5]], 'shadow', 'ink', 1.5),
      circle(13, 0, 5.5, 'neutral', 'ink', 1.7),
      circle(13, 0, 2.4, 'flash', 'accent', 1.2),
      polygon([[26, -8], [35, -12], [42, -8], [46, -3], [46, 3], [42, 8], [35, 12], [26, 8]], 'accent', 'ink', 2.2),
      ellipse(41, 0, 4, 6.5, 'shadow', 'highlight', 1.3),
      polygon([[1, -8], [5, -14], [16, -14], [20, -9]], 'shadow', 'ink', 2),
      line([6, -12], [15, -12], 1.8, 'highlight', undefined, 0),
      line([7, -14], [7, -22], 2.2, 'accent', 'ink', 1),
      line([7, -20], [2, -25], 1.5, 'accent', 'ink', 0.8),
      line([7, -20], [12, -25], 1.5, 'accent', 'ink', 0.8),
      circle(7, -22, 2.5, 'flash', 'ink', 1),
      circle(2, -25, 1.5, 'highlight', 'ink', 0.7),
      circle(12, -25, 1.5, 'highlight', 'ink', 0.7),
      line([-3, -6], [22, -6], 1.4, 'highlight', undefined, 0),
    ),
    icon: shape(
      polygon([[-13, -7], [13, -7], [19, -3], [19, 5], [13, 9], [-13, 9], [-19, 5], [-19, -3]], 'primary', 'ink', 2.7),
      circle(0, 1, 9, 'shadow', 'ink', 1.7),
      circle(0, 1, 5.5, 'neutral', 'accent', 1.5),
      circle(0, 1, 2.2, 'flash', 'ink', 1),
      polygon([[10, -8], [17, -11], [22, -7], [24, -2], [24, 4], [19, 8], [13, 9]], 'accent', 'ink', 1.8),
      line([0, -8], [0, -18], 2.5, 'accent', 'ink', 1),
      line([0, -16], [-5, -21], 1.7, 'accent', 'ink', 0.8),
      line([0, -16], [5, -21], 1.7, 'accent', 'ink', 0.8),
      circle(0, -18, 2.5, 'flash', 'ink', 1),
      circle(-5, -21, 1.5, 'highlight', 'ink', 0.7),
      circle(5, -21, 1.5, 'highlight', 'ink', 0.7),
    ),
    heldScale: 1,
    iconScale: 0.85,
    pose: 'device',
    activationEffect: 'muzzle',
    transitionStyle: 'signal',
    impactStyle: 'beacon-strike',
    audio: { fire: 'beacon-fire', impact: 'beacon-impact' },
    motionBob: 0.5,
    projectiles: {
      primary: projectile(
        shape(
          polygon([[-9, -5], [5, -5], [10, -2], [12, 0], [10, 2], [5, 5], [-9, 5], [-13, 2], [-13, -2]], 'accent', 'ink', 2),
          polygon([[3, -5], [10, -2], [12, 0], [10, 2], [3, 5]], 'highlight', 'ink', 1),
          line([-4, -5], [-4, 5], 2, 'primary', 'ink', 0.8),
          circle(4, 0, 1.8, 'flash', 'ink', 0.8),
          line([-10, -4], [-13, -8], 1.5, 'accent', 'ink', 0.7),
          line([-10, 4], [-13, 8], 1.5, 'accent', 'ink', 0.7),
          circle(-14, -9, 1.3, 'highlight', 'ink', 0.6),
          circle(-14, 9, 1.3, 'highlight', 'ink', 0.6),
        ),
      ),
      'beacon-bomb': projectile(
        shape(
          polygon([[-12, -7], [4, -7], [10, -4], [14, 0], [10, 4], [4, 7], [-12, 7], [-16, 3], [-16, -3]], 'primary', 'ink', 2.5),
          polygon([[3, -7], [10, -4], [14, 0], [10, 4], [3, 7]], 'highlight', 'ink', 1.3),
          polygon([[-7, -7], [-11, -12], [-2, -7]], 'accent', 'ink', 1.7),
          polygon([[-7, 7], [-11, 12], [-2, 7]], 'accent', 'ink', 1.7),
          line([-4, -7], [-4, 7], 2.5, 'accent', 'ink', 1),
          circle(4, 0, 2.2, 'flash', 'ink', 1),
          polygon([[-14, -3], [-20, 0], [-14, 3]], 'shadow', 'ink', 1.3),
        ),
        1.08,
      ),
    },
  }),
  'fork-rocket': defineWeapon('fork-rocket', {
    held: shape(
      polygon([[-15, -4], [-3, -8], [8, -6], [10, 6], [-5, 9], [-15, 5]], 'shadow', 'ink', 2.8),
      polygon([[0, 6], [12, 5], [14, 9], [9, 17], [2, 15], [4, 10]], 'shadow', 'ink', 2.4),
      polygon([[-7, -8], [20, -8], [28, -5], [33, -2], [33, 2], [28, 5], [20, 8], [-7, 8], [-11, 4], [-11, -4]], 'primary', 'ink', 2.9),
      polygon([[2, -5], [23, -5], [29, -2], [29, 2], [23, 5], [2, 5]], 'shadow', 'ink', 1.5),
      circle(19, 0, 5, 'neutral', 'ink', 1.7),
      circle(19, 0, 2.2, 'flash', 'accent', 1),
      polygon([[25, -7], [31, -10], [42, -15], [48, -13], [50, -9], [44, -6], [33, -2], [28, -2]], 'accent', 'ink', 2.2),
      polygon([[28, 2], [33, 2], [44, 6], [50, 9], [48, 13], [42, 15], [31, 10], [25, 7]], 'accent', 'ink', 2.2),
      polygon([[33, -8], [43, -12], [47, -11], [43, -9], [34, -5]], 'highlight', 'ink', 1),
      polygon([[34, 5], [43, 9], [47, 11], [43, 12], [33, 8]], 'highlight', 'ink', 1),
      ellipse(47, -10, 2.8, 3.3, 'shadow', 'highlight', 1.1),
      ellipse(47, 10, 2.8, 3.3, 'shadow', 'highlight', 1.1),
      polygon([[2, -8], [7, -13], [18, -13], [22, -8]], 'shadow', 'ink', 2),
      line([7, -11], [17, -11], 1.7, 'highlight', undefined, 0),
      line([-3, -6], [17, -6], 1.4, 'highlight', undefined, 0),
    ),
    icon: shape(
      polygon([[-21, -7], [-2, -7], [7, -4], [11, 0], [7, 4], [-2, 7], [-21, 7], [-25, 3], [-25, -3]], 'primary', 'ink', 2.7),
      circle(1, 0, 4.5, 'neutral', 'ink', 1.5),
      circle(1, 0, 2, 'flash', 'accent', 1),
      polygon([[5, -5], [12, -10], [23, -16], [29, -13], [30, -9], [23, -6], [12, -2]], 'accent', 'ink', 2),
      polygon([[12, 2], [23, 6], [30, 9], [29, 13], [23, 16], [12, 10], [5, 5]], 'accent', 'ink', 2),
      line([13, -8], [25, -13], 1.3, 'highlight', undefined, 0),
      line([13, 8], [25, 13], 1.3, 'highlight', undefined, 0),
    ),
    heldScale: 1,
    iconScale: 0.9,
    pose: 'two-hand',
    activationEffect: 'muzzle',
    transitionStyle: 'split',
    impactStyle: 'fork-burst',
    audio: { fire: 'fork-fire', impact: 'fork-impact' },
    projectiles: {
      primary: projectile(
        shape(
          polygon([[-13, -5], [5, -5], [11, -3], [15, 0], [11, 3], [5, 5], [-13, 5]], 'primary', 'ink', 2),
          polygon([[3, -5], [11, -3], [15, 0], [11, 3], [3, 5]], 'highlight', 'ink', 1.1),
          line([-5, -5], [-5, 5], 2.2, 'accent', 'ink', 0.8),
          circle(5, 0, 1.8, 'flash', 'ink', 0.8),
          polygon([[-9, -5], [-14, -9], [-2, -5]], 'accent', 'ink', 1.3),
          polygon([[-9, 5], [-14, 9], [-2, 5]], 'accent', 'ink', 1.3),
          polygon([[-13, -3], [-19, 0], [-13, 3]], 'flash', 'accent', 1.2),
        ),
      ),
      'fork-child': projectile(
        shape(
          polygon([[-10, -3.5], [5, -3.5], [10, -1.5], [13, 0], [10, 1.5], [5, 3.5], [-10, 3.5]], 'accent', 'ink', 1.7),
          polygon([[4, -3.5], [10, -1.5], [13, 0], [10, 1.5], [4, 3.5]], 'highlight', 'ink', 0.9),
          polygon([[-7, -3.5], [-11, -7], [0, -3.5]], 'primary', 'ink', 1.2),
          polygon([[-7, 3.5], [-11, 7], [0, 3.5]], 'primary', 'ink', 1.2),
          circle(5, 0, 1.3, 'flash', 'ink', 0.7),
          polygon([[-10, -2], [-16, 0], [-10, 2]], 'flash', 'accent', 1),
        ),
        0.88,
      ),
    },
  }),
  'old-shoe': defineWeapon('old-shoe', {
    held: shape(
      polygon([[-16, -13], [-4, -15], [4, -12], [8, -5], [16, -2], [33, -1], [41, 4], [41, 9], [36, 12], [8, 13], [-11, 10], [-17, 4]], 'primary', 'ink', 3.2),
      polygon([[-12, -10], [-5, -12], [1, -10], [5, -4], [2, 3], [-10, 2]], 'shadow', 'ink', 2),
      polygon([[3, -4], [13, -2], [17, 6], [8, 9], [0, 4]], 'neutral', 'ink', 1.8),
      polygon([[-17, 4], [-10, 6], [9, 8], [35, 6], [41, 7], [40, 12], [35, 15], [7, 16], [-12, 12], [-18, 8]], 'accent', 'ink', 2.5),
      line([-9, 10], [35, 10], 1.8, 'shadow', undefined, 0),
      line([2, -3], [13, 3], 2, 'flash', 'ink', 0.8),
      line([3, 1], [12, -1], 2, 'flash', 'ink', 0.8),
      line([5, 5], [15, 1], 2, 'flash', 'ink', 0.8),
      circle(2, -3, 1.5, 'accent', 'ink', 0.8),
      circle(4, 1, 1.5, 'accent', 'ink', 0.8),
      circle(13, -1, 1.5, 'accent', 'ink', 0.8),
      circle(15, 2, 1.5, 'accent', 'ink', 0.8),
      polygon([[22, -1], [34, 0], [39, 4], [34, 6], [21, 5]], 'highlight', 'ink', 1.5),
    ),
    icon: shape(
      polygon([[-20, -14], [-7, -16], [2, -13], [7, -6], [15, -3], [31, -2], [40, 3], [41, 8], [36, 12], [8, 14], [-14, 11], [-21, 5]], 'primary', 'ink', 3.2),
      polygon([[-15, -10], [-7, -13], [0, -10], [4, -4], [1, 3], [-12, 2]], 'shadow', 'ink', 2),
      polygon([[2, -5], [13, -2], [17, 6], [8, 9], [0, 4]], 'neutral', 'ink', 1.8),
      polygon([[-21, 5], [-14, 7], [9, 9], [35, 7], [41, 8], [39, 13], [35, 15], [7, 17], [-15, 13], [-22, 9]], 'accent', 'ink', 2.5),
      line([1, -3], [13, 3], 2, 'flash', 'ink', 0.8),
      line([3, 1], [12, -1], 2, 'flash', 'ink', 0.8),
      line([5, 5], [15, 1], 2, 'flash', 'ink', 0.8),
      circle(1, -3, 1.5, 'accent', 'ink', 0.8),
      circle(4, 1, 1.5, 'accent', 'ink', 0.8),
      circle(13, -1, 1.5, 'accent', 'ink', 0.8),
      circle(15, 2, 1.5, 'accent', 'ink', 0.8),
      polygon([[21, -1], [33, 0], [39, 4], [34, 6], [20, 5]], 'highlight', 'ink', 1.4),
    ),
    heldScale: 1,
    iconScale: 0.86,
    pose: 'throw',
    activationEffect: 'throw',
    transitionStyle: 'throw',
    impactStyle: 'shoe-thud',
    audio: { fire: 'shoe-fire', impact: 'shoe-impact' },
    motionSpin: 5,
    motionBob: 1,
    projectiles: {
      primary: projectile(
        shape(
          polygon([[-15, -10], [-5, -12], [2, -10], [6, -4], [13, -2], [26, -1], [33, 3], [34, 7], [30, 10], [6, 12], [-10, 9], [-16, 4]], 'primary', 'ink', 2.7),
          polygon([[-11, -7], [-5, -9], [0, -7], [3, -2], [0, 3], [-9, 2]], 'shadow', 'ink', 1.5),
          polygon([[1, -3], [10, -1], [13, 6], [6, 8], [-1, 4]], 'neutral', 'ink', 1.4),
          polygon([[-16, 4], [-10, 6], [7, 8], [29, 6], [34, 7], [30, 11], [6, 13], [-11, 10], [-17, 7]], 'accent', 'ink', 2),
          line([1, -2], [10, 3], 1.5, 'flash', 'ink', 0.6),
          line([3, 2], [10, 0], 1.5, 'flash', 'ink', 0.6),
          circle(1, -2, 1.2, 'accent', 'ink', 0.6),
          circle(10, 0, 1.2, 'accent', 'ink', 0.6),
          polygon([[17, -1], [27, 0], [32, 4], [27, 6], [16, 5]], 'highlight', 'ink', 1.1),
        ),
        0.95,
        5,
      ),
    },
  }),
  'siege-bazooka': defineWeapon('siege-bazooka', {
    held: shape(
      polygon([[-24, -7], [-12, -13], [0, -11], [2, 10], [-13, 13], [-24, 7]], 'shadow', 'ink', 3.2),
      polygon([[5, 10], [20, 9], [22, 15], [16, 24], [7, 22], [10, 16]], 'shadow', 'ink', 3),
      polygon([[31, 9], [43, 8], [45, 14], [40, 21], [33, 20], [36, 14]], 'shadow', 'ink', 2.7),
      polygon([[-17, -13], [50, -13], [59, -17], [68, -13], [73, -7], [73, 7], [68, 13], [59, 17], [50, 13], [-17, 13], [-22, 8], [-22, -8]], 'primary', 'ink', 3.6),
      polygon([[-9, -9], [47, -9], [55, -6], [58, -3], [58, 3], [55, 6], [47, 9], [-9, 9]], 'shadow', 'ink', 2),
      polygon([[-7, -7], [24, -7], [29, -3], [29, 3], [24, 7], [-7, 7]], 'accent', 'ink', 1.8),
      line([2, 0], [48, 0], 3, 'flash', 'accent', 1.2),
      polygon([[-18, -15], [-8, -17], [-3, -13], [-3, 13], [-8, 17], [-18, 15]], 'accent', 'ink', 2.7),
      ellipse(-17, 0, 5, 10, 'shadow', 'highlight', 1.5),
      polygon([[25, -15], [34, -15], [39, -11], [39, 11], [34, 15], [25, 15]], 'neutral', 'ink', 2.5),
      circle(32, 0, 5, 'accent', 'ink', 1.7),
      circle(32, 0, 2.2, 'flash', 'ink', 1),
      polygon([[50, -14], [62, -19], [70, -15], [76, -9], [76, 9], [70, 15], [62, 19], [50, 14]], 'accent', 'ink', 3),
      ellipse(70, 0, 6, 10, 'shadow', 'highlight', 1.7),
      ellipse(71, 0, 2.8, 5.5, 'ink', 'flash', 1.2),
      polygon([[5, -13], [11, -21], [28, -21], [35, -14]], 'shadow', 'ink', 2.5),
      polygon([[12, -19], [25, -19], [29, -15], [9, -15]], 'highlight', 'accent', 1.3),
      circle(20, -17, 2.5, 'flash', 'ink', 1.2),
      line([-5, -10], [45, -10], 1.8, 'highlight', undefined, 0),
    ),
    icon: shape(
      polygon([[-27, -12], [16, -12], [24, -16], [33, -12], [38, -7], [38, 7], [33, 12], [24, 16], [16, 12], [-27, 12], [-32, 7], [-32, -7]], 'primary', 'ink', 3.5),
      polygon([[-18, -8], [13, -8], [20, -4], [20, 4], [13, 8], [-18, 8]], 'shadow', 'ink', 1.8),
      line([-12, 0], [20, 0], 3, 'flash', 'accent', 1),
      polygon([[-29, -14], [-21, -16], [-16, -12], [-16, 12], [-21, 16], [-29, 14]], 'accent', 'ink', 2.5),
      polygon([[4, -14], [11, -14], [15, -10], [15, 10], [11, 14], [4, 14]], 'neutral', 'ink', 2.2),
      circle(9, 0, 3.5, 'flash', 'accent', 1.3),
      polygon([[17, -13], [27, -17], [35, -13], [40, -7], [40, 7], [35, 13], [27, 17], [17, 13]], 'accent', 'ink', 2.7),
      ellipse(35, 0, 4.5, 8, 'shadow', 'highlight', 1.4),
    ),
    heldScale: 1.18,
    iconScale: 0.78,
    pose: 'heavy',
    activationEffect: 'muzzle',
    transitionStyle: 'siege-kick',
    impactStyle: 'siege-blast',
    audio: { fire: 'siege-fire', impact: 'siege-impact' },
    projectiles: {
      primary: projectile(
        shape(
          polygon([[-18, -8], [7, -8], [15, -5], [22, 0], [15, 5], [7, 8], [-18, 8]], 'primary', 'ink', 3),
          polygon([[5, -8], [15, -5], [22, 0], [15, 5], [5, 8]], 'highlight', 'ink', 1.5),
          polygon([[-4, -8], [2, -10], [7, -8], [7, 8], [2, 10], [-4, 8]], 'accent', 'ink', 2),
          circle(7, 0, 2.7, 'flash', 'ink', 1.2),
          polygon([[-14, -8], [-21, -14], [-3, -8]], 'accent', 'ink', 2),
          polygon([[-14, 8], [-21, 14], [-3, 8]], 'accent', 'ink', 2),
          polygon([[-18, -5], [-27, -8], [-24, 0], [-27, 8], [-18, 5]], 'impact', 'accent', 1.8),
          polygon([[-25, -3], [-34, 0], [-25, 3], [-21, 0]], 'flash', 'impact', 1.3),
        ),
        1.12,
      ),
    },
  }),
  'cryo-shot': defineWeapon('cryo-shot', {
    held: shape(
      polygon([[-15, -4], [-3, -8], [8, -6], [10, 6], [-5, 9], [-15, 5]], 'shadow', 'ink', 2.8),
      polygon([[0, 6], [12, 5], [14, 9], [9, 17], [2, 15], [4, 10]], 'shadow', 'ink', 2.4),
      polygon([[-7, -8], [31, -8], [39, -11], [46, -7], [50, -3], [50, 3], [46, 7], [39, 11], [31, 8], [-7, 8], [-11, 4], [-11, -4]], 'primary', 'ink', 3),
      polygon([[0, -5], [29, -5], [35, -3], [38, 0], [35, 3], [29, 5], [0, 5]], 'shadow', 'ink', 1.6),
      ellipse(9, 0, 8, 9, 'neutral', 'ink', 2),
      ellipse(9, 0, 5, 6, 'accent', 'highlight', 1.5),
      circle(9, 0, 2.2, 'flash', 'ink', 1),
      polygon([[18, -7], [25, -10], [32, -7], [35, -3], [35, 3], [32, 7], [25, 10], [18, 7]], 'accent', 'ink', 2),
      line([21, -5], [31, 5], 1.5, 'highlight', undefined, 0),
      line([21, 5], [31, -5], 1.5, 'highlight', undefined, 0),
      polygon([[33, -8], [42, -12], [49, -8], [54, -4], [54, 4], [49, 8], [42, 12], [33, 8]], 'neutral', 'ink', 2.3),
      ellipse(49, 0, 4.5, 7, 'accent', 'highlight', 1.5),
      ellipse(51, 0, 2.2, 4, 'flash', 'ink', 1),
      polygon([[1, -8], [6, -14], [18, -14], [22, -9]], 'shadow', 'ink', 2.2),
      polygon([[7, -12], [17, -12], [19, -9], [5, -9]], 'highlight', 'accent', 1.2),
      circle(12, -10.5, 1.8, 'flash', 'ink', 0.9),
      line([-3, -6], [28, -6], 1.4, 'highlight', undefined, 0),
    ),
    icon: shape(
      polygon([[-22, -9], [13, -9], [21, -13], [29, -9], [34, -5], [34, 5], [29, 9], [21, 13], [13, 9], [-22, 9], [-26, 5], [-26, -5]], 'primary', 'ink', 2.8),
      ellipse(-7, 0, 8, 9, 'neutral', 'ink', 2),
      ellipse(-7, 0, 4.5, 6, 'accent', 'highlight', 1.4),
      circle(-7, 0, 2, 'flash', 'ink', 1),
      polygon([[2, -8], [10, -11], [17, -8], [20, -4], [20, 4], [17, 8], [10, 11], [2, 8]], 'accent', 'ink', 1.8),
      line([5, -6], [17, 6], 1.4, 'highlight', undefined, 0),
      line([5, 6], [17, -6], 1.4, 'highlight', undefined, 0),
      polygon([[16, -10], [25, -14], [32, -10], [37, -5], [37, 5], [32, 10], [25, 14], [16, 10]], 'neutral', 'ink', 2.2),
      ellipse(32, 0, 3.8, 7, 'accent', 'highlight', 1.3),
    ),
    heldScale: 1,
    iconScale: 0.85,
    pose: 'two-hand',
    activationEffect: 'muzzle',
    transitionStyle: 'freeze',
    impactStyle: 'freeze-burst',
    audio: { fire: 'cryo-fire', impact: 'cryo-impact' },
    motionBob: 0.35,
    projectiles: {
      primary: projectile(
        shape(
          polygon([[-13, 0], [-7, -5], [-4, -11], [0, -7], [5, -12], [7, -5], [13, 0], [7, 5], [5, 12], [0, 7], [-5, 12], [-7, 5]], 'accent', 'ink', 2),
          polygon([[-7, 0], [-3, -5], [0, -7], [4, -4], [7, 0], [4, 4], [0, 7], [-3, 5]], 'primary', 'ink', 1.3),
          circle(0, 0, 3, 'flash', 'highlight', 1.2),
          line([-12, 0], [12, 0], 1.3, 'highlight', undefined, 0),
          line([0, -11], [0, 11], 1.3, 'highlight', undefined, 0),
          line([-8, -8], [8, 8], 1.2, 'highlight', undefined, 0),
          line([-8, 8], [8, -8], 1.2, 'highlight', undefined, 0),
        ),
        1,
        2,
      ),
    },
  }),
  teleporter: defineWeapon('teleporter', {
    held: shape(
      polygon([[-15, -4], [-3, -8], [8, -6], [10, 6], [-5, 9], [-15, 5]], 'shadow', 'ink', 2.8),
      polygon([[0, 6], [12, 5], [14, 9], [9, 17], [2, 15], [4, 10]], 'shadow', 'ink', 2.4),
      polygon([[-7, -8], [19, -8], [27, -5], [31, -2], [31, 2], [27, 5], [19, 8], [-7, 8], [-11, 4], [-11, -4]], 'primary', 'ink', 2.9),
      polygon([[1, -5], [19, -5], [25, -2], [25, 2], [19, 5], [1, 5]], 'shadow', 'ink', 1.5),
      circle(12, 0, 5.5, 'neutral', 'ink', 1.7),
      circle(12, 0, 2.4, 'flash', 'accent', 1.1),
      polygon([[20, -7], [27, -12], [36, -17], [43, -14], [39, -9], [32, -5], [27, -2]], 'accent', 'ink', 2.2),
      polygon([[27, 2], [32, 5], [39, 9], [43, 14], [36, 17], [27, 12], [20, 7]], 'accent', 'ink', 2.2),
      circle(43, -14, 3.5, 'neutral', 'ink', 1.5),
      circle(43, 14, 3.5, 'neutral', 'ink', 1.5),
      circle(43, -14, 1.6, 'flash', 'accent', 0.8),
      circle(43, 14, 1.6, 'flash', 'accent', 0.8),
      ellipse(39, 0, 11, 14, undefined, 'accent', 2.5),
      ellipse(39, 0, 7, 10, undefined, 'flash', 2),
      ellipse(39, 0, 3.5, 6, 'shadow', 'highlight', 1.3),
      line([39, -10], [39, 10], 1.2, 'highlight', undefined, 0),
      polygon([[2, -8], [7, -13], [18, -13], [22, -8]], 'shadow', 'ink', 2),
      polygon([[8, -11], [17, -11], [19, -8], [6, -8]], 'highlight', 'accent', 1.2),
      circle(13, -9.5, 1.7, 'flash', 'ink', 0.8),
      line([-3, -6], [18, -6], 1.4, 'highlight', undefined, 0),
    ),
    icon: shape(
      polygon([[-27, -7], [-8, -7], [-2, -3], [-2, 3], [-8, 7], [-27, 7], [-31, 3], [-31, -3]], 'primary', 'ink', 2.7),
      circle(-14, 0, 5, 'neutral', 'ink', 1.5),
      circle(-14, 0, 2.2, 'flash', 'accent', 1),
      polygon([[-5, -6], [2, -12], [12, -18], [18, -14], [13, -9], [5, -4], [0, -2]], 'accent', 'ink', 2),
      polygon([[0, 2], [5, 4], [13, 9], [18, 14], [12, 18], [2, 12], [-5, 6]], 'accent', 'ink', 2),
      circle(18, -14, 3.2, 'neutral', 'ink', 1.4),
      circle(18, 14, 3.2, 'neutral', 'ink', 1.4),
      ellipse(13, 0, 12, 15, undefined, 'accent', 2.8),
      ellipse(13, 0, 7.5, 10, undefined, 'flash', 2),
      ellipse(13, 0, 3.5, 5.5, 'shadow', 'highlight', 1.2),
      circle(18, -14, 1.4, 'flash', 'accent', 0.7),
      circle(18, 14, 1.4, 'flash', 'accent', 0.7),
    ),
    heldScale: 1,
    iconScale: 0.8,
    pose: 'device',
    activationEffect: 'warp',
    transitionStyle: 'warp',
    impactStyle: 'warp-arrival',
    audio: { fire: 'teleport', impact: 'teleport' },
    motionBob: 0.75,
    projectiles: {},
  }),
} satisfies WeaponVisualRegistry

export function getWeaponVisual<I extends WeaponId>(id: I): WeaponVisualRecipe<I> {
  return WEAPON_VISUALS[id] as WeaponVisualRecipe<I>
}

export function getProjectileVisual(
  weaponId: WeaponId | string | null | undefined,
  kind: ProjectileVisualKind | string | null | undefined,
): ProjectileVisualRecipe | null {
  if (!weaponId || !kind) return null
  const registry = WEAPON_VISUALS as unknown as Readonly<
    Record<string, Readonly<{ projectiles: Partial<Record<string, ProjectileVisualRecipe>> }>>
  >
  return registry[weaponId]?.projectiles[kind] ?? null
}

export function resolveWeaponPalette(
  id: WeaponId,
  mode: PaletteMode | boolean = 'standard',
): SemanticPalette {
  return WEAPON_VISUALS[id].palettes[mode === true ? 'high-contrast' : mode === false ? 'standard' : mode]
}
