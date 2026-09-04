/**
 * O código da sala.
 *
 * Ele vai ser **ditado no telefone**, e é isso que decide o alfabeto: fora `O`
 * e `0`, fora `I`, `L` e `1`. O que sobra são 31 símbolos que ninguém confunde
 * falando, e quatro deles dão 923.521 combinações — ordens de grandeza acima de
 * quantas partidas este jogo terá ao mesmo tempo.
 *
 * Gerar e conferir moram no mesmo arquivo de propósito. Estiveram separados — o
 * gerador aqui e um `[A-Z2-9]{4}` no servidor —, e as duas listas discordavam:
 * o servidor aceitava `O`, `I` e `L`, que o gerador nunca produz. Um código
 * digitado com `O` no lugar de zero criaria uma sala vazia em vez de falhar.
 */

export const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export const CODE_LENGTH = 4

/** Aceita minúsculas: quem digita o link não deveria precisar do Shift. */
export function isCode(text: string): boolean {
  const upper = text.toUpperCase()
  if (upper.length !== CODE_LENGTH) return false
  return [...upper].every((letter) => ALPHABET.includes(letter))
}

/** `random` devolve 0 ≤ x < 1. Injetável para o teste não depender de sorte. */
export function makeCode(random: () => number = Math.random): string {
  let code = ''
  for (let at = 0; at < CODE_LENGTH; at++) {
    const pick = Math.floor(random() * ALPHABET.length)
    code += ALPHABET[Math.min(ALPHABET.length - 1, Math.max(0, pick))]
  }
  return code
}
