import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

/**
 * The palette, measured (issue #2).
 *
 * Colour is the one part of the visual work that is not a matter of taste: a
 * piece nobody can pick out of the background is broken, and the threshold for
 * that is arithmetic. So the thresholds live here, and choosing a colour that
 * fails them is a failing test rather than a thing somebody notices months
 * later on a bright screen.
 *
 * Two schemes, and both are checked. The stylesheet already redefines ink, line
 * and paper for dark — and used to leave the piece colours identical in both,
 * which is how orange came to sit at 2,06 against light paper while reading
 * perfectly well on dark.
 */

const css = readFileSync('src/ui/style.css', 'utf8')

/** WCAG 2 relative luminance. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
  const linear = channels.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * (linear[0] as number) + 0.7152 * (linear[1] as number) + 0.0722 * (linear[2] as number)
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((high as number) + 0.05) / ((low as number) + 0.05)
}

/**
 * The custom properties as each scheme actually resolves them: the dark block
 * only redefines some, and the rest fall through from `:root`.
 */
function scheme(dark: boolean): Record<string, string> {
  const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')))
  const media = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'))
  const found: Record<string, string> = {}
  for (const source of dark ? [root, media.slice(0, media.indexOf('\n}'))] : [root]) {
    for (const [, name, value] of source.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/g)) {
      found[name as string] = value as string
    }
  }
  return found
}

/** Text needs 4.5:1; anything that is a shape or a control needs 3:1. */
const CHECKS: readonly [string, string, number, string][] = [
  ['ink', 'paper', 4.5, 'o texto'],
  ['line', 'paper', 4.5, 'o texto de apoio'],
  ['blue', 'paper', 3, 'as peças azuis'],
  ['orange', 'paper', 3, 'as peças laranja'],
  ['legal', 'paper', 3, 'a marca de destino possível'],
]

describe.each([
  ['light', false],
  ['dark', true],
])('the palette in the %s scheme', (_name, dark) => {
  const colours = scheme(dark as boolean)

  test.each(CHECKS)('%s against %s clears %s:1 — %s', (front, back, least) => {
    const a = colours[front as string]
    const b = colours[back as string]
    expect(a, front as string).toBeDefined()
    expect(b, back as string).toBeDefined()

    expect(contrast(a as string, b as string)).toBeGreaterThanOrEqual(least as number)
  })
})

describe('what contrast cannot fix', () => {
  test('the two players cannot be told apart by luminance, in either scheme', () => {
    // Not a defect to correct — a fact to design around, and the reason this
    // test exists as a note rather than as a threshold.
    //
    // WCAG contrast is luminance alone. Two colours that both stand out against
    // the same paper necessarily have similar luminance, so they contrast
    // poorly with *each other*. No pair of a readable blue and a readable
    // orange reaches 3:1 between themselves; it is geometry, not a bad choice.
    //
    // Which is why the evaluation bar draws a line where its two halves meet,
    // instead of relying on the colours to show the split.
    for (const dark of [false, true]) {
      const { blue, orange } = scheme(dark)
      expect(contrast(blue as string, orange as string)).toBeLessThan(3)
    }
  })

  test('so the bar marks its own boundary', () => {
    expect(css).toMatch(/\.share\s*\{[^}]*border-right/)
  })
})

/**
 * Os contornos vazados, conferidos pela fórmula que os gera.
 *
 * Deslocar um polígono para dentro por uma distância uniforme move cada vértice
 * pela **bissetriz**, por `d / sen(meio-ângulo)` — e o ápice é o canto mais
 * fechado que um triângulo tem, então anda muito mais que a base.
 *
 * Já errei isso duas vezes escrevendo o polígono à mão: uma no encaixe e outra
 * na peça, as duas com o contorno afinando no topo. É aritmética, e aritmética
 * se confere.
 */
describe('os triângulos vazados', () => {
  /** Falha alto se a variável sumiu, em vez de comparar contra NaN em silêncio. */
  function declared(pattern: RegExp, name: string): string {
    const found = css.match(pattern)?.[1]
    if (found === undefined) throw new Error(`--${name} não está no stylesheet`)
    return found
  }

  const percent = (name: string): number =>
    Number(declared(new RegExp(`--${name}:\\s*([\\d.]+)%`), name))

  const polygon = (name: string): number[] =>
    [
      ...declared(new RegExp(`--${name}:\\s*polygon\\(([^)]+)\\)`), name).matchAll(
        /([\d.]+)%/g,
      ),
    ].map((match) => Number(match[1]))

  test.each([
    ['peça', 'hollow', 'hollow-triangle'],
    ['encaixe', 'hollow-slot', 'hollow-slot-triangle'],
  ])('o do %s desloca cada vértice pela bissetriz', (_what, widthName, polygonName) => {
    const d = percent(widthName)
    const [apexX, apexY, rightX, rightY, leftX, leftY] = polygon(polygonName)

    // O ápice desce 2,236d; as duas bases sobem d; os lados entram 1,618d.
    expect(apexY as number).toBeCloseTo(2.236 * d, 0)
    expect(rightY as number).toBeCloseTo(100 - d, 0)
    expect(leftY as number).toBeCloseTo(100 - d, 0)
    expect(leftX as number).toBeCloseTo(1.618 * d, 0)
    expect(rightX as number).toBeCloseTo(100 - 1.618 * d, 0)
    // E o ápice fica no meio, senão o triângulo sai torto.
    expect(apexX as number).toBe(50)
  })

  test('o encaixe é mais fino que a peça, porque é informação de fundo', () => {
    expect(percent('hollow-slot')).toBeLessThan(percent('hollow'))
  })
})
