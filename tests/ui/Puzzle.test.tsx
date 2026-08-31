import { beforeEach, describe, expect, test } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Puzzle } from '../../src/ui/Puzzle'
import { PIECE_PT } from '../../src/ui/Board'
import { puzzlesFor } from '../../src/ui/puzzles'
import type { Puzzle as Daily } from '../../src/ui/puzzles'

/**
 * The daily puzzle page (project doc 8).
 *
 * Everything here is driven off the *real* puzzle for a fixed date rather than
 * a fixture, so the tests answer the question that matters: are the positions
 * that ship in the build actually playable with the real rules? A hand-made
 * fixture would pass while every real puzzle was unreachable.
 */

const DAY = new Date('2026-03-14T12:00:00Z')
const at = (date: Date) => render(<Puzzle now={date} />)

/** The verdict of one puzzle, marked apart from the board's own turn line. */
const verdictOf = (puzzle: Daily) =>
  panel(puzzle).querySelector('[data-verdict]') as HTMLElement

/** The section for one board, and its own board grid. */
const panel = (puzzle: Daily) =>
  document.querySelector(`[data-board="${puzzle.board}"]`) as HTMLElement

/** Plays a move by touching the piece and then the destination. */
async function answer(user: ReturnType<typeof userEvent.setup>, puzzle: Daily, best: boolean) {
  const move = best ? puzzle.best : puzzle.second
  const board = within(panel(puzzle))
  const from = puzzle.blue[['circle', 'triangle', 'square'].indexOf(move.symbol)] as number

  await user.click(board.getByRole('gridcell', { name: cellName(from) }))
  if (move.pass) {
    await user.click(board.getByRole('button', { name: /passar/i }))
    return
  }
  await user.click(board.getByRole('gridcell', { name: cellName(move.to as number) }))
}

const NAMES = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'D1', 'D2', 'D3']
const cellName = (cell: number) => new RegExp(`^${NAMES[cell]},`)

