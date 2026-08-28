import { applyAction, turn } from './match'
import type { Action, Match } from './match'
import { legalActions } from './search'
import { choiceState, rotationState } from './table'
import type { ChoiceTable, RotationTable, Table } from './table'
import type { Side } from './types'

/**
 * Playing by consulting a solved table instead of searching (spec 6).
 *
 * The whole space is on the device, so there is no tree to walk: value every
 * legal action by what the table says about where it lands, and take the best
 * one. Perfect play at the cost of one lookup per move.
 *
 * Both tables are **absolute** — P(azul vence), or "azul vence / laranja vence"
 * — never relative to whoever is moving. That is what lets one table serve both
 * players, and it is why the values are flipped here rather than there. Getting
 * this backwards is the classic failure of this kind of code, and the reason
 * project doc 2.4 records the same trap in the generator itself.
 */

export type Fallibility = {
  /**
   * Escolha Sorteada: how much win probability the level may give away, as a
   * fraction. 0,20 is Facil, 0 is flawless (spec 6).
   */
  tolerance?: number
  /** Rodizio: how often the level plays the second best on purpose. */
  slip?: number
  /** Seeded by the caller, so a local match stays reproducible. */
  random?: () => number
}

/** Bands wide enough that a distance can never cross from one into another. */
const WIN = 2_000_000
const DRAW = 1_000_000

export function chooseByLookup(match: Match, table: Table, how: Fallibility = {}): Action {
  const mover = turn(match)?.side
  if (mover === undefined) throw new Error('the initiative has not been drawn yet')
  if ((table.kind === 'rotation') !== (match.config.mechanic === 'rotation')) {
    throw new Error('that table belongs to the other mechanic')
  }

  const ranked = legalActions(match)
    .map((action) => {
      const applied = applyAction(match, action)
      return applied.ok ? { action, key: keyOf(applied.match, table, mover) } : null
    })
    .filter((entry) => entry !== null)
    // Stable, so ties keep the order the actions were enumerated in and the
    // same position always produces the same move.
    .sort((a, b) => b.key - a.key)

  const best = ranked[0]
  if (best === undefined) throw new Error('no legal action to choose from')
  const second = ranked[1]
  if (second === undefined) return best.action

  // Erring is playing the second best, never playing at random: that is what
  // makes a weak level look like a person rather than like a fault (spec 6).
  if (table.kind === 'rotation') {
    const slip = how.slip ?? 0
    const random = how.random ?? Math.random
    return slip > 0 && random() < slip ? second.action : best.action
  }
  return best.key - second.key <= (how.tolerance ?? 0) ? second.action : best.action
}

/**
 * What the table says about a position, for a player to look at (project doc 9).
 *
 * Null when there is nothing honest to say: a table for the other mechanic, or
 * a match that is already decided and has its result on the screen.
 *
 * This is the same reading the AI does to choose, exposed rather than
 * duplicated — a second implementation of "what is this position worth" would
 * be a second chance to get the absolute-versus-relative trap wrong.
 */
export type Assessment =
  | { kind: 'chance'; blue: number }
  | { kind: 'verdict'; winner: Side | null; distance: number }

export function assess(match: Match, table: Table): Assessment | null {
  if (match.result !== null) return null
  if ((table.kind === 'rotation') !== (match.config.mechanic === 'rotation')) return null

  if (table.kind === 'choice') return { kind: 'chance', blue: blueChance(match, table) }
  if (match.selector.kind !== 'rotation') return null

  const { side, cycle } = match.selector.state
  const state = rotationState(match.placement, side, cycle)
  const verdict = table.verdict(state)
  return {
    kind: 'verdict',
    winner: verdict === 'draw' ? null : verdict,
    distance: verdict === 'draw' ? 0 : table.distance(state),
  }
}

/** How good the position after an action is *for the mover*. Higher is better. */
function keyOf(applied: Match, table: Table, mover: Side): number {
  return table.kind === 'rotation'
    ? rotationKey(applied, table, mover)
    : chanceFor(applied, table, mover)
}

function rotationKey(applied: Match, table: RotationTable, mover: Side): number {
  // The move that finished the game: nothing the table holds can beat it.
  if (applied.result?.kind === 'win') {
    return applied.result.winner === mover ? WIN : 0
  }
  if (applied.result !== null) return DRAW
  if (applied.selector.kind !== 'rotation') throw new Error('not a Rodizio match')

  const { side, cycle } = applied.selector.state
  const state = rotationState(applied.placement, side, cycle)
  const verdict = table.verdict(state)
  if (verdict === 'draw') return DRAW

  // Winning, take the shortest. Losing, take the longest — which is the only
  // reason the table carries a distance at all. Without it every losing move
  // scores the same and the AI walks straight into the loss it could postpone.
  return verdict === mover ? WIN - table.distance(state) : table.distance(state)
}

function chanceFor(applied: Match, table: ChoiceTable, mover: Side): number {
  const blue = blueChance(applied, table)
  return mover === 'blue' ? blue : 1 - blue
}

function blueChance(applied: Match, table: ChoiceTable): number {
  if (applied.result?.kind === 'win') return applied.result.winner === 'blue' ? 1 : 0
  if (applied.result !== null) return 0.5
  if (applied.selector.kind !== 'choice') throw new Error('not an Escolha Sorteada match')

  const { initiative, named } = applied.selector.state

  // Between rounds the initiative does not exist yet — it is drawn, and nobody
  // may look ahead at it (project doc 2.3). So the position is worth the average
  // of the two ways it can fall, which is what the solver itself iterates on.
  if (initiative === null) {
    const asBlue = table.chance(choiceState(applied.placement, 'blue', null))
    const asOrange = table.chance(choiceState(applied.placement, 'orange', null))
    return (asBlue + asOrange) / 2
  }
  return table.chance(choiceState(applied.placement, initiative, named))
}
