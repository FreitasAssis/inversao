import type { CSSProperties } from 'react'
import type { Assessment } from '../engine/lookup'
import type { Side } from '../engine/types'

/**
 * The evaluation bar (project doc 9).
 *
 * Like a chess engine's, with one difference that matters: it is not an
 * estimate. The table holds the exact value of every position, so this is the
 * truth rather than a guess — which is what makes it a teaching tool, and also
 * what makes it dangerous enough that the game refuses to show it against the
 * AI (spec 3.4). Switched on it teaches; switched off it preserves the tension,
 * and off is the default.
 *
 * **Two shapes, because the two mechanics were solved into different things.**
 * Escolha Sorteada has a probability, so it gets a continuous bar. Rodizio has
 * a verdict and a distance, so it gets three discrete states and a number of
 * lances. Rendering the second as a percentage would be inventing precision the
 * table does not have.
 */

/** Capitalised: with no name given, the colour stands in as one. */
const SIDE_PT: Record<Side, string> = { blue: 'Azul', orange: 'Laranja' }

export type EvaluationProps = Readonly<{
  assessment: Assessment
  names?: Partial<Record<Side, string>>
}>

export function Evaluation({ assessment, names }: EvaluationProps) {
  const naming = (side: Side) => names?.[side]?.trim() || SIDE_PT[side]

  if (assessment.kind === 'verdict') {
    const { winner, distance } = assessment
    return (
      <p className="evaluation" role="status" data-verdict={winner ?? 'draw'}>
        {winner === null ? (
          'Empate com jogo perfeito dos dois lados.'
        ) : (
          <>
            <strong>{naming(winner)}</strong> vence em {distance} lances, jogando perfeito.
          </>
        )}
      </p>
    )
  }

  const blue = Math.round(assessment.blue * 100)
  return (
    <div className="evaluation">
      <div
        className="bar"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={blue}
        aria-label={`Chance de ${naming('blue')} vencer`}
        style={{ '--blue-share': `${blue}%` } as CSSProperties}
      >
        <span className="share" />
      </div>
      <p className="evaluation-read">
        {naming('blue')} {blue}% · {naming('orange')} {100 - blue}%
      </p>
    </div>
  )
}
