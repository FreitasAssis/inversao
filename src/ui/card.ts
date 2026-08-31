import { TARGETS, middleLink } from '../engine/board'
import { PIECES } from '../engine/types'
import type { BoardCode, Piece, Placement, Side } from '../engine/types'

/**
 * O card como imagem (projeto 7).
 *
 * Dividido em **plano** e **pintura**, pelo mesmo motivo que a marca é: o
 * `jsdom` não tem canvas, então uma função que desenhasse direto no contexto
 * seria a única parte visual do projeto sem teste nenhum. O plano é uma lista
 * de formas com coordenadas — aritmética, conferível — e `paint` é fino o
 * bastante para não ter onde esconder erro.
 *
 * A imagem desenha o **tabuleiro de verdade**, e não os símbolos do texto: as
 * formas, as cores da paleta, os encaixes e a faixa de travessia. Colar
 * caracteres dentro de uma imagem seria desperdiçar o único lugar em que a
 * grade pode ser a coisa em si.
 */

export type Shape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; fill?: string | undefined; stroke?: string | undefined; width?: number | undefined; radius?: number | undefined }
  | { kind: 'circle'; x: number; y: number; r: number; fill?: string | undefined; stroke?: string | undefined; width?: number | undefined }
  | { kind: 'triangle'; x: number; y: number; w: number; h: number; fill?: string | undefined; stroke?: string | undefined; width?: number | undefined }
  | { kind: 'text'; x: number; y: number; text: string; size: number; fill: string; weight?: 'bold' | undefined; align?: 'center' | 'left' | undefined }
  | { kind: 'path'; points: readonly (readonly [number, number])[]; stroke: string; width: number }

/** As cores, lidas de fora — nunca copiadas para cá. */
export type Palette = {
  blue: string
  orange: string
  line: string
  ink: string
  paper: string
  surface: string
}

export type CardInput = {
  board: BoardCode
  placement: Placement
  /** Uma linha por vez, de cima para baixo. */
  title: string
  headline: string
  /** P(quem compartilha vence) lance a lance, ou vazio sem tabela. */
  curve: readonly number[]
  /** Em que lance a partida virou, para a marca vertical. Null se em nenhum. */
  turning: number | null
  caption: string | null
  url: string
}

export const CARD = {
  width: 1080,
  height: 1620,
  pad: 72,
  cell: 210,
  gap: 22,
  /** A faixa do meio é o que separa os três tabuleiros, então tem altura própria. */
  band: 50,
  piece: 0.58,
  /** Onde o tabuleiro começa, abaixo das duas linhas de cabeçalho. */
  boardTop: 270,
  curveGap: 60,
  curveHeight: 140,
  captionGap: 56,
  footerUp: 60,
} as const

const COLUMNS = 3

/** Onde o tabuleiro começa, centralizado na largura do card. */
function boardBox() {
  const width = COLUMNS * CARD.cell + (COLUMNS - 1) * CARD.gap
  const height = 4 * CARD.cell + 3 * CARD.gap + CARD.band
  return { x: (CARD.width - width) / 2, y: CARD.boardTop, width, height }
}

function cellBox(cell: number) {
  const box = boardBox()
  const row = Math.floor(cell / COLUMNS)
  const column = cell % COLUMNS
  // A faixa entra depois da segunda fileira, e empurra tudo abaixo dela.
  const below = row >= 2 ? CARD.band : 0
  return {
    x: box.x + column * (CARD.cell + CARD.gap),
    y: box.y + row * (CARD.cell + CARD.gap) + below,
    size: CARD.cell,
  }
}

function occupantsOf(placement: Placement): (({ side: Side; piece: Piece }) | null)[] {
  const cells = new Array<{ side: Side; piece: Piece } | null>(12).fill(null)
  for (const side of ['blue', 'orange'] as const) {
    PIECES.forEach((piece, index) => {
      cells[placement[side][index] as number] = { side, piece }
    })
  }
  return cells
}

function slotsOf(): (({ side: Side; piece: Piece }) | null)[] {
  const cells = new Array<{ side: Side; piece: Piece } | null>(12).fill(null)
  for (const side of ['blue', 'orange'] as const) {
    PIECES.forEach((piece, index) => {
      cells[TARGETS[side][index] as number] = { side, piece }
    })
  }
  return cells
}

