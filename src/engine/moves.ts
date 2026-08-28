import { neighbours } from './board'
import { PIECES } from './types'
import type { BoardCode, Cell, Piece, Placement, Side } from './types'

/**
 * Move generation. A move takes one piece to an adjacent empty cell, respecting
 * the direction of the edge. No capture, no jumping, no stacking (spec 3.1).
 *
 * Which piece is the active one is what separates the two mechanics, so it is
 * an argument here rather than something this module decides.
 */

/** Bitmask of the six occupied cells. */
function occupied(placement: Placement): number {
  let mask = 0
  for (const cell of placement.blue) mask |= 1 << cell
  for (const cell of placement.orange) mask |= 1 << cell
  return mask
}

export function cellOf(placement: Placement, side: Side, piece: Piece): Cell {
  return placement[side][PIECES.indexOf(piece)] as Cell
}

/**
 * Where the given piece may go. Empty means the player has no legal move and
 * loses the turn — a pass, which is common and has to be shown (spec 3.2).
 */
export function legalMoves(
  board: BoardCode,
  placement: Placement,
  side: Side,
  piece: Piece,
): readonly Cell[] {
  const taken = occupied(placement)
  const from = cellOf(placement, side, piece)
  return neighbours(board, from).filter((to) => (taken & (1 << to)) === 0)
}

/** True when the active piece has nowhere to go, so the turn is forfeited. */
export function mustPass(
  board: BoardCode,
  placement: Placement,
  side: Side,
  piece: Piece,
): boolean {
  return legalMoves(board, placement, side, piece).length === 0
}
