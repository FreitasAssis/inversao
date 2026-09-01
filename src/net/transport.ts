import type { Action } from '../engine/match'
import type { Side } from '../engine/types'
import type { SequencedAction } from './wire'

/**
 * A costura da decisão 4 da seção 2.2, finalmente construída.
 *
 * Ela nunca existiu: o dois-humanos local compartilha o mesmo `setMatch`, e o
 * `Controller` cobria só o lado de **receber**. Falta o de enviar, que é o que
 * a rede precisa.
 *
 * A implementação local entrega direto, na memória. A de rede fala com o
 * Durable Object. O jogo não fica sabendo qual das duas está ali — que é o
 * ponto inteiro de a decisão ter sido tomada antes de existir rede.
 */

/** O que um cliente manda para a sala. */
export type Outbound =
  | { kind: 'act'; action: Action }
  /** Pedido de sorteio da rodada. Quem sorteia é a sala, nunca o cliente. */
  | { kind: 'draw'; round: number }

export interface Transport {
  send(message: Outbound): void
  /** Devolve como se desfazer: um efeito que remonta não pode duplicar ouvinte. */
  onReceive(listen: (message: SequencedAction) => void): () => void
  close(): void
}

/** De onde sai a iniciativa. Semeado nos testes, aleatório em produção. */
export type Deal = (round: number) => Side

export type Room = {
  seat(side: Side): Transport
  /** O que quem reconecta recebe: a partida é isto mais o estado inicial. */
  log(): readonly SequencedAction[]
}

/**
 * A sala em memória, com a mesma lógica que o Durable Object terá.
 *
 * Não é um dublê simplificado de propósito: carimbar autor, numerar e sortear
 * uma vez por rodada é *tudo* o que a sala faz, então tê-la aqui quer dizer que os
 * testes de duas telas exercitam a lógica de verdade — e que portar para o
 * Durable Object é mudar o transporte, não a regra.
 */
export function createRoom(deal: Deal): Room {
  let seq = 0
  const dealt = new Map<number, Side>()
  const log: SequencedAction[] = []
  const listeners = new Map<Side, ((message: SequencedAction) => void)[]>()

  const broadcast = (from: SequencedAction['from'], action: Action) => {
    const message: SequencedAction = { seq: seq++, from, action }
    log.push(message)
    // Cópia da lista: um ouvinte que se desliga ao receber não pode encurtar o
    // laço em curso e fazer o outro lado perder a mensagem.
    for (const side of [...listeners.keys()]) {
      for (const listen of [...(listeners.get(side) ?? [])]) listen(message)
    }
  }

  return {
    log: () => log,
    seat(side) {
      let open = true
      return {
        send(message) {
          if (!open) return
          if (message.kind === 'act') {
            // O `from` é da conexão, nunca do que o cliente disse. É a única
            // coisa que precisa ser inforjável, e a sala a sabe sem saber nada
            // do jogo.
            broadcast(side, message.action)
            return
          }
          // Sorteia uma vez por rodada. Os dois clientes pedem, e o segundo
          // pedido não produz ação nenhuma — a primeira já foi para os dois, e
          // um segundo `draw` na lista seria uma rodada com dois sorteios.
          //
          // É isto que impede rolar de novo até gostar do resultado.
          if (dealt.has(message.round)) return
          const initiative = deal(message.round)
          dealt.set(message.round, initiative)
          broadcast('server', { type: 'draw', initiative })
        },
        onReceive(listen) {
          // Quem assina recebe primeiro tudo o que já aconteceu, em ordem.
          //
          // Não é conveniência: **o segundo jogador sempre chega depois**, e sem
          // isto ele começaria com o tabuleiro em branco enquanto o primeiro já
          // teria o sorteio da rodada. É o mesmo mecanismo da reconexão — a
          // partida é estado inicial mais lista de ações, e assinar é receber a
          // lista.
          for (const message of log) listen(message)
          listeners.set(side, [...(listeners.get(side) ?? []), listen])
          return () => {
            listeners.set(side, (listeners.get(side) ?? []).filter((one) => one !== listen))
          }
        },
        close() {
          open = false
          listeners.delete(side)
        },
      }
    },
  }
}
