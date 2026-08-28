import type { Fallibility } from '../engine/lookup'
import type { BoardCode, Piece, Side } from '../engine/types'

/**
 * The difficulty dial: what each level means, and what it implies (spec 6).
 *
 * It lives here rather than inside App because three places read it — App
 * renders it, the AI is configured from it, and the saved game has to
 * *validate* it, since a level that came back from storage is untrusted text
 * until it is checked against this table.
 *
 * Two currencies, because the two mechanics were solved into different things.
 * Escolha Sorteada knows the exact cost of every move, so a level is a
 * **tolerance in percentage points**. Rodizio has a discrete verdict, so a level
 * is a **rate of deliberate error**. In both, erring means playing the second
 * best rather than playing at random — that is what makes a weak opponent read
 * as a person instead of as a fault.
 *
 * `depth` is what the level means while the table is still downloading. Not a
 * patch: branching is 1,45 and about 4,7 (spec 7.3), so the search reaches
 * useful depth cheaply and plays well.
 *
 * The keys are English and the labels are Portuguese, like the boards. They
 * used to be Portuguese on both sides, which was the convention backwards.
 */

export const LEVELS = {
  easy: { tolerance: 0.2, slip: 0.3, depth: 2 },
  medium: { tolerance: 0.1, slip: 0.1, depth: 4 },
  hard: { tolerance: 0.03, slip: 0.02, depth: 6 },
  insane: { tolerance: 0, slip: 0, depth: 8 },
  impossible: { tolerance: 0, slip: 0, depth: 8 },
} as const

export type Level = keyof typeof LEVELS

/** Easiest first. The dial is rendered in this order and tested against it. */
export const ORDER = Object.keys(LEVELS) as Level[]

export const LEVEL_LABELS: Record<Level, string> = {
  easy: 'Fácil',
  medium: 'Médio',
  hard: 'Difícil',
  insane: 'Insano',
  impossible: 'Impossível',
}

export const DEFAULT_LEVEL: Level = 'medium'

export function isLevel(value: unknown): value is Level {
  return typeof value === 'string' && Object.hasOwn(LEVELS, value)
}

export function fallibilityOf(level: Level): Required<Omit<Fallibility, 'random'>> {
  const { tolerance, slip } = LEVELS[level]
  return { tolerance, slip }
}

/**
 * The opening whose proven win belongs to **whoever moves first** — measured,
 * not asserted: 283 lances on the Setas and 401 on the Grade, both reproduced
 * by playing the real tables out move by move (spec 4.2).
 *
 * Null on the Ponte, where the Rodizio draws from every opening and is not
 * offered at all.
 */
const DECIDED: Partial<Record<BoardCode, Piece>> = {
  dbu: 'square',
  bbb: 'triangle',
}

export function decidedOpening(board: BoardCode): Piece | null {
  return DECIDED[board] ?? null
}

/**
 * Who the human plays, when the level says. Only the two flawless rungs do, and
 * this is the entire difference between them: the opening above is a proven win
 * for the first seat, so seating the player there makes the win *theirs*, and
 * seating the AI there makes it unreachable.
 *
 * That is what earns the names. **Insano** is a flawless opponent in a position
 * you can prove you win — 401 lances without one mistake of your own.
 * **Impossível** is the same opponent with the theorem on its side, and it is
 * the only place in the whole game where that word is literally true.
 *
 * Null everywhere else: below the top there is no theorem at stake, so nothing
 * needs fixing and the player keeps every choice.
 */
export function humansFor(level: Level): Side[] | null {
  if (level === 'insane') return ['blue']
  if (level === 'impossible') return ['orange']
  return null
}
