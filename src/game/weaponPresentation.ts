import type { WeaponId } from '../weapons/registry'

export type Point = Readonly<{ x: number; y: number }>

export type HeldModelKind =
  | 'shoulder-rocket-tube'
  | 'long-brass-rail-cannon'
  | 'stubby-bell-mortar'
  | 'compact-grenade-cup-launcher'
  | 'wide-scrap-blunderbuss'
  | 'heavy-segmented-cluster-canister'
  | 'spiral-borer-launcher'
  | 'folding-pocket-knife'
  | 'signal-beacon-launcher'
  | 'twin-prong-fork-launcher'
  | 'spring-shoe-slinger'
  | 'oversized-siege-bazooka'
  | 'frost-coil-launcher'
  | 'mint-tuning-fork-teleporter'

export type ProjectileModelKind =
  | 'toy-rocket'
  | 'needle-shell'
  | 'heavy-mortar-shell'
  | 'clockwork-grenade'
  | 'scrap-pellet'
  | 'segmented-cluster-canister'
  | 'spinning-drill'
  | 'beacon-canister'
  | 'fork-rocket'
  | 'flying-shoe'
  | 'siege-rocket'
  | 'cryo-capsule'
  | 'none'

export type WeaponPresentation = Readonly<{
  // Legacy labels retained for tuning/test compatibility; recipes own rendered geometry.
  heldModel: HeldModelKind
  colors: Readonly<{
    primary: number
    accent: number
    flash: number
    impact: number
  }>
  body: Readonly<{ length: number; width: number }>
  // Local x follows aim; local y follows its clockwise perpendicular.
  grip: Point
  muzzle: Point
  restElevation: number
  recoil: Readonly<{ durationMs: number; distance: number }>
  projectileModel: ProjectileModelKind
  trail: Readonly<{ color: number; sampleCount: number; width: number }>
  reducedMotionSafe: Readonly<{
    recoil: boolean
    trail: boolean
    pulse: boolean
    transient: boolean
  }>
}>

