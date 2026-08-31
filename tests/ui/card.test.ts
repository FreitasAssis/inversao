import { describe, expect, test } from 'vitest'
import { CARD, cardPlan, paint, readPalette } from '../../src/ui/card'
import type { CardInput, Palette, Shape } from '../../src/ui/card'
import { INITIAL, TARGETS } from '../../src/engine/board'
import type { Placement } from '../../src/engine/types'

/**
 * O card como imagem.
 *
 * O `jsdom` não tem canvas, então uma função que pintasse direto no contexto
 * seria a única parte visual do projeto sem teste nenhum. Por isso o desenho é
 * **plano** — uma lista de formas com coordenadas — e só a execução do plano
 * toca o navegador. O que se confere aqui é aritmética.
 */

const PALETTE: Palette = {
  blue: '#2f78c4',
  orange: '#b5651d',
  line: '#73726c',
  ink: '#3d3d3a',
  paper: '#faf9f5',
  surface: '#f4f3ee',
}

const base: CardInput = {
  board: 'dbu',
  placement: INITIAL,
  title: 'Inversão · Setas · Escolha Sorteada',
  headline: 'Vitória de Luiz sobre Inversa (Insano)',
  curve: [],
  turning: null,
  caption: null,
  url: 'inversao.luizfreitas.com.br',
}

/** Todo canto que uma forma ocupa, para conferir que ela cabe no card. */
function extent(shape: Shape): { x: number; y: number }[] {
  switch (shape.kind) {
    case 'rect':
      return [{ x: shape.x, y: shape.y }, { x: shape.x + shape.w, y: shape.y + shape.h }]
    case 'circle':
      return [{ x: shape.x - shape.r, y: shape.y - shape.r }, { x: shape.x + shape.r, y: shape.y + shape.r }]
    case 'triangle':
      return [{ x: shape.x, y: shape.y }, { x: shape.x + shape.w, y: shape.y + shape.h }]
    case 'path':
      return shape.points.map(([x, y]) => ({ x, y }))
    case 'text':
      // O texto é centralizado e cresce para os dois lados; o que importa aqui
      // é a linha de base não cair fora do card.
      return [{ x: shape.x, y: shape.y }]
  }
}

/** As formas que têm preenchimento e contorno — tudo menos texto e traçado. */
type Solid = Extract<Shape, { kind: 'rect' | 'circle' | 'triangle' }>
const solids = (shapes: readonly Shape[]): Solid[] =>
  shapes.filter((s): s is Solid => s.kind !== 'text' && s.kind !== 'path')

const full = (over: Partial<CardInput> = {}): Shape[] =>
  cardPlan({ ...base, curve: [0.5, 0.6, 0.4, 0.2], turning: 2, caption: 'virou no lance 2', ...over }, PALETTE)

