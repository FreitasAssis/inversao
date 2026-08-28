import { describe, expect, test } from 'vitest'
import { PLACEMENT_COUNT, decodePlacement, encodePlacement } from '../../src/engine/codec'
import oracles from '../../data/oraculos.json'

describe('codec', () => {
  test('round-trips the opening placement', () => {
    // Blue starts on row A, orange on row D (spec 2.1).
    const opening = { blue: [2, 1, 0], orange: [9, 10, 11] } as const

    const index = encodePlacement(opening)

    expect(decodePlacement(index)).toEqual(opening)
  })

  test('counts as many placements as the C enumeration', () => {
    expect(PLACEMENT_COUNT).toBe(oracles.codec.expected)
    expect(oracles.codec.distinctPlacements).toBe(oracles.codec.expected)
  })

  test('places the same placement at each sampled index as the C enumeration', () => {
    // The count alone proves nothing about ORDER: any enumeration of the 665280
    // placements has the same total. Order is what the solution tables are keyed
    // by, so it is what has to be pinned.
    for (const sample of oracles.codec.samples) {
      expect(decodePlacement(sample.index)).toEqual({
        blue: sample.blue,
        orange: sample.orange,
      })
    }
  })

  test('reproduces the whole C enumeration, index by index', () => {
    // FNV-1a over the six cells of every placement, walked in index order. The
    // samples above pin five points; this pins all 665280 — a swapped side or a
    // shifted rank changes the digest.
    let digest = 2166136261 >>> 0
    for (let i = 0; i < PLACEMENT_COUNT; i++) {
      const placement = decodePlacement(i)
      const cells = [...placement.blue, ...placement.orange]
      expect(encodePlacement(placement)).toBe(i)
      for (const cell of cells) {
        digest = (digest ^ cell) >>> 0
        digest = Math.imul(digest, 16777619) >>> 0
      }
    }
    expect(digest).toBe(oracles.codec.checksum)
  })
})
