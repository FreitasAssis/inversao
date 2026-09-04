import { describe, expect, test } from 'vitest'
import { createRoom, ROOM_LIMIT } from '../../src/net/transport'
import type { Transport } from '../../src/net/transport'
import type { Inbound, RoomConfig } from '../../src/net/protocol'
import type { SequencedAction } from '../../src/net/wire'
import { admits } from '../../src/net/wire'
import { startMatch } from '../../src/engine/match'
import type { Side } from '../../src/engine/types'

/**
 * A sala em memória tem a mesma lógica que o Durable Object: carimbar autor,
 * numerar, sentar quem chega e sortear uma vez por rodada. Não é um dublê
 * simplificado — é a coisa, com outro transporte.
 */

const always = (side: Side) => () => side
const CONFIG: RoomConfig = { board: 'dbu', mechanic: 'choice', evaluation: false }
const room = (initiative: Side = 'blue', config = CONFIG) => createRoom(always(initiative), config)

/** Entra na sala e anota tudo o que ela disser. */
function enter(where: ReturnType<typeof room>) {
  const heard: Inbound[] = []
  const transport = where.join()
  if (transport === null) throw new Error('a sala recusou a conexão')
  const stop = transport.onReceive((message) => heard.push(message))
  return { transport, heard, stop }
}

/** Só as ações, que é o que a maioria dos testes olha. */
const actions = (heard: Inbound[]): SequencedAction[] =>
  heard.flatMap((message) => (message.kind === 'action' ? [message.message] : []))

const welcome = (heard: Inbound[]) =>
  heard.find((message) => message.kind === 'welcome') as Extract<Inbound, { kind: 'welcome' }>

const act = (transport: Transport, action: SequencedAction['action']) =>
  transport.send({ kind: 'act', action })

describe('sentar', () => {
  test('o primeiro senta de azul e o segundo de laranja', () => {
    const here = room()

    expect(welcome(enter(here).heard).seat).toBe('blue')
    expect(welcome(enter(here).heard).seat).toBe('orange')
  })

  test('do terceiro em diante, assiste', () => {
    const here = room()
    enter(here)
    enter(here)

    expect(welcome(enter(here).heard).seat).toBe('spectator')
  })

  test('quem entra não escolhe o próprio lado', () => {
    // Se escolhesse, dois jogadores se declarariam azuis e a checagem de
    // autoria — que é o que fecha os dois furos do motor — passaria a proteger
    // nada.
    const here = room()
    const first = enter(here)
    const second = enter(here)

    act(second.transport, { type: 'offerDraw' })

    expect(actions(first.heard)[0]?.from).toBe('orange')
  })

  test('avisa quem estabeleceu a sala, e só a ele', () => {
    // É por aqui que quem cria descobre colisão de código: recebendo `false`,
    // o código já estava em uso e o certo é sortear outro.
    const here = room()

    expect(welcome(enter(here).heard).first).toBe(true)
    expect(welcome(enter(here).heard).first).toBe(false)
  })

  test('conta que partida é esta', () => {
    // Sem isto quem entra jogaria o que estivesse no painel dele, e duas telas
    // com tabuleiros diferentes aceitariam lances diferentes — cada uma achando
    // que a outra é que trapaceia.
    const here = room('blue', { board: 'nbn', mechanic: 'rotation', evaluation: true })

    expect(welcome(enter(here).heard).config).toEqual({
      board: 'nbn',
      mechanic: 'rotation',
      evaluation: true,
    })
  })

  test('o assento volta a ficar livre ao sair, para quem reconecta', () => {
    const here = room()
    const first = enter(here)
    enter(here)

    first.transport.close()

    expect(welcome(enter(here).heard).seat).toBe('blue')
  })
})

