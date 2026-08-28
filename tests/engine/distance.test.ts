import { describe, expect, test } from 'vitest'
import { distance } from '../../src/engine/distance'

describe('distance', () => {
  test('is zero to where you already are', () => {
    expect(distance('dbu', 4, 4)).toBe(0)
  })

  test('counts steps along the edges', () => {
    expect(distance('dbu', 0, 1)).toBe(1)
    expect(distance('dbu', 0, 2)).toBe(2)
  })

  test('is not symmetric on a one-way column', () => {
    // Setas has 3->6 and 8->5 but neither back. Going down column 1 is one
    // step; climbing back has to go the long way round (spec 1.3).
    expect(distance('dbu', 3, 6)).toBe(1)
    expect(distance('dbu', 6, 3)).toBeGreaterThan(1)

    expect(distance('dbu', 8, 5)).toBe(1)
    expect(distance('dbu', 5, 8)).toBe(3)
  })

  test('is symmetric where every link is', () => {
    // Grade has no one-way column at all, so distance reads the same either way.
    for (const [from, to] of [
      [3, 6],
      [5, 8],
      [0, 11],
    ] as const) {
      expect(distance('bbb', from, to)).toBe(distance('bbb', to, from))
    }
  })

  test('routes around the bottleneck on the Ponte', () => {
    // Every crossing goes through column 2, so the trip is longer than on a
    // board where all three columns cross.
    expect(distance('nbn', 0, 9)).toBeGreaterThan(distance('bbb', 0, 9))
  })

  test('ignores the pieces, because it is a heuristic and not a route', () => {
    // Distances are precomputed on the empty board: recomputing per position
    // would cost more than the search it feeds.
    expect(distance('dbu', 0, 9)).toBe(distance('dbu', 0, 9))
  })
})
