import { evaluate } from './evaluate'
import { applyAction, awaitingDraw, turn } from './match'
import type { Action, Match } from './match'
import { legalMoves } from './moves'
import { PIECES } from './types'
import type { Piece, Side } from './types'

/**
 * The search AI: what plays until a solution table has been downloaded, and
 * what supplies the lower difficulty levels afterwards (project doc 2.4).
 *
 * Branching is small — 1.45 under Rodizio, about 4.7 for whoever names under
 * Escolha Sorteada (spec 7.3) — so plain minimax reaches useful depth cheaply.
 *
 * A round waiting for its draw **is** the chance node: the search averages the
 * two initiatives rather than asking anyone what the draw will be. Nothing here
 * can peek, because after the change in project doc 2.3 there is nothing to peek
 * at — the initiative does not exist until it is drawn and recorded.
 */

/** Every action the match will accept right now, moves and passes only. */
export function legalActions(match: Match): Action[] {
  const current = turn(match)
  // A pending draw is nobody's decision, so it offers no actions.
  if (current === null) return []
  const { side, piece } = current
  const candidates: Piece[] = piece === null ? [...PIECES] : [piece]

  return candidates.flatMap((candidate) => {
    const moves = legalMoves(match.config.board, match.placement, side, candidate)
    // Naming a piece that cannot move is a real move under Escolha Sorteada:
    // you pass on purpose to force the opponent onto that symbol.
    if (moves.length === 0) return [{ type: 'pass', piece: candidate } as Action]
    return moves.map((to) => ({ type: 'move', piece: candidate, to }) as Action)
  })
}

function score(match: Match, depth: number, forSide: Side): number {
  if (match.result !== null || depth === 0) {
    return evaluate(match.config.board, match.placement, forSide)
  }
  if (awaitingDraw(match)) return averageOverDraw(match, depth, forSide)

  const maximising = turn(match)?.side === forSide
  let best = maximising ? -Infinity : Infinity

  for (const action of legalActions(match)) {
    const applied = applyAction(match, action)
    if (!applied.ok) continue
    const value = score(applied.match, depth - 1, forSide)
    best = maximising ? Math.max(best, value) : Math.min(best, value)
  }
  return Number.isFinite(best)
    ? best
    : evaluate(match.config.board, match.placement, forSide)
}

/**
 * The chance node: the initiative falls either way, 50/50, so both branches are
 * searched and averaged. It costs a doubling per round, which the low branching
 * absorbs easily (spec 7.3).
 */
function averageOverDraw(match: Match, depth: number, forSide: Side): number {
  const total = (['blue', 'orange'] as const).reduce((sum, initiative) => {
    const drawn = applyAction(match, { type: 'draw', initiative })
    return sum + (drawn.ok ? score(drawn.match, depth - 1, forSide) : 0)
  }, 0)
  return total / 2
}

/**
 * The action the AI would play. `depth` is the difficulty dial until the
 * tables exist; with them, level becomes a tolerance for error instead
 * (spec 6).
 */
export function chooseAction(match: Match, depth: number): Action {
  const side = turn(match)?.side
  if (side === undefined) throw new Error('the initiative has not been drawn yet')
  const actions = legalActions(match)

  let best = actions[0] as Action
  let bestScore = -Infinity
  for (const action of actions) {
    const applied = applyAction(match, action)
    if (!applied.ok) continue
    const value = score(applied.match, depth - 1, side)
    if (value > bestScore) {
      bestScore = value
      best = action
    }
  }
  return best
}