describe('a sala', () => {
  test('carimba o autor pelo assento, e não pelo que o cliente disse', () => {
    const here = room()
    const first = enter(here)
    const second = enter(here)

    act(first.transport, { type: 'resign' })

    expect(actions(second.heard)[0]?.from).toBe('blue')
  })

  test('entrega aos dois lados, inclusive a quem mandou', () => {
    // Quem mandou também aplica pela mensagem que voltou, e não no ato: assim
    // existe uma ordem só, a da sala, e não duas que precisam concordar.
    const here = room()
    const first = enter(here)
    const second = enter(here)

    act(first.transport, { type: 'offerDraw' })

    expect(actions(first.heard)).toHaveLength(1)
    expect(actions(second.heard)).toHaveLength(1)
  })

  test('numera em sequência', () => {
    const here = room()
    const first = enter(here)
    const second = enter(here)

    act(first.transport, { type: 'offerDraw' })
    act(second.transport, { type: 'declineDraw' })

    expect(actions(first.heard).map((message) => message.seq)).toEqual([0, 1])
  })

  test('sorteia uma vez por rodada, mesmo com os dois pedindo', () => {
    // Os dois pedem, porque nenhum sabe se o outro pediu. Um segundo sorteio na
    // lista seria uma rodada com dois — e, pior, seria o "rolar de novo até
    // gostar" que a seção 2.3 impede.
    const here = room('orange')
    const first = enter(here)
    const second = enter(here)

    first.transport.send({ kind: 'draw', round: 0 })
    second.transport.send({ kind: 'draw', round: 0 })

    expect(actions(first.heard)).toHaveLength(1)
    expect(actions(first.heard)[0]?.action).toEqual({ type: 'draw', initiative: 'orange' })
  })

  test('sorteia de novo na rodada seguinte', () => {
    const here = createRoom((round) => (round === 0 ? 'blue' : 'orange'), CONFIG)
    const first = enter(here)

    first.transport.send({ kind: 'draw', round: 0 })
    first.transport.send({ kind: 'draw', round: 1 })

    expect(
      actions(first.heard).map((m) => (m.action.type === 'draw' ? m.action.initiative : null)),
    ).toEqual(['blue', 'orange'])
  })

  test('assina o sorteio como da sala, e não de quem pediu', () => {
    const here = room()
    const first = enter(here)

    first.transport.send({ kind: 'draw', round: 0 })

    expect(actions(first.heard)[0]?.from).toBe('server')
  })

  test('guarda o log, que é o que quem reconecta recebe', () => {
    const here = room()
    const first = enter(here)

    first.transport.send({ kind: 'draw', round: 0 })
    act(first.transport, { type: 'resign' })

    expect(here.log().map((message) => message.action.type)).toEqual(['draw', 'resign'])
  })

  test('para de entregar a quem fechou', () => {
    const here = room()
    const first = enter(here)
    const second = enter(here)

    second.transport.close()
    act(first.transport, { type: 'offerDraw' })

    expect(actions(second.heard)).toHaveLength(0)
    expect(actions(first.heard)).toHaveLength(1)
  })

  test('ignora o que quem fechou tenta mandar', () => {
    const here = room()
    const first = enter(here)

    first.transport.close()
    act(first.transport, { type: 'resign' })

    expect(here.log()).toHaveLength(0)
  })
})

describe('o sorteio disfarçado de lance', () => {
  test('um draw mandado como ação leva o carimbo do jogador, não o da sala', () => {
    // O ataque: `{ kind: 'act', action: { type: 'draw', initiative: 'blue' } }`.
    // Se a sala olhasse o conteúdo e assinasse como sua, o jogador escolheria a
    // própria iniciativa — que é o jogo inteiro da Escolha Sorteada.
    const here = room('orange')
    const first = enter(here)
    const second = enter(here)

    act(first.transport, { type: 'draw', initiative: 'blue' })

    const sent = actions(second.heard)[0] as SequencedAction
    expect(sent.from).toBe('blue')
    expect(admits(startMatch({ board: 'dbu', mechanic: 'choice' }), 0, sent).ok).toBe(false)
  })
})

