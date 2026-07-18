import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { BRAND } from './branding'
import { loadPreferences, savePreferences, type Preferences } from './preferences'
import { MapEditor } from './MapEditor'
import {
  MAPS,
  defaultMapForMode,
  getMap,
  mapIdsForMode,
  setCustomDraftMap,
  type MapDocument,
  type MapDefinition,
  type MapId,
  type MatchMode as GameMode,
} from '../maps/registry'
import { TERRAIN_MATERIAL, type TerrainMaterialId } from '../terrain/materials'
import { validateMatchConfig, type LocalMatchConfig, type TurnDuration } from '../match/config'
import { createGame, type GameHost } from '../game/GameHost'
import { LocalMatchSource } from '../game/LocalMatchSource'
import type { MatchResult } from '../game/types'
import { isRoomCode, normalizeRoomCode } from '../network/protocol'
import { OnlineRoomSession, type ConnectionQuality } from '../network/OnlineRoomSession'
import {
  OnlineSessionGenerationGuard,
  isOnlineLifecycleCancellation,
} from '../network/onlineLifecycle'
import type { OnlineRoomView } from '../network/roomView'
import { AudioDirector } from '../audio/AudioDirector'
import { PlayerAvatar, WeaponIcon } from './PlayerAvatar'
import {
  DEFAULT_PLAYER_APPEARANCES,
  PLAYER_ACCESSORIES,
  PLAYER_ACCENT_COLORS,
  PLAYER_BODIES,
  PLAYER_FACES,
  PLAYER_PATTERNS,
  PLAYER_PRIMARY_COLORS,
  PLAYER_VICTORY_STYLES,
  randomPlayerAppearance,
  type PlayerAppearance,
} from '../players/appearanceRegistry'
import {
  WEAPONS,
  WEAPON_ORDER,
  WEAPON_UNLOCK_LEVEL,
  isWeaponUnlocked,
  type WeaponId,
  type WeaponInventory,
} from '../weapons/registry'
import {
  ARSENAL_PRESETS,
  MAX_LOADOUT_WEAPONS,
  arsenalSummary,
  cloneArsenalRules,
  sanitizeArsenalRules,
  usableArsenalWeapons,
  type ArsenalRules,
} from '../match/arsenal'
import {
  MAX_OUTFIT_PRESETS,
  makeOutfitPreset,
  sanitizeOutfitPresetName,
  type OutfitPreset,
} from '../profile/outfitPresets'
import { AccountAvatar, useOptionalAuth } from '../account/auth'
import { useAccountSync } from '../account/sync'
import { createGameTicket, getAccountCapabilities, getProgression, purchaseCosmetic } from '../account/client'
import { progressionReward, type ProgressionOverview } from '../shared/progression'
import {
  WEAPON_SKINS,
  APPEARANCE_COSMETICS,
  FREE_APPEARANCE_IDS,
  entitlementAwareLoadout,
  isCosmeticOwned,
  weaponSkinEntitlementId,
  weaponSkinFor,
  type CosmeticLoadout,
} from '../cosmetics/cosmeticLoadout'

type Screen =
  | 'menu'
  | 'setup'
  | 'online'
  | 'online-create'
  | 'online-join'
  | 'online-lobby'
  | 'how-to'
  | 'settings'
  | 'profile'
  | 'customize'
  | 'workshop'
  | 'credits'
  | 'editor'
  | 'match'
type PausePanel = 'main' | 'how-to' | 'settings' | 'confirm-restart' | 'confirm-menu'
type SessionMode = 'local' | 'online'

function HeroDiorama() {
  return (
    <div className="hero-diorama" aria-hidden="true">
      <span className="hero-cloud cloud-one" />
      <span className="hero-cloud cloud-two" />
      <span className="hero-arc" />
      <span className="hero-spark spark-one" />
      <span className="hero-spark spark-two" />
      <span className="hero-hill hill-back" />
      <span className="hero-hill hill-front" />
      <span className="hero-toy hero-toy-left">
        <PlayerAvatar appearance={DEFAULT_PLAYER_APPEARANCES[0]} />
      </span>
      <span className="hero-toy hero-toy-right">
        <PlayerAvatar appearance={DEFAULT_PLAYER_APPEARANCES[1]} />
      </span>
    </div>
  )
}

const MAP_PREVIEW_WIDTH = 160
const MAP_PREVIEW_HEIGHT = 90
const MAP_PREVIEW_COLUMNS = 80
const MAP_PREVIEW_ROWS = 45
const MAP_PREVIEW_CELL_WIDTH = MAP_PREVIEW_WIDTH / MAP_PREVIEW_COLUMNS
const MAP_PREVIEW_CELL_HEIGHT = MAP_PREVIEW_HEIGHT / MAP_PREVIEW_ROWS

type MapPreviewRun = { x: number; y: number; width: number; material: TerrainMaterialId }
type MapPreviewData = { terrain: MapPreviewRun[]; surfaces: MapPreviewRun[] }

const mapPreviewCache = new WeakMap<MapDefinition, MapPreviewData>()

function mapPreviewData(map: MapDefinition): MapPreviewData {
  const cached = mapPreviewCache.get(map)
  if (cached) return cached

  const cells = new Uint8Array(MAP_PREVIEW_COLUMNS * MAP_PREVIEW_ROWS)
  const counts = new Uint32Array(5)
  for (let previewY = 0; previewY < MAP_PREVIEW_ROWS; previewY += 1) {
    const sourceYStart = Math.floor((previewY * map.terrainHeight) / MAP_PREVIEW_ROWS)
    const sourceYEnd = Math.floor(((previewY + 1) * map.terrainHeight) / MAP_PREVIEW_ROWS)
    for (let previewX = 0; previewX < MAP_PREVIEW_COLUMNS; previewX += 1) {
      const sourceXStart = Math.floor((previewX * map.terrainWidth) / MAP_PREVIEW_COLUMNS)
      const sourceXEnd = Math.floor(((previewX + 1) * map.terrainWidth) / MAP_PREVIEW_COLUMNS)
      counts.fill(0)
      for (let sourceY = sourceYStart; sourceY < sourceYEnd; sourceY += 1) {
        const rowOffset = sourceY * map.terrainWidth
        for (let sourceX = sourceXStart; sourceX < sourceXEnd; sourceX += 1)
          counts[map.terrainCells[rowOffset + sourceX]] += 1
      }

      let material: TerrainMaterialId = TERRAIN_MATERIAL.empty
      for (let candidate = TERRAIN_MATERIAL.soil; candidate <= TERRAIN_MATERIAL.steel; candidate += 1) {
        if (counts[candidate] > counts[material] || material === TERRAIN_MATERIAL.empty && counts[candidate])
          material = candidate
      }
      cells[previewY * MAP_PREVIEW_COLUMNS + previewX] = material
    }
  }

  const terrain: MapPreviewRun[] = []
  const surfaces: MapPreviewRun[] = []
  for (let y = 0; y < MAP_PREVIEW_ROWS; y += 1) {
    let x = 0
    while (x < MAP_PREVIEW_COLUMNS) {
      const material = cells[y * MAP_PREVIEW_COLUMNS + x]
      if (material === TERRAIN_MATERIAL.empty) {
        x += 1
        continue
      }
      const start = x
      while (x < MAP_PREVIEW_COLUMNS && cells[y * MAP_PREVIEW_COLUMNS + x] === material)
        x += 1
      terrain.push({
        x: start * MAP_PREVIEW_CELL_WIDTH,
        y: y * MAP_PREVIEW_CELL_HEIGHT,
        width: (x - start) * MAP_PREVIEW_CELL_WIDTH,
        material: material as TerrainMaterialId,
      })
    }

    x = 0
    while (x < MAP_PREVIEW_COLUMNS) {
      const isSurface =
        cells[y * MAP_PREVIEW_COLUMNS + x] === TERRAIN_MATERIAL.soil &&
        (y === 0 || cells[(y - 1) * MAP_PREVIEW_COLUMNS + x] === TERRAIN_MATERIAL.empty)
      if (!isSurface) {
        x += 1
        continue
      }
      const start = x
      while (
        x < MAP_PREVIEW_COLUMNS &&
        cells[y * MAP_PREVIEW_COLUMNS + x] === TERRAIN_MATERIAL.soil &&
        (y === 0 || cells[(y - 1) * MAP_PREVIEW_COLUMNS + x] === TERRAIN_MATERIAL.empty)
      )
        x += 1
      surfaces.push({
        x: start * MAP_PREVIEW_CELL_WIDTH,
        y: y * MAP_PREVIEW_CELL_HEIGHT,
        width: (x - start) * MAP_PREVIEW_CELL_WIDTH,
        material: TERRAIN_MATERIAL.soil,
      })
    }
  }

  const data = { terrain, surfaces }
  mapPreviewCache.set(map, data)
  return data
}

function colorHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

