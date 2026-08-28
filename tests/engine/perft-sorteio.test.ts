import { describe, expect, test } from 'vitest'
import { INITIAL } from '../../src/engine/board'
import { applyMove } from '../../src/engine/apply'
import { encodePlacement } from '../../src/engine/codec'
import { legalMoves } from '../../src/engine/moves'
import { hasWon } from '../../src/engine/outcome'
import { PIECES } from '../../src/engine/types'
import type { BoardCode, Piece, Placement, Side } from '../../src/engine/types'
import oracles from '../../data/oraculos.json'

/**
 * Node counts per depth for the default mechanic, against the C.
 *
 * Written from spec 4.1: initiative is drawn, whoever holds it names a symbol
 * and moves that piece, and the opponent is then forced to move the piece of
 * the same symbol. Either side passes if its piece has nowhere to go.
 *
 * The draw itself is replaced by an explicit chance node with two branches, so
 * the tree is deterministic to enumerate. That is a convention of the oracle,
 * not a rule of the game (project doc 2.5) — and it is why the engine has to let
 * the initiative be injected rather than rolled internally.
 *
 * This is also where double moves show up: whoever responds in one round can win
 * the initiative in the next and move twice running. Getting that wrong is the
 * trap spec 3.3 warns about.
 */

type Phase =
  | { kind: 'chance' }
  | { kind: 'name'; initiative: Side }
  | { kind: 'respond'; initiative: Side; piece: Piece }

type Node = { placement: Placement; phase: Phase }

const SIDES = ['blue', 'orange'] as const
const other = (side: Side): Side => (side === 'blue' ? 'orange' : 'blue')
const sideIndex = (side: Side) => (side === 'blue' ? 0 : 1)

/** Same state identity the C uses: position, then which of the nine phases. */
function key(node: Node): number {
  const { phase } = node
  const slot =
    phase.kind === 'chance'
      ? 0
      : phase.kind === 'name'
        ? 1 + sideIndex(phase.initiative)
        : 3 + sideIndex(phase.initiative) * 3 + PIECES.indexOf(phase.piece)
  return encodePlacement(node.placement) * 10 + slot
}

function expand(board: BoardCode, node: Node): Node[] {
  if (hasWon(node.placement, 'blue') || hasWon(node.placement, 'orange')) return []
  const { placement, phase } = node

  if (phase.kind === 'chance') {
    return SIDES.map((initiative) => ({ placement, phase: { kind: 'name', initiative } }))
  }

  if (phase.kind === 'name') {
    // Naming a piece that cannot move is legal, and is the game's sharpest
    // move: you pass on purpose to force the opponent to shift that symbol.
    return PIECES.flatMap((piece) => {
      const next: Phase = { kind: 'respond', initiative: phase.initiative, piece }
      const moves = legalMoves(board, placement, phase.initiative, piece)
      if (moves.length === 0) return [{ placement, phase: next }]
      return moves.map((to) => ({
        placement: applyMove(placement, phase.initiative, piece, to),
        phase: next,
      }))
    })
  }

  const responder = other(phase.initiative)
  const moves = legalMoves(board, placement, responder, phase.piece)
  const next: Phase = { kind: 'chance' }
  if (moves.length === 0) return [{ placement, phase: next }]
  return moves.map((to) => ({
    placement: applyMove(placement, responder, phase.piece, to),
    phase: next,
  }))
}

function perft(board: BoardCode, depth: number) {
  const nodes: number[] = []
  const distinct: number[] = []
  let level: Node[] = [{ placement: INITIAL, phase: { kind: 'chance' } }]

  for (let d = 0; d < depth; d++) {
    const next = level.flatMap((node) => expand(board, node))
    nodes.push(next.length)
    distinct.push(new Set(next.map(key)).size)
    level = next
  }
  return { nodes, distinct }
}

describe('perft, Escolha Sorteada', () => {
  const boards = Object.entries(oracles.escolhaSorteada.boards) as [
    BoardCode,
    { label: string; perftNodes: number[]; perftDistinctPositions: number[] },
  ][]

  test.each(boards)('%s matches the C node counts', (code, expected) => {
    const got = perft(code, expected.perftNodes.length)

    expect(got.nodes).toEqual(expected.perftNodes)
    expect(got.distinct).toEqual(expected.perftDistinctPositions)
  })
})
