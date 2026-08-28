import type { BoardCode, Cell, Placement } from './types'

/**
 * The three boards. They share everything except the middle band — the three
 * links that cross the middle of the grid (spec 1.1 and 1.2).
 */

export const BOARD_CODES = ['nbn', 'bbb', 'dbu'] as const

/** Fourteen two-way edges, present on all three boards (spec 1.1). */
const SHARED: readonly (readonly [Cell, Cell])[] = [
  [0, 1], [1, 2], [3, 4], [4, 5], [6, 7], [7, 8], [9, 10], [10, 11],
  [0, 3], [1, 4], [2, 5],
  [6, 9], [7, 10], [8, 11],
]

/** The middle band, one entry per column; the board code says how each links. */
const MIDDLE: readonly (readonly [Cell, Cell])[] = [
  [3, 6],
  [4, 7],
  [5, 8],
]

function build(code: BoardCode): readonly (readonly Cell[])[] {
  const out: Cell[][] = Array.from({ length: 12 }, () => [])
  const add = (from: Cell, to: Cell) => (out[from] as Cell[]).push(to)

  for (const [a, b] of SHARED) {
    add(a, b)
    add(b, a)
  }
  MIDDLE.forEach(([upper, lower], column) => {
    const link = code[column]
    if (link === 'd' || link === 'b') add(upper, lower)
    if (link === 'u' || link === 'b') add(lower, upper)
  })

  return out.map((cells) => Object.freeze(cells))
}

const ADJACENCY: Readonly<Record<BoardCode, readonly (readonly Cell[])[]>> = Object.freeze({
  nbn: build('nbn'),
  bbb: build('bbb'),
  dbu: build('dbu'),
})

/** Cells reachable from `from` in one move, respecting one-way columns. */
export function neighbours(board: BoardCode, from: Cell): readonly Cell[] {
  return ADJACENCY[board][from] as readonly Cell[]
}

/** How one column of the middle band crosses, if it crosses at all. */
export type Link = 'none' | 'both' | 'down' | 'up'

/**
 * The middle band is the only thing that separates the three boards, so the
 * interface has to be able to draw it. Left implicit, three different games
 * render as the same twelve squares and the rule stays invisible (spec 1.2).
 */
export function middleLink(board: BoardCode, column: number): Link {
  switch (board[column]) {
    case 'b':
      return 'both'
    case 'd':
      return 'down'
    case 'u':
      return 'up'
    default:
      return 'none'
  }
}

/** The pair of cells one column of the band would join. */
export function middleCells(column: number): readonly [Cell, Cell] {
  return MIDDLE[column] as readonly [Cell, Cell]
}

/** Starting cells, indexed circle, triangle, square (spec 2.1). */
export const INITIAL: Placement = Object.freeze({
  blue: Object.freeze([2, 1, 0]),
  orange: Object.freeze([9, 10, 11]),
}) as Placement

/**
 * Where each piece has to end up — the "cycle B" targets (spec 2.2). No piece
 * finishes in the column it started in.
 */
export const TARGETS: Placement = Object.freeze({
  blue: Object.freeze([9, 11, 10]),
  orange: Object.freeze([2, 0, 1]),
}) as Placement
