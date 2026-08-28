import { describe, expect, test } from 'vitest'
import { applyMove } from '../../src/engine/apply'
import { INITIAL } from '../../src/engine/board'

describe('applyMove', () => {
  test('moves the named piece and leaves the rest alone', () => {
    const after = applyMove(INITIAL, 'blue', 'square', 3)

    expect(after).toEqual({ blue: [2, 1, 3], orange: [9, 10, 11] })
  })

  test('does not mutate the placement it was given', () => {
    // The whole match is initial state plus a list of actions (project doc 2.2),
    // so replaying has to be able to walk the same states again.
    applyMove(INITIAL, 'blue', 'square', 3)

    expect(INITIAL).toEqual({ blue: [2, 1, 0], orange: [9, 10, 11] })
  })
})