describe('quem chega depois', () => {
  test('recebe tudo o que já aconteceu, em ordem', () => {
    // O caso normal, não o excepcional: o segundo jogador sempre entra depois
    // de o primeiro ter criado a sala, e às vezes depois do primeiro sorteio.
    const here = room()
    const first = enter(here)
    first.transport.send({ kind: 'draw', round: 0 })
    act(first.transport, { type: 'offerDraw' })

    const late = enter(here)

    expect(actions(late.heard).map((message) => message.action.type)).toEqual(['draw', 'offerDraw'])
    expect(actions(late.heard).map((message) => message.seq)).toEqual([0, 1])
  })

  test('recebe as boas-vindas antes do log', () => {
    // Ele precisa saber quem é e que partida é esta **antes** de tentar aplicar
    // qualquer lance — senão aplicaria a lista num tabuleiro que não é o dela.
    const here = room()
    const first = enter(here)
    first.transport.send({ kind: 'draw', round: 0 })

    const late = enter(here)

    expect(late.heard[0]?.kind).toBe('welcome')
  })

  test('e segue recebendo o que vier depois', () => {
    const here = room()
    const first = enter(here)
    act(first.transport, { type: 'offerDraw' })

    const late = enter(here)
    act(first.transport, { type: 'resign' })

    expect(actions(late.heard)).toHaveLength(2)
  })
})

describe('quem assiste', () => {
  test('recebe tudo, do começo', () => {
    const here = room()
    const first = enter(here)
    enter(here)
    first.transport.send({ kind: 'draw', round: 0 })

    const watcher = enter(here)
    act(first.transport, { type: 'resign' })

    expect(actions(watcher.heard).map((message) => message.action.type)).toEqual([
      'draw',
      'resign',
    ])
  })

  test('não consegue jogar', () => {
    // A regra mora na sala, e não num botão desabilitado em alguma tela.
    const here = room()
    const first = enter(here)
    enter(here)
    const watcher = enter(here)

    act(watcher.transport, { type: 'resign' })

    expect(actions(first.heard)).toHaveLength(0)
  })
})

describe('desfazer a assinatura', () => {
  test('para de entregar a quem se desligou, sem fechar o assento', () => {
    // Um efeito de React que remonta assina de novo. Sem como se desfazer, o
    // mesmo lado receberia a mesma mensagem duas vezes.
    const here = room()
    const first = enter(here)

    first.stop()
    act(first.transport, { type: 'offerDraw' })

    expect(actions(first.heard)).toHaveLength(0)
    expect(here.log()).toHaveLength(1)
  })
})

describe('o teto de conexões', () => {
  test('aceita os dois jogadores e um bando de espectadores', () => {
    // Não é limite de produto: assistir é bom, e ninguém bate nisto jogando.
    const here = room()

    for (let at = 0; at < ROOM_LIMIT; at++) expect(here.join()).not.toBeNull()
  })

  test('recusa quando lota', () => {
    // O log e os ouvintes vivem na memória do objeto, e um código conhecido é
    // tudo o que alguém precisaria para abrir conexões até doer.
    const here = room()
    for (let at = 0; at < ROOM_LIMIT; at++) here.join()

    expect(here.join()).toBeNull()
  })

  test('abre vaga quando alguém sai', () => {
    const here = room()
    const first = here.join()
    for (let at = 1; at < ROOM_LIMIT; at++) here.join()

    first?.close()

    expect(here.join()).not.toBeNull()
  })

  test('não conta duas vezes quem fecha duas vezes', () => {
    // Fechar é idempotente, e sem isso um cliente que fechasse em laço abriria
    // vagas que não existem — o oposto do que o teto faz.
    const here = room()
    const first = here.join()
    for (let at = 1; at < ROOM_LIMIT; at++) here.join()

    first?.close()
    first?.close()
    here.join()

    expect(here.join()).toBeNull()
  })
})
