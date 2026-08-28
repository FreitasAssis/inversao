import { Board } from './Board'
import { pathOf } from './routes'
import { startMatch } from '../engine/match'
import type { Match } from '../engine/match'
import type { BoardCode, Placement } from '../engine/types'

/**
 * How the game was verified.
 *
 * The project doc calls this the differentiator: no other obscure game on the
 * internet ships with a computational proof, and it is what turns "a site with
 * a little game" into something else. Almost all of it is already written in
 * section 8 of the spec — this cuts and illustrates it.
 *
 * Every number here comes from the C tools in `tools/` and is reproducible with
 * a `make`. Where a claim is a proof rather than a measurement, it says so;
 * where the analysis cannot answer, it says that too.
 */

const still = (board: BoardCode, placement?: Placement) => {
  const opened = startMatch({ board, mechanic: 'rotation' })
  const match: Match = placement ? { ...opened, placement } : opened
  return <Board match={match} onPlay={() => {}} />
}

/** Orange's circle parked on D1 — blue's own slot — and never obliged to leave. */
const PARKED: Placement = {
  blue: [6, 7, 8],
  orange: [9, 1, 2],
}

export function Analysis() {
  return (
    <main className="app rules analysis">
      <h1>Como o Inversão foi verificado</h1>
      <p className="lead">
        O espaço de estados foi resolvido por completo, por busca exaustiva, antes de o jogo
        existir como jogo. Todos os números desta página saem das ferramentas em C do
        repositório e se reproduzem com um <code>make</code>.
      </p>

      <section>
        <h2>O teorema do estacionamento</h2>
        <p>
          Um jogo de travessia sem captura empata sozinho, e não é questão de desenho. Se
          vencer exige ocupar casas dentro da posição inicial do adversário, se não há
          captura, e se <strong>nada obriga uma peça a se mover</strong>, então o defensor
          empata sempre: estaciona uma peça em casa e nunca mais a toca, gastando turnos com
          as outras duas. Aquela casa é obrigatória para você e nunca está vazia.
        </p>
        {still('bbb', PARKED)}
        <p>
          O círculo laranja acima está sobre D1 — o encaixe do círculo azul. Sem uma regra
          que o obrigue a sair, ele fica ali para sempre, e o azul nunca completa as três.
        </p>
        <p>
          Três topologias diferentes morreram assim antes de o defeito ficar claro:
          um tabuleiro em H com 90% de empates, uma grade cheia com 97%, uma grade com
          pontes de mão única com 92%. Todas as correções tentadas — salto, troca de
          posição, limite de permanência, mais pontes, proibição de recuo, captura, objetivo
          reduzido — mexiam no <em>caminho</em>. O defeito estava no <em>destino</em>.
        </p>
      </section>

      <section>
        <h2>A escala da escolha</h2>
        <p>
          O que resolve é movimento forçado. E a dose importa: dar ao jogador mais controle
          sobre <em>qual</em> peça mover devolve o empate na mesma proporção.
        </p>
        <table>
          <thead>
            <tr>
              <th>variante</th>
              <th>controle sobre a peça</th>
              <th>empates</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Rodízio fixo</td>
              <td>nenhum</td>
              <td>12,9%</td>
            </tr>
            <tr>
              <td>Ordem livre</td>
              <td>parcial</td>
              <td>90,6%</td>
            </tr>
            <tr>
              <td>Escolha alternada</td>
              <td>total, previsível</td>
              <td>99,7%</td>
            </tr>
            <tr>
              <td>
                <strong>Escolha Sorteada</strong>
              </td>
              <td>
                <strong>total, iniciativa sorteada</strong>
              </td>
              <td>
                <strong>0,03% – 2,6%</strong>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="aside">
          As duas últimas colunas <strong>medem coisas diferentes</strong>, e a página não
          teria valor se escondesse isso. Nas três primeiras, cada posição tem veredito
          exato, e o número é a fatia do espaço de estados que empata. Na Escolha Sorteada o
          valor é contínuo e não existe veredito por posição: o número é a massa de empate na
          posição inicial. Não há como converter um no outro.
        </p>
        <p>
          As duas do meio morrem pela mesma causa: o defensor recupera o{' '}
          <strong>poder de desfazer</strong>. Sabendo que escolhe na próxima rodada, ele move
          a peça bloqueadora um passo e a devolve, obedecendo à regra. Sortear a iniciativa
          quebra isso — sempre há a chance de o adversário escolher duas vezes seguidas e
          arrastar a bloqueadora para longe. O bloqueio deixa de ser estratégia e vira aposta.
        </p>
      </section>

      <section>
        <h2>A ressurreição dos tabuleiros</h2>
        <p>
          Os desenhos descartados morreram <em>sob as regras antigas</em>, não em absoluto.
          Remedidos sob a Escolha Sorteada, <strong>todos voltaram a funcionar</strong> —
          inclusive o tabuleiro em Ponte, que abriu o projeto como empate morto e hoje é uma
          das três opções de lançamento.
        </p>
      </section>

      <section>
        <h2>O valor da posição inicial é 0,5, e isso é prova</h2>
        <p>
          A rotação de 180° do tabuleiro leva cada aresta numa aresta existente — inclusive
          as dirigidas do Setas, onde <code>3→6</code> vira <code>8→5</code> — e leva a
          posição inicial e os alvos do azul exatamente nos do laranja. Como a iniciativa é
          sorteada na raiz, os dois lados são indistinguíveis. Logo P(azul vence) = 0,5, nos
          três tabuleiros, sem precisar de computador.
        </p>
        <p>
          O que a iteração de valor mede, então, não é o valor: é a <strong>massa de
          empate</strong>. Um limite converge por baixo tratando jogo infinito como derrota
          do azul, o outro por cima tratando como vitória, e a distância entre eles é a fatia
          em que a partida não termina sob jogo ótimo. Ela sobrevive à convergência completa
          — verificado rodando 12.000 varreduras além do alvo, sem uma casa decimal se mover.
        </p>
        <table>
          <thead>
            <tr>
              <th>tabuleiro</th>
              <th>massa de empate</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Grade</td>
              <td>0,024%</td>
            </tr>
            <tr>
              <td>Setas</td>
              <td>1,27%</td>
            </tr>
            <tr>
              <td>Ponte</td>
              <td>2,61%</td>
            </tr>
          </tbody>
        </table>
        <p>
          Duas ordens de grandeza, e é a <strong>única métrica que separa os três
          tabuleiros</strong> — o perfil estrutural os dá como quase idênticos. A ordem é a
          que a topologia prevê: o gargalo da Ponte sustenta bloqueio, e o Grade, sem gargalo
          nem sentido único, quase não deixa o empate sobreviver.
        </p>
      </section>

      <section>
        <h2>O trilema dos alvos</h2>
        <p>
          Três propriedades desejáveis, e provavelmente só duas alcançáveis ao mesmo tempo:
          que o alvo seja a posição inicial do adversário; que nenhuma peça termine na coluna
          onde começou; e que os dois lados sejam simétricos.
        </p>
        <p>
          A prova é curta. Se o arranjo de cima é a rotação do de baixo, e o alvo é a posição
          inicial do adversário, a peça que ocupa a casa central da fileira sempre termina na
          mesma coluna. Com três colunas não há escapatória.
        </p>
        <p>
          O jogo abre mão da primeira. Ela só tinha valor enquanto a cor marcava destino —
          com cor para dono e símbolo para destino, ela deixa de importar. Era problema de
          design visual, e foi resolvido no design, não nas regras.
        </p>
      </section>

      <section>
        <h2>Os números</h2>
        <ul>
          <li>
            <strong>1.330.560 posições</strong> no espaço de estados do Rodízio, resolvidas
            por análise retrógrada completa
          </li>
          <li>
            <strong>283 lances</strong> de profundidade até a vitória forçada de quem abre —
            longe demais para qualquer humano decorar, que é o que mantém o jogo aberto
          </li>
          <li>
            <strong>12,9% de empates</strong> no Setas, <strong>2,4%</strong> no Grade,{' '}
            <strong>34,7%</strong> na Ponte, onde o Rodízio morre
          </li>
          <li>
            <strong>Três implementações independentes</strong> concordando: o solucionador em
            C reproduziu números obtidos antes em Python, e um gerador de oráculos escrito à
            parte reproduz o perft lance a lance
          </li>
        </ul>
      </section>

      <section>
        <h2>O limite honesto</h2>
        <p>
          A análise prova que o jogo não está quebrado. Não prova que ele é bom — esse teste
          não é computável, e foi feito com pessoas.
        </p>
        <p>
          E há uma fraqueza no online. Sem servidor, ninguém arbitra o sorteio da iniciativa:
          quem rola pode rolar de novo até gostar do resultado. Derivar o sorteio de uma
          semente compartilhada resolveria a trapaça e criaria coisa pior — os dois lados
          passariam a conhecer <em>todos</em> os sorteios futuros, e o defensor recuperaria o
          poder de desfazer que mata o jogo. A saída é compromisso e revelação: cada lado
          escolhe em segredo, publica um lacre, e só então os dois revelam.
        </p>
        <p>
          <strong>O Rodízio é imune por construção</strong>: sem acaso, tudo é verificável
          pelos dois lados.
        </p>
      </section>

      <a className="restart" href={pathOf('game')}>
        Voltar e jogar
      </a>
    </main>
  )
}