function MapPreview({ mapId }: { mapId: MapId }) {
  const map = MAPS[mapId]
  const preview = mapPreviewData(map)
  const objectSegments: Array<{
    objectId: string
    aperture: { start: { x: number; y: number }; end: { x: number; y: number } }
    label: 'A' | 'B' | null
  }> = []
  for (const object of map.objects) {
    if (object.type === 'projectile-portal') {
      objectSegments.push(
        { objectId: object.id, aperture: object.entrance, label: 'A' },
        { objectId: object.id, aperture: object.exit, label: 'B' },
      )
    } else objectSegments.push({ objectId: object.id, aperture: object, label: null })
  }
  const materialColors = [
    'transparent',
    colorHex(map.theme.terrain),
    colorHex(map.theme.brick),
    colorHex(map.theme.stone),
    colorHex(map.theme.steel),
  ]
  return (
    <svg
      className="map-preview"
      viewBox={`0 0 ${MAP_PREVIEW_WIDTH} ${MAP_PREVIEW_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect width={MAP_PREVIEW_WIDTH} height={MAP_PREVIEW_HEIGHT} fill={colorHex(map.theme.sky)} />
      <g shapeRendering="crispEdges">
        {preview.terrain.map((run, index) => (
          <rect
            key={index}
            x={run.x}
            y={run.y}
            width={run.width}
            height={MAP_PREVIEW_CELL_HEIGHT}
            fill={materialColors[run.material]}
          />
        ))}
        {preview.surfaces.map((run, index) => (
          <rect
            key={index}
            x={run.x}
            y={run.y}
            width={run.width}
            height={0.7}
            fill={colorHex(map.theme.surface)}
          />
        ))}
      </g>
      <g className="map-preview-reflectors">
        {objectSegments.map(({ objectId, aperture, label }) => {
          const startX = (aperture.start.x / map.width) * MAP_PREVIEW_WIDTH
          const startY = (aperture.start.y / map.height) * MAP_PREVIEW_HEIGHT
          const endX = (aperture.end.x / map.width) * MAP_PREVIEW_WIDTH
          const endY = (aperture.end.y / map.height) * MAP_PREVIEW_HEIGHT
          const dx = endX - startX
          const dy = endY - startY
          const length = Math.hypot(dx, dy) || 1
          const normalX = -dy / length
          const normalY = dx / length
          return (
            <g key={`${objectId}-${label ?? 'wall'}`} className={label ? `map-preview-portal portal-${label.toLowerCase()}` : undefined}>
              <line className="map-preview-reflector-outer" x1={startX} y1={startY} x2={endX} y2={endY} />
              <line className="map-preview-reflector-inner" x1={startX} y1={startY} x2={endX} y2={endY} />
              {[0.25, 0.5, 0.75].map((position) => {
                const x = startX + dx * position
                const y = startY + dy * position
                return (
                  <line
                    className="map-preview-reflector-hatch"
                    key={position}
                    x1={x - normalX * 2 - (dx / length)}
                    y1={y - normalY * 2 - (dy / length)}
                    x2={x + normalX * 2 + (dx / length)}
                    y2={y + normalY * 2 + (dy / length)}
                  />
                )
              })}
              {label && <text className="map-preview-portal-label" x={(startX + endX) / 2} y={(startY + endY) / 2 + 2.5}>{label}</text>}
            </g>
          )
        })}
      </g>
      {map.spawnPoints.map((spawn) => {
        const x = (spawn.x / map.width) * MAP_PREVIEW_WIDTH
        const y = Math.max(4, (spawn.y / map.height) * MAP_PREVIEW_HEIGHT - 4)
        return (
          <g
            className={`map-preview-spawn map-preview-spawn-${spawn.teamId === 0 ? 'comet' : 'ember'}`}
            key={`${spawn.teamId}-${spawn.teamSlot}`}
            transform={`translate(${x} ${y})`}
          >
            {spawn.teamId === 0 ? (
              <>
                <path d="M-6 2 L-2.2 -1.7 L-1.5 2.7 Z" />
                <circle r="2.8" />
              </>
            ) : (
              <path d="M0 -4 L3.2 0 L0 4 L-3.2 0 Z" />
            )}
          </g>
        )
      })}
    </svg>
  )
}

function MapMechanicLegend({ mapId }: { mapId: MapId }) {
  const hasReflector = MAPS[mapId].objects.some((object) => object.type === 'reflector-wall')
  const hasPortal = MAPS[mapId].objects.some((object) => object.type === 'projectile-portal')
  if (!hasReflector && !hasPortal) return null
  return (
    <span className="map-mechanic-legend">
      {hasReflector && <><i aria-hidden="true" /> Reflects projectiles</>}
      {hasPortal && <><i className="portal-legend-mark" aria-hidden="true">A↔B</i> Paired projectile portals</>}
    </span>
  )
}

type ProjectileBoundaryMode = LocalMatchConfig['projectileBoundaryMode']

const PROJECTILE_BOUNDARY_COPY: Record<
  ProjectileBoundaryMode,
  { label: string; description: string }
> = {
  open: { label: 'Open', description: 'Shots leave the battlefield.' },
  reflect: { label: 'Reflect', description: 'Shots bounce off every world edge.' },
  wrap: { label: 'Wrap', description: 'Shots cross from one side to the other.' },
}

function ProjectileBoundaryPicker({
  config,
  onChange,
}: {
  config: LocalMatchConfig
  onChange: (mode: ProjectileBoundaryMode) => void
}) {
  const supportedModes = getMap(config.mapId).projectileBoundary.supportedModes
  return (
    <div className="mode-picker boundary-mode-picker" aria-label="Projectile boundary rule">
      {supportedModes.map((mode) => (
        <button
          type="button"
          key={mode}
          className={config.projectileBoundaryMode === mode ? 'selected' : ''}
          onClick={() => onChange(mode)}
        >
          <strong>{PROJECTILE_BOUNDARY_COPY[mode].label}</strong>
          <span>{PROJECTILE_BOUNDARY_COPY[mode].description}</span>
        </button>
      ))}
    </div>
  )
}

function projectileBoundaryLabel(mode: ProjectileBoundaryMode): string {
  return PROJECTILE_BOUNDARY_COPY[mode].label
}

function ArsenalRulesPanel({
  rules,
  level,
  onChange,
}: {
  rules: ArsenalRules
  level: number
  onChange: (rules: ArsenalRules) => void
}) {
  const enabledCount = usableArsenalWeapons(rules).length
  const updateAmount = (weaponId: WeaponId, amount: WeaponInventory[WeaponId]) =>
    onChange(
      sanitizeArsenalRules({
        presetId: 'custom',
        ammunition: { ...rules.ammunition, [weaponId]: amount },
      }, level),
    )
  return (
    <details className="arsenal-rule-control">
      <summary>
        <span><strong>Arsenal rules</strong><small>{arsenalSummary(rules)}</small></span>
        <em>{rules.presetId === 'custom' ? 'Custom' : rules.presetId}</em>
      </summary>
      <div className="arsenal-preset-picker" aria-label="Arsenal preset">
        {(['standard', 'classic', 'chaos'] as const).map((presetId) => (
          <button
            type="button"
            key={presetId}
            className={rules.presetId === presetId ? 'selected' : ''}
            onClick={() => onChange(sanitizeArsenalRules(ARSENAL_PRESETS[presetId], level))}
          >
            {presetId}
          </button>
        ))}
      </div>
      <div className="arsenal-weapon-grid">
        {WEAPON_ORDER.map((weaponId) => {
          const amount = rules.ammunition[weaponId]
          const enabled = amount === 'unlimited' || amount > 0
          const unlocked = isWeaponUnlocked(weaponId, level)
          return (
            <label className={`arsenal-weapon-control ${enabled ? '' : 'disabled'} ${unlocked ? '' : 'locked'}`} key={weaponId}>
                 <input
                className="arsenal-enabled-toggle"
                type="checkbox"
                   checked={enabled}
                   disabled={!unlocked || (!enabled && rules.presetId !== 'chaos' && enabledCount >= MAX_LOADOUT_WEAPONS)}
                onChange={(event) =>
                  updateAmount(weaponId, event.target.checked ? WEAPONS[weaponId].ammunition : 0)
                }
              />
              <WeaponIcon weaponId={weaponId} />
              <span className="arsenal-weapon-name">{WEAPONS[weaponId].displayName}</span>
              {!unlocked && <small className="weapon-unlock-level">Unlocks at level {WEAPON_UNLOCK_LEVEL[weaponId]}</small>}
              <select
                aria-label={`${WEAPONS[weaponId].displayName} ammunition`}
                disabled={!unlocked || !enabled}
                value={amount}
                onChange={(event) =>
                  updateAmount(
                    weaponId,
                    event.target.value === 'unlimited' ? 'unlimited' : Number(event.target.value),
                  )
                }
              >
                {[1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>{value}</option>)}
                <option value="unlimited">Unlimited</option>
              </select>
            </label>
          )
        })}
      </div>
      <p className="arsenal-note">Choose up to {MAX_LOADOUT_WEAPONS} unlocked weapons. Chaos mode enables every weapon available at your level. Basic Rocket remains unlimited.</p>
    </details>
  )
}

function Help() {
  return (
    <div className="tutorial-grid">
      <section className="tutorial-step">
        <span className="tutorial-icon">
          <kbd>Q</kbd>
          <kbd>D</kbd>
        </span>
        <h3>1. Scout</h3>
        <p>Move with Q/A and D. Jump with Z/W.</p>
      </section>
      <section className="tutorial-step">
        <span className="tutorial-icon drag-icon">↗</span>
        <h3>2. Choose a tool</h3>
        <p>Click a weapon in the dock, or use [ and ]. Watch its ammunition.</p>
      </section>
      <section className="tutorial-step">
        <span className="tutorial-icon power-icon">▰</span>
        <h3>3. Aim shots</h3>
        <p>For launchers, drag in front to set the arc and power.</p>
      </section>
      <section className="tutorial-step">
        <span className="tutorial-icon weapon-icon">✦</span>
        <h3>4. Place tools</h3>
        <p>Point the Teleporter at safe ground. Face the target before using close-range tools.</p>
      </section>
      <section className="tutorial-step">
        <span className="tutorial-icon fire-icon">➤</span>
        <h3>5. Activate</h3>
        <p>Press Space to fire, warp, or deploy. Craters change every route.</p>
      </section>
      <section className="tutorial-step">
        <span className="tutorial-icon boom-icon">✹</span>
        <h3>6. Win</h3>
        <p>Outlast your rival. Blasts can hurt you too.</p>
      </section>
    </div>
  )
}

function Settings({
  preferences,
  onChange,
}: {
  preferences: Preferences
  onChange: (value: Preferences) => void
}) {
  const update = (value: Partial<Preferences>) => onChange({ ...preferences, ...value })
  return (
    <div className="settings-grid">
      <label>
        Default turn duration
        <select
          value={preferences.turnDurationSeconds}
          onChange={(event) =>
            update({ turnDurationSeconds: Number(event.target.value) as TurnDuration })
          }
        >
          <option value={20}>20 seconds</option>
          <option value={30}>30 seconds</option>
          <option value={45}>45 seconds</option>
        </select>
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={preferences.cameraShake}
          onChange={(event) => update({ cameraShake: event.target.checked })}
        />{' '}
        Camera shake
      </label>
      <label>
        Camera view
        <select
          value={preferences.cameraMode}
          onChange={(event) =>
            update({ cameraMode: event.target.value as Preferences['cameraMode'] })
          }
        >
          <option value="fit">Fit entire map</option>
          <option value="follow">Follow the action</option>
        </select>
      </label>
      <label>
        Aim guide
        <select
          value={preferences.aimGuide}
          onChange={(event) => update({ aimGuide: event.target.value as Preferences['aimGuide'] })}
        >
          <option value="normal">Normal</option>
          <option value="minimal">Minimal</option>
        </select>
      </label>
      <label>
        Screen flash
        <select
          value={preferences.screenFlash}
          onChange={(event) =>
            update({ screenFlash: event.target.value as Preferences['screenFlash'] })
          }
        >
          <option value="normal">Normal</option>
          <option value="reduced">Reduced</option>
          <option value="off">Off</option>
        </select>
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={preferences.reducedMotion}
          onChange={(event) => update({ reducedMotion: event.target.checked })}
        />{' '}
        Reduced motion
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={preferences.highContrastHud}
          onChange={(event) => update({ highContrastHud: event.target.checked })}
        />{' '}
        High-contrast HUD
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={preferences.mute}
          onChange={(event) => update({ mute: event.target.checked })}
        />{' '}
        Mute sound effects
      </label>
      <label>
        Master volume
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={preferences.masterVolume}
          onChange={(event) => update({ masterVolume: Number(event.target.value) })}
        />
      </label>
      <label>
        Sound effects volume
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={preferences.soundEffectsVolume}
          onChange={(event) => update({ soundEffectsVolume: Number(event.target.value) })}
        />
      </label>
      <button
        type="button"
        className="fullscreen-setting"
        onClick={() => document.documentElement.requestFullscreen?.()}
      >
        <span className="fullscreen-setting-icon" aria-hidden="true" />
        <span><strong>Enter fullscreen</strong><small>Use the whole display for the battlefield.</small></span>
        <b aria-hidden="true">Open</b>
      </button>
    </div>
  )
}

function ConnectionTroubleshooting({ message }: { message: string }) {
  return (
    <div className="connection-error" role="alert">
      <p className="form-error">{message}</p>
      <details>
        <summary>Connection troubleshooting</summary>
        <ul>
          <li>Allow this game site in content blockers, then retry.</li>
          <li>Test the connection in a private browser window.</li>
          <li>Temporarily disable a VPN or strict network filter.</li>
          <li>Verify that the browser is online.</li>
          <li>Return to the menu if the connection still fails.</li>
        </ul>
      </details>
    </div>
  )
}

const APPEARANCE_GROUPS = [
  { field: 'body', label: 'Body', entries: PLAYER_BODIES },
  { field: 'primaryColor', label: 'Primary', entries: PLAYER_PRIMARY_COLORS },
  { field: 'accentColor', label: 'Accent', entries: PLAYER_ACCENT_COLORS },
  { field: 'pattern', label: 'Pattern', entries: PLAYER_PATTERNS },
  { field: 'face', label: 'Face', entries: PLAYER_FACES },
  { field: 'victoryStyle', label: 'Victory style', entries: PLAYER_VICTORY_STYLES },
  { field: 'accessory', label: 'Accessory', entries: PLAYER_ACCESSORIES },
] as const

function PresetNameEditor({ preset, onSave }: { preset: OutfitPreset; onSave: (name: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(preset.name)
  const cancel = () => { setDraft(preset.name); setEditing(false) }
  const save = () => { onSave(draft); setEditing(false) }
  if (!editing) return <button type="button" className="preset-name" onClick={() => { setDraft(preset.name); setEditing(true) }}>{preset.name}</button>
  return <span className="preset-name-editor"><input autoFocus aria-label={`Rename ${preset.name}`} value={draft} maxLength={24} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); save() } else if (event.key === 'Escape') { event.preventDefault(); cancel() } }} onBlur={(event) => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node)) cancel() }} /><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={save}>Save</button><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={cancel}>Cancel</button></span>
}

function CustomizePlayer({
  appearances: initialAppearances,
  presets: initialPresets,
  selectedSlot,
  onSelectSlot,
  cosmeticLoadout: initialCosmeticLoadout,
  arsenal: initialArsenal,
  level,
  entitlements,
  onSave,
  onOpenWorkshop,
  onBack,
}: {
  appearances: readonly PlayerAppearance[]
  presets: readonly OutfitPreset[]
  selectedSlot: number
  onSelectSlot: (slot: number) => void
  cosmeticLoadout: CosmeticLoadout
  arsenal: ArsenalRules
  level: number
  entitlements: readonly string[]
  onSave: (changes: { appearances: PlayerAppearance[]; presets: OutfitPreset[]; cosmeticLoadout: CosmeticLoadout; arsenal: ArsenalRules }) => void
  onOpenWorkshop: () => void
  onBack: () => void
}) {
  const [activeTab, setActiveTab] = useState<'player' | 'loadout'>('player')
  const [previewWeapon, setPreviewWeapon] = useState<WeaponId>('basic-rocket')
  const [appearances, setAppearances] = useState(() => initialAppearances.map((appearance) => ({ ...appearance })))
  const [presets, setPresets] = useState(() => initialPresets.map((preset) => ({ ...preset, appearance: { ...preset.appearance } })))
  const [cosmeticLoadout, setCosmeticLoadout] = useState(initialCosmeticLoadout)
  const [arsenal, setArsenal] = useState(() => sanitizeArsenalRules(initialArsenal, level))
  const [previewCosmeticLoadout, setPreviewCosmeticLoadout] = useState(initialCosmeticLoadout)
  const [presetName, setPresetName] = useState('')
  const onChange = (slot: number, nextAppearance: PlayerAppearance) => setAppearances((current) => current.map((appearance, index) => index === slot ? nextAppearance : appearance))
  const onPresetsChange = setPresets
  const onCosmeticLoadoutChange = setCosmeticLoadout
  const appearance = appearances[selectedSlot] ?? DEFAULT_PLAYER_APPEARANCES[selectedSlot]
  const appearanceOwned = (field: keyof typeof FREE_APPEARANCE_IDS, id: string) => FREE_APPEARANCE_IDS[field].has(id) || entitlements.includes(`${field === 'victoryStyle' ? 'victory-style' : field}:${id}`)
  const randomOwnedAppearance = () => {
    const next = randomPlayerAppearance()
    for (const field of ['pattern', 'face', 'victoryStyle', 'accessory'] as const) {
      const owned = APPEARANCE_GROUPS.find((group) => group.field === field)!.entries.filter((entry) => appearanceOwned(field, entry.id))
      next[field] = owned[Math.floor(Math.random() * owned.length)].id as never
    }
    return next
  }
  const uniquePresetId = () => {
    let id: string
    do id = globalThis.crypto?.randomUUID?.() ?? `outfit-${Date.now()}-${Math.random().toString(36).slice(2)}`
    while (presets.some((preset) => preset.id === id))
    return id
  }
  const savePreset = () => {
    if (presets.length >= MAX_OUTFIT_PRESETS) return
    onPresetsChange([...presets, makeOutfitPreset(uniquePresetId(), presetName, appearance, Date.now())])
    setPresetName('')
  }
  const updatePreset = (id: string, changes: Partial<Pick<OutfitPreset, 'name' | 'appearance'>>) =>
    onPresetsChange(presets.map((preset) => preset.id === id ? {
      ...preset,
      ...changes,
      name: sanitizeOutfitPresetName(changes.name ?? preset.name),
      appearance: { ...(changes.appearance ?? preset.appearance) },
      updatedAt: Date.now(),
    } : preset))
  return (
    <section className="panel customize-panel">
      <header className="screen-heading">
        <p className="eyebrow">OPEN THE DRESS-UP DRAWER</p>
        <h2>Customize players</h2>
        <p>Every local slot keeps its own look, ready for local or online play.</p>
      </header>
      <div className="customize-tabs" role="tablist" aria-label="Customization section">
        <button type="button" role="tab" aria-selected={activeTab === 'player'} className={activeTab === 'player' ? 'selected' : ''} onClick={() => setActiveTab('player')}>Player</button>
        <button type="button" role="tab" aria-selected={activeTab === 'loadout'} className={activeTab === 'loadout' ? 'selected' : ''} onClick={() => setActiveTab('loadout')}>Weapon loadout</button>
      </div>
      {activeTab === 'player' ? <div className="customize-layout">
        <aside className="customize-preview">
          <div className="slot-picker" role="tablist" aria-label="Local player slot">
            {appearances.map((item, index) => (
              <button
                type="button"
                role="tab"
                aria-selected={selectedSlot === index}
                className={selectedSlot === index ? 'selected' : ''}
                key={index}
                onClick={() => onSelectSlot(index)}
              >
                <PlayerAvatar appearance={item} label="" />
                <span>P{index + 1}</span>
              </button>
            ))}
          </div>
          <div className="customize-player-stage"><PlayerAvatar appearance={appearance} teamId={selectedSlot % 2} teamBackground label="Your current player" pose="aim" weaponId={previewWeapon} weaponSkinId={weaponSkinFor(previewCosmeticLoadout, previewWeapon)} projectileSkinId={previewCosmeticLoadout.projectileSkin} /><strong>Your player</strong><span>Every choice below is shown directly on this model.</span></div>
          <div className="actions customize-random-actions">
            <button type="button" onClick={() => onChange(selectedSlot, randomOwnedAppearance())}>Randomize</button>
            <button type="button" className="secondary" onClick={() => onChange(selectedSlot, { ...DEFAULT_PLAYER_APPEARANCES[selectedSlot] })}>Reset</button>
          </div>
          <section className="preset-library" aria-labelledby="preset-library-title">
            <div className="preset-heading">
              <h3 id="preset-library-title">Outfit presets</h3>
              <span>{presets.length}/{MAX_OUTFIT_PRESETS}</span>
            </div>
            <div className="preset-save-row">
              <label htmlFor="preset-name">Preset name</label>
              <input id="preset-name" value={presetName} maxLength={24} placeholder="Outfit" onChange={(event) => setPresetName(event.target.value)} />
              <button type="button" onClick={savePreset} disabled={presets.length >= MAX_OUTFIT_PRESETS}>Save current</button>
            </div>
            {presets.length === 0 ? <p className="preset-empty">No saved outfits yet.</p> : <ul className="preset-list">
              {presets.slice(0, MAX_OUTFIT_PRESETS).map((preset) => <li key={preset.id}>
                <PlayerAvatar appearance={preset.appearance} label={`${preset.name} outfit`} compact />
                <PresetNameEditor preset={preset} onSave={(name) => updatePreset(preset.id, { name })} />
                <div className="preset-actions">
                  <button type="button" onClick={() => onChange(selectedSlot, { ...preset.appearance })}>Apply to P{selectedSlot + 1}</button>
                  <button type="button" onClick={() => updatePreset(preset.id, { appearance })}>Replace</button>
                  <button type="button" disabled={presets.length >= MAX_OUTFIT_PRESETS} onClick={() => onPresetsChange([...presets, makeOutfitPreset(uniquePresetId(), `${preset.name} copy`, preset.appearance, Date.now())])}>Duplicate</button>
                  <button type="button" className="preset-delete" onClick={() => onPresetsChange(presets.filter((item) => item.id !== preset.id))}>Delete</button>
                </div>
              </li>)}
            </ul>}
          </section>
        </aside>
        <div className="appearance-galleries">
          {APPEARANCE_GROUPS.map((group) => (
            <fieldset className={`appearance-group ${group.field === 'victoryStyle' ? 'victory-style-group' : ''}`} key={group.field}>
              <legend>{group.label}</legend>
              {group.field === 'victoryStyle' && <p className="victory-style-note">Your normal face stays the same. This expression and pose only appear when you win.</p>}
              <div className="appearance-options">
                {group.entries.filter((entry) => !(['pattern', 'face', 'victoryStyle', 'accessory'] as string[]).includes(group.field) || appearanceOwned(group.field as keyof typeof FREE_APPEARANCE_IDS, entry.id)).map((entry) => (
                  <button
                    type="button"
                    className={appearance[group.field] === entry.id ? 'selected' : ''}
                    aria-pressed={appearance[group.field] === entry.id}
                    key={entry.id}
                    onClick={() => onChange(selectedSlot, { ...appearance, [group.field]: entry.id } as PlayerAppearance)}
                  >
                    <PlayerAvatar appearance={{ ...appearance, [group.field]: entry.id } as PlayerAppearance} pose={group.field === 'victoryStyle' ? 'victory' : 'idle'} label={`${entry.label} preview`} />
                    {'color' in entry && <i style={{ backgroundColor: entry.color }} aria-hidden="true" />}
                    <span>{entry.label}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </div> : <div className="loadout-customizer">
        <section className="loadout-preview-card">
          <PlayerAvatar appearance={appearance} teamId={selectedSlot % 2} teamBackground label="Weapon loadout preview" pose="aim" weaponId={previewWeapon} weaponSkinId={weaponSkinFor(previewCosmeticLoadout, previewWeapon)} projectileSkinId={previewCosmeticLoadout.projectileSkin} />
          <div><p className="eyebrow">YOUR SIX</p><h3>Choose the default arsenal</h3><p>Standard online and local matches use these weapons. Chaos mode ignores this limit and enables the full arsenal.</p></div>
        </section>
        <fieldset className="appearance-group loadout-weapon-group"><legend>Weapons · {usableArsenalWeapons(arsenal).length}/{MAX_LOADOUT_WEAPONS}</legend><div className="loadout-weapon-grid">{WEAPON_ORDER.map((weaponId) => {
          const amount = arsenal.ammunition[weaponId]
          const selected = amount === 'unlimited' || amount > 0
          const full = usableArsenalWeapons(arsenal).length >= MAX_LOADOUT_WEAPONS
          const unlocked = isWeaponUnlocked(weaponId, level)
          return <button type="button" key={weaponId} className={selected ? 'selected' : ''} disabled={!unlocked || (!selected && full)} aria-pressed={selected} onMouseEnter={() => setPreviewWeapon(weaponId)} onFocus={() => setPreviewWeapon(weaponId)} onClick={() => { setPreviewWeapon(weaponId); setArsenal(sanitizeArsenalRules({ ammunition: { ...arsenal.ammunition, [weaponId]: selected ? 0 : WEAPONS[weaponId].ammunition } }, level)) }}><WeaponIcon weaponId={weaponId} skinId={weaponSkinFor(previewCosmeticLoadout, weaponId)} /><span>{WEAPONS[weaponId].displayName}</span>{!unlocked && <small>Unlocks at level {WEAPON_UNLOCK_LEVEL[weaponId]}</small>}</button>
        })}</div></fieldset>
        <fieldset className="appearance-group owned-finish-group"><legend>{WEAPONS[previewWeapon].displayName} finish</legend><div className="appearance-options owned-finish-options">{WEAPON_SKINS.filter((skin) => isCosmeticOwned('weapon', skin.id, entitlements, previewWeapon)).map((skin) => {
          const previewed = weaponSkinFor(previewCosmeticLoadout, previewWeapon) === skin.id
          return <button type="button" key={skin.id} className={previewed ? 'selected' : ''} aria-pressed={previewed} onClick={() => { const next = { ...cosmeticLoadout, weaponSkins: { ...cosmeticLoadout.weaponSkins, [previewWeapon]: skin.id } }; setPreviewCosmeticLoadout(next); onCosmeticLoadoutChange(next) }}><WeaponIcon weaponId={previewWeapon} skinId={skin.id} /><span>{skin.label}{weaponSkinFor(cosmeticLoadout, previewWeapon) === skin.id ? ' · Equipped' : ''}</span></button>
        })}</div><button type="button" className="button-quiet owned-finish-shop" onClick={onOpenWorkshop}>Browse weapon finishes</button></fieldset>
      </div>}
      <div className="actions customize-back">
        <button className="button-primary" onClick={() => onSave({ appearances, presets, cosmeticLoadout, arsenal })}>Save changes</button>
        <button className="button-quiet" onClick={onBack}>Discard</button>
      </div>
    </section>
  )
}

function CosmeticWorkshop({
  appearance,
  loadout,
  progression,
  signedIn,
  onEquip,
  onEquipAppearance,
  onPurchase,
  onBack,
}: {
  appearance: PlayerAppearance
  loadout: CosmeticLoadout
  progression: ProgressionOverview | null
  signedIn: boolean
  onEquip: (loadout: CosmeticLoadout) => void
  onEquipAppearance: (appearance: PlayerAppearance) => void
  onPurchase: (cosmeticId: string, loadout?: CosmeticLoadout, appearance?: PlayerAppearance) => Promise<void>
  onBack: () => void
}) {
  const [previewLoadout, setPreviewLoadout] = useState(loadout)
  const [previewWeapon, setPreviewWeapon] = useState<WeaponId>('basic-rocket')
  const [category, setCategory] = useState<'weapon' | 'pattern' | 'face' | 'victoryStyle' | 'accessory'>('weapon')
  const [page, setPage] = useState(0)
  const [previewAppearance, setPreviewAppearance] = useState(appearance)
  const [selectedAppearanceCosmetic, setSelectedAppearanceCosmetic] = useState(APPEARANCE_COSMETICS[0])
  const [purchaseBusy, setPurchaseBusy] = useState<string | null>(null)
  const [purchaseError, setPurchaseError] = useState<string | null>(null)
  const entitlements = progression?.entitlements ?? []
  const balance = progression?.summary.currencyBalance ?? 0
  const previewSkin = WEAPON_SKINS.find((skin) => skin.id === weaponSkinFor(previewLoadout, previewWeapon))!
  const previewOwned = category === 'weapon' ? isCosmeticOwned('weapon', previewSkin.id, entitlements, previewWeapon) : entitlements.includes(selectedAppearanceCosmetic.entitlementId)
  const previewEquipped = category === 'weapon' ? weaponSkinFor(loadout, previewWeapon) === previewSkin.id : appearance[selectedAppearanceCosmetic.kind] === selectedAppearanceCosmetic.id
  const previewNext = { ...loadout, weaponSkins: { ...loadout.weaponSkins, [previewWeapon]: previewSkin.id } }
  const categoryItems = category === 'weapon'
    ? WEAPON_SKINS
    : APPEARANCE_COSMETICS.filter((cosmetic) => cosmetic.kind === category)
  const pageSize = 8
  const pageCount = Math.max(1, Math.ceil(categoryItems.length / pageSize))
  const visibleItems = categoryItems.slice(page * pageSize, (page + 1) * pageSize)
  const buy = async (cosmeticId: string, next?: CosmeticLoadout, nextAppearance?: PlayerAppearance) => {
    setPurchaseBusy(cosmeticId)
    setPurchaseError(null)
    try {
      await onPurchase(cosmeticId, next, nextAppearance)
      if (next) setPreviewLoadout(next)
    } catch (caught) {
      setPurchaseError(caught instanceof Error ? caught.message : 'Purchase failed.')
    } finally {
      setPurchaseBusy(null)
    }
  }
  return (
    <section className="panel workshop-panel">
      <header className="workshop-toolbar">
        <button className="button-quiet" onClick={onBack}>Back</button>
        <div><p className="eyebrow">SPEND SCRAP, SHINE BRIGHT</p><h2>Cosmetic workshop</h2></div>
        <div className="workshop-balance"><strong>{balance}</strong><span>Scrap</span></div>
      </header>
      <div className="workshop-layout">
        <aside className="workshop-inspector">
          <div className="workshop-stage">
            <PlayerAvatar appearance={previewAppearance} teamId={0} teamBackground label="Your player cosmetic preview" pose={category === 'victoryStyle' ? 'victory' : category === 'weapon' ? 'aim' : 'idle'} weaponId={category === 'weapon' ? previewWeapon : undefined} weaponSkinId={weaponSkinFor(previewLoadout, previewWeapon)} projectileSkinId={previewLoadout.projectileSkin} />
          </div>
          {category === 'weapon' && <div className="workshop-weapon-picker" role="listbox" aria-label="Choose a weapon">{WEAPON_ORDER.map((id) => <button type="button" role="option" aria-selected={previewWeapon === id} className={previewWeapon === id ? 'selected' : ''} onClick={() => { setPreviewWeapon(id); setPage(0) }} key={id}><WeaponIcon weaponId={id} skinId={weaponSkinFor(previewLoadout, id)} /><span>{WEAPONS[id].displayName}</span></button>)}</div>}
          <div className="workshop-selection-copy">
            <span className={`workshop-status ${previewOwned ? 'owned' : 'locked'}`}>{previewOwned ? 'Owned' : `${category === 'weapon' ? previewSkin.price : selectedAppearanceCosmetic.price} Scrap`}</span>
            <h3>{category === 'weapon' ? `${previewSkin.label} for ${WEAPONS[previewWeapon].displayName}` : selectedAppearanceCosmetic.label}</h3>
            <p>{category === 'weapon' ? previewSkin.description : selectedAppearanceCosmetic.description}</p>
          </div>
          {previewOwned ? (
            <button className="button-primary workshop-commit" type="button" disabled={previewEquipped} onClick={() => { if (category === 'weapon') { onEquip(previewNext); setPreviewLoadout(previewNext) } else onEquipAppearance(previewAppearance) }}>{previewEquipped ? 'Currently equipped' : `Equip ${category === 'weapon' ? 'finish' : 'item'}`}</button>
          ) : <button className="button-primary workshop-commit" type="button" disabled={!signedIn || !progression || purchaseBusy !== null || balance < (category === 'weapon' ? previewSkin.price : selectedAppearanceCosmetic.price)} onClick={() => category === 'weapon' ? void buy(weaponSkinEntitlementId(previewWeapon, previewSkin.id), previewNext) : void buy(selectedAppearanceCosmetic.entitlementId, undefined, previewAppearance)}>{purchaseBusy ? 'Buying...' : `Buy & equip · ${category === 'weapon' ? previewSkin.price : selectedAppearanceCosmetic.price} Scrap`}</button>}
          {!signedIn && <small className="workshop-account-note">Sign in to earn and spend Scrap.</small>}
          {purchaseError && <p className="form-error" role="alert">{purchaseError}</p>}
        </aside>
        <section className="workshop-shelf">
          <div className="workshop-categories" role="tablist">{(['weapon', 'pattern', 'face', 'victoryStyle', 'accessory'] as const).map((item) => <button type="button" role="tab" aria-selected={category === item} className={category === item ? 'selected' : ''} onClick={() => { setCategory(item); setPage(0); const first = APPEARANCE_COSMETICS.find((cosmetic) => cosmetic.kind === item); if (first) { setSelectedAppearanceCosmetic(first); setPreviewAppearance({ ...appearance, [item]: first.id } as PlayerAppearance) } }} key={item}>{item === 'victoryStyle' ? 'Victory' : item[0].toUpperCase() + item.slice(1)}</button>)}</div>
          <header><div><p className="eyebrow">COSMETIC DRAWER</p><h3>{category === 'weapon' ? `${WEAPONS[previewWeapon].displayName} finishes` : `${category === 'victoryStyle' ? 'Victory' : category[0].toUpperCase() + category.slice(1)} collection`}</h3></div></header>
          <p>{category === 'weapon' ? 'Finishes are bought and equipped only for the weapon shown.' : 'Starter choices remain free; collect more looks with Scrap.'}</p>
          <div className={`workshop-grid workshop-grid-${category}`}>{category === 'weapon' ? (visibleItems as readonly (typeof WEAPON_SKINS)[number][]).map((skin) => {
        const owned = isCosmeticOwned('weapon', skin.id, entitlements, previewWeapon)
        const equipped = weaponSkinFor(loadout, previewWeapon) === skin.id
        const previewed = weaponSkinFor(previewLoadout, previewWeapon) === skin.id
        const next = { ...loadout, weaponSkins: { ...loadout.weaponSkins, [previewWeapon]: skin.id } }
        return <button type="button" className={`workshop-card ${previewed ? 'previewing' : ''}`} key={skin.id} aria-pressed={previewed} onClick={() => setPreviewLoadout(next)}><span className="workshop-item-preview weapon"><WeaponIcon weaponId={previewWeapon} skinId={skin.id} /></span><span className="workshop-card-copy"><strong>{skin.label}</strong><small className={`workshop-status ${owned ? 'owned' : 'locked'}`}>{equipped ? 'Equipped' : owned ? 'Owned' : `${skin.price} Scrap`}</small></span></button>
      }) : (visibleItems as readonly (typeof APPEARANCE_COSMETICS)[number][]).map((cosmetic) => { const owned = entitlements.includes(cosmetic.entitlementId); const nextAppearance = { ...appearance, [cosmetic.kind]: cosmetic.id } as PlayerAppearance; return <button type="button" className={`workshop-card ${selectedAppearanceCosmetic.entitlementId === cosmetic.entitlementId ? 'previewing' : ''}`} key={cosmetic.entitlementId} onClick={() => { setSelectedAppearanceCosmetic(cosmetic); setPreviewAppearance(nextAppearance) }}><span className="workshop-item-preview player"><PlayerAvatar appearance={nextAppearance} pose={cosmetic.kind === 'victoryStyle' ? 'victory' : 'idle'} label="" /></span><span className="workshop-card-copy"><strong>{cosmetic.label}</strong><small className={`workshop-status ${owned ? 'owned' : 'locked'}`}>{appearance[cosmetic.kind] === cosmetic.id ? 'Equipped' : owned ? 'Owned' : `${cosmetic.price} Scrap`}</small></span></button> })}</div>
          {pageCount > 1 && <nav className="workshop-pagination" aria-label={`${category} pages`}><button type="button" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Previous</button><span>Page {page + 1} of {pageCount}</span><button type="button" disabled={page === pageCount - 1} onClick={() => setPage((current) => current + 1)}>Next</button></nav>}
        </section>
      </div>
    </section>
  )
}

export function App() {
  const [preferences, setPreferences] = useState<Preferences>(() => loadPreferences())
  const auth = useOptionalAuth()
  const accountSync = useAccountSync(auth, preferences, setPreferences)
  const gameTicketProvider = auth.signedIn ? () => createGameTicket(auth.getToken) : undefined
  const [screen, setScreen] = useState<Screen>('menu')
  const [confirmAccountDeletion, setConfirmAccountDeletion] = useState(false)
  const [accountDeletionText, setAccountDeletionText] = useState('')
  const [accountActionBusy, setAccountActionBusy] = useState(false)
  const [accountActionError, setAccountActionError] = useState<string | null>(null)
  const [cloudAccountAvailable, setCloudAccountAvailable] = useState<boolean | null>(null)
  const [progression, setProgression] = useState<ProgressionOverview | null>(null)
  const accountLevel = progression?.summary.level ?? 1
  const [progressionLoading, setProgressionLoading] = useState(false)
  const [customizeSlot, setCustomizeSlot] = useState(0)
  const [customizeReturnScreen, setCustomizeReturnScreen] = useState<
    'menu' | 'setup' | 'online-create' | 'online-join' | 'profile'
  >('menu')
  const [workshopReturnScreen, setWorkshopReturnScreen] = useState<'menu' | 'customize'>('menu')
  const [config, setConfig] = useState<LocalMatchConfig>(() =>
    validateMatchConfig(loadPreferences(), 1),
  )
  const [paused, setPaused] = useState(false)
  const [pausePanel, setPausePanel] = useState<PausePanel>('main')
  const [result, setResult] = useState<MatchResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [matchMode, setMatchMode] = useState<SessionMode>('local')
  const [editorTestActive, setEditorTestActive] = useState(false)
  const [editorTestDocument, setEditorTestDocument] = useState<MapDocument | null>(null)
  const [onlineSession, setOnlineSession] = useState<OnlineRoomSession | null>(null)
  const [roomView, setRoomView] = useState<OnlineRoomView | null>(null)
  const [roomCodeInput, setRoomCodeInput] = useState('')
  const [onlineBusy, setOnlineBusy] = useState(false)
  const [onlineSlow, setOnlineSlow] = useState(false)
  const [onlineError, setOnlineError] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<
    'connected' | 'reconnecting' | 'failed' | 'left'
  >('connected')
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>('unknown')
  const [latencyMs, setLatencyMs] = useState<number | null>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<GameHost | null>(null)
  const activeSessionRef = useRef<OnlineRoomSession | null>(null)
  const sessionGuardRef = useRef(new OnlineSessionGenerationGuard())
  const startupAbortRef = useRef<AbortController | null>(null)
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const userOperationBusyRef = useRef(false)
  const screenRef = useRef<Screen>(screen)
  const audioRef = useRef<AudioDirector | null>(null)
  audioRef.current ??= new AudioDirector({
    mute: preferences.mute,
    masterVolume: preferences.masterVolume,
    soundEffectsVolume: preferences.soundEffectsVolume,
  })
  const getVisualPreferences = useEffectEvent(() => ({
    reducedMotion: preferences.reducedMotion,
    highContrastHud: preferences.highContrastHud,
    cameraShake: preferences.cameraShake,
    cameraMode: preferences.cameraMode,
    aimGuide: preferences.aimGuide,
    screenFlash: preferences.screenFlash,
    cosmeticLoadout: entitlementAwareLoadout(preferences.cosmeticLoadout, progression?.entitlements ?? []),
  }))
  const isMatchCallbackCurrent = useEffectEvent((sessionGeneration: number | null) =>
    Boolean(
      screen === 'match' &&
      (sessionGeneration === null || activeSessionRef.current?.generation === sessionGeneration),
    ),
  )

  const beginOnlineOperation = () => {
    startupAbortRef.current?.abort()
    const controller = new AbortController()
    startupAbortRef.current = controller
    return { controller, generation: sessionGuardRef.current.begin() }
  }

  const isActiveSession = (session: OnlineRoomSession) =>
    activeSessionRef.current?.generation === session.generation && !session.isDisposed

  const activateSession = (
    session: OnlineRoomSession,
    operationGeneration: number,
    controller: AbortController,
  ): boolean => {
    if (
      controller.signal.aborted ||
      !sessionGuardRef.current.isCurrent(operationGeneration) ||
      session.isDisposed
    ) {
      void session.leave().catch(() => undefined)
      return false
    }
    startupAbortRef.current = null
    activeSessionRef.current = session
    setOnlineSession(session)
    setRoomView(session.view)
    setMatchMode('online')
    setEditorTestActive(false)
    setConnectionStatus('connected')
    return true
  }

  useEffect(() => {
    savePreferences(preferences)
  }, [preferences])
  useEffect(() => {
    if (!auth.configured) return
    let active = true
    void getAccountCapabilities()
      .then(({ enabled }) => { if (active) setCloudAccountAvailable(enabled) })
      .catch(() => { if (active) setCloudAccountAvailable(false) })
    return () => { active = false }
  }, [auth.configured])
  useEffect(() => {
    if (!auth.signedIn || !auth.user || cloudAccountAvailable === false) {
      setProgression(null)
      return
    }
    let active = true
    setProgressionLoading(true)
    void getProgression(auth.getToken)
      .then((value) => { if (active) setProgression(value) })
      .catch(() => { if (active) setProgression(null) })
      .finally(() => { if (active) setProgressionLoading(false) })
    return () => { active = false }
  }, [auth.signedIn, auth.user?.id, cloudAccountAvailable])
  useEffect(() => {
    if (!result || matchMode !== 'online' || !auth.signedIn) return
    const refresh = setTimeout(() => {
      void getProgression(auth.getToken).then(setProgression).catch(() => undefined)
    }, 900)
    return () => clearTimeout(refresh)
  }, [result, matchMode, auth.signedIn])
  useEffect(() => {
    screenRef.current = screen
  }, [screen])
  useEffect(() => {
    audioRef.current?.setPreferences({
      mute: preferences.mute,
      masterVolume: preferences.masterVolume,
      soundEffectsVolume: preferences.soundEffectsVolume,
    })
    gameRef.current?.setPresentationPreferences(getVisualPreferences())
  }, [preferences, progression])
  useEffect(() => {
    const sessionGuard = sessionGuardRef.current
    let operation: ReturnType<typeof beginOnlineOperation> | null = null
    const startReconnect = setTimeout(() => {
      operation = beginOnlineOperation()
      const currentOperation = operation
      setConnectionStatus('reconnecting')
      void OnlineRoomSession.reconnectStored(currentOperation.controller.signal)
        .then((session) => {
          if (!sessionGuard.isCurrent(currentOperation.generation)) {
            if (session) void session.leave().catch(() => undefined)
            return
          }
          startupAbortRef.current = null
          if (!session) {
            setConnectionStatus('connected')
            return
          }
          if (!activateSession(session, currentOperation.generation, currentOperation.controller))
            return
          setScreen(session.view?.phase === 'waiting' ? 'online-lobby' : 'menu')
        })
        .catch((caught) => {
          if (
            isOnlineLifecycleCancellation(caught) ||
            !sessionGuard.isCurrent(currentOperation.generation)
          )
            return
          startupAbortRef.current = null
          setConnectionStatus('connected')
        })
    }, 0)
    return () => {
      clearTimeout(startReconnect)
      if (operation) {
        sessionGuard.invalidate()
        operation.controller.abort()
        if (startupAbortRef.current === operation.controller) startupAbortRef.current = null
      }
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current)
      slowTimerRef.current = null
      userOperationBusyRef.current = false
      const session = activeSessionRef.current
      activeSessionRef.current = null
      if (session) void session.leave().catch(() => undefined)
      audioRef.current?.dispose()
    }
  }, [])
  useEffect(() => {
    if (!onlineSession || !isActiveSession(onlineSession)) return
    const sessionGeneration = onlineSession.generation
    const isCurrent = () =>
      activeSessionRef.current?.generation === sessionGeneration && !onlineSession.isDisposed
    const enterMatchWhenReady = () => {
      if (!isCurrent()) return
      const view = onlineSession.view
      if (!view || !onlineSession.source.ready || view.phase === 'waiting') return
      const authoritativeConfig = onlineSession.source.state.config
      setConfig((current) =>
        current.mapId === authoritativeConfig.mapId &&
        current.mode === authoritativeConfig.mode &&
        current.turnDurationSeconds === authoritativeConfig.turnDurationSeconds &&
        current.projectileBoundaryMode === authoritativeConfig.projectileBoundaryMode &&
        current.playerNames.length === authoritativeConfig.playerNames.length &&
        current.playerNames.every((name, index) => name === authoritativeConfig.playerNames[index]) &&
        current.playerAppearances.length === authoritativeConfig.playerAppearances.length &&
        current.playerAppearances.every((appearance, index) =>
          JSON.stringify(appearance) === JSON.stringify(authoritativeConfig.playerAppearances[index]),
        )
          ? current
          : authoritativeConfig,
      )
      setMatchMode('online')
      if (view.phase !== 'results') {
        setResult(null)
      }
      setScreen('match')
    }
    const unsubscribeView = onlineSession.subscribeView((view) => {
      if (!isCurrent()) return
      setRoomView(view)
      if (view.phase === 'waiting' && onlineSession.source.ready) setScreen('online-lobby')
      if (
        view.phase === 'results' &&
        view.result.available &&
        onlineSession.source.ready &&
        screenRef.current !== 'match'
      )
        setResult({
          config: onlineSession.source.state.config,
          winnerIndex: view.result.winnerSeat >= 0 ? view.result.winnerSeat : null,
          winnerTeamId:
            view.result.winnerTeamId === 0 || view.result.winnerTeamId === 1
              ? view.result.winnerTeamId
              : null,
          winnerPlayerIndices:
            view.result.winnerTeamId === 0 || view.result.winnerTeamId === 1
              ? onlineSession.source.state.players
                  .map((player, index) => ({ player, index }))
                  .filter(({ player }) => player.teamId === view.result.winnerTeamId)
                  .map(({ index }) => index)
              : [],
          remainingHealth: view.result.remainingHealth,
          turnsTaken: view.result.turnsTaken,
          durationSeconds: view.result.durationSeconds,
          playerRecaps: onlineSession.source.state.players.map((player) => ({
            playerId: player.id, damageDealt: 0, selfDamage: 0, shots: 0, terrainDestroyed: 0, favoriteWeaponId: null,
          })),
        })
      enterMatchWhenReady()
    })
    const unsubscribeStatus = onlineSession.subscribeStatus((status, message) => {
      if (!isCurrent()) return
      setConnectionStatus(status)
      if (status === 'failed' && message) setOnlineError(message)
    })
    const unsubscribeQuality = onlineSession.subscribeQuality((quality, latency) => {
      if (!isCurrent()) return
      setConnectionQuality(quality)
      setLatencyMs(latency)
    })
    const unsubscribeSource = onlineSession.source.subscribeState(enterMatchWhenReady)
    enterMatchWhenReady()
    return () => {
      unsubscribeView()
      unsubscribeStatus()
      unsubscribeQuality()
      unsubscribeSource()
    }
  }, [onlineSession])
  useEffect(() => {
    if (screen !== 'match' || !hostRef.current) return
    if (matchMode === 'online' && (!onlineSession || !isActiveSession(onlineSession))) return
    const sessionGeneration = onlineSession?.generation ?? null
    const callbackIsCurrent = () => isMatchCallbackCurrent(sessionGeneration)
    try {
      const visualPreferences = getVisualPreferences()
      const source = matchMode === 'online' ? onlineSession?.source : new LocalMatchSource(config)
      if (!source) return
      const gameHost = createGame(
        hostRef.current,
        source,
        {
          onPauseRequest: () => {
            if (!callbackIsCurrent()) return
            setPausePanel('main')
            setPaused(true)
          },
          onResult: (nextResult) => {
            if (callbackIsCurrent()) setResult(nextResult)
          },
          onCameraModeChange: (cameraMode) => {
            if (callbackIsCurrent())
              setPreferences((current) => ({ ...current, cameraMode }))
          },
        },
        visualPreferences,
        audioRef.current!,
      )
      gameRef.current = gameHost
      return () => {
        gameHost.destroy()
        if (gameRef.current === gameHost) gameRef.current = null
      }
    } catch (caught) {
      if (isOnlineLifecycleCancellation(caught) || !callbackIsCurrent()) return
      console.error(caught)
      queueMicrotask(() => {
        if (!callbackIsCurrent()) return
        setError('The match could not start. Please return to the menu and try again.')
      })
    }
  }, [screen, config, matchMode, onlineSession])
  useEffect(() => {
    if (paused) gameRef.current?.pause()
    else gameRef.current?.resume()
  }, [paused])
  useEffect(() => {
    const preventScroll = (event: KeyboardEvent) => {
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(event.code)) event.preventDefault()
    }
    window.addEventListener('keydown', preventScroll, { passive: false })
    return () => window.removeEventListener('keydown', preventScroll)
  }, [])

  const updatePreferences = (value: Preferences) => setPreferences(value)
  const openSetup = () => {
    setMatchMode('local')
    setEditorTestActive(false)
    setConfig(
      validateMatchConfig({
        mode: preferences.lastMode,
        playerNames: preferences.playerNames,
        playerAppearances: preferences.playerAppearances,
        mapId: preferences.lastMapId,
        turnDurationSeconds: preferences.turnDurationSeconds,
        projectileBoundaryMode: preferences.projectileBoundaryMode,
        arsenal: preferences.arsenal,
      }, accountLevel),
    )
    setScreen('setup')
  }
  const start = () => {
    const next = validateMatchConfig(config, accountLevel)
    setConfig(next)
    setPreferences({
      ...preferences,
      playerNames: preferences.playerNames.map(
        (name, index) => next.playerNames[index] ?? name,
      ),
      playerAppearances: preferences.playerAppearances.map(
        (appearance, index) => next.playerAppearances[index] ?? appearance,
      ),
      lastMode: next.mode,
      lastMapId: next.mapId,
      turnDurationSeconds: next.turnDurationSeconds,
      projectileBoundaryMode: next.projectileBoundaryMode,
      arsenal: next.arsenal,
    })
    setResult(null)
    setError(null)
    setMatchMode('local')
    setEditorTestActive(false)
    setScreen('match')
  }
  const testEditorMap = (document: MapDocument) => {
    setEditorTestDocument(structuredClone(document))
    setCustomDraftMap(document)
    setConfig(
      validateMatchConfig({
        mode: document.mode,
        playerNames: preferences.playerNames,
        playerAppearances: preferences.playerAppearances,
        mapId: 'custom-draft',
        turnDurationSeconds: preferences.turnDurationSeconds,
        projectileBoundaryMode: getMap('custom-draft').projectileBoundary.defaultMode,
        arsenal: preferences.arsenal,
      }, accountLevel),
    )
    setPaused(false)
    setResult(null)
    setError(null)
    setMatchMode('local')
    setEditorTestActive(true)
    setScreen('match')
  }
  const leaveMatch = (destination: 'menu' | 'editor' = editorTestActive ? 'editor' : 'menu') => {
    setPaused(false)
    setResult(null)
    setError(null)
    if (destination === 'menu') setEditorTestActive(false)
    setScreen(destination)
  }
  const createOnlineRoom = async () => {
    if (userOperationBusyRef.current) return
    if (!auth.signedIn || !gameTicketProvider) {
      setOnlineError('Sign in to create a private room.')
      auth.openSignIn()
      return
    }
    userOperationBusyRef.current = true
    const operation = beginOnlineOperation()
    setOnlineBusy(true)
    setOnlineSlow(false)
    const slowTimer = setTimeout(() => setOnlineSlow(true), 6000)
    slowTimerRef.current = slowTimer
    setOnlineError(null)
    try {
      const next = validateMatchConfig({
        ...config,
        playerNames: config.playerNames.map((name, index) =>
          index === 0 ? name : `Player ${index + 1}`,
        ),
      }, accountLevel)
      const session = await OnlineRoomSession.create(
        next.playerNames[0],
        next,
        operation.controller.signal,
        gameTicketProvider,
      )
      if (!activateSession(session, operation.generation, operation.controller)) return
      setPreferences({
        ...preferences,
        playerNames: preferences.playerNames.map((name, index) =>
          index === 0 ? next.playerNames[0] : name,
        ),
        playerAppearances: preferences.playerAppearances.map((appearance, index) =>
          index === 0 ? next.playerAppearances[0] : appearance,
        ),
        lastMode: next.mode,
        lastMapId: next.mapId,
        turnDurationSeconds: next.turnDurationSeconds,
        projectileBoundaryMode: next.projectileBoundaryMode,
        arsenal: next.arsenal,
      })
      setConfig(next)
      setScreen('online-lobby')
    } catch (caught) {
      if (
        isOnlineLifecycleCancellation(caught) ||
        !sessionGuardRef.current.isCurrent(operation.generation)
      )
        return
      setOnlineError(caught instanceof Error ? caught.message : 'The room could not be created.')
    } finally {
      clearTimeout(slowTimer)
      if (slowTimerRef.current === slowTimer) slowTimerRef.current = null
      if (sessionGuardRef.current.isCurrent(operation.generation)) {
        startupAbortRef.current = null
        userOperationBusyRef.current = false
        setOnlineBusy(false)
        setOnlineSlow(false)
      }
    }
  }
  const joinOnlineRoom = async () => {
    if (userOperationBusyRef.current) return
    const code = normalizeRoomCode(roomCodeInput)
    setRoomCodeInput(code)
    if (!isRoomCode(code)) {
      setOnlineError('Enter a valid 6-character room code.')
      return
    }
    userOperationBusyRef.current = true
    const operation = beginOnlineOperation()
    setOnlineBusy(true)
    setOnlineSlow(false)
    const slowTimer = setTimeout(() => setOnlineSlow(true), 6000)
    slowTimerRef.current = slowTimer
    setOnlineError(null)
    try {
      const session = await OnlineRoomSession.join(
        code,
        config.playerNames[0],
        operation.controller.signal,
        config.playerAppearances[0],
        gameTicketProvider,
      )
      if (!activateSession(session, operation.generation, operation.controller)) return
      setPreferences({
        ...preferences,
        playerNames: preferences.playerNames.map((name, index) =>
          index === 0 ? config.playerNames[0] : name,
        ),
        playerAppearances: preferences.playerAppearances.map((appearance, index) =>
          index === 0 ? config.playerAppearances[0] : appearance,
        ),
      })
      setScreen('online-lobby')
    } catch (caught) {
      if (
        isOnlineLifecycleCancellation(caught) ||
        !sessionGuardRef.current.isCurrent(operation.generation)
      )
        return
      setOnlineError(caught instanceof Error ? caught.message : 'The room could not be joined.')
    } finally {
      clearTimeout(slowTimer)
      if (slowTimerRef.current === slowTimer) slowTimerRef.current = null
      if (sessionGuardRef.current.isCurrent(operation.generation)) {
        startupAbortRef.current = null
        userOperationBusyRef.current = false
        setOnlineBusy(false)
        setOnlineSlow(false)
      }
    }
  }
  const leaveOnline = (destination: 'online' | 'menu' = 'online') => {
    sessionGuardRef.current.invalidate()
    startupAbortRef.current?.abort()
    startupAbortRef.current = null
    userOperationBusyRef.current = false
    const session = activeSessionRef.current ?? onlineSession
    activeSessionRef.current = null
    setScreen(destination)
    setMatchMode('local')
    setEditorTestActive(false)
    setPaused(false)
    setResult(null)
    setError(null)
    setOnlineError(null)
    setOnlineBusy(false)
    setOnlineSlow(false)
    if (slowTimerRef.current) clearTimeout(slowTimerRef.current)
    slowTimerRef.current = null
    setConnectionStatus('connected')
    setConnectionQuality('unknown')
    setLatencyMs(null)
    setRoomView(null)
    setRoomCodeInput('')
    setOnlineSession(null)
    if (session) void session.leave().catch(() => undefined)
  }
  const chooseMap = (mapId: MapId) => setConfig(validateMatchConfig({ ...config, mapId }, accountLevel))
  const chooseProjectileBoundaryMode = (projectileBoundaryMode: ProjectileBoundaryMode) =>
    setConfig(validateMatchConfig({ ...config, projectileBoundaryMode }, accountLevel))
  const chooseGameMode = (mode: GameMode) => {
    const playerNames = preferences.playerNames.map(
      (name, index) => config.playerNames[index] ?? name,
    )
    const playerAppearances = preferences.playerAppearances.map(
      (appearance, index) => config.playerAppearances[index] ?? appearance,
    )
    setPreferences({ ...preferences, playerNames, playerAppearances })
    setConfig(
      validateMatchConfig({
        ...config,
        mode,
        mapId: defaultMapForMode(mode).id,
        playerNames,
        playerAppearances,
      }, accountLevel),
    )
  }
  const updatePlayerName = (index: number, name: string) => {
    const playerNames = [...config.playerNames]
    playerNames[index] = name
    setConfig({ ...config, playerNames })
  }
  const openCustomize = (
    returnScreen: 'menu' | 'setup' | 'online-create' | 'online-join' | 'profile',
    slot = 0,
  ) => {
    setCustomizeReturnScreen(returnScreen)
    setCustomizeSlot(slot)
    setScreen('customize')
  }
  const onlineRematchUnavailableReason =
    roomView?.result.reason === 'forfeit' ||
    (roomView && roomView.players.length < roomView.capacity)
      ? 'Rematch unavailable because a player left the room.'
      : roomView?.players.some((player) => !player.connected)
        ? 'Waiting for every player to reconnect before rematch voting.'
        : null
  const content = () => {
    if (screen === 'menu')
      return (
        <section className="menu-stage">
          <div className="menu-copy">
            <p className="eyebrow">A TINY BATTLE WITH BIG BOOMS</p>
            <h2>
              Take the hill.
              <br />
              Make a crater.
            </h2>
            <p className="menu-blurb">
              A couch-sized artillery duel where every shot reshapes the table.
            </p>
            <div className="menu-stack" role="menu">
              <button className="button-primary button-play" autoFocus onClick={openSetup}>
                Play Local <span>›</span>
              </button>
              <button
                className="button-quiet button-play button-online"
                onClick={() => {
                  setOnlineError(null)
                  setScreen('online')
                }}
              >
                Play Online <span>›</span>
              </button>
              <button
                className="button-quiet button-play button-editor"
                onClick={() => {
                  setEditorTestActive(false)
                  setEditorTestDocument(null)
                  setScreen('editor')
                }}
              >
                Build a Map <span>›</span>
              </button>
              <button className="button-quiet button-play button-customize" onClick={() => openCustomize('menu')}>
                Customize Players <span>›</span>
              </button>
              <button className="button-quiet button-play" onClick={() => { setWorkshopReturnScreen('menu'); setScreen('workshop') }}>
                Cosmetic Workshop <span>›</span>
              </button>
              <div className="menu-links">
                <button className="button-quiet" onClick={() => setScreen('how-to')}>
                  How to Play
                </button>
                <button className="button-quiet" onClick={() => setScreen('settings')}>
                  Settings
                </button>
                <button className="button-quiet" onClick={() => setScreen('credits')}>
                  Credits
                </button>
              </div>
            </div>
          </div>
          <HeroDiorama />
        </section>
      )
    if (screen === 'editor')
      return (
        <MapEditor
          initialDocument={editorTestDocument}
          onBack={() => {
            setEditorTestActive(false)
            setEditorTestDocument(null)
            setScreen('menu')
          }}
          onTestPlay={testEditorMap}
        />
      )
    if (screen === 'customize')
      return (
        <CustomizePlayer
          appearances={preferences.playerAppearances}
          presets={preferences.outfitPresets}
          selectedSlot={customizeSlot}
          onSelectSlot={setCustomizeSlot}
          cosmeticLoadout={entitlementAwareLoadout(preferences.cosmeticLoadout, progression?.entitlements ?? [])}
          arsenal={preferences.arsenal.presetId === 'chaos' ? cloneArsenalRules(ARSENAL_PRESETS.standard) : preferences.arsenal}
          level={accountLevel}
          entitlements={progression?.entitlements ?? []}
          onSave={({ appearances, presets, cosmeticLoadout, arsenal }) => {
            const effectiveArsenal = sanitizeArsenalRules(arsenal, accountLevel)
            setPreferences((current) => ({ ...current, playerAppearances: appearances, outfitPresets: presets, cosmeticLoadout, arsenal: effectiveArsenal }))
            setConfig((current) => ({ ...current, arsenal: effectiveArsenal, playerAppearances: current.playerAppearances.map((appearance, index) => appearances[index] ?? appearance) }))
            setScreen(customizeReturnScreen)
          }}
          onOpenWorkshop={() => { setWorkshopReturnScreen('customize'); setScreen('workshop') }}
          onBack={() => setScreen(customizeReturnScreen)}
        />
      )
    if (screen === 'workshop')
      return (
        <CosmeticWorkshop
          appearance={preferences.playerAppearances[0]}
          loadout={entitlementAwareLoadout(preferences.cosmeticLoadout, progression?.entitlements ?? [])}
          progression={progression}
          signedIn={auth.signedIn}
          onEquip={(cosmeticLoadout) => setPreferences((current) => ({ ...current, cosmeticLoadout }))}
          onEquipAppearance={(appearance) => setPreferences((current) => ({ ...current, playerAppearances: current.playerAppearances.map((item, index) => index === 0 ? appearance : item) }))}
          onPurchase={async (cosmeticId, cosmeticLoadout, appearance) => {
            const nextProgression = await purchaseCosmetic(auth.getToken, cosmeticId)
            setProgression(nextProgression)
            setPreferences((current) => ({
              ...current,
              cosmeticLoadout: cosmeticLoadout ?? current.cosmeticLoadout,
              playerAppearances: appearance ? current.playerAppearances.map((item, index) => index === 0 ? appearance : item) : current.playerAppearances,
            }))
          }}
          onBack={() => setScreen(workshopReturnScreen)}
        />
      )
    if (screen === 'online')
      return (
        <section className="panel online-panel">
          <p className="eyebrow">PRIVATE 1V1, 2V2, AND 3V3 ROOMS</p>
          <h2>Meet across the table</h2>
          <p>Create a six-character invite with an account, or join a friend as a guest.</p>
          <div className="online-choice-grid">
            <button
              className="online-choice create-choice"
              onClick={() => {
                setOnlineError(null)
                if (!auth.signedIn) {
                  auth.openSignIn()
                  return
                }
                setConfig(
                   validateMatchConfig({
                    mode: preferences.lastMode,
                    playerNames: preferences.playerNames,
                    playerAppearances: preferences.playerAppearances,
                    mapId:
                      getMap(preferences.lastMapId).mode === preferences.lastMode
                        ? preferences.lastMapId
                        : defaultMapForMode(preferences.lastMode).id,
                    turnDurationSeconds: preferences.turnDurationSeconds,
                    projectileBoundaryMode: preferences.projectileBoundaryMode,
                    arsenal: preferences.arsenal,
                   }, accountLevel),
                )
                setScreen('online-create')
              }}
            >
              <strong>Create Private Room</strong>
              <span>Choose the map and clock, then share the code.</span>
            </button>
            <button
              className="online-choice join-choice"
              onClick={() => {
                setOnlineError(null)
                setConfig(validateMatchConfig({
                  mode: '1v1',
                  playerNames: preferences.playerNames.map((name, index) =>
                    index === 0 ? name : name || `Player ${index + 1}`,
                  ),
                  playerAppearances: preferences.playerAppearances,
                  mapId:
                    getMap(preferences.lastMapId).mode === '1v1'
                      ? preferences.lastMapId
                      : defaultMapForMode('1v1').id,
                  turnDurationSeconds: preferences.turnDurationSeconds,
                  projectileBoundaryMode: preferences.projectileBoundaryMode,
                  arsenal: preferences.arsenal,
                }, accountLevel))
                setScreen('online-join')
              }}
            >
              <strong>Join Private Room</strong>
              <span>Enter the code from the room creator.</span>
            </button>
          </div>
          <button className="button-quiet" onClick={() => setScreen('menu')}>
            Back
          </button>
        </section>
      )
    if (screen === 'online-create')
      return (
        <section className="battle-setup online-setup">
          <header className="screen-heading">
            <p className="eyebrow">CREATE PRIVATE ROOM</p>
            <h2>Pack the invite</h2>
            <p>Your server owns the match. You only choose where and how long each turn lasts.</p>
          </header>
          <div className="mode-picker" aria-label="Online match mode">
            {(['1v1', '2v2', '3v3'] as const).map((mode) => (
              <button
                key={mode}
                className={config.mode === mode ? 'selected' : ''}
                onClick={() => chooseGameMode(mode)}
              >
                <strong>{mode}</strong>
                <span>
                  {mode === '1v1'
                    ? 'Two-player room'
                    : mode === '2v2'
                      ? 'Four-player teams'
                      : 'Six-player teams'}
                </span>
              </button>
            ))}
          </div>
          <div className="online-form-row">
            <button
              type="button"
              className="identity-editor"
              onClick={() => openCustomize('online-create')}
            >
              <PlayerAvatar appearance={config.playerAppearances[0]} label="" />
              <span>Customize your player</span>
            </button>
            <label>
              <span>Your player name</span>
              <input
                maxLength={18}
                value={config.playerNames[0]}
                onChange={(event) => updatePlayerName(0, event.target.value)}
              />
            </label>
            <label>
              <span>Turn clock</span>
              <select
                value={config.turnDurationSeconds}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    turnDurationSeconds: Number(event.target.value) as TurnDuration,
                  })
                }
              >
                <option value={20}>20 seconds</option>
                <option value={30}>30 seconds</option>
                <option value={45}>45 seconds</option>
              </select>
            </label>
          </div>
          <div className="map-cards online-map-cards">
            {mapIdsForMode(config.mode).map((id) => (
              <button
                key={id}
                className={`map-card ${config.mapId === id ? 'selected' : ''}`}
                onClick={() => chooseMap(id)}
              >
                <MapPreview mapId={id} />
                <strong>{MAPS[id].displayName}</strong>
                <em>{MAPS[id].label}</em>
                <span>{MAPS[id].description}</span>
                <MapMechanicLegend mapId={id} />
              </button>
            ))}
          </div>
          <div className="boundary-rule-control">
            <p className="eyebrow">SIDE BOUNDARIES</p>
            <h3>Choose a projectile rule</h3>
            <ProjectileBoundaryPicker
              config={config}
              onChange={chooseProjectileBoundaryMode}
            />
          </div>
          <ArsenalRulesPanel
            rules={config.arsenal}
            level={accountLevel}
            onChange={(arsenal) => setConfig({ ...config, arsenal })}
          />
          {onlineError && <ConnectionTroubleshooting message={onlineError} />}
          {onlineSlow && (
            <p className="online-wake-message">
              Waking the game server. This can take up to a minute on the free host.
            </p>
          )}
          <div className="actions setup-actions">
            <button
              className="button-primary button-play"
              disabled={onlineBusy || !auth.signedIn}
              onClick={createOnlineRoom}
            >
              {onlineBusy ? 'Connecting...' : 'Create Room'} <span>›</span>
            </button>
            <button
              className="button-quiet"
              onClick={() => (onlineBusy ? leaveOnline('online') : setScreen('online'))}
            >
              {onlineBusy ? 'Cancel' : 'Back'}
            </button>
          </div>
        </section>
      )
    if (screen === 'online-join')
      return (
        <section className="panel join-room-panel">
          <p className="eyebrow">JOIN PRIVATE ROOM</p>
          <h2>Unpack the code</h2>
          <p>Spaces and letter case do not matter.</p>
          <div className="join-room-form">
            <button
              type="button"
              className="identity-editor"
              onClick={() => openCustomize('online-join')}
            >
              <PlayerAvatar appearance={config.playerAppearances[0]} label="" />
              <span>Customize your player</span>
            </button>
            <label>
              <span>Room code</span>
              <input
                className="room-code-input"
                maxLength={10}
                autoCapitalize="characters"
                autoComplete="off"
                autoFocus
                placeholder="ABC234"
                value={roomCodeInput}
                onChange={(event) => setRoomCodeInput(normalizeRoomCode(event.target.value))}
              />
            </label>
            <label>
              <span>Your player name</span>
              <input
                maxLength={18}
                value={config.playerNames[0]}
                onChange={(event) =>
                  updatePlayerName(0, event.target.value)
                }
              />
            </label>
          </div>
          {onlineError && <ConnectionTroubleshooting message={onlineError} />}
          {onlineSlow && (
            <p className="online-wake-message">
              Waking the game server. This can take up to a minute on the free host.
            </p>
          )}
          <div className="actions">
            <button disabled={onlineBusy} onClick={joinOnlineRoom}>
              {onlineBusy ? 'Joining...' : 'Join Room'}
            </button>
            <button
              className="secondary"
              onClick={() => (onlineBusy ? leaveOnline('online') : setScreen('online'))}
            >
              {onlineBusy ? 'Cancel' : 'Back'}
            </button>
          </div>
        </section>
      )
    if (screen === 'online-lobby' && roomView && onlineSession) {
      const localPlayer = roomView.players.find(
        (player) => player.sessionId === onlineSession.room.sessionId,
      )
      return (
        <section className="panel room-lobby">
          <div className="lobby-heading">
            <div>
              <p className="eyebrow">PRIVATE ROOM</p>
              <h2>Ready the toybox</h2>
            </div>
            <div className="room-code-card">
              <span>Room code</span>
              <strong data-room-code>{roomView.roomCode}</strong>
              <button
                className="button-quiet"
                onClick={() => void navigator.clipboard?.writeText(roomView.roomCode)}
              >
                Copy code
              </button>
            </div>
          </div>
          <div className="lobby-status-line">
            <span className={`status-dot ${connectionStatus}`} />
            {connectionStatus === 'connected'
              ? connectionQuality === 'poor'
                ? 'Connected · high latency'
                : 'Connected to server'
              : connectionStatus === 'failed'
                ? 'Connection lost'
                : 'Reconnecting...'}
            <span>Compatible protocol {roomView.protocolVersion}</span>
          </div>
          <div className="lobby-seats">
            {Array.from({ length: roomView.capacity }, (_, seat) => seat).map((seat) => {
              const player = roomView.players.find((candidate) => candidate.seat === seat)
              const teamId = player?.teamId ?? seat % 2
              const teamSlot = player?.teamSlot ?? Math.floor(seat / 2)
              return (
                <article
                  className={`lobby-seat seat-${seat + 1} team-${teamId}`}
                  key={seat}
                >
                  {player ? (
                    <PlayerAvatar
                      appearance={player.appearance}
                      teamId={teamId}
                      label={`${player.name}'s appearance`}
                    />
                  ) : <span className="empty-avatar" aria-hidden="true">?</span>}
                  <div>
                    <span>
                      {seat === 0 ? 'Host · ' : ''}Team {teamId === 0 ? 'Comet' : 'Ember'} ·
                      Player {teamSlot + 1}
                    </span>
                    <strong>{player?.name ?? 'Waiting for player...'}</strong>
                    <em>
                      {!player
                        ? 'Open seat'
                        : !player.connected
                          ? 'Reconnecting'
                          : player.ready
                            ? 'Ready'
                            : 'Not ready'}
                    </em>
                  </div>
                </article>
              )
            })}
          </div>
          <div className="lobby-rules">
            <div>
              <span>Mode</span>
              <strong>{roomView.mode}</strong>
            </div>
            <div>
              <span>Battlefield</span>
              <strong>{getMap(roomView.mapId).displayName}</strong>
            </div>
            <div>
              <span>Turn clock</span>
              <strong>{roomView.turnDurationSeconds} seconds</strong>
            </div>
            <div>
              <span>Side boundaries</span>
              <strong>{projectileBoundaryLabel(roomView.projectileBoundaryMode)}</strong>
            </div>
            <div>
              <span>Start rule</span>
              <strong>All {roomView.capacity} players ready</strong>
            </div>
          </div>
          <p className="lobby-note">
            {roomView.players.length < roomView.capacity
              ? `Share the code. ${roomView.capacity - roomView.players.length} open ${roomView.capacity - roomView.players.length === 1 ? 'seat remains' : 'seats remain'}.`
              : `The server starts a short countdown as soon as all ${roomView.capacity} players are ready.`}
          </p>
          {connectionStatus === 'failed' && onlineError && (
            <ConnectionTroubleshooting message={onlineError} />
          )}
          <div className="actions lobby-actions">
            <button
              className="button-primary"
              disabled={!localPlayer?.connected}
              onClick={() => onlineSession.setReady(!localPlayer?.ready)}
            >
              {localPlayer?.ready ? 'Cancel Ready' : 'Ready Up'}
            </button>
            <button className="secondary" onClick={() => void leaveOnline('online')}>
              Leave Room
            </button>
          </div>
        </section>
      )
    }
    if (screen === 'online-lobby')
      return (
        <section className="panel room-lobby loading-lobby">
          <p className="eyebrow">PRIVATE ROOM</p>
          <h2>Connecting...</h2>
          <p>Opening the room and checking game compatibility.</p>
          <button className="button-quiet" onClick={() => void leaveOnline('online')}>
            Cancel
          </button>
        </section>
      )
    if (screen === 'setup')
      return (
        <section className="battle-setup">
          <header className="screen-heading">
            <p className="eyebrow">LOCAL SKIRMISH</p>
            <h2>Set the tabletop</h2>
            <p>Choose your contenders, then pick a place worth wrecking.</p>
          </header>
          <div className="setup-layout">
            <div className="setup-column setup-contenders-column">
          <div className="mode-picker" aria-label="Local match mode">
            {(['1v1', '2v2', '3v3'] as const).map((mode) => (
              <button
                key={mode}
                className={config.mode === mode ? 'selected' : ''}
                onClick={() => chooseGameMode(mode)}
              >
                <strong>{mode}</strong>
                <span>
                  {mode === '1v1'
                    ? 'Classic duel'
                    : mode === '2v2'
                      ? 'Four-player teams'
                      : 'Six-player teams'}
                </span>
              </button>
            ))}
          </div>
          <div className="team-roster-grid">
            {[0, 1].map((teamId) => (
              <section key={teamId} className={`team-roster team-${teamId}`}>
                <header>
                  <span>Team {teamId === 0 ? 'Comet' : 'Ember'}</span>
                  <strong>{teamId === 0 ? '◆' : '●'}</strong>
                </header>
                {config.playerNames.map((name, index) =>
                  index % 2 === teamId ? (
                    <div className="contender" key={index}>
                      <button
                        type="button"
                        className="contender-avatar-button"
                        aria-label={`Customize player ${index + 1}`}
                        onClick={() => openCustomize('setup', index)}
                      >
                        <PlayerAvatar appearance={config.playerAppearances[index]} label="" />
                      </button>
                      <label>
                        <span>Player {Math.floor(index / 2) + 1}</span>
                        <input
                          maxLength={18}
                          value={name}
                          onChange={(event) => updatePlayerName(index, event.target.value)}
                        />
                      </label>
                    </div>
                  ) : null,
                )}
              </section>
            ))}
          </div>
          <button className="button-quiet setup-customize-all" onClick={() => openCustomize('setup')}>
            Customize all players
          </button>
          <div className="setup-controls">
            <label>
              <span>Turn clock</span>
              <select
                value={config.turnDurationSeconds}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    turnDurationSeconds: Number(event.target.value) as TurnDuration,
                  })
                }
              >
                <option value={20}>20 seconds</option>
                <option value={30}>30 seconds</option>
                <option value={45}>45 seconds</option>
              </select>
            </label>
            <span className="setup-tip">
              {config.playerNames.length} players share the keyboard and mouse. Turns alternate
              between Team Comet and Team Ember. Friendly fire is on and ammunition belongs to
              each player.
            </span>
          </div>
            </div>
            <div className="setup-column setup-rules-column">
          <div className="battlefield-picker">
            <div className="picker-heading">
              <div>
                <p className="eyebrow">BATTLEFIELD</p>
                <h3>Choose an arena</h3>
              </div>
              <button
                className="button-quiet"
                onClick={() => {
                  const maps = mapIdsForMode(config.mode)
                  chooseMap(maps[Math.floor(Math.random() * maps.length)])
                }}
              >
                Random map
              </button>
            </div>
            <div className="map-cards">
              {mapIdsForMode(config.mode).map((id) => (
                <button
                  key={id}
                  className={`map-card ${config.mapId === id ? 'selected' : ''}`}
                  onClick={() => chooseMap(id)}
                >
                  <MapPreview mapId={id} />
                  <strong>{MAPS[id].displayName}</strong>
                  <em>{MAPS[id].label}</em>
                  <span>{MAPS[id].description}</span>
                  <MapMechanicLegend mapId={id} />
                </button>
              ))}
            </div>
          </div>
          <div className="boundary-rule-control">
            <p className="eyebrow">SIDE BOUNDARIES</p>
            <h3>Choose a projectile rule</h3>
            <ProjectileBoundaryPicker
              config={config}
              onChange={chooseProjectileBoundaryMode}
            />
          </div>
          <ArsenalRulesPanel
            rules={config.arsenal}
            level={accountLevel}
            onChange={(arsenal) => setConfig({ ...config, arsenal })}
          />
            </div>
          </div>
          <div className="actions setup-actions">
            <div className="setup-launch-summary">
              <span>Ready to play</span>
              <strong>
                {config.playerNames.length} players · {MAPS[config.mapId].displayName} ·{' '}
                {config.turnDurationSeconds}s turns
              </strong>
            </div>
            <button className="button-primary button-play" onClick={start}>
              Start Skirmish <span>›</span>
            </button>
            <button className="button-quiet" onClick={() => setScreen('menu')}>
              Back
            </button>
          </div>
        </section>
      )
    if (screen === 'how-to')
      return (
        <section className="panel tutorial-panel">
          <p className="eyebrow">SIX TINY STEPS</p>
          <h2>Make your move</h2>
          <Help />
          <button className="button-quiet" onClick={() => setScreen('menu')}>
            Back
          </button>
        </section>
      )
    if (screen === 'settings')
      return (
        <section className="panel settings-panel">
          <p className="eyebrow">MAKE IT YOUR TABLE</p>
          <h2>Play your way</h2>
          <Settings preferences={preferences} onChange={updatePreferences} />
          <button className="button-quiet" onClick={() => setScreen('menu')}>
            Back
          </button>
        </section>
      )
    if (screen === 'profile')
      return (
        <section className="panel profile-panel">
          <p className="eyebrow">YOUR TOYBOX</p>
          <h2>Profile</h2>
          <div className="profile-identity">
            <AccountAvatar />
            <div>
              <span className="profile-field-label">Signed-in account</span>
              <strong>{auth.user?.displayName ?? 'Player'}</strong>
              {auth.user?.email && <p>{auth.user.email}</p>}
            </div>
          </div>
          {cloudAccountAvailable === false && (
            <p className="account-service-notice" role="status">
              Online saves are temporarily unavailable. You can keep playing; changes will stay on this device until they reconnect.
            </p>
          )}
          {progressionLoading && <p className="account-sync-state">Loading progression...</p>}
          {progression && (
            <section className="profile-progression">
              <header><div><span className="profile-field-label">Online progression</span><strong>Level {progression.summary.level}</strong></div><b>{progression.summary.currencyBalance} Scrap</b></header>
              <div className="progression-meter" aria-label={`${progression.summary.levelExperience} of ${progression.summary.nextLevelExperience} experience`}><span style={{ width: `${(progression.summary.levelExperience / progression.summary.nextLevelExperience) * 100}%` }} /></div>
              <small>{progression.summary.levelExperience} / {progression.summary.nextLevelExperience} XP</small>
              <div className="progression-stats"><span><b>{progression.summary.matchesPlayed}</b> Matches</span><span><b>{progression.summary.wins}</b> Wins</span><span><b>{progression.summary.losses}</b> Losses</span><span><b>{progression.summary.draws}</b> Draws</span></div>
              <h3>Progression goals</h3>
              <div className="progression-goals">{progression.goals.map((goal) => <article className={goal.completed ? 'completed' : ''} key={goal.id}><header><strong>{goal.title}</strong><span>{goal.completed ? 'Complete' : `${goal.progress}/${goal.target}`}</span></header><p>{goal.description}</p><div className="progression-meter"><span style={{ width: `${(goal.progress / goal.target) * 100}%` }} /></div><small>{goal.reward.cosmeticId ? `Unlocks ${goal.reward.cosmeticId.split(':')[1].replaceAll('-', ' ')}` : `+${goal.reward.experience} XP · +${goal.reward.currency} Scrap`}</small></article>)}</div>
              <h3>Recent skirmishes</h3>
              {progression.recentMatches.length ? <div className="recent-match-list">{progression.recentMatches.map((match) => <div className={`recent-match-row ${match.outcome}`} key={match.id}><strong>{match.outcome}</strong><span>{getMap(match.mapId).displayName} · {match.mode}</span><small>+{match.experienceEarned} XP · +{match.currencyEarned} Scrap</small></div>)}</div> : <p>No signed-in online matches yet.</p>}
            </section>
          )}
          <div className="profile-game-fields">
            <label>
              <span>Primary player name</span>
               <small>Shown to other players during matches.</small>
              <input maxLength={18} value={preferences.playerNames[0]} onChange={(event) => setPreferences((current) => ({ ...current, playerNames: current.playerNames.map((name, index) => index === 0 ? event.target.value : name) }))} />
            </label>
            <div className="profile-appearance">
              <PlayerAvatar appearance={preferences.playerAppearances[0]} label="Preferred player appearance" />
              <div><span className="profile-field-label">Preferred appearance</span><small>Used for your primary player.</small></div>
              <button type="button" onClick={() => openCustomize('profile')}>Customize</button>
            </div>
          </div>
          <p className={`account-sync-state ${accountSync.error ? 'has-error' : ''}`}>
            {accountSync.state === 'loading' ? 'Loading cloud data...'
              : accountSync.state === 'syncing' ? 'Saving to cloud...'
                : accountSync.pending ? 'Changes pending. Saving to cloud shortly...'
                  : accountSync.state === 'synced' ? 'Cloud is up to date.'
                  : accountSync.state === 'decision' ? 'Choose how to set up this profile.'
                    : accountSync.state === 'offline' ? 'Offline. Changes remain on this device until sync can retry.'
                      : 'Playing with local data.'}
            {accountSync.lastSyncedAt && <small>Last synced {new Date(accountSync.lastSyncedAt).toLocaleString()}</small>}
          </p>
          {accountSync.error && <p className="form-error">{accountSync.error}</p>}
          {accountSync.state === 'offline' && <button className="button-quiet account-retry" onClick={accountSync.retry}>Retry cloud sync</button>}
          {accountSync.state === 'decision' && (
            <div className="profile-import-choice">
              <strong>Choose which toybox wins</strong>
              <p>This choice replaces the other version of your primary player, preferences, and outfit presets.</p>
               <button className="button-primary" onClick={() => accountSync.chooseInitial(true)}>Upload this device to cloud</button>
               <button className="button-quiet" onClick={() => accountSync.chooseInitial(false)}>Replace this device with cloud</button>
            </div>
          )}
          {accountActionError && <p className="form-error">{accountActionError}</p>}
          <div className="profile-actions">
            <button className="button-quiet" disabled={accountActionBusy} onClick={() => {
              setAccountActionBusy(true); setAccountActionError(null)
              void accountSync.signOut().catch((caught) => setAccountActionError(caught instanceof Error ? caught.message : 'Could not sign out. Please try again.')).finally(() => setAccountActionBusy(false))
            }}>{accountActionBusy && !confirmAccountDeletion ? 'Signing out...' : 'Sign out'}</button>
            {!confirmAccountDeletion ? (
              <button className="button-quiet danger" disabled={accountActionBusy} onClick={() => { setAccountDeletionText(''); setAccountActionError(null); setConfirmAccountDeletion(true) }}>Delete account</button>
            ) : (
              <div className="account-delete-confirm">
                <strong>Delete account permanently?</strong>
                 <p>This permanently deletes your account and all saved online data, including progression, preferences, and presets. Local guest data on this device remains.</p>
                <label><span>Type DELETE to confirm</span><input autoFocus value={accountDeletionText} onChange={(event) => setAccountDeletionText(event.target.value)} autoComplete="off" /></label>
                 <button className="button-primary danger" disabled={accountActionBusy || accountDeletionText !== 'DELETE'} onClick={() => {
                  setAccountActionBusy(true)
                  setAccountActionError(null)
                  void accountSync.deleteData().catch((caught) => setAccountActionError(caught instanceof Error ? caught.message : 'Account could not be deleted.')).finally(() => setAccountActionBusy(false))
                }}>{accountActionBusy ? 'Deleting account...' : 'Delete account permanently'}</button>
                 <button className="button-quiet" disabled={accountActionBusy} onClick={() => setConfirmAccountDeletion(false)}>Cancel</button>
              </div>
            )}
          </div>
          <button className="button-quiet" onClick={() => setScreen('menu')}>Back</button>
        </section>
      )
    if (screen === 'credits')
      return (
        <section className="panel credits-panel">
          <p className="eyebrow">THE TOYBOX LABEL</p>
          <h2>Made for the table</h2>
          <div className="credits-toys"><PlayerAvatar appearance={preferences.playerAppearances[0]} pose="victory" label="Your player in the credits" /></div>
          <div className="credits-copy">
            <section><span>Game</span><h3>{BRAND.title}</h3><p>A turn-based artillery game about tiny customizable fighters, destructible battlefields, and carefully aimed chaos.</p></section>
            <section><span>Built for</span><h3>Friends at one table or online</h3><p>Play local skirmishes, create private online rooms, build maps, unlock weapons, and spend earned Scrap on your toybox.</p></section>
            <section><span>Technology</span><h3>React · TypeScript · Phaser</h3><p>Created with React, Vite, TypeScript, Phaser, and a lot of hand-built SVG game art.</p></section>
          </div>
          <p>{BRAND.footer}</p>
          <p className="credits-disclaimer">This original artillery project is not affiliated with any other artillery-game franchise.</p>
          <button className="button-quiet" onClick={() => setScreen('menu')}>
            Back
          </button>
        </section>
      )
    return null
  }
  return (
    <main
      className={`app-shell ${screen === 'menu' ? 'menu-active' : ''} ${screen === 'match' ? 'match-active' : ''} ${screen === 'editor' ? 'editor-active' : ''} ${preferences.reducedMotion ? 'reduced-motion' : ''} ${preferences.highContrastHud ? 'high-contrast' : ''}`}
      onPointerDownCapture={() => void audioRef.current?.unlock()}
      onKeyDownCapture={() => void audioRef.current?.unlock()}
      onClickCapture={(event) => {
        if ((event.target as HTMLElement).closest('button, select'))
          audioRef.current?.play('menu-select')
      }}
    >
      <header className="brand">
        <p className="eyebrow">TURN-BASED ARTILLERY</p>
        <h1>{BRAND.title}</h1>
        <div className="brand-meta">
          <p>{BRAND.subtitle}</p>
          {auth.configured && !auth.loaded && <span className="account-loading" role="status">Loading account...</span>}
          {auth.configured && auth.loaded && (
            <div className="account-controls">
              {auth.signedIn ? <><AccountAvatar /><button className="account-button" onClick={() => setScreen('profile')}>Profile</button></>
                : <><button className="account-button" onClick={auth.openSignIn}>Sign in</button><button className="account-button account-button-primary" onClick={auth.openSignUp}>Create account</button></>}
            </div>
          )}
          {auth.configured && auth.loaded && cloudAccountAvailable === false && <p className="account-header-notice">Cloud saves unavailable; sign-in still works.</p>}
        </div>
      </header>
      {screen === 'match' ? (
        <div className="online-game-stage">
          <div className="game-frame" ref={hostRef} />
          {matchMode === 'online' && roomView && (
            <output
              className="online-match-status"
              data-room-code={roomView.roomCode}
              data-server-tick={roomView.simulationTick}
              data-match-generation={roomView.matchGeneration}
              data-active-seat={roomView.activePlayerSeat}
              data-wind={roomView.wind}
              data-event-sequence={roomView.eventSequence}
              data-terrain-sequence={roomView.terrainSequence}
              data-projectile-count={roomView.projectileCount}
              data-player-zero-x={roomView.players.find((player) => player.seat === 0)?.x ?? 0}
              data-player-zero-y={roomView.players.find((player) => player.seat === 0)?.y ?? 0}
              data-player-one-x={roomView.players.find((player) => player.seat === 1)?.x ?? 0}
              data-player-one-y={roomView.players.find((player) => player.seat === 1)?.y ?? 0}
              data-player-two-x={roomView.players.find((player) => player.seat === 2)?.x ?? 0}
              data-player-two-y={roomView.players.find((player) => player.seat === 2)?.y ?? 0}
              data-player-three-x={roomView.players.find((player) => player.seat === 3)?.x ?? 0}
              data-player-three-y={roomView.players.find((player) => player.seat === 3)?.y ?? 0}
              data-player-four-x={roomView.players.find((player) => player.seat === 4)?.x ?? 0}
              data-player-four-y={roomView.players.find((player) => player.seat === 4)?.y ?? 0}
              data-player-five-x={roomView.players.find((player) => player.seat === 5)?.x ?? 0}
              data-player-five-y={roomView.players.find((player) => player.seat === 5)?.y ?? 0}
              data-connection-quality={connectionQuality}
              data-latency-ms={latencyMs ?? ''}
              data-projectile-boundary-mode={roomView.projectileBoundaryMode}
            >
              <span className={`status-dot ${connectionStatus}`} />
              {connectionStatus === 'failed'
                ? 'Connection lost'
                : connectionStatus === 'reconnecting'
                  ? 'Reconnecting'
                  : roomView.phase === 'reconnecting'
                    ? 'Player reconnecting'
                    : connectionQuality === 'poor'
                      ? 'High latency'
                      : connectionQuality === 'fair'
                        ? 'Connected · fair'
                        : 'Connected'}
              <span> · {projectileBoundaryLabel(roomView.projectileBoundaryMode)} boundaries</span>
            </output>
          )}
        </div>
      ) : (
        content()
      )}
      <footer>v{BRAND.version}</footer>
      {error && (
        <div className="modal">
          <section className="panel">
            <h2>Unable to start</h2>
            <p>{error}</p>
            <button
              onClick={() => (matchMode === 'online' ? void leaveOnline('menu') : leaveMatch())}
            >
              {editorTestActive ? 'Return to editor' : 'Return to menu'}
            </button>
          </section>
        </div>
      )}
      {paused && (
        <div className="modal">
          <section className="panel pause-panel">
            <p className="eyebrow">THE TOYS ARE HOLDING STILL</p>
            <h2>Take five</h2>
            {pausePanel === 'main' && (
              <div className="menu-stack">
                <button autoFocus onClick={() => setPaused(false)}>
                  Resume
                </button>
                {matchMode === 'local' && (
                  <button onClick={() => setPausePanel('confirm-restart')}>Restart Match</button>
                )}
                <button onClick={() => setPausePanel('how-to')}>How to Play</button>
                <button onClick={() => setPausePanel('settings')}>Settings</button>
                <button className="return-menu-button" onClick={() => setPausePanel('confirm-menu')}>
                  {editorTestActive ? 'Return to Map Editor' : 'Return to Main Menu'}
                </button>
              </div>
            )}
            {pausePanel === 'how-to' && (
              <>
                <Help />
                <button onClick={() => setPausePanel('main')}>Back</button>
              </>
            )}
            {pausePanel === 'settings' && (
              <>
                <Settings preferences={preferences} onChange={updatePreferences} />
                <button onClick={() => setPausePanel('main')}>Back</button>
              </>
            )}
            {pausePanel === 'confirm-restart' && (
              <>
                <p>Restart this match? Current progress will be lost.</p>
                <div className="actions pause-confirm-actions">
                  <button
                    onClick={() => {
                      gameRef.current?.restart()
                      setPaused(false)
                    }}
                  >
                    Restart
                  </button>
                  <button className="secondary" onClick={() => setPausePanel('main')}>
                    Cancel
                  </button>
                </div>
              </>
            )}
            {pausePanel === 'confirm-menu' && (
              <>
                <p>
                  {editorTestActive
                    ? 'Return to the map editor and discard this test match?'
                    : 'Return to the main menu and discard this match?'}
                </p>
                <div className="actions pause-confirm-actions">
                  <button
                    onClick={() =>
                      matchMode === 'online' ? void leaveOnline('menu') : leaveMatch()
                    }
                  >
                    {editorTestActive ? 'Return to editor' : 'Return to menu'}
                  </button>
                  <button className="secondary" onClick={() => setPausePanel('main')}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
      {result && (
        <div className="modal">
          <section className="panel results">
            <p className="eyebrow">MATCH COMPLETE</p>
            {result.winnerPlayerIndices.length > 0 && (
              <div className="winning-team">
                {result.winnerPlayerIndices.map((index) => (
                  <PlayerAvatar
                    key={index}
                    appearance={result.config.playerAppearances[index]}
                    pose="victory"
                    teamId={index % 2}
                    label={result.config.playerNames[index]}
                  />
                ))}
              </div>
            )}
            <h2>
              {result.config.mode !== '1v1'
                ? result.winnerTeamId === null
                  ? 'Draw'
                  : `Team ${result.winnerTeamId === 0 ? 'Comet' : 'Ember'} wins`
                : result.winnerIndex === null
                  ? 'Draw'
                  : `${result.config.playerNames[result.winnerIndex]} wins`}
            </h2>
            <p>
              {getMap(result.config.mapId).displayName} · {projectileBoundaryLabel(result.config.projectileBoundaryMode)} boundaries · {result.remainingHealth} health remaining
              · {result.turnsTaken} turns · {result.durationSeconds}s
            </p>
            <section className="match-recap"><h3>Match recap</h3><div className="match-recap-grid">{result.playerRecaps.map((recap, index) => <article key={recap.playerId}><PlayerAvatar appearance={result.config.playerAppearances[index]} compact label="" /><strong>{result.config.playerNames[index]}</strong><span><b>{recap.damageDealt}</b> damage</span><span><b>{recap.shots}</b> actions</span><span><b>{recap.terrainDestroyed.toLocaleString()}</b> terrain</span><small>{recap.favoriteWeaponId ? `Favorite: ${WEAPONS[recap.favoriteWeaponId].displayName}` : 'No weapon used'}{recap.selfDamage ? ` · ${recap.selfDamage} self damage` : ''}</small></article>)}</div></section>
            {matchMode === 'online' && auth.signedIn && typeof onlineSession?.source.localSeat === 'number' && (() => {
              const reward = progressionReward({
                winnerTeamId: result.winnerTeamId,
                teamId: ((onlineSession?.source.localSeat ?? 0) % 2) as 0 | 1,
                isDraw: result.winnerTeamId === null,
                reason: roomView?.result.reason === 'forfeit' ? 'forfeit' : 'normal',
              })
              return <p className="post-match-reward"><strong>Match rewards</strong><span>+{reward.experience} XP · +{reward.currency} Scrap</span><small>Saved to your profile.</small></p>
            })()}
            {matchMode === 'local' ? (
              <div className="actions">
                <button
                  onClick={() => {
                    setResult(null)
                    setScreen(editorTestActive ? 'editor' : 'setup')
                  }}
                >
                  {editorTestActive ? 'Back to Editor' : 'Change Map / Setup'}
                </button>
                <button
                  onClick={() => {
                    gameRef.current?.restart()
                    setResult(null)
                  }}
                >
                  Rematch
                </button>
                <button className="secondary" onClick={() => leaveMatch('menu')}>
                  Main Menu
                </button>
              </div>
            ) : (
              <>
                <p className="rematch-status">
                  {onlineRematchUnavailableReason ??
                    (roomView?.players.find(
                      (player) => player.sessionId === onlineSession?.room.sessionId,
                    )?.wantsRematch
                      ? 'Rematch requested. Waiting for every player.'
                      : `A rematch starts only when all ${roomView?.capacity ?? result.config.playerNames.length} players vote yes.`)}
                </p>
                <div className="actions">
                  {!onlineRematchUnavailableReason && (
                    <button
                      onClick={() => {
                        const next = !roomView?.players.find(
                          (player) => player.sessionId === onlineSession?.room.sessionId,
                        )?.wantsRematch
                        onlineSession?.voteRematch(next)
                      }}
                    >
                      {roomView?.players.find(
                        (player) => player.sessionId === onlineSession?.room.sessionId,
                      )?.wantsRematch
                        ? 'Cancel Rematch'
                        : 'Vote Rematch'}
                    </button>
                  )}
                  <button className="secondary" onClick={() => void leaveOnline('online')}>
                    Online Menu
                  </button>
                  <button className="secondary" onClick={() => void leaveOnline('menu')}>
                    Main Menu
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
      {matchMode === 'online' &&
        screen === 'match' &&
        !result &&
        !paused &&
        roomView?.phase === 'starting' && (
          <div className="modal network-modal">
            <section className="panel">
              <p className="eyebrow">ALL PLAYERS READY</p>
              <h2>Battle starts in...</h2>
              <p>{Math.max(1, Math.ceil(roomView.countdownRemainingMs / 1000))}</p>
              <p>
                {getMap(roomView.mapId).displayName} · {projectileBoundaryLabel(roomView.projectileBoundaryMode)} boundaries
              </p>
            </section>
          </div>
        )}
      {matchMode === 'online' &&
        screen === 'match' &&
        !result &&
        !paused &&
        (connectionStatus === 'reconnecting' ||
          connectionStatus === 'failed' ||
          roomView?.phase === 'reconnecting') && (
          <div className="modal network-modal">
            <section className="panel">
              <p className="eyebrow">CONNECTION HOLD</p>
              <h2>
                {connectionStatus === 'failed'
                  ? 'Connection ended'
                  : connectionStatus === 'reconnecting'
                    ? 'Reconnecting...'
                    : roomView?.countdownRemainingMs
                      ? 'Resuming...'
                      : 'Player reconnecting'}
              </h2>
              {connectionStatus === 'failed' && onlineError ? (
                <ConnectionTroubleshooting message={onlineError} />
              ) : (
                <p>
                  {connectionStatus === 'failed'
                    ? 'The room could not be restored.'
                    : roomView?.countdownRemainingMs
                      ? `The match resumes in ${Math.max(1, Math.ceil(roomView.countdownRemainingMs / 1000))} seconds.`
                      : `The server has paused the match for up to ${Math.ceil((roomView?.reconnectRemainingMs ?? 30000) / 1000)} seconds.`}
                </p>
              )}
              <div className="actions">
                {connectionStatus === 'failed' && (
                  <button onClick={() => void leaveOnline('online')}>Back to Online</button>
                )}
                <button className="secondary" onClick={() => void leaveOnline('menu')}>
                  Leave Room
                </button>
              </div>
            </section>
          </div>
        )}
    </main>
  )
}
