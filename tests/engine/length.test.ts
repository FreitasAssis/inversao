import { describe, expect, test } from 'vitest'
import { actionsLeft, applyAction, startMatch } from '../../src/engine/match'
import type { Action, Match } from '../../src/engine/match'

/**
 * The move cap replaced a clock, and the reasoning is worth keeping.
 *
 * A per-player clock that expires has to decide the result somehow, and
 * deciding it by the position rewards the player who is ahead for refusing to
 * progress. Worse, it produces an outcome nobody can check: "you lost because
 * the table values your position at 0.31" is analysis, not a result.
 *
 * A cap has neither problem. Both sides reach it together, so there is nothing
 * to game, and reaching it without anyone getting three pieces home is a draw
 * in spirit as well as in name.
 */

const capped = (limit: number) =>
  startMatch({ board: 'dbu', mechanic: 'rotation', maxActions: limit })

function play(match: Match, action: Action): Match {
  const result = applyAction(match, action)
  if (!result.ok) throw new Error(result.reason)
  return result.match
}

const move = (piece: Action extends { piece: infer P } ? never : never) => piece

describe('move cap', () => {
  test('counts down from the limit', () => {
    expect(actionsLeft(capped(500))).toBe(500)
  })

  test('spends one per action, whatever the action was', () => {
    // Offers and refusals cost too: otherwise two players could trade them
    // forever and the cap would never arrive.
    const match = play(capped(10), { type: 'offerDraw' })

    expect(actionsLeft(match)).toBe(9)
  })

  test('is unlimited when no cap was asked for', () => {
    expect(actionsLeft(startMatch({ board: 'dbu', mechanic: 'rotation' }))).toBeNull()
  })

  test('draws when the cap is reached', () => {
    // Nobody won, and nobody is told they lost on a number they cannot verify.
    let match: Match = capped(2)
    match = play(match, { type: 'move', piece: 'square', to: 3 })
    expect(match.result).toBeNull()

    match = play(match, { type: 'move', piece: 'circle', to: 6 })

    expect(match.result).toEqual({ kind: 'lengthDraw' })
    expect(actionsLeft(match)).toBe(0)
  })

  test('lets a win on the last action stand', () => {
    // The move was made and it won. Running into the cap does not undo it.
    const winning = {
      ...capped(1),
      placement: { blue: [9, 11, 7], orange: [0, 1, 2] },
    } as Match

    const match = play(winning, { type: 'move', piece: 'square', to: 10 })

    expect(match.result).toEqual({ kind: 'win', winner: 'blue' })
  })

  test('refuses to play past the cap', () => {
    const match = play(capped(1), { type: 'move', piece: 'square', to: 3 })

    expect(applyAction(match, { type: 'move', piece: 'circle', to: 6 }).ok).toBe(false)
  })
})
