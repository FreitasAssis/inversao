import { INITIAL } from './board'
import { encodePlacement } from './codec'
import { applyMove } from './apply'
import { legalMoves } from './moves'
import { hasWon } from './outcome'
import { choice, rotation } from './selector'
import type { ChoiceState, RotationState, Turn } from './selector'
import { PIECES } from './types'
import type { BoardCode, Cell, Piece, Placement, Side } from './types'

/**
 * A match is the starting position plus the list of actions played (project doc
 * 2.2, decision 3). Replay, undo, post-game analysis, reconnection and network
 * transmission all fall out of that.
 *
 * Draw offers and resignations live in the same list as moves. They are *not*
 * fields on the position: the position has to stay exactly the six cells plus
 * turn plus selector, or it stops matching the solution table index (2.6).
 */

export type Action =
  /** The initiative drawn for a round. Recorded, never derived — see below. */
  | { type: 'draw'; initiative: Side }
  | { type: 'move'; piece: Piece; to: Cell }
  | { type: 'pass'; piece: Piece }
  | { type: 'offerDraw' }
  | { type: 'acceptDraw' }
  | { type: 'declineDraw' }
  | { type: 'resign' }
  /**
   * O adversário sumiu e quem ficou encerrou (desenho do passo 9, seção 5.1).
   *
   * Carrega o vencedor porque, ao contrário de `resign`, ele **não** é derivável
   * de quem está na vez: quem abandona costuma sumir justamente fora da vez, e
   * a rodada pode estar esperando o sorteio, onde não há vez nenhuma.
   *
   * Só a sala emite. Um jogador que pudesse emitir reivindicaria vitória a
   * qualquer momento — é o mesmo motivo pelo qual só a sala sorteia.
   */
  | { type: 'abandon'; winner: Side }

export type Result =
  | { kind: 'win'; winner: Side }
  | { kind: 'resignation'; winner: Side }
  /**
   * Ninguém desistiu: a conexão caiu e quem ficou escolheu encerrar. Existe
   * como `kind` próprio para não afirmar que a pessoa desistiu quando ela só
   * entrou num túnel.
   */
  | { kind: 'abandonment'; winner: Side }
  | { kind: 'agreedDraw' }
  | { kind: 'repetitionDraw' }
  /** The match hit its cap on actions without anyone getting three pieces home. */
  | { kind: 'lengthDraw' }

export type MatchConfig = {
  board: BoardCode
  mechanic: 'rotation' | 'choice'
  /** Rodizio only; the opening is configurable outside "Impossivel" (spec 4.2). */
  opening?: Piece
  /**
   * Ends the match as a draw on a third repetition. **Off by default** (spec
   * 3.4): a repeated position is not evidence of a stuck game. With chance it
   * can simply mean the draws sent both sides out and back, and under Rodizio
   * 54% of turns are forced, so the rule would fire on rails rather than on
   * tacit agreement. What guarantees a match ends is the clock.
   */
  drawOnRepetition?: boolean
  /**
   * Hard cap on actions, after which the match is a draw. This is what
   * guarantees every match ends — no clock does, because a player who moves
   * quickly never runs out of anything.
   *
   * Chosen over a clock deliberately. A per-player clock has to decide the
   * result when it expires, and deciding it by the position rewards whoever is
   * ahead for refusing to progress — while producing an outcome the player
   * cannot check. A cap is symmetric: both sides reach it together, so there is
   * nothing to game.
   */
  maxActions?: number
}

type Selector =
  | { kind: 'rotation'; state: RotationState }
  | { kind: 'choice'; state: ChoiceState }

export type Match = {
  config: MatchConfig
  initial: Placement
  actions: readonly Action[]
  placement: Placement
  selector: Selector
  result: Result | null
  /** How often each position has come up, for the threefold draw. */
  seen: ReadonlyMap<number, number>
}

export type ApplyResult =
  | { ok: true; match: Match }
  | { ok: false; reason: string }

const other = (side: Side): Side => (side === 'blue' ? 'orange' : 'blue')

