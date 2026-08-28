import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Analysis } from '../../src/ui/Analysis'

/**
 * The page the project doc calls its differentiator: no other obscure game on
 * the internet ships with a computational proof. So these tests are about the
 * claims being present and attributable, not about layout.
 */
describe('Analysis', () => {
  test('states the parking theorem, which is why the game exists at all', () => {
    render(<Analysis />)

    expect(screen.getByRole('heading', { name: /estacionamento/i })).toBeInTheDocument()
  })

  test('shows the scale of choice, and warns the last figure is another quantity', () => {
    // 12,9% / 90,6% / 99,7% are shares of the state space; the Escolha Sorteada
    // number is a probability at the opening. Printing them in one column
    // without saying so would be the page's own worst mistake.
    render(<Analysis />)

    expect(screen.getByText(/99,7/)).toBeInTheDocument()
    expect(screen.getByText(/medem coisas diferentes/i)).toBeInTheDocument()
  })

  test('gives the headline numbers of the exhaustive search', () => {
    render(<Analysis />)

    expect(screen.getByText(/1\.330\.560/)).toBeInTheDocument()
    expect(screen.getByText(/283/)).toBeInTheDocument()
  })

  test('shows the balance as a proof, not as a measurement', () => {
    render(<Analysis />)

    expect(screen.getByRole('heading', { name: /0,5/ })).toBeInTheDocument()
  })

  test('records the trilemma and which two properties were kept', () => {
    render(<Analysis />)

    expect(screen.getByRole('heading', { name: /trilema/i })).toBeInTheDocument()
  })

  test('admits what the analysis cannot do', () => {
    // The honest limitation is part of the argument, not a disclaimer bolted on.
    render(<Analysis />)

    expect(screen.getByRole('heading', { name: /limite|honest/i })).toBeInTheDocument()
  })

  test('draws its boards with the real board', () => {
    const { container } = render(<Analysis />)

    expect(container.querySelectorAll('[role="grid"]').length).toBeGreaterThan(0)
  })
})