export const WEAPON_PRESENTATIONS: Readonly<Record<WeaponId, WeaponPresentation>> = {
  'basic-rocket': {
    heldModel: 'shoulder-rocket-tube',
    colors: {
      primary: 0x506f88,
      accent: 0xf7bd3f,
      flash: 0xfff2a6,
      impact: 0xff7a3d,
    },
    body: { length: 42, width: 12 },
    grip: { x: 9, y: 5 },
    muzzle: { x: 43, y: 0 },
    restElevation: 9,
    recoil: { durationMs: 150, distance: 6 },
    projectileModel: 'toy-rocket',
    trail: { color: 0xff9a55, sampleCount: 8, width: 3 },
    reducedMotionSafe: { recoil: false, trail: false, pulse: false, transient: false },
  },
  'precision-cannon': {
    heldModel: 'long-brass-rail-cannon',
    colors: {
      primary: 0x445b6c,
      accent: 0xf2c14e,
      flash: 0xfff7c7,
      impact: 0x69c7e6,
    },
    body: { length: 49, width: 9 },
    grip: { x: 11, y: 5 },
    muzzle: { x: 51, y: 0 },
    restElevation: 5,
    recoil: { durationMs: 220, distance: 9 },
    projectileModel: 'needle-shell',
    trail: { color: 0xbcecff, sampleCount: 11, width: 1.5 },
    reducedMotionSafe: { recoil: false, trail: true, pulse: true, transient: true },
  },
  'high-arc-mortar': {
    heldModel: 'stubby-bell-mortar',
    colors: {
      primary: 0x536248,
      accent: 0xe7a941,
      flash: 0xffe3a0,
      impact: 0xe86f3f,
    },
    body: { length: 31, width: 21 },
    grip: { x: 7, y: 8 },
    muzzle: { x: 33, y: 0 },
    restElevation: 18,
    recoil: { durationMs: 260, distance: 10 },
    projectileModel: 'heavy-mortar-shell',
    trail: { color: 0x8a806c, sampleCount: 10, width: 4.5 },
    reducedMotionSafe: { recoil: false, trail: false, pulse: false, transient: false },
  },
  'timed-grenade': {
    heldModel: 'compact-grenade-cup-launcher',
    colors: {
      primary: 0x3f625f,
      accent: 0x75d6ad,
      flash: 0xffe69a,
      impact: 0xff9a55,
    },
    body: { length: 28, width: 15 },
    grip: { x: 7, y: 6 },
    muzzle: { x: 29, y: -1 },
    restElevation: 7,
    recoil: { durationMs: 125, distance: 4 },
    projectileModel: 'clockwork-grenade',
    trail: { color: 0x75d6ad, sampleCount: 5, width: 2 },
    reducedMotionSafe: { recoil: false, trail: false, pulse: false, transient: true },
  },
  'scatter-shot': {
    heldModel: 'wide-scrap-blunderbuss',
    colors: {
      primary: 0x72513b,
      accent: 0xc9a46b,
      flash: 0xfff0a8,
      impact: 0xffcb66,
    },
    body: { length: 36, width: 18 },
    grip: { x: 8, y: 7 },
    muzzle: { x: 38, y: 0 },
    restElevation: 8,
    recoil: { durationMs: 185, distance: 8 },
    projectileModel: 'scrap-pellet',
    trail: { color: 0xffe09a, sampleCount: 7, width: 2.5 },
    reducedMotionSafe: { recoil: false, trail: true, pulse: false, transient: true },
  },
  'cluster-charge': {
    heldModel: 'heavy-segmented-cluster-canister',
    colors: {
      primary: 0x65546f,
      accent: 0xed7090,
      flash: 0xffd6a0,
      impact: 0xee596f,
    },
    body: { length: 39, width: 19 },
    grip: { x: 10, y: 7 },
    muzzle: { x: 40, y: -1 },
    restElevation: 6,
    recoil: { durationMs: 210, distance: 7 },
    projectileModel: 'segmented-cluster-canister',
    trail: { color: 0xed7090, sampleCount: 6, width: 3.5 },
    reducedMotionSafe: { recoil: false, trail: false, pulse: false, transient: false },
  },
  'terrain-boring-drill': {
    heldModel: 'spiral-borer-launcher',
    colors: {
      primary: 0x59636b,
      accent: 0xf08b35,
      flash: 0xffd066,
      impact: 0xcf5b32,
    },
    body: { length: 40, width: 15 },
    grip: { x: 9, y: 6 },
    muzzle: { x: 44, y: 0 },
    restElevation: 4,
    recoil: { durationMs: 190, distance: 5 },
    projectileModel: 'spinning-drill',
    trail: { color: 0xf08b35, sampleCount: 8, width: 3 },
    reducedMotionSafe: { recoil: false, trail: false, pulse: false, transient: true },
  },
  'pocket-knife': {
    heldModel: 'folding-pocket-knife',
    colors: { primary: 0x8a9398, accent: 0xdde5e8, flash: 0xffffff, impact: 0xd94b45 },
    body: { length: 29, width: 7 },
    grip: { x: 4, y: 4 },
    muzzle: { x: 31, y: 0 },
    restElevation: 12,
    recoil: { durationMs: 170, distance: 7 },
    projectileModel: 'none',
    trail: { color: 0xf5f8fa, sampleCount: 0, width: 0 },
    reducedMotionSafe: { recoil: false, trail: true, pulse: true, transient: true },
  },
  'bomb-beacon': {
    heldModel: 'signal-beacon-launcher',
    colors: { primary: 0x6c513f, accent: 0xffc445, flash: 0xffef9b, impact: 0xe85b32 },
    body: { length: 34, width: 15 },
    grip: { x: 7, y: 6 },
    muzzle: { x: 36, y: 0 },
    restElevation: 14,
    recoil: { durationMs: 150, distance: 5 },
    projectileModel: 'beacon-canister',
    trail: { color: 0xffc445, sampleCount: 6, width: 2.5 },
    reducedMotionSafe: { recoil: false, trail: false, pulse: false, transient: true },
  },
  'fork-rocket': {
    heldModel: 'twin-prong-fork-launcher',
    colors: { primary: 0x4b6178, accent: 0x77c9f2, flash: 0xd9f4ff, impact: 0x4e95cf },
    body: { length: 39, width: 14 },
    grip: { x: 9, y: 6 },
    muzzle: { x: 42, y: 0 },
    restElevation: 9,
    recoil: { durationMs: 175, distance: 6 },
    projectileModel: 'fork-rocket',
    trail: { color: 0x77c9f2, sampleCount: 9, width: 2.5 },
    reducedMotionSafe: { recoil: false, trail: false, pulse: false, transient: true },
  },
  'old-shoe': {
    heldModel: 'spring-shoe-slinger',
    colors: { primary: 0x70513b, accent: 0xb98a5f, flash: 0xffe0a3, impact: 0x9b6a43 },
    body: { length: 31, width: 17 },
    grip: { x: 7, y: 7 },
    muzzle: { x: 33, y: 0 },
    restElevation: 16,
    recoil: { durationMs: 130, distance: 4 },
    projectileModel: 'flying-shoe',
    trail: { color: 0xb98a5f, sampleCount: 5, width: 2 },
    reducedMotionSafe: { recoil: false, trail: false, pulse: true, transient: true },
  },
  'siege-bazooka': {
    heldModel: 'oversized-siege-bazooka',
    colors: { primary: 0x39444b, accent: 0xe94e35, flash: 0xffd45f, impact: 0xc8322e },
    body: { length: 55, width: 22 },
    grip: { x: 12, y: 9 },
    muzzle: { x: 58, y: 0 },
    restElevation: 7,
    recoil: { durationMs: 310, distance: 13 },
    projectileModel: 'siege-rocket',
    trail: { color: 0xf06a3f, sampleCount: 12, width: 6 },
    reducedMotionSafe: { recoil: false, trail: false, pulse: false, transient: false },
  },
  'cryo-shot': {
    heldModel: 'frost-coil-launcher',
    colors: { primary: 0x477b8d, accent: 0x8ee8ff, flash: 0xe9fbff, impact: 0x54b9db },
    body: { length: 37, width: 14 },
    grip: { x: 8, y: 6 },
    muzzle: { x: 40, y: 0 },
    restElevation: 11,
    recoil: { durationMs: 145, distance: 4 },
    projectileModel: 'cryo-capsule',
    trail: { color: 0x8ee8ff, sampleCount: 10, width: 3 },
    reducedMotionSafe: { recoil: false, trail: true, pulse: false, transient: true },
  },
  teleporter: {
    heldModel: 'mint-tuning-fork-teleporter',
    colors: {
      primary: 0x3d746d,
      accent: 0x79e3bb,
      flash: 0xcaffeb,
      impact: 0x57b89e,
    },
    body: { length: 31, width: 14 },
    grip: { x: 7, y: 5 },
    muzzle: { x: 32, y: 0 },
    restElevation: 11,
    recoil: { durationMs: 0, distance: 0 },
    projectileModel: 'none',
    trail: { color: 0x79e3bb, sampleCount: 0, width: 0 },
    reducedMotionSafe: { recoil: true, trail: true, pulse: false, transient: true },
  },
}