describe('o plano do card', () => {
  test('cabe inteiro dentro da tela, com curva e legenda desenhadas', () => {
    // Escrevendo o layout à mão eu já empilhei a legenda em cima do endereço
    // duas vezes. É aritmética, e aritmética se confere.
    for (const shape of full()) {
      for (const { x, y } of extent(shape)) {
        expect(x, `${shape.kind} saiu na horizontal`).toBeGreaterThanOrEqual(0)
        expect(x, `${shape.kind} saiu na horizontal`).toBeLessThanOrEqual(CARD.width)
        expect(y, `${shape.kind} saiu na vertical`).toBeGreaterThanOrEqual(0)
        expect(y, `${shape.kind} saiu na vertical`).toBeLessThanOrEqual(CARD.height)
      }
    }
  })

  test('deixa a legenda acima do endereço, em vez de por cima dele', () => {
    const shapes = full()
    const caption = shapes.find((s) => s.kind === 'text' && s.text === 'virou no lance 2')
    const url = shapes.find((s) => s.kind === 'text' && s.text === base.url)

    expect(caption?.kind === 'text' && url?.kind === 'text').toBe(true)
    if (caption?.kind !== 'text' || url?.kind !== 'text') throw new Error('faltou texto')
    expect(caption.y).toBeLessThan(url.y - caption.size)
  })

  test('desenha as doze casas', () => {
    const cells = solids(cardPlan(base, PALETTE)).filter((s) => s.fill === PALETTE.surface)

    expect(cells).toHaveLength(12)
  })

  test('nenhuma casa encosta na outra', () => {
    const cells = cardPlan(base, PALETTE).filter(
      (s) => s.kind === 'rect' && s.fill === PALETTE.surface,
    )
    const rows = new Set(cells.map((s) => (s.kind === 'rect' ? s.y : 0)))

    // Quatro alturas distintas, três colunas em cada.
    expect(rows.size).toBe(4)
    expect(cells.filter((s) => s.kind === 'rect' && s.y === Math.min(...rows))).toHaveLength(3)
  })

  test('abre a faixa de travessia entre as duas metades', () => {
    // Sem ela o card não diz em qual dos três tabuleiros a partida aconteceu, e
    // o título vira uma palavra que quem recebe não sabe ler.
    const rows = [
      ...new Set(
        cardPlan(base, PALETTE)
          .filter((s) => s.kind === 'rect' && s.fill === PALETTE.surface)
          .map((s) => (s.kind === 'rect' ? s.y : 0)),
      ),
    ].sort((a, b) => a - b)

    const dentro = (rows[1] as number) - (rows[0] as number)
    const atravessando = (rows[2] as number) - (rows[1] as number)
    expect(atravessando).toBe(dentro + CARD.band)
    expect((rows[3] as number) - (rows[2] as number)).toBe(dentro)
  })

  test('desenha seis peças, uma por símbolo de cada lado', () => {
    const pieces = solids(cardPlan(base, PALETTE)).filter(
      (s) => s.fill === PALETTE.blue || s.fill === PALETTE.orange,
    )

    expect(pieces).toHaveLength(6)
    expect(pieces.filter((s) => s.fill === PALETTE.blue)).toHaveLength(3)
  })

  test('nunca inventa cor: tudo o que pinta veio da paleta', () => {
    // A paleta é decidida em CSS e medida por teste de contraste. Um hex escrito
    // aqui seria uma segunda paleta, que ninguém mediria.
    const known = new Set<string>(Object.values(PALETTE))

    for (const shape of full()) {
      const used =
        shape.kind === 'text'
          ? [shape.fill]
          : shape.kind === 'path'
            ? [shape.stroke]
            : [shape.fill, shape.stroke]
      for (const colour of used) {
        if (colour !== undefined) expect(known.has(colour), colour).toBe(true)
      }
    }
  })

  test('desenha o encaixe vazio com contorno, e a peça em cima dele preenchida', () => {
    // O encaixe é fundo e a peça é objeto: contorno contra preenchimento é a
    // mesma distinção do tabuleiro.
    //
    // A posição é do meio da partida de propósito: **na inicial não aparece
    // encaixe nenhum**, porque os alvos de cada lado são exatamente as casas de
    // onde o outro parte. Um teste montado sobre a abertura mediria zero e
    // passaria achando que mediu seis.
    const middle: Placement = { blue: [3, 4, 5], orange: [6, 7, 8] }
    const slots = solids(cardPlan({ ...base, placement: middle }, PALETTE)).filter(
      (s) => s.stroke === PALETTE.blue || s.stroke === PALETTE.orange,
    )

    // Seis encaixes ao todo, e nenhum ocupado na posição inicial.
    expect(slots).toHaveLength(6)
    for (const slot of slots) expect(slot.fill).toBeUndefined()
  })

  test('esconde o encaixe embaixo da peça que chegou nele', () => {
    const home = cardPlan({ ...base, placement: { blue: TARGETS.blue, orange: [0, 1, 2] } }, PALETTE)
    const slots = solids(home).filter(
      (s) => s.stroke === PALETTE.blue || s.stroke === PALETTE.orange,
    )

    // Todas as seis casas de encaixe estão ocupadas, então não sobra contorno.
    expect(slots).toHaveLength(0)
  })

  test('cala a curva quando não há tabela', () => {
    const shapes = cardPlan(base, PALETTE)

    expect(shapes.some((s) => s.kind === 'path' && s.width === 5)).toBe(false)
  })

  test('marca onde a partida virou', () => {
    const mark = full().find((s) => s.kind === 'path' && s.stroke === PALETTE.orange)

    expect(mark).toBeDefined()
  })
})

