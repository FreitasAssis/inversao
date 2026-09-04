import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Board, telegraphFor } from '../../src/ui/Board'
import { applyAction, startMatch } from '../../src/engine/match'
import type { Match } from '../../src/engine/match'
import { legalMoves } from '../../src/engine/moves'
import { PIECES } from '../../src/engine/types'
import type { Cell, Piece, Placement, Side } from '../../src/engine/types'

const rodizio = () => startMatch({ board: 'dbu', mechanic: 'rotation' })

/** Renders and hands back whatever the last onPlay reported. */
function setup(match: Match = rodizio()) {
  const played: unknown[] = []
  render(<Board match={match} onPlay={(action) => played.push(action)} />)
  return { played, user: userEvent.setup() }
}

describe('Board', () => {
  test('names the cells so they can be read out and reasoned about', () => {
    setup()

    expect(screen.getByRole('gridcell', { name: /A1/ })).toBeInTheDocument()
    expect(screen.getByRole('gridcell', { name: /D3/ })).toBeInTheDocument()
  })

  test('says whose turn it is and which piece moves', () => {
    setup()

    // The classic slip in local two-player is moving on the other side's turn,
    // so this is stated rather than implied by colour (project doc 6.1).
    expect(screen.getByRole('status')).toHaveTextContent(/azul/i)
    expect(screen.getByRole('status')).toHaveTextContent(/quadrado/i)
  })

  test('keeps every cell reachable, legal or not', () => {
    // Cells are not `disabled`: a disabled button takes no focus, so the board
    // would be unreadable from the keyboard and to a screen reader. Illegal
    // cells are marked instead, and simply do nothing when activated.
    setup()

    for (const name of ['A1', 'B2', 'D3']) {
      const cell = screen.getByRole('gridcell', { name: new RegExp(name) })
      expect(cell).not.toBeDisabled()
    }
    expect(screen.getByRole('gridcell', { name: /B1/ })).toHaveAttribute(
      'aria-disabled',
      'false',
    )
    expect(screen.getByRole('gridcell', { name: /B2/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  test('does nothing when an illegal cell is activated', async () => {
    const { played, user } = setup()

    await user.click(screen.getByRole('gridcell', { name: /B2/ }))

    expect(played).toEqual([])
  })

  test('walks the grid with the arrow keys', async () => {
    // A 4x3 grid is navigated, not tabbed through: one tab stop, arrows inside.
    const { user } = setup()

    await user.tab()
    expect(screen.getByRole('gridcell', { name: /A1/ })).toHaveFocus()

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('gridcell', { name: /A2/ })).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('gridcell', { name: /B2/ })).toHaveFocus()

    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('gridcell', { name: /B1/ })).toHaveFocus()
  })

  test('reports the move when a legal cell is chosen', async () => {
    const { played, user } = setup()

    await user.click(screen.getByRole('gridcell', { name: /B1/ }))

    expect(played).toEqual([{ type: 'move', piece: 'square', to: 3 }])
  })

  test('can be played from the keyboard alone', async () => {
    // Keyboard support goes in while the board is being built, not later: it
    // changes how cells are rendered and focused (project doc 11, step 2).
    const { played, user } = setup()

    await user.tab()
    await user.keyboard('{ArrowDown}{Enter}')

    expect(played).toEqual([{ type: 'move', piece: 'square', to: 3 }])
  })

  test('states the piece and owner in text, not only in colour', () => {
    // Colour must never be the only channel: the accessible name carries the
    // owner and the symbol, which is also what the colourless mode relies on.
    setup()

    expect(screen.getByRole('gridcell', { name: /A1.*azul.*quadrado/i })).toBeInTheDocument()
  })

  test('announces a pass instead of showing a dead board', () => {
    const boxed = {
      ...startMatch({ board: 'dbu', mechanic: 'rotation', opening: 'circle' }),
      placement: { blue: [0, 1, 3], orange: [9, 10, 11] },
    } as Match

    setup(boxed)

    expect(screen.getByRole('status')).toHaveTextContent(/passa/i)
    expect(screen.getByRole('button', { name: /passar/i })).toBeInTheDocument()
  })

  test('draws the middle band, which is what tells the boards apart', async () => {
    // Twelve identical squares render the Ponte and the Setas the same way, and
    // the rule that separates them disappears (spec 1.2).
    const { container } = render(
      <Board match={startMatch({ board: 'nbn', mechanic: 'rotation' })} onPlay={() => {}} />,
    )

    const links = [...container.querySelectorAll('[data-link]')].map((node) =>
      node.getAttribute('data-link'),
    )
    expect(links).toEqual(['none', 'both', 'none'])
  })

  test('shows the one-way columns as one-way', async () => {
    const { container } = render(
      <Board match={startMatch({ board: 'dbu', mechanic: 'rotation' })} onPlay={() => {}} />,
    )

    const links = [...container.querySelectorAll('[data-link]')].map((node) =>
      node.getAttribute('data-link'),
    )
    expect(links).toEqual(['down', 'both', 'up'])
  })

  test('splits the grid into the two blocks the band joins', () => {
    // Rows A-B and C-D are one block each; crossing between them is the game.
    const { container } = render(<Board match={rodizio()} onPlay={() => {}} />)

    expect(container.querySelectorAll('[data-block]')).toHaveLength(2)
  })
})

describe('naming a piece by clicking it', () => {
  /** Escolha Sorteada with the initiative already drawn for blue. */
  function naming() {
    const drawn = applyAction(startMatch({ board: 'dbu', mechanic: 'choice' }), {
      type: 'draw',
      initiative: 'blue',
    })
    if (!drawn.ok) throw new Error(drawn.reason)
    return drawn.match
  }

  test('marks the pieces that can be named', () => {
    // Naming is the decision of the game, so it happens on the board, not in a
    // list of words beside it.
    render(<Board match={naming()} onPlay={() => {}} />)

    for (const name of ['A1', 'A2', 'A3']) {
      expect(screen.getByRole('gridcell', { name: new RegExp(name) })).toHaveAttribute(
        'data-nameable',
        'true',
      )
    }
    expect(screen.getByRole('gridcell', { name: /D1/ })).not.toHaveAttribute('data-nameable')
  })

  test('lights the destinations once a piece is picked', async () => {
    const user = userEvent.setup()
    render(<Board match={naming()} onPlay={() => {}} />)

    await user.click(screen.getByRole('gridcell', { name: /A1/ }))

    // Blue's square on A1 can only reach B1.
    expect(screen.getByRole('gridcell', { name: /B1/ })).toHaveAttribute('data-legal', 'true')
  })

  test('plays the move on the second click', async () => {
    const played: unknown[] = []
    const user = userEvent.setup()
    render(<Board match={naming()} onPlay={(action) => played.push(action)} />)

    await user.click(screen.getByRole('gridcell', { name: /A1/ }))
    await user.click(screen.getByRole('gridcell', { name: /B1/ }))

    expect(played).toEqual([{ type: 'move', piece: 'square', to: 3 }])
  })

  test('offers the deliberate pass when a named piece cannot move', async () => {
    // Naming a piece with nowhere to go is the game's sharpest move, not an
    // error: you pass on purpose to force the opponent onto that symbol.
    const boxed = { ...naming(), placement: { blue: [0, 1, 3], orange: [9, 10, 11] } } as Match
    const played: unknown[] = []
    const user = userEvent.setup()
    render(<Board match={boxed} onPlay={(action) => played.push(action)} />)

    await user.click(screen.getByRole('gridcell', { name: /A1/ }))
    await user.click(screen.getByRole('button', { name: /passar/i }))

    expect(played).toEqual([{ type: 'pass', piece: 'circle' }])
  })
})

describe('showing a move happen', () => {
  test('marks the piece about to move and where it is going', () => {
    // The AI announces first and plays after. Without that the position simply
    // changes and the player never sees what happened.
    render(<Board match={rodizio()} onPlay={() => {}} telegraph={{ from: 0, to: 3, piece: 'square' }} />)

    expect(screen.getByRole('gridcell', { name: /A1/ })).toHaveAttribute('data-telegraph', 'from')
    expect(screen.getByRole('gridcell', { name: /B1/ })).toHaveAttribute('data-telegraph', 'to')
  })

  test('marks nothing when nothing is announced', () => {
    const { container } = render(<Board match={rodizio()} onPlay={() => {}} />)

    expect(container.querySelectorAll('[data-telegraph]')).toHaveLength(0)
  })

  test('says the announced move out loud', () => {
    render(<Board match={rodizio()} onPlay={() => {}} telegraph={{ from: 0, to: 3, piece: 'square' }} />)

    expect(screen.getByRole('status')).toHaveTextContent(/A1.*B1/i)
  })

  test('marks the piece that just arrived, so it can slide in', () => {
    // Telegraph and slide are two halves of the same thing: one says what is
    // about to happen, the other shows it happening.
    const played = applyAction(rodizio(), { type: 'move', piece: 'square', to: 3 })
    if (!played.ok) throw new Error(played.reason)

    render(<Board match={played.match} onPlay={() => {}} />)

    const arrived = screen.getByRole('gridcell', { name: /B1/ })
    expect(arrived).toHaveAttribute('data-arrived', 'true')
    expect(arrived).toHaveAttribute('data-from', '0')
  })
})

describe('staging the draw', () => {
  const sorteada = () => startMatch({ board: 'dbu', mechanic: 'choice' })

  test('shows the draw while the round waits for it', () => {
    render(<Board match={sorteada()} onPlay={() => {}} />)

    expect(screen.getByRole('img', { name: /sorteando/i })).toBeInTheDocument()
  })

  test('keeps the board out of reach until the draw lands', () => {
    // Spec 4.1: the draw is an event clearly *prior* to the decision, and only
    // then does the board become interactive.
    render(<Board match={sorteada()} onPlay={() => {}} />)

    for (const name of ['A1', 'A2', 'A3']) {
      expect(screen.getByRole('gridcell', { name: new RegExp(name) })).toHaveAttribute(
        'aria-disabled',
        'true',
      )
    }
  })

  test('shows who took it once it has landed', () => {
    const drawn = applyAction(sorteada(), { type: 'draw', initiative: 'orange' })
    if (!drawn.ok) throw new Error(drawn.reason)

    render(<Board match={drawn.match} onPlay={() => {}} />)

    expect(screen.getByRole('img', { name: /iniciativa.*laranja/i })).toBeInTheDocument()
  })

  test('never stages a draw in the Rodizio, which has none', () => {
    render(<Board match={rodizio()} onPlay={() => {}} />)

    expect(screen.queryByRole('img', { name: /sorteando|iniciativa/i })).toBeNull()
  })
})

describe('changing your mind about a piece', () => {
  function naming() {
    const drawn = applyAction(startMatch({ board: 'dbu', mechanic: 'choice' }), {
      type: 'draw',
      initiative: 'blue',
    })
    if (!drawn.ok) throw new Error(drawn.reason)
    return drawn.match
  }

  test('lets a chosen piece be dropped again', async () => {
    // Naming is not committed until the move is: picking a piece and seeing
    // where it can go is how you find out you wanted another one.
    const user = userEvent.setup()
    render(<Board match={naming()} onPlay={() => {}} />)

    await user.click(screen.getByRole('gridcell', { name: /A1/ }))
    expect(screen.getByRole('gridcell', { name: /B1/ })).toHaveAttribute('data-legal', 'true')

    await user.click(screen.getByRole('gridcell', { name: /A1/ }))

    expect(screen.getByRole('gridcell', { name: /B1/ })).not.toHaveAttribute('data-legal')
    expect(screen.getByRole('status')).toHaveTextContent(/escolha uma peça/i)
  })

  test('switches straight to another piece', async () => {
    const user = userEvent.setup()
    render(<Board match={naming()} onPlay={() => {}} />)

    await user.click(screen.getByRole('gridcell', { name: /A1/ }))
    await user.click(screen.getByRole('gridcell', { name: /A3/ }))

    // A3 holds blue's circle, which can only reach B3.
    expect(screen.getByRole('status')).toHaveTextContent(/movendo o círculo/i)
    expect(screen.getByRole('gridcell', { name: /B3/ })).toHaveAttribute('data-legal', 'true')
  })

  test('keeps the other pieces reachable while one is chosen', async () => {
    const user = userEvent.setup()
    render(<Board match={naming()} onPlay={() => {}} />)

    await user.click(screen.getByRole('gridcell', { name: /A1/ }))

    expect(screen.getByRole('gridcell', { name: /A2/ })).toHaveAttribute('data-nameable', 'true')
  })
})

describe('empty landing slots', () => {
  /** A midgame position: blue's circle and square slots are open on row D. */
  const OPEN = { blue: [0, 1, 6], orange: [2, 11, 5] } as unknown as Placement
  const midgame = () =>
    render(
      <Board
        match={startMatch({ board: 'bbb', mechanic: 'choice' }, OPEN)}
        onPlay={() => {}}
      />,
    )

  test('says whose slot it is, in the pixels and not only in the label', () => {
    // Without this there is no way to see which direction you are going. In a
    // match you watched your pieces leave the top row, so you know; dropped
    // into a puzzle midgame you have nothing, and every empty outline looks the
    // same as every other. The screen reader was being told and the screen
    // was not.
    midgame()

    const mine = document.querySelector('[data-cell="9"]')
    expect(mine).toHaveAttribute('data-slot', 'circle')
    expect(mine).toHaveAttribute('data-slot-side', 'blue')
  })

  test('tells the two sides apart, which is what makes direction readable', () => {
    // Both home rows empty: three slots waiting at the top and three at the
    // bottom. If they carried the same mark there would be no way to see which
    // way you are travelling.
    const CROSSED = { blue: [3, 4, 5], orange: [6, 7, 8] } as unknown as Placement
    render(
      <Board
        match={startMatch({ board: 'bbb', mechanic: 'choice' }, CROSSED)}
        onPlay={() => {}}
      />,
    )

    const sides = [...document.querySelectorAll('[data-slot-side]')].map((cell) =>
      cell.getAttribute('data-slot-side'),
    )

    expect(sides.filter((side) => side === 'blue')).toHaveLength(3)
    expect(sides.filter((side) => side === 'orange')).toHaveLength(3)
  })
})

/**
 * O passe, que era a única jogada que a tela não contava.
 *
 * Na Escolha Sorteada, nomear uma peça sem lance legal é a jogada forte: você
 * passa de propósito para obrigar o adversário àquele símbolo. Ela não move
 * nada, então sem anúncio acontece em silêncio absoluto — e a vez volta presa a
 * um símbolo que o jogador nunca viu ninguém escolher.
 *
 * Foi assim por um ano. `action.type !== 'move'` mandava passe, sorteio, oferta
 * e desistência todos pelo mesmo caminho mudo, e nenhum teste reparou porque
 * todos perguntavam o que a tela mostra, e o defeito era o que ela não mostra.
 */
describe('anunciando um passe', () => {
  const sorteio = (initiative: Side = 'orange') => {
    const drawn = applyAction(startMatch({ board: 'dbu', mechanic: 'choice' }), {
      type: 'draw',
      initiative,
    })
    if (!drawn.ok) throw new Error(drawn.reason)
    return drawn.match
  }

  const cellOf = (match: Match, side: Side, piece: Piece) =>
    match.placement[side][PIECES.indexOf(piece)] as Cell

  test('diz qual peça foi nomeada quando quem tem a iniciativa passa', () => {
    // O jogador precisa saber a qual símbolo está sendo obrigado, e a origem
    // sozinha não diz isso a quem ainda está aprendendo o jogo.
    const match = sorteio('orange')

    render(
      <Board
        match={match}
        onPlay={() => {}}
        telegraph={{ from: cellOf(match, 'orange', 'circle'), to: null, piece: 'circle' }}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(/nomeia/i)
    expect(screen.getByRole('status')).toHaveTextContent(/círculo/i)
  })

  test('diz que o adversário passou quando ele estava obrigado', () => {
    const drawn = sorteio('blue')
    // O destino vem das regras, e não de um número escolhido a dedo: o
    // tabuleiro muda e um literal aqui vira 'illegal destination' silencioso.
    const to = legalMoves('dbu', drawn.placement, 'blue', 'circle')[0] as Cell
    const named = applyAction(drawn, { type: 'move', piece: 'circle', to })
    if (!named.ok) throw new Error(named.reason)

    render(
      <Board
        match={named.match}
        onPlay={() => {}}
        telegraph={{ from: cellOf(named.match, 'orange', 'circle'), to: null, piece: 'circle' }}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(/passa/i)
    expect(screen.getByRole('status')).toHaveTextContent(/círculo/i)
  })

  test('marca a peça nomeada e nenhum destino, porque não há destino', () => {
    const match = sorteio('orange')
    const from = cellOf(match, 'orange', 'circle')

    const { container } = render(
      <Board match={match} onPlay={() => {}} telegraph={{ from, to: null, piece: 'circle' }} />,
    )

    expect(container.querySelectorAll('[data-telegraph="from"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-telegraph="to"]')).toHaveLength(0)
  })
})

describe('telegraphFor', () => {
  // A regra vive fora do efeito onde nasceu justamente para caber num teste:
  // dentro dele só dava para exercitá-la achando uma partida em que a IA passa.
  const match = startMatch({ board: 'dbu', mechanic: 'choice' })

  test('anuncia um lance com origem e destino', () => {
    const from = match.placement.blue[PIECES.indexOf('square')] as Cell

    expect(telegraphFor(match, { type: 'move', piece: 'square', to: 4 }, 'blue')).toEqual({
      from,
      to: 4,
      piece: 'square',
    })
  })

  test('anuncia um passe, com a peça e sem destino', () => {
    const from = match.placement.blue[PIECES.indexOf('circle')] as Cell

    expect(telegraphFor(match, { type: 'pass', piece: 'circle' }, 'blue')).toEqual({
      from,
      to: null,
      piece: 'circle',
    })
  })

  test.each([
    ['draw', { type: 'draw', initiative: 'blue' }],
    ['offerDraw', { type: 'offerDraw' }],
    ['resign', { type: 'resign' }],
  ] as const)('não anuncia %s, que não é uma peça se mexendo', (_name, action) => {
    // O sorteio tem a moeda e a sua própria espera; os outros dois não são
    // lances. Anunciá-los seria marcar uma casa que não tem nada a ver.
    expect(telegraphFor(match, action, 'blue')).toBeNull()
  })
})

/**
 * Online cada jogador tem a sua tela, e o tabuleiro precisa saber de quem ela é.
 *
 * Sem isso, o adversário nomeava a **sua** peça: cada tela guardava a própria
 * escolha até o lance sair, então as duas mostravam símbolos diferentes e
 * nenhuma conseguia jogar.
 */
describe('a tela de quem espera', () => {
  const boxed = () =>
    ({
      ...startMatch({ board: 'dbu', mechanic: 'rotation', opening: 'circle' }),
      placement: { blue: [0, 1, 3], orange: [9, 10, 11] },
    }) as Match

  test('não marca destino nenhum', () => {
    // Um destino marcado é um convite a tocar, e tocar ali não faz nada.
    const { container } = render(
      <Board match={rodizio()} onPlay={() => {}} viewer="orange" />,
    )

    expect(container.querySelectorAll('[data-legal]')).toHaveLength(0)
  })

  test('marca os destinos na tela de quem joga', () => {
    const { container } = render(<Board match={rodizio()} onPlay={() => {}} viewer="blue" />)

    expect(container.querySelectorAll('[data-legal]').length).toBeGreaterThan(0)
  })

  test('não diz que o adversário passa quando ele tem para onde ir', () => {
    // `stuck` saía dos destinos **marcados**, e a tela de quem espera não marca
    // nenhum — então toda vez do adversário lia como peça presa. Poder mover e
    // dizer que a peça está travada são perguntas diferentes: uma é fato da
    // posição, a outra é escolha de exibição.
    render(<Board match={rodizio()} onPlay={() => {}} viewer="orange" />)

    expect(screen.getByRole('status')).not.toHaveTextContent(/passa/i)
    expect(screen.getByRole('status')).toHaveTextContent(/vez de azul/i)
  })

  test('diz que o adversário passa quando ele está mesmo preso', () => {
    render(<Board match={boxed()} onPlay={() => {}} viewer="orange" />)

    expect(screen.getByRole('status')).toHaveTextContent(/passa/i)
  })

  test('não oferece passar pelo adversário', () => {
    render(<Board match={boxed()} onPlay={() => {}} viewer="orange" />)

    expect(screen.queryByRole('button', { name: /passar/i })).toBeNull()
  })

  test('oferece passar a quem está preso', () => {
    render(<Board match={boxed()} onPlay={() => {}} viewer="blue" />)

    expect(screen.getByRole('button', { name: /passar/i })).toBeInTheDocument()
  })

  test('quem assiste não joga por ninguém', () => {
    const { container } = render(
      <Board match={rodizio()} onPlay={() => {}} viewer="spectator" />,
    )

    expect(container.querySelectorAll('[data-legal]')).toHaveLength(0)
    expect(container.querySelectorAll('[data-nameable]')).toHaveLength(0)
  })
})
