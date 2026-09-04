import type { Action } from '../engine/match'
import type { BoardCode, Side } from '../engine/types'
import type { SequencedAction } from './wire'

/**
 * O que trafega entre o cliente e a sala.
 *
 * Nem tudo é lance. **Assento, configuração e presença não são ações**, e
 * misturá-los na lista seria fazer `replayMatch` depender de metadados de sala
 * — a lista é o que o motor executa, e o motor não sabe o que é uma sala.
 *
 * Por isso um envelope: o fluxo de ações vive dentro dele, ao lado do que a
 * sala precisa dizer e o jogo não.
 */

/** O que define a partida, e é escolhido por quem cria. */
export type RoomConfig = {
  board: BoardCode
  mechanic: 'rotation' | 'choice'
  /**
   * A barra é da sala, não sua. Cada um tem a própria tela: ligada só de um
   * lado, ela vira a assimetria que a regra existia para impedir.
   */
  evaluation: boolean
}

/** Espectador é um papel, não um assento vazio. */
export type Seat = Side | 'spectator'

export type Inbound =
  /**
   * A primeira coisa que a sala diz, e a resposta a duas perguntas que o
   * cliente não tem como responder sozinho: **em que assento sentei** e **que
   * partida é esta**.
   *
   * `first` é de quem estabeleceu a sala. Quem cria confere: se veio `false`,
   * o código já estava em uso e o certo é sortear outro — senão dois jogadores
   * que sorteiem o mesmo código caem na mesma sala, e o terceiro vira
   * espectador de uma partida alheia sem nada na tela dizendo isso.
   */
  | { kind: 'welcome'; seat: Seat; config: RoomConfig; first: boolean }
  | { kind: 'action'; message: SequencedAction }
  /**
   * Se os dois assentos estão ocupados.
   *
   * Não é lance, então não entra na lista de ações: `replayMatch` não pode
   * depender de quem estava conectado. Chega ao assinar e a cada mudança.
   *
   * Serve a duas coisas com um sinal só — a tela de espera aguarda ele virar
   * verdadeiro, e a queda do adversário é ele virando falso.
   */
  | { kind: 'peer'; present: boolean }

export type Outbound =
  | { kind: 'act'; action: Action }
  /** Pedido de sorteio da rodada. Quem sorteia é a sala, nunca o cliente. */
  | { kind: 'draw'; round: number }

const BOARDS = ['nbn', 'bbb', 'dbu']
const MECHANICS = ['rotation', 'choice']

/**
 * A configuração como ela chega — do endereço, no caso de quem cria.
 *
 * Devolve null em vez de consertar: uma configuração pela metade daria uma
 * partida em que os dois lados discordam sobre o tabuleiro, e cada tela acharia
 * que a outra é que está trapaceando.
 */
export function parseConfig(value: unknown): RoomConfig | null {
  if (typeof value !== 'object' || value === null) return null
  const { board, mechanic, evaluation } = value as Partial<RoomConfig>
  if (typeof board !== 'string' || !BOARDS.includes(board)) return null
  if (typeof mechanic !== 'string' || !MECHANICS.includes(mechanic)) return null
  if (typeof evaluation !== 'boolean') return null
  return { board: board as BoardCode, mechanic: mechanic as RoomConfig['mechanic'], evaluation }
}

/**
 * O que chega pela rede, conferido antes de virar qualquer coisa.
 *
 * O servidor ser nosso não é motivo para acreditar no que chega — é a mesma
 * postura de `readSaved` com o `localStorage`, e da mesma forma o custo é uma
 * função pura.
 */
export function parseInbound(raw: unknown): Inbound | null {
  if (typeof raw !== 'string') return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const message = value as { kind?: unknown }

  if (message.kind === 'welcome') {
    const { seat, config, first } = value as Partial<Extract<Inbound, { kind: 'welcome' }>>
    const settled = parseConfig(config)
    if (settled === null || typeof first !== 'boolean') return null
    if (seat !== 'blue' && seat !== 'orange' && seat !== 'spectator') return null
    return { kind: 'welcome', seat, config: settled, first }
  }

  if (message.kind === 'peer') {
    const { present } = value as { present?: unknown }
    if (typeof present !== 'boolean') return null
    return { kind: 'peer', present }
  }

  if (message.kind === 'action') {
    const inner = (value as { message?: unknown }).message
    if (typeof inner !== 'object' || inner === null) return null
    const { seq, from, action } = inner as Partial<SequencedAction>
    if (!Number.isInteger(seq)) return null
    if (from !== 'blue' && from !== 'orange' && from !== 'server') return null
    if (typeof action !== 'object' || action === null || typeof action.type !== 'string') {
      return null
    }
    // O conteúdo da ação não é conferido aqui: quem faz isso é o motor, e uma
    // segunda opinião seria uma segunda chance de discordar da primeira.
    return { kind: 'action', message: { seq: seq as number, from, action } }
  }

  return null
}
