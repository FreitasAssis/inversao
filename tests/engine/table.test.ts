import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { INITIAL } from '../../src/engine/board'
import { encodePlacement } from '../../src/engine/codec'
import { choiceState, readTable, rotationState } from '../../src/engine/table'

/**
 * The solution tables, as the browser will read them.
 *
 * Two kinds of test here, and the split is deliberate.
 *
 * The unit tests build tables by hand, so they run on a fresh clone where no
 * `.bin` exists — the tables are 38 MB and are not versioned.
 *
 * The integration tests read the **real** files and are skipped when they are
 * absent. They are the ones that matter: they check the TypeScript index
 * against numbers the C solver printed on its own, which is the one bug the
 * project doc singles out as nearly undebuggable — a wrong enumeration returns
 * another position's value and the AI just plays badly, with no symptom.
 */

const POSITIONS = 665280
const ROTATION_STATES = POSITIONS * 6
const CHOICE_STATES = POSITIONS * 8

function header(signature: string, states: number, bytes: number): DataView {
  const view = new DataView(new ArrayBuffer(bytes))
  for (let i = 0; i < 4; i++) view.setUint8(i, signature.charCodeAt(i))
  view.setUint32(4, 1, true)
  view.setUint32(8, states, true)
  return view
}

/** Verdicts live in one plane and distances in another, not side by side. */
function rotationTable(): DataView {
  return header('INVR', ROTATION_STATES, 16 + ROTATION_STATES * 3)
}

function choiceTable(): DataView {
  return header('INVS', CHOICE_STATES, 16 + CHOICE_STATES)
}

describe('reading a solution table', () => {
  test('refuses a file that is not a table at all', () => {
    expect(readTable(new ArrayBuffer(16))).toBeNull()
  })

  test('refuses a file too short to even hold a header', () => {
    expect(readTable(new ArrayBuffer(8))).toBeNull()
  })

  test('refuses a version it was not written to understand', () => {
    const table = rotationTable()
    table.setUint32(4, 2, true)

    expect(readTable(table.buffer)).toBeNull()
  })

  test('refuses a table that was cut short in transit', () => {
    // A truncated download is the realistic failure, and reading one would
    // answer every query past the cut with whatever memory follows.
    const full = rotationTable()
    const cut = full.buffer.slice(0, full.buffer.byteLength - 1)

    expect(readTable(cut)).toBeNull()
  })

  test('refuses a table that is not about this game', () => {
    // The state count is fixed by the enumeration: 12P6 times six for the
    // Rodizio. A file with any other count is describing something else.
    const wrong = header('INVR', 42, 16 + 42 * 3)

    expect(readTable(wrong.buffer)).toBeNull()
  })

  test('reads the verdict and the distance from their separate planes', () => {
    const table = rotationTable()
    table.setUint8(16 + 7, 2)
    table.setUint16(16 + ROTATION_STATES + 7 * 2, 524, true)

    const read = readTable(table.buffer)
    if (read?.kind !== 'rotation') throw new Error('expected a Rodizio table')
    expect(read.verdict(7)).toBe('orange')
    expect(read.distance(7)).toBe(524)
  })

  test('calls anything that is neither side a draw', () => {
    // The solver writes 3 for a drawn state and leaves 0 where retrograde
    // analysis never resolved one — both mean nobody wins.
    const table = rotationTable()
    table.setUint8(16 + 1, 3)

    const read = readTable(table.buffer)
    if (read?.kind !== 'rotation') throw new Error('expected a Rodizio table')
    expect(read.verdict(0)).toBe('draw')
    expect(read.verdict(1)).toBe('draw')
  })

  test('reads a chance back as the probability it was quantised from', () => {
    const table = choiceTable()
    table.setUint8(16 + 3, 255)
    table.setUint8(16 + 4, 128)

    const read = readTable(table.buffer)
    if (read?.kind !== 'choice') throw new Error('expected an Escolha Sorteada table')
    expect(read.chance(3)).toBe(1)
    expect(read.chance(4)).toBeCloseTo(0.502, 3)
  })

  test('refuses a state outside the table rather than answering with memory', () => {
    // Loud, because the quiet version of this bug is the one nobody finds: a
    // wrong index returns another position's value and the AI merely plays
    // badly. There is a fallback to search around the call.
    const read = readTable(rotationTable().buffer)
    if (read?.kind !== 'rotation') throw new Error('expected a Rodizio table')

    expect(() => read.verdict(ROTATION_STATES)).toThrow()
    expect(() => read.verdict(-1)).toThrow()
  })
})

