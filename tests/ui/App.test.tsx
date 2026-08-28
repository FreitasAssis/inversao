import { beforeEach, describe, expect, test } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'

/**
 * The root opens ready to play; tests drop the staging delay and pin the seed.
 * Seed 2 opens with blue holding the initiative, seed 1 with orange.
 */
const open = (seed = 2) => render(<App drawDelayMs={0} seed={seed} />)

/**
 * The controls live behind the gear now, in a dialog over the board. jsdom
 * hides a closed dialog's contents from the accessibility tree — correctly —
 * so anything reaching for a control has to open it first, exactly as a player
 * does.
 */
function openSettings() {
  fireEvent.click(screen.getByRole('button', { name: /configurações/i }))
}

describe('App', () => {
  beforeEach(() => localStorage.clear())

  test('opens on a board that is already playable', async () => {
    // No splash, no mode menu, no "click to start" (project doc 3).
    open()

    expect(await screen.findByRole('grid', { name: /tabuleiro/i })).toBeInTheDocument()
  })

  test('draws the initiative before anything can be touched', async () => {
    // The draw is staged and clearly prior to the decision, or the mechanic
    // reads as "the game played for me" (spec 4.1).
    open()

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/iniciativa/i),
    )
  })

  test('lets the AI answer a naming without any help', async () => {
    open(2)
    const user = userEvent.setup()

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/iniciativa: azul/i),
    )
    // Naming happens on the board now: touch your own circle on A3.
    await user.click(screen.getByRole('gridcell', { name: /A3/ }))
    await user.click(screen.getByRole('gridcell', { name: /B3/ }))

    // Orange is the AI, and its reply is forced onto the same symbol. Nothing
    // else is touched, and the round still completes into the next draw.
    await waitFor(
      () => expect(screen.getByRole('status')).toHaveTextContent(/iniciativa|movendo/i),
      { timeout: 3000 },
    )
    expect(screen.getByRole('status')).not.toHaveTextContent(/vez de laranja/i)
  })

  test('plays the whole AI round when the draw goes against the player', async () => {
    // With orange holding the initiative the AI has to name and move on its
    // own before the human is asked for anything.
    open(1)

    await waitFor(
      () => expect(screen.getByRole('status')).toHaveTextContent(/vez de azul, movendo/i),
      { timeout: 3000 },
    )
  })

  test('switches to the Rodizio, where nobody names the piece', async () => {
    open()
    const user = userEvent.setup()

    await user.selectOptions(screen.getByRole('combobox', { name: /mecânica/i }), 'rotation')

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/movendo o quadrado/i),
    )
  })

  test('offers the boards each mechanic actually supports', async () => {
    // Rodizio dies on the Ponte, so it is not on offer there (spec 4.2).
    open()
    const user = userEvent.setup()

    await user.selectOptions(screen.getByRole('combobox', { name: /mecânica/i }), 'rotation')

    // Queried as a combobox: the grid itself is also labelled "Tabuleiro".
    const boards = screen.getByRole('combobox', { name: /tabuleiro/i }) as HTMLSelectElement
    const codes = [...boards.options].map((option) => option.value)
    expect(codes).toEqual(['bbb', 'dbu'])
  })

  test('carries the difficulty as a search depth', async () => {
    open()
    const user = userEvent.setup()

    const level = screen.getByRole('combobox', { name: /nível/i })
    await user.selectOptions(level, 'easy')

    expect(level).toHaveValue('easy')
  })

  test('leaves the repetition draw switched off', async () => {
    // Opt-in, because a repeated position is not evidence of a stuck game
    // (spec 3.4). The clock is what guarantees a match ends.
    open()
    openSettings()

    expect(screen.getByRole('checkbox', { name: /repetição/i })).not.toBeChecked()
  })
  test('announces the AI move before playing it', async () => {
    // Seed 1 hands the initiative to orange, so the AI acts on its own. With a
    // long telegraph the announcement is observable while the board still holds
    // the old position — which is the whole point of announcing.
    render(<App drawDelayMs={0} seed={1} telegraphMs={4000} />)

    await waitFor(
      () => expect(document.querySelector('[data-telegraph="from"]')).toBeInTheDocument(),
      { timeout: 3000 },
    )

    expect(document.querySelector('[data-telegraph="to"]')).toBeInTheDocument()
    // Announced, not played: nothing has arrived anywhere yet.
    expect(document.querySelector('[data-arrived]')).toBeNull()
  })

  test('plays the announced move once the beat has passed', async () => {
    render(<App drawDelayMs={0} seed={1} telegraphMs={10} />)

    await waitFor(
      () => expect(document.querySelector('[data-arrived]')).toBeInTheDocument(),
      { timeout: 3000 },
    )
    expect(document.querySelector('[data-telegraph]')).toBeNull()
  })

  test('plays a human move straight away, with no announcement to sit through', async () => {
    // Only the AI is announced: you already know what you are about to do. With
    // a four-second telegraph the human's move still lands immediately — what
    // is being announced by then is the AI's reply, not the player's own move.
    render(<App drawDelayMs={0} seed={2} telegraphMs={4000} />)
    const user = userEvent.setup()

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/iniciativa: azul/i),
    )
    await user.click(screen.getByRole('gridcell', { name: /A3/ }))
    await user.click(screen.getByRole('gridcell', { name: /B3/ }))

    expect(screen.getByRole('gridcell', { name: /B3/ })).toHaveAttribute('data-arrived', 'true')
  })
  test('puts the result in front of the board when it is over', async () => {
    // Blue resigns immediately: fastest way to a finished match.
    render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)
    const user = userEvent.setup()

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/iniciativa: azul/i),
    )
    await user.click(screen.getByRole('button', { name: /desistir/i }))

    const alert = await screen.findByRole('alert')
    // Orange is the AI here, and the AI has a name.
    expect(alert).toHaveTextContent(/vitória de inversa/i)
    expect(alert).toHaveAttribute('data-loser', 'blue')
  })

  test('stops announcing the next move once the match is over', async () => {
    // Showing whose turn it would be next is confusing when there is no next.
    render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)
    const user = userEvent.setup()

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/iniciativa: azul/i),
    )
    await user.click(screen.getByRole('button', { name: /desistir/i }))

    await screen.findByRole('alert')
    expect(screen.queryByRole('status')).toBeNull()
  })

  test('does not celebrate when the AI is the one who won', async () => {
    render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)
    const user = userEvent.setup()

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/iniciativa: azul/i),
    )
    await user.click(screen.getByRole('button', { name: /desistir/i }))

    expect(await screen.findByRole('alert')).toHaveAttribute('data-tone', 'defeat')
  })
  test('lets the players be named, and names them in the result', async () => {
    // Names carry into the shareable card of step 8, which is generated from
    // the finished match — so this is not only decoration.
    render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)
    openSettings()
    const user = userEvent.setup()

    await user.click(screen.getByRole('checkbox', { name: /dois jogadores/i }))
    await user.type(screen.getByRole('textbox', { name: /seu nome/i }), 'Luiz')
    await user.type(screen.getByRole('textbox', { name: /convidado/i }), 'Ana')

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/luiz/i))

    await user.click(screen.getByRole('button', { name: /desistir/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/vitória de ana/i)
  })

  test('names can be changed mid-match', async () => {
    render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)
    openSettings()
    const user = userEvent.setup()

    await user.click(screen.getByRole('checkbox', { name: /dois jogadores/i }))
    await user.type(screen.getByRole('textbox', { name: /convidado/i }), 'Ana')

    expect(screen.getByRole('textbox', { name: /convidado/i })).toHaveValue('Ana')
  })

  test('carries the animation speed down to the board', async () => {
    // One dial for every animation: whoever wants a brisk game drags it down,
    // whoever wants to watch drags it up, and zero means none at all.
    render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)
    openSettings()

    // Position 4 is the fast end of the dial, which is instant.
    const dial = screen.getByRole('slider', { name: /velocidade/i })
    fireEvent.change(dial, { target: { value: '4' } })

    expect(document.querySelector('.app')).toHaveStyle({ '--beat': '0' })
  })
  test('remembers the dial across visits', async () => {
    const first = render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)
    openSettings()
    fireEvent.change(screen.getByRole('slider', { name: /velocidade/i }), {
      target: { value: '3' },
    })
    first.unmount()

    render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)
    openSettings()

    expect(screen.getByRole('slider', { name: /velocidade/i })).toHaveValue('3')
  })

  test('remembers the colourless mode across visits', async () => {
    // An accessibility preference that resets every visit is barely one.
    const user = userEvent.setup()
    const first = render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)
    openSettings()
    await user.click(screen.getByRole('checkbox', { name: /sem cor/i }))
    first.unmount()

    render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)
    openSettings()

    expect(screen.getByRole('checkbox', { name: /sem cor/i })).toBeChecked()
  })
  test('offers a sound control, starting at half', () => {
    open()
    openSettings()

    expect(screen.getByRole('slider', { name: /som/i })).toHaveValue('0.5')
  })

  test('remembers a muted game across visits', async () => {
    const first = render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)
    openSettings()
    fireEvent.change(screen.getByRole('slider', { name: /som/i }), { target: { value: '0' } })
    first.unmount()

    render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)
    openSettings()

    expect(screen.getByRole('slider', { name: /som/i })).toHaveValue('0')
  })

  test('plays through a match without an audio context available', async () => {
    // jsdom has no Web Audio at all, and neither do some locked-down browsers.
    // Sound is texture: losing it must never cost a move.
    //
    // The telegraph is held long so the AI's reply does not land during the
    // assertion — with it at zero the arrival mark moves on to the AI's piece
    // before the test can look.
    render(<App drawDelayMs={0} seed={2} telegraphMs={4000} />)
    const user = userEvent.setup()

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/iniciativa: azul/i),
    )
    await user.click(screen.getByRole('gridcell', { name: /A3/ }))
    await user.click(screen.getByRole('gridcell', { name: /B3/ }))

    expect(screen.getByRole('gridcell', { name: /B3/ })).toHaveAttribute('data-arrived', 'true')
  })
  test('lets you name yourself even against the AI', async () => {
    // A win over the AI is worth sharing (step 8), and "blue beat orange" is
    // not a story. Naming the opponent gives the card someone to have beaten.
    render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)
    openSettings()
    const user = userEvent.setup()

    await user.type(screen.getByRole('textbox', { name: /seu nome/i }), 'Luiz')

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/luiz/i))
  })

  test('calls the AI Inversa, and does not offer to rename it', () => {
    render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)
    openSettings()

    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(screen.queryByDisplayValue(/inversa/i)).toBeNull()
  })

  test('names the AI in the result', async () => {
    render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)
    const user = userEvent.setup()

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/iniciativa/i),
    )
    await user.click(screen.getByRole('button', { name: /desistir/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/vitória de inversa/i)
  })

  test('offers a field for each player in two-player', async () => {
    render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)
    openSettings()
    const user = userEvent.setup()

    await user.click(screen.getByRole('checkbox', { name: /dois jogadores/i }))

    expect(screen.getAllByRole('textbox')).toHaveLength(2)
  })
  test('remembers your name across visits', async () => {
    const user = userEvent.setup()
    const first = render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)
    openSettings()
    await user.type(screen.getByRole('textbox', { name: /seu nome/i }), 'Luiz')
    first.unmount()

    render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)
    openSettings()

    expect(screen.getByRole('textbox', { name: /seu nome/i })).toHaveValue('Luiz')
  })

  test('will not let a name run away with the layout', async () => {
    // It lands on a shared image and, online, on somebody else's screen.
    const user = userEvent.setup()
    render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)
    openSettings()

    const field = screen.getByRole('textbox', { name: /seu nome/i })
    await user.type(field, 'a'.repeat(60))

    expect((field as HTMLInputElement).value.length).toBeLessThanOrEqual(20)
  })
  test('leaves no move affordances on the board once it is over', async () => {
    // Nothing on a decided board should look touchable: no active piece, no lit
    // destination, no piece offering to be named.
    render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)
    const user = userEvent.setup()

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/iniciativa/i),
    )
    await user.click(screen.getByRole('button', { name: /desistir/i }))
    await screen.findByRole('alert')

    expect(document.querySelectorAll('[data-legal]')).toHaveLength(0)
    expect(document.querySelectorAll('[data-active]')).toHaveLength(0)
    expect(document.querySelectorAll('[data-nameable]')).toHaveLength(0)
  })

  test('refuses a click on the finished board', async () => {
    render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)
    const user = userEvent.setup()

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/iniciativa/i),
    )
    await user.click(screen.getByRole('button', { name: /desistir/i }))
    const before = (await screen.findByRole('alert')).textContent

    await user.click(screen.getByRole('gridcell', { name: /A3/ }))

    expect(screen.getByRole('alert')).toHaveTextContent(before ?? '')
  })
  test('reads the result from the viewpoint of whoever is watching', async () => {
    // Against the AI there is one human, so "the AI won" and "you lost" happen
    // to agree — but they are not the same statement. Online both sides are
    // human on separate screens, and each screen needs its own tone.
    render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)
    const user = userEvent.setup()

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/iniciativa/i),
    )
    await user.click(screen.getByRole('button', { name: /desistir/i }))

    expect(await screen.findByRole('alert')).toHaveAttribute('data-tone', 'defeat')
  })

  test('celebrates for the winner when two people share one screen', async () => {
    // With no single viewer there is nobody to console: the message names who
    // won, and both are looking at the same board.
    render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)
    openSettings()
    const user = userEvent.setup()

    await user.click(screen.getByRole('checkbox', { name: /dois jogadores/i }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/iniciativa/i),
    )
    await user.click(screen.getByRole('button', { name: /desistir/i }))

    expect(await screen.findByRole('alert')).toHaveAttribute('data-tone', 'celebration')
  })

  test('stays even-handed on a draw, in every mode', async () => {
    render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)
    const user = userEvent.setup()

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/iniciativa/i),
    )
    await user.click(screen.getByRole('button', { name: /propor empate/i }))
    await user.click(screen.getByRole('button', { name: /aceitar/i }))

    expect(await screen.findByRole('alert')).toHaveAttribute('data-tone', 'draw')
  })

  test('carries the seal that leads to the proof', () => {
    // The board is where somebody arrives; the analysis is what makes them stay.
    open()

    const seal = screen.getByRole('link', { name: /busca exaustiva/i })
    expect(seal).toHaveAttribute('href', '/analise')
  })

  test('shows how many actions are left, and counts them down', async () => {
    // The cap is the only thing guaranteeing a match ends, so it is visible
    // rather than a surprise at the end.
    render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)
    const user = userEvent.setup()

    expect(screen.getByText(/500 lances restantes/i)).toBeInTheDocument()

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/iniciativa: azul/i),
    )
    await user.click(screen.getByRole('gridcell', { name: /A3/ }))
    await user.click(screen.getByRole('gridcell', { name: /B3/ }))

    expect(screen.queryByText(/500 lances restantes/i)).toBeNull()
    expect(screen.getByText(/lances restantes/i)).toBeInTheDocument()
  })

  test('lets the cap be chosen, and reaches past the longest forced win', () => {
    // The ceiling is 600 because the Rodizio on the Grade, opened with the
    // square and played perfectly by both sides, is a win for the second player
    // at 524 lances. A cap of 500 would call that game a draw — the app would
    // be unable to show a result its own solver proved.
    open()
    openSettings()

    const field = screen.getByRole('spinbutton', { name: /limite de lances/i })
    expect(field).toHaveAttribute('max', '600')
  })

  test('lets the Rodizio be opened on any of the three pieces', async () => {
    // Spec 4.2: the opening is configurable, and on the Grade it is the only
    // parameter in the whole game that decides *which side* holds the
    // theoretical win. Steering everybody into one of them hides that.
    open()
    openSettings()
    const user = userEvent.setup()

    await user.selectOptions(screen.getByRole('combobox', { name: /mecânica/i }), 'rotation')
    await user.selectOptions(screen.getByRole('combobox', { name: /abertura/i }), 'circle')

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/movendo o círculo/i),
    )
  })

  test('keeps the opening out of the Escolha Sorteada, where no cycle exists', async () => {
    // There is no order to open: the draw decides who names, every round.
    open()

    expect(screen.queryByRole('combobox', { name: /abertura/i })).toBeNull()
  })

  test('holds the offer and the resignation while the round waits on its draw', async () => {
    // The engine refuses both there — with no initiative there is nobody whose
    // turn it is to resign — so the buttons must not claim otherwise. The board
    // is inert through the same beat, so this reads as the round not having
    // started rather than as controls flickering.
    render(<App drawDelayMs={4000} seed={2} telegraphMs={0} />)

    expect(screen.getByRole('button', { name: /desistir/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByRole('button', { name: /propor empate/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  test('lets them through the moment the initiative is drawn', async () => {
    render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/iniciativa: azul/i),
    )
    expect(screen.getByRole('button', { name: /desistir/i })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  test('keeps a held button reachable by keyboard', async () => {
    // `disabled` would take it out of the tab order and out of the screen
    // reader, which is the same mistake the board already avoids.
    render(<App drawDelayMs={4000} seed={2} telegraphMs={0} />)

    const resign = screen.getByRole('button', { name: /desistir/i })
    resign.focus()

    expect(resign).not.toBeDisabled()
    expect(resign).toHaveFocus()
  })

  test('keeps what game this is on the page, not behind the gear', async () => {
    // Three topologies and two mechanics are the content, not a preference.
    // Behind a gear most people would play one combination and leave without
    // ever learning the others were there.
    open()

    expect(screen.getByRole('combobox', { name: /mecânica/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /tabuleiro/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /nível/i })).toBeInTheDocument()
  })

  test('keeps the preferences out of the way until they are asked for', async () => {
    // Ten controls parked under the game were most of the page on a phone.
    open()

    expect(screen.queryByRole('checkbox', { name: /sem cor/i })).toBeNull()
    expect(screen.getByRole('button', { name: /configurações/i })).toBeInTheDocument()
  })

  test('opens them over the board, and closes again', async () => {
    // The modal behaviour itself — focus trapped inside, Escape, the page
    // behind gone inert — is the native dialog's and is deliberately not
    // claimed here; jsdom has no dialog at all. See tests/setup.ts.
    const user = userEvent.setup()
    open()

    await user.click(screen.getByRole('button', { name: /configurações/i }))
    expect(screen.getByRole('checkbox', { name: /sem cor/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /fechar/i }))
    expect(screen.queryByRole('checkbox', { name: /sem cor/i })).toBeNull()
  })

  test('closes when the click lands outside it', async () => {
    // A native dialog closes on Escape and not on an outside click, and people
    // expect both. The backdrop is not an element, so the signal is a click
    // whose target is the dialog itself — which only works because the padding
    // sits on the body inside rather than on the dialog.
    const user = userEvent.setup()
    open()

    await user.click(screen.getByRole('button', { name: /configurações/i }))
    expect(screen.getByRole('checkbox', { name: /sem cor/i })).toBeInTheDocument()

    await user.click(document.querySelector('dialog') as HTMLElement)

    expect(screen.queryByRole('checkbox', { name: /sem cor/i })).toBeNull()
  })

  test('stays open when the click lands on something inside it', async () => {
    // The obvious way to get the above wrong is to close on every click that
    // reaches the dialog, which would shut the panel the moment somebody used
    // a control in it.
    const user = userEvent.setup()
    open()

    await user.click(screen.getByRole('button', { name: /configurações/i }))
    await user.click(screen.getByRole('checkbox', { name: /sem cor/i }))

    expect(screen.getByRole('checkbox', { name: /sem cor/i })).toBeInTheDocument()
  })

  test('still offers them once the match is over', async () => {
    // They used to vanish at the end, because ten controls under a finished
    // game were in front of the result. Behind a gear they are in nobody's way,
    // and "play the other board" is exactly what somebody wants right then.
    const user = userEvent.setup()
    render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/iniciativa/i),
    )
    await user.click(screen.getByRole('button', { name: /desistir/i }))
    await screen.findByRole('alert')

    expect(screen.getByRole('button', { name: /configurações/i })).toBeInTheDocument()
  })

  test('brings the interrupted match back when the page is opened again', async () => {
    // Closing the tab must not lose the game (project doc 5). The telegraph is
    // held long so the AI's reply cannot land and blur what is being asserted.
    const user = userEvent.setup()
    const first = render(<App drawDelayMs={0} seed={2} telegraphMs={4000} />)

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/iniciativa: azul/i),
    )
    await user.click(screen.getByRole('gridcell', { name: /A3/ }))
    await user.click(screen.getByRole('gridcell', { name: /B3/ }))
    expect(screen.getByRole('gridcell', { name: /B3, Azul círculo/ })).toBeInTheDocument()
    first.unmount()

    render(<App drawDelayMs={0} seed={2} telegraphMs={4000} />)

    expect(screen.getByRole('gridcell', { name: /B3, Azul círculo/ })).toBeInTheDocument()
  })

  test('brings back who was playing, so the AI does not take a seat that was taken', async () => {
    // Restoring a two-player game as a game against the AI would not merely
    // look wrong: the AI would move for the person sitting there.
    const user = userEvent.setup()
    const first = render(<App drawDelayMs={0} seed={2} telegraphMs={4000} />)
    openSettings()

    await user.click(screen.getByRole('checkbox', { name: /dois jogadores/i }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/iniciativa: azul/i),
    )
    await user.click(screen.getByRole('gridcell', { name: /A3/ }))
    await user.click(screen.getByRole('gridcell', { name: /B3/ }))
    first.unmount()

    render(<App drawDelayMs={0} seed={2} telegraphMs={4000} />)
    openSettings()

    expect(screen.getByRole('checkbox', { name: /dois jogadores/i })).toBeChecked()
  })

  test('keeps nothing once the match is over', async () => {
    // A finished match is a result, and reopening the site onto an old result
    // is worse than opening onto a board.
    const user = userEvent.setup()
    const first = render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/iniciativa/i),
    )
    await user.click(screen.getByRole('button', { name: /desistir/i }))
    await screen.findByRole('alert')
    first.unmount()

    render(<App drawDelayMs={0} seed={2} telegraphMs={0} />)

    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('throws the save away when a new match is started by hand', async () => {
    const user = userEvent.setup()
    const first = render(<App drawDelayMs={0} seed={2} telegraphMs={4000} />)

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/iniciativa: azul/i),
    )
    await user.click(screen.getByRole('gridcell', { name: /A3/ }))
    await user.click(screen.getByRole('gridcell', { name: /B3/ }))
    await user.click(screen.getByRole('button', { name: /nova partida/i }))
    first.unmount()

    render(<App drawDelayMs={0} seed={2} telegraphMs={4000} />)

    // The circle is home again, so nothing came back from the old game.
    expect(screen.queryByRole('gridcell', { name: /B3, Azul círculo/ })).toBeNull()
  })
})
