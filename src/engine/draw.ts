import type { Side } from './types'

/**
 * The local initiative draw: seeded, reproducible, and used **only where both
 * sides share a device** — local two-player and games against the AI.
 *
 * It must never be used online. A seed both clients know lets either of them
 * compute every future draw, which hands the defender back the undo power that
 * spec 8.3 identifies as what kills the mechanic. Online draws come from
 * commit-and-reveal and travel as `draw` actions (project doc 2.3).
 *
 * The seed still buys reproducibility for debugging and for replaying a local
 * game, which is why it is seeded rather than calling Math.random directly.
 */

/** Produces the initiative for a round. Local and AI play only — see above. */
export type InitiativeSource = (round: number) => Side

/** SplitMix32: cheap, and mixes well enough that no bit tracks the input. */
function mix(value: number): number {
  let z = value | 0
  z = (z + 0x9e3779b9) | 0
  z ^= z >>> 16
  z = Math.imul(z, 0x21f0aaad)
  z ^= z >>> 15
  z = Math.imul(z, 0x735a2d97)
  z ^= z >>> 15
  return z >>> 0
}

export function initiativeFrom(seed: number): InitiativeSource {
  return (round: number): Side => {
    // Mixing the seed in first keeps neighbouring rounds from sharing structure.
    const hashed = mix(mix(seed) ^ Math.imul(round, 0x85ebca6b))
    // Take a high bit: the low ones of a multiply-xorshift are the weakest.
    return (hashed >>> 31) === 0 ? 'blue' : 'orange'
  }
}
