import { BOARD_CODES, neighbours } from './board'
import type { BoardCode, Cell } from './types'

/**
 * Shortest number of steps from one cell to another, by breadth-first search on
 * the **directed** graph (project doc 2.4).
 *
 * The direction matters: on Setas `3 -> 6` costs one step and `6 -> 3` costs
 * several, because the column only runs downwards. Treating the graph as
 * undirected would make the evaluation think a piece can come back the way it
 * went, which is exactly the mistake that board is built to punish.
 *
 * Computed once per board over the empty grid. Pieces are ignored on purpose:
 * this feeds a search that will visit thousands of positions, and recomputing
 * per position would cost more than the search it is guiding. It is a
 * heuristic, not a route.
 */

const UNREACHABLE = Infinity

function tableFor(board: BoardCode): readonly (readonly number[])[] {
  return Array.from({ length: 12 }, (_, from) => {
    const steps = new Array<number>(12).fill(UNREACHABLE)
    steps[from] = 0
    let frontier: Cell[] = [from as Cell]
    let depth = 0
    while (frontier.length > 0) {
      depth++
      const next: Cell[] = []
      for (const cell of frontier) {
        for (const neighbour of neighbours(board, cell)) {
          if (steps[neighbour] === UNREACHABLE) {
            steps[neighbour] = depth
            next.push(neighbour)
          }
        }
      }
      frontier = next
    }
    return steps
  })
}

const TABLES: Readonly<Record<BoardCode, readonly (readonly number[])[]>> = Object.freeze(
  Object.fromEntries(BOARD_CODES.map((code) => [code, tableFor(code)])) as Record<
    BoardCode,
    readonly (readonly number[])[]
  >,
)

export function distance(board: BoardCode, from: Cell, to: Cell): number {
  return TABLES[board][from]?.[to] ?? UNREACHABLE
}
