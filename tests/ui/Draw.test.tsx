import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Draw } from '../../src/ui/Draw'

describe('Draw', () => {
  test('is a coin, with a face for each side', () => {
    // The draw decides *who chooses*, not what they play (spec 4.1). A coin
    // carries that on its own: everyone knows it has two faces and that one of
    // them comes up.
    render(<Draw winner={null} />)

    expect(screen.getByRole('img', { name: /sorteando/i })).toBeInTheDocument()
    expect(screen.getByTestId('side-blue')).toBeInTheDocument()
    expect(screen.getByTestId('side-orange')).toBeInTheDocument()
  })

  test('leaves neither side marked until it lands', () => {
    render(<Draw winner={null} />)

    expect(screen.getByTestId('side-blue')).not.toHaveAttribute('data-won')
    expect(screen.getByTestId('side-orange')).not.toHaveAttribute('data-won')
  })

  test('marks the side that took the initiative', () => {
    render(<Draw winner="orange" />)

    expect(screen.getByTestId('side-orange')).toHaveAttribute('data-won', 'true')
    expect(screen.getByTestId('side-blue')).not.toHaveAttribute('data-won')
  })

  test('names the result rather than leaving it to colour', () => {
    render(<Draw winner="orange" />)

    expect(screen.getByRole('img', { name: /iniciativa.*laranja/i })).toBeInTheDocument()
  })

  test('keeps both faces once it has landed', () => {
    // A coin that loses a face after landing stops being a coin, and the toss
    // stops reading as a toss.
    render(<Draw winner="blue" />)

    expect(screen.getByTestId('side-orange')).toBeInTheDocument()
    expect(screen.getByTestId('side-blue')).toHaveAttribute('data-won', 'true')
  })

  test('is still spinning until it lands', () => {
    const spinning = render(<Draw winner={null} />)
    expect(spinning.container.querySelector('[data-settled="true"]')).toBeNull()

    const landed = render(<Draw winner="orange" />)
    expect(landed.container.querySelector('[data-settled="true"]')).not.toBeNull()
  })
})
