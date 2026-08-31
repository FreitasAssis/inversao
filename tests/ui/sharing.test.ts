import { describe, expect, test } from 'vitest'
import { shareResult } from '../../src/ui/sharing'

/**
 * Os quatro caminhos de saída, e só um deles acontece na máquina de quem está
 * programando. Por isso o ambiente entra por parâmetro: sem isso, o desktop
 * seria o único caminho testado e o celular seria o único que importa.
 */

const file = () => new File(['x'], 'inversao.png', { type: 'image/png' })
const TEXT = 'Inversão · Grade\nVitória'

type Sent = { text?: string; files?: File[] }

/** Anota o que foi pedido, sem depender da inferência de tipos de um mock. */
function spy() {
  const sent: Sent[] = []
  const written: string[] = []
  return {
    sent,
    written,
    share: async (data: Sent) => { sent.push(data) },
    write: async (text: string) => { written.push(text) },
  }
}

describe('compartilhar', () => {
  test('manda imagem e texto juntos quando o navegador aceita arquivo', async () => {
    const it = spy()

    const outcome = await shareResult(TEXT, file(), { share: it.share, canShare: () => true })

    expect(outcome).toBe('shared')
    expect(it.sent[0]?.text).toBe(TEXT)
    expect(it.sent[0]?.files).toHaveLength(1)
  })

  test('manda só o texto quando o navegador compartilha mas recusa arquivo', async () => {
    // Acontece de verdade: vários navegadores têm `share` e não têm `files`.
    // Mandar assim mesmo derruba a chamada inteira e o card não sai.
    const it = spy()

    const outcome = await shareResult(TEXT, file(), { share: it.share, canShare: () => false })

    expect(outcome).toBe('shared')
    expect(it.sent[0]?.files).toBeUndefined()
  })

  test('copia o texto onde não há compartilhamento nenhum', async () => {
    const it = spy()

    expect(await shareResult(TEXT, file(), { write: it.write })).toBe('copied')
    expect(it.written).toEqual([TEXT])
  })

  test('não chama fechar a folha de erro', async () => {
    // `navigator.share` rejeita com AbortError quando a pessoa desiste. Tratar
    // como falha mostraria "não deu" para quem só mudou de ideia — e, pior,
    // copiaria o texto por baixo de uma decisão de não compartilhar.
    const abort = Object.assign(new Error('cancelado'), { name: 'AbortError' })
    const it = spy()

    const outcome = await shareResult(TEXT, file(), {
      share: async () => { throw abort },
      canShare: () => true,
      write: it.write,
    })

    expect(outcome).toBe('cancelled')
    expect(it.written).toEqual([])
  })

  test('ainda copia quando o compartilhamento falha de verdade', async () => {
    const it = spy()

    const outcome = await shareResult(TEXT, file(), {
      share: async () => { throw new Error('sem permissão') },
      canShare: () => true,
      write: it.write,
    })

    expect(outcome).toBe('copied')
    expect(it.written).toEqual([TEXT])
  })

  test('avisa em vez de fingir quando não há saída nenhuma', async () => {
    expect(await shareResult(TEXT, file(), {})).toBe('failed')
  })

  test('avisa quando a área de transferência recusa', async () => {
    // Sem gesto do usuário, ou sem permissão, `writeText` rejeita.
    const outcome = await shareResult(TEXT, null, {
      write: async () => { throw new Error('negado') },
    })

    expect(outcome).toBe('failed')
  })

  test('compartilha o texto mesmo sem imagem gerada', async () => {
    const it = spy()

    expect(await shareResult(TEXT, null, { share: it.share, canShare: () => true })).toBe('shared')
    expect(it.sent[0]?.files).toBeUndefined()
  })
})
