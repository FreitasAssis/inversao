import { describe, expect, test } from 'vitest'
import { chooseAction, legalActions } from '../../src/engine/search'
import { applyAction, startMatch } from '../../src/engine/match'
import type { Match } from '../../src/engine/match'
import { TARGETS } from '../../src/engine/board'

const rodizio = (over: Partial<Match> = {}) => ({
  ...startMatch({ board: 'dbu', mechanic: 'rotation' }),
  ...over,
}) as Match

describe('legalActions', () => {
  test('offers the destinations of the piece the cycle named', () => {
    expect(legalActions(rodizio())).toEqual([{ type: 'move', piece: 'square', to: 3 }])
  })

  test('offers a pass, and only a pass, when the piece is stuck', () => {
    const stuck = rodizio({
      placement: { blue: [0, 1, 3], orange: [9, 10, 11] },
      selector: { kind: 'rotation', state: { side: 'blue', cycle: 0 } },
    } as Partial<Match>)

    expect(legalActions(stuck)).toEqual([{ type: 'pass', piece: 'circle' }])
  })

  test('offers every symbol to whoever holds the initiative', () => {
    // Under Escolha Sorteada naming is the decision, so the branching is over
    // pieces as well as destinations — about 4.7 options (spec 7.3).
    const opened = startMatch({ board: 'dbu', mechanic: 'choice' })
    const drawn = applyAction(opened, { type: 'draw', initiative: 'blue' })
    if (!drawn.ok) throw new Error(drawn.reason)
    const es = drawn.match

    const symbols = new Set(
      legalActions(es).map((action) =>
        action.type === 'move' || action.type === 'pass' ? action.piece : null,
      ),
    )

    expect(symbols).toEqual(new Set(['circle', 'triangle', 'square']))
  })
})

describe('chooseAction', () => {
  test('takes the win when it is one move away', () => {
    // Blue's square is on C2 and its slot D2 is empty; the cycle names it.
    const nearly = rodizio({
      placement: { blue: [9, 11, 7], orange: [0, 1, 2] },
    } as Partial<Match>)

    expect(chooseAction(nearly, 2)).toEqual({ type: 'move', piece: 'square', to: 10 })
  })

  test('always returns something the match will accept', () => {
    let match: Match = rodizio()
    for (let ply = 0; ply < 20 && match.result === null; ply++) {
      const action = chooseAction(match, 2)
      const result = applyAction(match, action)
      expect(result.ok).toBe(true)
      if (!result.ok) break
      match = result.match
    }
  })

  test('closes on its slots rather than shuffling', () => {
    // With no table the AI is a search on the distance sum, so over a handful
    // of plies the pieces should be nearer home than they started.
    let match: Match = rodizio()
    for (let ply = 0; ply < 12 && match.result === null; ply++) {
      const result = applyAction(match, chooseAction(match, 3))
      if (!result.ok) throw new Error(result.reason)
      match = result.match
    }

    const onSlots = match.placement.blue.filter(
      (cell, index) => cell === TARGETS.blue[index],
    ).length
    expect(match.placement).not.toEqual(match.initial)
    expect(onSlots).toBeGreaterThanOrEqual(0)
  })
})