/** Uma peça, desenhada na forma dela dentro da casa. */
function pieceShape(
  cell: number,
  piece: Piece,
  fill: string | undefined,
  stroke: string | undefined,
  width: number,
): Shape {
  const { x, y, size } = cellBox(cell)
  const side = size * CARD.piece
  const left = x + (size - side) / 2
  const top = y + (size - side) / 2
  if (piece === 'circle') {
    return { kind: 'circle', x: left + side / 2, y: top + side / 2, r: side / 2, fill, stroke, width }
  }
  if (piece === 'square') {
    return { kind: 'rect', x: left, y: top, w: side, h: side, fill, stroke, width, radius: side * 0.12 }
  }
  return { kind: 'triangle', x: left, y: top, w: side, h: side, fill, stroke, width }
}

/** Traço dos contornos, tanto do encaixe quanto da peça vazada. */
const STROKE = 6
const SLOT_STROKE = 4

/**
 * Tudo o que o card desenha, de trás para a frente.
 *
 * Devolve uma lista e não pinta nada: é onde a aritmética do layout mora, e é
 * o que os testes conferem. `paint` executa sem decidir.
 */
export function cardPlan(input: CardInput, palette: Palette): Shape[] {
  const shapes: Shape[] = [
    { kind: 'rect', x: 0, y: 0, w: CARD.width, h: CARD.height, fill: palette.paper },
    { kind: 'text', x: CARD.width / 2, y: 130, text: input.title, size: 38, fill: palette.line, align: 'center' },
    { kind: 'text', x: CARD.width / 2, y: 205, text: input.headline, size: 52, fill: palette.ink, weight: 'bold', align: 'center' },
  ]

  const occupants = occupantsOf(input.placement)
  const slots = slotsOf()
  const hue: Record<Side, string> = { blue: palette.blue, orange: palette.orange }

  for (let cell = 0; cell < 12; cell++) {
    const { x, y, size } = cellBox(cell)
    shapes.push({
      kind: 'rect', x, y, w: size, h: size,
      fill: palette.surface, stroke: palette.line, width: 2, radius: 16,
    })
    const occupant = occupants[cell]
    const slot = slots[cell]
    // O encaixe só aparece vazio: com peça em cima ele não seria visto de todo
    // jeito, e desenhar por baixo é trabalho que ninguém enxerga.
    if (occupant === undefined || occupant === null) {
      if (slot) shapes.push(pieceShape(cell, slot.piece, undefined, hue[slot.side], SLOT_STROKE))
      continue
    }
    shapes.push(pieceShape(cell, occupant.piece, hue[occupant.side], undefined, STROKE))
  }

  shapes.push(...crossings(input.board, palette))
  shapes.push(...curveShapes(input, palette))

  shapes.push({
    kind: 'text', x: CARD.width / 2, y: CARD.height - CARD.footerUp,
    text: input.url, size: 34, fill: palette.line, align: 'center',
  })
  return shapes
}

/**
 * A faixa do meio: uma seta por coluna, dizendo para onde dá para atravessar.
 *
 * É o que separa os três tabuleiros (spec 1.2), então um card sem ela não diz
 * em qual deles a partida aconteceu — e o título sozinho vira uma palavra que
 * quem recebe não sabe ler.
 */
function crossings(board: BoardCode, palette: Palette): Shape[] {
  const box = boardBox()
  const top = box.y + 2 * CARD.cell + 2 * CARD.gap
  const shapes: Shape[] = []

  for (let column = 0; column < COLUMNS; column++) {
    const link = middleLink(board, column)
    if (link === 'none') continue
    const x = box.x + column * (CARD.cell + CARD.gap) + CARD.cell / 2
    const head = 14
    const from = top + 6
    const to = top + CARD.band - 6
    shapes.push({ kind: 'path', points: [[x, from], [x, to]], stroke: palette.line, width: 3 })
    // A ponta fica em quem pode receber. Numa via dupla, nas duas.
    if (link === 'down' || link === 'both') {
      shapes.push({ kind: 'path', points: [[x - head / 2, to - head], [x, to], [x + head / 2, to - head]], stroke: palette.line, width: 3 })
    }
    if (link === 'up' || link === 'both') {
      shapes.push({ kind: 'path', points: [[x - head / 2, from + head], [x, from], [x + head / 2, from + head]], stroke: palette.line, width: 3 })
    }
  }
  return shapes
}

/**
 * A curva como linha de verdade, e não como blocos.
 *
 * Os blocos existem no texto porque texto não desenha; aqui há pixels, então
 * gastá-los reproduzindo oito alturas seria jogar fora o único lugar em que a
 * curva pode ter a resolução que a tabela tem.
 */
