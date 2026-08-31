import type { MatchConfig } from '../engine/match'
import type { BoardCode } from '../engine/types'

/**
 * Como o jogo se chama em português, e quais combinações existem.
 *
 * Num arquivo só porque já esteve em três: o painel, o card e o convite. Três
 * cópias da mesma tabela não quebram nada no dia em que são escritas — quebram
 * no dia em que uma delas ganha um tabuleiro e as outras não.
 *
 * O código é em inglês e o português fica no que o jogador lê. Estes são
 * exatamente esses.
 */

export type Mechanic = MatchConfig['mechanic']

export const BOARD_PT: Record<BoardCode, string> = {
  nbn: 'Ponte',
  bbb: 'Grade',
  dbu: 'Setas',
}

export const MECHANIC_PT: Record<Mechanic, string> = {
  choice: 'Escolha Sorteada',
  rotation: 'Rodízio',
}

/**
 * Onde cada mecânica dá jogo.
 *
 * O Rodízio na Ponte empata a partir de qualquer abertura, então não é partida:
 * a combinação não é oferecida em lugar nenhum, e esta tabela é o único lugar
 * onde isso está dito.
 */
export const BOARDS_FOR: Record<Mechanic, readonly BoardCode[]> = {
  choice: ['nbn', 'bbb', 'dbu'],
  rotation: ['bbb', 'dbu'],
}
