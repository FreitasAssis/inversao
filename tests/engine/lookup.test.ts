import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { applyAction, awaitingDraw, startMatch, turn } from '../../src/engine/match'
import type { Action, Match, MatchConfig } from '../../src/engine/match'
import { legalActions } from '../../src/engine/search'
import { assess, chooseByLookup } from '../../src/engine/lookup'
import { choiceState, readTable, rotationState } from '../../src/engine/table'
import type { ChoiceTable, RotationTable, Table } from '../../src/engine/table'
import type { Side } from '../../src/engine/types'

/**
 * Playing from a solved table instead of searching (spec 6).
 *
 * The unit tests build tables by hand so they run without the 38 MB of
 * artifacts. They address states through the same functions the code does,
 * which is deliberate: whether that addressing is *right* is settled against
 * the real files in `table.test.ts`. What is under test here is the choosing.
 *
 * The two at the bottom are the ones that would keep me up at night. They play
 * a whole match out against the table and check it ends exactly where the C
 * solver said it would — which only happens if the winner takes the shortest
 * win and the loser takes the longest defence, every single lance, for hundreds
 * of lances.
 */

const POSITIONS = 665280

function blank(signature: string, states: number, bytes: number): DataView {
  const view = new DataView(new ArrayBuffer(bytes))
  for (const [i, code] of [...signature].entries()) view.setUint8(i, code.charCodeAt(0))
  view.setUint32(4, 1, true)
  view.setUint32(8, states, true)
  return view
}

/** A table where every state is whatever `value` says, in 0..1. */
function choiceTable(value: (state: number) => number): ChoiceTable {
  const states = POSITIONS * 8
  const view = blank('INVS', states, 16 + states)
  const table = readTable(view.buffer)
  if (table?.kind !== 'choice') throw new Error('bad fixture')
  return { ...table, chance: (state) => value(state) }
}

function rotationTable(
  verdict: (state: number) => 'blue' | 'orange' | 'draw',
  distance: (state: number) => number,
): RotationTable {
  const states = POSITIONS * 6
  const view = blank('INVR', states, 16 + states * 3)
  const table = readTable(view.buffer)
  if (table?.kind !== 'rotation') throw new Error('bad fixture')
  return { ...table, verdict, distance }
}

const play = (match: Match, action: Action): Match => {
  const applied = applyAction(match, action)
  if (!applied.ok) throw new Error(applied.reason)
  return applied.match
}

/** Blue holds the initiative and has to name a piece and move it. */
function naming(): Match {
  const opened = startMatch({ board: 'bbb', mechanic: 'choice' })
  return play(opened, { type: 'draw', initiative: 'blue' })
}

/**
 * Walks forward until the position actually offers a choice.
 *
 * The Rodizio opens with exactly one legal move — the square is the only piece
 * with anywhere to go — and averages 1,45 (spec 4.2). A test about *choosing*
 * has to reach somewhere there is something to choose.
 */
function until(start: Match, options: number): Match {
  let match = start
  for (let step = 0; step < 60 && legalActions(match).length < options; step++) {
    match = play(match, legalActions(match)[0] as Action)
  }
  if (legalActions(match).length < options) throw new Error('never found a real choice')
  return match
}

/**
 * Walks forward until the *answering* side is the one to move, with something
 * to choose. That is the only place the between-rounds value is reached: once
 * the answer is played, the round closes and the next initiative does not exist
 * yet.
 */
function answering(options: number): Match {
  let match = naming()
  for (let step = 0; step < 80; step++) {
    const selector = match.selector
    if (
      selector.kind === 'choice' &&
      selector.state.named !== null &&
      legalActions(match).length >= options
    ) {
      return match
    }
    match = awaitingDraw(match)
      ? play(match, { type: 'draw', initiative: 'blue' })
      : play(match, legalActions(match)[0] as Action)
  }
  throw new Error('never found an answer with a real choice')
}

/** Where each candidate action lands, keyed the way the table is. */
function successors(match: Match): Map<number, Action> {
  const found = new Map<number, Action>()
  for (const action of legalActions(match)) {
    const applied = play(match, action)
    const selector = applied.selector
    const state =
      selector.kind === 'rotation'
        ? rotationState(applied.placement, selector.state.side, selector.state.cycle)
        : choiceState(applied.placement, 'blue', selector.state.named)
    found.set(state, action)
  }
  return found
}

