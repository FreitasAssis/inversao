import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { annotate } from '../../src/engine/annotate'
import { chooseByLookup } from '../../src/engine/lookup'
import { applyAction, startMatch } from '../../src/engine/match'
import type { Action, Match, MatchConfig } from '../../src/engine/match'
import { choiceState, readTable, rotationState } from '../../src/engine/table'
import type { ChoiceTable, RotationTable, Table } from '../../src/engine/table'

/**
 * Reading a finished match back (project doc 7.1).
 *
 * The table knows the exact value of every position, so the app can walk the
 * whole game afterwards and point at the move where it turned. Chess engines
 * show this; the difference here is that the number is true rather than
 * estimated.
 *
 * It is also where the clock's adjudication went. Adjudicating decided a result
 * the player could not check; annotating decides nothing and teaches what
 * happened — same table, same competence demonstrated, none of the incentive to
 * game it.
 */

const POSITIONS = 665280

function blank(signature: string, states: number, bytes: number): DataView {
  const view = new DataView(new ArrayBuffer(bytes))
  for (const [i, code] of [...signature].entries()) view.setUint8(i, code.charCodeAt(0))
  view.setUint32(4, 1, true)
  view.setUint32(8, states, true)
  return view
}

function choiceTable(value: (state: number) => number): ChoiceTable {
  const states = POSITIONS * 8
  const table = readTable(blank('INVS', states, 16 + states).buffer)
  if (table?.kind !== 'choice') throw new Error('bad fixture')
  return { ...table, chance: value }
}

function rotationTable(
  verdict: (state: number) => 'blue' | 'orange' | 'draw',
  distance: (state: number) => number = () => 0,
): RotationTable {
  const states = POSITIONS * 6
  const table = readTable(blank('INVR', states, 16 + states * 3).buffer)
  if (table?.kind !== 'rotation') throw new Error('bad fixture')
  return { ...table, verdict, distance }
}

const play = (match: Match, action: Action): Match => {
  const applied = applyAction(match, action)
  if (!applied.ok) throw new Error(applied.reason)
  return applied.match
}

const grade: MatchConfig = { board: 'bbb', mechanic: 'choice' }

/** Blue draws, names the circle and moves; orange answers on the same symbol. */
function shortGame(): Match {
  const opening: readonly Action[] = [
    { type: 'draw', initiative: 'blue' },
    { type: 'move', piece: 'circle', to: 5 },
    { type: 'move', piece: 'circle', to: 6 },
  ]
  return opening.reduce(play, startMatch(grade))
}

