import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Rules } from '../../src/ui/Rules'

/**
 * The page exists because of what came out of playing with people: the board
 * teaches *what* to do, and players still wanted to know **why**. So these
 * tests are about the questions they asked, not about headings.
 */
describe('Rules', () => {
  test('explains that chance picks who chooses, not what they play', () => {
    // The distinction spec 4.1 calls essential: confusing the two is what makes
    // a game feel rigged.
    render(<Rules />)

    expect(screen.getByText(/quem escolhe/i)).toBeInTheDocument()
  })

  test('explains the pass, which is what confuses people most', () => {
    // Spec 3.2 says so outright, and it is between 9% and 13% of turns.
    render(<Rules />)

    expect(screen.getByRole('heading', { name: /passa/i })).toBeInTheDocument()
  })

  test('explains the double move, which reads as a bug and is not', () => {
    render(<Rules />)

    expect(screen.getByRole('heading', { name: /duas vezes/i })).toBeInTheDocument()
  })

  test('covers both mechanics, and says what separates them', () => {
    render(<Rules />)

    expect(screen.getByRole('heading', { name: /escolha sorteada/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /rodízio/i })).toBeInTheDocument()
  })

  test('shows the three boards and what tells them apart', () => {
    render(<Rules />)

    for (const name of ['Ponte', 'Grade', 'Setas']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    }
  })

  test('draws its examples with the real board', () => {
    // An illustration drawn by hand drifts from the game the first time a rule
    // changes. These are rendered by the same component that plays.
    const { container } = render(<Rules />)

    expect(container.querySelectorAll('[role="grid"]').length).toBeGreaterThan(0)
  })

  test('offers the way back to the game', () => {
    // Reference, never a prerequisite (project doc 4).
    render(<Rules />)

    expect(screen.getByRole('link', { name: /jogar|voltar/i })).toBeInTheDocument()
  })
})
