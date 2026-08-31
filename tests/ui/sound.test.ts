import { afterEach, describe, expect, test, vi } from 'vitest'
import { CUES, createPlayer } from '../../src/ui/sound'
import type { Cue } from '../../src/ui/sound'

const cues = Object.keys(CUES) as Cue[]

describe('sound cues', () => {
  test('covers the moments the game already marks visually', () => {
    // Sound reinforces, never informs on its own — the same rule colour lives
    // under. Every one of these already has a visual and a text channel.
    expect(cues).toEqual(
      expect.arrayContaining(['move', 'land', 'draw', 'win', 'defeat', 'tie']),
    )
  })

  test('stays inside the range a phone speaker can actually produce', () => {
    for (const cue of cues) {
      for (const tone of CUES[cue]) {
        expect(tone.frequency).toBeGreaterThan(120)
        expect(tone.frequency).toBeLessThan(3000)
      }
    }
  })

  test('keeps every cue short enough not to overlap the next move', () => {
    for (const cue of cues) {
      const total = CUES[cue].reduce((end, tone) => Math.max(end, tone.at + tone.length), 0)
      expect(total).toBeLessThanOrEqual(0.6)
    }
  })

  test('rises on a win and falls on a defeat', () => {
    // The two results already carry opposite moods on screen; the sound has to
    // agree with them or it undoes the work.
    const rising = CUES.win.map((tone) => tone.frequency)
    const falling = CUES.defeat.map((tone) => tone.frequency)

    expect(rising).toEqual([...rising].sort((a, b) => a - b))
    expect(falling).toEqual([...falling].sort((a, b) => b - a))
    expect(rising.length).toBeGreaterThan(1)
    expect(falling.length).toBeGreaterThan(1)
  })

  test('sounds the arrival lower than the pick, so a move reads as one gesture', () => {
    const pick = CUES.move[0]?.frequency ?? 0
    const arrival = CUES.land[0]?.frequency ?? 0

    expect(arrival).toBeLessThan(pick)
  })

  test('goes nowhere on a draw', () => {
    // Nobody won, so the cue must not rise like a win or fall like a loss.
    const tie = CUES.tie.map((tone) => tone.frequency)

    expect(new Set(tie).size).toBe(1)
  })
})

/** Enough of the Web Audio API to see whether it was reached for at all. */
function fakeAudio() {
  const node = () => ({
    connect: () => node(),
    start: () => {},
    stop: () => {},
    frequency: { value: 0 },
    gain: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {} },
    type: '',
  })
  const made = vi.fn(function AudioContext(this: Record<string, unknown>) {
    this.state = 'running'
    this.currentTime = 0
    this.destination = node()
    this.createOscillator = node
    this.createGain = node
    this.resume = () => {}
  })
  vi.stubGlobal('AudioContext', made)
  return made
}

describe('when the sound is allowed to start', () => {
  afterEach(() => vi.unstubAllGlobals())

  test('does not reach for the audio device before the player has touched anything', () => {
    // The draw and the AI's opening move happen on their own, before any
    // gesture. Browsers refuse to start audio there — correctly — and say so in
    // the console, three times, on every first load.
    //
    // The file already argued that those cues should be dropped. It was leaving
    // the dropping to the browser, which does it loudly; this does it here.
    const made = fakeAudio()
    createPlayer(() => 0.5).play('draw')

    expect(made).not.toHaveBeenCalled()
  })

  test('plays once a gesture has happened', () => {
    const made = fakeAudio()
    const player = createPlayer(() => 0.5)

    window.dispatchEvent(new Event('pointerdown'))
    player.play('land')

    expect(made).toHaveBeenCalled()
  })

  test('counts the keyboard as a gesture, since the board is playable by it', () => {
    const made = fakeAudio()
    const player = createPlayer(() => 0.5)

    window.dispatchEvent(new Event('keydown'))
    player.play('land')

    expect(made).toHaveBeenCalled()
  })
})
