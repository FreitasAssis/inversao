import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { Room, creationPath } from '../../src/ui/Room'
import { createRoom } from '../../src/net/transport'
import type { Room as Sala, Transport } from '../../src/net/transport'
import type { RoomConfig } from '../../src/net/protocol'
import { isCode } from '../../src/net/code'
import type { Side } from '../../src/engine/types'

/**
 * A tela da sala: conectar, esperar, e sair da frente.
 *
 * A conexão entra por parâmetro, então dá para exercitar os três desfechos —
 * entrei, criei em cima de um código tomado, e a sala não existe — sem rede
 * nenhuma e sem esperar relógio.
 */

const CONFIG: RoomConfig = { board: 'dbu', mechanic: 'choice', evaluation: false }
const CREATING = '?b=dbu&m=choice&e=0'

/** Uma sala em memória por trás da tela, no lugar do WebSocket. */
function wire(sala: Sala) {
  const opened: string[] = []
  const connect = ({ code }: { code: string }): Transport => {
    opened.push(code)
    return sala.join()
  }
  return { connect, opened }
}

/** Um transporte que nunca responde, como um socket que fecha na cara. */
const silent = (): Transport => ({
  send: () => {},
  onReceive: () => () => {},
  close: () => {},
})

const always = (side: Side) => () => side

describe('entrando numa sala', () => {
  beforeEach(() => localStorage.clear())

  test('mostra o tabuleiro quando a sala responde', () => {
    const sala = createRoom(always('blue'), CONFIG)
    const { connect } = wire(sala)

    render(<Room code="K3M9" connect={connect} search="" />)

    expect(screen.getByRole('grid', { name: /tabuleiro/i })).toBeInTheDocument()
  })

  test('joga a partida da sala, e não a do painel de quem entra', () => {
    // O painel abre na Escolha Sorteada. Se a configuração não viesse da sala,
    // as duas telas aceitariam lances diferentes.
    const sala = createRoom(always('blue'), { ...CONFIG, mechanic: 'rotation' })
    const { connect } = wire(sala)

    render(<Room code="K3M9" connect={connect} search="" />)

    expect(screen.getByRole('status')).not.toHaveTextContent(/sorteando/i)
  })

  test('quem entra não manda configuração nenhuma', () => {
    // Mandar a própria faria o link de convite **criar** uma sala em vez de
    // entrar na que existe.
    const sala = createRoom(always('blue'), CONFIG)
    let asked: RoomConfig | undefined
    render(
      <Room
        code="K3M9"
        search=""
        connect={(joining) => {
          asked = joining.config
          return sala.join()
        }}
      />,
    )

    expect(asked).toBeUndefined()
  })
})

describe('criando uma sala', () => {
  beforeEach(() => localStorage.clear())

  test('leva a configuração de quem cria', () => {
    const sala = createRoom(always('blue'), CONFIG)
    let asked: RoomConfig | undefined
    render(
      <Room
        code="K3M9"
        search={CREATING}
        connect={(joining) => {
          asked = joining.config
          return sala.join()
        }}
      />,
    )

    expect(asked).toEqual(CONFIG)
  })

  test('sorteia outro código quando o primeiro já estava em uso', () => {
    // Dois jogadores que sorteiem o mesmo código cairiam na mesma sala, e o
    // segundo entraria numa partida alheia sem nada na tela dizendo isso. Em
    // ~900 mil combinações é raro — e raro sem tratamento é o defeito que
    // aparece uma vez e não se reproduz.
    const taken = createRoom(always('blue'), CONFIG)
    taken.join() // alguém já estabeleceu esta sala
    const free = createRoom(always('blue'), CONFIG)
    const { connect, opened } = (() => {
      const seen: string[] = []
      return {
        opened: seen,
        connect: ({ code }: { code: string }) => {
          seen.push(code)
          return seen.length === 1 ? taken.join() : free.join()
        },
      }
    })()

    render(<Room code="K3M9" search={CREATING} connect={connect} />)

    expect(opened).toHaveLength(2)
    expect(opened[0]).toBe('K3M9')
    expect(isCode(opened[1] as string)).toBe(true)
    expect(opened[1]).not.toBe('K3M9')
  })

  test('mostra o endereço para mandar a alguém', () => {
    const sala = createRoom(always('blue'), CONFIG)
    // Ninguém do outro lado ainda, então a tela de espera é o que aparece.
    render(<Room code="K3M9" search={CREATING} connect={() => silent()} />)

    expect(screen.getByText(/\/sala\/K3M9/)).toBeInTheDocument()
    expect(sala.log()).toHaveLength(0)
  })
})

describe('uma sala que não existe', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
  })

  test('não desiste de uma sala que já respondeu', () => {
    // O relógio existe para o caso de **nada** chegar. Deixá-lo disparar sobre
    // uma partida em andamento trocaria o tabuleiro por "sala não encontrada"
    // quatro segundos depois de tudo ter dado certo.
    const sala = createRoom(always('blue'), CONFIG)
    render(<Room code="K3M9" search="" connect={() => sala.join()} />)

    act(() => vi.advanceTimersByTime(30_000))

    expect(screen.getByRole('grid', { name: /tabuleiro/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /não encontrada/i })).toBeNull()
    vi.useRealTimers()
  })

  test('diz que não existe, em vez de esperar para sempre', () => {
    // Uma sala é memória, não registro: o link sobrevive a ela. Ficar girando
    // seria a resposta errada mais convincente possível.
    render(<Room code="K3M9" search="" connect={() => silent()} />)

    // Dentro de `act`: o tempo passa fora do React, e sem isto a mudança de
    // estado que ele dispara não chega a ser desenhada.
    act(() => vi.advanceTimersByTime(5000))

    expect(screen.getByRole('heading', { name: /não encontrada/i })).toBeInTheDocument()
    vi.useRealTimers()
  })
})

describe('o endereço de criação', () => {
  test('sorteia um código válido e pendura a configuração', () => {
    const path = creationPath(CONFIG, () => 0.5)

    expect(path).toMatch(/^\/sala\/[A-Z2-9]{4}\?b=dbu&m=choice&e=0$/)
  })

  test('marca a barra quando ela está ligada', () => {
    expect(creationPath({ ...CONFIG, evaluation: true }, () => 0)).toContain('e=1')
  })
})
