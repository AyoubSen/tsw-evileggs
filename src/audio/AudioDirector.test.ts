import { describe, expect, it, vi } from 'vitest'
import { AudioDirector } from './AudioDirector'

function fakeContext() {
  const start = vi.fn()
  const oscillator = {
    type: 'sine',
    frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
    start,
    stop: vi.fn(),
  }
  const gain = {
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
  }
  return {
    context: {
      state: 'running',
      currentTime: 0,
      destination: {},
      createOscillator: () => oscillator,
      createGain: () => gain,
      resume: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    },
    start,
  }
}

describe('synthesized audio director', () => {
  it('honors mute and persisted volume values without coupling to reduced motion', async () => {
    const fake = fakeContext()
    const audio = new AudioDirector(
      { mute: true, masterVolume: 0.8, soundEffectsVolume: 0.5 },
      () => fake.context as never,
    )
    await audio.unlock()
    expect(audio.play('explosion')).toBe(false)
    audio.setPreferences({ mute: false, masterVolume: 0.8, soundEffectsVolume: 0.5 })
    expect(audio.play('explosion')).toBe(true)
    expect(audio.play('reflector-hit')).toBe(true)
    expect(fake.start).toHaveBeenCalledTimes(2)
  })

  it('fails silently when AudioContext is unavailable', async () => {
    const audio = new AudioDirector(
      { mute: false, masterVolume: 1, soundEffectsVolume: 1 },
      () => null,
    )
    await expect(audio.unlock()).resolves.toBeUndefined()
    expect(audio.play('jump')).toBe(false)
  })
})
