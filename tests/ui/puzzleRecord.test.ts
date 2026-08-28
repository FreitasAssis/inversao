import { beforeEach, describe, expect, test } from 'vitest'
import {
  answersOn,
  readPuzzleRecord,
  recordAnswer,
  streaksOf,
} from '../../src/ui/puzzleRecord'

/**
 * What makes somebody come back tomorrow (project doc 8.4).
 *
 * Two streaks, not one. With three puzzles a day, "all three correct" breaks so
 * easily that it would spend most of its life at zero — and a counter that is
 * usually zero stops being a reason to return. So one counts days you showed
 * up for, and the other counts days you were perfect: the first is the habit,
 * the second is the thing worth bragging about.
 *
 * Nothing leaves the device, and there is no account anywhere.
 */

const day = (iso: string) => `2026-03-${iso}`

describe('the puzzle record', () => {
  beforeEach(() => localStorage.clear())

  test('starts with nothing and no streak', () => {
    expect(answersOn(readPuzzleRecord(), day('14'))).toEqual({})
    expect(streaksOf(readPuzzleRecord(), day('14'))).toEqual({ attempted: 0, perfect: 0 })
  })

  test('remembers an answer, so a reload cannot re-ask it', () => {
    // The whole point of a daily puzzle is one attempt. Reopening the tab has
    // to be worth nothing.
    const after = recordAnswer(readPuzzleRecord(), day('14'), 'bbb', true)

    expect(answersOn(after, day('14'))).toEqual({ bbb: true })
  })

  test('keeps a wrong answer as an answer, not as a blank', () => {
    const after = recordAnswer(readPuzzleRecord(), day('14'), 'bbb', false)

    expect(answersOn(after, day('14')).bbb).toBe(false)
  })

  test('survives the tab being closed between two of the three', () => {
    recordAnswer(readPuzzleRecord(), day('14'), 'nbn', true)
    recordAnswer(readPuzzleRecord(), day('14'), 'bbb', false)

    expect(answersOn(readPuzzleRecord(), day('14'))).toEqual({ nbn: true, bbb: false })
  })

  test('counts a day only once all three have been faced', () => {
    let record = readPuzzleRecord()
    for (const board of ['nbn', 'bbb'] as const) {
      record = recordAnswer(record, day('14'), board, true)
    }
    expect(streaksOf(record, day('14')).attempted).toBe(0)

    record = recordAnswer(record, day('14'), 'dbu', false)
    expect(streaksOf(record, day('14')).attempted).toBe(1)
  })

  test('counts a perfect day only when all three were right', () => {
    let record = readPuzzleRecord()
    record = recordAnswer(record, day('14'), 'nbn', true)
    record = recordAnswer(record, day('14'), 'bbb', true)
    record = recordAnswer(record, day('14'), 'dbu', false)

    expect(streaksOf(record, day('14'))).toEqual({ attempted: 1, perfect: 0 })
  })

  test('runs the streak back through consecutive days', () => {
    let record = readPuzzleRecord()
    for (const date of ['12', '13', '14']) {
      for (const board of ['nbn', 'bbb', 'dbu'] as const) {
        record = recordAnswer(record, day(date), board, true)
      }
    }

    expect(streaksOf(record, day('14'))).toEqual({ attempted: 3, perfect: 3 })
  })

  test('breaks on a day that was skipped entirely', () => {
    let record = readPuzzleRecord()
    for (const date of ['11', '13', '14']) {
      for (const board of ['nbn', 'bbb', 'dbu'] as const) {
        record = recordAnswer(record, day(date), board, true)
      }
    }

    expect(streaksOf(record, day('14')).attempted).toBe(2)
  })

  test('does not punish the player for today being unfinished', () => {
    // Opening the page at breakfast must not show a streak of zero. Until today
    // is complete the count is whatever it was through yesterday.
    let record = readPuzzleRecord()
    for (const date of ['12', '13']) {
      for (const board of ['nbn', 'bbb', 'dbu'] as const) {
        record = recordAnswer(record, day(date), board, true)
      }
    }
    record = recordAnswer(record, day('14'), 'nbn', true)

    expect(streaksOf(record, day('14')).attempted).toBe(2)
  })

  test('does not carry a streak across a day that was missed', () => {
    let record = readPuzzleRecord()
    for (const board of ['nbn', 'bbb', 'dbu'] as const) {
      record = recordAnswer(record, day('10'), board, true)
    }

    expect(streaksOf(record, day('14')).attempted).toBe(0)
  })

  test('cannot grow without bound', () => {
    // A year of daily entries is fine; forever is not. Old days are pruned once
    // they are far enough back to have no bearing on any streak.
    let record = readPuzzleRecord()
    for (let i = 0; i < 400; i++) {
      const date = new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10)
      record = recordAnswer(record, date, 'bbb', true)
    }

    expect(Object.keys(record.days).length).toBeLessThanOrEqual(120)
  })

  test('falls back rather than taking the page down with a corrupt store', () => {
    localStorage.setItem('inversao:puzzles', 'not json at all')

    expect(answersOn(readPuzzleRecord(), day('14'))).toEqual({})
  })
})
