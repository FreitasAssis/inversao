import { TARGETS } from './board'
import type { Placement, Side } from './types'

/**
 * Winning means holding all three of your own slots at the same time (spec
 * 3.3). Each piece has its own slot: the symbol is a label, so covering the
 * three cells with the pieces swapped is not a win.
 *
 * Check it for whoever just moved. Under Escolha Sorteada the same player can
 * move twice in a row, which does not change that — but it does break naive
 * retrograde analysis, see the warning in spec 3.3.
 */
export function hasWon(placement: Placement, side: Side): boolean {
  const at = placement[side]
  const target = TARGETS[side]
  return at[0] === target[0] && at[1] === target[1] && at[2] === target[2]
}
