import { describe, expect, test } from 'vitest'
import { createRoom } from '../../src/net/transport'
import type { Room } from '../../src/net/transport'
import type { SequencedAction } from '../../src/net/wire'
import { admits } from '../../src/net/wire'
import { startMatch } from '../../src/engine/match'
import type { Side } from '../../src/engine/types'

/**
 * A sala em memória tem a mesma lógica que o Durable Object terá: carimbar
 * autor, numerar e sortear uma vez por rodada. Não é um dublê simplificado —
 * é a coisa, com outro transporte.
 */

const always = (side: Side) => () => side

/** Liga os dois assentos e devolve o que cada um recebeu. */
function connect(room: Room) {
  const blue = room.seat('blue')
  const orange = room.seat('orange')
  const heard: Record<Side, SequencedAction[]> = { blue: [], orange: [] }
  blue.onReceive((message) => heard.blue.push(message))
  orange.onReceive((message) => heard.orange.push(message))
  return { blue, orange, heard }
}

describe('a sala', () => {
  test('carimba o autor pelo assento, e não pelo que o cliente disse', () => {
    // É a única coisa que precisa ser inforjável. Sem ela, os dois furos de
    // autoria voltam: desistir pelo adversário e aceitar o próprio empate.
    const { blue, heard } = connect(createRoom(always('blue')))

    blue.send({ kind: 'act', action: { type: 'resign' } })

    expect(heard.orange[0]?.from).toBe('blue')
  })

  test('entrega aos dois lados, inclusive a quem mandou', () => {
    // Quem mandou também aplica pela mensagem que voltou, e não no ato: assim
    // existe uma ordem só, a da sala, e não duas que precisam concordar.
    const { blue, heard } = connect(createRoom(always('blue')))

    blue.send({ kind: 'act', action: { type: 'offerDraw' } })

    expect(heard.blue).toHaveLength(1)
    expect(heard.orange).toHaveLength(1)
  })

  test('numera em sequência', () => {
    const { blue, orange, heard } = connect(createRoom(always('blue')))

    blue.send({ kind: 'act', action: { type: 'offerDraw' } })
    orange.send({ kind: 'act', action: { type: 'declineDraw' } })

    expect(heard.blue.map((message) => message.seq)).toEqual([0, 1])
  })

  test('sorteia uma vez por rodada, mesmo com os dois pedindo', () => {
    // Os dois clientes pedem, porque nenhum deles sabe se o outro pediu. Um
    // segundo sorteio na lista seria uma rodada com dois — e, pior, seria
    // exatamente o "rolar de novo até gostar" que a seção 2.3 impede.
    const { blue, orange, heard } = connect(createRoom(always('orange')))

    blue.send({ kind: 'draw', round: 0 })
    orange.send({ kind: 'draw', round: 0 })

    expect(heard.blue).toHaveLength(1)
    expect(heard.blue[0]?.action).toEqual({ type: 'draw', initiative: 'orange' })
  })

  test('sorteia de novo na rodada seguinte', () => {
    const { blue, heard } = connect(createRoom((round) => (round === 0 ? 'blue' : 'orange')))

    blue.send({ kind: 'draw', round: 0 })
    blue.send({ kind: 'draw', round: 1 })

    expect(heard.blue.map((m) => (m.action.type === 'draw' ? m.action.initiative : null))).toEqual([
      'blue',
      'orange',
    ])
  })

  test('assina o sorteio como da sala, e não de quem pediu', () => {
    // Um sorteio carimbado com o lado que pediu seria recusado pelo validador —
    // e com razão, porque jogador nenhum sorteia.
    const { blue, heard } = connect(createRoom(always('blue')))

    blue.send({ kind: 'draw', round: 0 })

    expect(heard.blue[0]?.from).toBe('server')
  })

  test('guarda o log, que é o que quem reconecta recebe', () => {
    // Reconectar é receber a lista e reexecutar — o mesmo `replayMatch` da
    // partida salva no aparelho, com a mesma recusa.
    const room = createRoom(always('blue'))
    const { blue } = connect(room)

    blue.send({ kind: 'draw', round: 0 })
    blue.send({ kind: 'act', action: { type: 'resign' } })

    expect(room.log().map((message) => message.action.type)).toEqual(['draw', 'resign'])
  })

  test('para de entregar a quem fechou', () => {
    const { blue, orange, heard } = connect(createRoom(always('blue')))

    orange.close()
    blue.send({ kind: 'act', action: { type: 'offerDraw' } })

    expect(heard.orange).toHaveLength(0)
    expect(heard.blue).toHaveLength(1)
  })

  test('ignora o que quem fechou tenta mandar', () => {
    const room = createRoom(always('blue'))
    const { blue } = connect(room)

    blue.close()
    blue.send({ kind: 'act', action: { type: 'resign' } })

    expect(room.log()).toHaveLength(0)
  })
})

describe('o sorteio disfarçado de lance', () => {
  test('um draw mandado como ação leva o carimbo do jogador, não o da sala', () => {
    // O ataque: `{ kind: 'act', action: { type: 'draw', initiative: 'blue' } }`.
    // Se a sala olhasse o conteúdo e assinasse como sua, o jogador escolheria a
    // própria iniciativa — que é o jogo inteiro da Escolha Sorteada.
    //
    // A sala não olha o conteúdo de propósito: ela carimba o assento e pronto.
    // O validador recusa depois, porque só a sala sorteia.
    const { blue, heard } = connect(createRoom(always('orange')))

    blue.send({ kind: 'act', action: { type: 'draw', initiative: 'blue' } })

    expect(heard.orange[0]?.from).toBe('blue')
    const match = startMatch({ board: 'dbu', mechanic: 'choice' })
    expect(admits(match, 0, heard.orange[0] as SequencedAction).ok).toBe(false)
  })
})