export function getWeaponPresentation(id: WeaponId): WeaponPresentation {
  return WEAPON_PRESENTATIONS[id]
}

function usableDirection(direction: Point | null | undefined): direction is Point {
  if (!direction || !Number.isFinite(direction.x) || !Number.isFinite(direction.y)) return false
  const length = Math.hypot(direction.x, direction.y)
  return Number.isFinite(length) && length > Number.EPSILON
}

export function normalizeDirection(
  direction: Point | null | undefined,
  fallback: Point = { x: 1, y: 0 },
): Point {
  const source = usableDirection(direction)
    ? direction
    : usableDirection(fallback)
      ? fallback
      : { x: 1, y: 0 }
  const length = Math.hypot(source.x, source.y)
  return { x: source.x / length, y: source.y / length }
}

export function perpendicular(direction: Point): Point {
  return { x: -direction.y, y: direction.x }
}

export function heldWeaponHandedness(direction: Point, facing: number): -1 | 1 {
  const forward = normalizeDirection(direction, { x: facing, y: 0 })
  return (Math.abs(forward.x) > 0.05 ? Math.sign(forward.x) : Math.sign(facing) || 1) as -1 | 1
}

export function weaponModelScale(id: WeaponId, muzzleDistance = 24): number {
  const muzzleX = Math.max(1, Math.abs(getWeaponPresentation(id).muzzle.x))
  return Math.max(0, muzzleDistance) / muzzleX
}

export function transformLocalPoint(
  origin: Point,
  direction: Point | null | undefined,
  localPoint: Point,
  fallback?: Point,
): Point {
  const forward = normalizeDirection(direction, fallback)
  const across = perpendicular(forward)
  return {
    x: origin.x + forward.x * localPoint.x + across.x * localPoint.y,
    y: origin.y + forward.y * localPoint.x + across.y * localPoint.y,
  }
}

export type WeaponMotionPolicy = Readonly<{
  recoilDurationMs: number
  recoilDistance: number
  trailSampleCount: number
  trailWidth: number
  pulse: boolean
  transientDurationMs: (requestedDurationMs: number) => number
}>

export function getWeaponMotionPolicy(
  id: WeaponId,
  reducedMotion: boolean,
): WeaponMotionPolicy {
  const presentation = getWeaponPresentation(id)
  const safe = presentation.reducedMotionSafe
  const keepRecoil = !reducedMotion || safe.recoil
  const keepTrail = !reducedMotion || safe.trail

  return {
    recoilDurationMs: keepRecoil ? presentation.recoil.durationMs : 0,
    recoilDistance: keepRecoil ? presentation.recoil.distance : 0,
    trailSampleCount: keepTrail
      ? presentation.trail.sampleCount
      : Math.min(1, presentation.trail.sampleCount),
    trailWidth: presentation.trail.width,
    pulse: !reducedMotion || safe.pulse,
    transientDurationMs(requestedDurationMs: number): number {
      const duration = Number.isFinite(requestedDurationMs)
        ? Math.max(0, requestedDurationMs)
        : 0
      return reducedMotion && !safe.transient ? Math.min(80, duration) : duration
    },
  }
}
