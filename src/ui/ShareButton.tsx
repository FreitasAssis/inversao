import { useState } from 'react'
import { readPalette } from './card'
import type { CardInput, Palette } from './card'
import { renderCard, shareResult } from './sharing'
import type { ShareEnv, ShareOutcome } from './sharing'

/**
 * O botão de compartilhar, e o que ele responde (projeto 7).
 *
 * Um controle só, que se adapta: no celular abre a folha nativa com o PNG e o
 * texto; no desktop, onde a Web Share API quase nunca existe, copia o texto e
 * confirma. Quem usa nunca esbarra num recurso que não funciona ali.
 *
 * O ambiente e a paleta entram por parâmetro com um padrão. Sem isso, o único
 * caminho testável seria o do desktop — e o do celular é o que importa.
 */

const SAID: Record<ShareOutcome, string> = {
  shared: 'Compartilhado.',
  copied: 'Resultado copiado.',
  cancelled: '',
  failed: 'Não deu para compartilhar aqui. O texto está abaixo, para copiar à mão.',
}

function browserEnv(): ShareEnv {
  const shareable = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  return {
    share: shareable ? (data) => navigator.share(data) : undefined,
    canShare:
      typeof navigator !== 'undefined' && typeof navigator.canShare === 'function'
        ? (data) => navigator.canShare(data)
        : undefined,
    write:
      typeof navigator !== 'undefined' && navigator.clipboard !== undefined
        ? (text) => navigator.clipboard.writeText(text)
        : undefined,
  }
}

function documentPalette(): Palette {
  const style = getComputedStyle(document.documentElement)
  return readPalette((name) => style.getPropertyValue(name))
}

export type ShareButtonProps = Readonly<{
  text: string
  /** Null quando não há o que desenhar; o texto ainda vai. */
  card: CardInput | null
  env?: ShareEnv
  palette?: () => Palette
}>

export function ShareButton({ text, card, env, palette }: ShareButtonProps) {
  const [said, setSaid] = useState<ShareOutcome | null>(null)
  const [busy, setBusy] = useState(false)

  async function go() {
    setBusy(true)
    setSaid(null)
    try {
      const file = card === null ? null : await renderCard(card, (palette ?? documentPalette)())
      setSaid(await shareResult(text, file, env ?? browserEnv()))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sharing">
      <button type="button" onClick={() => void go()} disabled={busy}>
        {busy ? 'Preparando…' : 'Compartilhar'}
      </button>

      {/*
        Vivo, porque nada mais na tela muda quando a folha nativa fecha.

        Só existe quando tem o que dizer. Uma região viva permanentemente vazia
        é ruído no DOM — e, concretamente, seria um segundo `role="status"`
        ao lado do anúncio da vez, que precisa emudecer quando a partida acaba.
      */}
      {said !== null && SAID[said] !== '' && (
        <p role="status" className="sharing-said">
          {SAID[said]}
        </p>
      )}

      {/* Nunca um beco sem saída: se as duas rotas falharem, o texto aparece. */}
      {said === 'failed' && (
        <textarea className="sharing-text" readOnly rows={10} value={text} aria-label="Resultado" />
      )}
    </div>
  )
}
