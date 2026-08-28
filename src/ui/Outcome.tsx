import type { Result } from '../engine/match'
import type { Side } from '../engine/types'

/**
 * How a match ends, said in front of the board rather than beside it.
 *
 * Two things it carries besides the words. It names the losing side, so the
 * board can fade that colour and the result reads on the position itself. And
 * it carries a tone: a win rises and celebrates, a loss to the AI does not.
 * Same message, opposite mood — confetti for someone who just lost is the game
 * being tone deaf.
 */

/** Capitalised: with no name given, the colour stands in as one. */
const SIDE_PT: Record<Side, string> = { blue: 'Azul', orange: 'Laranja' }

/**
 * Relative to whoever is watching, never to who is human. Against the AI the
 * two happen to agree; online they do not — both players are human, on separate
 * screens, and each screen owes its own reading.
 */
export type Tone = 'celebration' | 'defeat' | 'draw'

export type OutcomeProps = Readonly<{
  result: Result | null
  actions: number
  tone: Tone
  names?: Partial<Record<Side, string>>
}>

export function Outcome({ result, actions, tone, names }: OutcomeProps) {
  if (result === null) return null

  // Trim and fall back on empty, not just on absent: a cleared name field is an
  // empty string, and `??` would happily print it.
  const naming = (side: Side) => names?.[side]?.trim() || SIDE_PT[side]
  const loser = loserOf(result)

  return (
    <div
      role="alert"
      className="outcome"
      data-tone={tone}
      data-loser={loser ?? undefined}
    >
      <strong className="outcome-headline">{headline(result, naming)}</strong>
      <span className="outcome-count">
        {actions} ações
        {result.kind === 'resignation' && ' · por desistência'}
      </span>
    </div>
  )
}

function loserOf(result: Result): Side | null {
  if (result.kind === 'win' || result.kind === 'resignation') {
    return result.winner === 'blue' ? 'orange' : 'blue'
  }
  return null
}

function headline(result: Result, naming: (side: Side) => string): string {
  switch (result.kind) {
    // "de" and not "do/da": the article needs a gender the name does not carry.
    // Inversa is feminine, the colours are masculine, and whoever types their
    // own name could be either.
    //
    // A resignation is still a victory, and the victory is what should be
    // legible from across the room. How it was won goes in the small print.
    case 'win':
    case 'resignation':
      return `Vitória de ${naming(result.winner)}!`
    case 'agreedDraw':
      return 'Empate por acordo'
    case 'repetitionDraw':
      return 'Empate por repetição'
    case 'lengthDraw':
      return 'Empate no limite de lances'
  }
}
