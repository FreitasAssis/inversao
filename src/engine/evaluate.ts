import { TARGETS } from './board'
import { distance } from './distance'
import { hasWon } from './outcome'
import { PIECES } from './types'
import type { BoardCode, Cell, Placement, Side } from './types'

/**
 * How good a position looks, without a solution table.
 *
 * The natural measure is the sum of each piece's distance to its own slot, by
 * breadth-first search on the directed graph (project doc 2.4). The same
 * calculation has three uses: guiding the search, adjudicating a position when
 * the clock runs out, and measuring stagnation for the anti-oracle lock on draw
 * offers.
 *
 * Zero-sum by construction: `evaluate(p, blue) === -evaluate(p, orange)`. Get
 * that wrong and minimax quietly stops being minimax.
 */

/** How many steps the side still owes, added up over its three pieces. */
export function remainingDistance(
  board: BoardCode,
  placement: Placement,
  side: Side,
): number {
  return PIECES.reduce((total, _piece, index) => {
    const from = placement[side][index] as Cell
    const to = TARGETS[side][index] as Cell
    return total + distance(board, from, to)
  }, 0)
}

/** A win outscores any ordinary position without swamping the arithmetic. */
const WIN = 1000

/**
 * Blocking is worth time, so sitting on a cell the opponent still needs counts
 * for something (project doc 2.4). Kept small: it is a nudge, not a plan, and a
 * heavy weight here turns the AI into a blocker that forgets to cross.
 */
const BLOCK = 0.5

function blocking(board: BoardCode, placement: Placement, side: Side): number {
  const theirTargets = PIECES.map((_piece, index) => TARGETS[other(side)][index] as Cell)
  return placement[side].filter((cell) => theirTargets.includes(cell)).length * BLOCK
}

const other = (side: Side): Side => (side === 'blue' ? 'orange' : 'blue')

export function evaluate(board: BoardCode, placement: Placement, side: Side): number {
  if (hasWon(placement, side)) return WIN
  if (hasWon(placement, other(side))) return -WIN

  const mine = remainingDistance(board, placement, side)
  const theirs = remainingDistance(board, placement, other(side))
  return theirs - mine + blocking(board, placement, side) - blocking(board, placement, other(side))
}
