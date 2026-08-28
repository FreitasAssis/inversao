import { describe, expect, test } from 'vitest'
import { INITIAL } from '../../src/engine/board'
import { applyMove } from '../../src/engine/apply'
import { legalMoves } from '../../src/engine/moves'
import { hasWon } from '../../src/engine/outcome'
import { choice, rotation } from '../../src/engine/selector'
import { PIECES } from '../../src/engine/types'
import type { BoardCode, Cell, Piece, Placement, Side } from '../../src/engine/types'
import oracles from '../../data/oraculos.json'

/**
 * The deterministic walk: one scripted game per board, compared move by move
 * against the C. Where perft counts nodes in bulk, this pins the order things
 * happen in — which piece is active, whose turn it is, and what a pass does to
 * the cycle.
 *
 * Neither walk follows the real rules for picking pieces, and that is on
 * purpose: they replace the random parts with fixed conventions so the walk is
 * reproducible (project doc 2.5). Both take the first free destination in
 * adjacency order.
 */

const NAMES = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'D1', 'D2', 'D3']
const name = (cell: Cell) => NAMES[cell] as string
/**
 * The C walks destinations in adjacency order, not by cell number — `adj[10]`
 * is [9, 11, 7], so "the first available destination" is not "the lowest". The
 * engine builds its adjacency the same way, so comparing the lists unsorted
 * pins that order too.
 */
const asGenerated = (cells: readonly Cell[]) => [...cells]
const cellOf = (p: Placement, side: Side, piece: Piece) =>
  p[side][PIECES.indexOf(piece)] as Cell

describe('deterministic walk, Rodizio', () => {
  const boards = Object.entries(oracles.rodizio.boards) as [BoardCode, { walk: any[] }][]

  test.each(boards)('%s replays the C walk move for move', (code, expected) => {
    let placement = INITIAL
    let state = rotation.opening()

    for (const step of expected.walk) {
      if ('event' in step) {
        expect(step.event).toBe('fim')
        expect(hasWon(placement, 'blue') || hasWon(placement, 'orange')).toBe(true)
        break
      }
      const turn = rotation.turn(state)
      const piece = turn.piece as Piece
      const moves = asGenerated(legalMoves(code, placement, turn.side, piece))

      expect({ side: turn.side, symbol: piece }).toEqual({
        side: step.side,
        symbol: step.symbol,
      })
      expect(name(cellOf(placement, turn.side, piece))).toBe(step.from)
      expect(moves.map(name)).toEqual(step.legal)
      expect(moves.length > 0 ? name(moves[0] as Cell) : 'PASSE').toBe(step.to)

      // A pass leaves the position alone but still advances the cycle.
      if (moves.length > 0) {
        placement = applyMove(placement, turn.side, piece, moves[0] as Cell)
      }
      state = rotation.advance(state)
    }
  })
})

describe('deterministic walk, Escolha Sorteada', () => {
  const boards = Object.entries(oracles.escolhaSorteada.boards) as [
    BoardCode,
    { walk: any[] },
  ][]

  test.each(boards)('%s replays the C walk round for round', (code, expected) => {
    // The oracle alternates the initiative starting with blue instead of
    // drawing it. Resolving it per round is exactly what the real draw does —
    // the value comes from outside the selector either way.
    let placement = INITIAL
    let state = choice.opening()

    for (const step of expected.walk) {
      if ('event' in step) {
        expect(step.event).toBe('fim')
        expect(hasWon(placement, 'blue') || hasWon(placement, 'orange')).toBe(true)
        break
      }
      state = choice.resolve(state, step.round % 2 === 0 ? 'blue' : 'orange')
      const chooser = choice.turn(state)
      if (!chooser) throw new Error('initiative not resolved')
      expect(chooser.side).toBe(step.initiative)
      expect(chooser.piece).toBeNull()

      // The oracle names pieces round-robin by round, falling through to the
      // next one that has a legal move.
      const named = pickNamed(code, placement, chooser.side, step.round)
      expect(named).toBe(step.symbol)

      const mine = asGenerated(legalMoves(code, placement, chooser.side, named))
      expect(name(cellOf(placement, chooser.side, named))).toBe(step.chooserMove.from)
      expect(mine.length > 0 ? name(mine[0] as Cell) : 'PASSE').toBe(step.chooserMove.to)
      if (mine.length > 0) placement = applyMove(placement, chooser.side, named, mine[0] as Cell)

      state = choice.advance(state, named)

      if (step.responderMove) {
        const responder = choice.turn(state)
        expect(responder).toEqual({ side: other(chooser.side), piece: named })
        if (!responder) throw new Error('no responder')
        const theirs = asGenerated(legalMoves(code, placement, responder.side, named))
        expect(name(cellOf(placement, responder.side, named))).toBe(step.responderMove.from)
        expect(theirs.map(name)).toEqual(step.responderMove.legal)
        expect(theirs.length > 0 ? name(theirs[0] as Cell) : 'PASSE').toBe(step.responderMove.to)
        if (theirs.length > 0) {
          placement = applyMove(placement, responder.side, named, theirs[0] as Cell)
        }
      }
      state = choice.advance(state, named)

      expect(placement).toEqual({
        blue: step.positionAfter.blue,
        orange: step.positionAfter.orange,
      })
    }
  })
})

const other = (side: Side): Side => (side === 'blue' ? 'orange' : 'blue')

function pickNamed(
  board: BoardCode,
  placement: Placement,
  side: Side,
  round: number,
): Piece {
  for (let offset = 0; offset < 3; offset++) {
    const piece = PIECES[(round + offset) % 3] as Piece
    if (legalMoves(board, placement, side, piece).length > 0) return piece
  }
  return PIECES[round % 3] as Piece
}
