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

1. ✅ `Transport` e o validador de transporte, com o transporte local. Fecha os dois furos da
   seção 2 antes de existir rede para explorá-los.
2. ✅ O resultado `abandonment` nos quatro lugares que ele toca.
3. ✅ Dois `App` num teste, jogando uma partida inteira pelo transporte local.
4. ✅ O Durable Object em Miniflare, sem cliente.
5. 🔶 O transporte de rede, ligando os dois. **Falta a tela de criar/entrar e a rota.**
6. Queda, contagem, reconexão.
7. Revanche, espectador na interface, e o nome de cada lado trafegando.

Parado dentro do passo 5, com 683 testes. O que existe:

| arquivo | o que faz |
|---|---|
| `src/net/wire.ts` | autoria e ordem, antes do motor |
| `src/net/protocol.ts` | o envelope e os leitores do que chega |
| `src/net/transport.ts` | a interface e a sala em memória |
| `src/net/socket.ts` | o `Transport` sobre WebSocket |
| `worker/index.ts` | a sala como Durable Object |
| `src/ui/App.tsx` | aceita uma sala pela prop `online` |

**O que falta para uma partida online acontecer de ponta a ponta:** a rota
`/sala/CODE`, a tela de criar e entrar, e o `App` sendo montado com um
`socketTransport` em vez de um da memória. Nada disso mexe no fio — é a casca
que ainda não existe.

**Este documento não sobrevive ao fim.** Quando os sete passos fecharem, o que valer a pena
vai para a seção 6 de `docs/projeto.md` — que é onde o multiplayer é descrito — e
`docs/plans/` some. Um plano cumprido que fica no repositório vira uma segunda descrição da
arquitetura, e a segunda é sempre a que ninguém atualiza.

---

## 10. Os passos 5 a 7, detalhados

Detalhar trouxe cinco coisas que as seções anteriores não diziam. Elas estão marcadas
**novo** e mudam o que os passos são.

### 10.1 Passo 5 — o transporte de rede ✅ *(menos a tela)*

O que foi construído está nas seções 9.8 a 9.11. Sobra a casca: a rota `/sala/CODE`, a tela
de criar e entrar, e o `App` sendo montado com um `socketTransport`. O texto abaixo é o
plano original, mantido porque a parte de colisão de código ainda não foi implementada.


`src/net/socket.ts`: um `Transport` sobre `WebSocket` apontando para `/sala/CODE`, com a
mesma interface que o transporte em memória. O `App` não muda.

O que a implementação precisa resolver:

- **Fila antes de abrir.** O `App` pede o sorteio assim que monta, e o socket ainda não
  abriu. Enviar antes de `open` perde a mensagem, então ela espera numa fila.
- **Entrada não confiável.** O que chega é JSON de fora, e o cliente confere a forma antes de
  passar ao `admits` — do mesmo jeito que `readSaved` confere o `localStorage`. Que o
  servidor seja nosso não é motivo para acreditar no que chega.
- **Reconectar não precisa de nada novo.** A sala reentrega o log desde o zero, e o contador
  de sequência do cliente já está adiante — o guarda de ordem descarta o que ele já aplicou e
  aceita a partir de onde parou. Isto cai de graça pelo que o passo 3 construiu.

**Novo — o cliente não sabe em que assento sentou.** A sala decide (`blue`, `orange` ou
espectador) e nunca conta. Hoje quem diz é a prop `online.seat`, e do lado da rede não há
quem a preencha. Precisa de uma mensagem de boas-vindas, fora do fluxo de ações:

```ts
type Inbound =
  | { kind: 'welcome'; seat: Side | 'spectator'; config: RoomConfig }
  | { kind: 'action'; message: SequencedAction }
```

**Novo — a configuração da partida tem de viajar.** Tabuleiro, mecânica e a barra de
avaliação são escolhidos por quem cria. Sem isso na boas-vindas, quem entra joga o que estiver
no painel dele — e duas telas com tabuleiros diferentes aceitariam lances diferentes, cada uma
achando que a outra é que trapaceia. A sala guarda a configuração do primeiro a sentar.

**Novo — colisão de código põe um estranho na sua sala.** `idFromName(code)` cria a sala
implicitamente, então dois jogadores que sorteiem o mesmo código caem na mesma. Com os dois
assentos ocupados, o terceiro vira espectador de uma partida alheia — silenciosamente.

