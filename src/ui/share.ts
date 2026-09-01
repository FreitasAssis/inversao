import type { Annotation } from '../engine/annotate'
import type { Result } from '../engine/match'
import { PIECES } from '../engine/types'
import type { BoardCode, Placement, Side } from '../engine/types'
import { BOARD_PT, MECHANIC_PT } from './labels'
import { LEVEL_LABELS } from './levels'
import type { Level } from './levels'

/**
 * O texto que a pessoa cola (projeto 7.2).
 *
 * Puro: sem DOM, sem Canvas, sem React. A imagem é embalagem e depende de um
 * contexto de desenho; isto é a substância, e é o que sobra quando o navegador
 * não sabe compartilhar arquivo — a maioria dos desktops.
 *
 * **Símbolo, e não letra.** A notação do `extrai.c` é `Lt Lq Lo`, que pede
 * legenda e fonte monoespaçada; colada no WhatsApp ela sai torta. Cheio contra
 * vazado é a mesma distinção que o tabuleiro já usa no modo sem cor, não tem
 * idioma e não precisa de legenda. As letras seguem valendo onde servem, que é
 * nos documentos e nas ferramentas em C.
 */

const FILLED = ['●', '▲', '■'] as const
const HOLLOW = ['○', '△', '□'] as const
const EMPTY = '·'

/**
 * O endereço, e o motivo do card existir. Uma constante só: dois arquivos com a
 * mesma string sairiam de sincronia no dia em que o domínio mudasse, e o card
 * antigo continuaria mandando gente para lugar nenhum.
 */
export const SITE = 'inversao.luizfreitas.com.br'


/**
 * A posição como grade 4×3.
 *
 * Numa vitória as três peças de quem venceu ficam alinhadas na fileira dela, e
 * quem varia de partida para partida é o **perdedor** — que é onde a foto deixa
 * de ser igual a todas as outras.
 */
export function positionText(placement: Placement): string {
  const cells: string[] = new Array(12).fill(EMPTY)
  for (const side of ['blue', 'orange'] as const) {
    PIECES.forEach((_, index) => {
      const glyph = side === 'blue' ? FILLED[index] : HOLLOW[index]
      cells[placement[side][index] as number] = glyph as string
    })
  }
  return [0, 1, 2, 3].map((row) => cells.slice(row * 3, row * 3 + 3).join(' ')).join('\n')
}

/** Os oito blocos, do mais baixo ao mais alto. */
const BLOCKS = '▁▂▃▄▅▆▇█'

/**
 * A janela que os oito blocos cobrem.
 *
 * **Não é 0 a 100%, e a diferença decide se o desenho existe.** Medido em
 * partidas reais anotadas pela tabela: o valor passa a partida quase inteira
 * entre 40% e 60%, e só desaba nos últimos lances. Na escala cheia, seis
 * partidas diferentes davam praticamente o mesmo traço reto — porque
 * P(azul vence) = 0,5 é provado por simetria, então é ali que o jogo mora.
 *
 * Fora da janela a partida já acabou, e saturar no topo ou no fundo é a
 * informação certa.
 */
const FLOOR = 0.3
const CEILING = 0.7

/** A curva reamostrada em `width` blocos. */
export function curveText(values: readonly number[], width: number): string {
  if (values.length === 0 || width <= 0) return ''
  if (values.length === 1) return (BLOCKS[block(values[0] as number)] ?? '') as string
  return Array.from({ length: width }, (_, column) => {
    const at = Math.round((column * (values.length - 1)) / (width - 1))
    return BLOCKS[block(values[at] as number)] as string
  }).join('')
}

function block(value: number): number {
  const scaled = (value - FLOOR) / (CEILING - FLOOR)
  return Math.min(7, Math.max(0, Math.floor(scaled * 8)))
}

export type ShareMatch = {
  board: BoardCode
  mechanic: 'rotation' | 'choice'
  result: Result
  actions: number
  placement: Placement
  /** Já resolvidos: quem compartilha não quer ver "Azul" se digitou um nome. */
  names: Record<Side, string>
  /**
   * O nível, ou null entre dois humanos — onde ele não significa nada. Contra a
   * Inversa ele muda o peso da frase inteira: vencer o Insano é a conquista real
   * do jogo, e sem o rótulo a vitória fica indistinguível de uma no Fácil.
   */
  level: Level | null
  /** Null sem tabela baixada: aí não há nada honesto a dizer sobre a curva. */
  annotation: Annotation | null
  /** De quem é a leitura. A curva sobe quando **você** está ganhando. */
  viewpoint: Side
  url: string
}

/** Quantos blocos a curva ocupa. Largura de linha curta, para não quebrar. */
const CURVE_WIDTH = 20

export function shareText(match: ShareMatch): string {
  const parts = [
    `Inversão · ${BOARD_PT[match.board]} · ${MECHANIC_PT[match.mechanic]}`,
    headline(match),
    '',
    positionText(match.placement),
  ]

  const curve = curveOf(match)
  if (curve !== null) parts.push('', curve)

  const turn = turningText(match)
  if (turn !== null) parts.push(turn)

  parts.push('', match.url)
  return parts.join('\n')
}

