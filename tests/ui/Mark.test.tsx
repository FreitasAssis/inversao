import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MARK, Mark } from '../../src/ui/Mark'

/**
 * The full mark (spec 5): the cycle, beside the name.
 *
 * It is built from the game's own three shapes, which is the whole argument for
 * it — somebody who has played one match already understands the logo. And it
 * is deliberately *not* the icon: the arrows go below about 48px, so the
 * favicon is the inverted circle instead.
 */

describe('the cycle mark', () => {
  test('names itself, since it stands in for the name', () => {
    render(<Mark />)

    expect(screen.getByRole('img', { name: /inversão/i })).toBeInTheDocument()
  })

  test('carries all three of the game shapes', () => {
    // The argument for this mark over any other: it is the pieces. Drop one and
    // it stops being the game and becomes decoration.
    render(<Mark />)
    const svg = screen.getByRole('img')

    expect(svg.querySelector('circle')).toBeInTheDocument()
    expect(svg.querySelector('polygon')).toBeInTheDocument()
    expect(svg.querySelector('rect')).toBeInTheDocument()
  })

  test('stays inside its own box', () => {
    // The first version did not, and this is checked against the construction
    // rather than against the path text: the arcs' middles never appear in a
    // `d` attribute, and scraping the numbers out of one only ever sees the
    // endpoints.
    const margin = 2 // half the stroke width

    // The shapes as well as the ring — checking only the arcs let the pieces
    // themselves be pushed off the top of the box with nothing complaining.
    const corners = MARK.shapes.flatMap(({ x, y }) => {
      const reach = MARK.size * Math.SQRT2
      return [
        { x: x - reach, y: y - reach },
        { x: x + reach, y: y + reach },
      ]
    })

    for (const { x, y } of [...MARK.outline, ...corners]) {
      expect(x, `x ${x.toFixed(1)}`).toBeGreaterThanOrEqual(margin)
      expect(x, `x ${x.toFixed(1)}`).toBeLessThanOrEqual(MARK.box - margin)
      expect(y, `y ${y.toFixed(1)}`).toBeGreaterThanOrEqual(margin)
      expect(y, `y ${y.toFixed(1)}`).toBeLessThanOrEqual(MARK.box - margin)
    }
  })

  test('keeps the ring clear of the shapes, along its whole length', () => {
    // The arcs ride at a radius that overlaps the band the shapes occupy, so
    // what separates them is angle, not distance. The first pass left under two
    // degrees of it and the ring cut straight through the pieces.
    //
    // Measured against the square's half-*diagonal*, which is the furthest any
    // shape reaches from its own centre — checking against the half-width would
    // pass while a corner sat under the arc.
    const reach = MARK.size * Math.SQRT2 + 2

    for (const point of MARK.outline) {
      for (const shape of MARK.shapes) {
        const far = Math.hypot(point.x - shape.x, point.y - shape.y)
        expect(far, `${point.x.toFixed(1)},${point.y.toFixed(1)}`).toBeGreaterThan(reach)
      }
    }
  })

  test('draws in one colour, so it survives being printed flat', () => {
    // Spec 5's test. Colour is the owner channel in the game and cannot be what
    // carries a logo, so the mark has to work with a single fill.
    render(<Mark side="orange" />)
    const fills = [...screen.getByRole('img').querySelectorAll('[fill]')]
      .map((node) => node.getAttribute('fill'))
      .filter((fill) => fill !== 'none')

    expect(new Set(fills)).toEqual(new Set(['var(--orange)']))
  })

  test('keeps quiet when the written name is right there', () => {
    // Both the logo and the heading say "Inversão". Announcing it twice is the
    // logo talking over the thing it belongs to.
    const { container } = render(<Mark decorative />)

    expect(screen.queryByRole('img')).toBeNull()
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  test('separates the ring from the shapes, so each can be recoloured alone', () => {
    // The colourless mode has to reach the cycle as well as the name, and the
    // ring carries `fill="none"` — setting a fill across the whole mark would
    // fill the arcs in. The two groups are named so the stylesheet can be
    // precise instead of clever.
    render(<Mark />)
    const svg = screen.getByRole('img')

    expect(svg.querySelector('.mark-ring')).toHaveAttribute('fill', 'none')
    expect(svg.querySelector('.mark-shapes')).toHaveAttribute('fill', 'var(--blue)')
  })

  test('can be flipped, so the name beside it takes the other colour', () => {
    // The pair is itself an inversion: a blue cycle with an orange wordmark, or
    // the mirror. Same operation the game is named after.
    const { rerender } = render(<Mark side="blue" />)
    expect(screen.getByRole('img')).toHaveAttribute('data-side', 'blue')

    rerender(<Mark side="orange" />)
    expect(screen.getByRole('img')).toHaveAttribute('data-side', 'orange')
  })
})