function openSelector(config: MatchConfig): Selector {
  return config.mechanic === 'rotation'
    ? { kind: 'rotation', state: rotation.opening(config.opening) }
    : { kind: 'choice', state: choice.opening() }
}

function turnOf(selector: Selector): Turn | null {
  return selector.kind === 'rotation'
    ? rotation.turn(selector.state)
    : choice.turn(selector.state)
}

function advance(selector: Selector, piece: Piece): Selector {
  return selector.kind === 'rotation'
    ? { kind: 'rotation', state: rotation.advance(selector.state) }
    : { kind: 'choice', state: choice.advance(selector.state, piece) }
}

/** True while a round is waiting for its initiative to be drawn. */
export function awaitingDraw(match: Match): boolean {
  return match.selector.kind === 'choice' && match.selector.state.initiative === null
}

/**
 * What "the same position" means for the threefold draw: the same cells taken,
 * the same player to move and the same selector state (spec 3.4). It is the
 * compact index the tables are keyed by, so the repetition rule costs nothing
 * beyond the codec that already exists.
 */
export function repetitionKey(placement: Placement, selector: Selector): number {
  const position = encodePlacement(placement)
  if (selector.kind === 'rotation') {
    const side = selector.state.side === 'blue' ? 0 : 1
    return position * 6 + side * 3 + selector.state.cycle
  }
  const { initiative, named } = selector.state
  // A round awaiting its draw is its own state, distinct from either initiative.
  if (initiative === null) return position * 10
  const holder = initiative === 'blue' ? 0 : 1
  const slot = named === null ? 1 + holder : 3 + holder * 3 + PIECES.indexOf(named)
  return position * 10 + slot
}

function countSeen(seen: ReadonlyMap<number, number>, key: number) {
  const count = (seen.get(key) ?? 0) + 1
  return { count, seen: new Map(seen).set(key, count) }
}

/**
 * `initial` is how a puzzle exists: a position lifted out of the solution table
 * and played with the real rules rather than drawn as a diagram (project doc 8).
 *
 * It is a parameter and **not** part of `MatchConfig`, deliberately. The config
 * is what travels — into the save file, and later onto the wire — and a field
 * that silently defaulted to the opening there would rebuild a puzzle as an
 * ordinary game whose moves are all illegal.
 */
export function startMatch(config: MatchConfig, initial: Placement = INITIAL): Match {
  const selector = openSelector(config)
  return {
    config,
    initial,
    actions: [],
    placement: initial,
    selector,
    result: null,
    seen: new Map([[repetitionKey(initial, selector), 1]]),
  }
}

/** Actions still allowed, or null when the match has no cap. */
export function actionsLeft(match: Match): number | null {
  const cap = match.config.maxActions
  return cap === undefined ? null : Math.max(0, cap - match.actions.length)
}

/**
 * Whose turn it is and which piece, or null while the round waits for its draw.
 * `piece: null` within a turn means the mover still has to name the symbol.
 */
export function turn(match: Match): Turn | null {
  return turnOf(match.selector)
}

/** True when a draw offer is open and waiting for an answer. */
function offerPending(match: Match): boolean {
  return match.actions.at(-1)?.type === 'offerDraw'
}

/**
 * Applies an action, returning a reason instead of throwing when it is
 * illegal. Rejection has to be a value because the network path runs incoming
 * actions through this very call (project doc 2.3).
 */
