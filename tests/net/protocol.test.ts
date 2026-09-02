import { describe, expect, test } from 'vitest'
import { parseConfig, parseInbound } from '../../src/net/protocol'
import type { RoomConfig } from '../../src/net/protocol'

/**
 * O que chega pela rede é entrada não confiável, e o servidor ser nosso não
 * muda isso — é a mesma postura de `readSaved` com o `localStorage`.
 */

const config: RoomConfig = { board: 'dbu', mechanic: 'choice', evaluation: false }
const wrap = (value: unknown) => JSON.stringify(value)

describe('a configuração da sala', () => {
  test('aceita a que está completa', () => {
    expect(parseConfig(config)).toEqual(config)
  })

  test.each([
    ['sem tabuleiro', { mechanic: 'choice', evaluation: false }],
    ['com tabuleiro que não existe', { ...config, board: 'zzz' }],
    ['com mecânica que não existe', { ...config, mechanic: 'roleta' }],
    ['sem a barra', { board: 'dbu', mechanic: 'choice' }],
    ['com a barra em texto', { ...config, evaluation: 'sim' }],
    ['nula', null],
  ])('recusa a %s', (_what, value) => {
    // Recusa em vez de consertar: uma configuração pela metade daria uma
    // partida em que os dois lados discordam sobre o tabuleiro, e cada tela
    // acharia que a outra é que está trapaceando.
    expect(parseConfig(value)).toBeNull()
  })
})

describe('a mensagem de boas-vindas', () => {
  test('responde as duas perguntas que o cliente não sabe sozinho', () => {
    // Em que assento sentei, e que partida é esta.
    const parsed = parseInbound(wrap({ kind: 'welcome', seat: 'orange', config, first: false }))

    expect(parsed).toEqual({ kind: 'welcome', seat: 'orange', config, first: false })
  })

  test('aceita o papel de espectador', () => {
    const parsed = parseInbound(wrap({ kind: 'welcome', seat: 'spectator', config, first: false }))

    expect(parsed?.kind === 'welcome' && parsed.seat).toBe('spectator')
  })

  test('recusa um assento que não existe', () => {
    expect(parseInbound(wrap({ kind: 'welcome', seat: 'verde', config, first: true }))).toBeNull()
  })

  test('recusa sem o aviso de quem estabeleceu a sala', () => {
    // É por ele que quem cria descobre a colisão de código. Faltando, a
    // detecção passaria a depender de `undefined` ser falso — que funciona, e
    // por acidente.
    expect(parseInbound(wrap({ kind: 'welcome', seat: 'blue', config }))).toBeNull()
  })
})

describe('uma ação vinda da sala', () => {
  const message = { seq: 3, from: 'blue', action: { type: 'resign' } }

  test('passa com o envelope inteiro', () => {
    expect(parseInbound(wrap({ kind: 'action', message }))).toEqual({ kind: 'action', message })
  })

  test('recusa autor que não é lado nem a sala', () => {
    // O carimbo é o que sustenta a checagem de autoria inteira.
    expect(parseInbound(wrap({ kind: 'action', message: { ...message, from: 'ninguém' } }))).toBeNull()
  })

  test('recusa sequência que não é inteira', () => {
    expect(parseInbound(wrap({ kind: 'action', message: { ...message, seq: 1.5 } }))).toBeNull()
    expect(parseInbound(wrap({ kind: 'action', message: { ...message, seq: 'três' } }))).toBeNull()
  })

  test('recusa ação sem tipo', () => {
    expect(parseInbound(wrap({ kind: 'action', message: { ...message, action: {} } }))).toBeNull()
  })

  test('não julga o conteúdo da ação, que é do motor', () => {
    // Uma segunda opinião sobre "este lance é legal" seria uma segunda chance
    // de discordar da primeira. Aqui se confere a forma; o motor confere a
    // regra, e recusa esta.
    const nonsense = { seq: 0, from: 'blue', action: { type: 'move', piece: 'x', to: 99 } }

    expect(parseInbound(wrap({ kind: 'action', message: nonsense }))).not.toBeNull()
  })
})

describe('o que não é mensagem', () => {
  test.each([
    ['texto solto', 'nada disso'],
    ['tipo desconhecido', wrap({ kind: 'tchau' })],
    ['sem tipo', wrap({ seat: 'blue' })],
    ['array', wrap([1, 2, 3])],
    ['nulo', wrap(null)],
  ])('recusa %s', (_what, raw) => {
    expect(parseInbound(raw)).toBeNull()
  })

  test('recusa o que nem é texto', () => {
    // Um `ArrayBuffer` chega aqui se alguém mandar binário pelo socket.
    expect(parseInbound(new ArrayBuffer(4))).toBeNull()
  })
})