describe('the daily puzzle page', () => {
  beforeEach(() => localStorage.clear())

  test('offers one puzzle from each board, on the same day for everybody', () => {
    at(DAY)

    for (const puzzle of puzzlesFor(DAY)) {
      expect(panel(puzzle), puzzle.board).toBeInTheDocument()
    }
  })

  test('says the date in words, so a shared card can be checked against it', () => {
    at(DAY)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/desafios de 14 de março de 2026/i)
  })

  test('says which way the player is travelling', () => {
    // A match answers this by itself: you watched your pieces leave the top
    // row. A puzzle drops somebody into the middle with no such history, and
    // "which direction am I going" has no answer on the screen unless it is
    // written down.
    at(DAY)
    // The phrase sits inside a <strong>; the direction is in the paragraph.
    const lead = screen.getByText(/você joga com as azuis/i).closest('p') as HTMLElement

    expect(lead).toHaveTextContent(/de cima/i)
    expect(lead).toHaveTextContent(/de baixo/i)
  })

  test('anchors the percentages against the balanced opening', () => {
    // "65,2%" means nothing to somebody who does not know what a normal number
    // looks like. The opening is the scale, and saying so once is enough.
    at(DAY)

    expect(screen.getByText(/50%/)).toBeInTheDocument()
  })

  test('every position that ships is playable with the real rules', () => {
    // The reason this page builds a real Match instead of drawing a diagram. If
    // an extracted position were not reachable, or the initiative were wrong,
    // the board would render with nothing to touch.
    at(DAY)

    for (const puzzle of puzzlesFor(DAY)) {
      const board = within(panel(puzzle))
      expect(board.getAllByRole('gridcell').length, puzzle.board).toBe(12)
      expect(
        panel(puzzle).querySelectorAll('[data-nameable]').length,
        puzzle.board,
      ).toBeGreaterThan(0)
    }
  })

  test('accepts the best move and says so', async () => {
    const user = userEvent.setup()
    at(DAY)
    const [first] = puzzlesFor(DAY)
    if (first === undefined) throw new Error('no puzzle')

    await answer(user, first, true)

    expect(verdictOf(first)).toHaveTextContent(/certo/i)
  })

  test('rejects the second best, and says exactly what it cost', async () => {
    // The whole reason to come back (project doc 8.4): the position is solved,
    // so a wrong answer is not "wrong" — it is a number of points given away.
    const user = userEvent.setup()
    at(DAY)
    const [first] = puzzlesFor(DAY)
    if (first === undefined) throw new Error('no puzzle')

    await answer(user, first, false)

    const verdict = verdictOf(first)
    expect(verdict).toHaveTextContent(/não era o melhor/i)
    expect(verdict).toHaveTextContent(/segundo melhor/i)
    expect(verdict).toHaveTextContent(/pontos/i)
  })

  test('names the piece that should have been named', async () => {
    const user = userEvent.setup()
    at(DAY)
    const [first] = puzzlesFor(DAY)
    if (first === undefined) throw new Error('no puzzle')

    await answer(user, first, false)

    expect(verdictOf(first)).toHaveTextContent(new RegExp(PIECE_PT[first.best.symbol], 'i'))
  })

  test('gives one attempt, and no second bite after a reload', async () => {
    // A daily puzzle with unlimited guesses is a quiz. Reopening the tab has to
    // be worth nothing at all.
    const user = userEvent.setup()
    const first = at(DAY)
    const [puzzle] = puzzlesFor(DAY)
    if (puzzle === undefined) throw new Error('no puzzle')
    await answer(user, puzzle, false)
    first.unmount()

    at(DAY)

    expect(verdictOf(puzzle)).toHaveTextContent(/não era o melhor/i)
  })

  test('lets the forced reply be played out without rewriting the verdict', async () => {
    // Seeing the opponent forced onto the symbol you named is the mechanic in
    // one gesture, so the board stays live afterwards. But that reply is
    // orange's move, and letting it through the answer check would overwrite a
    // correct answer with a wrong one on the way past.
    const user = userEvent.setup()
    at(DAY)
    const [puzzle] = puzzlesFor(DAY)
    if (puzzle === undefined) throw new Error('no puzzle')

    await answer(user, puzzle, true)
    expect(verdictOf(puzzle)).toHaveTextContent(/certo/i)

    const reply = panel(puzzle).querySelector('[data-legal]') as HTMLElement | null
    if (reply === null) throw new Error('the forced reply had nowhere to go')
    await user.click(reply)

    expect(verdictOf(puzzle)).toHaveTextContent(/certo/i)
  })

  test('counts the day only once all three have been faced', async () => {
    const user = userEvent.setup()
    at(DAY)
    const daily = puzzlesFor(DAY)

    expect(screen.getByText(/dias seguidos/i)).toHaveTextContent(/^0 dias seguidos/)
    for (const puzzle of daily) await answer(user, puzzle, true)

    expect(screen.getByText(/dias seguidos/i)).toHaveTextContent(/^1 dias seguidos/)
    expect(screen.getByText(/perfeitos/i)).toHaveTextContent(/1 perfeitos/)
  })

  test('keeps the streak but not the perfect run after one miss', async () => {
    const user = userEvent.setup()
    at(DAY)
    const [one, two, three] = puzzlesFor(DAY)
    if (!one || !two || !three) throw new Error('no puzzles')

    await answer(user, one, true)
    await answer(user, two, false)
    await answer(user, three, true)

    expect(screen.getByText(/dias seguidos/i)).toHaveTextContent(/1 dias seguidos/)
    expect(screen.getByText(/perfeitos/i)).toHaveTextContent(/0 perfeitos/)
  })

  test('leads back to the game rather than trapping anyone here', () => {
    at(DAY)

    expect(screen.getAllByRole('link', { name: /jogar/i })[0]).toHaveAttribute('href', '/')
  })
})

describe('compartilhando o dia', () => {
  const day = new Date('2026-08-31T12:00:00Z')

  test('não oferece compartilhar antes de encarar algum', () => {
    // Um card com os três traços diria "não fiz nada hoje", que não é o que
    // ninguém quer mandar para alguém.
    at(day)

    expect(screen.queryByRole('button', { name: /compartilhar/i })).toBeNull()
  })

  test('oferece assim que o primeiro é respondido', async () => {
    const user = userEvent.setup()
    at(day)
    const [first] = puzzlesFor(day)
    if (first === undefined) throw new Error('sem desafio no dia')

    await answer(user, first, true)

    expect(screen.getByRole('button', { name: /compartilhar/i })).toBeInTheDocument()
  })
})