describe('choosing from an Escolha Sorteada table', () => {
  test('plays the move the table values highest for the mover', () => {
    const match = naming()
    const options = [...successors(match).keys()]
    const prize = options[2] as number
    const table = choiceTable((state) => (state === prize ? 0.9 : 0.1))

    const chosen = chooseByLookup(match, table, { tolerance: 0 })

    expect(chosen).toEqual(successors(match).get(prize))
  })

  test('reads the value from the mover, so orange chases the low numbers', () => {
    // The table stores P(blue wins) absolutely — one number for both players,
    // which is what makes it a table and not two. Orange minimises it.
    const opened = startMatch({ board: 'bbb', mechanic: 'choice' })
    const match = play(opened, { type: 'draw', initiative: 'orange' })
    const states = new Map<number, Action>()
    for (const action of legalActions(match)) {
      const applied = play(match, action)
      const named = applied.selector.kind === 'choice' ? applied.selector.state.named : null
      states.set(choiceState(applied.placement, 'orange', named), action)
    }
    const prize = [...states.keys()][2] as number
    const table = choiceTable((state) => (state === prize ? 0.1 : 0.9))

    expect(chooseByLookup(match, table, { tolerance: 0 })).toEqual(states.get(prize))
  })

  test('takes the second best when the level tolerates what it costs', () => {
    // "Errar" is playing the second best, never playing at random — that is
    // what makes a weak opponent look human rather than broken (spec 6).
    const match = naming()
    const options = [...successors(match).keys()]
    const best = options[0] as number
    const second = options[1] as number
    const table = choiceTable((state) =>
      state === best ? 0.9 : state === second ? 0.85 : 0.1,
    )

    const chosen = chooseByLookup(match, table, { tolerance: 0.1 })

    expect(chosen).toEqual(successors(match).get(second))
  })

  test('refuses the second best when it costs more than the level allows', () => {
    const match = naming()
    const options = [...successors(match).keys()]
    const best = options[0] as number
    const second = options[1] as number
    const table = choiceTable((state) =>
      state === best ? 0.9 : state === second ? 0.5 : 0.1,
    )

    const chosen = chooseByLookup(match, table, { tolerance: 0.1 })

    expect(chosen).toEqual(successors(match).get(best))
  })


  test('averages the two initiatives for a round whose draw has not happened', () => {
    // Playing the answer closes the round, and the next initiative does not
    // exist until it is drawn — nobody may look ahead at it (project doc 2.3).
    // So the position is worth the average of the two ways it can fall, which
    // is exactly what the solver iterates on.
    //
    // Reading one initiative instead of averaging is a peek, and it is not a
    // harmless one: here it picks the other move outright.
    const match = answering(2)
    const landings = legalActions(match).map((action) => ({
      action,
      placement: play(match, action).placement,
    }))
    const [first, second] = landings
    if (first === undefined || second === undefined) throw new Error('need two')

    const values = new Map<number, number>([
      // Average 0,30 — but a high blue slot, so a peek would undervalue it.
      [choiceState(first.placement, 'blue', null), 0.55],
      [choiceState(first.placement, 'orange', null), 0.05],
      // Average 0,45, with a low blue slot a peek would chase instead.
      [choiceState(second.placement, 'blue', null), 0.1],
      [choiceState(second.placement, 'orange', null), 0.8],
    ])
    const table = choiceTable((state) => values.get(state) ?? 0.5)

    // Orange is answering, so it wants P(azul vence) low: 0,30 beats 0,45.
    expect(chooseByLookup(match, table, { tolerance: 0 })).toEqual(first.action)
  })

  test('stays perfect at zero tolerance', () => {
    // Impossivel. There is no unbeatable level here — the opening is ~50/50 —
    // but there is a flawless one.
    const match = naming()
    const options = [...successors(match).keys()]
    const best = options[0] as number
    const table = choiceTable((state) => (state === best ? 0.9 : 0.899))

    expect(chooseByLookup(match, table, { tolerance: 0 })).toEqual(
      successors(match).get(best),
    )
  })
})

