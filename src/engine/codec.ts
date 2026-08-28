import type { Cell, Placement } from './types'

/**
 * Compact index of a placement of the six pieces on the twelve cells.
 *
 * The order is the one the C solvers enumerate (12P6, lexicographic over the
 * tuple blue-circle, blue-triangle, blue-square, orange-circle, orange-triangle,
 * orange-square). **The engine must reproduce it exactly**: every solution table
 * is indexed by it, so an off-by-one enumeration makes each lookup return some
 * other position's value — the AI plays badly with no visible symptom. The codec
 * oracle exists to catch that (project doc 2.5, 2.6).
 */

const CELLS = 12
const SLOTS = 6

/** WEIGHTS[k] = how many placements share a prefix of length k+1, i.e. P(11-k, 5-k). */
const WEIGHTS: readonly number[] = (() => {
  const w: number[] = []
  for (let k = 0; k < SLOTS; k++) {
    let p = 1
    for (let i = 0; i < SLOTS - 1 - k; i++) p *= CELLS - 1 - k - i
    w.push(p)
  }
  return w
})()

/** Total number of distinct placements: 12P6. */
export const PLACEMENT_COUNT = CELLS * (WEIGHTS[0] as number)

function slots(p: Placement): readonly Cell[] {
  return [p.blue[0], p.blue[1], p.blue[2], p.orange[0], p.orange[1], p.orange[2]]
}

export function encodePlacement(placement: Placement): number {
  const cells = slots(placement)
  const used = new Array<boolean>(CELLS).fill(false)
  let index = 0
  for (let k = 0; k < SLOTS; k++) {
    const cell = cells[k] as Cell
    let smallerFree = 0
    for (let c = 0; c < cell; c++) if (!used[c]) smallerFree++
    index += smallerFree * (WEIGHTS[k] as number)
    used[cell] = true
  }
  return index
}

export function decodePlacement(index: number): Placement {
  const used = new Array<boolean>(CELLS).fill(false)
  const cells: Cell[] = []
  let rest = index
  for (let k = 0; k < SLOTS; k++) {
    const weight = WEIGHTS[k] as number
    let rank = Math.floor(rest / weight)
    rest -= rank * weight
    // Take the cell `rank` positions along the still-free ones.
    let cell = 0
    for (;;) {
      while (used[cell]) cell++
      if (rank === 0) break
      rank--
      cell++
    }
    cells.push(cell as Cell)
    used[cell] = true
  }
  return {
    blue: [cells[0] as Cell, cells[1] as Cell, cells[2] as Cell],
    orange: [cells[3] as Cell, cells[4] as Cell, cells[5] as Cell],
  }
}
