import { describe, expect, test } from 'vitest'
import { createRoom } from '../../src/net/transport'
import type { Transport } from '../../src/net/transport'
import { socketTransport } from '../../src/net/socket'
import type { WebSocketLike } from '../../src/net/socket'
import type { Inbound, RoomConfig } from '../../src/net/protocol'

/**
 * O contrato que as duas implementações de `Transport` precisam cumprir.
 *
 * Existe porque elas **discordavam**, e a discordância só apareceu jogando: a
 * sala em memória reentregava tudo a quem assinava, e o transporte de rede não.
 * O efeito na tela era não conseguir mover peça nenhuma — o `Room` consumia as
 * boas-vindas, o `App` montava depois e nunca descobria de que lado estava.
 *
 * Nenhum teste pegou porque todos usavam a sala em memória. Este roda os dois
 * contra as mesmas asserções.
 */

const CONFIG: RoomConfig = { board: 'dbu', mechanic: 'choice', evaluation: false }

/** Um socket de mentira com o botão de entregar na mão do teste. */
function fakeSocket() {
  const handlers: Record<string, ((event: unknown) => void)[]> = {}
  const socket: WebSocketLike = {
    readyState: 1,
    send: () => {},
    close: () => {},
    addEventListener: (type, listen) => {
      handlers[type] = [...(handlers[type] ?? []), listen as (event: unknown) => void]
    },
  }
  return {
    socket,
    deliver: (message: Inbound) => {
      for (const listen of handlers.message ?? []) listen({ data: JSON.stringify(message) })
    },
  }
}

type Subject = {
  transport: Transport
  /** Faz a sala dizer as boas-vindas e um lance, como aconteceria de verdade. */
  speak: () => void
}

const subjects: [string, () => Subject][] = [
  [
    'a sala em memória',
    () => {
      const sala = createRoom(() => 'blue', CONFIG)
      const transport = sala.join()
      if (transport === null) throw new Error('recusou')
      return {
        transport,
        speak: () => {
          const other = sala.join()
          other?.onReceive(() => {})
          transport.send({ kind: 'act', action: { type: 'offerDraw' } })
        },
      }
    },
  ],
  [
    'o transporte de rede',
    () => {
      const wire = fakeSocket()
      const transport = socketTransport(() => wire.socket, { code: 'K3M9', origin: 'ws://t' })
      return {
        transport,
        speak: () => {
          wire.deliver({ kind: 'welcome', seat: 'blue', config: CONFIG, first: true })
          wire.deliver({ kind: 'peer', present: true, ready: { blue: true, orange: true }, names: { blue: '', orange: '' } })
          wire.deliver({
            kind: 'action',
            message: { seq: 0, from: 'blue', action: { type: 'offerDraw' } },
          })
        },
      }
    },
  ],
]

describe.each(subjects)('%s', (_name, build) => {
  test('conta a quem assina depois tudo o que já foi dito', () => {
    // É o caso normal, não o excepcional. Na tela, o `Room` assina primeiro e o
    // `App` monta só quando os dois jogadores estão lá — sempre depois das
    // boas-vindas, e às vezes depois de metade da partida.
    const { transport, speak } = build()
    transport.onReceive(() => {})
    speak()

    const late: Inbound[] = []
    transport.onReceive((message) => late.push(message))

    expect(late.some((message) => message.kind === 'welcome')).toBe(true)
    expect(late.some((message) => message.kind === 'action')).toBe(true)
  })

  test('entrega na ordem em que aconteceu', () => {
    // As boas-vindas antes das ações: quem aplica um lance sem saber que
    // partida é esta o aplica no tabuleiro errado.
    const { transport, speak } = build()
    speak()

    const late: Inbound[] = []
    transport.onReceive((message) => late.push(message))

    const welcomeAt = late.findIndex((message) => message.kind === 'welcome')
    const actionAt = late.findIndex((message) => message.kind === 'action')
    expect(welcomeAt).toBeGreaterThanOrEqual(0)
    expect(welcomeAt).toBeLessThan(actionAt)
  })

  test('segue entregando o que vier depois de assinar', () => {
    const { transport, speak } = build()
    const heard: Inbound[] = []
    transport.onReceive((message) => heard.push(message))

    speak()

    expect(heard.some((message) => message.kind === 'action')).toBe(true)
  })

  test('para de entregar a quem se desligou', () => {
    const { transport, speak } = build()
    const heard: Inbound[] = []
    const stop = transport.onReceive((message) => heard.push(message))
    // O que já chegou na própria assinatura não conta: o que se mede aqui é o
    // que vem **depois** de desligar.
    const before = heard.length

    stop()
    speak()

    expect(heard).toHaveLength(before)
  })
})
