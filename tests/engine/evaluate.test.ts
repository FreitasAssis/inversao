import { describe, expect, test } from 'vitest'
import { evaluate, remainingDistance } from '../../src/engine/evaluate'
import { INITIAL, TARGETS } from '../../src/engine/board'
import type { Placement } from '../../src/engine/types'

const home = (side: 'blue' | 'orange'): Placement =>
  side === 'blue'
    ? { blue: TARGETS.blue, orange: [3, 4, 5] }
    : { blue: [6, 7, 8], orange: TARGETS.orange }

describe('remainingDistance', () => {
  test('is zero once every piece is home', () => {
    expect(remainingDistance('dbu', home('blue'), 'blue')).toBe(0)
  })

  test('shrinks as a piece closes on its slot', () => {
    const start = remainingDistance('dbu', INITIAL, 'blue')
    const closer = remainingDistance(
      'dbu',
      { blue: [6, 1, 0], orange: [9, 10, 11] },
      'blue',
    )

    expect(closer).toBeLessThan(start)
  })

  test('reads the one-way columns in the right direction', () => {
    // Blue's circle wants D1. Sitting on C1 it is one step away; the same cell
    // for a piece that would have to climb back up is not.
    const onC1 = { blue: [6, 1, 0], orange: [10, 11, 5] } as const

    expect(remainingDistance('dbu', onC1, 'blue')).toBeLessThan(
      remainingDistance('dbu', INITIAL, 'blue'),
    )
  })
})

describe('evaluate', () => {
  test('is symmetric: what is good for one side is bad for the other', () => {
    // Zero-sum. Anything else and minimax quietly stops being minimax.
    const position = { blue: [6, 1, 0], orange: [9, 10, 11] } as const

    expect(evaluate('dbu', position, 'blue')).toBe(-evaluate('dbu', position, 'orange'))
  })

  test('is even at the opening, because the game is', () => {
    // The initial position is symmetric under a 180-degree rotation (spec 7.1),
    // so an evaluation that reads it as anything but level is wrong.
    expect(evaluate('dbu', INITIAL, 'blue')).toBe(0)
  })

  test('prefers being closer to home', () => {
    const ahead = { blue: [6, 1, 0], orange: [9, 10, 11] } as const

    expect(evaluate('dbu', ahead, 'blue')).toBeGreaterThan(0)
  })

  test('scores a win above any ordinary position', () => {
    const won = home('blue')
    const merelyGood = { blue: [9, 11, 4], orange: [0, 1, 2] } as const

    expect(evaluate('dbu', won, 'blue')).toBeGreaterThan(
      evaluate('dbu', merelyGood, 'blue'),
    )
  })
})
