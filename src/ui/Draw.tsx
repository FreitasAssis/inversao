import type { Side } from '../engine/types'

/**
 * The initiative draw, staged as a coin toss.
 *
 * Spec 4.1 is emphatic about this one: **chance does not choose your move, it
 * chooses who chooses.** Confusing the two is what makes a game feel rigged,
 * and a line of text does not draw the distinction.
 *
 * A coin does, without explaining itself: everybody already knows it has two
 * faces and that one of them comes up. It spins while undecided and lands on
 * the face of whoever took the initiative — and only then does the board become
 * touchable.
 */

const SIDE_PT: Record<Side, string> = { blue: 'azul', orange: 'laranja' }
const SIDES = ['blue', 'orange'] as const

export type DrawProps = Readonly<{ winner: Side | null }>

export function Draw({ winner }: DrawProps) {
  const label =
    winner === null ? 'Sorteando a iniciativa' : `Iniciativa: ${SIDE_PT[winner]}`

  return (
    <div className="draw">
      <span
        className="coin"
        role="img"
        aria-label={label}
        data-settled={winner !== null || undefined}
        data-landed={winner ?? undefined}
      >
        {SIDES.map((side) => (
          <span
            key={side}
            data-testid={`side-${side}`}
            data-side={side}
            data-won={winner === side || undefined}
            className="face"
          />
        ))}
      </span>
    </div>
  )
}
