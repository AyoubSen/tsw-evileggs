import { useId } from 'react'
import { PLAYER_ACCENT_COLORS, PLAYER_PRIMARY_COLORS, type PlayerAppearance } from '../players/appearanceRegistry'
import { getCompactPlayerRecipe, playerPathData, resolvePlayerComposition, type PlayerPoseId, type PlayerVisualPrimitive, type PlayerVisualRole } from '../players/playerVisualRecipes'
import type { WeaponId } from '../weapons/registry'
import { getWeaponVisual, resolveWeaponPalette, type ShapeRecipe } from '../game/weaponVisualRecipes'

type PlayerAvatarProps = { appearance: Readonly<PlayerAppearance>; label?: string; teamId?: number; teamBackground?: boolean; highContrast?: boolean; className?: string; pose?: PlayerPoseId; facing?: -1 | 1; weaponId?: WeaponId; hurt?: boolean; frozen?: boolean; compact?: boolean }

function WeaponSvg({ recipe, weaponId }: { recipe: ShapeRecipe; weaponId: WeaponId }) {
  const palette = resolveWeaponPalette(weaponId)
  const color = (role: keyof typeof palette) => `#${palette[role].toString(16).padStart(6, '0')}`
  return <>{recipe.primitives.map((item, index) => {
    if (item.kind === 'polygon') return <polygon key={index} points={item.points.map((point) => `${point.x},${point.y}`).join(' ')} fill={item.fill ? color(item.fill) : 'none'} stroke={item.stroke ? color(item.stroke) : undefined} strokeWidth={item.strokeWidth} />
    if (item.kind === 'line') return <g key={index}>{item.outline && <line x1={item.from.x} y1={item.from.y} x2={item.to.x} y2={item.to.y} stroke={color(item.outline)} strokeWidth={item.width + (item.outlineWidth ?? 0) * 2} />}<line x1={item.from.x} y1={item.from.y} x2={item.to.x} y2={item.to.y} stroke={color(item.color)} strokeWidth={item.width} /></g>
    if (item.kind === 'circle') return <circle key={index} cx={item.center.x} cy={item.center.y} r={item.radius} fill={item.fill ? color(item.fill) : 'none'} stroke={item.stroke ? color(item.stroke) : undefined} strokeWidth={item.strokeWidth} />
    return <ellipse key={index} cx={item.center.x} cy={item.center.y} rx={item.radiusX} ry={item.radiusY} fill={item.fill ? color(item.fill) : 'none'} stroke={item.stroke ? color(item.stroke) : undefined} strokeWidth={item.strokeWidth} />
  })}</>
}

export function PlayerAvatar({ appearance, label = 'Player appearance', teamId = 0, teamBackground = false, highContrast = false, className = '', pose = 'idle', facing = 1, weaponId, hurt = false, frozen = false, compact = false }: PlayerAvatarProps) {
  const clipId = `${useId().replace(/:/g, '')}-body`
  const primary = PLAYER_PRIMARY_COLORS.find((entry) => entry.id === appearance.primaryColor)!.color
  const accent = PLAYER_ACCENT_COLORS.find((entry) => entry.id === appearance.accentColor)!.color
  const expressionState = pose === 'defeated' ? 'defeated' : frozen ? 'frozen' : hurt ? 'hurt' : pose === 'victory' ? 'victory' : 'normal'
  const composition = resolvePlayerComposition({ appearance, pose, mirror: facing < 0, weaponId, expressionState })
  const recipe = composition.recipe
  const compactRecipe = getCompactPlayerRecipe(appearance)
  const weapon = weaponId ? getWeaponVisual(weaponId) : null
  const resolvedPose = composition.pose
  const colors: Record<PlayerVisualRole, string> = highContrast
    ? { primary: '#b8b8b8', accent: '#ffffff', ink: '#080808', face: '#ffffff', shine: '#ffffff' }
    : { primary, accent, ink: '#24313a', face: '#fff1c9', shine: '#fff8df' }
  const primitive = (item: PlayerVisualPrimitive, key: string) => {
    const props = { key, fill: item.fill ? colors[item.fill] : 'none', stroke: item.stroke ? colors[item.stroke] : undefined, strokeWidth: item.strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
    if (item.kind === 'path') return <path {...props} d={playerPathData(item.commands)} />
    if (item.kind === 'circle') return <circle {...props} cx={item.cx} cy={item.cy} r={item.radius} />
    return <ellipse {...props} cx={item.cx} cy={item.cy} rx={item.radiusX} ry={item.radiusY} />
  }
  const arm = (from: { x: number; y: number }, to: { x: number; y: number }, key: string) => <g key={key}><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={colors.ink} strokeWidth="9" /><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#ffe2b2" strokeWidth="5" /><circle cx={to.x} cy={to.y} r="4" fill={colors.ink} /><circle cx={to.x} cy={to.y} r="2.4" fill="#ffe2b2" /></g>
  const bodyTransform = `translate(${resolvedPose.bodyOffset.x} ${resolvedPose.bodyOffset.y})`
  return <svg className={`player-avatar pose-${pose} ${compact ? 'compact-avatar' : ''} ${highContrast ? 'high-contrast-avatar' : ''} ${teamBackground ? `team-background team-${teamId}` : ''} ${className}`} viewBox="0 0 128 120" role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true}>
    <defs><clipPath id={clipId}>{primitive(recipe.body, 'clip')}</clipPath></defs>
    {teamBackground && <rect className="avatar-team-field" x="2" y="2" width="124" height="116" rx="25" />}
    <ellipse className="avatar-shadow" cx="64" cy="105" rx="37" ry="7" />
    <g transform={`translate(64 60) scale(${facing} 1) translate(-64 -60)`}>
      <g transform={bodyTransform}>{recipe.rearAccessories.map((item, index) => primitive(item, `rear-accessory-${index}`))}</g>
      {weapon && arm(resolvedPose.rearArm.shoulder, resolvedPose.rearArm.hand, 'rear-arm')}
      <g transform={bodyTransform}>{primitive(compact ? compactRecipe.body : recipe.body, 'body')}<g clipPath={`url(#${clipId})`}>{(compact ? compactRecipe.patternMarks : recipe.pattern).map((item, index) => primitive(item, `pattern-${index}`))}</g>{!compact && recipe.face.map((item, index) => primitive(item, `face-${index}`))}</g>
      <g transform={bodyTransform}>{(compact ? compactRecipe.accessoryMarks : recipe.frontAccessories).map((item, index) => primitive(item, `front-accessory-${index}`))}</g>
      {weapon && resolvedPose.frontArm && arm(resolvedPose.frontArm.shoulder, resolvedPose.frontArm.hand, 'front-arm')}
      {weapon && <g transform={`translate(${resolvedPose.weaponOrigin.x} ${resolvedPose.weaponOrigin.y}) rotate(${resolvedPose.weaponRotation * 180 / Math.PI}) scale(${weapon.heldScale * 0.62})`}><WeaponSvg recipe={weapon.held} weaponId={weaponId!} /></g>}
      {frozen && <g className="avatar-frozen-overlay"><rect x="28" y="22" width="72" height="82" rx="24" /><path d="M38 36 L91 91 M91 36 L38 91" /></g>}
      {pose === 'victory' && <path className="avatar-victory-overlay" d="M48 27 L53 8 L63 20 L70 5 L78 20 L89 8 L85 30 Z" />}
    </g>
  </svg>
}
