import type { Action } from '../engine/match'
import type { Side } from '../engine/types'
import type { Inbound, Outbound, RoomConfig, Seat } from './protocol'
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

export type { Outbound } from './protocol'

export interface Transport {
  send(message: Outbound): void
  /** Devolve como se desfazer: um efeito que remonta não pode duplicar ouvinte. */
  onReceive(listen: (message: Inbound) => void): () => void
  close(): void
}

/** De onde sai a iniciativa. Semeado nos testes, aleatório em produção. */
export type Deal = (round: number) => Side

export type Room = {
  /**
   * Senta quem chega. Azul, depois laranja, e do terceiro em diante espectador.
   *
   * Quem decide é a sala, e não quem entra — se o cliente escolhesse, dois
   * jogadores se declarariam azuis e a checagem de autoria inteira, que é o que
   * fecha os furos da seção 2, passaria a proteger nada.
   *
   * Null quando a sala está lotada. O teto é generoso e existe só por
   * segurança: sem ele, abrir mil conexões num código conhecido é um pedido de
   * memória e de duração que ninguém precisa autenticar para fazer.
   */
  join(): Transport | null
  /** O que quem reconecta recebe: a partida é isto mais o estado inicial. */
  log(): readonly SequencedAction[]
}

/**
 * A sala em memória, com a mesma lógica que o Durable Object terá.
 *
 * Não é um dublê simplificado de propósito: carimbar autor, numerar, sentar
 * quem chega e sortear uma vez por rodada é *tudo* o que a sala faz, então
 * tê-la aqui quer dizer que os testes de duas telas exercitam a lógica de
 * verdade — e que portar para o Durable Object é mudar o transporte, não a
 * regra.
 */
/**
 * Quantas conexões uma sala aguenta.
 *
 * Dois jogadores e um número folgado de espectadores. Não é um limite de
 * produto — assistir é bom, e ninguém vai bater nisto jogando —, é uma válvula:
 * o log e os ouvintes vivem na memória do objeto, e um código conhecido é tudo
 * o que alguém precisaria para abrir conexões até doer.
 */
export const ROOM_LIMIT = 64

export function createRoom(deal: Deal, config: RoomConfig): Room {
  let seq = 0
  let established = false
  const dealt = new Map<number, Side>()
  const log: SequencedAction[] = []
  const taken = new Set<Side>()
  /** Conexões abertas, jogadores e espectadores juntos. */
  let present = 0
  /** Todo mundo que está ouvindo, com ou sem assento. */
  let listeners: ((message: Inbound) => void)[] = []

  /** Quem já apertou o botão de começar. */
  const readied = new Set<Side>()

  /** Os dois assentos ocupados. É o que a tela de espera aguarda. */
  const paired = () => taken.size === 2

  /**
   * Depois do primeiro lance, todo mundo lê como pronto.
   *
   * Sem isto, quem reconecta ficaria preso num aperto de mão que já aconteceu —
   * o assento é liberado ao sair, e voltaria sem a confirmação que deu antes.
   */
  const ready = (side: Side) => log.length > 0 || readied.has(side)

  const announce = () => {
    const message: Inbound = {
      kind: 'peer',
      present: paired(),
      ready: { blue: ready('blue'), orange: ready('orange') },
    }
    for (const listen of [...listeners]) listen(message)
  }

  const broadcast = (from: SequencedAction['from'], action: Action) => {
    const message: SequencedAction = { seq: seq++, from, action }
    log.push(message)
    // Cópia da lista: um ouvinte que se desliga ao receber não pode encurtar o
    // laço em curso e fazer o outro lado perder a mensagem.
    for (const listen of [...listeners]) listen({ kind: 'action', message })
  }

  return {
    log: () => log,
    join(): Transport | null {
      if (present >= ROOM_LIMIT) return null
      present += 1
      const side = (['blue', 'orange'] as const).find((seat) => !taken.has(seat))
      const seat: Seat = side ?? 'spectator'
      if (side !== undefined) taken.add(side)
      const first = !established
      established = true
      // Anuncia ao entrar, e não ao assinar: sentar é o que muda a ocupação, e
      // prender o aviso à assinatura fazia uma conexão que ainda não escutou
      // ficar invisível para os outros. Quem acabou de chegar recebe o valor
      // atual na própria assinatura, logo abaixo.
      announce()
      let open = true
      /** Os desta conexão, para `close` levar todos embora. */
      let mine: ((message: Inbound) => void)[] = []

      return {
        send(message) {
          // Espectador não tem por onde jogar, e a regra mora aqui — não num
          // botão desabilitado em alguma tela.
          if (!open || side === undefined) return
          if (message.kind === 'ready') {
            readied.add(side)
            announce()
            return
          }
          if (message.kind === 'act') {
            // O `from` é do assento, nunca do que o cliente disse. É a única
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
          // A ordem é a que o cliente precisa: primeiro quem ele é e que
          // partida é esta, depois tudo o que já aconteceu.
          //
          // Reentregar o log não é conveniência: **o segundo jogador sempre
          // chega depois**, e sem isto ele começaria com o tabuleiro em branco
          // enquanto o primeiro já teria o sorteio da rodada. É o mesmo
          // mecanismo da reconexão — a partida é estado inicial mais lista de
          // ações, e assinar é receber a lista.
          listen({ kind: 'welcome', seat, config, first })
          listen({
            kind: 'peer',
            present: paired(),
            ready: { blue: ready('blue'), orange: ready('orange') },
          })
          for (const message of log) listen({ kind: 'action', message })
          listeners = [...listeners, listen]
          mine = [...mine, listen]
          return () => {
            listeners = listeners.filter((one) => one !== listen)
            mine = mine.filter((one) => one !== listen)
          }
        },
        close() {
          if (!open) return
          open = false
          present -= 1
          // Leva os ouvintes junto. Fechar sem isso deixaria a conexão morta
          // recebendo a partida inteira, e no Durable Object seria um `send`
          // num socket já fechado a cada lance.
          listeners = listeners.filter((one) => !mine.includes(one))
          mine = []
          // O assento volta a ficar livre, e é isso que faz reconectar
          // funcionar: quem volta senta no mesmo lugar e recebe o log inteiro.
          if (side !== undefined) {
            taken.delete(side)
            announce()
          }
        },
      }
    },
  }
}
