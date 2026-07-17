import { useId } from 'react'
import { PLAYER_ACCENT_COLORS, PLAYER_PRIMARY_COLORS, type PlayerAppearance } from '../players/appearanceRegistry'
import { getPlayerVisualRecipe, playerPathData, type PlayerVisualPrimitive, type PlayerVisualRole } from '../players/playerVisualRecipes'

type PlayerAvatarProps = { appearance: Readonly<PlayerAppearance>; label?: string; teamId?: number; teamBackground?: boolean; className?: string }

export function PlayerAvatar({ appearance, label = 'Player appearance', teamId = 0, teamBackground = false, className = '' }: PlayerAvatarProps) {
  const clipId = `${useId().replace(/:/g, '')}-body`
  const primary = PLAYER_PRIMARY_COLORS.find((entry) => entry.id === appearance.primaryColor)!.color
  const accent = PLAYER_ACCENT_COLORS.find((entry) => entry.id === appearance.accentColor)!.color
  const recipe = getPlayerVisualRecipe(appearance)
  const colors: Record<PlayerVisualRole, string> = { primary, accent, ink: '#24313a', face: '#fff1c9', shine: '#fff8df' }
  const primitive = (item: PlayerVisualPrimitive, key: string) => {
    const props = { key, fill: item.fill ? colors[item.fill] : 'none', stroke: item.stroke ? colors[item.stroke] : undefined, strokeWidth: item.strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
    if (item.kind === 'path') return <path {...props} d={playerPathData(item.commands)} />
    if (item.kind === 'circle') return <circle {...props} cx={item.cx} cy={item.cy} r={item.radius} />
    return <ellipse {...props} cx={item.cx} cy={item.cy} rx={item.radiusX} ry={item.radiusY} />
  }
  return <svg className={`player-avatar ${teamBackground ? `team-background team-${teamId}` : ''} ${className}`} viewBox="0 0 128 120" role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true}>
    <defs><clipPath id={clipId}>{primitive(recipe.body, 'clip')}</clipPath></defs>
    {teamBackground && <rect className="avatar-team-field" x="2" y="2" width="124" height="116" rx="25" />}
    <ellipse className="avatar-shadow" cx="64" cy="105" rx="37" ry="7" />
    {primitive(recipe.body, 'body')}
    <g clipPath={`url(#${clipId})`}>{recipe.pattern.map((item, index) => primitive(item, `pattern-${index}`))}</g>
    {recipe.details.map((item, index) => primitive(item, `detail-${index}`))}
  </svg>
}
