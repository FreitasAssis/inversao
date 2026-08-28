import type { Annotation as Read, Moment } from '../engine/annotate'
import type { Side } from '../engine/types'

/**
 * The finished match, read back (project doc 7.1).
 *
 * The table holds the exact value of every position, so the app can walk the
 * whole game and point at the move where it turned. Chess engines show this;
 * the difference is that the number here is **true** rather than estimated, and
 * no casual game shows it because no casual game is solved.
 *
 * It is also where the clock's adjudication ended up. Adjudicating decided a
 * result the player could not check, which is why it fell (spec 3.4). This
 * decides nothing and explains what happened, so there is nothing to game — and
 * it is safe against the AI for the same reason the live bar is not: the match
 * is already over.
 */

const SIDE_PT: Record<Side, string> = { blue: 'Azul', orange: 'Laranja' }

/** Percentage points, the currency the whole analysis is quoted in. */
const points = (value: number) => (value * 100).toFixed(0)

export type AnnotationProps = Readonly<{
  read: Read
  names?: Partial<Record<Side, string>>
}>

export function Annotation({ read, names }: AnnotationProps) {
  const naming = (side: Side) => names?.[side]?.trim() || SIDE_PT[side]
  const { moments, turningPoint } = read
  const chance = moments[0]?.assessment.kind === 'chance'

  return (
    <section className="annotation">
      <h2>Como a partida virou</h2>

      {chance && <Curve moments={moments} turningPoint={turningPoint} />}

      <p className="annotation-read">
        {turningPoint === null ? (
          // Inventing a turning point to fill the space would be the annotation
          // lying. Two players who never gave anything away deserve to be told.
          'Ninguém entregou nada: nenhum lance mudou o valor da posição.'
        ) : (
          <Turn moments={moments} at={turningPoint} naming={naming} chance={chance} />
        )}
      </p>
    </section>
  )
}

function Turn({
  moments,
  at,
  naming,
  chance,
}: {
  moments: readonly Moment[]
  at: Moment
  naming: (side: Side) => string
  chance: boolean
}) {
  const before = moments[at.ply - 1]
  const who = naming(at.mover as Side)

  if (chance && before?.assessment.kind === 'chance' && at.assessment.kind === 'chance') {
    const mine = (blue: number) => (at.mover === 'blue' ? blue : 1 - blue)
    return (
      <>
        Virou no <strong>lance {at.ply}</strong>: {who} estava com{' '}
        {points(mine(before.assessment.blue))}% e ficou com{' '}
        {points(mine(at.assessment.blue))}%.
      </>
    )
  }

  // Rodizio: the verdict is discrete, so the sentence is drier — and there is
  // no percentage to quote, because the table does not hold one.
  return (
    <>
      A posição estava <strong>{verdictWord(before, naming)}</strong> até o{' '}
      <strong>lance {at.ply}</strong>, quando {who} a deixou{' '}
      {verdictWord(at, naming)}.
    </>
  )
}

function verdictWord(moment: Moment | undefined, naming: (side: Side) => string): string {
  if (moment?.assessment.kind !== 'verdict') return 'indefinida'
  const { winner } = moment.assessment
  return winner === null ? 'empatada' : `ganha para ${naming(winner)}`
}

/**
 * The whole match as one line. Not a chart with axes — it is a shape, read at a
 * glance, and the sentence underneath carries the numbers.
 */
function Curve({
  moments,
  turningPoint,
}: {
  moments: readonly Moment[]
  turningPoint: Moment | null
}) {
  const blueOf = (moment: Moment) =>
    moment.assessment.kind === 'chance' ? moment.assessment.blue : 0.5
  const step = moments.length > 1 ? 100 / (moments.length - 1) : 100
  const line = moments
    .map((moment, index) => `${(index * step).toFixed(2)},${((1 - blueOf(moment)) * 40).toFixed(2)}`)
    .join(' ')

  return (
    <svg
      className="curve"
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Chance de Azul vencer ao longo de ${moments.length - 1} lances`}
    >
      {/* Level. Everything above it is blue ahead, everything below is orange. */}
      <line className="curve-level" x1="0" y1="20" x2="100" y2="20" />
      <polyline className="curve-line" points={line} />
      {turningPoint !== null && (
        <line
          className="curve-turn"
          x1={(turningPoint.ply * step).toFixed(2)}
          y1="0"
          x2={(turningPoint.ply * step).toFixed(2)}
          y2="40"
        />
      )}
    </svg>
  )
}
