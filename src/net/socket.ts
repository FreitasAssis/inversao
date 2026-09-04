import { parseInbound } from './protocol'
import type { Inbound, RoomConfig } from './protocol'
import type { Transport } from './transport'

/**
 * O `Transport` de verdade: um WebSocket falando com o Durable Object.
 *
 * A mesma interface do transporte em memória, então o `App` não sabe qual dos
 * dois está ali — que é o motivo de a decisão 4 da seção 2.2 existir.
 *
 * Três coisas que a rede traz e a memória não:
 *
 * - **A fila.** O `App` pede o sorteio assim que monta, e o socket ainda não
 *   abriu. Mandar antes de `open` perde a mensagem em silêncio.
 * - **A desconfiança.** O que chega é JSON de fora, e passa por `parseInbound`
 *   antes de virar qualquer coisa. O servidor ser nosso não é motivo para
 *   acreditar — é a mesma postura de `readSaved` com o `localStorage`.
 * - **A reconexão.** Cai de graça pelo que já existe: a sala reentrega o log
 *   desde o zero, e o contador de sequência do cliente já está adiante, então
 *   o guarda de ordem descarta o que ele já aplicou e aceita a partir de onde
 *   parou.
 */

/** Quem abre o socket. Injetável para o teste não precisar de rede. */
export type Open = (url: string) => WebSocketLike

/**
 * O evento como isto o lê: só o `data`, e opcional porque `open` e `close` não
 * têm nenhum.
 */
export type SocketEvent = { data?: unknown }

/**
 * O pedaço de `WebSocket` que isto usa, e nada além.
 *
 * Declarado aqui em vez de importado do DOM para que um teste possa passar um
 * dublê — e largo o bastante para o `WebSocket` de verdade caber, sem conversão
 * forçada no ponto de uso, que é onde uma incompatibilidade real deixaria de
 * ser vista.
 */
export type WebSocketLike = {
  readyState: number
  send(data: string): void
  close(): void
  addEventListener(type: 'open' | 'message' | 'close', listen: (event: SocketEvent) => void): void
}

const OPEN = 1

export type Joining = {
  code: string
  /**
   * A configuração vai no endereço, e só quem cria a leva.
   *
   * Ela não pode chegar depois: a sala precisa dela para existir, e as
   * boas-vindas — que já contam a configuração a quem entra — saem antes de o
   * cliente ter mandado qualquer coisa.
   */
  config?: RoomConfig | undefined
  /** Só o host, para o teste apontar para outro lugar. */
  origin?: string | undefined
}

export function addressOf({ code, config, origin }: Joining): string {
  const base = origin ?? location.origin.replace(/^http/, 'ws')
  const query =
    config === undefined
      ? ''
      : `?b=${config.board}&m=${config.mechanic}&e=${config.evaluation ? '1' : '0'}`
  return `${base}/sala/${code.toUpperCase()}${query}`
}

export function socketTransport(open: Open, joining: Joining): Transport {
  const socket = open(addressOf(joining))
  let listeners: ((message: Inbound) => void)[] = []
  /** O que foi pedido antes de o socket abrir. */
  let waiting: string[] = []
  let closed = false

  socket.addEventListener('open', () => {
    for (const message of waiting) socket.send(message)
    waiting = []
  })

  socket.addEventListener('message', (event) => {
    const inbound = parseInbound(event.data)
    // Descartado em silêncio: mensagem que não é mensagem não tem a quem
    // reclamar, e derrubar a partida por causa dela seria pior.
    if (inbound === null) return
    for (const listen of [...listeners]) listen(inbound)
  })

  socket.addEventListener('close', () => {
    closed = true
  })

  return {
    send(message) {
      if (closed) return
      const raw = JSON.stringify(message)
      if (socket.readyState === OPEN) socket.send(raw)
      else waiting.push(raw)
    },
    onReceive(listen) {
      listeners = [...listeners, listen]
      return () => {
        listeners = listeners.filter((one) => one !== listen)
      }
    },
    close() {
      closed = true
      listeners = []
      waiting = []
      socket.close()
    },
  }
}
