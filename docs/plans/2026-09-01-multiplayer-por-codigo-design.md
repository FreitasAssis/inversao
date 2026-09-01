# Multiplayer por código — desenho

Passo 9 da seção 11 do projeto. Fecha a [#4](https://github.com/FreitasAssis/inversao/issues/4).

Este documento **corrige a seção 6 de `docs/projeto.md`** em dois pontos, e o motivo de
cada correção está registrado abaixo: a seção foi escrita antes de o site existir na
Cloudflare, e antes de dois furos de autoria serem encontrados no motor.

---

## 1. O que mudou desde que a seção 6 foi escrita

### 1.1 O backend deixou de ser Supabase

A seção 6.4 escolheu Supabase Realtime, e a 6.6 registrou como armadilha que **projetos
gratuitos pausam após uma semana sem requisições**, exigindo um Cloudflare Worker com cron
só para mantê-los vivos.

O site hoje é um Worker na Cloudflare. Durable Objects estão no plano gratuito — cerca de
3 milhões de requisições por mês, com API de hibernação para WebSocket — e **não pausam por
inatividade**. A armadilha da 6.6 deixa de existir junto com a mitigação que ela pedia.

O que se ganha, além disso: um fornecedor só, um deploy só, nenhuma chave em repositório
público.

O que se perde: a promessa registrada no README de que não existe código de servidor para
declarar. O `wrangler.jsonc` ganha um `main`.

### 1.2 O commit-and-reveal deixa de ser necessário

A seção 2.3 abre com *"sem servidor, ninguém arbitra"*, e é dessa premissa que sai o
compromisso e revelação: cada lado publica o hash do seu valor, depois os dois revelam.

**Agora existe um servidor, e ele não é nenhum dos dois jogadores.** O Durable Object
sorteia, e o motivo de 2.3 continua respeitado: ninguém prevê a agenda dos sorteios futuros,
e ninguém rola de novo até gostar do resultado.

O que isso economiza não é código, é latência. O commit-and-reveal custa duas idas e voltas
por rodada, e a seção 6.7 já apontava essa janela como longa o bastante para incomodar —
é enquanto ela dura que o motor recusa propor empate e desistir. **A janela deixa de
existir.**

---

## 2. Dois furos de autoria no motor

Encontrados desenhando isto, e reais hoje.

**`Action` não tem autor.** O motor deriva quem jogou a partir do seletor —
`const { side } = turnOf(match.selector)` — porque offline isso sempre bastou: há um
aparelho, e quem manda a ação é quem está na vez por construção. Na rede essa construção
some.

**Desistir pelo adversário.** `resign` grava `winner: other(side)`, e `side` é de quem é a
vez. Uma mensagem `resign` mandada na vez do adversário registra que **ele** desistiu, e
quem mandou vence.

**Aceitar o próprio empate.** `acceptDraw` não olha lado nenhum, só se existe oferta
pendente — e `offerDraw` não avança o seletor. Oferecer e em seguida aceitar a própria
oferta escapa de qualquer posição perdida sem o adversário concordar.

Os dois passam porque a interface local nunca ofereceria esses botões na hora errada. Um
cliente malicioso não usa a nossa interface.

**Isto não decide entre relay e servidor autoritativo.** Um motor rodando no Durable Object
teria o mesmo furo: autoria não é conhecimento que o motor tenha, é conhecimento que só a
conexão tem.

---

## 3. Arquitetura

### 3.1 O Durable Object é uma sala, e não sabe jogar

Uma instância por código.

```
DO Sala
├── conexões: [{ id, papel: 'blue' | 'orange' | 'espectador', nome }]
├── config: tabuleiro, mecânica, barra ligada
├── rodada: número
└── log: SequencedAction[]      // append-only, não interpretado
```

Três responsabilidades:

1. **Carimbar autor.** Toda mensagem que sai leva o `from` da conexão que entrou, nunca o
   que o cliente disse. É a única parte que precisa ser inforjável, e ele a sabe sem saber
   nada do jogo.
2. **Ser a moeda honesta.** Ao pedido de sorteio da rodada *n* ele responde uma vez;
   pedidos seguintes recebem o mesmo valor. É o que impede rolar até gostar.
3. **Repassar e guardar.** O resto é relay, mais um log para quem reconectar.

O único conhecimento de jogo que ele tem é **um inteiro**: o número da rodada.

### 3.2 O cliente continua sendo a autoridade sobre as regras

`replayMatch` já recusa lista que não obedece às regras, venha do `localStorage` ou da rede.
O que entra novo é um validador de transporte, puro, rodando antes do motor:

```ts
type SequencedAction = { seq: number; from: Side; action: Action }
```

Ele checa:

- `seq` é o próximo esperado;
- `move`, `pass`, `resign` e `offerDraw` só de quem está na vez;
- `acceptDraw` e `declineDraw` só de quem **não** ofereceu;
- `draw` só do servidor, nunca de um jogador.

Fica fora do motor de propósito. **Autoria é transporte, não regra** — o motor segue sem
saber que existe rede.

### 3.3 A interface que faltava

A decisão 4 da seção 2.2 nunca foi construída: o dois-humanos local compartilha o mesmo
`setMatch`. Ela entra agora, e com um campo a mais do que o documento previa — o `from`.

```ts
interface Transport {
  send(action: SequencedAction): void
  onReceive(cb: (action: SequencedAction) => void): void
}
```

A implementação local entrega direto. A de rede fala com o Durable Object. O jogo não fica
sabendo qual das duas está ali.

---

## 4. Fluxo

### 4.1 Criar é instantâneo

O botão gera a sala com o que já está no painel — tabuleiro, mecânica, nome — e devolve o
link na hora. Ajustar acontece **enquanto espera**, não antes de mandar. Pedir quatro
decisões antes de gerar um link é atrito na única etapa que precisa ser rápida.

```
inversao.luizfreitas.com.br/sala/K3M9
```

Código de quatro caracteres, alfabeto sem `0/O` nem `1/I/L`, porque ele vai ser ditado no
telefone. São 32⁴ ≈ 1 milhão de combinações, e o Durable Object recusa entrada em sala
cheia — colisão vira "código inválido", nunca duas partidas misturadas.

### 4.2 Entrar é um assento

Quem chega segundo pega o lado vago e digita o nome. Do terceiro em diante, espectador.

A configuração some da tela quando o segundo entra: mudar tabuleiro no meio seria recomeçar
a partida sem avisar.

### 4.3 Uma rodada da Escolha Sorteada

```
cliente A  ──── pedeSorteio(rodada 7) ───▶  DO
                                            responde uma vez só
A e B      ◀─── {seq, from:'server', draw} ─  DO
A          ──── {move, círculo, B2} ──────▶  DO ──▶ B   (carimbado from:'blue')
B          ──── {move, círculo, C1} ──────▶  DO ──▶ A   (carimbado from:'orange')
```

Uma mensagem por lance. Os dois clientes pedem o sorteio porque nenhum deles sabe se o outro
pediu, e a sala é **idempotente por rodada**: o segundo pedido não produz ação nenhuma.

Isto foi corrigido ao construir. O texto anterior dizia que ela "repete a resposta ao
segundo", o que estaria errado — reemitir poria **dois sorteios na mesma rodada** da lista de
ações. A primeira resposta já foi para os dois lados.

### 4.4 Revanche

Reabre a mesma sala com os lados trocados: quem era azul volta de laranja. A lista de ações
zera, o código continua valendo, ninguém manda link de novo.

---

## 5. Quando dá errado

### 5.1 Queda

O Durable Object vê a conexão fechar e avisa quem ficou. Sessenta segundos, com os dez
últimos em contagem explícita, e **ninguém é eliminado automaticamente**: aparece um botão.
Se o adversário é um amigo cujo metrô entrou no túnel, esperar é escolha de quem não fez
nada errado.

Encerrar grava um resultado novo:

```ts
{ kind: 'abandonment'; winner: Side }
```

Ele toca quatro lugares — `Outcome`, o texto do card, o plano da imagem e a anotação. Na
anotação cai na regra que já existe: **não cobrar a desistência de ninguém**, porque ela é
consequência de estar perdendo e não causa. Abandono é ainda menos culpa de alguém.

Existir como `kind` próprio em vez de reaproveitar `resignation` é para não afirmar que a
pessoa desistiu quando ela só entrou num túnel.

### 5.2 Reconectar é de graça, e já está construído

Quem volta recebe o log e roda `replayMatch` — a mesma função que traz de volta a partida
salva no aparelho, com a mesma recusa.

Isso cobre o log envenenado: um cliente malicioso pode gravar lixo, quem reconecta recebe
`null`, e a partida fica irrecuperável. **Trava, nunca dá vitória** — e travar já é possível
hoje fechando a aba.

### 5.3 Sem Realtime, o jogo continua

Se o Durable Object não conectar, o modo online avisa e some. O resto do site não sabe que
isso aconteceu: ele funciona offline contra a IA desde o passo 4, e é por isso que essa
falha não derruba nada.

### 5.4 A barra de avaliação é da sala, não sua

A seção 9 permite a barra entre dois humanos, com a justificativa de que ela só é perigosa
quando entrega a resposta a **um** lado durante o jogo.

Essa justificativa assume uma tela só. Online, cada um tem a sua: se um liga e o outro não,
um joga sabendo a probabilidade exata e o outro não — exatamente o que a regra existia para
impedir. **A condição real nunca foi "dois humanos": era "uma tela só".**

Então ela passa a ser decidida na criação da sala, ligada para os dois ou para nenhum. Se um
dos lados não conseguiu baixar a tabela, não aparece para ninguém.

---

## 6. Como isto fica testável

O trabalho real, segundo a seção 6.7, é o atrito: testar passa a exigir dois clientes
abertos em toda iteração. É aí que a costura da seção 3.3 se paga.

**Transporte local, em memória.** Com uma implementação que entrega direto, um teste monta
**dois `App` no mesmo jsdom** e joga uma partida inteira entre eles — sem rede, sem Durable
Object, sem Miniflare. Vitória, abandono, revanche, reconexão no meio: determinístico e em
milissegundos. É o mesmo truque que fez o card ser testável sem canvas.

**O validador de transporte é puro**, então os dois furos da seção 2 entram como teste
direto, com mutação em cima dos dois — teste que afirma recusa é o que mais passa por motivo
errado neste projeto.

**O Durable Object roda em Miniflare**, com `@cloudflare/vitest-pool-workers`. É pequeno o
bastante para ser coberto de verdade: carimba o autor certo, responde o mesmo sorteio duas
vezes para a mesma rodada, recusa a terceira conexão como jogador, entrega o log a quem
volta.

**O que não dá para testar:** o comportamento de uma queda real de rede, a latência, e o
WebSocket sob o service worker. Este último é ponto de conferência explícito — `new
WebSocket()` não deve passar pelo `fetch` do worker, mas isso se confirma no navegador antes
de confiar.

---

## 7. Escopo da primeira versão

Entra:

- criar sala, entrar por link, jogar até o fim
- **revanche** sem gerar código novo, com os lados trocados
- **o nome de cada lado trafega** — sem ele o card diz "Azul venceu Laranja", que não é
  história nenhuma, e o card inteiro foi feito para dizer quem venceu quem
- **barra de avaliação da sala**, ligada para os dois ou para nenhum
- **espectador por link**, do terceiro em diante

Não entra: chat, lobby, fila, presença global, contagem de quem está online. A seção 6.3 já
explica por quê — um lobby vazio comunica abandono muito mais eloquentemente do que a
ausência do recurso.

Fica para depois, na [#19](https://github.com/FreitasAssis/inversao/issues/19): **times de
quatro**, que ficam mais baratos por causa do espectador — os dois pedem a mesma coisa do
Durable Object, que conexões tenham papel e só algumas tenham assento.

---

## 8. Ordem de construção

1. `Transport` e o validador de transporte, com o transporte local. Fecha os dois furos da
   seção 2 antes de existir rede para explorá-los.
2. O resultado `abandonment` nos quatro lugares que ele toca.
3. Dois `App` num teste, jogando uma partida inteira pelo transporte local.
4. O Durable Object em Miniflare, sem cliente.
5. O transporte de rede, ligando os dois.
6. Queda, contagem, reconexão.
7. Revanche e espectador.