describe('addressing a state', () => {
  test('lays the Rodizio out as position, side and cycle', () => {
    const position = encodePlacement(INITIAL)

    expect(rotationState(INITIAL, 'blue', 2)).toBe(position * 6 + 2)
    expect(rotationState(INITIAL, 'orange', 0)).toBe(position * 6 + 3)
  })

  test('lays the Escolha Sorteada out as position, initiative and phase', () => {
    // Four slots per initiative: naming, then one per symbol the opponent is
    // forced onto. Eight per position, with nothing wasted.
    const position = encodePlacement(INITIAL)

    expect(choiceState(INITIAL, 'blue', null)).toBe(position * 8)
    expect(choiceState(INITIAL, 'blue', 'square')).toBe(position * 8 + 3)
    expect(choiceState(INITIAL, 'orange', null)).toBe(position * 8 + 4)
    expect(choiceState(INITIAL, 'orange', 'circle')).toBe(position * 8 + 5)
  })
})

/**
 * Against the real artifacts. `npm run tabelas` in tools/ produces them; without
 * them there is nothing to check and the suite still has to pass.
 */
const TABLES = 'tools'
const has = (name: string) => existsSync(`${TABLES}/${name}`)
const load = (name: string) => {
  const file = readFileSync(`${TABLES}/${name}`)
  return readTable(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength))
}

describe.skipIf(!has('tabela-dbu-rodizio.bin'))('against the generated tables', () => {
  test('agrees with the C solver on every opening of the Setas', () => {
    // The solver printed these itself: circle and triangle draw, square is a
    // win for the player who opens, at 283 lances. If the enumeration or the
    // index were off by anything at all, none of it would line up.
    const table = load('tabela-dbu-rodizio.bin')
    if (table?.kind !== 'rotation') throw new Error('expected a Rodizio table')

    expect(table.verdict(rotationState(INITIAL, 'blue', 0))).toBe('draw')
    expect(table.verdict(rotationState(INITIAL, 'blue', 1))).toBe('draw')
    expect(table.verdict(rotationState(INITIAL, 'blue', 2))).toBe('blue')
    expect(table.distance(rotationState(INITIAL, 'blue', 2))).toBe(283)
  })

  test('agrees with the C solver on every opening of the Grade', () => {
    // The board where the opening decides which side holds the win (spec 4.2),
    // and the reason the cap reaches 600.
    const table = load('tabela-bbb-rodizio.bin')
    if (table?.kind !== 'rotation') throw new Error('expected a Rodizio table')

    expect(table.verdict(rotationState(INITIAL, 'blue', 0))).toBe('draw')
    expect(table.verdict(rotationState(INITIAL, 'blue', 1))).toBe('blue')
    expect(table.distance(rotationState(INITIAL, 'blue', 1))).toBe(401)
    expect(table.verdict(rotationState(INITIAL, 'blue', 2))).toBe('orange')
    expect(table.distance(rotationState(INITIAL, 'blue', 2))).toBe(524)
  })

  test('reproduces the opening probability the solver reported for the Setas', () => {
    // The solver averages the two initiatives at the opening and printed
    // 0,49365. Read both back and average them: the only gap allowed is the
    // one byte of quantisation.
    const table = load('tabela-dbu-sorteio.bin')
    if (table?.kind !== 'choice') throw new Error('expected an Escolha Sorteada table')

    const blue = table.chance(choiceState(INITIAL, 'blue', null))
    const orange = table.chance(choiceState(INITIAL, 'orange', null))

    expect((blue + orange) / 2).toBeCloseTo(0.49365, 2)
  })

  test('shifts the value toward whoever moves next, once a piece is named', () => {
    // Naming is not the good half of the turn: the answer is. Whoever has to
    // reply gets a free choice of where to put that symbol, and the table shows
    // it — with blue naming, orange moves next and P(blue wins) drops, and the
    // mirror holds. True for all three symbols.
    //
    // This is also the only integration check that can tell the two initiatives
    // apart: at the opening itself they are the same byte, so a swapped
    // initiative index would slip past everything else here.
    const table = load('tabela-dbu-sorteio.bin')
    if (table?.kind !== 'choice') throw new Error('expected an Escolha Sorteada table')

    for (const piece of ['circle', 'triangle', 'square'] as const) {
      expect(
        table.chance(choiceState(INITIAL, 'blue', piece)),
        piece,
      ).toBeLessThan(table.chance(choiceState(INITIAL, 'orange', piece)))
    }
  })

  test('opens balanced whichever way the first initiative falls', () => {
    // Holding the initiative is worth *something* — but at the opening it is
    // worth less than the 1/255 the table is quantised to, so both readings are
    // literally the same byte. That is the ~50/50 opening of spec 6 showing up
    // in the artifact, and it is why no level is unbeatable here.
    //
    // Later in a game the gap is real: naming the square on this same position
    // already separates the two by three quantisation steps.
    const table = load('tabela-dbu-sorteio.bin')
    if (table?.kind !== 'choice') throw new Error('expected an Escolha Sorteada table')

    const blue = table.chance(choiceState(INITIAL, 'blue', null))
    const orange = table.chance(choiceState(INITIAL, 'orange', null))

    expect(Math.abs(blue - orange)).toBeLessThanOrEqual(1 / 255)
  })
})
