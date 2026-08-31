import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Invite } from '../../src/ui/Invite'
import { BOARDS_FOR, BOARD_PT, MECHANIC_PT } from '../../src/ui/labels'
import type { Mechanic } from '../../src/ui/labels'
import type { BoardCode } from '../../src/engine/types'

/**
 * O convite existe porque três topologias e duas mecânicas **são** o conteúdo
 * do jogo, e quem só joga o padrão nunca descobre isso.
 */

function setup(board: BoardCode, mechanic: Mechanic) {
  const picked: [BoardCode, Mechanic][] = []
  render(<Invite board={board} mechanic={mechanic} onPick={(b, m) => picked.push([b, m])} />)
  return { picked, user: userEvent.setup() }
}

describe('o convite para outra combinação', () => {
  test('oferece os outros tabuleiros, e não aquele que acabou de ser jogado', () => {
    setup('dbu', 'choice')

    expect(screen.getByRole('button', { name: 'Ponte' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Grade' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Setas' })).toBeNull()
  })

  test('oferece a outra mecânica', () => {
    setup('dbu', 'choice')

    expect(screen.getByRole('button', { name: /Rodízio/ })).toBeInTheDocument()
  })

  test('troca o tabuleiro mantendo a mecânica', async () => {
    const { picked, user } = setup('dbu', 'choice')

    await user.click(screen.getByRole('button', { name: 'Ponte' }))

    expect(picked).toEqual([['nbn', 'choice']])
  })

  test('nunca convida para uma combinação que não existe', async () => {
    // O Rodízio na Ponte empata a partir de qualquer abertura, então não é
    // partida. Convidar para ela levaria a pessoa a uma tela que o app recusa.
    const { picked, user } = setup('nbn', 'choice')

    await user.click(screen.getByRole('button', { name: /Rodízio/ }))

    const [, mechanic] = picked[0] as [BoardCode, Mechanic]
    expect(BOARDS_FOR[mechanic]).toContain((picked[0] as [BoardCode, Mechanic])[0])
  })

  test('avisa quando trocar de mecânica também troca o tabuleiro', async () => {
    // Clicar em "Rodízio" e cair na Grade sem aviso é a tela mudando duas
    // coisas quando a pessoa pediu uma.
    setup('nbn', 'choice')

    expect(screen.getByRole('button', { name: /Rodízio no Grade/ })).toBeInTheDocument()
  })

  test('não avisa troca de tabuleiro quando não há troca', () => {
    setup('dbu', 'choice')

    expect(screen.getByRole('button', { name: /^Rodízio$/ })).toBeInTheDocument()
  })

  test('sai do Rodízio para a Escolha Sorteada no mesmo tabuleiro', async () => {
    const { picked, user } = setup('bbb', 'rotation')

    await user.click(screen.getByRole('button', { name: MECHANIC_PT.choice }))

    expect(picked).toEqual([['bbb', 'choice']])
  })

  test('no Rodízio só resta um tabuleiro para oferecer', () => {
    // São dois ao todo ali, então o convite tem um. Um teste montado sobre a
    // Escolha Sorteada mediria dois e passaria achando que mediu a regra.
    setup('bbb', 'rotation')

    expect(screen.getByRole('button', { name: BOARD_PT.dbu })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: BOARD_PT.nbn })).toBeNull()
  })
})