describe('choosing from a Rodizio table', () => {
  const facing = (options: number) => {
    const match = until(startMatch({ board: 'bbb', mechanic: 'rotation' }), options)
    const mover = turn(match)?.side
    if (mover === undefined) throw new Error('nobody to move')
    const other: Side = mover === 'blue' ? 'orange' : 'blue'
    return { match, mover, other, options: [...successors(match).keys()] }
  }

  test('prefers the win, and the shortest one it can find', () => {
    const { match, mover, other, options } = facing(2)
    const slow = options[0] as number
    const quick = options[1] as number
    const table = rotationTable(
      (state) => (state === slow || state === quick ? mover : other),
      (state) => (state === quick ? 4 : 40),
    )

    expect(chooseByLookup(match, table, { slip: 0 })).toEqual(successors(match).get(quick))
  })

  test('plays the longest defence when every move loses', () => {
    // The only thing left to play for, and the reason the table carries a
    // distance at all: without it every losing move scores the same and the AI
    // walks straight into a loss it could have postponed for hundreds of lances.
    const { match, other, options } = facing(2)
    const stubborn = options[1] as number
    const table = rotationTable(
      () => other,
      (state) => (state === stubborn ? 90 : 6),
    )

    expect(chooseByLookup(match, table, { slip: 0 })).toEqual(successors(match).get(stubborn))
  })

  test('prefers a draw to a loss, however long the loss would take', () => {
    const { match, other, options } = facing(2)
    const drawn = options[1] as number
    const table = rotationTable(
      (state) => (state === drawn ? 'draw' : other),
      () => 65535,
    )

    expect(chooseByLookup(match, table, { slip: 0 })).toEqual(successors(match).get(drawn))
  })

  test('slips to the second best exactly when the level says it should', () => {
    const { match, mover, other, options } = facing(2)
    const best = options[0] as number
    const second = options[1] as number
    const table = rotationTable(
      (state) => (state === best || state === second ? mover : other),
      (state) => (state === best ? 2 : 8),
    )

    const slipped = chooseByLookup(match, table, { slip: 0.3, random: () => 0.1 })
    const steady = chooseByLookup(match, table, { slip: 0.3, random: () => 0.9 })

    expect(slipped).toEqual(successors(match).get(second))
    expect(steady).toEqual(successors(match).get(best))
  })

  test('never slips at all when the level allows no error', () => {
    const { match, mover, other, options } = facing(2)
    const best = options[0] as number
    const table = rotationTable(
      (state) => (state === best ? mover : other),
      () => 10,
    )

    expect(chooseByLookup(match, table, { slip: 0, random: () => 0 })).toEqual(
      successors(match).get(best),
    )
  })
})

const load = (name: string): Table | null => {
  const file = readFileSync(`tools/${name}`)
  return readTable(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength))
}

/**
 * Both sides perfect, until somebody wins or the cap stops it.
 *
 * The cap is not decoration. Drop the distance out of the valuation and a
 * winning side manoeuvres inside its won position forever without ever
 * finishing — project doc 2.4 predicts exactly that, and it is why the table
 * carries a distance at all. Without a bound here the test does not fail when
 * that happens; it hangs, which is worse than a red line.
 */
function playOut(config: MatchConfig, table: Table): Match {
  let match = startMatch({ ...config, maxActions: 700 })
  while (match.result === null) {
    match = play(match, chooseByLookup(match, table, { slip: 0, tolerance: 0 }))
  }
  return match
}

