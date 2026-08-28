import { describe, expect, test } from 'vitest'
import { hasWon } from '../../src/engine/outcome'
import { INITIAL, TARGETS } from '../../src/engine/board'

describe('hasWon', () => {
  test('nobody has won at the opening', () => {
    expect(hasWon(INITIAL, 'blue')).toBe(false)
    expect(hasWon(INITIAL, 'orange')).toBe(false)
  })

  test('a side wins with all three pieces on their own slots', () => {
    // Spec 3.3: all three at once, checked for whoever just moved.
    const blueHome = { blue: TARGETS.blue, orange: [3, 4, 5] } as const

    expect(hasWon(blueHome, 'blue')).toBe(true)
    expect(hasWon(blueHome, 'orange')).toBe(false)
  })

  test('two pieces home is not a win', () => {
    const almost = { blue: [9, 11, 4], orange: [0, 1, 2] } as const

    expect(hasWon(almost, 'blue')).toBe(false)
  })

  test('the right piece has to be on the right slot', () => {
    // Blue's three targets are D1, D3, D2 for circle, triangle, square. Holding
    // all three cells with the pieces swapped is not a win: the symbol is a
    // label, and each piece has its own slot (spec 2.2).
    const swapped = { blue: [11, 9, 10], orange: [0, 1, 2] } as const

    expect(hasWon(swapped, 'blue')).toBe(false)
  })
})
