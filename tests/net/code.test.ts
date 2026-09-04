import { describe, expect, test } from 'vitest'
import { ALPHABET, CODE_LENGTH, isCode, makeCode, makeToken } from '../../src/net/code'

/**
 * O código é ditado no telefone, e o alfabeto existe por causa disso.
 */

describe('o alfabeto', () => {
  test.each([...'OIL01'])('não tem %s, que se confunde falando', (letter) => {
    expect(ALPHABET).not.toContain(letter)
  })

  test('não repete nenhum símbolo', () => {
    // Um repetido enviesaria o sorteio e reduziria o espaço sem ninguém notar.
    expect(new Set(ALPHABET).size).toBe(ALPHABET.length)
  })

  test('dá espaço de sobra para as partidas que existirão', () => {
    expect(ALPHABET.length ** CODE_LENGTH).toBeGreaterThan(500_000)
  })
})

describe('gerar', () => {
  test('usa só o alfabeto', () => {
    for (let seed = 0; seed < 200; seed++) {
      const code = makeCode(() => (seed * 37) % 101 / 101)
      expect(isCode(code)).toBe(true)
    }
  })

  test('tem o comprimento combinado', () => {
    expect(makeCode(() => 0.5)).toHaveLength(CODE_LENGTH)
  })

  test('alcança as duas pontas do alfabeto', () => {
    // Um erro de índice comum corta o último símbolo, e ele só some numa em
    // trinta e uma — que é o tipo de defeito que ninguém encontra olhando.
    expect(makeCode(() => 0)).toBe(ALPHABET[0]?.repeat(CODE_LENGTH))
    expect(makeCode(() => 0.999999)).toBe(ALPHABET.at(-1)?.repeat(CODE_LENGTH))
  })

  test('não estoura o alfabeto quando o sorteio devolve 1', () => {
    // `Math.random` não devolve 1, mas nem todo gerador injetado é ele.
    expect(isCode(makeCode(() => 1))).toBe(true)
  })
})

describe('conferir', () => {
  test('aceita o que gera', () => {
    expect(isCode('K3M9')).toBe(true)
  })

  test('aceita minúsculas, porque quem digita não deveria precisar do Shift', () => {
    expect(isCode('k3m9')).toBe(true)
  })

  test.each([
    ['curto demais', 'K3M'],
    ['longo demais', 'K3M99'],
    ['vazio', ''],
    ['com pontuação', 'K3M!'],
    ['com espaço', 'K3M '],
  ])('recusa o %s', (_what, text) => {
    expect(isCode(text)).toBe(false)
  })

  test.each([...'OIL01'])('recusa %s, que o gerador nunca produz', (letter) => {
    // As duas listas já estiveram separadas, e discordavam: o servidor aceitava
    // essas letras. Um código digitado com O no lugar de zero criava uma sala
    // vazia em vez de falhar na hora.
    expect(isCode(`K3M${letter}`)).toBe(false)
  })
})

describe('o crachá do assento', () => {
  test('não é senha e ninguém o vê', () => {
    // O navegador o cria, guarda e devolve sozinho. Não aparece na tela, não é
    // digitado e não protege nada — só serve para a sala reconhecer quem volta.
    expect(makeToken(() => 0.5)).toMatch(/^[0-9a-z]{16}$/)
  })

  test('não repete entre duas criações', () => {
    // Dois crachás iguais dariam a um jogador o assento do outro.
    let n = 0
    const walking = () => ((n += 7) % 36) / 36

    expect(makeToken(walking)).not.toBe(makeToken(walking))
  })

  test('cobre as duas pontas sem estourar', () => {
    expect(makeToken(() => 0)).toBe('0'.repeat(16))
    expect(makeToken(() => 0.999999)).toBe('z'.repeat(16))
  })
})
