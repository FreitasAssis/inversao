import { describe, expect, test } from 'vitest'
import { LEVELS, ORDER, decidedOpening, fallibilityOf, humansFor, isLevel } from '../../src/ui/levels'
import type { Level } from '../../src/ui/levels'

/**
 * What a level means, in the two currencies the game has (spec 6).
 *
 * With a table the dial is exact — a tolerance in percentage points under
 * Escolha Sorteada, a rate of deliberate error under Rodizio. Without one it is
 * a search depth, which is a fallback rather than a patch: branching is 1,45
 * and 4,7, so the search reaches useful depth cheaply.
 *
 * The top two rungs are the interesting ones. Both are flawless, and what
 * separates them is **which seat the player takes** — the same opening holds a
 * proven win for whoever moves first, so seating the AI there is what makes
 * Impossivel literally impossible rather than merely a boast.
 */

describe('the difficulty dial', () => {
  test('gets stricter every step up, in both currencies', () => {
    for (let i = 1; i < ORDER.length; i++) {
      const easier = fallibilityOf(ORDER[i - 1] as Level)
      const harder = fallibilityOf(ORDER[i] as Level)

      expect(harder.tolerance, ORDER[i]).toBeLessThanOrEqual(easier.tolerance)
      expect(harder.slip, ORDER[i]).toBeLessThanOrEqual(easier.slip)
    }
  })

  test('allows no error whatsoever on either flawless rung', () => {
    // The whole promise of the top two. Anything above zero and both names are
    // a lie somebody will eventually catch.
    expect(fallibilityOf('insane')).toEqual({ tolerance: 0, slip: 0 })
    expect(fallibilityOf('impossible')).toEqual({ tolerance: 0, slip: 0 })
  })

  test('costs the Facil player twenty points of win probability', () => {
    // Spec 6's numbers, not invented here: they only mean anything because the
    // table knows exactly what each move costs.
    expect(fallibilityOf('easy')).toEqual({ tolerance: 0.2, slip: 0.3 })
  })

  test('keeps a search depth for while the table is still on its way', () => {
    expect(LEVELS.easy.depth).toBeLessThan(LEVELS.hard.depth)
  })

  test('seats the player first on Insano and the AI first on Impossivel', () => {
    // The only difference between the two, and the whole point: the same
    // opening is a proven win for whoever moves first.
    expect(humansFor('insane')).toEqual(['blue'])
    expect(humansFor('impossible')).toEqual(['orange'])
  })

  test('leaves the seats to the player on every other rung', () => {
    // Below the top there is no theorem at stake, so nothing has to be fixed.
    expect(humansFor('easy')).toBeNull()
    expect(humansFor('medium')).toBeNull()
    expect(humansFor('hard')).toBeNull()
  })

  test('knows which opening puts the proven win in the first seat', () => {
    // Verified against the solved tables: 283 lances on the Setas, 401 on the
    // Grade, both for whoever opens (spec 4.2).
    expect(decidedOpening('dbu')).toBe('square')
    expect(decidedOpening('bbb')).toBe('triangle')
  })

  test('has no such opening on the Ponte, where the Rodizio dies anyway', () => {
    expect(decidedOpening('nbn')).toBeNull()
  })

  test('knows a level from a string that is merely shaped like one', () => {
    expect(isLevel('medium')).toBe(true)
    expect(isLevel('lendario')).toBe(false)
    expect(isLevel('toString')).toBe(false)
  })
})
