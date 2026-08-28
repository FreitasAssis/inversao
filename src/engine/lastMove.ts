import { positionAt } from './match'
import type { Match } from './match'
import { PIECES } from './types'
import type { Cell, Piece, Side } from './types'

/**
 * The move that produced the current position, origin included.
 *
 * A match records only where a piece went, never where it came from — the
 * origin is implied by the position before it (project doc 2.2, decision 3).
 * The interface needs both to animate the travel, so it is recovered by
 * replaying one action less, which is free precisely because a match is an
 * initial state plus a list of actions.
 *
 * Null when the last action moved nothing: a pass, a draw, an offer.
 */
export type Move = { side: Side; piece: Piece; from: Cell; to: Cell }

export function lastMove(match: Match): Move | null {
  const action = match.actions.at(-1)
  if (action?.type !== 'move') return null

  const before = positionAt(match, match.actions.length - 1)
  const index = PIECES.indexOf(action.piece)
  const moved = (['blue', 'orange'] as const).find(
    (side) => before[side][index] !== match.placement[side][index],
  )
  if (moved === undefined) return null

  return {
    side: moved,
    piece: action.piece,
    from: before[moved][index] as Cell,
    to: action.to,
  }
}
