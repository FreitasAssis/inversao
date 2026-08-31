import { CARD, cardPlan, paint } from './card'
import type { CardInput, Palette } from './card'

/**
 * Entregar o card para fora do site.
 *
 * O caminho bom é a Web Share API com o arquivo junto, que no celular abre a
 * folha nativa. No desktop ela quase nunca existe — e é por isso que o **texto**
 * é a substância e a imagem é embalagem: o que sobra funciona em todo lugar.
 *
 * Tudo entra por parâmetro em vez de sair de `navigator`, para que os caminhos
 * possam ser exercitados. São quatro, e só um deles acontece na máquina de quem
 * está programando.
 */

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed'

export type ShareEnv = {
  share?: ((data: { text?: string; files?: File[] }) => Promise<void>) | undefined
  canShare?: ((data: { text?: string; files?: File[] }) => boolean) | undefined
  write?: ((text: string) => Promise<void>) | undefined
}

export async function shareResult(
  text: string,
  file: File | null,
  env: ShareEnv,
): Promise<ShareOutcome> {
  if (env.share !== undefined) {
    const withFile = file !== null && (env.canShare?.({ files: [file] }) ?? false)
    const data = withFile && file !== null ? { text, files: [file] } : { text }
    try {
      await env.share(data)
      return 'shared'
    } catch (error) {
      // Fechar a folha de compartilhamento **não é** um erro. Tratar como erro
      // mostraria "falhou" para quem simplesmente mudou de ideia.
      if (isAbort(error)) return 'cancelled'
      // Qualquer outra falha ainda tem a área de transferência abaixo.
    }
  }

  if (env.write !== undefined) {
    try {
      await env.write(text)
      return 'copied'
    } catch {
      return 'failed'
    }
  }
  return 'failed'
}

function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: string }).name === 'AbortError'
}

/**
 * O PNG. Devolve null onde não há canvas — teste, navegador antigo, ou um
 * `toBlob` que resolveu vazio. O compartilhamento segue sem ele, com o texto.
 */
export async function renderCard(input: CardInput, palette: Palette): Promise<File | null> {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = CARD.width
  canvas.height = CARD.height
  const ctx = canvas.getContext('2d')
  if (ctx === null || typeof ctx.roundRect !== 'function') return null

  paint(ctx, cardPlan(input, palette))

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), 'image/png')
  })
  if (blob === null) return null
  return new File([blob], 'inversao.png', { type: 'image/png' })
}
