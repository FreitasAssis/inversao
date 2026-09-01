import { assess } from './lookup'
import type { Assessment } from './lookup'
import { applyAction, startMatch, turn } from './match'
import type { Match } from './match'
import type { Table } from './table'
import type { Side } from './types'

/**
 * Reading a finished match back, move by move (project doc 7.1).
 *
 * The table knows the exact value of every position, so the whole game can be
 * walked afterwards and the move where it turned can be pointed at. Chess
 * engines show this; the difference here is that the number is **true** rather
 * than estimated.
 *
 * This is also where the clock's adjudication ended up. Adjudicating decided a
 * result the player had no way to check, which is why it fell (spec 3.4).
 * Annotating decides nothing and explains what happened — the same table, the
 * same competence on display, and none of the incentive to game it. It is also
 * safe against the AI, unlike the live bar, because the game is already over.
 */

export type Moment = {
  /** How many actions had been played when this position stood. */
  ply: number
  assessment: Assessment
  /**
   * Who moved *into* this position, or null for the opening — and for a draw.
   *
   * The draw is the one action nobody chose, and it moves the value a long way:
   * from the average over both initiatives to whichever one landed. Charging
   * that to a player would make the coin the biggest blunder of most games.
   */
  mover: Side | null
  /** What that move cost its mover, 0 to 1. Null where nobody chose anything. */
  cost: number | null
}

export type Annotation = {
  moments: readonly Moment[]
  /** The single worst move, or null when nobody ever gave anything away. */
  turningPoint: Moment | null
}

/**
 * Null when there is nothing honest to say: a table for the other mechanic, or
 * a match whose opening position the table does not describe.
 */
export function annotate(match: Match, table: Table): Annotation | null {
  if ((table.kind === 'rotation') !== (match.config.mechanic === 'rotation')) return null

  let replay = startMatch(match.config, match.initial)
  const opening = assess(replay, table)
  if (opening === null) return null

  const moments: Moment[] = [{ ply: 0, assessment: opening, mover: null, cost: null }]
  let previous = opening

  for (const [index, action] of match.actions.entries()) {
    // Whose action this is has to be read *before* it is applied: afterwards the
    // selector has already handed the turn to somebody else.
    const acting = action.type === 'move' || action.type === 'pass' ? turn(replay)?.side : undefined

    const applied = applyAction(replay, action)
    if (!applied.ok) return null
    replay = applied.match

    const now = assess(replay, table) ?? settled(replay)
    const mover = acting ?? null
    moments.push({
      ply: index + 1,
      assessment: now,
      mover,
      cost: mover === null ? null : forSide(previous, mover) - forSide(now, mover),
    })
    previous = now
  }

  return { moments, turningPoint: worst(moments) }
}

/**
 * Where a decided match ends up. `assess` says nothing about a finished match —
 * correctly, since the result is on the screen — but the walk still needs a
 * final reading to charge the last move against.
 */
function settled(match: Match): Assessment {
  const result = match.result
  const winner =
    result?.kind === 'win' || result?.kind === 'resignation' || result?.kind === 'abandonment'
      ? result.winner
      : null
  return match.config.mechanic === 'rotation'
    ? { kind: 'verdict', winner, distance: 0 }
    : { kind: 'chance', blue: winner === null ? 0.5 : winner === 'blue' ? 1 : 0 }
}

/**
 * The position on one scale, from the given side's point of view: 1 is won, 0
 * is lost, and the middle is level.
 *
 * Both tables are **absolute** — P(azul vence), or "azul vence / laranja vence"
 * — so a rise is orange's loss and a fall is blue's. Reading one of the two
 * backwards is the classic failure of this kind of code.
 */
function forSide(assessment: Assessment, side: Side): number {
  const blue =
    assessment.kind === 'chance'
      ? assessment.blue
      : assessment.winner === null
        ? 0.5
        : assessment.winner === 'blue'
          ? 1
          : 0
  return side === 'blue' ? blue : 1 - blue
}

/** The costliest move of the match, or null when there was not one. */
function worst(moments: readonly Moment[]): Moment | null {
  let found: Moment | null = null
  for (const moment of moments) {
    if (moment.cost === null || moment.cost <= 0) continue
    if (found === null || moment.cost > (found.cost as number)) found = moment
  }
  return found
}
