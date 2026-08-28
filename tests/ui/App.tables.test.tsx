import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { applyAction, startMatch } from '../../src/engine/match'
import { legalActions } from '../../src/engine/search'
import { choiceState } from '../../src/engine/table'

/**
 * What changes in the interface when a solution table arrives (project doc 5).
 *
 * Mocked here rather than in `App.test.tsx` so every other test keeps facing
 * the honest case: jsdom has no Cache Storage and no server, so the loader
 * fails and the game plays on the search AI — which is exactly what a real
 * first visit does while 5 MB are still coming down.
 */
vi.mock('../../src/ui/tables', () => ({
  tablePath: () => '/data/table.bin',
  loadTable: vi.fn(async () => null),
}))

const { loadTable } = await import('../../src/ui/tables')
const { App } = await import('../../src/ui/App')

/** A table stand-in: the App only ever hands it to the engine. */
const someTable = { kind: 'choice' as const, chance: () => 0.5 }

/**
 * The controls live behind the gear now, in a dialog over the board. jsdom
 * hides a closed dialog's contents from the accessibility tree — correctly —
 * so anything reaching for a control has to open it first, exactly as a player
 * does.
 */
function openSettings() {
  fireEvent.click(screen.getByRole('button', { name: /configurações/i }))
}

describe('the solution table in the interface', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(loadTable).mockResolvedValue(null)
  })

  test('says nothing at all while there is no table', async () => {
    // The default state of a first visit, and it must not look like a failure:
    // the game is complete without it.
    render(<App drawDelayMs={0} seed={2} telegraphMs={4000} />)

    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
    expect(screen.queryByText(/análise completa/i)).toBeNull()
  })

  test('mentions the analysis, quietly, once it is on the device', async () => {
    vi.mocked(loadTable).mockResolvedValue(someTable)

    render(<App drawDelayMs={0} seed={2} telegraphMs={4000} />)

    expect(await screen.findByText(/análise completa/i)).toBeInTheDocument()
  })

  test('asks for the table of the combination actually being played', async () => {
    render(<App drawDelayMs={0} seed={2} telegraphMs={4000} />)
    const user = userEvent.setup()

    await waitFor(() => expect(loadTable).toHaveBeenCalledWith('dbu', 'choice'))
    await user.selectOptions(screen.getByRole('combobox', { name: /mecânica/i }), 'rotation')

    await waitFor(() => expect(loadTable).toHaveBeenCalledWith('dbu', 'rotation'))
  })

  test('forgets the old table the moment the combination changes', async () => {
    // Consulting the Setas table during a game on the Grade would be worse than
    // having no table: every answer would be about a different board.
    vi.mocked(loadTable).mockResolvedValue(someTable)
    render(<App drawDelayMs={0} seed={2} telegraphMs={4000} />)
    const user = userEvent.setup()
    await screen.findByText(/análise completa/i)

    vi.mocked(loadTable).mockImplementation(() => new Promise(() => {}))
    await user.selectOptions(screen.getByRole('combobox', { name: /tabuleiro/i }), 'bbb')

    await waitFor(() => expect(screen.queryByText(/análise completa/i)).toBeNull())
  })
})

