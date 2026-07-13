import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { BRAND } from './branding'
import { loadPreferences, savePreferences, type Preferences } from './preferences'
import { MAP_ORDER, MAPS, getMap, type MapId } from '../maps/registry'
import { validateMatchConfig, type LocalMatchConfig, type TurnDuration } from '../match/config'
import { createGame, type GameHost } from '../game/GameHost'
import type { MatchResult } from '../game/types'

type Screen = 'menu' | 'setup' | 'how-to' | 'settings' | 'credits' | 'match'
type PausePanel = 'main' | 'how-to' | 'settings' | 'confirm-restart' | 'confirm-menu'

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
  const hostRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<GameHost | null>(null)
  const getVisualPreferences = useEffectEvent(() => ({
    reducedMotion: preferences.reducedMotion,
    aimGuide: preferences.aimGuide,
  }))

  useEffect(() => {
    savePreferences(preferences)
  }, [preferences])
  useEffect(() => {
    if (screen !== 'match' || !hostRef.current) return
    try {
      const visualPreferences = getVisualPreferences()
      gameRef.current = createGame(
        hostRef.current,
        config,
        {
          onPauseRequest: () => {
            setPausePanel('main')
            setPaused(true)
          },
          onResult: setResult,
        },
        visualPreferences.reducedMotion,
        visualPreferences.aimGuide,
      )
      return () => {
        gameRef.current?.destroy()
        gameRef.current = null
      }
    } catch (caught) {
      console.error(caught)
      queueMicrotask(() =>
        setError('The match could not start. Please return to the menu and try again.'),
      )
    }
  }, [screen, config])
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
    setScreen('match')
  }
  const leaveMatch = () => {
    setPaused(false)
    setResult(null)
    setScreen('menu')
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
    >
      <header className="brand">
        <p className="eyebrow">TURN-BASED LOCAL PLAY</p>
        <h1>{BRAND.title}</h1>
        <p>{BRAND.subtitle}</p>
      </header>
      {screen === 'match' ? <div className="game-frame" ref={hostRef} /> : content()}
      <footer>v{BRAND.version}</footer>
      {error && (
        <div className="modal">
          <section className="panel">
            <h2>Unable to start</h2>
            <p>{error}</p>
            <button onClick={leaveMatch}>Return to menu</button>
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
                <button onClick={() => setPausePanel('confirm-restart')}>Restart Match</button>
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
                <button onClick={leaveMatch}>Return to menu</button>
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
          </section>
        </div>
      )}
    </main>
  )
}
