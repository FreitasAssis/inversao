import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
    return seatIn(sala)
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

/** A sala pode recusar quando lotada, e nestes testes ela nunca está. */
function seatIn(sala: Sala): Transport {
  const transport = sala.join()
  if (transport === null) throw new Error('a sala recusou a conexão')
  return transport
}

/**
 * O adversário entra, assina e confirma — a metade do aperto de mão que não é
 * da tela sob teste.
 */
function opponentArrives(sala: Sala): Transport {
  const other = seatIn(sala)
  other.onReceive(() => {})
  other.send({ kind: 'ready' })
  return other
}

/** O aperto de mão inteiro: o outro confirma, e esta tela também. */
async function bothStart(sala: Sala): Promise<Transport> {
  let other: Transport | null = null
  act(() => {
    other = opponentArrives(sala)
  })
  await userEvent.setup().click(screen.getByRole('button', { name: /começar/i }))
  return other as unknown as Transport
}

describe('entrando numa sala', () => {
  beforeEach(() => localStorage.clear())

  test('espera enquanto está sozinho, em vez de abrir o tabuleiro', () => {
    // Sem isto, quem cria via o tabuleiro na hora: o sorteio era pedido na
    // montagem, a sala sorteava, e dava para jogar no vazio.
    const sala = createRoom(always('blue'), CONFIG)
    const { connect } = wire(sala)

    render(<Room code="K3M9" connect={connect} search="" />)

    expect(screen.queryByRole('grid', { name: /tabuleiro/i })).toBeNull()
    expect(screen.getByRole('heading', { name: /esperando o adversário/i })).toBeInTheDocument()
  })

  test('não sorteia nada enquanto está sozinho', () => {
    // Segurar o `App` fora da tela segura o sorteio junto, porque é ele quem
    // pede — e um sorteio gasto antes de haver adversário seria uma rodada
    // perdida na lista de ações.
    const sala = createRoom(always('blue'), CONFIG)
    const { connect } = wire(sala)

    render(<Room code="K3M9" connect={connect} search="" />)

    expect(sala.log()).toHaveLength(0)
  })

  test('anuncia a chegada do adversário, e ainda não abre o tabuleiro', () => {
    // O aperto de mão é dos dois: um botão só de um lado mudaria a assimetria
    // de lugar, com quem criou vendo o tabuleiro enquanto o outro decide.
    const sala = createRoom(always('blue'), CONFIG)
    const { connect } = wire(sala)
    render(<Room code="K3M9" connect={connect} search="" />)

    act(() => {
      opponentArrives(sala)
    })

    expect(screen.getByText(/aguarda para iniciar/i)).toBeInTheDocument()
    expect(screen.queryByRole('grid', { name: /tabuleiro/i })).toBeNull()
  })

  test('abre o tabuleiro quando os dois confirmam', async () => {
    const sala = createRoom(always('blue'), CONFIG)
    const { connect } = wire(sala)
    render(<Room code="K3M9" connect={connect} search="" />)

    await bothStart(sala)

    expect(screen.getByRole('grid', { name: /tabuleiro/i })).toBeInTheDocument()
  })

  test('espera o outro depois de eu confirmar sozinho', async () => {
    const sala = createRoom(always('blue'), CONFIG)
    const { connect } = wire(sala)
    render(<Room code="K3M9" connect={connect} search="" />)
    act(() => {
      seatIn(sala).onReceive(() => {})
    })

    await userEvent.setup().click(screen.getByRole('button', { name: /começar/i }))

    expect(screen.getByRole('button', { name: /esperando o outro/i })).toBeDisabled()
    expect(screen.queryByRole('grid', { name: /tabuleiro/i })).toBeNull()
  })

  test('não volta à espera quando o adversário sai', async () => {
    // Voltar desmontaria o `App` e a partida iria junto — a lista de ações
    // vive nele. Perder o adversário no meio é assunto do passo 6, e a resposta
    // lá é uma contagem por cima do tabuleiro, nunca trocar de tela.
    const sala = createRoom(always('blue'), CONFIG)
    const { connect } = wire(sala)
    render(<Room code="K3M9" connect={connect} search="" />)
    const other = await bothStart(sala)

    act(() => other.close())

    expect(screen.getByRole('grid', { name: /tabuleiro/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /esperando/i })).toBeNull()
  })

  test('joga a partida da sala, e não a do painel de quem entra', async () => {
    // O painel abre na Escolha Sorteada. Se a configuração não viesse da sala,
    // as duas telas aceitariam lances diferentes.
    const sala = createRoom(always('blue'), { ...CONFIG, mechanic: 'rotation' })
    const { connect } = wire(sala)

    render(<Room code="K3M9" connect={connect} search="" />)
    await bothStart(sala)

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
          return seatIn(sala)
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
          return seatIn(sala)
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
    seatIn(taken) // alguém já estabeleceu esta sala
    const free = createRoom(always('blue'), CONFIG)
    const { connect, opened } = (() => {
      const seen: string[] = []
      return {
        opened: seen,
        connect: ({ code }: { code: string }) => {
          seen.push(code)
          return seen.length === 1 ? seatIn(taken) : seatIn(free)
        },
      }
    })()

    render(<Room code="K3M9" search={CREATING} connect={connect} />)

    expect(opened).toHaveLength(2)
    expect(opened[0]).toBe('K3M9')
    expect(isCode(opened[1] as string)).toBe(true)
    expect(opened[1]).not.toBe('K3M9')
  })

  test('mostra o endereço para mandar a alguém, e o mantém até o outro chegar', () => {
    // O link é a razão de a tela existir. Ele ficava escondido atrás de um
    // estado que durava milissegundos, então quem criava nunca o via.
    const sala = createRoom(always('blue'), CONFIG)
    const { connect } = wire(sala)

    render(<Room code="K3M9" search={CREATING} connect={connect} />)

    expect(screen.getByText(/\/sala\/K3M9/)).toBeInTheDocument()
  })

  test('some com o convite quando o adversário chega', () => {
    // Depois que ele está lá, o link é ruído.
    const sala = createRoom(always('blue'), CONFIG)
    const { connect } = wire(sala)
    render(<Room code="K3M9" search={CREATING} connect={connect} />)

    act(() => {
      opponentArrives(sala)
    })

    expect(screen.queryByText(/mande este endereço/i)).toBeNull()
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
    render(<Room code="K3M9" search="" connect={() => seatIn(sala)} />)
    act(() => {
      opponentArrives(sala)
    })
    // Com relógio falso, `userEvent` trava; o clique cru serve.
    act(() => screen.getByRole('button', { name: /começar/i }).click())

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

describe('o convite', () => {
  beforeEach(() => localStorage.clear())

  test('o endereço é um link, e não só texto', () => {
    // Quem já está no computador certo simplesmente clica.
    const sala = createRoom(always('blue'), CONFIG)
    const { connect } = wire(sala)
    render(<Room code="K3M9" search={CREATING} connect={connect} />)

    expect(screen.getByRole('link', { name: /\/sala\/K3M9/ })).toHaveAttribute(
      'href',
      '/sala/K3M9',
    )
  })

  test('copia o endereço quando pedido', async () => {
    const copied: string[] = []
    // A ordem importa: `userEvent.setup()` instala o **próprio** dublê de
    // `navigator.clipboard`, então instalar o nosso antes dele é instalar para
    // ninguém — e o teste passava a medir o dublê da biblioteca.
    const user = userEvent.setup()
    // `defineProperty` e não `Object.assign`: `navigator.clipboard` é um
    // acessor só de leitura, e atribuir a ele não substitui nada.
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          copied.push(text)
        },
      },
    })
    const sala = createRoom(always('blue'), CONFIG)
    const { connect } = wire(sala)
    render(<Room code="K3M9" search={CREATING} connect={connect} />)

    await user.click(screen.getByRole('button', { name: /copiar/i }))

    // A confirmação é o que espera a promessa da área de transferência, e é
    // também o que o usuário precisa ver: sem ela, clicar não produz efeito
    // visível nenhum e parece quebrado.
    expect(await screen.findByRole('button', { name: /copiado/i })).toBeInTheDocument()
    expect(copied[0]).toContain('/sala/K3M9')
  })

  test('não esconde o endereço atrás do botão', () => {
    // Sem `clipboard` — navegador antigo, ou página sem HTTPS — o botão não faz
    // nada. O texto continua ali para selecionar à mão.
    const sala = createRoom(always('blue'), CONFIG)
    const { connect } = wire(sala)
    render(<Room code="K3M9" search={CREATING} connect={connect} />)

    expect(screen.getByText(/\/sala\/K3M9/)).toBeVisible()
  })
})

