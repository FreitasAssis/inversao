import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { Away, LOUD_SECONDS } from '../../src/ui/Away'

/**
 * A regra que importa aqui é negativa: **ninguém é eliminado automaticamente.**
 * Se o adversário é um amigo cujo metrô entrou no túnel, esperar é escolha de
 * quem não fez nada errado.
 */

const tick = (seconds: number) => act(() => vi.advanceTimersByTime(seconds * 1000))

describe('o adversário sumiu', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test('diz quem sumiu, pelo nome', () => {
    render(<Away who="Ana" onClaim={() => {}} />)

    expect(screen.getByRole('alert')).toHaveTextContent(/Ana se desconectou/)
  })

  test('não oferece encerrar antes da hora', () => {
    // O botão existir desde o início convidaria a encerrar no primeiro segundo
    // — e a maioria das quedas termina antes de sessenta.
    render(<Away who="Ana" onClaim={() => {}} seconds={30} />)

    expect(screen.queryByRole('button', { name: /encerrar/i })).toBeNull()
  })

  test('só conta em números no fim', () => {
    // Uma contagem correndo desde o primeiro segundo transforma a espera em
    // ansiedade.
    render(<Away who="Ana" onClaim={() => {}} seconds={30} />)
    expect(screen.queryByText(/^\d+$/)).toBeNull()

    tick(30 - LOUD_SECONDS)

    expect(screen.getByText(String(LOUD_SECONDS))).toBeInTheDocument()
  })

  test('oferece encerrar quando o tempo acaba, e nunca encerra sozinho', () => {
    const claims: number[] = []
    render(<Away who="Ana" onClaim={() => claims.push(1)} seconds={3} />)

    tick(10)

    expect(screen.getByRole('button', { name: /encerrar/i })).toBeInTheDocument()
    expect(claims).toHaveLength(0)
  })

  test('encerrar é um pedido, e parte de quem ficou', () => {
    // Clique cru: com relógio falso, `userEvent` fica esperando um tempo que
    // ninguém vai adiantar.
    const claims: number[] = []
    render(<Away who="Ana" onClaim={() => claims.push(1)} seconds={1} />)
    tick(3)

    act(() => screen.getByRole('button', { name: /encerrar/i }).click())

    expect(claims).toHaveLength(1)
  })

  test('para de contar em zero, sem virar negativo', () => {
    render(<Away who="Ana" onClaim={() => {}} seconds={2} />)

    tick(60)

    expect(screen.queryByText(/-\d/)).toBeNull()
  })
})
