/**
 * Preferences that outlive a match, kept locally.
 *
 * Both of these are accessibility settings, and an accessibility setting that
 * resets on every visit is barely a setting at all.
 *
 * **On reduced motion.** `prefers-reduced-motion` is an operating system
 * preference, not one of ours, and somebody who set it there should not have to
 * set it again here — so it decides the *default* position of the dial. It does
 * not lock it: the dial is an explicit control, and moving it is an explicit
 * opt-in for this game. Hard-overriding it in CSS instead would leave those
 * users with a control that does nothing, which is worse than no control.
 */

const KEY = 'inversao:settings'

export type Settings = {
  /**
   * How fast animations run, as a position on the dial: 0 slow, 4 instant.
   * Higher is faster, because that is the only way a slider reads.
   */
  speed: number
  colourless: boolean
  /**
   * The evaluation bar (project doc 9). **Off by default**: switched on it is a
   * teaching tool, switched off it preserves the tension, and only one of those
   * is a safe thing to hand somebody who has not asked.
   *
   * Storing it here does not make it available — against the AI it is the same
   * oracle that took the clock down, so the game refuses it there whatever this
   * says.
   */
  evaluation: boolean
  /** Effects volume, 0 to 1. Zero is muted. */
  volume: number
  /**
   * What you are called. Stored per person, never per colour: online you do not
   * choose your side, so a name filed under "blue" would follow the wrong
   * player as soon as the game leaves this device.
   */
  playerName: string
  /** The second player at the same device. Local two-player only. */
  guestName: string
}

/**
 * Names are untrusted input — they end up on a shared image and, online, on
 * somebody else's screen. Trimmed and capped here so that is true in one place.
 */
const NAME_LIMIT = 20

function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return value.trim().slice(0, NAME_LIMIT)
}

/**
 * Dial position to duration multiplier. Inverted on purpose: the CSS wants a
 * multiplier on *duration*, where bigger means slower, and exposing that
 * directly made the control mean the opposite of what it looked like.
 *
 * The last stop is 0 — no animation. That is not the slow end of a speed dial,
 * it is the fast end: instant is as quick as a thing can happen.
 */
const BEATS = [2, 1.35, 1, 0.65, 0]

export const SPEEDS = BEATS.map((_, index) => index)

export function beatFor(speed: number): number {
  return BEATS[speed] ?? 1
}

/**
 * Sound starts on, at half. Effects only fire in reply to something the player
 * did, and the browser keeps the audio context suspended until the first
 * gesture anyway — so nothing can startle somebody who has just opened a link.
 * Background music would be a different question, and there is none.
 */
const DEFAULT_VOLUME = 0.5

export type Environment = { prefersReducedMotion: boolean }

/** Dial positions: 2 is normal, 4 is instant. */
const NORMAL = 2
const INSTANT = BEATS.length - 1

function defaults(environment: Environment): Settings {
  return {
    speed: environment.prefersReducedMotion ? INSTANT : NORMAL,
    colourless: false,
    evaluation: false,
    volume: DEFAULT_VOLUME,
    playerName: '',
    guestName: '',
  }
}

export function readSettings(environment: Environment): Settings {
  const fallback = defaults(environment)
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return fallback
    const stored: unknown = JSON.parse(raw)
    if (typeof stored !== 'object' || stored === null) return fallback

    const { speed, colourless, evaluation, volume, playerName, guestName } =
      stored as Partial<Settings>
    return {
      speed:
        typeof speed === 'number' && SPEEDS.includes(speed) ? speed : fallback.speed,
      colourless: typeof colourless === 'boolean' ? colourless : fallback.colourless,
      evaluation: typeof evaluation === 'boolean' ? evaluation : fallback.evaluation,
      volume:
        typeof volume === 'number' && volume >= 0 && volume <= 1
          ? volume
          : fallback.volume,
      playerName: cleanName(playerName) ?? fallback.playerName,
      guestName: cleanName(guestName) ?? fallback.guestName,
    }
  } catch {
    // Private mode, or a store somebody else wrote to. Never worth an error.
    return fallback
  }
}

export function writeSettings(settings: Settings): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        ...settings,
        playerName: cleanName(settings.playerName) ?? '',
        guestName: cleanName(settings.guestName) ?? '',
      }),
    )
  } catch {
    // Full quota or no storage: losing the preference is not worth an error.
  }
}

/** Whether the system is asking for less motion, safe where there is no DOM. */
export function environment(): Environment {
  const query = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')
  return { prefersReducedMotion: query?.matches ?? false }
}
