import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Annotation } from '../../src/ui/Annotation'
import type { Annotation as Read, Moment } from '../../src/engine/annotate'

/**
 * The finished match, read back (project doc 7.1).
 *
 * This is where the clock's adjudication went. Adjudicating decided a result
 * the player could not check; this decides nothing and explains what happened,
 * so there is nothing to game — and it is safe against the AI for the same
 * reason the live bar is not: the match is over.
 */

const chance = (blue: number, mover: Moment['mover'] = null, cost: number | null = null) =>
  ({ ply: 0, assessment: { kind: 'chance', blue }, mover, cost }) as Moment

const ply = (moment: Moment, at: number): Moment => ({ ...moment, ply: at })

describe('reading a finished match back', () => {
  test('points at the move where it turned, with both numbers', () => {
    // "You were on 62% and came out on 31%" is the whole feature: no casual
    // game can say this, because no casual game is solved.
    const moments = [
      chance(0.5),
      ply(chance(0.62, 'blue', -0.12), 1),
      ply(chance(0.31, 'blue', 0.31), 2),
    ]
    const read: Read = { moments, turningPoint: moments[2] as Moment }

    render(<Annotation read={read} names={{ blue: 'Luiz' }} />)

    const said = screen.getByText(/virou no/i)
    expect(said).toHaveTextContent(/lance 2/i)
    expect(said).toHaveTextContent(/luiz/i)
    expect(said).toHaveTextContent(/62%/)
    expect(said).toHaveTextContent(/31%/)
  })

  test('quotes the numbers from the mover, not from blue', () => {
    // The table is absolute. Orange giving away half of a level position went
    // from 50% to 5% *for orange*, and printing blue's 95% would read as praise.
    const moments = [chance(0.5), ply(chance(0.95, 'orange', 0.45), 1)]
    const read: Read = { moments, turningPoint: moments[1] as Moment }

    render(<Annotation read={read} names={{ orange: 'Ana' }} />)

    const said = screen.getByText(/virou no/i)
    expect(said).toHaveTextContent(/ana/i)
    expect(said).toHaveTextContent(/50%/)
    expect(said).toHaveTextContent(/5%/)
    expect(said).not.toHaveTextContent(/95%/)
  })

  test('says plainly when nobody gave anything away', () => {
    // Inventing a turning point to fill the space would be the annotation
    // lying, and two players who never erred have earned being told so.
    render(<Annotation read={{ moments: [chance(0.5)], turningPoint: null }} />)

    expect(screen.getByText(/ninguém entregou nada/i)).toBeInTheDocument()
    expect(screen.queryByText(/virou no/i)).toBeNull()
  })

  test('draws the whole match as one line', () => {
    const moments = [chance(0.5), ply(chance(0.7, 'blue', -0.2), 1)]

    render(<Annotation read={{ moments, turningPoint: null }} />)

    expect(screen.getByRole('img', { name: /chance de azul/i })).toBeInTheDocument()
  })

  test('speaks in verdicts under the Rodizio, and draws no curve', () => {
    // The verdict is discrete, so there is no percentage to quote and no
    // probability to plot. Drawing one would be inventing precision.
    const drawn = {
      ply: 0,
      assessment: { kind: 'verdict', winner: null, distance: 0 },
      mover: null,
      cost: null,
    } as Moment
    const lost = {
      ply: 23,
      assessment: { kind: 'verdict', winner: 'orange', distance: 40 },
      mover: 'blue',
      cost: 0.5,
    } as Moment
    const moments = [...Array.from({ length: 23 }, (_, i) => ply(drawn, i)), lost]

    render(<Annotation read={{ moments, turningPoint: lost }} names={{ orange: 'Ana' }} />)

    expect(screen.queryByRole('img')).toBeNull()
    // The word sits in a <strong>; the sentence is the paragraph around it.
    const said = screen.getByText(/empatada/i).closest('p') as HTMLElement
    expect(said).toHaveTextContent(/lance 23/i)
    expect(said).toHaveTextContent(/ganha para ana/i)
    expect(said).not.toHaveTextContent(/%/)
  })
})
