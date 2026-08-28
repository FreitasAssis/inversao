import { describe, expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { Crossing } from '../../src/ui/Crossing'

const heads = (container: HTMLElement) => container.querySelectorAll('[data-head]')

describe('Crossing', () => {
  test('draws nothing where the column does not cross', () => {
    // The Ponte's outer columns have no crossing, and an empty gap says that
    // better than any mark would (spec 1.2).
    const { container } = render(<Crossing link="none" column={0} />)

    expect(container.querySelector('[data-line]')).toBeNull()
    expect(heads(container)).toHaveLength(0)
  })

  test('points both ways when traffic runs both ways', () => {
    const { container } = render(<Crossing link="both" column={1} />)

    expect(container.querySelector('[data-line]')).not.toBeNull()
    expect([...heads(container)].map((h) => h.getAttribute('data-head')).sort()).toEqual([
      'down',
      'up',
    ])
  })

  test('points one way on a one-way column', () => {
    const down = render(<Crossing link="down" column={0} />)
    const up = render(<Crossing link="up" column={2} />)

    expect([...heads(down.container)].map((h) => h.getAttribute('data-head'))).toEqual(['down'])
    expect([...heads(up.container)].map((h) => h.getAttribute('data-head'))).toEqual(['up'])
  })

  test('never animates', () => {
    // A belt of moving chevrons was tried here and dropped: perpetual motion in
    // the band competes with the one movement that matters, the pieces.
    const { container } = render(<Crossing link="down" column={0} />)

    expect(container.querySelectorAll('[data-belt]')).toHaveLength(0)
  })

  test('stays inside its own box', () => {
    // The first attempt let the drawing overflow, and it landed on top of the
    // row below. Nothing here may paint outside the band.
    const { container } = render(<Crossing link="both" column={1} />)
    const svg = container.querySelector('svg') as SVGElement

    expect(svg.getAttribute('viewBox')).toBe('0 0 24 32')
    expect(svg).not.toHaveStyle({ overflow: 'visible' })
  })

  test('says out loud which way it runs', () => {
    const { container } = render(<Crossing link="up" column={2} />)

    expect(container.querySelector('[role="img"]')).toHaveAttribute(
      'aria-label',
      expect.stringMatching(/coluna 3.*só para cima/i),
    )
  })
})
