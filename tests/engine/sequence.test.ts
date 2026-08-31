import { expect, test } from 'vitest'
import { applyAction, awaitingDraw, startMatch, turn } from '../../src/engine/match'
import type { Action, Match } from '../../src/engine/match'
import { legalActions } from '../../src/engine/search'
import type { BoardCode, Piece } from '../../src/engine/types'

/**
 * A sequência de lances da Escolha Sorteada, conferida jogando.
 *
 * A regra é uma frase: quem tem a iniciativa nomeia um símbolo e move a sua
 * peça daquele símbolo, e o adversário fica obrigado a mover a peça do mesmo
 * símbolo (spec 4.1). Tudo depende disso — se o símbolo forçado pudesse escapar
 * de uma rodada para a outra, o jogador seria obrigado a uma peça que ninguém
 * escolheu, e nada na tela denunciaria.
 *
 * Os testes de unidade do seletor conferem a transição um passo de cada vez.
 * Este joga partidas inteiras, que é onde um estado vazado apareceria: não numa
 * chamada isolada de `advance`, mas na terceira rodada depois de um passe.
 *
 * Escrito porque o defeito foi relatado como sendo daqui — a vez voltando presa
 * a uma peça que o adversário não tinha jogado. Não era: o motor está certo, e o
 * que faltava era a tela contar que um passe aconteceu. Fica como a prova disso.
 */

/** Congruência linear: aleatório o bastante, e igual em toda execução. */
function rng(seed: number) {
  let state = seed >>> 0
  return () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296)
}

const BOARDS: readonly BoardCode[] = ['nbn', 'bbb', 'dbu']

test('a peça forçada é sempre a que quem tem a iniciativa acabou de jogar', () => {
  let forced = 0
  let passesByNamer = 0

  for (let seed = 1; seed <= 200; seed++) {
    const random = rng(seed)
    const board = BOARDS[seed % 3] as BoardCode
    let match: Match = startMatch({ board, mechanic: 'choice', maxActions: 400 })
    /** O símbolo nomeado nesta rodada, rastreado fora do motor para conferi-lo. */
    let named: Piece | null = null

    while (match.result === null) {
      if (awaitingDraw(match)) {
        const initiative = random() < 0.5 ? 'blue' : 'orange'
        const drawn = applyAction(match, { type: 'draw', initiative })
        if (!drawn.ok) throw new Error(drawn.reason)
        match = drawn.match
        // Uma rodada nova começa sem símbolo, e é isto que precisa valer.
        named = null
        continue
      }

      const current = turn(match)
      if (current === null) throw new Error('sem turno e sem sorteio pendente')

      if (current.piece === null) {
        expect(named, `semente ${seed}: nomeando duas vezes na mesma rodada`).toBeNull()
      } else {
        forced++
        expect(current.piece, `semente ${seed}`).toBe(named)
      }

      const options = legalActions(match)
      const action = options[Math.floor(random() * options.length)] as Action
      // Conferido, e não convertido: `legalActions` promete só lances e passes,
      // e uma conversão calaria o dia em que a promessa mudasse.
      if (action.type !== 'move' && action.type !== 'pass') {
        throw new Error(`legalActions devolveu ${action.type}`)
      }
      if (current.piece === null) {
        named = action.piece
        if (action.type === 'pass') passesByNamer++
      }
      const played = applyAction(match, action)
      if (!played.ok) throw new Error(played.reason)
      match = played.match
    }
  }

  expect(forced).toBeGreaterThan(10_000)
  // Sem isto o teste passaria de graça num jogo em que ninguém nunca passa —
  // e é justamente o passe de quem nomeia que a tela deixava invisível.
  expect(passesByNamer).toBeGreaterThan(100)
})
