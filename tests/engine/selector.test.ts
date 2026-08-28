import { describe, expect, test } from 'vitest'
import { choice, rotation } from '../../src/engine/selector'

describe('rotation', () => {
  test('opens with blue on the square', () => {
    // Spec 4.2: the square opens by default.
    expect(rotation.turn(rotation.opening())).toEqual({ side: 'blue', piece: 'square' })
  })

  test('hands the turn over and moves the cycle on', () => {
    const after = rotation.advance(rotation.opening())

    expect(rotation.turn(after)).toEqual({ side: 'orange', piece: 'circle' })
  })

  test('runs circle, triangle, square in that order', () => {
    let state = rotation.opening()
    const seen = []
    for (let i = 0; i < 4; i++) {
      seen.push(rotation.turn(state).piece)
      state = rotation.advance(state)
    }

    expect(seen).toEqual(['square', 'circle', 'triangle', 'square'])
  })

  test('shares one cycle between both players', () => {
    // Not one cycle each: the counter is shared, so consecutive plies by
    // different players use consecutive pieces (spec 4.2).
    let state = rotation.opening()
    const seen = []
    for (let i = 0; i < 4; i++) {
      const turn = rotation.turn(state)
      seen.push(`${turn.side}:${turn.piece}`)
      state = rotation.advance(state)
    }

    expect(seen).toEqual([
      'blue:square',
      'orange:circle',
      'blue:triangle',
      'orange:square',
    ])
  })

  test('can open on another piece', () => {
    // The opening is configurable; only "Impossivel" pins it to the square.
    expect(rotation.turn(rotation.opening('circle'))).toEqual({
      side: 'blue',
      piece: 'circle',
    })
  })
})

describe('choice', () => {
  // The initiative arrives as a resolved value; the selector never rolls it and
  // never derives it. Local play feeds it a seeded generator, online feeds it
  // commit-and-reveal, and neither is the engine's business (project doc 2.3).

  test('waits for the draw before anybody can act', () => {
    expect(choice.turn(choice.opening())).toBeNull()
  })

  test('lets whoever won the draw name the piece', () => {
    const drawn = choice.resolve(choice.opening(), 'orange')

    expect(choice.turn(drawn)).toEqual({ side: 'orange', piece: null })
  })

  test('forces the opponent onto the same symbol', () => {
    const named = choice.advance(choice.resolve(choice.opening(), 'orange'), 'triangle')

    expect(choice.turn(named)).toEqual({ side: 'blue', piece: 'triangle' })
  })

  test('goes back to waiting once both sides have moved', () => {
    let state = choice.resolve(choice.opening(), 'blue')
    state = choice.advance(state, 'circle') // blue names and moves
    state = choice.advance(state, 'circle') // orange is forced to answer

    expect(choice.turn(state)).toBeNull()
    expect(state.round).toBe(1)
  })

  test('lets the same player move twice running', () => {
    // Whoever answers in one round can win the next draw and move twice. Not a
    // bug: it is the double move spec 3.3 warns implementers about.
    let state = choice.resolve(choice.opening(), 'blue')
    state = choice.advance(state, 'square')
    const forced = choice.turn(state)
    state = choice.advance(state, 'square')

    expect(forced?.side).toBe('orange')
    expect(choice.turn(choice.resolve(state, 'blue'))).toEqual({
      side: 'blue',
      piece: null,
    })
  })
})
