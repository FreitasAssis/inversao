import { useEffect, useState } from 'react'

/**
 * O adversário sumiu (desenho do passo 9, seção 5.1).
 *
 * Por cima do tabuleiro, e nunca trocando de tela: a partida vive no `App`, e
 * desmontá-lo jogaria a lista de ações fora.
 *
 * **Ninguém é eliminado automaticamente.** Sessenta segundos, com os dez
 * últimos em contagem explícita, e então um botão. Se o adversário é um amigo
 * cujo metrô entrou no túnel, esperar é escolha de quem não fez nada errado —
 * e encerrar sozinho tiraria essa escolha justamente dessa pessoa.
 *
 * O botão **pede**: quem declara é a sala, depois de conferir que o outro está
 * mesmo fora.
 */

export const WAIT_SECONDS = 60
/** A partir daqui a contagem aparece em números, e não só como espera. */
export const LOUD_SECONDS = 10

export type AwayProps = Readonly<{
  /** Como o adversário se chama, já resolvido. */
  who: string
  onClaim: () => void
  /** Injetável para o teste não depender de relógio de parede. */
  seconds?: number
}>

export function Away({ who, onClaim, seconds = WAIT_SECONDS }: AwayProps) {
  const [left, setLeft] = useState(seconds)

  // Um intervalo só, e não um `setTimeout` por segundo: encadeado, cada um é
  // agendado depois do render anterior, e o relógio falso do teste nunca
  // alcança o segundo tique.
  useEffect(() => {
    const timer = setInterval(() => setLeft((now) => (now <= 0 ? 0 : now - 1)), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div role="alert" className="away">
      <strong>{who} se desconectou.</strong>
      {left > LOUD_SECONDS && <span>Esperando ele voltar…</span>}
      {left > 0 && left <= LOUD_SECONDS && (
        // Em números só no fim: uma contagem correndo desde o primeiro segundo
        // transforma sessenta segundos de espera em sessenta segundos de
        // ansiedade, e a maioria das quedas termina antes disso.
        <span className="away-count">{left}</span>
      )}
      {left <= 0 && (
        <>
          <span>Ele não voltou.</span>
          <button type="button" onClick={onClaim}>
            Encerrar a partida
          </button>
        </>
      )}
    </div>
  )
}