A saída é barata e usa o que já existe: **quem cria confere a boas-vindas.** Se não recebeu o
primeiro assento numa sala vazia, sorteia outro código e tenta de novo. Em ~1 milhão de
combinações isso quase nunca acontece, e "quase nunca" sem tratamento é o tipo de defeito que
aparece uma vez e não se reproduz.

Falta também a rota `/sala/CODE` no roteador da página e a tela de criar/entrar, e a
degradação: se a sala não conectar, o modo online avisa e some.

### 10.2 Passo 6 — queda, contagem, reconexão

A sala já sabe quando um socket fecha; falta ela **contar**. Mais uma mensagem fora do fluxo
de ações — presença não é lance:

```ts
| { kind: 'peer'; present: boolean }
```

Na tela: sessenta segundos, os dez últimos em contagem explícita, e um botão. **Nunca
automático** — se o adversário é um amigo cujo metrô entrou no túnel, esperar é escolha de
quem não fez nada errado.

O botão não declara o abandono: ele **pede**. O cliente manda `{ kind: 'claim' }`, e a sala
só emite `{ type: 'abandon', winner }` depois de conferir que o outro está mesmo ausente. É a
mesma regra do sorteio — presença é conhecimento da sala, e um cliente que declarasse
reivindicaria vitória a qualquer momento.

Se o adversário volta durante a contagem, a sala manda `present: true` e a contagem morre.

### 10.3 Passo 7 — revanche, espectador e nomes

**Novo — a revanche zera a sequência.** Ela reabre a mesma sala com os lados trocados, e o
log recomeça. O contador de sequência do cliente **precisa zerar junto**, senão ele fica
adiante e descarta a partida inteira em silêncio. É a mesma classe do defeito da seção 9.2, e
vale escrever o teste antes do código.

**Novo — o nome não entra na lista de ações.** É tentador, porque tudo o mais entra. Mas a
lista é o que `replayMatch` executa, e uma ação que não é lance nem faz parte das regras
tornaria o replay dependente de metadados de sala. Nome é da conexão, viaja na boas-vindas e
no `peer`, e some quando a sala some.

**Espectador** já existe na sala (`watch`), e falta na interface: tabuleiro sem controles,
sem desistir nem propor empate, e um aviso de que se está assistindo. A ausência do `send` é
a regra — não um botão desabilitado.

**A barra de avaliação** passa a ser da sala, decidida na criação, ligada para os dois ou
para nenhum. Se um dos lados não baixou a tabela, não aparece para ninguém: meia barra é a
assimetria que a regra existia para impedir.

### 10.4 O que ainda precisa ser conferido no navegador

- **`new WebSocket()` sob o service worker.** Não deve passar pelo `fetch` do worker, mas
  isso se confirma abrindo, não lendo.
- **Latência e queda de verdade.** Nenhum teste em `jsdom` ou Miniflare alcança.
- **`run_worker_first` em produção.** Valida no `--dry-run`; o comportamento real só o deploy
  mostra.

---

## 9. O que a construção corrigiu

Registrado aqui porque cada item é uma coisa que este documento afirmava e que se mostrou
errada ou incompleta ao virar código.

### 9.1 Quem chega depois recebe o log — e esse é o caso normal

O documento tratava a entrega do log como mecanismo de **reconexão**. É mais que isso: o
segundo jogador *sempre* entra depois do primeiro, às vezes depois do primeiro sorteio. Sem
reentregar, ele abriria com o tabuleiro em branco enquanto o outro já tinha a rodada em
curso. Assinar é receber a lista, sempre.

### 9.2 A sequência segue a sala, não a lista de ações

A primeira implementação usava `actions.length` como número esperado, com o raciocínio de que
toda mensagem aceita acrescenta exatamente uma ação. Verdadeiro, e insuficiente: **a sala
numera tudo o que transmite, inclusive o que os clientes recusam**, porque ela não conhece as
regras. Uma única tentativa de trapaça dessincronizava a sequência para sempre e travava a
partida — o oposto do pretendido, que era trapaça não ter efeito.

O contador vive numa ref e acompanha a sala.

### 9.3 O sorteio é idempotente, e não repetido

A seção 4.3 dizia que a sala "responde ao primeiro e repete a resposta ao segundo".
Reemitir poria **dois sorteios na mesma rodada** da lista de ações. Já corrigido no texto.

### 9.4 `abandon` carrega o vencedor

