import { describe, expect, test } from 'vitest'
import { addressOf, socketTransport } from '../../src/net/socket'
import type { WebSocketLike } from '../../src/net/socket'
import type { Inbound, RoomConfig } from '../../src/net/protocol'

/**
 * O transporte de rede, sem rede.
 *
 * Quem abre o socket entra por parâmetro, então dá para exercitar as três
 * coisas que só existem aqui — a fila antes de abrir, a desconfiança do que
 * chega, e o fechar — sem depender de um servidor de pé.
 */

const CONFIG: RoomConfig = { board: 'dbu', mechanic: 'choice', evaluation: false }

/** Um socket de mentira, com o botão de abrir na mão do teste. */
function fake() {
  const sent: string[] = []
  const handlers: Record<string, ((event: unknown) => void)[]> = {}
  let closes = 0
  const socket: WebSocketLike = {
    readyState: 0,
    send: (data) => sent.push(data),
    close: () => {
      closes += 1
    },
    addEventListener: (type, listen) => {
      handlers[type] = [...(handlers[type] ?? []), listen as (event: unknown) => void]
    },
  }
  return {
    socket,
    sent,
    get closes() {
      return closes
    },
    open() {
      socket.readyState = 1
      for (const listen of handlers.open ?? []) listen({})
    },
    deliver(data: unknown) {
      for (const listen of handlers.message ?? []) listen({ data })
    },
    drop() {
      for (const listen of handlers.close ?? []) listen({})
    },
  }
}

const connect = (config?: RoomConfig) => {
  const wire = fake()
  const transport = socketTransport(() => wire.socket, { code: 'k3m9', config, origin: 'ws://t' })
  return { wire, transport }
}

describe('o endereço', () => {
  test('leva o código em maiúsculas, porque ele é ditado no telefone', () => {
    expect(addressOf({ code: 'k3m9', origin: 'ws://t' })).toBe('ws://t/sala/K3M9')
  })

  test('leva a configuração de quem cria', () => {
    // Ela não pode chegar depois: a sala precisa dela para existir, e as
    // boas-vindas saem antes de o cliente ter mandado qualquer coisa.
    expect(addressOf({ code: 'K3M9', config: CONFIG, origin: 'ws://t' })).toBe(
      'ws://t/sala/K3M9?b=dbu&m=choice&e=0',
    )
  })

  test('leva o crachá do assento', () => {
    // É por ele que a sala reconhece quem volta. Sem ir no endereço, ela não
    // teria como saber na hora de sentar — e depois já é tarde.
    expect(addressOf({ code: 'K3M9', token: 'abc123', origin: 'ws://t' })).toBe(
      'ws://t/sala/K3M9?t=abc123',
    )
  })

  test('leva os dois quando quem cria também volta', () => {
    expect(addressOf({ code: 'K3M9', config: CONFIG, token: 'abc', origin: 'ws://t' })).toBe(
      'ws://t/sala/K3M9?b=dbu&m=choice&e=0&t=abc',
    )
  })

  test('não leva configuração nenhuma para quem entra', () => {
    // Quem entra recebe a da sala. Mandar a própria faria o link de convite
    // criar uma sala nova em vez de entrar na que existe.
    expect(addressOf({ code: 'K3M9', origin: 'ws://t' })).not.toContain('?')
  })
})

describe('mandar', () => {
  test('segura o que foi pedido antes de o socket abrir', () => {
    // O `App` pede o sorteio assim que monta, e isso é sempre antes de `open`.
    // Mandar direto perderia a mensagem em silêncio, e a partida ficaria
    // parada esperando uma iniciativa que ninguém pediu.
    const { wire, transport } = connect(CONFIG)

    transport.send({ kind: 'draw', round: 0 })
    expect(wire.sent).toHaveLength(0)

    wire.open()
    expect(wire.sent).toEqual([JSON.stringify({ kind: 'draw', round: 0 })])
  })

  test('mantém a ordem do que estava na fila', () => {
    const { wire, transport } = connect(CONFIG)

    transport.send({ kind: 'draw', round: 0 })
    transport.send({ kind: 'act', action: { type: 'offerDraw' } })
    wire.open()

    expect(wire.sent.map((raw) => (JSON.parse(raw) as { kind: string }).kind)).toEqual([
      'draw',
      'act',
    ])
  })

  test('manda na hora depois de aberto', () => {
    const { wire, transport } = connect(CONFIG)
    wire.open()

    transport.send({ kind: 'act', action: { type: 'resign' } })

    expect(wire.sent).toHaveLength(1)
  })

  test('não manda mais nada depois de o socket cair', () => {
    const { wire, transport } = connect(CONFIG)
    wire.open()
    wire.drop()

    transport.send({ kind: 'act', action: { type: 'resign' } })

    expect(wire.sent).toHaveLength(0)
  })
})

describe('receber', () => {
  const welcome = { kind: 'welcome', seat: 'blue', config: CONFIG, first: true }

  test('entrega o que a sala disse', () => {
    const { wire, transport } = connect(CONFIG)
    const heard: Inbound[] = []
    transport.onReceive((message) => heard.push(message))

    wire.deliver(JSON.stringify(welcome))

    expect(heard).toEqual([welcome])
  })

  test('descarta o que não é mensagem, sem derrubar a partida', () => {
    // O servidor ser nosso não é motivo para acreditar no que chega. E cair por
    // causa de uma mensagem torta seria trocar um defeito pequeno por um grande.
    const { wire, transport } = connect(CONFIG)
    const heard: Inbound[] = []
    transport.onReceive((message) => heard.push(message))

    wire.deliver('nada disso')
    wire.deliver(JSON.stringify({ kind: 'welcome', seat: 'verde', config: CONFIG, first: true }))
    wire.deliver(JSON.stringify(welcome))

    expect(heard).toEqual([welcome])
  })

  test('para de entregar a quem se desligou', () => {
    const { wire, transport } = connect(CONFIG)
    const heard: Inbound[] = []
    const stop = transport.onReceive((message) => heard.push(message))

    stop()
    wire.deliver(JSON.stringify(welcome))

    expect(heard).toHaveLength(0)
  })
})

describe('fechar', () => {
  test('fecha o socket de verdade', () => {
    const { wire, transport } = connect(CONFIG)

    transport.close()

    expect(wire.closes).toBe(1)
  })

  test('para de entregar depois de fechado', () => {
    const { wire, transport } = connect(CONFIG)
    const heard: Inbound[] = []
    transport.onReceive((message) => heard.push(message))

    transport.close()
    wire.deliver(JSON.stringify({ kind: 'welcome', seat: 'blue', config: CONFIG, first: true }))

    expect(heard).toHaveLength(0)
  })
})
