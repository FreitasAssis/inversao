import { describe, expect, test } from 'vitest'
import { initiativeFrom } from '../../src/engine/draw'

describe('initiativeFrom', () => {
  test('gives the same answer for the same seed and round', () => {
    const a = initiativeFrom(12345)
    const b = initiativeFrom(12345)

    expect(a(7)).toBe(b(7))
  })

  test('answers any round without walking the ones before it', () => {
    // Decision 5 in the project doc: a pure function of (seed, round), not a
    // generator with internal state. Either client has to be able to work out
    // round 37 having seen none of the others — that is what reconnection and
    // replay need.
    const fresh = initiativeFrom(999)

    const straightToIt = fresh(37)

    const walked = initiativeFrom(999)
    for (let round = 0; round < 37; round++) walked(round)

    expect(walked(37)).toBe(straightToIt)
  })

  test('different seeds give different sequences', () => {
    const a = initiativeFrom(1)
    const b = initiativeFrom(2)
    const rounds = Array.from({ length: 40 }, (_, i) => i)

    expect(rounds.map(a)).not.toEqual(rounds.map(b))
  })

  test('splits the initiative roughly evenly', () => {
    // The draw decides who chooses, 50/50 (spec 4.1). A lopsided draw would
    // hand one side the naming right far too often.
    const draw = initiativeFrom(2024)
    const blue = Array.from({ length: 10_000 }, (_, i) => draw(i)).filter(
      (side) => side === 'blue',
    ).length

    expect(blue).toBeGreaterThan(4800)
    expect(blue).toBeLessThan(5200)
  })

  test('does not fall into a short cycle', () => {
    // A weak hash can alternate blue/orange every round, which would make the
    // initiative predictable and bring back the alternating variant that draws
    // 99.7% of the time (spec 8.3).
    const draw = initiativeFrom(7)
    const sequence = Array.from({ length: 64 }, (_, i) => draw(i))

    const alternating = sequence.every((side, i) => (side === 'blue') === (i % 2 === 0))
    expect(alternating).toBe(false)

    const runs = new Set<string>()
    for (let i = 0; i + 4 <= sequence.length; i++) runs.add(sequence.slice(i, i + 4).join())
    expect(runs.size).toBeGreaterThan(8)
  })
})
