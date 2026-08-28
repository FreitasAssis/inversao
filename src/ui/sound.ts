/**
 * The game's sounds, synthesised rather than loaded.
 *
 * A handful of oscillators costs **no bytes at all** — nothing to precache,
 * nothing to fetch, nothing to 404. That matters more here than it usually
 * would: the PWA has to install light and there are already tens of megabytes
 * of solution tables competing for the same budget (project doc 5).
 *
 * Sound reinforces, never informs on its own. Every cue below marks a moment
 * that already has a visual and a written channel — the same rule colour lives
 * under (spec 2). Turned off, nothing is lost but the texture.
 *
 * There is no background music, and that was a decision rather than an
 * omission: it would be the largest asset in the project, it is the first thing
 * people mute, and a portfolio link that starts playing is a link opened at
 * work with the volume up.
 */

export type Tone = {
  /** Hz. */
  frequency: number
  /** Seconds from the start of the cue. */
  at: number
  /** Seconds. */
  length: number
  type?: OscillatorType
}

export type Cue = 'move' | 'land' | 'draw' | 'win' | 'defeat' | 'tie'

/**
 * A move is one gesture in two parts: picking up is bright, landing is lower
 * and shorter, so the pair reads as a single action rather than two events.
 */
export const CUES: Record<Cue, readonly Tone[]> = {
  move: [{ frequency: 880, at: 0, length: 0.05, type: 'triangle' }],
  land: [{ frequency: 440, at: 0, length: 0.07, type: 'sine' }],
  // The coin settling: two quick ticks, like something coming to rest.
  draw: [
    { frequency: 1320, at: 0, length: 0.04, type: 'square' },
    { frequency: 990, at: 0.07, length: 0.06, type: 'square' },
  ],
  win: [
    { frequency: 523, at: 0, length: 0.12, type: 'triangle' },
    { frequency: 659, at: 0.1, length: 0.12, type: 'triangle' },
    { frequency: 784, at: 0.2, length: 0.22, type: 'triangle' },
  ],
  defeat: [
    { frequency: 494, at: 0, length: 0.14, type: 'sine' },
    { frequency: 415, at: 0.12, length: 0.14, type: 'sine' },
    { frequency: 311, at: 0.24, length: 0.3, type: 'sine' },
  ],
  // A draw goes nowhere on purpose: the same note twice, neither rising nor
  // falling, because nobody won and the sound should not imply otherwise.
  tie: [
    { frequency: 466, at: 0, length: 0.16, type: 'sine' },
    { frequency: 466, at: 0.18, length: 0.26, type: 'sine' },
  ],
}

export type Player = { play(cue: Cue): void }

/**
 * Builds a player over the Web Audio API. The context is created on first use,
 * never on load: browsers start it suspended until the user has interacted, so
 * building it early buys nothing and a suspended context is a silent one.
 *
 * That suspension is also why sound on by default is safe here. The first cue
 * anyone hears is a reply to their own click — the draw and the AI's opening
 * move happen before any gesture, and the browser drops them for us.
 */
export function createPlayer(volumeOf: () => number): Player {
  let context: AudioContext | null = null

  return {
    play(cue: Cue) {
      const volume = volumeOf()
      if (volume <= 0) return

      const Ctor = globalThis.AudioContext
      if (!Ctor) return
      context ??= new Ctor()
      if (context.state === 'suspended') void context.resume()

      const now = context.currentTime
      for (const tone of CUES[cue]) {
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        oscillator.type = tone.type ?? 'sine'
        oscillator.frequency.value = tone.frequency

        // A short fade at each end: a square edge on an oscillator clicks.
        const start = now + tone.at
        const end = start + tone.length
        gain.gain.setValueAtTime(0, start)
        gain.gain.linearRampToValueAtTime(volume * 0.18, start + 0.01)
        gain.gain.linearRampToValueAtTime(0, end)

        oscillator.connect(gain).connect(context.destination)
        oscillator.start(start)
        oscillator.stop(end)
      }
    },
  }
}
