import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Evaluation } from '../../src/ui/Evaluation'

/**
 * The evaluation bar (project doc 9).
 *
 * Like a chess engine's, except it is not an estimate — the table holds the
 * exact value of every position, so this is the truth rather than a guess. That
 * is also why it is dangerous, and why the game refuses to show it against the
 * AI: see `App.tables.test.tsx`.
 *
 * Two shapes, because the two mechanics were solved into different things: a
 * continuous probability under Escolha Sorteada, three discrete verdicts under
 * Rodizio. Pretending the second is a percentage would be inventing precision.
 */

describe('the evaluation bar', () => {
  test('draws the probability the table gives', () => {
    render(<Evaluation assessment={{ kind: 'chance', blue: 0.652 }} />)

    const meter = screen.getByRole('meter')
    expect(meter).toHaveAttribute('aria-valuenow', '65')
    expect(meter).toHaveAttribute('aria-valuemin', '0')
    expect(meter).toHaveAttribute('aria-valuemax', '100')
  })

  test('says which side the number belongs to', () => {
    // A bare "65%" is ambiguous on a two-player bar, and reading it backwards is
    // exactly the mistake somebody makes once and never notices.
    render(
      <Evaluation
        assessment={{ kind: 'chance', blue: 0.652 }}
        names={{ blue: 'Luiz', orange: 'Ana' }}
      />,
    )

    expect(screen.getByRole('meter')).toHaveAccessibleName(/luiz/i)
    expect(screen.getByText(/65/)).toBeInTheDocument()
  })

  test('falls back on the colour when nobody is named', () => {
    render(<Evaluation assessment={{ kind: 'chance', blue: 0.5 }} />)

    expect(screen.getByRole('meter')).toHaveAccessibleName(/azul/i)
  })

  test('states the verdict and the distance under the Rodizio', () => {
    // Discrete, because the answer is. Three states and a distance, never a
    // percentage the table does not have.
    render(<Evaluation assessment={{ kind: 'verdict', winner: 'orange', distance: 524 }} />)

    expect(screen.queryByRole('meter')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent(/laranja/i)
    expect(screen.getByRole('status')).toHaveTextContent(/524/)
  })

  test('calls a draw a draw, without implying anybody is ahead', () => {
    render(<Evaluation assessment={{ kind: 'verdict', winner: null, distance: 0 }} />)

    const said = screen.getByRole('status')
    expect(said).toHaveTextContent(/empate/i)
    expect(said).not.toHaveTextContent(/vence/i)
  })

  test('does not read out a distance a draw does not have', () => {
    // Retrograde analysis leaves the distance at zero on a drawn state; showing
    // it would say "draw in 0 lances", which is nonsense with a straight face.
    render(<Evaluation assessment={{ kind: 'verdict', winner: null, distance: 0 }} />)

    expect(screen.getByRole('status')).not.toHaveTextContent(/lances/i)
  })
})
