import file from '../../data/puzzles.json'
import type { BoardCode, Cell, Piece, Placement } from '../engine/types'

/**
 * The daily puzzle (project doc 8).
 *
 * Probably the best return on effort in the whole project, and possibly the
 * main attraction rather than an extra: a full match asks somebody to learn an
 * unknown game and spend minutes on it, while a puzzle asks thirty seconds and
 * answers clearly.
 *
 * It is cheap because the puzzles are **extracted from the solution table, not
 * written by hand** — content that never runs out and is never wrong. No
 * unsolved game can do that.
 *
 * Everybody must see the same puzzle on the same day, and the site is static.
 * The answer is arithmetic, not infrastructure: hash the UTC date and index the
 * list that ships in the build. Zero requests, no server, identical for
 * everyone. **Do not invent an endpoint for this** — it would break the static
 * promise for nothing.
 */

/** A move, or a deliberate pass: naming a piece that has nowhere to go. */
export type PuzzleMove = {
  symbol: Piece
  /** Null exactly when `pass`. Never a cell outside the board (project 8.3). */
  to: Cell | null
  pass: boolean
}

export type Puzzle = {
  board: BoardCode
  boardLabel: string
  blue: readonly [Cell, Cell, Cell]
  orange: readonly [Cell, Cell, Cell]
  best: PuzzleMove
  second: PuzzleMove
  /** P(blue wins) after the best and the second best move. */
  value: number
  secondValue: number
  /**
   * The gap between them. **Not** `value - secondValue`: all three are rounded
   * separately from the solver's doubles and drift by up to 1e-4. Use this one;
   * do not recompute it (project doc 8.3).
   */
  margin: number
  /** Whether the puzzle asks which piece to name, or where to move it. */
  question: 'piece' | 'destination'
  tier: 'sharp' | 'subtle' | 'clear'
}

type Raw = { board: BoardCode; label: string; puzzles: Omit<Puzzle, 'board' | 'boardLabel'>[] }

/** In the order they are offered each day, so the page never reshuffles itself. */
export const BOARD_ORDER: readonly BoardCode[] = ['nbn', 'bbb', 'dbu']

const BY_BOARD: ReadonlyMap<BoardCode, readonly Puzzle[]> = new Map(
  (file.boards as unknown as Raw[]).map((entry) => [
    entry.board,
    entry.puzzles.map((puzzle) => ({ ...puzzle, board: entry.board, boardLabel: entry.label })),
  ]),
)

/** Every puzzle in the build, for checks about the data rather than the day. */
export const ALL_PUZZLES: readonly Puzzle[] = BOARD_ORDER.flatMap(
  (board) => BY_BOARD.get(board) ?? [],
)

/** The position a puzzle starts from, in the shape the engine wants. */
export function placementOf(puzzle: Puzzle): Placement {
  return { blue: puzzle.blue, orange: puzzle.orange }
}

/**
 * The day, in UTC. Local dates would put Brazil and Japan on different puzzles
 * for most of every day, and a shared card would not match what the friend
 * opened.
 */
export function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/** Whole days since the epoch, in UTC. Negative before 1970, which is fine. */
export function dayNumber(now: Date): number {
  return Math.floor(now.getTime() / 86_400_000)
}

/** SplitMix32, the same mixer the initiative draw uses. */
function mix(value: number): number {
  let z = (value + 0x9e3779b9) | 0
  z ^= z >>> 16
  z = Math.imul(z, 0x21f0aaad)
  z ^= z >>> 15
  z = Math.imul(z, 0x735a2d97)
  z ^= z >>> 15
  return z >>> 0
}

/**
 * A fixed shuffle of one board's puzzles, walked one step a day.
 *
 * The obvious version — `list[hash(date) % size]` — draws **with replacement**,
 * and that is much worse than it sounds. Measured on the 180 that ship today:
 * the first repeat landed on day 51, only 110 of the 180 appeared in the first
 * six months, and over two years six never came up at all while one came up
 * nine times. For something whose whole promise is "there is a new one
 * tomorrow", that is a defect rather than a rounding error.
 *
 * A cycle costs the same and cannot do it: every puzzle appears once before any
 * appears twice. The order still looks arbitrary, because it is shuffled — only
 * the repetition becomes orderly.
 *
 * Seeded per board, so the three do not march in step.
 */
function cycleFor(board: BoardCode, size: number): number[] {
  const order = Array.from({ length: size }, (_, index) => index)
  let state = 20260826 + board.charCodeAt(0) * 7919
  for (let i = size - 1; i > 0; i--) {
    state = mix(state)
    const j = state % (i + 1)
    ;[order[i], order[j]] = [order[j] as number, order[i] as number]
  }
  return order
}

const CYCLES: ReadonlyMap<BoardCode, readonly number[]> = new Map(
  BOARD_ORDER.map((board) => [board, cycleFor(board, (BY_BOARD.get(board) ?? []).length)]),
)

/**
 * The three puzzles of the day, one per board.
 *
 * Three rather than one because the boards are the thing worth showing: a
 * single daily puzzle would give somebody two months of one topology before
 * they met another. The cost is that a "day" now has three answers, which the
 * page and the shared card both have to say something about.
 */
export function puzzlesFor(now: Date): readonly Puzzle[] {
  return BOARD_ORDER.map((board) => puzzleFor(board, now))
}

export function puzzleFor(board: BoardCode, now: Date): Puzzle {
  const list = BY_BOARD.get(board) ?? []
  const cycle = CYCLES.get(board) ?? []
  const day = ((dayNumber(now) % cycle.length) + cycle.length) % cycle.length
  return list[cycle[day] as number] as Puzzle
}