Ao contrário de `resign`, ele não é derivável de quem está na vez: quem some costuma sumir
fora da vez, e a rodada pode estar esperando o sorteio, onde não há vez nenhuma. Ele também
precisa ser tratado **antes** da guarda "responda a proposta de empate primeiro", senão sumir
durante uma proposta trava a partida para quem ficou.

### 9.5 O `single-page-application` engoliria o WebSocket

`not_found_handling: single-page-application` responde o `index.html` para todo endereço sem
arquivo correspondente — inclusive o pedido de upgrade. Sem
`assets.run_worker_first: ["/sala/*"]` o cliente receberia HTML em vez de conexão. Há teste
fixando isso.

### 9.6 Dois mundos de tipo, e dois de teste

`lib: DOM` e os tipos do Workers definem `WebSocket` de formas incompatíveis, então o
servidor tem `tsconfig.worker.json` próprio — sem ele o `worker/` ficava fora do `include` e
era publicado **sem checagem de tipo nenhuma**. Os testes da sala saem do tsconfig principal
pelo mesmo motivo: usam `scheduler`, que é global do Workers.

Igualmente, `jsdom` e o runtime do Workers não convivem num processo: são dois projetos de
vitest reunidos por `vitest.workspace.ts`, e cada um precisa de `name` próprio ou colidem
herdando o nome do pacote.

### 9.7 Limitações conhecidas do ambiente de teste

- **`@cloudflare/vitest-pool-workers` está preso em `0.12.21`**, a última versão que aceita
  vitest 2. As seguintes exigem vitest 4, o que seria um salto de duas versões maiores sobre
  635 testes — trabalho a fazer um dia, não junto com isto.
- **`isolatedStorage: false`**, porque a variante SQLite do Durable Object quebra com ele
  nesta versão. A sala não usa `state.storage`, então nada se perde — mas o estado sobrevive
  entre testes, e por isso cada teste gera o próprio código de sala.
- **O `workerd` local está atrás da produção.** Ele para numa data de compatibilidade
  anterior à que o `wrangler.jsonc` fixa, e o Miniflare avisa e recua. Verde aqui não é prova
  lá.

### 9.8 A partida online nasce dentro das boas-vindas

As boas-vindas e o log chegam na **mesma rajada**. A primeira ideia foi montar a partida a
partir do painel e corrigi-la quando a configuração chegasse — e isso perde o log: o efeito
que reinicia a partida ao mudar tabuleiro rodaria um quadro adiante e jogaria fora o que a
sala acabou de entregar.

A partida passa a nascer dentro do tratamento das boas-vindas, e as ações seguintes, que já
estão enfileiradas atrás dela, caem sobre a partida certa. O efeito de configuração local não
roda em partida online: ali a configuração é da sala.

### 9.9 O teto de ações não viaja, então é constante

`maxActions` e o empate por repetição fazem parte de `MatchConfig` e mudam o resultado. Se
cada cliente usasse o seu, os dois discordariam sobre quando a partida vira empate por
limite — e a divergência apareceria no lance 500, sem nada na tela explicando.

Eles não estão em `RoomConfig`: são constantes derivadas dela, iguais nos dois lados por
construção.

### 9.10 Um link sobrevive à sala, e a sala diz isso

A sala é memória, não registro. Quem abre um código cujo criador já saiu recebe **404**, e
não um tabuleiro em branco numa configuração padrão — que seria a resposta errada mais
convincente possível.

### 9.11 A fronteira navegador/servidor está escrita no tsconfig

`src/net/socket.ts` usa `location` e o `WebSocket` do DOM, e está **excluído** do
`tsconfig.worker.json`. Não é arrumação: se alguém importá-lo do servidor, o `tsc` segue o
import e reclama, que é exatamente o aviso desejado.

### 9.12 A sala não hiberna, e isso é uma escolha

O log vive na memória do Durable Object, que permanece vivo enquanto houver socket aberto. A
API de hibernação reduziria custo de duração, mas descartaria o estado em memória — e o log é
justamente o que faz reconectar funcionar.

Conta grosseira sobre os ~390 mil GB-s gratuitos por mês: a ~128 MB por objeto, dá cerca de
870 horas de sala de pé, ou algo como **2.600 partidas de vinte minutos por mês**. Ordens de
grandeza acima do que um portfólio precisa.

Se um dia precisar hibernar, o caminho é persistir o log em `state.storage` — e aí ele deixa
de ser opaco de graça, porque passa a custar escrita por lance.
