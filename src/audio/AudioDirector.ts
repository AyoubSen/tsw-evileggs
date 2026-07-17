export type SoundCue =
  | 'menu-select'
  | 'jump'
  | 'weapon-select'
  | 'rocket-fire'
  | 'cannon-fire'
  | 'mortar-fire'
  | 'grenade-fire'
  | 'grenade-bounce'
  | 'reflector-hit'
  | 'grenade-fuse'
  | 'scatter-fire'
  | 'cluster-fire'
  | 'cluster-split'
  | 'drill-fire'
  | 'mine-deploy'
  | 'mine-trigger'
  | 'knife-swing'
  | 'knife-hit'
  | 'beacon-fire'
  | 'beacon-armed'
  | 'barrage-release'
  | 'fork-fire'
  | 'fork-split'
  | 'shoe-fire'
  | 'siege-fire'
  | 'cryo-fire'
  | 'freeze'
  | 'explosion'
  | 'teleport'
  | 'damage'
  | 'timer-warning'
  | 'victory'
  | 'defeat'

export type AudioPreferences = {
  mute: boolean
  masterVolume: number
  soundEffectsVolume: number
}

type AudioContextLike = Pick<
  AudioContext,
  'state' | 'currentTime' | 'destination' | 'createOscillator' | 'createGain' | 'resume' | 'close'
>

const frequencies: Record<SoundCue, readonly [number, number, number]> = {
  'menu-select': [520, 680, 0.045],
  jump: [250, 430, 0.09],
  'weapon-select': [440, 560, 0.055],
  'rocket-fire': [115, 55, 0.18],
  'cannon-fire': [155, 42, 0.2],
  'mortar-fire': [92, 38, 0.24],
  'grenade-fire': [180, 105, 0.14],
  'grenade-bounce': [310, 220, 0.07],
  'reflector-hit': [1800, 420, 0.1],
  'grenade-fuse': [780, 680, 0.045],
  'scatter-fire': [190, 85, 0.11],
  'cluster-fire': [145, 75, 0.17],
  'cluster-split': [620, 230, 0.13],
  'drill-fire': [240, 70, 0.2],
  'mine-deploy': [310, 180, 0.1],
  'mine-trigger': [880, 260, 0.12],
  'knife-swing': [720, 260, 0.08],
  'knife-hit': [230, 120, 0.09],
  'beacon-fire': [260, 520, 0.14],
  'beacon-armed': [620, 820, 0.1],
  'barrage-release': [190, 70, 0.2],
  'fork-fire': [140, 80, 0.16],
  'fork-split': [650, 330, 0.11],
  'shoe-fire': [330, 120, 0.14],
  'siege-fire': [72, 30, 0.3],
  'cryo-fire': [510, 920, 0.16],
  freeze: [940, 280, 0.24],
  explosion: [90, 34, 0.26],
  teleport: [330, 920, 0.2],
  damage: [170, 115, 0.09],
  'timer-warning': [680, 680, 0.045],
  victory: [440, 740, 0.35],
  defeat: [260, 105, 0.32],
}

export class AudioDirector {
  private context: AudioContextLike | null = null
  private unlocked = false
  private preferences: AudioPreferences
  private activeOscillators = new Set<OscillatorNode>()

  constructor(
    preferences: AudioPreferences,
    private readonly createContext: () => AudioContextLike | null = () => {
      const Context = globalThis.AudioContext
      return Context ? new Context() : null
    },
  ) {
    this.preferences = preferences
  }

  setPreferences(preferences: AudioPreferences): void {
    this.preferences = preferences
  }

  async unlock(): Promise<void> {
    if (this.unlocked) return
    let context: AudioContextLike | null = null
    try {
      this.context ??= this.createContext()
      context = this.context
      if (!context) return
      if (context.state === 'suspended') await context.resume()
      this.unlocked = true
    } catch {
      if (context) void context.close().catch(() => undefined)
      this.context = null
    }
  }

  play(cue: SoundCue): boolean {
    const context = this.context
    const volume =
      Math.max(0, Math.min(1, this.preferences.masterVolume)) *
      Math.max(0, Math.min(1, this.preferences.soundEffectsVolume))
    if (!this.unlocked || !context || this.preferences.mute || volume <= 0) return false
    try {
      const [startFrequency, endFrequency, duration] = frequencies[cue]
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const start = context.currentTime
      oscillator.type =
        cue === 'reflector-hit'
          ? 'square'
          : cue === 'explosion' || cue === 'scatter-fire' || cue === 'siege-fire'
          ? 'sawtooth'
          : 'sine'
      oscillator.frequency.setValueAtTime(startFrequency, start)
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(20, endFrequency),
        start + duration,
      )
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.18), start + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      oscillator.connect(gain)
      gain.connect(context.destination)
      this.activeOscillators.add(oscillator)
      oscillator.onended = () => this.activeOscillators.delete(oscillator)
      oscillator.start(start)
      oscillator.stop(start + duration + 0.01)
      return true
    } catch {
      return false
    }
  }

  stopTransient(): void {
    for (const oscillator of this.activeOscillators) {
      try {
        oscillator.stop()
      } catch {
        // It may already have ended between iteration and stop.
      }
    }
    this.activeOscillators.clear()
  }

  dispose(): void {
    this.stopTransient()
    this.unlocked = false
    const context = this.context
    this.context = null
    if (context) void context.close().catch(() => undefined)
  }
}
