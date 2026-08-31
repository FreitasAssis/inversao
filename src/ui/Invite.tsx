import { BOARDS_FOR, BOARD_PT, MECHANIC_PT } from './labels'
import type { Mechanic } from './labels'
import type { BoardCode } from '../engine/types'

/**
 * O convite para outra combinação, no fim da partida.
 *
 * É a mitigação registrada quando mecânica e tabuleiro saíram de trás da
 * engrenagem: **três topologias e duas mecânicas são o conteúdo do jogo**, e
 * quem só joga o padrão nunca descobre isso. O fim de partida é o momento em
 * que a pessoa está decidindo se joga de novo — antes disso seria interrupção.
 *
 * Só oferece o que existe. O Rodízio na Ponte empata a partir de qualquer
 * abertura, então não é jogo: essa combinação não aparece aqui, do mesmo jeito
 * que não aparece no painel.
 */

export type InviteProps = Readonly<{
  board: BoardCode
  mechanic: Mechanic
  onPick: (board: BoardCode, mechanic: Mechanic) => void
}>

export function Invite({ board, mechanic, onPick }: InviteProps) {
  const others = BOARDS_FOR[mechanic].filter((code) => code !== board)
  const swapped: Mechanic = mechanic === 'choice' ? 'rotation' : 'choice'
  // Trocar de mecânica pode invalidar o tabuleiro atual: a Ponte não tem
  // Rodízio. Nesse caso o convite já vem com um tabuleiro que funciona, em vez
  // de levar a pessoa a uma combinação que o app recusa.
  const kept = BOARDS_FOR[swapped].includes(board) ? board : (BOARDS_FOR[swapped][0] as BoardCode)

  return (
    <section className="invite">
      <h2>Experimente outra</h2>
      <p>
        Cada tabuleiro muda por onde dá para atravessar, e cada mecânica muda quem decide a
        peça. É aí que está o jogo.
      </p>

      <div className="invite-picks">
        {others.map((code) => (
          <button key={code} type="button" onClick={() => onPick(code, mechanic)}>
            {BOARD_PT[code]}
          </button>
        ))}
        <button type="button" onClick={() => onPick(kept, swapped)}>
          {MECHANIC_PT[swapped]}
          {kept === board ? '' : ` no ${BOARD_PT[kept]}`}
        </button>
      </div>
    </section>
  )
}