describe('actually playing from the table', () => {
  beforeEach(() => localStorage.clear())

  /**
   * Seed 1 hands the initiative to orange, so the AI names and moves on its own
   * before the player is asked for anything. Its three options land the circle
   * on C1, the triangle on C2 and the square on C3.
   */
  function tableFavouring(to: number) {
    const drawn = applyAction(startMatch({ board: 'dbu', mechanic: 'choice' }), {
      type: 'draw',
      initiative: 'orange',
    })
    if (!drawn.ok) throw new Error(drawn.reason)

    let prize = -1
    for (const action of legalActions(drawn.match)) {
      const applied = applyAction(drawn.match, action)
      if (!applied.ok || action.type !== 'move' || action.to !== to) continue
      prize = choiceState(applied.match.placement, 'orange', action.piece)
    }
    if (prize < 0) throw new Error(`nothing lands on ${to}`)

    // Orange wants P(azul vence) low, so zero is the move it must take.
    return { kind: 'choice' as const, chance: (state: number) => (state === prize ? 0 : 0.5) }
  }

  test('plays what the table says, not what a search would have found', async () => {
    // Two runs, two tables, two different answers demanded. A search would play
    // the same move both times, so one of these has to fail if the table is not
    // the thing being consulted. This is the test that was missing: everything
    // else here only checked that the interface *mentioned* the table.
    vi.mocked(loadTable).mockResolvedValue(tableFavouring(6))
    const first = render(<App drawDelayMs={0} seed={1} telegraphMs={10} />)

    await waitFor(() =>
      expect(screen.getByRole('gridcell', { name: /C1/ })).toHaveAttribute('data-arrived'),
    )
    first.unmount()
    localStorage.clear()

    vi.mocked(loadTable).mockResolvedValue(tableFavouring(8))
    render(<App drawDelayMs={0} seed={1} telegraphMs={10} />)

    await waitFor(() =>
      expect(screen.getByRole('gridcell', { name: /C3/ })).toHaveAttribute('data-arrived'),
    )
  })
})

describe('the evaluation bar', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(loadTable).mockResolvedValue(someTable)
  })

  test('stays off until somebody asks for it', async () => {
    // Switched on it teaches; switched off it preserves the tension. Only one
    // of those is safe to hand to somebody who has not asked (project doc 9).
    render(<App drawDelayMs={0} seed={2} telegraphMs={4000} />)
    openSettings()

    await screen.findByText(/análise completa/i)
    expect(screen.getByRole('checkbox', { name: /avaliação/i })).not.toBeChecked()
    expect(screen.queryByRole('meter')).toBeNull()
  })

  test('is not on offer against the AI at all', async () => {
    // The mandatory restriction. Against the AI the bar is the same oracle that
    // took the clock down: an exact answer the player did not earn, handed over
    // mid-game (spec 3.4).
    render(<App drawDelayMs={0} seed={2} telegraphMs={4000} />)
    openSettings()

    await screen.findByText(/análise completa/i)
    expect(screen.getByRole('checkbox', { name: /avaliação/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  test('appears once two people share the board and it is switched on', async () => {
    const user = userEvent.setup()
    render(<App drawDelayMs={0} seed={2} telegraphMs={4000} />)
    openSettings()
    await screen.findByText(/análise completa/i)

    await user.click(screen.getByRole('checkbox', { name: /dois jogadores/i }))
    await user.click(screen.getByRole('checkbox', { name: /avaliação/i }))

    expect(await screen.findByRole('meter')).toBeInTheDocument()
  })

  test('vanishes the moment the second player leaves the board', async () => {
    // Switching back to the AI with the setting still on is the way this
    // restriction would be got around, so the check is on the seats and not on
    // the setting.
    const user = userEvent.setup()
    render(<App drawDelayMs={0} seed={2} telegraphMs={4000} />)
    openSettings()
    await screen.findByText(/análise completa/i)

    await user.click(screen.getByRole('checkbox', { name: /dois jogadores/i }))
    await user.click(screen.getByRole('checkbox', { name: /avaliação/i }))
    await screen.findByRole('meter')

    await user.click(screen.getByRole('checkbox', { name: /dois jogadores/i }))

    expect(screen.queryByRole('meter')).toBeNull()
  })

  test('says nothing while the table has not arrived', async () => {
    // It is the table that makes this the truth rather than a guess. Without
    // one there is nothing honest to draw.
    vi.mocked(loadTable).mockResolvedValue(null)
    const user = userEvent.setup()
    render(<App drawDelayMs={0} seed={2} telegraphMs={4000} />)
    openSettings()

    await user.click(screen.getByRole('checkbox', { name: /dois jogadores/i }))
    await user.click(screen.getByRole('checkbox', { name: /avaliação/i }))

    expect(screen.queryByRole('meter')).toBeNull()
  })
})

describe('the annotation after the match', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(loadTable).mockResolvedValue(someTable)
  })

  test('reads the match back once it is over', async () => {
    const user = userEvent.setup()
    render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)
    await screen.findByText(/análise completa/i)

    await user.click(screen.getByRole('button', { name: /desistir/i }))

    expect(await screen.findByText(/como a partida virou/i)).toBeInTheDocument()
  })

  test('shows it against the AI too, unlike the live bar', async () => {
    // The restriction on the bar is that it hands over an answer mid-game. This
    // hands over nothing: the match is finished and the result is already on the
    // screen. Withholding it here would be caution without a reason.
    const user = userEvent.setup()
    render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)
    openSettings()
    await screen.findByText(/análise completa/i)

    expect(screen.getByRole('checkbox', { name: /avaliação/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await user.click(screen.getByRole('button', { name: /desistir/i }))

    expect(await screen.findByText(/como a partida virou/i)).toBeInTheDocument()
  })

  test('says nothing while the match is still being played', async () => {
    render(<App drawDelayMs={0} seed={2} telegraphMs={4000} />)

    await screen.findByText(/análise completa/i)
    expect(screen.queryByText(/como a partida virou/i)).toBeNull()
  })

  test('says nothing when there is no table to read it with', async () => {
    vi.mocked(loadTable).mockResolvedValue(null)
    const user = userEvent.setup()
    render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)

    await user.click(screen.getByRole('button', { name: /desistir/i }))
    await screen.findByRole('alert')

    expect(screen.queryByText(/como a partida virou/i)).toBeNull()
  })
})

