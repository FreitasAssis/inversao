import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Site } from '../../src/ui/Site'

describe('Site', () => {
  test('opens on the board, not on the rules', () => {
    // The root is the game, with nothing in front of it (project doc 3).
    history.pushState(null, '', '/')

    render(<Site />)

    expect(screen.getByRole('grid', { name: /tabuleiro/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /regras do inversão/i })).toBeNull()
  })

  test('serves the rules at their own address', () => {
    // A direct hit has to work: it is the link somebody shares.
    history.pushState(null, '', '/regras')

    render(<Site />)

    expect(screen.getByRole('heading', { name: /regras do inversão/i })).toBeInTheDocument()
  })

  test('drops an unknown address onto the board', () => {
    history.pushState(null, '', '/nao-existe')

    render(<Site />)

    expect(screen.getByRole('grid', { name: /tabuleiro/i })).toBeInTheDocument()
  })
  test('serves the analysis at its own address', () => {
    history.pushState(null, '', '/analise')

    render(<Site />)

    expect(screen.getByRole('heading', { name: /como o inversão foi verificado/i })).toBeInTheDocument()
  })
})
