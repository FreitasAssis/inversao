import { describe, expect, test } from 'vitest'
import { curveText, positionText, puzzleShareText, shareText } from '../../src/ui/share'
import type { ShareMatch } from '../../src/ui/share'
import { INITIAL, TARGETS } from '../../src/engine/board'
import type { Annotation, Moment } from '../../src/engine/annotate'

/**
 * O texto que a pessoa cola.
 *
 * Ele é o produto de verdade deste recurso: a imagem não sobrevive à maioria
 * dos desktops, e o texto sobrevive a tudo. Por isso está testado como lógica
 * pura, com a partida entrando por parâmetro.
 */

const chance = (ply: number, blue: number, mover: Moment['mover'] = 'blue'): Moment => ({
  ply,
  assessment: { kind: 'chance', blue },
  mover,
  cost: null,
})

const base: ShareMatch = {
  board: 'bbb',
  mechanic: 'choice',
  result: { kind: 'win', winner: 'blue' },
  actions: 302,
  placement: INITIAL,
  names: { blue: 'Luiz', orange: 'Inversa' },
  level: 'insane',
  annotation: null,
  viewpoint: 'blue',
  url: 'inversao.luizfreitas.com.br',
}

describe('a posição como grade', () => {
  test('desenha as doze casas em quatro linhas de três', () => {
    const rows = positionText(INITIAL).split('\n')

    expect(rows).toHaveLength(4)
    for (const row of rows) expect(row.split(' ')).toHaveLength(3)
  })

  test('separa os lados por cheio contra vazado, e não por cor', () => {
    // Um texto colado não tem cor. Cheio contra vazado é a distinção que o
    // próprio tabuleiro usa no modo sem cor, então não é notação nova.
    const grid = positionText(INITIAL)

    // Azul abre em A3, A2, A1 — círculo, triângulo, quadrado.
    expect(grid.split('\n')[0]).toBe('■ ▲ ●')
    // Laranja abre em D1, D2, D3, e vazado.
    expect(grid.split('\n')[3]).toBe('○ △ □')
  })

  test('marca a casa vazia, senão a grade perde as colunas', () => {
    const grid = positionText(INITIAL)

    expect(grid.split('\n')[1]).toBe('· · ·')
  })

  test('mostra as três peças de quem venceu alinhadas na fileira delas', () => {
    // É a foto do "consegui", e a única coisa que uma vitória sempre desenha.
    const won = positionText({ blue: TARGETS.blue, orange: [0, 1, 2] })

    expect(won.split('\n')[3]).toBe('● ■ ▲')
  })
})

describe('a curva', () => {
  test('abre os oito blocos sobre a faixa de 30% a 70%', () => {
    // Medido em partidas reais: o valor passa a partida quase inteira entre 40%
    // e 60% e só desaba no fim. Na escala 0–100% seis partidas diferentes davam
    // o mesmo traço reto, porque P(azul vence) = 0,5 é provado por simetria.
    const low = curveText([0.3], 1)
    const middle = curveText([0.5], 1)
    const high = curveText([0.7], 1)

    expect(low).toBe('▁')
    expect(middle).toBe('▅')
    expect(high).toBe('█')
  })

  test('satura fora da faixa em vez de sumir, porque ali a partida acabou', () => {
    expect(curveText([0], 1)).toBe('▁')
    expect(curveText([1], 1)).toBe('█')
  })

  test('reamostra a partida inteira na largura pedida', () => {
    // Uma partida tem centenas de lances e o card tem vinte colunas.
    const many = Array.from({ length: 300 }, (_, index) => index / 299)

    expect(curveText(many, 20)).toHaveLength(20)
  })

  test('começa e termina nos extremos da partida, não perto deles', () => {
    // Um erro de índice aqui corta o último lance — que é justamente onde a
    // partida se decide, e o único ponto que o card não pode perder.
    const rising = [0.3, 0.4, 0.5, 0.6, 0.7]

    const drawn = curveText(rising, 5)
    expect(drawn[0]).toBe('▁')
    expect(drawn.at(-1)).toBe('█')
  })
})

