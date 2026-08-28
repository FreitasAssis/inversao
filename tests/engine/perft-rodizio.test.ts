import { describe, expect, test } from 'vitest'
import { INITIAL } from '../../src/engine/board'
import { applyMove } from '../../src/engine/apply'
import { encodePlacement } from '../../src/engine/codec'
import { legalMoves } from '../../src/engine/moves'
import { hasWon } from '../../src/engine/outcome'
import { PIECES } from '../../src/engine/types'
import type { BoardCode, Placement, Side } from '../../src/engine/types'
import oracles from '../../data/oraculos.json'

/**
 * Node counts per depth, against the independent C implementation.
 *
 * The walk below is written from spec 4.2, not from `oraculos.c`: fixed cycle
 * circle -> triangle -> square, shared between both players, advancing on every
 * ply including passes, opening on the square. Two implementations of the same
 * paragraph agreeing is what makes this a contraproof rather than a copy.
 *
 * `perftNodes` counts children generated; `perftDistinctPositions` counts how
 * many are distinct. The gap between them is transpositions, and reproducing it
 * is a strong check that the state has exactly the right fields — a state
 * missing the cycle index, or carrying one field too many, collapses or splits
 * the wrong nodes.
 */

type Node = { placement: Placement; turn: Side; cycle: number }

const other = (side: Side): Side => (side === 'blue' ? 'orange' : 'blue')

/** Distinguishes states the way the table index does: position, turn, cycle. */
const key = (node: Node) =>
  encodePlacement(node.placement) * 6 + (node.turn === 'blue' ? 0 : 1) * 3 + node.cycle

function expand(board: BoardCode, node: Node): Node[] {
  if (hasWon(node.placement, 'blue') || hasWon(node.placement, 'orange')) return []

  const piece = PIECES[node.cycle] as (typeof PIECES)[number]
  const nextCycle = (node.cycle + 1) % 3
  const moves = legalMoves(board, node.placement, node.turn, piece)

  // A piece with nowhere to go forfeits the turn, and the cycle still advances.
  if (moves.length === 0) {
    return [{ placement: node.placement, turn: other(node.turn), cycle: nextCycle }]
  }
  return moves.map((to) => ({
    placement: applyMove(node.placement, node.turn, piece, to),
    turn: other(node.turn),
    cycle: nextCycle,
  }))
}

function perft(board: BoardCode, depth: number) {
  const nodes: number[] = []
  const distinct: number[] = []
  // The square opens (spec 4.2), so the cycle starts on index 2.
  let level: Node[] = [{ placement: INITIAL, turn: 'blue', cycle: 2 }]

  for (let d = 0; d < depth; d++) {
    const next = level.flatMap((node) => expand(board, node))
    nodes.push(next.length)
    distinct.push(new Set(next.map(key)).size)
    level = next
  }
  return { nodes, distinct }
}

describe('perft, Rodizio', () => {
  const boards = Object.entries(oracles.rodizio.boards) as [
    BoardCode,
    { label: string; perftNodes: number[]; perftDistinctPositions: number[] },
  ][]

  test.each(boards)('%s matches the C node counts', (code, expected) => {
    const got = perft(code, expected.perftNodes.length)

    expect(got.nodes).toEqual(expected.perftNodes)
    expect(got.distinct).toEqual(expected.perftDistinctPositions)
  })
})
