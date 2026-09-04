import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Outcome } from '../../src/ui/Outcome'

describe('Outcome', () => {
  test('is nothing while the match is still running', () => {
    const { container } = render(<Outcome result={null} actions={12} tone="celebration" />)

    expect(container).toBeEmptyDOMElement()
  })

  test('says who won and how long it took', () => {
    render(
      <Outcome result={{ kind: 'win', winner: 'blue' }} actions={37} tone="celebration" />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/vitória de azul/i)
    expect(screen.getByRole('alert')).toHaveTextContent(/37 ações/i)
  })

  test('marks who lost, so the board can go quiet on that side', () => {
    render(<Outcome result={{ kind: 'win', winner: 'blue' }} actions={9} tone="celebration" />)

    expect(screen.getByRole('alert')).toHaveAttribute('data-loser', 'orange')
  })

  test('celebrates a win and does not celebrate a loss', () => {
    // Losing to the AI should not be met with confetti. Same message, opposite
    // mood — it is the difference between the game being glad for you and the
    // game being indifferent.
    const won = render(
      <Outcome result={{ kind: 'win', winner: 'blue' }} actions={9} tone="celebration" />,
    )
    expect(won.container.querySelector('[role="alert"]')).toHaveAttribute(
      'data-tone',
      'celebration',
    )

    const lost = render(
      <Outcome result={{ kind: 'win', winner: 'orange' }} actions={9} tone="defeat" />,
    )
    expect(lost.container.querySelector('[role="alert"]')).toHaveAttribute(
      'data-tone',
      'defeat',
    )
  })

  test('has no loser to mark on a draw', () => {
    render(<Outcome result={{ kind: 'agreedDraw' }} actions={80} tone="draw" />)

    expect(screen.getByRole('alert')).toHaveTextContent(/empate/i)
    expect(screen.getByRole('alert')).not.toHaveAttribute('data-loser')
  })

  test('neither celebrates nor mourns a draw', () => {
    // Nobody won. Bouncing the message would claim otherwise, and so would the
    // muted, sinking treatment a loss gets.
    render(<Outcome result={{ kind: 'agreedDraw' }} actions={80} tone="draw" />)

    expect(screen.getByRole('alert')).toHaveAttribute('data-tone', 'draw')
  })

  test('calls a resignation a victory, with the how in the small print', () => {
    render(
      <Outcome result={{ kind: 'resignation', winner: 'orange' }} actions={2} tone="defeat" />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/vitória de laranja/i)
    expect(screen.getByRole('alert')).toHaveTextContent(/desistência/i)
  })
})

describe('abandono', () => {
  test('anuncia a vitória de quem ficou', () => {
    render(<Outcome result={{ kind: 'abandonment', winner: 'blue' }} actions={84} tone="celebration" />)

    expect(screen.getByRole('alert')).toHaveTextContent(/Vitória de Azul/)
  })

  test('diz que o adversário saiu, e não que ele desistiu', () => {
    // Ninguém desistiu: a conexão caiu. Reaproveitar "por desistência" seria
    // afirmar uma coisa que não aconteceu.
    render(<Outcome result={{ kind: 'abandonment', winner: 'blue' }} actions={84} tone="celebration" />)

    expect(screen.getByRole('alert')).toHaveTextContent(/o adversário saiu/)
    expect(screen.getByRole('alert')).not.toHaveTextContent(/desist/i)
  })

  test('marca o lado que saiu como perdedor, para o tabuleiro apagá-lo', () => {
    const { container } = render(
      <Outcome result={{ kind: 'abandonment', winner: 'blue' }} actions={84} tone="celebration" />,
    )

    expect(container.querySelector('[data-loser="orange"]')).toBeInTheDocument()
  })
})