export function applyAction(match: Match, action: Action): ApplyResult {
  if (match.result !== null) return { ok: false, reason: 'match is over' }
  if (actionsLeft(match) === 0) return { ok: false, reason: 'the match hit its cap' }

  const record = (next: Partial<Match>): ApplyResult => {
    const played: Match = { ...match, ...next, actions: [...match.actions, action] }
    return { ok: true, match: capped(played) }
  }
  const pending = offerPending(match)

  if (action.type === 'acceptDraw') {
    if (!pending) return { ok: false, reason: 'no draw was offered' }
    return record({ result: { kind: 'agreedDraw' } })
  }
  if (action.type === 'declineDraw') {
    if (!pending) return { ok: false, reason: 'no draw was offered' }
    return record({})
  }
  // Antes da guarda da oferta pendente, e antes da vez: quem some pode sumir a
  // qualquer momento, inclusive com uma proposta de empate aberta ou com a
  // rodada esperando o sorteio, onde não há de quem seja a vez.
  if (action.type === 'abandon') {
    return record({ result: { kind: 'abandonment', winner: action.winner } })
  }

  if (pending) return { ok: false, reason: 'answer the draw offer first' }

  if (action.type === 'draw') {
    if (match.selector.kind !== 'choice' || match.selector.state.initiative !== null) {
      return { ok: false, reason: 'no initiative is being drawn' }
    }
    return record({
      selector: {
        kind: 'choice',
        state: choice.resolve(match.selector.state, action.initiative),
      },
    })
  }

  const current = turnOf(match.selector)
  if (current === null) return { ok: false, reason: 'the initiative has not been drawn' }
  const { side, piece: forced } = current
  if (action.type === 'offerDraw') return record({})
  if (action.type === 'resign') {
    return record({ result: { kind: 'resignation', winner: other(side) } })
  }
  return playPiece(match, action, side, forced, record)
}

/**
 * Ends the match in a draw once the cap is reached — unless the action just
 * played decided it. The move was made; running into the cap does not undo it.
 */
function capped(played: Match): Match {
  if (played.result !== null || actionsLeft(played) !== 0) return played
  return { ...played, result: { kind: 'lengthDraw' } }
}

/** The move and pass branch, where the position actually changes. */
function playPiece(
  match: Match,
  action: Extract<Action, { type: 'move' | 'pass' }>,
  side: Side,
  forced: Piece | null,
  record: (next: Partial<Match>) => ApplyResult,
): ApplyResult {
  if (forced !== null && action.piece !== forced) {
    return { ok: false, reason: `the active piece is the ${forced}` }
  }
  const moves = legalMoves(match.config.board, match.placement, side, action.piece)

  // Naming a piece with nowhere to go is a move in its own right under Escolha
  // Sorteada, so a pass is only illegal when a move existed.
  if (action.type === 'pass') {
    if (moves.length > 0) return { ok: false, reason: 'the piece can still move' }
  } else if (!moves.includes(action.to)) {
    return { ok: false, reason: 'illegal destination' }
  }

  const placement =
    action.type === 'move'
      ? applyMove(match.placement, side, action.piece, action.to)
      : match.placement
  const selector = advance(match.selector, action.piece)
  const { count, seen } = countSeen(match.seen, repetitionKey(placement, selector))

  const repetitions = match.config.drawOnRepetition === true ? count : 0
  return record({ placement, selector, seen, result: resultOf(placement, side, repetitions) })
}

function resultOf(placement: Placement, mover: Side, repetitions: number): Result | null {
  if (hasWon(placement, mover)) return { kind: 'win', winner: mover }
  if (repetitions >= 3) return { kind: 'repetitionDraw' }
  return null
}

/**
 * Rebuilds a match from the two things that define it, or returns null if the
 * actions are not all legal under that config.
 *
 * Null is the whole point. A saved game and, later, an incoming online match
 * are untrusted input, and replaying re-derives the position through every rule
 * instead of believing a stored one. The config is part of the check: the same
 * action list can be perfectly legal on the Grade and impossible on the Ponte.
 */
export function replayMatch(
  config: MatchConfig,
  actions: readonly Action[],
  initial: Placement = INITIAL,
): Match | null {
  let replay = startMatch(config, initial)
  for (const action of actions) {
    const result = applyAction(replay, action)
    if (!result.ok) return null
    replay = result.match
  }
  return replay
}

/** The position after the first `ply` actions, by replaying them. */
export function positionAt(match: Match, ply: number): Placement {
  const replay = replayMatch(match.config, match.actions.slice(0, ply), match.initial)
  if (replay === null) throw new Error('match holds an illegal action')
  return replay.placement
}
