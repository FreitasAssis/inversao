import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

/**
 * The stylesheet is one global file, so a class name is a global name. Two rules
 * that happen to pick the same word do not conflict, do not warn and do not
 * fail — the later one simply wins, somewhere else in the app.
 *
 * That already happened once: the annotation's curve took `.track`, which is
 * also the shaft of the board's crossing arrows three hundred lines up. Every
 * one-way arrow turned blue while its arrowhead stayed put, in a screen that
 * had nothing to do with the change.
 */

/**
 * Comments are stripped first, and that is not tidiness. The rule parser below
 * reads "everything since the last closing brace" as a selector, and nearly
 * every rule in this stylesheet is preceded by a comment — so with them left in
 * it found almost nothing and passed on an empty search.
 */
const css = readFileSync('src/ui/style.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/**
 * Classes defined as a whole rule of their own — `.thing { }`, not
 * `.thing[data-x]`, and not `.thing` as one member of a shared selector list.
 * Sharing a declaration is deliberate; owning the name twice is the accident.
 */
function bareClasses(): string[] {
  return [...css.matchAll(/(?:^|\})\s*([^{}]+)\{/g)]
    .map((match) => (match[1] as string).trim())
    .filter((selector) => /^\.[a-z-]+$/.test(selector))
    .map((selector) => selector.slice(1))
}

describe('the stylesheet', () => {
  test('never defines the same bare class twice', () => {
    const seen = new Map<string, number>()
    for (const name of bareClasses()) seen.set(name, (seen.get(name) ?? 0) + 1)

    const twice = [...seen].filter(([, count]) => count > 1).map(([name]) => name)
    expect(twice).toEqual([])
  })

  test('reaches for the scale rather than past it', () => {
    // Five sizes and six spaces. Every raw rem here is one somebody typed
    // because the scale did not have what they wanted — which is exactly how
    // the last one grew to nine sizes and sixteen spacings.
    const raw = [
      ...css.matchAll(
        /^\s*(font-size|gap|(?:margin|padding)(?:-(?:top|right|bottom|left))?):[^;]*\d[^;]*rem/gm,
      ),
    ]

    expect(raw.map((match) => match[0].trim())).toEqual([])
  })

  test('drives the slide off the same gap the board is drawn with', () => {
    // The distance a piece travels when it slides *is* the gap between cells.
    // They were the same number typed twice, so changing one broke the
    // animation without a word — and the scale pass changed exactly that one.
    const slide = css.slice(css.indexOf('@keyframes slide-in'))

    expect(slide).toContain('var(--cell-gap)')
    expect(slide.slice(0, slide.indexOf('}')).match(/\d+rem/)).toBeNull()
  })
})