describe.skipIf(!existsSync('tools/tabela-bbb-rodizio.bin'))('against the solved tables', () => {
  test('plays the Setas out to the 283 lances the solver proved', () => {
    // Both sides consulting the same table, for 283 lances. It only lands on
    // the number if the winner takes the shortest win *and* the loser takes the
    // longest defence, every single move.
    const table = load('tabela-dbu-rodizio.bin')
    if (table === null) throw new Error('unreadable table')

    const match = playOut({ board: 'dbu', mechanic: 'rotation', opening: 'square' }, table)

    expect(match.result).toEqual({ kind: 'win', winner: 'blue' })
    expect(match.actions).toHaveLength(283)
  })

  test('plays the Grade out to 524, won by the player who did not open', () => {
    // The longest forced win in the game, and the reason the cap reaches 600.
    const table = load('tabela-bbb-rodizio.bin')
    if (table === null) throw new Error('unreadable table')

    const match = playOut({ board: 'bbb', mechanic: 'rotation', opening: 'square' }, table)

    expect(match.result).toEqual({ kind: 'win', winner: 'orange' })
    expect(match.actions).toHaveLength(524)
  })

  test('opens the Grade on the triangle and wins it in 401 instead', () => {
    // Same board, same table, the other side winning — the opening is the only
    // parameter in the game that does that (spec 4.2).
    const table = load('tabela-bbb-rodizio.bin')
    if (table === null) throw new Error('unreadable table')

    const match = playOut({ board: 'bbb', mechanic: 'rotation', opening: 'triangle' }, table)

    expect(match.result).toEqual({ kind: 'win', winner: 'blue' })
    expect(match.actions).toHaveLength(401)
  })
})

describe('assessing a position for the player to see', () => {
  test('reads the value of the position exactly as it stands', () => {
    const match = naming()
    const state = choiceState(match.placement, 'blue', null)
    const table = choiceTable((where) => (where === state ? 0.73 : 0.1))

    expect(assess(match, table)).toEqual({ kind: 'chance', blue: 0.73 })
  })

  test('averages the two initiatives while the round waits on its draw', () => {
    // The draw has not happened and nobody may look ahead at it (project doc
    // 2.3), so the position is worth the average of the two ways it can fall.
    // A bar that peeked would be showing the player something secret.
    const match = startMatch({ board: 'bbb', mechanic: 'choice' })
    const values = new Map([
      [choiceState(match.placement, 'blue', null), 0.6],
      [choiceState(match.placement, 'orange', null), 0.4],
    ])
    const table = choiceTable((state) => values.get(state) ?? 0)

    expect(assess(match, table)).toEqual({ kind: 'chance', blue: 0.5 })
  })

  test('gives a verdict and a distance under the Rodizio', () => {
    const match = startMatch({ board: 'bbb', mechanic: 'rotation' })
    const state = rotationState(match.placement, 'blue', 2)
    const table = rotationTable(
      (where) => (where === state ? 'orange' : 'draw'),
      (where) => (where === state ? 524 : 0),
    )

    expect(assess(match, table)).toEqual({ kind: 'verdict', winner: 'orange', distance: 524 })
  })

  test('refuses a table belonging to the other mechanic', () => {
    // Every answer would be about a different game, and it would look plausible.
    const match = startMatch({ board: 'bbb', mechanic: 'rotation' })

    expect(assess(match, choiceTable(() => 0.5))).toBeNull()
  })

  test('says nothing about a match that is already decided', () => {
    // The result is on the screen. A bar arguing with it would be noise at best.
    const drawn = play(naming(), { type: 'resign' })

    expect(assess(drawn, choiceTable(() => 0.5))).toBeNull()
  })
})

describe.skipIf(!existsSync('tools/tabela-bbb-rodizio.bin'))('assessed against the real table', () => {
  test('calls the Grade opening for the second player, at 524 lances', () => {
    // The same number the solver printed and the play-out reproduces, arrived
    // at a third way: read straight off the position with no game played.
    const table = load('tabela-bbb-rodizio.bin')
    if (table === null) throw new Error('unreadable table')

    expect(assess(startMatch({ board: 'bbb', mechanic: 'rotation' }), table)).toEqual({
      kind: 'verdict',
      winner: 'orange',
      distance: 524,
    })
  })

  test('calls the Escolha Sorteada opening a coin flip', () => {
    const table = load('tabela-dbu-sorteio.bin')
    if (table === null) throw new Error('unreadable table')

    const seen = assess(startMatch({ board: 'dbu', mechanic: 'choice' }), table)
    if (seen?.kind !== 'chance') throw new Error('expected a probability')
    expect(seen.blue).toBeCloseTo(0.494, 2)
  })
})
