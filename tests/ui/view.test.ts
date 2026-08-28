import { describe, expect, test } from 'vitest'
import { viewOf } from '../../src/ui/view'
import { applyAction, startMatch } from '../../src/engine/match'
import type { Match } from '../../src/engine/match'

const rodizio = () => startMatch({ board: 'dbu', mechanic: 'rotation' })
function sorteada(initiative: 'blue' | 'orange') {
  const drawn = applyAction(startMatch({ board: 'dbu', mechanic: 'choice' }), {
    type: 'draw',
    initiative,
  })
  if (!drawn.ok) throw new Error(drawn.reason)
  return drawn.match
}

function play(match: Match, piece: 'circle' | 'triangle' | 'square', to: number): Match {
  const result = applyAction(match, { type: 'move', piece, to: to as never })
  if (!result.ok) throw new Error(result.reason)
  return result.match
}

describe('viewOf', () => {
  test('lights up only the active piece and where it must land', () => {
    // Spec 2.3: highlight the active piece and its own slot, nothing else, so
    // the board stays quiet until the information is needed.
    const view = viewOf(rodizio())

    expect(view.active).toEqual({ side: 'blue', piece: 'square', at: 0 })
    expect(view.slot).toBe(10)
    expect(view.legal).toEqual([3])
  })

  test('marks the mover so playing out of turn is hard to do', () => {
    const view = viewOf(play(rodizio(), 'square', 3))

    expect(view.active?.side).toBe('orange')
    expect(view.awaitingName).toBe(false)
  })

  test('says the piece has to be named before anything can be touched', () => {
    // Under Escolha Sorteada the initiative holder names a symbol first, so
    // there is no active piece and no legal cells to show yet (spec 4.1).
    const view = viewOf(sorteada('orange'))

    expect(view.awaitingName).toBe(true)
    expect(view.mover).toBe('orange')
    expect(view.active).toBeNull()
    expect(view.legal).toEqual([])
  })

  test('flags a pass instead of leaving the board looking stuck', () => {
    // Spec 3.2: the pass is common and is what confuses players most, so it has
    // to be announced rather than shown as an empty board.
    const boxed = startMatch({ board: 'dbu', mechanic: 'rotation', opening: 'circle' })
    const stuck = { ...boxed, placement: { blue: [0, 1, 3], orange: [9, 10, 11] } } as Match

    const view = viewOf(stuck)

    expect(view.legal).toEqual([])
    expect(view.mustPass).toBe(true)
  })

  test('reports every occupied cell with its owner and symbol', () => {
    const view = viewOf(rodizio())

    expect(view.cells[0]).toMatchObject({ occupant: { side: 'blue', piece: 'square' } })
    expect(view.cells[9]).toMatchObject({ occupant: { side: 'orange', piece: 'circle' } })
    expect(view.cells[4]?.occupant).toBeNull()
  })

  test('knows which slot each end cell is', () => {
    // The slots are drawn as empty outlines and revealed as pieces leave.
    expect(viewOf(rodizio()).cells[10]?.slot).toEqual({ side: 'blue', piece: 'square' })
    expect(viewOf(rodizio()).cells[0]?.slot).toEqual({ side: 'orange', piece: 'triangle' })
    expect(viewOf(rodizio()).cells[4]?.slot).toBeNull()
  })

  test('goes quiet once the match is decided', () => {
    // Active piece, legal destinations and whose turn it is are affordances for
    // a game in progress. Left on after the result they read as an invitation
    // to move, on a board that no longer accepts moves.
    const over = applyAction(rodizio(), { type: 'resign' })
    if (!over.ok) throw new Error(over.reason)

    const view = viewOf(over.match)

    expect(view.active).toBeNull()
    expect(view.legal).toEqual([])
    expect(view.mover).toBeNull()
    expect(view.mustPass).toBe(false)
    expect(view.awaitingName).toBe(false)
  })

  test('still shows where every piece stands after the match', () => {
    // The final position is the thing worth looking at, so it stays.
    const over = applyAction(rodizio(), { type: 'resign' })
    if (!over.ok) throw new Error(over.reason)

    const view = viewOf(over.match)

    expect(view.cells[0]).toMatchObject({ occupant: { side: 'blue', piece: 'square' } })
    expect(view.cells[10]?.slot).toEqual({ side: 'blue', piece: 'square' })
  })
})
