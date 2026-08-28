import { describe, expect, test } from 'vitest'
import { ALL_PUZZLES, BOARD_ORDER, dayKey, puzzleFor, puzzlesFor } from '../../src/ui/puzzles'

/**
 * The daily puzzle, chosen by arithmetic instead of by a server (project doc
 * 8.3). Every player must see the same one on the same day, and the site is
 * static, so the day itself is the only input.
 *
 * The trap here is timezones. On local dates Brazil and Japan are on different
 * puzzles for most of a day, and a shared card would not match what the friend
 * opened — so the key is UTC and there is a test that says so out loud.
 */

describe('the puzzle list that ships in the build', () => {
  test('carries every board, so the daily one is not always the same game', () => {
    const boards = new Set(ALL_PUZZLES.map((puzzle) => puzzle.board))

    expect(boards).toEqual(new Set(['nbn', 'bbb', 'dbu']))
  })

  test('carries all three difficulty bands', () => {
    // Quota, not uniform sampling: the 5-10 point band alone is 69% of the raw
    // set, so an even sample made almost every day the hard day (project 8.2).
    const tiers = new Set(ALL_PUZZLES.map((puzzle) => puzzle.tier))

    expect(tiers).toEqual(new Set(['sharp', 'subtle', 'clear']))
  })

  test('never places two pieces on the same cell', () => {
    for (const puzzle of ALL_PUZZLES) {
      const taken = [...puzzle.blue, ...puzzle.orange]
      expect(new Set(taken).size, JSON.stringify(taken)).toBe(6)
    }
  })

  test('writes a passing move as null, never as a cell outside the board', () => {
    // Naming a piece with no legal move is a real move — you pass on purpose to
    // force the opponent onto that symbol. `-1` would slip through a Cell type
    // unnoticed; null makes every consumer deal with it (project doc 8.3).
    for (const { best, second } of ALL_PUZZLES) {
      for (const move of [best, second]) {
        expect(move.pass ? move.to : 0, JSON.stringify(move)).not.toBe(-1)
        if (move.pass) expect(move.to).toBeNull()
        else expect(typeof move.to).toBe('number')
      }
    }
  })

  test('always has a best move worth finding', () => {
    // The extraction floor is five points of win probability. Below that the
    // puzzle has no answer to be right about.
    for (const puzzle of ALL_PUZZLES) {
      expect(puzzle.margin, JSON.stringify(puzzle.best)).toBeGreaterThanOrEqual(0.048)
    }
  })
})

describe('choosing the puzzles of the day', () => {
  const at = (iso: string) => new Date(`${iso}T12:00:00Z`)

  test('reads the day in UTC, so nobody is a day ahead of anybody', () => {
    // 23:00 in Tokyo on the 2nd is still the 1st in UTC. On local dates the two
    // players would be on different puzzles and the shared card would not match.
    expect(dayKey(new Date('2026-01-01T23:30:00Z'))).toBe('2026-01-01')
    expect(dayKey(new Date('2026-01-01T00:30:00Z'))).toBe('2026-01-01')
  })

  test('offers one of every board, every day', () => {
    // Three rather than one, because the boards are the thing worth showing: a
    // single daily puzzle would give somebody two months of one topology.
    const today = puzzlesFor(at('2026-03-14'))

    expect(today.map((puzzle) => puzzle.board)).toEqual([...BOARD_ORDER])
  })

  test('gives everybody the same three on the same day', () => {
    const morning = puzzlesFor(new Date('2026-03-14T01:00:00Z'))
    const evening = puzzlesFor(new Date('2026-03-14T22:59:00Z'))

    expect(morning).toEqual(evening)
  })

  test('gives different ones tomorrow, on every board', () => {
    for (const board of BOARD_ORDER) {
      expect(puzzleFor(board, at('2026-03-14')), board).not.toBe(
        puzzleFor(board, at('2026-03-15')),
      )
    }
  })

  test('does not march the three boards in step', () => {
    // Seeded per board. Otherwise the same position in each list comes up on
    // the same day forever, which is a pattern somebody would eventually see.
    const positions = BOARD_ORDER.map((board) => {
      const list = ALL_PUZZLES.filter((puzzle) => puzzle.board === board)
      return list.indexOf(puzzleFor(board, at('2026-03-14')))
    })

    expect(new Set(positions).size).toBeGreaterThan(1)
  })

  test('always finds one, however far out the date', () => {
    for (const iso of ['1999-12-31', '2026-08-26', '2100-06-15']) {
      expect(puzzlesFor(at(iso))).toHaveLength(3)
    }
  })
})

describe('how often a puzzle comes back', () => {
  const dayAfter = (start: string, days: number) =>
    new Date(new Date(`${start}T12:00:00Z`).getTime() + days * 86_400_000)

  const sizeOf = (board: (typeof BOARD_ORDER)[number]) =>
    ALL_PUZZLES.filter((puzzle) => puzzle.board === board).length

  test('shows every puzzle of a board once before showing any of them twice', () => {
    // The obvious `hash(date) % size` draws with replacement, and measured on
    // these 180 the first repeat landed on day 51 while six never came up at
    // all in two years. A cycle costs the same and cannot do that.
    for (const board of BOARD_ORDER) {
      const seen = new Set<unknown>()
      for (let day = 0; day < sizeOf(board); day++) {
        seen.add(puzzleFor(board, dayAfter('2026-01-01', day)))
      }

      expect(seen.size, board).toBe(sizeOf(board))
    }
  })

  test('comes back around once the list is exhausted, and not before', () => {
    const board = BOARD_ORDER[0] as (typeof BOARD_ORDER)[number]
    const size = sizeOf(board)
    const first = puzzleFor(board, dayAfter('2026-01-01', 0))

    expect(puzzleFor(board, dayAfter('2026-01-01', size))).toBe(first)
    expect(puzzleFor(board, dayAfter('2026-01-01', size - 1))).not.toBe(first)
  })

  test('does not simply walk a list in order', () => {
    // Each list is ordered by tier, so walking it would hand somebody twenty
    // days of one difficulty in a row.
    const board = BOARD_ORDER[0] as (typeof BOARD_ORDER)[number]
    const list = ALL_PUZZLES.filter((puzzle) => puzzle.board === board)
    const week = [0, 1, 2, 3, 4, 5, 6].map((day) =>
      list.indexOf(puzzleFor(board, dayAfter('2026-01-01', day))),
    )
    const consecutive = week.slice(1).filter((index, i) => index === (week[i] as number) + 1)

    expect(consecutive.length).toBeLessThan(3)
  })
})