describe('annotating a finished match', () => {
  test('reads every position the match passed through', () => {
    const match = shortGame()
    const read = annotate(match, choiceTable(() => 0.5))

    expect(read?.moments).toHaveLength(match.actions.length + 1)
  })

  test('blames a move on whoever played it', () => {
    const match = shortGame()
    const read = annotate(match, choiceTable(() => 0.5))

    expect(read?.moments.map((moment) => moment.mover)).toEqual([
      null,
      null,
      'blue',
      'orange',
    ])
  })

  test('never blames anybody for the coin', () => {
    // The draw is the one action nobody chose, and it moves the value a long
    // way — from the average of both initiatives to one of them. Counting it as
    // somebody's mistake would make the coin the biggest blunder of most games.
    const opened = startMatch(grade)
    const drawn = play(opened, { type: 'draw', initiative: 'blue' })
    const values = new Map([
      [choiceState(opened.placement, 'blue', null), 0.9],
      [choiceState(opened.placement, 'orange', null), 0.1],
    ])
    const table = choiceTable((state) => values.get(state) ?? 0.5)

    const read = annotate(drawn, table)

    // The value swung from 0,5 to 0,9 and nobody is charged for it.
    expect(read?.moments.at(-1)?.cost).toBeNull()
    expect(read?.turningPoint).toBeNull()
  })

  test('never calls a resignation the move that lost the game', () => {
    // Resigning swings the value all the way to the end, and it is the one
    // action that is a *consequence* of the game being lost rather than a cause.
    // Charging it would make "you resigned" the annotation of every resigned
    // match, which is true and useless.
    //
    // The guard on the coin does not cover this on its own: before a draw the
    // turn is already nobody's, so it reads as unattributed anyway. Before a
    // resignation the turn belongs to somebody.
    const drawn = play(shortGame(), { type: 'draw', initiative: 'blue' })
    const quit = play(drawn, { type: 'resign' })

    const read = annotate(quit, choiceTable(() => 0.5))

    expect(read?.moments.at(-1)?.mover).toBeNull()
    expect(read?.turningPoint).toBeNull()
  })

  test('never charges a draw offer either', () => {
    const drawn = play(shortGame(), { type: 'draw', initiative: 'blue' })
    const offered = play(drawn, { type: 'offerDraw' })

    expect(annotate(offered, choiceTable(() => 0.5))?.moments.at(-1)?.mover).toBeNull()
  })

  test('finds the move that gave the most away', () => {
    const match = shortGame()
    const before = play(startMatch(grade), { type: 'draw', initiative: 'blue' })
    const afterBlue = choiceState(
      play(before, { type: 'move', piece: 'circle', to: 5 }).placement,
      'blue',
      'circle',
    )
    // Blue stood at 0,80 and left orange a position worth 0,30 to blue.
    const table = choiceTable((state) =>
      state === choiceState(before.placement, 'blue', null)
        ? 0.8
        : state === afterBlue
          ? 0.3
          : 0.3,
    )

    const read = annotate(match, table)

    expect(read?.turningPoint?.ply).toBe(2)
    expect(read?.turningPoint?.mover).toBe('blue')
    expect(read?.turningPoint?.cost).toBeCloseTo(0.5, 5)
  })

  test('charges each side in its own direction', () => {
    // The table is absolute — P(azul vence) — so a rise is orange's loss and a
    // fall is blue's. Reading one of them backwards is the classic failure.
    const match = shortGame()
    const before = play(startMatch(grade), { type: 'draw', initiative: 'blue' })
    const afterBlue = play(before, { type: 'move', piece: 'circle', to: 5 })
    const states = {
      start: choiceState(before.placement, 'blue', null),
      mid: choiceState(afterBlue.placement, 'blue', 'circle'),
    }
    // Blue plays well and orange throws it away: the number goes up, and it is
    // orange who is charged.
    const table = choiceTable((state) =>
      state === states.start ? 0.5 : state === states.mid ? 0.5 : 0.95,
    )

    const read = annotate(match, table)

    expect(read?.turningPoint?.mover).toBe('orange')
    expect(read?.turningPoint?.cost).toBeCloseTo(0.45, 2)
  })

  test('says nothing when nobody ever gave anything away', () => {
    // Two flawless players. There is no turning point, and inventing one would
    // be the annotation lying to fill space.
    const read = annotate(shortGame(), choiceTable(() => 0.5))

    expect(read?.turningPoint).toBeNull()
  })

  test('refuses a table belonging to the other mechanic', () => {
    expect(annotate(shortGame(), rotationTable(() => 'draw'))).toBeNull()
  })

  test('speaks in verdicts under the Rodizio', () => {
    const opened = startMatch({ board: 'bbb', mechanic: 'rotation' })
    const moved = play(opened, { type: 'move', piece: 'square', to: 3 })
    const start = rotationState(opened.placement, 'blue', 2)
    const table = rotationTable((state) => (state === start ? 'draw' : 'orange'))

    const read = annotate(moved, table)

    expect(read?.moments[0]?.assessment).toEqual({
      kind: 'verdict',
      winner: null,
      distance: 0,
    })
    // Blue turned a draw into a loss: half the scale, and it is a turning point.
    expect(read?.turningPoint?.mover).toBe('blue')
    expect(read?.turningPoint?.cost).toBeCloseTo(0.5, 5)
  })
})

const load = (name: string): Table | null => {
  const file = readFileSync(`tools/${name}`)
  return readTable(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength))
}

describe.skipIf(!existsSync('tools/tabela-bbb-rodizio.bin'))('annotating a perfect game', () => {
  test('finds nothing to point at when both sides played the table', () => {
    // 524 lances, both consulting the same solved table. If the annotation
    // found a mistake in there, it would be the annotation that was wrong.
    const table = load('tabela-bbb-rodizio.bin')
    if (table === null) throw new Error('unreadable table')

    let match = startMatch({ board: 'bbb', mechanic: 'rotation', maxActions: 700 })
    while (match.result === null) {
      match = play(match, chooseByLookup(match, table, { slip: 0, tolerance: 0 }))
    }

    expect(match.actions).toHaveLength(524)
    expect(annotate(match, table)?.turningPoint).toBeNull()
  })
})
