import { describe, expect, test } from 'vitest'
import { admits } from '../../src/net/wire'
import type { SequencedAction } from '../../src/net/wire'
import { applyAction, startMatch } from '../../src/engine/match'
import type { Match } from '../../src/engine/match'
import { legalMoves } from '../../src/engine/moves'
import type { Cell } from '../../src/engine/types'

/**
 * O que um cliente aceita da rede.
 *
 * Isto existe porque `Action` **não tem autor**. O motor deriva quem jogou a
 * partir do seletor, e offline isso sempre bastou: há um aparelho, e quem manda
 * a ação é quem está na vez por construção. Na rede essa construção some, e sem
 * este validador dois ataques passam — os dois primeiros testes abaixo.
 *
 * Fica fora do motor de propósito. Autoria é transporte, não regra: o motor
 * segue sem saber que existe rede.
 */

const played = (match: Match, ...actions: Parameters<typeof applyAction>[1][]): Match =>
  actions.reduce((current, action) => {
    const next = applyAction(current, action)
    if (!next.ok) throw new Error(next.reason)
    return next.match
  }, match)

/** Uma partida da Escolha Sorteada com a iniciativa do azul já sorteada. */
const drawn = () =>
  played(startMatch({ board: 'dbu', mechanic: 'choice' }), { type: 'draw', initiative: 'blue' })

const wrap = (seq: number, from: SequencedAction['from'], action: SequencedAction['action']) =>
  ({ seq, from, action }) as SequencedAction

describe('desistir pelo adversário', () => {
  test('recusa um resign que não veio de quem está na vez', () => {
    // O furo: `resign` grava `winner: other(side)`, e `side` é de quem é a vez.
    // Mandado na vez do adversário, o motor registra que **ele** desistiu — e
    // quem mandou vence. Uma mensagem, partida ganha.
    const match = drawn()

    const verdict = admits(match, 1, wrap(1, 'orange', { type: 'resign' }))

    expect(verdict.ok).toBe(false)
  })

  test('aceita o resign de quem está na vez', () => {
    const match = drawn()

    expect(admits(match, 1, wrap(1, 'blue', { type: 'resign' })).ok).toBe(true)
  })
})

describe('aceitar o próprio empate', () => {
  test('recusa o aceite vindo de quem ofereceu', () => {
    // `acceptDraw` não olha lado nenhum, só se existe oferta pendente — e
    // `offerDraw` não avança o seletor. Oferecer e aceitar a própria oferta
    // escapa de qualquer posição perdida sem o adversário concordar.
    const match = played(drawn(), { type: 'offerDraw' })

    expect(admits(match, 2, wrap(2, 'blue', { type: 'acceptDraw' })).ok).toBe(false)
  })

  test('aceita o aceite vindo do outro lado', () => {
    const match = played(drawn(), { type: 'offerDraw' })

    expect(admits(match, 2, wrap(2, 'orange', { type: 'acceptDraw' })).ok).toBe(true)
  })

  test('recusa a recusa vinda de quem ofereceu', () => {
    const match = played(drawn(), { type: 'offerDraw' })

    expect(admits(match, 2, wrap(2, 'blue', { type: 'declineDraw' })).ok).toBe(false)
  })
})

describe('a vez', () => {
  test('recusa o lance de quem não está na vez', () => {
    const match = drawn()
    const to = legalMoves('dbu', match.placement, 'blue', 'circle')[0] as Cell

    expect(admits(match, 1, wrap(1, 'orange', { type: 'move', piece: 'circle', to })).ok).toBe(false)
  })

  test('segue a vez quando ela troca de lado', () => {
    // Depois de quem nomeia jogar, a vez é do outro — e o validador precisa
    // acompanhar isso, não guardar quem começou.
    const first = drawn()
    const to = legalMoves('dbu', first.placement, 'blue', 'circle')[0] as Cell
    const match = played(first, { type: 'move', piece: 'circle', to })
    const reply = legalMoves('dbu', match.placement, 'orange', 'circle')[0] as Cell

    expect(admits(match, 2, wrap(2, 'orange', { type: 'move', piece: 'circle', to: reply })).ok).toBe(true)
    expect(admits(match, 2, wrap(2, 'blue', { type: 'move', piece: 'circle', to: reply })).ok).toBe(false)
  })
})

describe('o sorteio', () => {
  test('só o servidor sorteia', () => {
    // Um jogador que pudesse mandar `draw` escolheria a própria iniciativa —
    // que é o jogo inteiro da Escolha Sorteada.
    const match = startMatch({ board: 'dbu', mechanic: 'choice' })

    expect(admits(match, 0, wrap(0, 'blue', { type: 'draw', initiative: 'blue' })).ok).toBe(false)
    expect(admits(match, 0, wrap(0, 'server', { type: 'draw', initiative: 'blue' })).ok).toBe(true)
  })

  test('o servidor não joga', () => {
    // Ele carimba e sorteia. Um lance vindo dele é sinal de defeito, não de
    // autoridade.
    const match = drawn()

    expect(admits(match, 1, wrap(1, 'server', { type: 'resign' })).ok).toBe(false)
  })

  test('ninguém joga enquanto a rodada espera o sorteio', () => {
    const match = startMatch({ board: 'dbu', mechanic: 'choice' })

    expect(admits(match, 0, wrap(0, 'blue', { type: 'offerDraw' })).ok).toBe(false)
  })
})

describe('a ordem', () => {
  test('recusa o que chega fora de ordem', () => {
    // Mensagem repetida ou fora de sequência reexecutaria um lance já aplicado.
    const match = drawn()

    expect(admits(match, 1, wrap(2, 'blue', { type: 'resign' })).ok).toBe(false)
    expect(admits(match, 1, wrap(0, 'blue', { type: 'resign' })).ok).toBe(false)
  })
})

describe('o que o motor já recusa', () => {
  test('não repete a checagem de regra, e devolve o motivo do motor', () => {
    // Autoria é o que este arquivo sabe e o motor não. O resto continua sendo
    // do motor, e duplicar aqui seria uma segunda chance de discordar dele.
    const match = drawn()

    const verdict = admits(match, 1, wrap(1, 'blue', { type: 'move', piece: 'circle', to: 0 }))

    expect(verdict.ok).toBe(false)
    if (verdict.ok) throw new Error('deveria recusar')
    expect(verdict.reason).toBe('illegal destination')
  })
})