describe('voltar depois de o navegador morrer', () => {
  beforeEach(() => localStorage.clear())

  test('guarda o crachá e o devolve ao reabrir a mesma sala', () => {
    // É o que faz voltar ao próprio assento em vez de virar espectador da
    // própria partida. Em `localStorage` porque o caso é justamente o navegador
    // **fechado** — a sessão morre junto com ele.
    const sala = createRoom(always('blue'), CONFIG)
    const seen: (string | undefined)[] = []
    const connect = (joining: { code: string; token?: string | undefined }) => {
      seen.push(joining.token)
      return seatIn(sala)
    }

    const first = render(<Room code="K3M9" search="" connect={connect} />)
    first.unmount()
    render(<Room code="K3M9" search="" connect={connect} />)

    expect(seen[0]).toBeDefined()
    expect(seen[1]).toBe(seen[0])
  })

  test('cada sala tem o seu', () => {
    // Guardar um só e reusá-lo noutra sala daria a alguém o assento de uma
    // partida em que ele nunca entrou.
    const sala = createRoom(always('blue'), CONFIG)
    const seen: (string | undefined)[] = []
    const connect = (joining: { code: string; token?: string | undefined }) => {
      seen.push(joining.token)
      return seatIn(sala)
    }

    render(<Room code="K3M9" search="" connect={connect} />).unmount()
    render(<Room code="P7XQ" search="" connect={connect} />)

    expect(seen[1]).not.toBe(seen[0])
  })
})

describe('o nome de quem entra', () => {
  beforeEach(() => localStorage.clear())

  test('sai das configurações e vai com a conexão', () => {
    // Sem chegar na hora de sentar, a sala não teria como contar aos outros
    // quem chegou — e as duas telas contariam a partida com nomes diferentes.
    localStorage.setItem('inversao:settings', JSON.stringify({ playerName: 'Luiz' }))
    const sala = createRoom(always('blue'), CONFIG)
    let sent: string | undefined
    render(
      <Room
        code="K3M9"
        search=""
        connect={(joining) => {
          sent = joining.name
          return seatIn(sala)
        }}
      />,
    )

    expect(sent).toBe('Luiz')
  })
})
