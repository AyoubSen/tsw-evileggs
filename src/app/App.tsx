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
import { PlayerAvatar } from './PlayerAvatar'
import {
  DEFAULT_PLAYER_APPEARANCES,
  PLAYER_ACCESSORIES,
  PLAYER_ACCENT_COLORS,
  PLAYER_BODIES,
  PLAYER_FACES,
  PLAYER_PATTERNS,
  PLAYER_PRIMARY_COLORS,
  randomPlayerAppearance,
  type PlayerAppearance,
} from '../players/appearanceRegistry'

type Screen =
  | 'menu'
  | 'setup'
  | 'online'
  | 'online-create'
  | 'online-join'
  | 'online-lobby'
  | 'how-to'
  | 'settings'
  | 'customize'
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
        {map.objects.flatMap((object) => object.type === 'projectile-portal'
          ? ([['A', object.entrance], ['B', object.exit]] as const).map(([label, aperture]) => ({ object, aperture, label }))
          : [{ object, aperture: object, label: null }]).map(({ object, aperture, label }) => {
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
            <g key={`${object.id}-${label ?? 'wall'}`} className={label ? `map-preview-portal portal-${label.toLowerCase()}` : undefined}>
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
        <p>Point the Teleporter at safe ground. Face a clear ledge for mines.</p>
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
        className="secondary"
        onClick={() => document.documentElement.requestFullscreen?.()}
      >
        Fullscreen
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
  { field: 'accessory', label: 'Accessory', entries: PLAYER_ACCESSORIES },
] as const

function CustomizePlayer({
  appearances,
  selectedSlot,
  onSelectSlot,
  onChange,
  onBack,
}: {
  appearances: readonly PlayerAppearance[]
  selectedSlot: number
  onSelectSlot: (slot: number) => void
  onChange: (slot: number, appearance: PlayerAppearance) => void
  onBack: () => void
}) {
  const [teamBackground, setTeamBackground] = useState(true)
  const appearance = appearances[selectedSlot] ?? DEFAULT_PLAYER_APPEARANCES[selectedSlot]
  return (
    <section className="panel customize-panel">
      <header className="screen-heading">
        <p className="eyebrow">OPEN THE DRESS-UP DRAWER</p>
        <h2>Customize players</h2>
        <p>Every local slot keeps its own look, ready for local or online play.</p>
      </header>
      <div className="customize-layout">
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
          <div className="large-avatar-preview">
            <PlayerAvatar
              appearance={appearance}
              teamId={selectedSlot % 2}
              teamBackground={teamBackground}
              label={`Player ${selectedSlot + 1} appearance preview`}
            />
          </div>
          <label className="toggle customize-team-toggle">
            <input type="checkbox" checked={teamBackground} onChange={(event) => setTeamBackground(event.target.checked)} />
            Preview team background
          </label>
          <div className="actions customize-random-actions">
            <button type="button" onClick={() => onChange(selectedSlot, randomPlayerAppearance())}>Randomize</button>
            <button type="button" className="secondary" onClick={() => onChange(selectedSlot, { ...DEFAULT_PLAYER_APPEARANCES[selectedSlot] })}>Reset</button>
          </div>
        </aside>
        <div className="appearance-galleries">
          {APPEARANCE_GROUPS.map((group) => (
            <fieldset className="appearance-group" key={group.field}>
              <legend>{group.label}</legend>
              <div className="appearance-options">
                {group.entries.map((entry) => (
                  <button
                    type="button"
                    className={appearance[group.field] === entry.id ? 'selected' : ''}
                    aria-pressed={appearance[group.field] === entry.id}
                    key={entry.id}
                    onClick={() => onChange(selectedSlot, { ...appearance, [group.field]: entry.id } as PlayerAppearance)}
                  >
                    {'color' in entry && <i style={{ backgroundColor: entry.color }} aria-hidden="true" />}
                    <span>{entry.label}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </div>
      <button className="button-quiet customize-back" onClick={onBack}>Back</button>
    </section>
  )
}

export function App() {
  const [preferences, setPreferences] = useState<Preferences>(() => loadPreferences())
  const [screen, setScreen] = useState<Screen>('menu')
  const [customizeSlot, setCustomizeSlot] = useState(0)
  const [customizeReturnScreen, setCustomizeReturnScreen] = useState<
    'menu' | 'setup' | 'online-create' | 'online-join'
  >('menu')
  const [config, setConfig] = useState<LocalMatchConfig>(() =>
    validateMatchConfig(loadPreferences()),
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
    screenRef.current = screen
  }, [screen])
  useEffect(() => {
    audioRef.current?.setPreferences({
      mute: preferences.mute,
      masterVolume: preferences.masterVolume,
      soundEffectsVolume: preferences.soundEffectsVolume,
    })
    gameRef.current?.setPresentationPreferences(getVisualPreferences())
  }, [preferences])
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
          JSON.stringify(appearance) === JSON.stringify(authoritativeConfig.playerAppearances[index]))
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
      }),
    )
    setScreen('setup')
  }
  const start = () => {
    const next = validateMatchConfig(config)
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
      }),
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
      })
      const session = await OnlineRoomSession.create(
        next.playerNames[0],
        next,
        operation.controller.signal,
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
  const chooseMap = (mapId: MapId) => setConfig(validateMatchConfig({ ...config, mapId }))
  const chooseProjectileBoundaryMode = (projectileBoundaryMode: ProjectileBoundaryMode) =>
    setConfig(validateMatchConfig({ ...config, projectileBoundaryMode }))
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
      }),
    )
  }
  const updatePlayerName = (index: number, name: string) => {
    const playerNames = [...config.playerNames]
    playerNames[index] = name
    setConfig({ ...config, playerNames })
  }
  const updatePlayerAppearance = (index: number, appearance: PlayerAppearance) => {
    const playerAppearances = preferences.playerAppearances.map((current, slot) =>
      slot === index ? appearance : current,
    )
    setPreferences({ ...preferences, playerAppearances })
    setConfig((current) => ({
      ...current,
      playerAppearances: current.playerAppearances.map((item, slot) =>
        slot === index ? appearance : item,
      ),
    }))
  }
  const openCustomize = (
    returnScreen: 'menu' | 'setup' | 'online-create' | 'online-join',
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
          selectedSlot={customizeSlot}
          onSelectSlot={setCustomizeSlot}
          onChange={updatePlayerAppearance}
          onBack={() => setScreen(customizeReturnScreen)}
        />
      )
    if (screen === 'online')
      return (
        <section className="panel online-panel">
          <p className="eyebrow">PRIVATE 1V1, 2V2, AND 3V3 ROOMS</p>
          <h2>Meet across the table</h2>
          <p>Create a six-character invite or join a friend. No account or public matchmaking.</p>
          <div className="online-choice-grid">
            <button
              className="online-choice create-choice"
              onClick={() => {
                setOnlineError(null)
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
                  }),
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
                }))
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
          {onlineError && <ConnectionTroubleshooting message={onlineError} />}
          {onlineSlow && (
            <p className="online-wake-message">
              Waking the game server. This can take up to a minute on the free host.
            </p>
          )}
          <div className="actions setup-actions">
            <button
              className="button-primary button-play"
              disabled={onlineBusy}
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
          <div className="actions setup-actions">
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
    if (screen === 'credits')
      return (
        <section className="panel credits-panel">
          <p className="eyebrow">THE TOYBOX LABEL</p>
          <h2>Made for the table</h2>
          <div className="credits-toys">
            <PlayerAvatar appearance={DEFAULT_PLAYER_APPEARANCES[0]} />
            <span>✦</span>
            <PlayerAvatar appearance={DEFAULT_PLAYER_APPEARANCES[1]} />
          </div>
          <p>{BRAND.footer}</p>
          <p>Built with React, Vite, TypeScript, and Phaser.</p>
          <p>
            This original artillery project is not affiliated with any other artillery-game
            franchise.
          </p>
          <button className="button-quiet" onClick={() => setScreen('menu')}>
            Back
          </button>
        </section>
      )
    return null
  }
  return (
    <main
      className={`app-shell ${screen === 'match' ? 'match-active' : ''} ${screen === 'editor' ? 'editor-active' : ''} ${preferences.reducedMotion ? 'reduced-motion' : ''} ${preferences.highContrastHud ? 'high-contrast' : ''}`}
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
        <p>{BRAND.subtitle}</p>
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
                <button onClick={() => setPausePanel('confirm-menu')}>
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
