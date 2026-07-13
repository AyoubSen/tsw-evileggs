import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { BRAND } from './branding'
import { loadPreferences, savePreferences, type Preferences } from './preferences'
import { MAP_ORDER, MAPS, getMap, type MapId } from '../maps/registry'
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

type Screen =
  | 'menu'
  | 'setup'
  | 'online'
  | 'online-create'
  | 'online-join'
  | 'online-lobby'
  | 'how-to'
  | 'settings'
  | 'credits'
  | 'match'
type PausePanel = 'main' | 'how-to' | 'settings' | 'confirm-restart' | 'confirm-menu'
type MatchMode = 'local' | 'online'

const MAP_LABELS: Record<MapId, string> = {
  'rolling-hills': 'Open lanes',
  'twin-peaks': 'High ground',
  'broken-crossing': 'Risky footing',
  'crater-basin': 'Close quarters',
}

function ToyAvatar({ player }: { player: 1 | 2 }) {
  return (
    <span className={`toy-avatar toy-avatar-${player}`} aria-hidden="true">
      <i />
      <b />
    </span>
  )
}

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
        <ToyAvatar player={1} />
      </span>
      <span className="hero-toy hero-toy-right">
        <ToyAvatar player={2} />
      </span>
    </div>
  )
}

function MapPreview({ mapId }: { mapId: MapId }) {
  const map = MAPS[mapId]
  const points = Array.from({ length: 33 }, (_, index) => {
    const x = (index / 32) * 960
    return `${index * 5},${Math.round((map.surfaceAt(x) / 540) * 62)}`
  }).join(' ')
  return (
    <svg className="map-preview" viewBox="0 0 160 70" aria-hidden="true">
      <polyline points={points} />
    </svg>
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
        <span className="tutorial-icon drag-icon">↙</span>
        <h3>2. Pull back</h3>
        <p>Drag backward from your toy to choose an arc.</p>
      </section>
      <section className="tutorial-step">
        <span className="tutorial-icon power-icon">▰</span>
        <h3>3. Build power</h3>
        <p>A longer pull makes a stronger launch.</p>
      </section>
      <section className="tutorial-step">
        <span className="tutorial-icon weapon-icon">✦</span>
        <h3>4. Pick a tool</h3>
        <p>Use 1–5. Watch each toy's ammunition.</p>
      </section>
      <section className="tutorial-step">
        <span className="tutorial-icon fire-icon">➤</span>
        <h3>5. Fire</h3>
        <p>Press Space. Craters change every route.</p>
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

export function App() {
  const [preferences, setPreferences] = useState<Preferences>(() => loadPreferences())
  const [screen, setScreen] = useState<Screen>('menu')
  const [config, setConfig] = useState<LocalMatchConfig>(() =>
    validateMatchConfig(loadPreferences()),
  )
  const [paused, setPaused] = useState(false)
  const [pausePanel, setPausePanel] = useState<PausePanel>('main')
  const [result, setResult] = useState<MatchResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [matchMode, setMatchMode] = useState<MatchMode>('local')
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
  const [rematchVoted, setRematchVoted] = useState(false)
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
        current.turnDurationSeconds === authoritativeConfig.turnDurationSeconds &&
        current.playerNames[0] === authoritativeConfig.playerNames[0] &&
        current.playerNames[1] === authoritativeConfig.playerNames[1]
          ? current
          : authoritativeConfig,
      )
      setMatchMode('online')
      if (view.phase !== 'results') {
        setResult(null)
        setRematchVoted(false)
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
          remainingHealth: view.result.remainingHealth,
          turnsTaken: view.result.turnsTaken,
          durationSeconds: view.result.durationSeconds,
        })
      if (view.phase !== 'results') setRematchVoted(false)
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
    setConfig(
      validateMatchConfig({
        playerNames: preferences.playerNames,
        mapId: preferences.lastMapId,
        turnDurationSeconds: preferences.turnDurationSeconds,
      }),
    )
    setScreen('setup')
  }
  const start = () => {
    const next = validateMatchConfig(config)
    setConfig(next)
    setPreferences({
      ...preferences,
      playerNames: [...next.playerNames],
      lastMapId: next.mapId,
      turnDurationSeconds: next.turnDurationSeconds,
    })
    setResult(null)
    setError(null)
    setMatchMode('local')
    setScreen('match')
  }
  const leaveMatch = () => {
    setPaused(false)
    setResult(null)
    setScreen('menu')
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
        playerNames: [config.playerNames[0], 'Opponent'],
      })
      const session = await OnlineRoomSession.create(
        next.playerNames[0],
        next,
        operation.controller.signal,
      )
      if (!activateSession(session, operation.generation, operation.controller)) return
      setPreferences({
        ...preferences,
        playerNames: [next.playerNames[0], preferences.playerNames[1]],
        lastMapId: next.mapId,
        turnDurationSeconds: next.turnDurationSeconds,
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
      )
      if (!activateSession(session, operation.generation, operation.controller)) return
      setPreferences({
        ...preferences,
        playerNames: [config.playerNames[0], preferences.playerNames[1]],
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
    setRematchVoted(false)
    setOnlineSession(null)
    if (session) void session.leave().catch(() => undefined)
  }
  const chooseMap = (mapId: MapId) => setConfig({ ...config, mapId })
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
    if (screen === 'online')
      return (
        <section className="panel online-panel">
          <p className="eyebrow">PRIVATE 1V1 ROOMS</p>
          <h2>Meet across the table</h2>
          <p>Create a six-character invite or join a friend. No account or public matchmaking.</p>
          <div className="online-choice-grid">
            <button
              className="online-choice create-choice"
              onClick={() => {
                setOnlineError(null)
                setConfig(
                  validateMatchConfig({
                    playerNames: [preferences.playerNames[0], 'Opponent'],
                    mapId: preferences.lastMapId,
                    turnDurationSeconds: preferences.turnDurationSeconds,
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
                setConfig(
                  validateMatchConfig({
                    playerNames: [preferences.playerNames[0], 'Opponent'],
                    mapId: preferences.lastMapId,
                    turnDurationSeconds: preferences.turnDurationSeconds,
                  }),
                )
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
          <div className="online-form-row">
            <label>
              <span>Your player name</span>
              <input
                maxLength={18}
                value={config.playerNames[0]}
                onChange={(event) =>
                  setConfig({ ...config, playerNames: [event.target.value, 'Opponent'] })
                }
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
            {MAP_ORDER.map((id) => (
              <button
                key={id}
                className={`map-card ${config.mapId === id ? 'selected' : ''}`}
                onClick={() => chooseMap(id)}
              >
                <MapPreview mapId={id} />
                <strong>{MAPS[id].displayName}</strong>
                <em>{MAP_LABELS[id]}</em>
                <span>{MAPS[id].description}</span>
              </button>
            ))}
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
                  setConfig({ ...config, playerNames: [event.target.value, 'Opponent'] })
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
            {[0, 1].map((seat) => {
              const player = roomView.players.find((candidate) => candidate.seat === seat)
              return (
                <article className={`lobby-seat seat-${seat + 1}`} key={seat}>
                  <ToyAvatar player={seat === 0 ? 1 : 2} />
                  <div>
                    <span>{seat === 0 ? 'Host · Player 1' : 'Guest · Player 2'}</span>
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
              <span>Battlefield</span>
              <strong>{getMap(roomView.mapId).displayName}</strong>
            </div>
            <div>
              <span>Turn clock</span>
              <strong>{roomView.turnDurationSeconds} seconds</strong>
            </div>
            <div>
              <span>Start rule</span>
              <strong>Both players ready</strong>
            </div>
          </div>
          <p className="lobby-note">
            {roomView.players.length < 2
              ? 'Share the code. The match stays here until a second player arrives.'
              : 'The server starts a short countdown as soon as both players are ready.'}
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
          <div className="contender-row">
            <div className="contender contender-one">
              <ToyAvatar player={1} />
              <label>
                <span>Player one · comet crew</span>
                <input
                  maxLength={18}
                  value={config.playerNames[0]}
                  onChange={(event) =>
                    setConfig({
                      ...config,
                      playerNames: [event.target.value, config.playerNames[1]],
                    })
                  }
                />
              </label>
            </div>
            <div className="versus-badge">VS</div>
            <div className="contender contender-two">
              <ToyAvatar player={2} />
              <label>
                <span>Player two · ember crew</span>
                <input
                  maxLength={18}
                  value={config.playerNames[1]}
                  onChange={(event) =>
                    setConfig({
                      ...config,
                      playerNames: [config.playerNames[0], event.target.value],
                    })
                  }
                />
              </label>
            </div>
          </div>
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
              Both players share the same keyboard and mouse. Take turns passing the device.
            </span>
          </div>
          <div className="battlefield-picker">
            <div className="picker-heading">
              <div>
                <p className="eyebrow">BATTLEFIELD</p>
                <h3>Choose an arena</h3>
              </div>
              <div className="map-cards">
                {MAP_ORDER.map((id) => (
                  <button
                    key={id}
                    className={`map-card ${config.mapId === id ? 'selected' : ''}`}
                    onClick={() => chooseMap(id)}
                  >
                    <MapPreview mapId={id} />
                    <strong>{MAPS[id].displayName}</strong>
                    <em>{MAP_LABELS[id]}</em>
                    <span>{MAPS[id].description}</span>
                  </button>
                ))}
              </div>
            </div>
            <button
              className="button-quiet"
              onClick={() => chooseMap(MAP_ORDER[Math.floor(Math.random() * MAP_ORDER.length)])}
            >
              Random map
            </button>
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
            <ToyAvatar player={1} />
            <span>✦</span>
            <ToyAvatar player={2} />
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
      className={`app-shell ${preferences.reducedMotion ? 'reduced-motion' : ''} ${preferences.highContrastHud ? 'high-contrast' : ''}`}
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
              data-connection-quality={connectionQuality}
              data-latency-ms={latencyMs ?? ''}
            >
              <span className={`status-dot ${connectionStatus}`} />
              {connectionStatus === 'failed'
                ? 'Connection lost'
                : connectionStatus === 'reconnecting'
                  ? 'Reconnecting'
                  : roomView.phase === 'reconnecting'
                    ? 'Opponent reconnecting'
                    : connectionQuality === 'poor'
                      ? 'High latency'
                      : connectionQuality === 'fair'
                        ? 'Connected · fair'
                        : 'Connected'}
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
              Return to menu
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
                <button onClick={() => setPausePanel('confirm-menu')}>Return to Main Menu</button>
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
              </>
            )}
            {pausePanel === 'confirm-menu' && (
              <>
                <p>Return to the main menu and discard this match?</p>
                <button
                  onClick={() => (matchMode === 'online' ? void leaveOnline('menu') : leaveMatch())}
                >
                  Return to menu
                </button>
                <button className="secondary" onClick={() => setPausePanel('main')}>
                  Cancel
                </button>
              </>
            )}
          </section>
        </div>
      )}
      {result && (
        <div className="modal">
          <section className="panel results">
            <p className="eyebrow">MATCH COMPLETE</p>
            {result.winnerIndex !== null && <ToyAvatar player={result.winnerIndex === 0 ? 1 : 2} />}
            <h2>
              {result.winnerIndex === null
                ? 'Draw'
                : `${result.config.playerNames[result.winnerIndex]} wins`}
            </h2>
            <p>
              {getMap(result.config.mapId).displayName} · {result.remainingHealth} health remaining
              · {result.turnsTaken} turns · {result.durationSeconds}s
            </p>
            {matchMode === 'local' ? (
              <div className="actions">
                <button
                  onClick={() => {
                    setResult(null)
                    setScreen('setup')
                  }}
                >
                  Change Map / Setup
                </button>
                <button
                  onClick={() => {
                    gameRef.current?.restart()
                    setResult(null)
                  }}
                >
                  Rematch
                </button>
                <button className="secondary" onClick={leaveMatch}>
                  Main Menu
                </button>
              </div>
            ) : (
              <>
                <p className="rematch-status">
                  {rematchVoted
                    ? 'Rematch requested. Waiting for the other player.'
                    : 'A rematch starts only when both players vote yes.'}
                </p>
                <div className="actions">
                  <button
                    onClick={() => {
                      const next = !rematchVoted
                      onlineSession?.voteRematch(next)
                      setRematchVoted(next)
                    }}
                  >
                    {rematchVoted ? 'Cancel Rematch' : 'Vote Rematch'}
                  </button>
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
                    : 'Opponent reconnecting'}
              </h2>
              {connectionStatus === 'failed' && onlineError ? (
                <ConnectionTroubleshooting message={onlineError} />
              ) : (
                <p>
                  {connectionStatus === 'failed'
                    ? 'The room could not be restored.'
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
