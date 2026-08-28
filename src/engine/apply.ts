import { PIECES } from './types'
import type { Cell, Piece, Placement, Side } from './types'

/**
 * Produces the placement that results from moving one piece. Never mutates its
 * argument: a match is the initial state plus a list of actions (project doc
 * 2.2), so every state has to stay walkable on replay.
 *
 * Legality is not checked here — `legalMoves` owns that.
 */
export function applyMove(
  placement: Placement,
  side: Side,
  piece: Piece,
  to: Cell,
): Placement {
  const index = PIECES.indexOf(piece)
  const cells = [...placement[side]] as [Cell, Cell, Cell]
  cells[index] = to
  return side === 'blue'
    ? { blue: cells, orange: placement.orange }
    : { blue: placement.blue, orange: cells }
}
