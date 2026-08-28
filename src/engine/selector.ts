import { PIECES } from './types'
import type { Piece, Side } from './types'

/**
 * Who decides which piece moves. This is the only thing that separates the two
 * mechanics (spec 4), so it is one interface with two implementations rather
 * than two games.
 */

/** The turn about to be played. `piece: null` means the mover names it. */
export type Turn = { side: Side; piece: Piece | null }

export interface Mechanic<S> {
  /** Null when the mechanic is waiting on something else, such as a draw. */
  turn(state: S): Turn | null
  /** State after `piece` was moved or passed with. */
  advance(state: S, piece: Piece): S
}

const other = (side: Side): Side => (side === 'blue' ? 'orange' : 'blue')

/**
 * Rodizio: fixed cyclic order, shared by both players, advancing on every ply
 * including passes (spec 4.2). Nobody chooses.
 */
export type RotationState = { side: Side; cycle: number }

export const rotation = {
  opening(piece: Piece = 'square'): RotationState {
    return { side: 'blue', cycle: PIECES.indexOf(piece) }
  },
  turn(state: RotationState): Turn {
    return { side: state.side, piece: PIECES[state.cycle] as Piece }
  },
  advance(state: RotationState): RotationState {
    return { side: other(state.side), cycle: (state.cycle + 1) % 3 }
  },
} satisfies Mechanic<RotationState> & {
  opening(piece?: Piece): RotationState
}

/**
 * Escolha Sorteada: the initiative is drawn each round, whoever holds it names
 * a symbol and moves that piece, and the opponent is then forced to move the
 * piece of the same symbol (spec 4.1).
 *
 * Naming a piece that cannot move is a legal and often strong move — you pass on
 * purpose to force the opponent to shift that symbol. That is why `advance`
 * takes the piece even when no move was possible.
 *
 * `initiative: null` means the round is waiting for its draw. The selector never
 * rolls it and never derives it: the result arrives through `resolve` and is
 * recorded in the match's action list (project doc 2.2, decision 5).
 *
 * That is deliberate, and it is the second design this went through. Deriving
 * the draw from a shared seed and the round number was cheaper and wrong — it
 * hands both players the schedule of every future draw, which gives the defender
 * back the undo power that spec 8.3 identifies as what kills the game.
 */
export type ChoiceState = { round: number; initiative: Side | null; named: Piece | null }

export const choice = {
  opening(): ChoiceState {
    return { round: 0, initiative: null, named: null }
  },
  /** Null while the round waits for its draw: nobody may act yet. */
  turn(state: ChoiceState): Turn | null {
    if (state.initiative === null) return null
    return state.named === null
      ? { side: state.initiative, piece: null }
      : { side: other(state.initiative), piece: state.named }
  },
  /** Records the drawn initiative, opening the round. */
  resolve(state: ChoiceState, initiative: Side): ChoiceState {
    return { ...state, initiative }
  },
  advance(state: ChoiceState, piece: Piece): ChoiceState {
    if (state.named === null) return { ...state, named: piece }
    return { round: state.round + 1, initiative: null, named: null }
  },
}
