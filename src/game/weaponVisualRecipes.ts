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
  | 'mine-blast'
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
            | 'deployable-mine'
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
    polygon([[-9, -4], [5, -4], [11, 0], [5, 4], [-9, 4]], 'primary'),
    polygon([[-6, -4], [-11, -8], [-1, -4]], 'accent', 'ink', 1.5),
    polygon([[-6, 4], [-11, 8], [-1, 4]], 'accent', 'ink', 1.5),
    polygon([[-10, -2.5], [-17, 0], [-10, 2.5]], 'flash', 'accent', 1.5),
  ),
)

export const WEAPON_VISUALS = {
  'basic-rocket': defineWeapon('basic-rocket', {
    held: shape(
      polygon([[-7, -5], [34, -5], [42, -7], [45, 0], [42, 7], [34, 5], [-7, 5]], 'primary'),
      line([-4, 0], [35, 0], 3, 'accent'),
      line([31, -7], [31, 7], 3, 'accent'),
    ),
    icon: shape(
      polygon([[-15, -5], [7, -5], [15, 0], [7, 5], [-15, 5]], 'primary'),
      polygon([[-10, -5], [-16, -10], [-2, -5]], 'accent'),
      polygon([[-10, 5], [-16, 10], [-2, 5]], 'accent'),
      circle(5, 0, 2.3, 'flash', 'ink', 1.5),
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
      polygon([[-9, -4], [39, -4], [52, 0], [39, 4], [-9, 4]], 'primary'),
      line([0, -7], [47, -7], 2.5, 'accent'),
      line([0, 7], [47, 7], 2.5, 'accent'),
      circle(11, 0, 4, 'shadow', 'accent', 1.5),
    ),
    icon: shape(
      polygon([[-17, -3], [9, -3], [19, 0], [9, 3], [-17, 3]], 'accent'),
      line([-13, -8], [12, -8], 2, 'primary'),
      line([-13, 8], [12, 8], 2, 'primary'),
      circle(2, 0, 4.5, undefined, 'flash', 2),
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
          polygon([[-12, -2], [8, -2], [15, 0], [8, 2], [-12, 2]], 'primary', 'ink', 1.5),
          line([-18, 0], [-8, 0], 1.5, 'flash', undefined, 0),
        ),
      ),
    },
  }),
  'high-arc-mortar': defineWeapon('high-arc-mortar', {
    held: shape(
      polygon([[-8, -5], [14, -7], [31, -12], [35, -9], [35, 9], [31, 12], [14, 7], [-8, 5]], 'primary'),
      line([13, -8], [13, 8], 4, 'accent'),
      line([29, -12], [29, 12], 3, 'accent'),
    ),
    icon: shape(
      polygon([[-14, -5], [3, -8], [16, -12], [18, 12], [3, 8], [-14, 5]], 'primary'),
      line([7, -10], [7, 10], 4, 'accent'),
      circle(-9, 0, 3, 'shadow', 'ink', 1),
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
          polygon([[-9, -5], [5, -5], [11, 0], [5, 5], [-9, 5], [-13, 0]], 'primary'),
          line([2, -5], [2, 5], 2.5, 'accent'),
        ),
      ),
    },
  }),
  'timed-grenade': defineWeapon('timed-grenade', {
    held: shape(
      polygon([[-7, -5], [18, -6], [25, -10], [31, -8], [31, 8], [25, 10], [18, 6], [-7, 5]], 'primary'),
      circle(21, 0, 7, 'accent'),
      line([6, 4], [3, 15], 4, 'primary'),
    ),
    icon: shape(
      circle(0, 2, 10, 'primary', 'ink', 2.5),
      circle(0, 2, 5, undefined, 'accent', 2),
      line([0, -8], [5, -14], 2.5, 'accent'),
      circle(7, -15, 2, 'flash', 'ink', 1),
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
          circle(0, 0, 7, 'primary', 'ink', 2.5),
          circle(0, 0, 3.5, undefined, 'accent', 1.5),
          line([0, -7], [4, -12], 2, 'accent'),
          circle(5, -13, 1.8, 'flash', undefined, 0),
        ),
        1,
        4,
      ),
    },
  }),
  'scatter-shot': defineWeapon('scatter-shot', {
    held: shape(
      polygon([[-8, -4], [13, -5], [39, -12], [42, -9], [42, 9], [39, 12], [13, 5], [-8, 4]], 'primary'),
      line([14, -6], [38, -12], 3, 'accent'),
      line([14, 6], [38, 12], 3, 'accent'),
      line([-5, 0], [12, 0], 3, 'neutral'),
    ),
    icon: shape(
      polygon([[-17, -4], [-3, -5], [12, -13], [15, 13], [-3, 5], [-17, 4]], 'primary'),
      circle(18, -8, 2.5, 'accent', 'ink', 1),
      circle(20, 0, 2.5, 'accent', 'ink', 1),
      circle(18, 8, 2.5, 'accent', 'ink', 1),
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
      polygon([[-7, -8], [39, -8], [43, -4], [43, 4], [39, 8], [-7, 8]], 'primary'),
      line([5, -8], [5, 8], 3, 'accent'),
      line([17, -8], [17, 8], 3, 'accent'),
      line([29, -8], [29, 8], 3, 'accent'),
      circle(36, 0, 3, 'flash', 'ink', 1.5),
    ),
    icon: shape(
      polygon([[-14, -9], [8, -9], [15, 0], [8, 9], [-14, 9], [-19, 0]], 'primary'),
      circle(-7, -4, 3, 'accent', 'ink', 1),
      circle(1, 0, 3, 'accent', 'ink', 1),
      circle(-7, 4, 3, 'accent', 'ink', 1),
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
          polygon([[-11, -5], [7, -5], [11, -2], [11, 2], [7, 5], [-11, 5]], 'primary'),
          line([-5, -5], [-5, 5], 2, 'accent'),
          line([1, -5], [1, 5], 2, 'accent'),
          line([7, -5], [7, 5], 2, 'accent'),
        ),
      ),
      'cluster-child': projectile(
        shape(
          polygon([[-7, 0], [-3, -5], [4, -4], [8, 0], [4, 4], [-3, 5]], 'accent'),
          line([-1, -4], [-1, 4], 2, 'primary'),
          circle(3, 0, 1.5, 'flash', undefined, 0),
        ),
        0.82,
        6,
      ),
    },
  }),
  'terrain-boring-drill': defineWeapon('terrain-boring-drill', {
    held: shape(
      polygon([[-8, -6], [23, -6], [45, 0], [23, 6], [-8, 6]], 'primary'),
      line([14, -6], [22, 6], 2.5, 'accent'),
      line([22, -6], [30, 5], 2.5, 'accent'),
      line([30, -4], [38, 3], 2.5, 'accent'),
    ),
    icon: shape(
      polygon([[-18, -8], [0, -8], [19, 0], [0, 8], [-18, 8]], 'primary'),
      line([-8, -8], [2, 8], 3, 'accent'),
      line([1, -7], [11, 5], 3, 'accent'),
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
          polygon([[-10, -5], [2, -5], [13, 0], [2, 5], [-10, 5]], 'primary'),
          line([-6, -5], [1, 5], 2, 'accent'),
          line([0, -5], [7, 4], 2, 'accent'),
        ),
        1,
        12,
      ),
    },
  }),
  'deployable-mine': defineWeapon('deployable-mine', {
    held: shape(
      polygon([[-7, -6], [17, -8], [28, -4], [28, 4], [17, 8], [-7, 6]], 'primary'),
      line([5, -7], [5, 7], 3, 'accent'),
      line([18, 0], [30, 0], 4, 'neutral'),
      ellipse(33, 0, 4, 8, 'accent'),
    ),
    icon: shape(
      ellipse(0, 4, 15, 7, 'primary', 'ink', 2.5),
      line([-9, 0], [9, 0], 3, 'accent'),
      circle(0, -4, 3.5, 'flash', 'ink', 1.5),
      line([0, -8], [0, -13], 2, 'neutral'),
    ),
    heldScale: 1,
    iconScale: 0.9,
    pose: 'place',
    activationEffect: 'place',
    transitionStyle: 'drop',
    impactStyle: 'mine-blast',
    audio: { fire: 'mine-deploy', impact: 'mine-impact' },
    projectiles: {},
  }),
  'pocket-knife': defineWeapon('pocket-knife', {
    held: shape(
      polygon([[-8, -5], [10, -5], [13, 0], [10, 5], [-8, 5]], 'primary'),
      polygon([[10, -3], [23, -5], [34, 0], [23, 4], [10, 3]], 'accent'),
      circle(7, 0, 2, 'shadow', 'ink', 1),
    ),
    icon: shape(
      polygon([[-18, -8], [2, -8], [7, 0], [2, 8], [-18, 8]], 'primary', 'ink', 3),
      polygon([[3, -5], [12, -8], [21, -3], [25, 0], [12, 7], [3, 5]], 'flash', 'ink', 3),
      circle(-2, 0, 2.7, 'accent', 'ink', 1.5),
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
      polygon([[-7, -6], [27, -6], [37, -10], [39, 0], [37, 10], [27, 6], [-7, 6]], 'primary'),
      line([18, -9], [18, 9], 3, 'accent'),
      line([5, -6], [5, -14], 2.5, 'accent'),
      circle(5, -16, 2.5, 'flash', 'ink', 1),
    ),
    icon: shape(
      circle(0, 3, 10, 'primary', 'ink', 2.5),
      circle(0, 3, 15, undefined, 'accent', 2.5),
      line([0, -7], [0, -17], 3, 'accent'),
      circle(0, -18, 3, 'flash', 'ink', 1.5),
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
          polygon([[-7, -4], [6, -4], [10, 0], [6, 4], [-7, 4]], 'accent'),
          line([-2, -4], [-2, 4], 2, 'primary'),
          circle(4, 0, 1.5, 'flash', undefined, 0),
        ),
      ),
      'beacon-bomb': projectile(
        shape(
          polygon([[-9, -6], [5, -6], [10, 0], [5, 6], [-9, 6], [-12, 0]], 'primary'),
          line([-3, -6], [-3, 6], 3, 'accent'),
          polygon([[-8, -6], [-12, -10], [-2, -6]], 'accent', 'ink', 1.5),
          polygon([[-8, 6], [-12, 10], [-2, 6]], 'accent', 'ink', 1.5),
        ),
        1.08,
      ),
    },
  }),
  'fork-rocket': defineWeapon('fork-rocket', {
    held: shape(
      polygon([[-8, -5], [21, -5], [26, 0], [21, 5], [-8, 5]], 'primary'),
      line([19, -3], [43, -10], 4, 'accent'),
      line([19, 3], [43, 10], 4, 'accent'),
      circle(17, 0, 3, 'flash', 'ink', 1.5),
    ),
    icon: shape(
      line([-17, 0], [1, 0], 8, 'primary'),
      line([0, 0], [18, -11], 5, 'accent'),
      line([0, 0], [18, 11], 5, 'accent'),
      circle(-9, 0, 3, 'flash', 'ink', 1.5),
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
          polygon([[-10, -4], [5, -4], [11, 0], [5, 4], [-10, 4]], 'primary'),
          line([-6, -6], [-6, 6], 2.5, 'accent'),
          polygon([[-10, -3], [-16, 0], [-10, 3]], 'flash', 'accent', 1.5),
        ),
      ),
      'fork-child': projectile(
        shape(
          polygon([[-8, -3], [5, -3], [10, 0], [5, 3], [-8, 3]], 'accent'),
          polygon([[-6, -3], [-11, -7], [0, -3]], 'primary', 'ink', 1.5),
          line([-10, 0], [-15, 0], 2, 'flash'),
        ),
        0.88,
      ),
    },
  }),
  'old-shoe': defineWeapon('old-shoe', {
    held: shape(
      polygon([[-13, -7], [-4, -10], [5, -9], [12, -5], [28, -4], [35, 1], [33, 7], [9, 9], [-10, 6]], 'primary'),
      ellipse(-3, -3, 7, 4, 'shadow', 'ink', 1.5),
      line([-13, 7], [32, 8], 3.5, 'accent'),
      line([5, -8], [8, 5], 2, 'accent'),
      line([10, -6], [3, 3], 1.8, 'flash', undefined, 0),
      line([15, -5], [8, 4], 1.8, 'flash', undefined, 0),
    ),
    icon: shape(
      polygon([[-17, -8], [-8, -12], [2, -10], [9, -5], [20, -3], [24, 3], [20, 8], [-7, 10], [-17, 6]], 'primary', 'ink', 3),
      ellipse(-8, -4, 6, 4, 'shadow', 'ink', 1.5),
      line([-17, 8], [21, 9], 4, 'accent'),
      line([3, -8], [7, 6], 2.5, 'accent'),
      line([8, -6], [2, 4], 2, 'flash', undefined, 0),
      line([13, -4], [7, 5], 2, 'flash', undefined, 0),
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
          polygon([[-11, -5], [-5, -8], [3, -7], [8, -3], [15, -2], [18, 3], [14, 6], [-5, 7], [-12, 4]], 'primary'),
          ellipse(-5, -3, 4.5, 3, 'shadow', 'ink', 1.2),
          line([-11, 6], [15, 7], 3, 'accent'),
          line([3, -6], [5, 4], 1.6, 'accent'),
          line([7, -4], [2, 3], 1.4, 'flash', undefined, 0),
          line([11, -3], [6, 4], 1.4, 'flash', undefined, 0),
        ),
        0.95,
        5,
      ),
    },
  }),
  'siege-bazooka': defineWeapon('siege-bazooka', {
    held: shape(
      polygon([[-14, -10], [52, -10], [61, -13], [64, 0], [61, 13], [52, 10], [-14, 10]], 'primary', 'ink', 3.5),
      line([-2, -10], [-2, 10], 5, 'accent'),
      line([28, -10], [28, 10], 5, 'accent'),
      line([51, -11], [51, 11], 5, 'accent'),
      polygon([[3, 9], [18, 9], [14, 18], [7, 18]], 'shadow'),
    ),
    icon: shape(
      polygon([[-21, -9], [15, -9], [22, -13], [25, 0], [22, 13], [15, 9], [-21, 9]], 'primary', 'ink', 3.5),
      line([-11, -9], [-11, 9], 4, 'accent'),
      line([12, -10], [12, 10], 4, 'accent'),
      circle(20, 0, 3, 'flash', 'ink', 1.5),
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
          polygon([[-15, -7], [7, -7], [15, 0], [7, 7], [-15, 7]], 'primary', 'ink', 3),
          line([3, -7], [3, 7], 3, 'accent'),
          polygon([[-14, -5], [-21, -11], [-5, -7]], 'accent'),
          polygon([[-14, 5], [-21, 11], [-5, 7]], 'accent'),
          polygon([[-16, -4], [-25, 0], [-16, 4]], 'flash', 'impact', 2),
        ),
        1.12,
      ),
    },
  }),
  'cryo-shot': defineWeapon('cryo-shot', {
    held: shape(
      polygon([[-7, -6], [36, -6], [42, 0], [36, 6], [-7, 6]], 'primary'),
      circle(6, 0, 7, undefined, 'accent', 2.5),
      circle(19, 0, 7, undefined, 'accent', 2.5),
      circle(32, 0, 7, undefined, 'accent', 2.5),
      line([-4, 0], [38, 0], 2, 'flash'),
    ),
    icon: shape(
      circle(0, 0, 8, 'primary', 'accent', 2.5),
      line([-16, 0], [16, 0], 3, 'flash'),
      line([-8, -14], [8, 14], 3, 'flash'),
      line([-8, 14], [8, -14], 3, 'flash'),
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
          circle(0, 0, 7, 'primary', 'ink', 2),
          circle(0, 0, 4, undefined, 'flash', 2),
          line([-10, 0], [10, 0], 1.5, 'accent', undefined, 0),
          line([0, -10], [0, 10], 1.5, 'accent', undefined, 0),
        ),
        1,
        2,
      ),
    },
  }),
  teleporter: defineWeapon('teleporter', {
    held: shape(
      polygon([[-7, -5], [15, -5], [19, 0], [15, 5], [-7, 5]], 'primary'),
      line([14, -3], [34, -11], 4, 'accent'),
      line([14, 3], [34, 11], 4, 'accent'),
      circle(24, 0, 8, undefined, 'flash', 2),
      circle(24, 0, 4, 'shadow', 'accent', 1.5),
    ),
    icon: shape(
      circle(0, 0, 15, undefined, 'accent', 3.5),
      circle(0, 0, 9, undefined, 'flash', 2.5),
      line([-17, -13], [-17, 13], 4, 'primary'),
      line([17, -13], [17, 13], 4, 'primary'),
      circle(0, 0, 3, 'highlight', 'ink', 1.5),
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