describe('the two flawless levels', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(loadTable).mockResolvedValue(null)
  })

  test('seat the player second on Impossivel, which is what makes it true', async () => {
    // Same opening, same flawless opponent — the theorem changes hands purely
    // by who moves first (spec 6). Blue always opens, so the player takes
    // orange, and the board has to be legible from that side (project doc 6.1).
    render(<App drawDelayMs={0} seed={2} telegraphMs={4000} />)
    const user = userEvent.setup()

    await user.selectOptions(screen.getByRole('combobox', { name: /mecânica/i }), 'rotation')
    await user.selectOptions(screen.getByRole('combobox', { name: /nível/i }), 'impossible')

    // Blue always opens, so seating the AI first means the AI opens — and it
    // announces a move before the player has touched anything. On every other
    // level the first thing to happen is the player's own turn.
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/lance anunciado/i),
    )
  })

  test('seat the player first on Insano, where the win is theirs to take', async () => {
    render(<App drawDelayMs={0} seed={2} telegraphMs={4000} />)
    const user = userEvent.setup()

    await user.selectOptions(screen.getByRole('combobox', { name: /mecânica/i }), 'rotation')
    await user.selectOptions(screen.getByRole('combobox', { name: /nível/i }), 'insane')

    // The player's own turn is the first thing that happens, and the opening is
    // the one the table proves won for whoever moves first.
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/vez de azul/i),
    )
    expect(screen.getByRole('status')).not.toHaveTextContent(/lance anunciado/i)
    expect(screen.getByRole('combobox', { name: /abertura/i })).toHaveValue('square')
  })

  test('offer Impossivel only where a theorem actually backs it', async () => {
    // The Escolha Sorteada opens ~50/50 on all three boards, so there is no
    // unbeatable level to promise there and the word would be a boast.
    render(<App drawDelayMs={0} seed={2} telegraphMs={4000} />)

    const levels = screen.getByRole('combobox', { name: /nível/i }) as HTMLSelectElement
    const offered = [...levels.options].map((option) => option.value)

    expect(offered).toContain('insane')
    expect(offered).not.toContain('impossible')
  })
})
