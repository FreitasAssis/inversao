import { TARGETS } from '../engine/board'
import { legalMoves } from '../engine/moves'
import { turn } from '../engine/match'
import type { Match } from '../engine/match'
import { PIECES } from '../engine/types'
import type { Cell, Piece, Side } from '../engine/types'

/**
 * What the board should show, derived from the match. Pure: no React, no DOM.
 *
 * The board is meant to teach the game on its own (project doc 4), so this is
 * where "highlight the active piece and its slot, and nothing else" lives — one
 * place to check against spec 2.3 rather than a rule scattered through
 * components.
 */

export type Occupant = { side: Side; piece: Piece }
export type CellView = {
  cell: Cell
  occupant: Occupant | null
  /** The outline drawn on this cell, if it is somebody's landing slot. */
  slot: Occupant | null
}

export type BoardView = {
  cells: readonly CellView[]
  /** Who is to move, or null while the draw is pending. */
  mover: Side | null
  /** The piece that must move, and where it stands. Null while it is unnamed. */
  active: (Occupant & { at: Cell }) | null
  /** The slot the active piece is heading for. */
  slot: Cell | null
  legal: readonly Cell[]
  /** True under Escolha Sorteada while the round waits for its draw. */
  awaitingDraw: boolean
  /** True while the initiative holder picks a symbol. */
  awaitingName: boolean
  /** The active piece has nowhere to go, so the turn is forfeited (spec 3.2). */
  mustPass: boolean
}

const SLOTS: readonly (Occupant | null)[] = (() => {
  const slots = new Array<Occupant | null>(12).fill(null)
  for (const side of ['blue', 'orange'] as const) {
    PIECES.forEach((piece, index) => {
      slots[TARGETS[side][index] as Cell] = { side, piece }
    })
  }
  return slots
})()

function occupantsOf(match: Match): (Occupant | null)[] {
  const occupants = new Array<Occupant | null>(12).fill(null)
  for (const side of ['blue', 'orange'] as const) {
    PIECES.forEach((piece, index) => {
      occupants[match.placement[side][index] as Cell] = { side, piece }
    })
  }
  return occupants
}

export function viewOf(match: Match): BoardView {
  const occupants = occupantsOf(match)
  const cells: CellView[] = Array.from({ length: 12 }, (_, i) => ({
    cell: i as Cell,
    occupant: occupants[i] ?? null,
    slot: SLOTS[i] ?? null,
  }))

  // A decided match keeps its position and loses its affordances. Active piece,
  // legal cells and whose turn it is all invite a move the board will refuse.
  const current = match.result === null ? turn(match) : null
  if (current === null) {
    return {
      cells,
      mover: null,
      active: null,
      slot: null,
      legal: [],
      awaitingDraw: match.result === null,
      awaitingName: false,
      mustPass: false,
    }
  }

  const { side, piece } = current
  if (piece === null) {
    return {
      cells,
      mover: side,
      active: null,
      slot: null,
      legal: [],
      awaitingDraw: false,
      awaitingName: true,
      mustPass: false,
    }
  }

  const at = match.placement[side][PIECES.indexOf(piece)] as Cell
  const legal = legalMoves(match.config.board, match.placement, side, piece)
  return {
    cells,
    mover: side,
    active: { side, piece, at },
    slot: TARGETS[side][PIECES.indexOf(piece)] as Cell,
    legal,
    awaitingDraw: false,
    awaitingName: false,
    mustPass: legal.length === 0,
  }
}
