import { applyAction, turn } from '../engine/match'
import type { Action, Match } from '../engine/match'
import type { Side } from '../engine/types'

/**
 * O que um cliente aceita da rede (projeto, desenho do passo 9, seção 3.2).
 *
 * Existe porque **`Action` não tem autor**. O motor deriva quem jogou a partir
 * do seletor — offline isso sempre bastou, já que há um aparelho e quem manda a
 * ação é quem está na vez por construção. Na rede essa construção some, e sem
 * este arquivo dois ataques passam:
 *
 * - `resign` mandado na vez do adversário registra que **ele** desistiu, porque
 *   o motor grava `winner: other(side)` e `side` é de quem é a vez. Uma
 *   mensagem, partida ganha.
 * - `acceptDraw` não olha lado nenhum, e `offerDraw` não avança o seletor: dá
 *   para oferecer empate e aceitar a própria oferta, escapando de qualquer
 *   posição perdida sem o adversário concordar.
 *
 * Fica **fora do motor** de propósito. Autoria não é conhecimento que o motor
 * tenha: é conhecimento que só a conexão tem, e o servidor carimba. Mantê-la
 * aqui deixa o motor sendo o que ele é — um jogo puro que não sabe que existe
 * rede, e que continua valendo igual para a partida salva no aparelho.
 */

/** Quem falou. `server` é a sala, e ela só sorteia. */
export type Author = Side | 'server'

export type SequencedAction = { seq: number; from: Author; action: Action }

export type Verdict = { ok: true; match: Match } | { ok: false; reason: string }

const other = (side: Side): Side => (side === 'blue' ? 'orange' : 'blue')

/** Uma oferta de empate aberta é a última ação, e ela não avança o seletor. */
const offerPending = (match: Match): boolean => match.actions.at(-1)?.type === 'offerDraw'

/**
 * Aceita a mensagem e devolve a partida resultante, ou o motivo da recusa.
 *
 * Confere **autoria e ordem**, e entrega o resto ao motor. Não repete nenhuma
 * checagem de regra: uma segunda implementação de "este lance é legal" seria
 * uma segunda chance de discordar da primeira.
 */
export function admits(match: Match, expected: number, message: SequencedAction): Verdict {
  if (message.seq !== expected) {
    // Repetida ou fora de ordem. Reexecutar um lance já aplicado corromperia a
    // partida dos dois lados de formas que o motor não teria como notar.
    return { ok: false, reason: `esperava a ação ${expected}, veio a ${message.seq}` }
  }

  const { from, action } = message

  if (action.type === 'abandon') {
    // Presença é conhecimento da sala, como o sorteio. Um jogador que pudesse
    // emitir isto reivindicaria vitória a qualquer momento, sem ninguém ter
    // saído — e nenhuma regra do jogo poderia notar.
    if (from !== 'server') return { ok: false, reason: 'só a sala declara abandono' }
    return apply(match, action)
  }

  if (action.type === 'draw') {
    // Um jogador que pudesse sortear escolheria a própria iniciativa, que é o
    // jogo inteiro da Escolha Sorteada (projeto 2.3).
    if (from !== 'server') return { ok: false, reason: 'só a sala sorteia' }
    return apply(match, action)
  }
  // Não há guarda para `from === 'server'` aqui, e a ausência é deliberada: a
  // checagem de autoria lá embaixo já a cobre, porque `allowed` é sempre um dos
  // dois lados e `'server'` nunca é igual a nenhum deles. A guarda existiu, e
  // uma mutação mostrou que nenhum teste conseguia distingui-la — ela só
  // trocava o texto do motivo.

  const current = turn(match)
  if (current === null) {
    // Estreitamento, não regra: `current.side` abaixo precisa de um lado. O
    // motor recusa a mesma coisa por conta própria, então nada aqui depende
    // desta linha para estar correto.
    return { ok: false, reason: 'a rodada ainda espera o sorteio' }
  }

  const allowed =
    offerPending(match) && (action.type === 'acceptDraw' || action.type === 'declineDraw')
      ? // Quem ofereceu não responde: o seletor não avançou, então quem está na
        // vez é justamente o proponente.
        other(current.side)
      : current.side

  if (from !== allowed) {
    return { ok: false, reason: `essa ação é de ${allowed}, veio de ${from}` }
  }
  return apply(match, action)
}

function apply(match: Match, action: Action): Verdict {
  const result = applyAction(match, action)
  return result.ok ? { ok: true, match: result.match } : { ok: false, reason: result.reason }
}
