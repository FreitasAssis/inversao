import { describe, expect, test } from 'vitest'
import { lastMove } from '../../src/engine/lastMove'
import { applyAction, startMatch } from '../../src/engine/match'
import type { Action, Match } from '../../src/engine/match'

const play = (match: Match, actions: Action[]) =>
  actions.reduce((current, action) => {
    const result = applyAction(current, action)
    if (!result.ok) throw new Error(result.reason)
    return result.match
  }, match)

const rodizio = () => startMatch({ board: 'dbu', mechanic: 'rotation' })

describe('lastMove', () => {
  test('is nothing before anyone has moved', () => {
    expect(lastMove(rodizio())).toBeNull()
  })

  test('reports which piece went where, and from where', () => {
    // The interface needs the origin to animate the travel, and the match
    // records only the destination — so it is recovered by replaying, which is
    // exactly what "initial state plus a list of actions" is for.
    const match = play(rodizio(), [{ type: 'move', piece: 'square', to: 3 }])

    expect(lastMove(match)).toEqual({ side: 'blue', piece: 'square', from: 0, to: 3 })
  })

  test('follows the piece across several moves', () => {
    const match = play(rodizio(), [
      { type: 'move', piece: 'square', to: 3 },
      { type: 'move', piece: 'circle', to: 6 },
    ])

    expect(lastMove(match)).toEqual({ side: 'orange', piece: 'circle', from: 9, to: 6 })
  })

  test('is nothing after a pass, because nothing moved', () => {
    const stuck = play(
      {
        ...startMatch({ board: 'dbu', mechanic: 'rotation', opening: 'circle' }),
        placement: { blue: [0, 1, 3], orange: [9, 10, 11] },
      } as Match,
      [{ type: 'pass', piece: 'circle' }],
    )

    expect(lastMove(stuck)).toBeNull()
  })

  test('is nothing after a draw, which moves no piece either', () => {
    const drawn = play(startMatch({ board: 'dbu', mechanic: 'choice' }), [
      { type: 'draw', initiative: 'blue' },
    ])

    expect(lastMove(drawn)).toBeNull()
  })
})