function curveShapes(input: CardInput, palette: Palette): Shape[] {
  if (input.curve.length < 2) return []
  const box = boardBox()
  const top = box.y + box.height + CARD.curveGap
  const height = CARD.curveHeight
  const left = box.x
  const width = box.width
  const step = width / (input.curve.length - 1)

  const shapes: Shape[] = [
    // O meio. Acima dele quem compartilha está na frente, abaixo está atrás.
    { kind: 'path', points: [[left, top + height / 2], [left + width, top + height / 2]], stroke: palette.line, width: 2 },
    {
      kind: 'path',
      points: input.curve.map((value, index) => [
        left + index * step,
        top + (1 - Math.min(1, Math.max(0, value))) * height,
      ] as const),
      stroke: palette.ink,
      width: 5,
    },
  ]

  if (input.turning !== null) {
    const x = left + input.turning * step
    shapes.push({ kind: 'path', points: [[x, top], [x, top + height]], stroke: palette.orange, width: 3 })
  }
  if (input.caption !== null) {
    shapes.push({
      kind: 'text', x: CARD.width / 2, y: top + height + CARD.captionGap,
      text: input.caption, size: 36, fill: palette.ink, align: 'center',
    })
  }
  return shapes
}

/**
 * O contexto de desenho, reduzido ao que o card usa.
 *
 * Declarado aqui em vez de importado do DOM para que um teste possa passar um
 * dublê que anota as chamadas: o `jsdom` não implementa canvas, e sem isto a
 * pintura seria a única parte do desenho sem cobertura nenhuma.
 */
export type Ctx = {
  fillStyle: string
  strokeStyle: string
  lineWidth: number
  font: string
  textAlign: string
  textBaseline: string
  fillRect(x: number, y: number, w: number, h: number): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  closePath(): void
  arc(x: number, y: number, r: number, from: number, to: number): void
  roundRect(x: number, y: number, w: number, h: number, radius: number): void
  fill(): void
  stroke(): void
  fillText(text: string, x: number, y: number): void
}

/** Executa o plano. Sem decisão nenhuma: tudo o que escolhe está em `cardPlan`. */
export function paint(ctx: Ctx, shapes: readonly Shape[]): void {
  for (const shape of shapes) {
    if (shape.kind === 'text') {
      ctx.font = `${shape.weight === 'bold' ? 'bold ' : ''}${shape.size}px system-ui, sans-serif`
      ctx.textAlign = shape.align ?? 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = shape.fill
      ctx.fillText(shape.text, shape.x, shape.y)
      continue
    }

    ctx.beginPath()
    if (shape.kind === 'rect') {
      ctx.roundRect(shape.x, shape.y, shape.w, shape.h, shape.radius ?? 0)
    } else if (shape.kind === 'circle') {
      ctx.arc(shape.x, shape.y, shape.r, 0, Math.PI * 2)
    } else if (shape.kind === 'triangle') {
      ctx.moveTo(shape.x + shape.w / 2, shape.y)
      ctx.lineTo(shape.x + shape.w, shape.y + shape.h)
      ctx.lineTo(shape.x, shape.y + shape.h)
      ctx.closePath()
    } else {
      const [first, ...rest] = shape.points
      if (first === undefined) continue
      ctx.moveTo(first[0], first[1])
      for (const [x, y] of rest) ctx.lineTo(x, y)
    }

    // Preenche antes de contornar: um traço por cima do preenchimento fica com
    // a espessura inteira, e por baixo perde metade dela para dentro da forma.
    if (shape.kind !== 'path' && shape.fill !== undefined) {
      ctx.fillStyle = shape.fill
      ctx.fill()
    }
    const { stroke } = shape
    if (stroke !== undefined) {
      ctx.strokeStyle = stroke
      ctx.lineWidth = shape.width ?? 1
      ctx.stroke()
    }
  }
}

/**
 * A paleta, lida das variáveis CSS — nunca copiada para cá.
 *
 * Um hex escrito neste arquivo seria uma segunda paleta, que nenhum teste de
 * contraste mediria e que sairia de sincronia no primeiro ajuste. Lendo daqui,
 * o card também acompanha o esquema claro ou escuro que o jogador está vendo.
 */
export function readPalette(read: (name: string) => string): Palette {
  const of = (name: string, fallback: string) => read(`--${name}`).trim() || fallback
  return {
    blue: of('blue', '#2f78c4'),
    orange: of('orange', '#b5651d'),
    line: of('line', '#73726c'),
    ink: of('ink', '#3d3d3a'),
    paper: of('paper', '#faf9f5'),
    // `--surface` é um color-mix, que o canvas não sabe ler. O papel serve, e a
    // casa continua se distinguindo pelo contorno.
    surface: of('paper', '#faf9f5'),
  }
}