/** Um contexto de mentira que só anota o que lhe pedem. */
function recorder() {
  const calls: string[] = []
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', textBaseline: '',
    fillRect: () => calls.push('fillRect'),
    beginPath: () => calls.push('beginPath'),
    moveTo: (x: number, y: number) => calls.push(`moveTo ${x} ${y}`),
    lineTo: (x: number, y: number) => calls.push(`lineTo ${x} ${y}`),
    closePath: () => calls.push('closePath'),
    arc: (x: number, y: number, r: number) => calls.push(`arc ${x} ${y} ${r}`),
    roundRect: (x: number, y: number, w: number, h: number) => calls.push(`roundRect ${x} ${y} ${w} ${h}`),
    fill: () => calls.push(`fill ${ctx.fillStyle}`),
    stroke: () => calls.push(`stroke ${ctx.strokeStyle} ${ctx.lineWidth}`),
    fillText: (text: string) => calls.push(`text ${ctx.font} ${ctx.textAlign} ${text}`),
  }
  return { ctx, calls }
}

describe('pintando o plano', () => {
  test('fecha o triângulo, senão sobra um V em vez de uma peça', () => {
    const { ctx, calls } = recorder()

    paint(ctx, [{ kind: 'triangle', x: 0, y: 0, w: 100, h: 100, fill: '#111' }])

    expect(calls).toEqual([
      'beginPath', 'moveTo 50 0', 'lineTo 100 100', 'lineTo 0 100', 'closePath', 'fill #111',
    ])
  })

  test('preenche antes de contornar', () => {
    // Um traço por cima do preenchimento tem a espessura inteira; por baixo,
    // perde metade dela para dentro da forma e o contorno afina pela metade.
    const { ctx, calls } = recorder()

    paint(ctx, [{ kind: 'circle', x: 10, y: 10, r: 5, fill: '#111', stroke: '#222', width: 3 }])

    expect(calls.indexOf('fill #111')).toBeLessThan(calls.indexOf('stroke #222 3'))
  })

  test('não preenche o que só tem contorno', () => {
    const { ctx, calls } = recorder()

    paint(ctx, [{ kind: 'circle', x: 10, y: 10, r: 5, stroke: '#222', width: 3 }])

    expect(calls.some((call) => call.startsWith('fill'))).toBe(false)
  })

  test('leva o negrito e o alinhamento para o texto', () => {
    const { ctx, calls } = recorder()

    paint(ctx, [{ kind: 'text', x: 0, y: 0, text: 'oi', size: 40, fill: '#111', weight: 'bold', align: 'center' }])

    expect(calls[0]).toContain('bold 40px')
    expect(calls[0]).toContain('center')
  })

  test('liga os pontos de um traçado na ordem', () => {
    const { ctx, calls } = recorder()

    paint(ctx, [{ kind: 'path', points: [[0, 0], [10, 10], [20, 0]], stroke: '#333', width: 2 }])

    expect(calls).toEqual(['beginPath', 'moveTo 0 0', 'lineTo 10 10', 'lineTo 20 0', 'stroke #333 2'])
  })
})

describe('a paleta', () => {
  test('sai das variáveis do CSS, e não de constantes daqui', () => {
    // Um hex escrito no card seria uma segunda paleta, que nenhum teste de
    // contraste mediria e que sairia de sincronia no primeiro ajuste.
    const palette = readPalette((name) => ({ '--blue': '#123456', '--ink': '#abcdef' })[name] ?? '')

    expect(palette.blue).toBe('#123456')
    expect(palette.ink).toBe('#abcdef')
  })

  test('não deixa o card em branco quando a variável não resolve', () => {
    // Fora do navegador, ou antes do CSS carregar, `getPropertyValue` devolve
    // string vazia — que como cor de canvas não pinta nada.
    const palette = readPalette(() => '')

    for (const colour of Object.values(palette)) expect(colour).toMatch(/^#[0-9a-f]{6}$/)
  })
})
