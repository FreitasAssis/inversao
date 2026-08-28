import { beforeEach, describe, expect, test } from 'vitest'
import { clearSaved, readSaved, writeSaved } from '../../src/ui/saved'
import { applyAction, startMatch } from '../../src/engine/match'
import type { Action, Match, MatchConfig } from '../../src/engine/match'

/**
 * Closing the tab must not lose the game (project doc 5).
 *
 * What is stored is the config and the action list, never a position: coming
 * back replays the whole match through the engine, so a save that no longer
 * obeys the rules is caught rather than believed. Everything else here exists
 * so the game resumes as *the same game* — the same seed, so the draws carry on
 * the same schedule, and the same seats, so nobody's opponent changes.
 */

const KEY = 'inversao:match'

const grade: MatchConfig = { board: 'bbb', mechanic: 'choice' }

const play = (match: Match, action: Action): Match => {
  const result = applyAction(match, action)
  if (!result.ok) throw new Error(result.reason)
  return result.match
}

/** Blue's circle steps 2 → 5, orange answers on the same symbol. */
const OPENED: readonly Action[] = [
  { type: 'draw', initiative: 'blue' },
  { type: 'move', piece: 'circle', to: 5 },
  { type: 'move', piece: 'circle', to: 6 },
]

const opened = () => OPENED.reduce(play, startMatch(grade))

describe('a match in progress, kept locally', () => {
  beforeEach(() => localStorage.clear())

  test('has nothing to bring back on a first visit', () => {
    expect(readSaved()).toBeNull()
  })

  test('brings the match back exactly where it was left', () => {
    const match = opened()
    writeSaved({ match, seed: 7, humans: ['blue'], level: 'medium' })

    expect(readSaved()?.match).toEqual(match)
  })

  test('remembers who was human, so the AI does not take over a shared game', () => {
    // Restoring a two-player game as a game against the AI would not just look
    // wrong: the AI would immediately move for the person sitting there.
    writeSaved({ match: opened(), seed: 7, humans: ['blue', 'orange'], level: 'medium' })

    expect(readSaved()?.humans).toEqual(['blue', 'orange'])
  })

  test('remembers the seed, so the draws carry on the same schedule', () => {
    // The initiative source is a pure function of seed and round, so the saved
    // seed is what makes the rest of the match the one that was interrupted.
    writeSaved({ match: opened(), seed: 12345, humans: ['blue'], level: 'medium' })

    expect(readSaved()?.seed).toBe(12345)
  })

  test('remembers the difficulty, which is not something to change mid-match', () => {
    writeSaved({ match: opened(), seed: 7, humans: ['blue'], level: 'impossible' })

    expect(readSaved()?.level).toBe('impossible')
  })

  test('remembers which piece the Rodizio was opened on', () => {
    // It is the one parameter that decides which side holds the theoretical
    // win (spec 4.2), so losing it would bring back a different game.
    const rodizio: MatchConfig = { board: 'bbb', mechanic: 'rotation', opening: 'triangle' }
    const match = applyAction(startMatch(rodizio), { type: 'move', piece: 'triangle', to: 4 })
    if (!match.ok) throw new Error(match.reason)
    writeSaved({ match: match.match, seed: 7, humans: ['blue'], level: 'medium' })

    expect(readSaved()?.match.config.opening).toBe('triangle')
  })

  test('keeps nothing for a match nobody has started', () => {
    // An untouched board is not a game in progress, and coming back to one is
    // no different from coming back to a fresh one.
    writeSaved({ match: startMatch(grade), seed: 7, humans: ['blue'], level: 'medium' })

    expect(readSaved()).toBeNull()
  })

  test('forgets the match once it is over', () => {
    // A finished match is a result, and reopening the site onto somebody's old
    // result is worse than opening onto a board.
    const match = opened()
    writeSaved({ match, seed: 7, humans: ['blue'], level: 'medium' })

    // The round closed, so the next initiative has to be drawn before anyone
    // can act — resigning included.
    const next = play(match, { type: 'draw', initiative: 'blue' })
    writeSaved({
      match: play(next, { type: 'resign' }),
      seed: 7,
      humans: ['blue'],
      level: 'medium',
    })

    expect(readSaved()).toBeNull()
  })

  test('drops a save whose actions no longer obey its own config', () => {
    // Untrusted input, and the reason the store holds actions rather than a
    // position: the engine gets to check. This also covers the rules changing
    // under a save that was honest when it was written.
    localStorage.setItem(
      KEY,
      JSON.stringify({
        config: { board: 'nbn', mechanic: 'choice' },
        actions: [
          { type: 'draw', initiative: 'blue' },
          { type: 'move', piece: 'circle', to: 5 },
          { type: 'move', piece: 'circle', to: 6 },
          { type: 'draw', initiative: 'blue' },
          { type: 'move', piece: 'circle', to: 8 },
        ],
        seed: 7,
        humans: ['blue'],
        level: 'medium',
      }),
    )

    expect(readSaved()).toBeNull()
  })

  test('drops a save naming a board that does not exist', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        config: { board: 'zzz', mechanic: 'choice' },
        actions: [],
        seed: 7,
        humans: ['blue'],
        level: 'medium',
      }),
    )

    expect(readSaved()).toBeNull()
  })

  test('drops a save holding an action of no known kind', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        config: grade,
        actions: [{ type: 'teleport', piece: 'banana', to: 99 }],
        seed: 7,
        humans: ['blue'],
        level: 'medium',
      }),
    )

    expect(readSaved()).toBeNull()
  })

  test('survives a store that is not json at all', () => {
    localStorage.setItem(KEY, 'not json')

    expect(readSaved()).toBeNull()
  })

  test('falls back rather than losing a good game over an unknown difficulty', () => {
    // The difficulty is a dial on the opponent, not part of the match. Throwing
    // a real game away because of it would be the wrong trade.
    localStorage.setItem(
      KEY,
      JSON.stringify({
        config: grade,
        actions: OPENED,
        seed: 7,
        humans: ['blue'],
        level: 'lendario',
      }),
    )

    expect(readSaved()?.level).toBe('medium')
  })

  test('falls back to a single player rather than seating nobody', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ config: grade, actions: OPENED, seed: 7, humans: [], level: 'medium' }),
    )

    expect(readSaved()?.humans).toEqual(['blue'])
  })

  test('can be thrown away on request', () => {
    writeSaved({ match: opened(), seed: 7, humans: ['blue'], level: 'medium' })

    clearSaved()

    expect(readSaved()).toBeNull()
  })
})
