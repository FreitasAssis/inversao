import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, test } from 'vitest'
import { render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import { createRoom } from '../../src/net/transport'
import type { Side } from '../../src/engine/types'
import type { RoomConfig } from '../../src/net/protocol'

/**
 * Duas telas, uma sala, sem rede.
 *
 * A seção 6.7 do projeto aponta o custo real do multiplayer: testar passa a
 * exigir dois clientes abertos em toda iteração. É aqui que a costura da
 * decisão 4 se paga — com o transporte em memória, os dois clientes cabem num
 * `jsdom` só, determinísticos e em milissegundos.
 *
 * A sala daqui **não é um dublê simplificado**: carimbar autor, numerar e
 * sortear uma vez por rodada é tudo o que o Durable Object vai fazer.
 */

/** Sempre a mesma iniciativa, para a partida ser sempre a mesma. */
const always = (side: Side) => () => side

const CONFIG: RoomConfig = { board: 'dbu', mechanic: 'choice', evaluation: false }

/** A sala pode recusar quando está lotada, e nestes testes ela nunca está. */
function seatIn(where: ReturnType<typeof createRoom>) {
  const transport = where.join()
  if (transport === null) throw new Error('a sala recusou a conexão')
  return transport
}

function table(initiative: Side = 'blue') {
  const room = createRoom(always(initiative), CONFIG)
  // Quem senta onde é decisão da sala: o primeiro a entrar é o azul.
  const seats = { blue: seatIn(room), orange: seatIn(room) }
  const blue = render(<App online={{ transport: seats.blue }} />)
  const orange = render(<App online={{ transport: seats.orange }} />)
  return {
    room: Object.assign(room, {
      /** Os dois jogadores saindo, como duas abas fechadas. */
      seatsClosed: () => {
        seats.blue.close()
        seats.orange.close()
      },
    }),
    /** Reassina o azul, como um efeito que remonta faria. */
    resubscribe: () => blue.rerender(<App online={{ transport: seats.blue }} />),
    // Os assentos crus, para um teste poder mandar o que a interface nunca
    // mandaria — que é exatamente o que um cliente malicioso faz.
    seats,
    blue: within(blue.container),
    orange: within(orange.container),
    user: userEvent.setup(),
  }
}

/** A posição como cada tela a está desenhando, para comparar as duas. */
const seen = (screen: ReturnType<typeof within>) =>
  screen
    .getAllByRole('gridcell')
    .map((cell: HTMLElement) => `${cell.getAttribute('data-side') ?? '.'}${cell.getAttribute('data-piece') ?? ''}`)
    .join(' ')

describe('duas telas na mesma sala', () => {
  beforeEach(() => localStorage.clear())

  test('as duas abrem na mesma posição', () => {
    const { blue, orange } = table()

    expect(seen(blue)).toBe(seen(orange))
  })

  test('as duas recebem o mesmo sorteio', () => {
    // A sala sorteia uma vez, mesmo com os dois clientes pedindo. Dois sorteios
    // na mesma rodada seriam duas partidas.
    const { blue, orange, room } = table('orange')

    expect(room.log().filter((message) => message.action.type === 'draw')).toHaveLength(1)
    expect(blue.getByRole('status')).toHaveTextContent(/laranja/i)
    expect(orange.getByRole('status')).toHaveTextContent(/laranja/i)
  })

  test('cada tela fala do seu ponto de vista', () => {
    // Não é a mesma frase nas duas, e não deveria ser: quem tem a iniciativa é
    // convidado a escolher, e quem espera é informado de que o outro escolhe.
    const { blue, orange } = table('orange')

    expect(orange.getByRole('status')).toHaveTextContent(/escolha uma peça/i)
    expect(blue.getByRole('status')).toHaveTextContent(/está escolhendo/i)
  })

  test('não anuncia uma peça que ninguém nomeou', () => {
    // O texto caía num `?? 'circle'` e dizia "movendo o círculo" na tela de quem
    // estava esperando — em toda rodada, sobre um símbolo inexistente.
    const { blue } = table('orange')

    expect(blue.getByRole('status')).not.toHaveTextContent(/movendo/i)
  })

  test('não deixa nomear a peça do adversário', () => {
    // Cada tela guarda a própria escolha até o lance sair, então sem isto os
    // dois nomeavam e cada um via um símbolo diferente — nenhum deles podendo
    // jogar.
    const { blue } = table('orange')

    expect(blue.getByRole('gridcell', { name: /^D1,/ })).not.toHaveAttribute('data-nameable')
  })

  test('o lance de um aparece no outro', async () => {
    const { blue, orange, user } = table('blue')
    const before = seen(orange)

    await user.click(blue.getByRole('gridcell', { name: /^A1,/ }))
    await user.click(blue.getByRole('gridcell', { name: /^B1,/ }))

    expect(seen(orange)).not.toBe(before)
    expect(seen(orange)).toBe(seen(blue))
  })

  test('quem não está na vez não move nada', async () => {
    // Sem esta guarda, os dois lados jogariam o mesmo lance e a sala aceitaria
    // os dois — a partida andaria dois lances por rodada.
    const { orange, room, user } = table('blue')

    await user.click(orange.getByRole('gridcell', { name: /^D1,/ }))
    await user.click(orange.getByRole('gridcell', { name: /^C1,/ }))

    expect(room.log().filter((message) => message.action.type === 'move')).toHaveLength(0)
  })

  test('a desistência de um encerra a partida nos dois', async () => {
    const { blue, orange, user } = table('blue')

    await user.click(blue.getByRole('button', { name: /desistir/i }))

    expect(blue.getByRole('alert')).toHaveTextContent(/Vitória de Laranja/)
    expect(orange.getByRole('alert')).toHaveTextContent(/Vitória de Laranja/)
  })

  test('a IA não entra numa partida online', async () => {
    // Se ela entrasse, jogaria pelo adversário enquanto ele pensa — e as duas
    // telas divergiriam na primeira rodada.
    const { blue, orange, room } = table('blue')

    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(room.log().filter((message) => message.action.type === 'move')).toHaveLength(0)
    expect(seen(blue)).toBe(seen(orange))
  })

  test('nenhuma das duas salva a partida no aparelho', () => {
    // A sala não sobrevive ao fechar da aba: restaurar levaria a pessoa a um
    // tabuleiro sem ninguém do outro lado.
    table('blue')

    expect(localStorage.getItem('inversao:match')).toBeNull()
  })
})

describe('um cliente malicioso', () => {
  beforeEach(() => localStorage.clear())

  test('não desiste pelo adversário', () => {
    // O ataque inteiro, ponta a ponta: `resign` mandado na vez do adversário.
    // Sem a checagem de autoria, o motor grava `winner: other(side)` com `side`
    // sendo de quem é a vez — e quem mandou vence com uma mensagem.
    const { orange, seats } = table('orange')

    seats.blue.send({ kind: 'act', action: { type: 'resign' } })

    expect(orange.queryByRole('alert')).toBeNull()
  })

  test('não aceita o próprio empate', () => {
    const { blue, orange, seats } = table('blue')

    seats.blue.send({ kind: 'act', action: { type: 'offerDraw' } })
    seats.blue.send({ kind: 'act', action: { type: 'acceptDraw' } })

    expect(blue.queryByRole('alert')).toBeNull()
    expect(orange.queryByRole('alert')).toBeNull()
  })

  test('não trava a partida ao ter uma mensagem recusada', async () => {
    // A sala numera **tudo** o que transmite, inclusive o que os clientes
    // recusam — ela não conhece as regras. Se o cliente contasse a própria
    // lista de ações, uma mensagem recusada dessincronizaria a sequência para
    // sempre e a partida travaria depois de qualquer tentativa de trapaça.
    const { blue, orange, seats, user } = table('blue')

    seats.orange.send({ kind: 'act', action: { type: 'resign' } })

    await user.click(blue.getByRole('gridcell', { name: /^A1,/ }))
    await user.click(blue.getByRole('gridcell', { name: /^B1,/ }))

    expect(seen(orange)).toBe(seen(blue))
    expect(orange.getByRole('gridcell', { name: /^B1,/ })).toHaveAttribute('data-side', 'blue')
  })
})

describe('reassinar', () => {
  beforeEach(() => localStorage.clear())

  test('não conta duas vezes o que já aconteceu', async () => {
    // Assinar entrega o log inteiro, porque é assim que quem chega depois se
    // põe em dia. Um efeito que remonta assina de novo e recebe tudo outra vez
    // — e se o contador andasse com essas repetições, ele passaria à frente da
    // sala e a próxima mensagem de verdade seria recusada para sempre.
    const { blue, orange, user, resubscribe } = table('blue')

    resubscribe()
    await user.click(blue.getByRole('gridcell', { name: /^A1,/ }))
    await user.click(blue.getByRole('gridcell', { name: /^B1,/ }))

    expect(orange.getByRole('gridcell', { name: /^B1,/ })).toHaveAttribute('data-side', 'blue')
    expect(seen(blue)).toBe(seen(orange))
  })
})

describe('o que a sala decide', () => {
  beforeEach(() => localStorage.clear())

  test('a partida é a da sala, e não a do painel de quem entra', () => {
    // O painel abre na Escolha Sorteada. Se a configuração não viajasse, quem
    // entra jogaria outra mecânica — e as duas telas aceitariam lances
    // diferentes, cada uma achando que a outra é que trapaceia.
    const room = createRoom(always('blue'), { ...CONFIG, mechanic: 'rotation' })
    const first = within(render(<App online={{ transport: seatIn(room) }} />).container)

    // No Rodízio ninguém sorteia: a vez já é de alguém, com peça definida.
    expect(first.getByRole('status')).toHaveTextContent(/vez de/i)
    expect(first.getByRole('status')).not.toHaveTextContent(/sorteando/i)
  })

  test('quem assiste não move nada', async () => {
    // A terceira tela não tem assento. A regra é da sala — o `send` dela não
    // produz ação nenhuma —, e a tela não precisa de um botão desabilitado.
    const { room, blue, user } = table('blue')
    const watcher = within(render(<App online={{ transport: seatIn(room) }} />).container)

    await user.click(watcher.getByRole('gridcell', { name: /^A1,/ }))
    await user.click(watcher.getByRole('gridcell', { name: /^B1,/ }))

    expect(room.log().filter((message) => message.action.type === 'move')).toHaveLength(0)
    expect(seen(watcher)).toBe(seen(blue))
  })

  test('quem assiste vê a partida acontecer', async () => {
    const { room, blue, user } = table('blue')
    const watcher = within(render(<App online={{ transport: seatIn(room) }} />).container)

    await user.click(blue.getByRole('gridcell', { name: /^A1,/ }))
    await user.click(blue.getByRole('gridcell', { name: /^B1,/ }))

    expect(watcher.getByRole('gridcell', { name: /^B1,/ })).toHaveAttribute('data-side', 'blue')
  })
})

describe('o que não chega a ser mandado', () => {
  beforeEach(() => localStorage.clear())

  test('desistir fora da vez não vira mensagem', async () => {
    // Os botões de desistir e propor empate não são presos à vez na tela — e
    // localmente não precisam ser, porque o motor lê o lado de quem está na
    // vez. Online, mandar assim mesmo entulharia o log com uma ação que os dois
    // clientes vão recusar, e quem chegasse depois teria de reexecutá-la.
    const { room, orange, user } = table('blue')

    await user.click(orange.getByRole('button', { name: /desistir/i }))

    expect(room.log()).toHaveLength(1)
    expect(room.log()[0]?.action.type).toBe('draw')
  })

  test('quem entra no meio vê a partida como ela está', async () => {
    // O caso que junta tudo: tabuleiro diferente do painel **e** log para
    // aplicar. Se a configuração da sala não montasse a partida na hora das
    // boas-vindas, o efeito de configuração a reiniciaria um quadro depois e o
    // log iria junto.
    const room = createRoom(always('blue'), { ...CONFIG, board: 'nbn' })
    const first = within(render(<App online={{ transport: seatIn(room) }} />).container)
    const user = userEvent.setup()

    await user.click(first.getByRole('gridcell', { name: /^A1,/ }))
    await user.click(first.getByRole('gridcell', { name: /^B1,/ }))

    const late = within(render(<App online={{ transport: seatIn(room) }} />).container)

    expect(late.getByRole('gridcell', { name: /^B1,/ })).toHaveAttribute('data-side', 'blue')
    expect(seen(late)).toBe(seen(first))
  })
})

describe('as configurações numa sala', () => {
  beforeEach(() => localStorage.clear())

  /** O `<label>` que embrulha um controle, achado pelo texto dele. */
  const boxOf = (screen: ReturnType<typeof within>, text: RegExp) =>
    screen.getByText(text).closest('label')

  test('o que define a partida sai da tela', () => {
    // Elas não mudariam a partida — o efeito que reinicia não roda online —,
    // mudariam o painel e **a tabela consultada**, deixando a anotação
    // pós-jogo falando de um tabuleiro que não é o da partida.
    const { blue } = table('blue')

    expect(blue.getByText(/^mecânica$/i).closest('div')).toHaveAttribute('hidden')
  })

  test('o `hidden` precisa vencer o CSS', () => {
    // Qualquer regra com `display` derrota o `display: none` que o navegador dá
    // ao atributo, porque a folha dele vem antes. Foi exatamente o que
    // aconteceu: `.setup { display: grid }` deixou mecânica, tabuleiro, abertura
    // e nível visíveis e clicáveis dentro de uma sala — e o `hidden` já estava
    // lá, sem efeito nenhum.
    const css = readFileSync('src/ui/style.css', 'utf8')

    expect(css).toMatch(/\[hidden\]\s*\{[^}]*display:\s*none\s*!important/)
  })

  test('some também o que não muda a partida mas não é seu', () => {
    // Controles que não fazem nada são piores do que controles ausentes: dá
    // para ver, dá para mexer, e nada acontece.
    const { blue } = table('blue')

    for (const text of [/empate por repetição/i, /limite de lances/i, /dois jogadores/i]) {
      expect(boxOf(blue, text)).toHaveAttribute('hidden')
    }
  })

  test('a barra é da sala, então também some', () => {
    // Ligada para os dois ou para nenhum: meia barra é a assimetria que a regra
    // existia para impedir.
    const { blue } = table('blue')

    expect(boxOf(blue, /barra de avaliação/i)).toHaveAttribute('hidden')
  })

  test('o que é de aparência continua sendo seu', () => {
    // A sala decide a partida; a tela continua sua.
    const { blue } = table('blue')

    for (const text of [/modo sem cor/i, /velocidade/i, /^som$/i, /seu nome/i]) {
      expect(boxOf(blue, text)).not.toHaveAttribute('hidden')
    }
  })
})

describe('o fim da partida', () => {
  beforeEach(() => localStorage.clear())

  test('avisa a sala, que não conhece as regras', async () => {
    // Ela não tem como saber sozinha. É com este aviso que ela fecha quando o
    // último sair, em vez de deixar o link abrindo uma partida acabada.
    const { blue, orange, room, user } = table('blue')

    await user.click(blue.getByRole('button', { name: /desistir/i }))
    orange.getByRole('alert')

    expect(room.join()).not.toBeNull()
    room.seatsClosed()
    expect(room.join()).toBeNull()
  })
})
