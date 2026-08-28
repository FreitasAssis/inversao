import { describe, expect, test } from 'vitest'
import { applyAction, positionAt, startMatch, turn } from '../../src/engine/match'
import type { Action } from '../../src/engine/match'

/** Plays a list of actions, failing loudly if any is rejected. */
function play(match: ReturnType<typeof startMatch>, actions: Action[]) {
  return actions.reduce((current, action) => {
    const result = applyAction(current, action)
    if (!result.ok) throw new Error(`rejected ${JSON.stringify(action)}: ${result.reason}`)
    return result.match
  }, match)
}

const rodizio = () => startMatch({ board: 'dbu', mechanic: 'rotation' })
const withRepetition = () =>
  startMatch({ board: 'dbu', mechanic: 'rotation', drawOnRepetition: true })

describe('match', () => {
  test('starts with no actions played', () => {
    const match = rodizio()

    expect(match.actions).toEqual([])
    expect(positionAt(match, 0)).toEqual(match.initial)
  })

  test('records a legal move and moves the game on', () => {
    const match = play(rodizio(), [{ type: 'move', piece: 'square', to: 3 }])

    expect(match.actions).toHaveLength(1)
    expect(positionAt(match, 1).blue).toEqual([2, 1, 3])
  })

  test('rejects a move by the wrong piece instead of throwing', () => {
    // Under Rodizio the cycle names the piece, so anything else is illegal.
    // Rejection has to be a value: the network path checks incoming actions
    // with the same call (project doc 2.3).
    const result = applyAction(rodizio(), { type: 'move', piece: 'circle', to: 5 })

    expect(result.ok).toBe(false)
  })

  test('rejects a move to a cell the piece cannot reach', () => {
    const result = applyAction(rodizio(), { type: 'move', piece: 'square', to: 7 })

    expect(result.ok).toBe(false)
  })

  test('replays to any earlier position', () => {
    const match = play(rodizio(), [
      { type: 'move', piece: 'square', to: 3 },
      { type: 'move', piece: 'circle', to: 6 },
    ])

    expect(positionAt(match, 0)).toEqual(match.initial)
    expect(positionAt(match, 1).blue).toEqual([2, 1, 3])
    expect(positionAt(match, 2).orange).toEqual([6, 10, 11])
  })

  test('ends when a side resigns', () => {
    const match = play(rodizio(), [{ type: 'resign' }])

    expect(match.result).toEqual({ kind: 'resignation', winner: 'orange' })
  })

  test('ends in a draw when an offer is accepted', () => {
    const match = play(rodizio(), [{ type: 'offerDraw' }, { type: 'acceptDraw' }])

    expect(match.result).toEqual({ kind: 'agreedDraw' })
  })

  test('carries on when an offer is declined', () => {
    const match = play(rodizio(), [{ type: 'offerDraw' }, { type: 'declineDraw' }])

    expect(match.result).toBeNull()
  })

  test('will not accept a draw nobody offered', () => {
    // The pending offer is derived from the action list, not stored as state:
    // GameState has to stay exactly the position, or it stops matching the
    // table index (project doc 2.6).
    const result = applyAction(rodizio(), { type: 'acceptDraw' })

    expect(result.ok).toBe(false)
  })
})

describe('threefold repetition', () => {
  /**
   * Twelve plies that put everything back where it started. The cycle has
   * period 3 and the turn alternates, so the selector repeats every 6; over 12
   * plies each of the six pieces moves exactly twice, out and back. The opening
   * position therefore recurs at ply 0, 12 and 24 — with the same cells, the
   * same player to move and the same cycle index, which is what spec 3.4 counts.
   */
  const LOOP: Action[] = [
    { type: 'move', piece: 'square', to: 3 }, // blue
    { type: 'move', piece: 'circle', to: 6 }, // orange
    { type: 'move', piece: 'triangle', to: 4 },
    { type: 'move', piece: 'square', to: 8 },
    { type: 'move', piece: 'circle', to: 5 },
    { type: 'move', piece: 'triangle', to: 7 },
    { type: 'move', piece: 'square', to: 0 }, // and back
    { type: 'move', piece: 'circle', to: 9 },
    { type: 'move', piece: 'triangle', to: 1 },
    { type: 'move', piece: 'square', to: 11 },
    { type: 'move', piece: 'circle', to: 2 },
    { type: 'move', piece: 'triangle', to: 10 },
  ]

  test('the loop really does return to the opening', () => {
    const match = play(rodizio(), LOOP)

    expect(match.placement).toEqual(match.initial)
    expect(turn(match)).toEqual({ side: 'blue', piece: 'square' })
  })

  test('is off unless the match asked for it', () => {
    // Repetition is not evidence of a stuck game. With chance it can just mean
    // the draws sent both sides somewhere and back, and under Rodizio 54% of
    // turns are forced anyway (spec 3.4) — so the rule would fire on rails, not
    // on agreement. The clock is what guarantees a match ends.
    const match = play(rodizio(), [...LOOP, ...LOOP])

    expect(match.result).toBeNull()
  })

  test('twice is not a draw even when it is switched on', () => {
    const match = play(withRepetition(), LOOP)

    expect(match.result).toBeNull()
  })

  test('the third time round is a draw when it is switched on', () => {
    const match = play(withRepetition(), [...LOOP, ...LOOP])

    expect(match.result).toEqual({ kind: 'repetitionDraw' })
  })
})

describe('the draw is an action, not a derived value', () => {
  const sorteada = () => startMatch({ board: 'dbu', mechanic: 'choice' })

  test('a fresh round waits for its draw', () => {
    expect(turn(sorteada())).toBeNull()
  })

  test('nothing may be played until the draw lands', () => {
    const result = applyAction(sorteada(), { type: 'move', piece: 'circle', to: 5 })

    expect(result.ok).toBe(false)
  })

  test('the drawn initiative opens the round', () => {
    const match = play(sorteada(), [{ type: 'draw', initiative: 'orange' }])

    expect(turn(match)).toEqual({ side: 'orange', piece: null })
  })

  test('a draw is refused while a round is already running', () => {
    const running = play(sorteada(), [{ type: 'draw', initiative: 'blue' }])

    expect(applyAction(running, { type: 'draw', initiative: 'orange' }).ok).toBe(false)
  })

  test('the next round waits again', () => {
    // Two moves close the round, and the initiative has to be drawn afresh —
    // which is the whole point: nobody can see it coming.
    const match = play(sorteada(), [
      { type: 'draw', initiative: 'blue' },
      { type: 'move', piece: 'circle', to: 5 },
      { type: 'move', piece: 'circle', to: 6 },
    ])

    expect(turn(match)).toBeNull()
  })

  test('replays exactly, because the draws are in the list', () => {
    // This is what the old shared-seed derivation bought, and the action list
    // gives it for free without publishing the schedule of future draws.
    const match = play(sorteada(), [
      { type: 'draw', initiative: 'blue' },
      { type: 'move', piece: 'circle', to: 5 },
      { type: 'move', piece: 'circle', to: 6 },
      { type: 'draw', initiative: 'blue' },
      { type: 'move', piece: 'square', to: 3 },
    ])

    expect(positionAt(match, 5)).toEqual(match.placement)
    expect(positionAt(match, 2).blue).toEqual([5, 1, 0])
  })
})
