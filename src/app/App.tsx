import { useEffect, useRef, useState } from 'react'
import { createGame } from '../game/GameHost'

export function App() {
  const hostRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!hostRef.current) return
    try {
      const game = createGame(hostRef.current)
      return () => game.destroy(true)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'The game could not start.'
      queueMicrotask(() => setError(message))
    }
  }, [])

  return (
    <main className="app-shell">
      <header>
        <p className="eyebrow">LOCAL ARTILLERY PROTOTYPE</p>
        <h1>Project Shellshock</h1>
        <p className="subtitle">Milestone 1: One Good Shot</p>
      </header>
      {error ? (
        <p className="error">Game startup error: {error}</p>
      ) : (
        <div className="game-frame" ref={hostRef} />
      )}
      <footer>Original placeholder prototype. No online features or external game assets.</footer>
    </main>
  )
}
