import { Board } from './Board'
import { pathOf } from './routes'
import { startMatch } from '../engine/match'
import type { BoardCode } from '../engine/types'

/**
 * The rules, as reference — never as a gate. Nobody has to read this to play,
 * and the root still opens on a board with nothing in front of it (project doc
 * 3 and 4).
 *
 * It exists because of what playing with people showed: the board teaches
 * *what* to do perfectly well, and players still wanted to know **why** — that
 * there is a draw at all, what separates the two mechanics, why a turn is
 * sometimes forfeited. Acting correctly without understanding is not the same
 * as understanding.
 *
 * Every illustration is drawn by the real `Board` over a real `Match`. A
 * hand-drawn diagram drifts from the game the first time a rule moves; these
 * cannot, because they are the game.
 */

/** An illustration: the real board over a real match, opened on a given board. */
const still = (board: BoardCode) => (
  <Board match={startMatch({ board, mechanic: 'rotation' })} onPlay={() => {}} />
)

export function Rules() {
  return (
    <main className="app rules">
      <h1>Regras do Inversão</h1>
      <p className="lead">
        Leve cada peça ao encaixe do seu símbolo do outro lado do tabuleiro. Quem levar as
        três primeiro vence.
      </p>

      <section>
        <h2>O tabuleiro não é uma grade</h2>
        <p>
          São dois blocos de seis casas ligados por uma <strong>faixa central</strong>. A
          travessia é o jogo, e é a faixa que decide por onde ela pode acontecer — é a única
          coisa que separa os três tabuleiros.
        </p>
        {still('dbu')}
      </section>

      <section>
        <h2>Nenhuma peça termina na coluna onde começou</h2>
        <p>
          O círculo, o triângulo e o quadrado atravessam <em>e</em> trocam de coluna. Os
          contornos vazados na fileira do fundo são os encaixes: cada um espera o símbolo
          desenhado nele. Como o símbolo diz o destino e a cor diz o dono, uma peça parada
          sobre o encaixe errado não confunde ninguém.
        </p>
      </section>

      <section>
        <h2>Um lance move uma peça para uma casa vizinha vazia</h2>
        <p>
          Não há captura, não há salto, não há duas peças na mesma casa. O que muda de
          mecânica para mecânica é apenas <strong>quem decide qual peça se move</strong>.
        </p>
      </section>

      <section>
        <h2>Escolha Sorteada</h2>
        <p>
          Antes de cada rodada sorteia-se <strong>quem tem a iniciativa</strong>. Quem a tem
          escolhe uma das suas três peças e move. O adversário fica então obrigado a mover a
          peça <em>dele</em> com o mesmo símbolo, para onde quiser.
        </p>
        <p className="aside">
          O acaso não escolhe a sua jogada — ele escolhe <strong>quem escolhe</strong>. É por
          isso que a mecânica funciona: se você deixar uma peça parada em casa, o adversário
          escolhe justamente ela e te obriga a mexer. O bloqueio deixa de ser estratégia e
          vira aposta.
        </p>
      </section>

      <section>
        <h2>Rodízio</h2>
        <p>
          Sem sorteio e sem escolha: a ordem é fixa e cíclica — círculo, triângulo, quadrado,
          e recomeça. O contador é compartilhado pelos dois jogadores e avança a cada lance,
          inclusive quando alguém passa a vez.
        </p>
      </section>

      <section>
        <h2>Às vezes você passa a vez</h2>
        <p>
          Se a peça da vez não tiver nenhuma casa vizinha livre, o lance é perdido e o jogo
          segue. Não vale mover outra peça no lugar — é a mesma regra que impede alguém de
          parar uma peça e nunca mais tocá-la.
        </p>
        <p>
          Acontece entre 9% e 13% dos turnos, conforme o tabuleiro. Não é o jogo travando.
        </p>
      </section>

      <section>
        <h2>Às vezes o mesmo jogador joga duas vezes</h2>
        <p>
          Na Escolha Sorteada, quem responde numa rodada pode ganhar a iniciativa na
          seguinte, e mover de novo antes de você. Cada sorteio é independente do anterior —
          é assim que deve ser.
        </p>
      </section>

      <section>
        <h2>Empate</h2>
        <p>
          Qualquer jogador pode propor empate, e o outro aceita ou recusa: é a via principal.
          Repetir a mesma posição três vezes também pode encerrar a partida, mas só se você
          ligar isso na configuração — posição repetida não prova que o jogo travou.
        </p>
      </section>

      <section>
        <h2>Os três tabuleiros</h2>
        <p>
          Mesmas peças, mesmos encaixes, mesma condição de vitória. Muda só a faixa central,
          e com ela o jeito de pensar a travessia.
        </p>

        <div className="rules-boards">
          <figure>
            <h3>Ponte</h3>
            {still('nbn')}
            <figcaption>
              Uma única passagem, no meio. Toda travessia disputa a mesma casa.
            </figcaption>
          </figure>
          <figure>
            <h3>Grade</h3>
            {still('bbb')}
            <figcaption>
              Três passagens, nos dois sentidos. Corrida limpa, sem gargalo.
            </figcaption>
          </figure>
          <figure>
            <h3>Setas</h3>
            {still('dbu')}
            <figcaption>
              Desce pela esquerda, sobe pela direita: dois caminhos sem volta, e uma rota a
              planejar.
            </figcaption>
          </figure>
        </div>
      </section>

      <a className="restart" href={pathOf('game')}>
        Voltar e jogar
      </a>
    </main>
  )
}
