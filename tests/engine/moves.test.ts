import { describe, expect, test } from 'vitest'
import { legalMoves } from '../../src/engine/moves'
import { INITIAL } from '../../src/engine/board'

describe('legalMoves', () => {
  test('opens with a single legal move for the square', () => {
    // Blue's square sits on A1; A2 is taken by its own triangle, so B1 is the
    // only way out. This is the perft depth-1 count of 1 in the oracle.
    expect(legalMoves('dbu', INITIAL, 'blue', 'square')).toEqual([3])
  })

  test('returns nothing when the piece is boxed in', () => {
    // Circle on A1 with A2 and B1 taken by its own pieces: the player passes.
    const boxed = { blue: [0, 1, 3], orange: [9, 10, 11] } as const

    expect(legalMoves('dbu', boxed, 'blue', 'circle')).toEqual([])
  })

  test('will not climb a column that only runs downwards', () => {
    // On Setas 3->6 exists but 6->3 does not, so a piece on C1 with C2 and D1
    // taken is stuck — while the same position on Grade lets it back up.
    const atC1 = { blue: [6, 7, 9], orange: [0, 1, 2] } as const

    expect(legalMoves('dbu', atC1, 'blue', 'circle')).toEqual([])
    expect(legalMoves('bbb', atC1, 'blue', 'circle')).toEqual([3])
  })

  test('cannot land on a cell held by either player', () => {
    // Blue triangle on A2 has A1, A3 and B2 free apart from what is occupied.
    const crowded = { blue: [2, 1, 5], orange: [0, 10, 11] } as const

    expect(legalMoves('dbu', crowded, 'blue', 'triangle')).toEqual([4])
  })
})