function headline(match: ShareMatch): string {
  const { result, names, level, actions } = match
  const count = `${actions} ações`
  if (result.kind !== 'win' && result.kind !== 'resignation' && result.kind !== 'abandonment') {
    return `${drawWord(result)} · ${count}`
  }
  const winner = names[result.winner]
  const loser = names[result.winner === 'blue' ? 'orange' : 'blue']
  // O nível pendurado em quem o jogava, que é a Inversa — dizer "Vitória de
  // Luiz (Insano)" atribuiria a ele uma dificuldade que não é dele.
  const beaten = level === null ? loser : `${loser} (${LEVEL_LABELS[level]})`
  const how =
    result.kind === 'resignation'
      ? ', por desistência'
      : result.kind === 'abandonment'
        ? ', o adversário saiu'
        : ''
  return `Vitória de ${winner} sobre ${beaten}${how} · ${count}`
}

function drawWord(result: Result): string {
  switch (result.kind) {
    case 'agreedDraw':
      return 'Empate por acordo'
    case 'repetitionDraw':
      return 'Empate por repetição'
    default:
      return 'Empate no limite de lances'
  }
}

/**
 * A curva, ou null onde ela mentiria.
 *
 * Só existe na Escolha Sorteada. No Rodízio o veredito é discreto — ganha,
 * perde ou empata —, então um traço de oito alturas desenharia uma precisão que
 * a tabela não tem. Ali a anotação vira frase, e é só isso que o card leva.
 */
function curveOf(match: ShareMatch): string | null {
  const moments = match.annotation?.moments
  if (moments === undefined || moments.length === 0) return null
  const values = moments.map((moment) =>
    moment.assessment.kind === 'chance' ? moment.assessment.blue : null,
  )
  if (values.some((value) => value === null)) return null
  const mine = values.map((blue) =>
    match.viewpoint === 'blue' ? (blue as number) : 1 - (blue as number),
  )
  return curveText(mine, CURVE_WIDTH)
}

function turningText(match: ShareMatch): string | null {
  const turning = match.annotation?.turningPoint
  if (turning === undefined || turning === null) return null
  const moments = match.annotation?.moments ?? []
  const before = moments[turning.ply - 1]

  if (turning.assessment.kind === 'chance' && before?.assessment.kind === 'chance') {
    // Do ponto de vista de quem jogou o lance: é o custo **dele**.
    const mine = (blue: number) => (turning.mover === 'blue' ? blue : 1 - blue)
    return `virou no lance ${turning.ply}: ${percent(mine(before.assessment.blue))} → ${percent(
      mine(turning.assessment.blue),
    )}`
  }
  return `virou no lance ${turning.ply}`
}

const percent = (value: number) => `${(value * 100).toFixed(0)}%`

/**
 * O card dos desafios do dia (projeto 8.4).
 *
 * **Sem spoiler**: diz o que aconteceu, nunca qual era o lance. Quem recebe
 * abre e encara os mesmos três, que é o laço inteiro do recurso.
 *
 * E sem cor. A convenção do Wordle é quadrado verde contra vermelho, e aqui ela
 * não serve: seria a única informação do card, carregada só pela cor, num
 * projeto que mantém um modo sem cor e mede contraste por teste. Certo, errado
 * e não tentado precisam se distinguir em preto e branco.
 */
const VERDICT = { right: '✔', wrong: '✘', absent: '—' } as const

export type PuzzleShare = {
  /** Já escrita por extenso — quem formata é quem já mostra a data na tela. */
  date: string
  answers: Partial<Record<BoardCode, boolean>>
  streaks: { attempted: number; perfect: number }
  url: string
}

export function puzzleShareText(share: PuzzleShare): string {
  const line = (['nbn', 'bbb', 'dbu'] as const)
    .map((board) => {
      const answer = share.answers[board]
      const mark = answer === undefined ? VERDICT.absent : answer ? VERDICT.right : VERDICT.wrong
      return `${BOARD_PT[board]} ${mark}`
    })
    .join(' · ')

  const parts = [`Inversão · desafios de ${share.date}`, line]
  const streak = streakLine(share.streaks)
  if (streak !== null) parts.push('', streak)
  parts.push('', share.url)
  return parts.join('\n')
}

/**
 * Null no primeiro dia. Um card anunciando "0 dias seguidos" é pior do que um
 * card sem linha nenhuma — e é exatamente o dia em que a pessoa mais precisa de
 * um motivo para voltar amanhã.
 */
function streakLine(streaks: { attempted: number; perfect: number }): string | null {
  if (streaks.attempted === 0) return null
  const days = streaks.attempted === 1 ? '1 dia seguido' : `${streaks.attempted} dias seguidos`
  if (streaks.perfect === 0) return days
  const perfect = streaks.perfect === 1 ? '1 perfeito' : `${streaks.perfect} perfeitos`
  return `${days}, ${perfect}`
}
