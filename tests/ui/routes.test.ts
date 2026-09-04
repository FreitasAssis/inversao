import { describe, expect, test } from 'vitest'
import { pathOf, roomCodeOf, roomPath, routeOf } from '../../src/ui/routes'

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

  test('round-trips every fixed route back to its path', () => {
    for (const path of ['/', '/desafios', '/regras', '/analise'] as const) {
      const route = routeOf(path)
      if (route === 'room') throw new Error('rota fixa lida como sala')
      expect(pathOf(route)).toBe(path)
    }
  })
})

describe('o endereço de uma sala', () => {
  test('reconhece o código e o devolve', () => {
    expect(routeOf('/sala/K3M9')).toBe('room')
    expect(roomCodeOf('/sala/K3M9')).toBe('K3M9')
  })

  test('aceita minúsculas e normaliza', () => {
    // O link vai ser digitado a partir de um código ditado, e ninguém deveria
    // precisar do Shift para abrir uma partida.
    expect(roomCodeOf('/sala/k3m9')).toBe('K3M9')
  })

  test('ignora a barra final', () => {
    expect(roomCodeOf('/sala/K3M9/')).toBe('K3M9')
  })

  test('um código torto cai no tabuleiro, e não numa tela de erro', () => {
    // Mesma regra do resto do roteador: um link velho leva a algo jogável.
    expect(routeOf('/sala/nope!')).toBe('game')
    expect(routeOf('/sala/K3MO')).toBe('game')
    expect(roomCodeOf('/sala/K3MO')).toBeNull()
  })

  test('o endereço de compartilhar não leva query', () => {
    // É este que a pessoa manda. A configuração de quem cria viaja à parte, e
    // colá-la no link mandaria o convidado criar uma sala em vez de entrar.
    expect(roomPath('k3m9')).toBe('/sala/K3M9')
  })
})
