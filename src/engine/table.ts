import { encodePlacement } from './codec'
import { PIECES } from './types'
import type { Piece, Placement, Side } from './types'

/**
 * Reading a solution table (project doc 2.6).
 *
 * The whole space was solved offline in C and shipped as a static binary: the
 * browser downloads it and looks values up, which is perfect play at zero cost
 * and no search at all.
 *
 * **Every index here has to match the C exactly**, and that is the dangerous
 * part. A wrong index does not crash — it answers with some *other* position's
 * value, and the AI merely plays badly. There is no symptom to chase. That is
 * why the enumeration order was pinned by the oracle before any of this
 * existed, and why the checks below refuse rather than guess.
 *
 * Nothing here does I/O. Fetching and caching is somebody else's job.
 */

/** 12P6: every way the six pieces can stand on the twelve cells. */
const POSITIONS = 665280

const HEADER = 16

/** Only version the format has had. A newer one is refused, never guessed at. */
const VERSION = 1

export type Verdict = 'blue' | 'orange' | 'draw'

export type RotationTable = {
  kind: 'rotation'
  verdict(state: number): Verdict
  /** Lances to the end under perfect play. Meaningless on a draw. */
  distance(state: number): number
}

export type ChoiceTable = {
  kind: 'choice'
  /** P(blue wins), 0 to 1. Quantised to 1/255 by the C, which is ample. */
  chance(state: number): number
}

export type Table = RotationTable | ChoiceTable

/**
 * Parses a downloaded table, or returns null if it is not one this build can
 * read: wrong signature, wrong version, wrong size, or cut short in transit.
 *
 * Null rather than an exception because a failed table is not a failed game —
 * the caller falls back to the search AI, which is what plays until the
 * download finishes anyway.
 */
export function readTable(bytes: ArrayBufferLike): Table | null {
  if (bytes.byteLength < HEADER) return null
  const view = new DataView(bytes)

  const signature = String.fromCodePoint(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  )
  if (view.getUint32(4, true) !== VERSION) return null
  const states = view.getUint32(8, true)

  if (signature === 'INVR') {
    // Two planes, not one interleaved record: the C writes every verdict, then
    // every distance. Reading it as 3-byte records would be quietly wrong.
    if (states !== POSITIONS * 6) return null
    if (bytes.byteLength !== HEADER + states * 3) return null
    const distances = HEADER + states

    return {
      kind: 'rotation',
      verdict(state) {
        // 1 and 2 are the two sides; 3 is a drawn state and 0 is one retrograde
        // analysis never resolved, which comes to the same thing.
        const value = view.getUint8(HEADER + inside(state, states))
        if (value === 1) return 'blue'
        if (value === 2) return 'orange'
        return 'draw'
      },
      distance(state) {
        return view.getUint16(distances + inside(state, states) * 2, true)
      },
    }
  }

  if (signature === 'INVS') {
    if (states !== POSITIONS * 8) return null
    if (bytes.byteLength !== HEADER + states) return null

    return {
      kind: 'choice',
      chance(state) {
        return view.getUint8(HEADER + inside(state, states)) / 255
      },
    }
  }

  return null
}

/**
 * Throws rather than reading past the end. This can only happen through a bug
 * in how a state was addressed, and that bug's quiet form — answering with a
 * neighbouring position's value — is the one nobody would ever find.
 */
function inside(state: number, states: number): number {
  if (!Number.isInteger(state) || state < 0 || state >= states) {
    throw new RangeError(`state ${state} is outside a table of ${states}`)
  }
  return state
}

/** Where a Rodizio state lives: position, then whose turn, then the cycle. */
export function rotationState(placement: Placement, side: Side, cycle: number): number {
  return encodePlacement(placement) * 6 + (side === 'blue' ? 0 : 1) * 3 + cycle
}

/**
 * Where an Escolha Sorteada state lives. Four slots per initiative — naming,
 * then one per symbol the opponent can be forced onto — so eight per position
 * with nothing wasted. `named` is null while the holder still has to choose.
 *
 * Deliberately not the repetition key from `match.ts`, which looks almost
 * identical and is not: that one also has to encode a round *waiting on its
 * draw*, which is a state the table has no entry for and never will.
 */
export function choiceState(
  placement: Placement,
  initiative: Side,
  named: Piece | null,
): number {
  const holder = initiative === 'blue' ? 0 : 1
  const phase = named === null ? 0 : 1 + PIECES.indexOf(named)
  return encodePlacement(placement) * 8 + holder * 4 + phase
}
