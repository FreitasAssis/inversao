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

/**
 * O crachá do assento.
 *
 * **Não é senha e ninguém o vê.** O navegador o cria sozinho, guarda sozinho e
 * o devolve sozinho; ele nunca aparece na tela, nunca é digitado e não protege
 * nada — só serve para a sala reconhecer que é a mesma pessoa voltando.
 *
 * Por isso o alfabeto inteiro e o comprimento maior: ao contrário do código da
 * sala, este nunca é ditado no telefone.
 *
 * Existe porque **o servidor não distingue uma conexão morta de uma calada**.
 * Fechar a aba manda um quadro de fechamento e o assento é liberado na hora;
 * matar o navegador, o celular suspender a aba ou a rede cair não mandam nada,
 * e o assento fica ocupado por um fantasma. Sem ele, quem volta encontra
 * os dois lugares tomados e entra como espectador da própria partida.
 */
export function makeToken(random: () => number = Math.random): string {
  let token = ''
  for (let at = 0; at < 16; at++) {
    token += Math.floor(random() * 36).toString(36)
  }
  return token
}
