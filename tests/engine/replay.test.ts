import { describe, expect, test } from 'vitest'
import { applyAction, replayMatch, startMatch } from '../../src/engine/match'
import type { Action, Match, MatchConfig } from '../../src/engine/match'
import { INITIAL } from '../../src/engine/board'
import type { Placement } from '../../src/engine/types'

/**
 * A match is its config plus its actions, so those two are enough to bring it
 * back — which makes a saved game, an undo and, later, a reconnection the same
 * operation (project doc 2.2, decision 3).
 *
 * The point of replaying rather than storing the position is that the engine
 * gets to *check*. A stored position would be believed; a stored action list has
 * to survive every rule the game has.
 */

const play = (match: Match, action: Action): Match => {
  const result = applyAction(match, action)
  if (!result.ok) throw new Error(result.reason)
  return result.match
}

/**
 * Blue's circle walks 2 → 5 → 8 while orange answers on the same symbol. The
 * second step crosses the third column of the middle band, which only the Grade
 * links downwards — so this one list is legal on one board and not on another.
 */
const CROSSING: readonly Action[] = [
  { type: 'draw', initiative: 'blue' },
  { type: 'move', piece: 'circle', to: 5 },
  { type: 'move', piece: 'circle', to: 6 },
  { type: 'draw', initiative: 'blue' },
  { type: 'move', piece: 'circle', to: 8 },
]

const grade: MatchConfig = { board: 'bbb', mechanic: 'choice' }

describe('replaying a match from its actions', () => {
  test('rebuilds it exactly as it was left', () => {
    const played = CROSSING.reduce(play, startMatch(grade))

    expect(replayMatch(grade, CROSSING)).toEqual(played)
  })

  test('rebuilds an empty list as a fresh match', () => {
    expect(replayMatch(grade, [])).toEqual(startMatch(grade))
  })

  test('refuses a list holding an action the rules reject', () => {
    const bogus: readonly Action[] = [
      { type: 'draw', initiative: 'blue' },
      { type: 'move', piece: 'circle', to: 11 },
    ]

    expect(replayMatch(grade, bogus)).toBeNull()
  })

  test('refuses actions that were only legal on a different board', () => {
    // The Ponte links nothing in that column, so that crossing never happened
    // there. A restored match is re-checked against its own config rather than
    // trusted because it was legal somewhere.
    expect(replayMatch({ board: 'nbn', mechanic: 'choice' }, CROSSING)).toBeNull()
  })

  test('refuses a list longer than the cap allows', () => {
    // The cap is a rule like any other, and a tampered list must not slip past
    // it just because it arrives whole instead of one action at a time.
    expect(replayMatch({ ...grade, maxActions: 3 }, CROSSING)).toBeNull()
  })

  test('brings back the repetition history, not only the position', () => {
    const played = CROSSING.reduce(play, startMatch(grade))
    const restored = replayMatch(grade, CROSSING)

    expect([...(restored?.seen ?? [])]).toEqual([...played.seen])
  })

  test('carries a finished match over with its result', () => {
    const drawn = play(startMatch(grade), { type: 'draw', initiative: 'blue' })
    const over = play(drawn, { type: 'resign' })

    expect(replayMatch(grade, over.actions)?.result).toEqual({
      kind: 'resignation',
      winner: 'orange',
    })
  })
})

describe('starting somewhere other than the opening', () => {
  /** A puzzle position: the player holds the initiative and plays blue. */
  const PUZZLE = { blue: [0, 1, 6], orange: [2, 11, 5] } as unknown as Placement

  test('starts from the placement it was handed', () => {
    // What a puzzle is (project doc 8): a position lifted out of the table,
    // played with the real rules rather than with a diagram.
    expect(startMatch(grade, PUZZLE).placement).toEqual(PUZZLE)
  })

  test('still opens on the initial position when handed nothing', () => {
    expect(startMatch(grade).placement).toEqual(INITIAL)
  })

  test('counts the given placement as the first position seen', () => {
    // The repetition history starts where the match starts, not where a normal
    // match would have.
    const match = startMatch({ ...grade, drawOnRepetition: true }, PUZZLE)

    expect([...match.seen.values()]).toEqual([1])
  })

  test('replays a match that began somewhere else', () => {
    // Replay reads the initial position off the match rather than assuming it,
    // or every puzzle would rebuild as a normal game and reject its own moves.
    const opened = play(startMatch(grade, PUZZLE), { type: 'draw', initiative: 'blue' })
    const moved = play(opened, { type: 'move', piece: 'square', to: 9 })

    expect(replayMatch(grade, moved.actions, PUZZLE)).toEqual(moved)
  })

  test('refuses those same actions from the ordinary opening', () => {
    const opened = play(startMatch(grade, PUZZLE), { type: 'draw', initiative: 'blue' })
    // Blue's square stands on 6 here and on 0 at the opening, so this exact
    // move is legal there and impossible from the ordinary start.
    const moved = play(opened, { type: 'move', piece: 'square', to: 9 })

    expect(replayMatch(grade, moved.actions)).toBeNull()
  })
})
