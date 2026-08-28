import { describe, expect, test } from 'vitest'
import { BOARD_CODES, INITIAL, TARGETS, middleLink, neighbours } from '../../src/engine/board'
import type { BoardCode, Cell } from '../../src/engine/types'

/**
 * Transcribed by hand from spec 1.3, which calls itself the source of truth for
 * implementation. The engine derives these from the compact rule (14 shared
 * undirected edges plus a middle band that varies by code), so a transcription
 * and a derivation have to agree — that is the point of writing them out.
 */
const SPEC: Record<BoardCode, Record<number, number[]>> = {
  nbn: {
    0: [1, 3], 1: [0, 2, 4], 2: [1, 5],
    3: [0, 4], 4: [1, 3, 5, 7], 5: [2, 4],
    6: [7, 9], 7: [4, 6, 8, 10], 8: [7, 11],
    9: [6, 10], 10: [7, 9, 11], 11: [8, 10],
  },
  bbb: {
    0: [1, 3], 1: [0, 2, 4], 2: [1, 5],
    3: [0, 4, 6], 4: [1, 3, 5, 7], 5: [2, 4, 8],
    6: [3, 7, 9], 7: [4, 6, 8, 10], 8: [5, 7, 11],
    9: [6, 10], 10: [7, 9, 11], 11: [8, 10],
  },
  dbu: {
    0: [1, 3], 1: [0, 2, 4], 2: [1, 5],
    3: [0, 4, 6], 4: [1, 3, 5, 7], 5: [2, 4],
    6: [7, 9], 7: [4, 6, 8, 10], 8: [5, 7, 11],
    9: [6, 10], 10: [7, 9, 11], 11: [8, 10],
  },
}

const sorted = (cells: readonly Cell[]) => [...cells].sort((a, b) => a - b)

describe('board', () => {
  test.each(BOARD_CODES)('%s matches the adjacency list in the spec', (code) => {
    for (let cell = 0; cell < 12; cell++) {
      expect(sorted(neighbours(code, cell as Cell))).toEqual(SPEC[code][cell])
    }
  })

  test('the Setas one-way columns only run one way', () => {
    // The two asymmetries that make Rodizio a decided game (spec 1.3).
    expect(neighbours('dbu', 3)).toContain(6)
    expect(neighbours('dbu', 6)).not.toContain(3)
    expect(neighbours('dbu', 8)).toContain(5)
    expect(neighbours('dbu', 5)).not.toContain(8)
  })

  test('opens with the pieces on their starting cells', () => {
    // Spec 2.1, indexed circle, triangle, square.
    expect(INITIAL).toEqual({ blue: [2, 1, 0], orange: [9, 10, 11] })
  })

  test('sends every piece to a column it did not start in', () => {
    // Spec 2.2: the cycle B targets.
    expect(TARGETS).toEqual({ blue: [9, 11, 10], orange: [2, 0, 1] })

    const column = (cell: Cell) => cell % 3
    for (const side of ['blue', 'orange'] as const) {
      for (let piece = 0; piece < 3; piece++) {
        expect(column(TARGETS[side][piece] as Cell)).not.toBe(
          column(INITIAL[side][piece] as Cell),
        )
      }
    }
  })
})

describe('middle band', () => {
  // The band is what separates the three boards, and the only thing that does.
  // The engine has to expose it so the interface can draw it instead of leaving
  // three different games looking identical (spec 1.2).

  test('the Ponte crosses in one column only', () => {
    expect([0, 1, 2].map((c) => middleLink('nbn', c))).toEqual(['none', 'both', 'none'])
  })

  test('the Grade crosses everywhere, both ways', () => {
    expect([0, 1, 2].map((c) => middleLink('bbb', c))).toEqual(['both', 'both', 'both'])
  })

  test('the Setas runs down the left and up the right', () => {
    expect([0, 1, 2].map((c) => middleLink('dbu', c))).toEqual(['down', 'both', 'up'])
  })

  test('agrees with the adjacency it is describing', () => {
    // Drawing an arrow the moves do not honour would be worse than drawing none.
    for (const code of BOARD_CODES) {
      const [upper, lower] = [3, 6] as const
      const link = middleLink(code, 0)
      expect(neighbours(code, upper).includes(lower)).toBe(link === 'down' || link === 'both')
      expect(neighbours(code, lower).includes(upper)).toBe(link === 'up' || link === 'both')
    }
  })
})