describe('o texto compartilhado', () => {
  test('abre dizendo tabuleiro e mecânica, que são o que muda entre partidas', () => {
    expect(shareText(base)).toContain('Inversão · Grade · Escolha Sorteada')
  })

  test('nomeia o nível junto de quem o jogava', () => {
    // Vencer o Insano é a conquista real do jogo, e sem o rótulo a vitória fica
    // indistinguível de uma no Fácil. Pendurado na Inversa e não em quem venceu:
    // a dificuldade é dela.
    expect(shareText(base)).toContain('Vitória de Luiz sobre Inversa (Insano)')
  })

  test('não inventa nível entre dois humanos', () => {
    const text = shareText({ ...base, level: null, names: { blue: 'Luiz', orange: 'Ana' } })

    expect(text).toContain('Vitória de Luiz sobre Ana ·')
    expect(text).not.toMatch(/\(/)
  })

  test('conta as ações, que é a duração que o jogador sentiu', () => {
    expect(shareText(base)).toContain('302 ações')
  })

  test('diz quando a vitória veio por desistência', () => {
    const text = shareText({ ...base, result: { kind: 'resignation', winner: 'blue' } })

    expect(text).toContain('por desistência')
  })

  test('leva a posição final', () => {
    expect(shareText(base)).toContain(positionText(INITIAL))
  })

  test('termina no endereço, que é o que faz o card servir para alguma coisa', () => {
    expect(shareText(base).trimEnd().endsWith('inversao.luizfreitas.com.br')).toBe(true)
  })
})

describe('o texto compartilhado, com a tabela na mão', () => {
  const annotation: Annotation = {
    moments: [chance(0, 0.5), chance(1, 0.5), chance(2, 0.3, 'blue')],
    turningPoint: chance(2, 0.3, 'blue'),
  }

  test('desenha a curva e aponta o lance que virou', () => {
    const text = shareText({ ...base, annotation })

    expect(text).toMatch(/[▁▂▃▄▅▆▇█]{20}/)
    expect(text).toContain('virou no lance 2: 50% → 30%')
  })

  test('lê a curva do lado de quem compartilha', () => {
    // Um card que sobe quando o adversário está ganhando lê ao contrário. O
    // valor da tabela é sempre P(azul vence), então laranja precisa do espelho.
    const asBlue = shareText({ ...base, annotation }).match(/[▁▂▃▄▅▆▇█]{20}/)?.[0]
    const asOrange = shareText({ ...base, annotation, viewpoint: 'orange' }).match(
      /[▁▂▃▄▅▆▇█]{20}/,
    )?.[0]

    expect(asBlue).not.toBe(asOrange)
    expect(asBlue?.at(-1)).toBe('▁')
    expect(asOrange?.at(-1)).toBe('█')
  })

  test('cobra o erro de quem o cometeu, e não sempre do azul', () => {
    // A tabela guarda P(azul vence), sempre. Se laranja é quem entregou, a
    // frase precisa dizer o que **laranja** perdeu — senão o card anuncia que
    // o jogador subiu de 50% para 70% no lance em que ele errou.
    const byOrange: Annotation = {
      moments: [chance(0, 0.5), chance(1, 0.7, 'orange')],
      turningPoint: chance(1, 0.7, 'orange'),
    }

    expect(shareText({ ...base, annotation: byOrange })).toContain('lance 1: 50% → 30%')
  })

  test('não desenha curva nenhuma no Rodízio', () => {
    // Ali o veredito é discreto — ganha, perde ou empata. Oito alturas
    // desenhariam uma precisão que a tabela não tem.
    const verdict: Annotation = {
      moments: [
        { ply: 0, assessment: { kind: 'verdict', winner: null, distance: 0 }, mover: null, cost: null },
        { ply: 1, assessment: { kind: 'verdict', winner: 'blue', distance: 40 }, mover: 'orange', cost: 1 },
      ],
      turningPoint: {
        ply: 1,
        assessment: { kind: 'verdict', winner: 'blue', distance: 40 },
        mover: 'orange',
        cost: 1,
      },
    }

    const text = shareText({ ...base, mechanic: 'rotation', annotation: verdict })

    expect(text).not.toMatch(/[▁▂▃▄▅▆▇█]/)
    expect(text).toContain('virou no lance 1')
  })

  test('cala sobre a curva quando não há tabela baixada', () => {
    // Sem tabela não há nada honesto a dizer, e o card ainda vale pela grade.
    const text = shareText(base)

    expect(text).not.toMatch(/[▁▂▃▄▅▆▇█]/)
    expect(text).not.toContain('virou')
    expect(text).toContain(positionText(INITIAL))
  })

  test('diz que ninguém entregou nada em vez de inventar um lance', () => {
    const clean: Annotation = { moments: [chance(0, 0.5), chance(1, 0.5)], turningPoint: null }

    expect(shareText({ ...base, annotation: clean })).not.toContain('virou')
  })
})

describe('o card dos desafios do dia', () => {
  const day = {
    date: '31 de agosto de 2026',
    answers: { nbn: true, bbb: false },
    streaks: { attempted: 7, perfect: 3 },
    url: 'inversao.luizfreitas.com.br',
  }

  test('mostra os três tabuleiros, inclusive o que não foi tentado', () => {
    // Esconder o não tentado transformaria "não fiz" em "não existe", e são
    // três por dia justamente para mostrar as três topologias.
    const text = puzzleShareText(day)

    expect(text).toContain('Ponte ✔')
    expect(text).toContain('Grade ✘')
    expect(text).toContain('Setas —')
  })

  test('não distingue certo de errado só pela cor', () => {
    // A convenção do Wordle é verde contra vermelho, e aqui não serve: seria a
    // única informação do card carregada só pela cor, num projeto que mantém um
    // modo sem cor e mede contraste por teste.
    expect(puzzleShareText(day)).not.toMatch(/🟩|🟥|🟧|🟦|⬛|⬜/u)
  })

  test('não entrega a resposta', () => {
    // O laço do recurso é quem recebe abrir e encarar os mesmos três. Um card
    // que diga o lance destrói exatamente isso.
    const text = puzzleShareText(day)

    expect(text).not.toMatch(/[ABCD][123]/)
    expect(text).not.toMatch(/círculo|triângulo|quadrado/i)
  })

  test('leva a data, senão dois dias diferentes compartilham igual', () => {
    expect(puzzleShareText(day)).toContain('31 de agosto de 2026')
  })

  test('conta as duas sequências', () => {
    expect(puzzleShareText(day)).toContain('7 dias seguidos, 3 perfeitos')
  })

  test('fala no singular quando é um dia só', () => {
    const text = puzzleShareText({ ...day, streaks: { attempted: 1, perfect: 1 } })

    expect(text).toContain('1 dia seguido, 1 perfeito')
  })

  test('cala a sequência perfeita quando ela é zero', () => {
    const text = puzzleShareText({ ...day, streaks: { attempted: 4, perfect: 0 } })

    expect(text).toContain('4 dias seguidos')
    expect(text).not.toContain('perfeito')
  })

  test('não anuncia zero dia seguido no primeiro dia', () => {
    // É o dia em que a pessoa mais precisa de um motivo para voltar amanhã, e
    // "0 dias seguidos" é pior do que linha nenhuma.
    const text = puzzleShareText({ ...day, streaks: { attempted: 0, perfect: 0 } })

    expect(text).not.toContain('0 dias')
    expect(text).toContain('Ponte ✔')
  })
})
