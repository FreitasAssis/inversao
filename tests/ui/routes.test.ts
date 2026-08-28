import { describe, expect, test } from 'vitest'
import { pathOf, routeOf } from '../../src/ui/routes'

describe('routes', () => {
  test('opens the game at the root', () => {
    // The root is the board, playable immediately — no splash, no menu
    // (project doc 3).
    expect(routeOf('/')).toBe('game')
  })

  test('knows the daily challenges', () => {
    // Portuguese, like every other address: routes are what the player reads.
    expect(routeOf('/desafios')).toBe('puzzle')
  })

  test('knows the rules page', () => {
    expect(routeOf('/regras')).toBe('rules')
  })

  test('knows the analysis page', () => {
    expect(routeOf('/analise')).toBe('analysis')
  })

  test('tolerates a trailing slash', () => {
    expect(routeOf('/regras/')).toBe('rules')
  })

  test('falls back to the game rather than to an error', () => {
    // A static host serving a stale link should land somebody on the board, not
    // on nothing. There is one game and one domain.
    expect(routeOf('/whatever')).toBe('game')
    expect(routeOf('')).toBe('game')
  })

  test('round-trips every route back to its path', () => {
    for (const path of ['/', '/desafios', '/regras', '/analise']) {
      expect(pathOf(routeOf(path))).toBe(path)
    }
  })
})
