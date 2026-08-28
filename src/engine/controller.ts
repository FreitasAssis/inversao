import { initiativeFrom } from './draw'
import { chooseByLookup } from './lookup'
import type { Fallibility } from './lookup'
import type { Action, Match } from './match'
import { chooseAction } from './search'
import type { Table } from './table'

/**
 * A side is a controller: give it the match, get back a promise of an action.
 *
 * A human resolves it on tap, the AI after its search, a remote player when the
 * message lands — one shape for all three. A synchronous loop would have to be
 * rewritten end to end to add the network later (project doc 2.2, decision 1).
 *
 * Nothing here knows about React, the DOM or a socket.
 */
export type Controller = (match: Match) => Promise<Action>

/**
 * The search AI. `depth` is the difficulty dial while there is no solution
 * table; with one, level becomes a tolerance for error in percentage points
 * instead (spec 6).
 */
export function aiController(depth: number): Controller {
  return async (match) => chooseAction(match, depth)
}

/**
 * The table AI: no search at all, one lookup per move (spec 6).
 *
 * Same shape as the search one, so swapping it in when a download finishes
 * changes nothing about the match loop — which is the point of decision 1 in
 * project doc 2.2 and the reason it was made before any of this existed.
 */
export function lookupController(table: Table, how: Fallibility): Controller {
  return async (match) => chooseByLookup(match, table, how)
}

/**
 * Supplies the initiative for a round waiting on its draw — **local play only**.
 *
 * Seeded so a local game can be replayed and debugged. The seed must never
 * reach an opponent: one that both sides know lets either of them read the
 * schedule of every future draw, which is what commit-and-reveal exists to
 * prevent (project doc 2.3).
 */
export function drawController(seed: number): Controller {
  const initiativeFor = initiativeFrom(seed)
  return async (match) => {
    const round = match.selector.kind === 'choice' ? match.selector.state.round : 0
    return { type: 'draw', initiative: initiativeFor(round) }
  }
}
