# Inversão — Especificação do Projeto (site / PWA)

Documento de arquitetura e escopo. As regras do jogo estão em
[`especificacao.md`](especificacao.md) — este documento assume que elas estão fechadas.

**O site é o jogo.** Um jogo, um endereço, nome `Inversão`. Não é uma coleção. Se um
segundo jogo aparecer um dia, a raiz vira índice e a rota do primeiro não muda — mas nada
de plataforma deve ser construído antes disso existir.

No ar em **<https://inversao.luizfreitas.com.br>**, como subdomínio de um domínio que já
existia. Isso deixou o projeto com **custo anual zero**, e é melhor que um domínio dedicado
para um jogo só — o endereço fica no nome de quem o fez, que é o que um portfólio quer.

---

## 1. Stack

| camada | escolha | motivo |
|---|---|---|
| front | React + TypeScript | reconhecimento em portfólio, melhor ferramental de PWA |
| build | Vite | build estático, PWA plugin maduro |
| hospedagem | Cloudflare Workers, só arquivos estáticos | custo zero, e o cron do anti-pausa fica no mesmo provedor |
| tempo real | Supabase Realtime (Broadcast) | sem servidor próprio, plano gratuito folgado |
| ping anti-pausa | Cloudflare Worker (cron trigger) | não desativa por inatividade do repositório |
| custo anual | **nenhum** | subdomínio de um domínio que já existia |

**Repositório público.** Num portfólio, o código costuma valer mais que o site.

> **Sobre a hospedagem.** Começou como Pages e virou Worker com *static assets*,
> que é para onde a Cloudflare migrou — a porta de entrada do painel já leva
> para lá. Para este projeto é indiferente: os dois servem arquivo estático e
> os dois leem `_headers` e `_redirects`. O que **não** muda é não haver código
> de servidor: o `wrangler.jsonc` não declara `main`, e o jogo inteiro — motor,
> busca, tabelas e desafios — roda no navegador.

---

## 2. Arquitetura

### 2.1 A separação que sustenta tudo

```
engine (TS puro)  ->  ai  ->  transport  ->  ui (React)
     |                                           |
     +----------- nenhuma dependencia -----------+
```

**Convenção de idioma:** o código é em inglês — identificadores, tipos, nomes de arquivo e
comentários. Português fica no que o usuário lê: textos de interface, conteúdo das páginas,
rotas (`/regras`, `/analise`) e estes documentos.

*Colisão a evitar na tradução:* "casa" e "quadrado" viram ambos *square*. As doze casas do
tabuleiro são `Cell`; `'square'` fica reservado ao símbolo da peça.

**Motor puro, sem UI, sem I/O.** Recebe estado + ação, devolve novo estado, lances legais
e resultado. Nada de React, nada de fetch, nada de `window`. Isso entrega de graça: testes
unitários, IA, replay, desfazer e rede.

É também o trecho que melhor demonstra competência técnica. Trate-o como o produto.

### 2.2 Seis decisões que precisam ser tomadas agora

Estas mudam a *forma* do código. Adicionar depois é reescrever; adicionar agora custa
quase nada.

**1. O laço de partida é assíncrono.** Cada lado é um controlador que devolve uma promessa
de ação. Humano local resolve no toque, IA resolve após a busca, remoto resolve na
mensagem — mesma forma para os três.

```ts
type Controller = (state: GameState) => Promise<Action>
```

Se o laço nascer síncrono, adicionar rede significa reescrevê-lo inteiro.

**2. O fluxo da partida é uma lista de ações, não de lances.** Proposta de empate, aceite,
recusa e desistência vivem no mesmo fluxo que os lances.

```ts
type Action =
  | { type: 'move'; piece: Piece; to: Cell }
  | { type: 'pass'; piece: Piece }
  | { type: 'offerDraw' }
  | { type: 'acceptDraw' }
  | { type: 'declineDraw' }
  | { type: 'resign' }
```

Modelar só lances e tratar empate como evento de interface obriga a refazer o formato
depois.

**A peça é parte da ação, não do contexto.** No Rodízio ela é redundante — o ciclo já a
determina, e o motor rejeita a que não bater. Na Escolha Sorteada ela é *a* decisão: quem tem
a iniciativa nomeia o símbolo, e o adversário fica obrigado a mover o mesmo. Sem esse campo o
formato não expressa **nomear uma peça sem lance legal para passar de propósito**, que é a
jogada mais característica do jogo — 28 dos 360 lances do `puzzles.json` são exatamente isso,
e em 87% dos puzzles a pergunta é qual peça nomear, não para onde mover. Um `pass` sem peça é
ambíguo em toda partida de Escolha Sorteada.

**3. Partida = estado inicial + lista de ações.** Nunca só a posição atual. Replay,
desfazer, análise pós-jogo, reconexão e transmissão em rede saem todos daqui.

**4. Interface de transporte, sem escolher backend.**

```ts
interface Transport {
  send(action: SequencedAction): void
  onReceive(cb: (action: SequencedAction) => void): void
}
```

A implementação local entrega direto. O multiplayer local já usa isso. Depois, Supabase
implementa a mesma interface e o jogo não fica sabendo.

**5. O sorteio da iniciativa é uma ação registrada, não um valor derivado.** O resultado de
cada rodada entra na lista de ações como `{ type: 'draw', initiative }`. De onde ele vem é
problema de quem provê: local e contra a IA, um gerador com semente; online, compromisso e
revelação (seção 2.3).

Isso é o oposto do que este item dizia antes — "função pura de (semente, número do lance)",
para que qualquer lado calculasse a rodada 37 sem ter visto as anteriores. Essa propriedade
existia para reconexão e replay, e a lista de ações já entrega as duas: reconectar é receber
a lista e reexecutar. O que ela custava era o jogo (seção 2.3).

**6. Serialização compacta desde o começo.** O estado inteiro são seis casas + turno +
seletor de peça: cabe em ~30 bits. A configuração da partida (tabuleiro e mecânica) são mais
alguns bits e **precisa estar no mesmo pacote** — sem ela, um estado recebido é ambíguo. Um
único formato atende salvamento local, código de partida, mensagem de rede e depuração.
Inventar três formatos depois é o caminho normal — e o errado.

### 2.3 Autoridade de estado

Sem servidor, ninguém arbitra. A solução barata e suficiente: cada ação carrega número de
sequência, e o cliente **rejeita o que estiver fora de ordem ou for ilegal pelo motor**.
Isso não é código extra — é usar o motor que já existe.

Sobra o sorteio da iniciativa, e ele é mais delicado do que parece.

**Um lado sorteando sozinho é trapaceável** — quem rola pode rolar de novo até gostar do
resultado. **Semente compartilhada é pior**, e por um motivo que passa despercebido: se os
dois conhecem a semente, os dois calculam *todos* os sorteios futuros. O cara-ou-coroa vira
agenda publicada, e o defensor recupera o **poder de desfazer** que a seção 8.3 da
especificação aponta como causa de morte das variantes de 90,6% e 99,7% de empate. Sabendo
que ganha a próxima iniciativa, ele tira a peça bloqueadora e devolve sem risco. A Escolha
Sorteada funciona precisamente porque isso é aposta.

**A saída é compromisso e revelação.** Cada lado sorteia um valor em segredo e publica só o
hash; depois os dois revelam, e a iniciativa sai da combinação dos dois valores. Ninguém
prevê, porque falta metade da entrada. Ninguém trapaceia, porque o hash prende a escolha
antes de ver a do outro. Custa uma troca a mais por rodada — e é o preço de a mecânica
continuar sendo o que a análise mediu.

O resultado revelado entra na lista de ações (item 5 da seção 2.2), então reconexão e replay
continuam saindo de graça.

**O Rodízio é imune por construção:** sem acaso, tudo é verificável pelos dois lados.

### 2.4 As IAs

Mecânicas diferentes exigem tabelas diferentes, mas o mesmo esqueleto: tudo consome o motor
puro e implementa a mesma interface de controlador — o jogo não sabe qual está do outro lado.
Os níveis que o jogador vê estão na seção 6 da especificação do jogo.

**Uma tabela por combinação de tabuleiro e mecânica**, gerada offline e distribuída como
arquivo binário estático. O navegador baixa e consulta: jogo perfeito, custo zero de
execução, sem busca.

| mecânica | tabuleiros | o que a tabela guarda | tamanho medido |
|---|---|---|---|
| Escolha Sorteada | os três | probabilidade de vitória, quantizada em 1 byte | 5,1 MB |
| Rodízio | Grade e Setas | veredito (1 byte) + distância (2 bytes) | 11,4 MB |

**Na Escolha Sorteada a quantização em 1 byte basta.** São 256 níveis, precisão de sobra
para escolher lance e para calibrar erro em pontos percentuais. São 5,3 milhões de valores
por tabuleiro: 1,33 milhão de estados de fase 0 (quem escolhe decide) e 4 milhões de fase 1
(o adversário responde com a peça nomeada).

**No Rodízio a distância é necessária, não opcional.** Só com o veredito, numa posição ganha
todos os lances continuam "ganhos" e a IA fica manobrando para sempre sem concluir. Guardar
a distância (2 bytes) resolve; a alternativa é uma heurística de desempate no cliente.

**IA de busca como fallback e como nível baixo.** Enquanto a tabela do tabuleiro escolhido
não chegou, use busca — minimax na Escolha Sorteada (o sorteio da iniciativa é um nó de
acaso de duas vias, não três, então a poda alfa-beta ainda ajuda) e minimax puro no Rodízio.
A função de avaliação é a **soma das distâncias de cada peça até seu encaixe, por busca em
largura no grafo dirigido** — com as colunas de mão única a distância não é simétrica. Some
um termo de bloqueio. Essa mesma função serve de métrica de estagnação da trava
anti-oráculo: um cálculo, dois usos.

A ramificação é baixa — 1,45 no Rodízio, ~4,7 para quem escolhe na Escolha Sorteada — então
a busca alcança profundidade alta a custo baixo. A preocupação com o custo de nós de acaso
era exagerada nesta escala.

> **Armadilha na geração das tabelas — jogadas duplas.** A análise retrógrada padrão
> pressupõe que o jogador alterna a cada lance. Na Escolha Sorteada isso é falso: quem
> responde numa rodada pode ganhar a iniciativa na seguinte e mover duas vezes seguidas. Com
> a lógica ingênua os valores se propagam invertidos. **Sintoma:** a proporção de
> vitórias/derrotas bate exatamente com a proporção de fases do estado. **Correção:** rotular
> os estados de forma absoluta (azul vence / laranja vence) em vez de relativa ao jogador da
> vez.

**O código que gera as tabelas é offline, separado do site, e escrito em C.** Ele resolve o
espaço inteiro em segundos e serve também de gerador dos oráculos (seção 2.5). Python não dá
conta da produção: a iteração de valor precisa convergir a delta < 1e-9. **Nada do código de
análise vai para o site**; o jogo roda inteiro no navegador.

### 2.5 Oráculos de verificação

Implementação independente para contraprova do motor em TypeScript. `oraculos.json` fica no
repositório como fixture e os testes comparam contra ele.

**A ferramenta é o `oraculos.c`, não Python.** O C precisa existir de qualquer forma para
gerar as tabelas de produção (o Python não converge o suficiente), então gerar os oráculos
com ele é uma ferramenta a menos no projeto. O `perft.py` original cobria só o Rodízio e foi
aposentado.

```
cd tools && make oraculos.json      # escreve ../data/oraculos.json
```

Quatro oráculos, que pegam classes diferentes de bug:

1. **perft** — contagem de nós por profundidade; pega bugs de geração de lances
2. **posições distintas por profundidade** — pega bugs de modelagem de estado; a divergência
   entre este número e o anterior é onde surgem transposições, e reproduzi-la é um teste
   forte de que o estado tem exatamente os campos certos
3. **passeio determinístico** — pega erros de ciclo, passe, alternância e jogada dupla
4. **ordem do codec** — pega enumeração divergente, que é o bug mais caro do projeto
   (adiante)

Cobertura: as cinco combinações de lançamento — Rodízio no Grade e no Setas, Escolha
Sorteada nos três tabuleiros. Sob `rodizio`, as duas ficam num mapa `boards`, com a mesma
forma que `escolhaSorteada` já usava.

**Como o acaso é removido dos oráculos.** A Escolha Sorteada tem sorteio, que não serve para
teste reproduzível. Duas convenções resolvem, e ambas estão documentadas dentro do JSON:

- no **perft**, o sorteio vira um nó de acaso explícito com dois ramos — a árvore fica
  determinística e exercita as duas iniciativas
- no **passeio**, a iniciativa **alterna** começando pelo azul, e a peça nomeada percorre
  círculo → triângulo → quadrado por rodada, caindo na próxima que tenha lance legal

Nenhuma das duas é a regra do jogo. São regras artificiais que exercitam a mesma geração de
lances sem depender de sorteio. **O motor precisa expor um gancho para injetar a iniciativa**
— o mesmo que a semente compartilhada usa no online (seção 2.3). Se esse gancho não existir,
os oráculos não são testáveis.

> **Limite honesto.** É independência de implementação, não de interpretação: as duas versões
> saem da mesma especificação. Pega erro de transcrição — índice trocado, ciclo avançando na
> hora errada, aresta dirigida invertida —, que é a maioria dos bugs reais. Não pega erro de
> especificação. Para cobrir isso, escreva os testes a partir da especificação **antes** de
> olhar o `oraculos.c`, e só depois compare.

**Validação cruzada já feita, três vezes:** o solucionador em C reproduziu os resultados do
Python para o Rodízio — 12,9% de empates, 283 lances, azul e laranja simétricos em 43,5% — e
o `oraculos.c` reproduziu o perft do `perft.py` lance a lance. Duas linguagens, três
implementações, mesmos números.

### 2.6 Formato binário das tabelas

O que o navegador baixa e consulta. As duas começam com **16 bytes de cabeçalho**: assinatura
de 4 bytes, versão, número de estados e um campo reservado, todos `u32`.

| | assinatura | corpo | índice do estado |
|---|---|---|---|
| **Rodízio** | `INVR` | **dois planos:** N bytes de veredito, depois N `u16` de distância | `pos*6 + vez*3 + ciclo` |
| **Escolha Sorteada** | `INVS` | 1 byte por estado: P(azul vence) quantizada em 0–255 | `pos*8 + escolhe*4 + fase` |

> **Correção.** Este quadro dizia "1 byte de veredito, depois 2 bytes de distância", o que se
> lê como um registro de 3 bytes por estado. **Não é.** O C escreve o vetor de vereditos
> inteiro e só então o de distâncias — dois planos contíguos. Ler como registro intercalado
> devolve valor de outro estado sem erro nenhum, que é exatamente a falha silenciosa que esta
> seção adverte. O leitor em TypeScript foi escrito a partir do C, não daqui, e há teste de
> mutação que derruba a leitura intercalada.

Todos os `u32` são **little-endian**, que é o que o `fwrite` do C grava nas máquinas alvo.

No Rodízio, `vez` é 0 para azul e 1 para laranja; `ciclo` é 0 círculo, 1 triângulo, 2
quadrado. O veredito é **1 azul, 2 laranja, 3 empate** — e 0 num estado que a análise
retrógrada nunca resolveu, que dá no mesmo. Na Escolha Sorteada, `escolhe` é quem tem a
iniciativa (**0 azul, 1 laranja**, porque é o lado que maximiza P(azul vence) no solver) e
`fase` é 0 para nomear-e-mover, `1+i` para o adversário responder com a peça `i` — o que dá 4
valores por iniciativa e 8 por posição, sem desperdício. O valor lido é `byte / 255`.

**A quantização em 1 byte é grossa onde o jogo é equilibrado, e isso é informação.** Na
posição de abertura do Setas, ter ou não a iniciativa dá **o mesmo byte**: a vantagem de
nomear vale menos de 1/255 ali. É a abertura ~50/50 da seção 6 da especificação aparecendo no
artefato. Depois que a peça é nomeada os dois se separam, e é essa diferença que um teste usa
para distinguir as duas iniciativas — nenhum teste sobre a abertura conseguiria.

> **`pos` é o índice compacto da colocação das seis peças na ordem de enumeração canônica**
> (12P6 = 665.280), e **o motor em TypeScript precisa reproduzir essa ordem exatamente**. Se
> ele errar a enumeração, cada consulta devolve o valor de outra posição — a IA joga mal sem
> nenhum sintoma óbvio, e o bug é quase impossível de achar depois. É o primeiro teste a
> escrever.
>
> **Contar não basta, e por pouco não passou batido:** qualquer enumeração das 665.280
> colocações tem o mesmo total e continua sendo bijeção, então um motor que enumerasse em
> outra ordem passaria num teste de contagem. O que prende a ordem são os campos `samples` e
> `checksum` do oráculo — cinco índices âncora e um FNV-1a de 32 bits sobre as seis casas de
> cada colocação, na ordem do índice. Verificado por mutação: trocar os lados na enumeração
> mantém a bijeção, passa na contagem e **derruba os dois**.

### 2.7 As ferramentas offline

Quatro programas em C na raiz do repositório, orquestrados por um `Makefile`. **Nada aqui vai
para o site** — o jogo roda inteiro no navegador e só lê os arquivos produzidos.

| ferramenta | produz | custo |
|---|---|---|
| `oraculos` | `data/oraculos.json`, fixture de verificação do motor | segundos |
| `solver-rodizio` | tabela do Rodízio, exata de uma vez | ~1 s por tabuleiro |
| `solver-sorteio` | tabela da Escolha Sorteada | ~90 s por limite; a Ponte, o dobro |
| `extrai` | `data/puzzles.json` a partir dos limites `lo` e `hi` | segundos |

Ordem de execução, a partir de `tools/`:

```
make oraculos.json   # e valide o motor contra ele ANTES de gerar tabela
make tabelas         # ~6 min: as tres da Escolha Sorteada convergem aqui
make puzzles.json    # so quando as tabelas mudarem
make publica         # leva as tabelas e os JSON versionados para ../public/data
make dist            # idem, mas REGERA puzzles.json antes
```

> **`publica` e `dist` não são a mesma coisa, e a diferença custa sete minutos.**
> O `dist` pede `puzzles.json` como *alvo*, e esse alvo depende dos limites
> superiores, que são `FORCE`. Num clone limpo — que é exatamente o ambiente de
> build do Cloudflare — pedi-lo dispara a convergência dos três `hi` inteiros
> para reproduzir um arquivo que já está versionado e não mudou.
>
> O `publica` copia os dois JSON como arquivos, nunca como alvos. É o que o
> Pages roda, e sobra só o custo legítimo: as três tabelas da Escolha Sorteada,
> que são `FORCE` de propósito porque a tabela existir não significa que
> convergiu.
>
> Medido num clone limpo: **5m40s** para o `publica`, contra um teto de 20
> minutos por build no Pages.

Os dois JSON são pequenos e ficam versionados em `data/`. As tabelas `.bin` e os
checkpoints ficam em `tools/`, fora do git: somam mais de 200 MB e saem do C.

**O `solver-sorteio` converge numa passada, mas não numa passada curta.** Com o
`SWEEPS ?= 4000` do Makefile ele chega ao alvo de uma vez. Medido:

| tabuleiro | sweeps até delta < 1e-9 | tempo |
|---|---|---|
| Setas | 1802 (inf) / 1822 (sup) | ~87 s cada |
| Grade | 1745 / 1745 | ~85 s cada |
| **Ponte** | **3599 / 3599** | ~175 s cada |

A Ponte é o caso apertado — sobra pouco mais de 10% de folga no limite de sweeps. Não é
coincidência: é o tabuleiro de maior massa de empate, e é justamente ela que retarda a
convergência.

Se um dia estourar, nada se perde. O solver salva o estado em `v_<tabuleiro>_<lo|hi>.bin` e
continua de onde parou, então rodar o alvo de novo avança em vez de recomeçar — o alvo é
`FORCE` de propósito, porque a tabela existir não significa que convergiu. Ele avisa enquanto
o delta estiver acima de 1e-9.

**Não apague os `v_*.bin` sem querer.** `make limpa-tudo` faz isso, e a próxima rodada
recomeça do zero. Checkpoints da versão antiga em `float` têm metade do tamanho; o solver e o
`extrai` os rejeitam com mensagem em vez de ler lixo, mas precisam ser apagados à mão.

---

## 3. Rotas

| rota | conteúdo |
|---|---|
| `/` | **o jogo, jogável imediatamente** |
| `/desafios` | os desafios do dia, três, um por tabuleiro (seção 8) |
| `/regras` | regras ilustradas, referência completa |
| `/analise` | o laboratório — como o jogo foi verificado |

**A raiz abre num tabuleiro pronto:** Escolha Sorteada, tabuleiro Setas, contra a IA, nível
médio. Sem splash, sem menu, sem "clique para começar". Mecânica, tabuleiro e dificuldade num
painel discreto dentro do jogo — **atrás de uma engrenagem no cabeçalho, num modal sobre o
tabuleiro** —, nunca numa tela anterior a ele — são cinco combinações
(três na Escolha Sorteada, duas no Rodízio), e nenhuma delas significa nada para quem ainda
não jogou.

Para um jogo desconhecido, cada tela antes do tabuleiro é uma chance de desistência. Para
portfólio, quem abre o link precisa ver a coisa funcionando em dois segundos.

> **O painel virou modal.** Dez controles estacionados embaixo do jogo eram a maior parte da
> página num celular. Sob demanda e sobre o tabuleiro atende a mesma regra — está dentro do
> jogo, não antes dele — e devolve a página ao tabuleiro.
>
> É um `<dialog>` nativo: armadilha de foco, Escape, fundo inerte e devolução do foco ao
> botão saem de graça e são justamente o que se erra ao fazer à mão. O jsdom não implementa
> `<dialog>`, então `tests/setup.ts` o simula — e diz explicitamente que **o comportamento
> modal é do navegador e não está coberto** pelos testes. O que eles cobrem é o que é nosso:
> a engrenagem abre, os controles estão dentro, o rótulo existe, fechar fecha.
>
> **E por isso a divisão não é "tudo no modal".** As três topologias e as duas mecânicas são o
> *conteúdo* do jogo, não preferência: atrás de uma engrenagem, quase todo mundo jogaria uma
> combinação e iria embora sem descobrir que existem cinco. Mecânica, tabuleiro, abertura e
> nível ficam na página; o que é gosto — cor, som, velocidade, nomes, teto, barra — vai para
> o modal.
>
> Continua valendo convidar para outro tabuleiro no fim da partida, junto com os cards do
> passo 8, mas isso agora é reforço e não a única chance.

---

## 4. Ensinar sem exigir leitura

O Inversão é auto-explicativo porque a cada lance existe **uma peça ativa e um encaixe de
destino**, e os dois podem ser mostrados na tela. Sobra pouca coisa para aprender, e as setas
do tabuleiro já desenham a única restrição que não é óbvia.

Três camadas, em ordem de importância:

**O tabuleiro ensina.** Destaque a peça ativa, ilumine as casas legais, marque o encaixe
dela. Com isso a mecânica se explica sozinha em dois ou três lances.

**O sorteio precisa ser encenado.** Na mecânica padrão, anuncie a iniciativa antes de
liberar o tabuleiro — "iniciativa: você", e só então os toques respondem. É o que separa
"o jogo me deu poder" de "o jogo jogou por mim", e é a diferença entre a mecânica ser
divertida ou irritante.

**Uma linha fixa acima do tabuleiro** — "leve cada peça ao seu encaixe" — e um sobreposto
guiado na primeira visita, curto, com escape imediato.

**`/regras` como referência**, para quem quiser ler. Nunca como pré-requisito.

Duas situações geram dúvida e precisam de aviso explícito: **o passe** (peça ativa sem lance
legal, entre 9% e 13% dos casos) e a **jogada dupla** (quem responde numa rodada pode ganhar
a iniciativa na seguinte). Sem aviso, ambas parecem defeito.

---

## 5. PWA e entrega da IA

**Meta: instalável e offline desde a primeira versão.**

O conflito a resolver, com os tamanhos medidos nos arquivos que o C realmente escreve:

| combinação | tabelas | tamanho |
|---|---|---|
| Escolha Sorteada, três tabuleiros | 3 | 15,3 MB |
| Rodízio, Grade e Setas | 2 | 22,8 MB |
| **total** | **5** | **38,1 MB** |

Precachear tudo mata a instalação — e o Rodízio, que é a mecânica secundária, responde por
60% do peso, porque a distância custa o dobro do veredito. A saída aproveita algo que já
existe:

**A IA de busca não usa tabela.** Então:

1. O app instala leve, com a IA de busca. **Offline funciona desde o primeiro segundo.**
2. As tabelas baixam **sob demanda, uma por combinação escolhida**, em segundo plano, e
   ficam em Cache Storage. Quem só joga a combinação padrão baixa 5,1 MB e nunca vê os
   outros 33 MB.
3. Quando a tabela chega, aquela combinação passa a usar consulta em vez de busca — vira
   jogo perfeito e habilita níveis calibrados, puzzle diário e anotação pós-jogo.

Offline nunca fica quebrado; fica só um pouco menos perfeito até a tabela chegar.

**Detalhes de implementação:**

- Precache: código, fontes, ícones, SVGs. Runtime cache: as tabelas, por chave
  `{tabuleiro}-{mecânica}`.
- Sinalize o estado na interface de forma discreta ("análise completa disponível").
- Sem a tabela, os níveis viram profundidade de busca; com ela, viram tolerância a erro em
  pontos percentuais (ver especificação do jogo, seção 6).
- Toda partida em andamento é salva localmente. Fechar a aba não perde o jogo.

### 5.1 O service worker — feito

O jogo inteiro já está no aparelho depois que a página carrega: motor, busca, tabuleiros e
som são código, e nada é buscado durante a partida. Então "funciona offline" aqui é só
conseguir abrir a página — o que mantém o worker pequeno, e o obriga a não ser esperto.

A regra é uma só: **nunca deixar o cache decidir qual é a versão atual.**

| pedido | estratégia | por quê |
|---|---|---|
| navegação (qualquer endereço) | rede primeiro, cache como reserva | quem está online sempre recebe o HTML de hoje; só quem está sem rede recebe o de ontem |
| `/assets/*` | cache primeiro | o hash está no nome, então o arquivo naquele nome não pode mudar |
| resto da mesma origem | serve do cache e revalida atrás | ícone e manifesto mantêm o nome entre versões |
| outra origem, ou não-GET | passa direto | não existe nenhum hoje, e cachear resposta alheia não é assunto deste worker |

A quebra permanente que isso evita é concreta: guardar **uma** resposta de erro sob a chave
do shell e toda visita offline futura recebe aquela página, para sempre. O worker só guarda
resposta `ok`, e existe um teste que mata essa linha se ela sumir.

Os ícones são desenhados por código (`npm run icons`), pelo mesmo motivo do som: são dois
círculos num fundo chapado, e uma dependência que rasteriza qualquer coisa para desenhar
dois círculos é troca ruim. A marca é o teorema do jogo — girar 180° devolve a mesma marca
com as cores trocadas, que é exatamente por que P(azul vence) é 0,5 exato (especificação
7.1).

O registro do worker acontece **só em produção**. Em desenvolvimento ele cachearia o shell
do servidor de dev e devolveria depois, o que é indistinguível de o build estar quebrado.

### 5.2 A partida salva — feito

Guarda a **configuração e a lista de ações**, nunca uma posição. Voltar rejoga a partida
inteira pelo `applyAction`, então o motor rederiva cada posição e reconfere cada regra.

Isso não é preciosismo: o que sai do `localStorage` é entrada não confiável, e uma posição
guardada seria simplesmente acreditada. A lista de ações tem que se provar. A mesma lista
pode ser perfeitamente legal no Grade e impossível na Ponte — e um save escrito sob regras
antigas deve morrer, não voltar como uma partida que ninguém poderia ter jogado.

É a mesma validação que o passo 9 precisa para uma ação que chega pela rede, e é por isso
que ela mora no motor (`replayMatch`) e não na camada de armazenamento.

Duas coisas viajam junto que não são a partida:

- **A semente.** A fonte de iniciativa é função pura de semente e rodada, então restaurá-la
  faz os sorteios seguirem o cronograma em que a partida interrompida estava.
- **Os assentos.** Trazer de volta uma partida de dois jogadores como partida contra a IA
  não seria só feio: a IA jogaria pela pessoa que está sentada ali.

O save é descartado quando a partida termina ou quando nunca começou. Um tabuleiro intocado
não é jogo em andamento, e reabrir o site no resultado velho de alguém é pior do que abrir
num tabuleiro.

---

## 6. Multiplayer

### 6.1 Local — é configuração, não recurso

**Fazer desde o início.** "Quem joga cada lado" é parâmetro da partida: cada lado é humano
ou IA, e o controlador da seção 2.2 já entrega isso. Trocar a IA por um segundo humano é
trocar de onde vem o lance. Nada mais.

**O risco não é o trabalho, é a UI nascer assumindo "eu sou sempre o de baixo".** Se isso
vazar para os componentes — cores fixas, orientação fixa, painéis fixos —, arrancar depois
vira retrabalho. Nascendo com "lado A" e "lado B", o local sai de graça e o online vira
acréscimo em vez de reforma.

O que muda de fato é só interface:

- Indicar de quem é a vez de forma muito visível — o erro clássico é jogar na vez do outro
- Orientação: num tabuleiro que atravessa de cima para baixo, um dos dois joga de cabeça
  para baixo. Para 12 casas, o mais simples é os dois sentarem do mesmo lado.
- O sorteio da iniciativa precisa aparecer na tela antes do lance, senão o segundo jogador
  não confia no resultado

### 6.2 Online — está no v1

**Compromisso, não hipótese.** É a última coisa construída dentro do v1, por dependência:
exige o resto de pé, é o mais caro em casos de borda (seção 6.7) e testá-lo passa a exigir
dois clientes abertos a cada iteração. Nada disso o torna opcional — as costuras da seção
2.2 existem justamente para que ele seja um acréscimo, e o custo dele é UX, não
infraestrutura.

### 6.3 Partida por código, não pareamento

Um jogador cria a sala e recebe um código curto ou link. Manda para quem quiser. O outro
entra. **Sem lobby, sem fila, sem "procurando adversário".**

Um jogo desconhecido não tem jogadores, e um lobby vazio comunica abandono de forma muito
mais eloquente do que a ausência do recurso. Partida por código nunca fica vazia, porque
você sempre chega com alguém. E dispensa fila, presença global e contagem de online.

### 6.4 Supabase Realtime — Broadcast, não Postgres Changes

Broadcast manda mensagens efêmeras de cliente para cliente pelo canal: nenhuma tabela,
nenhuma migração, nenhum consumo do banco, menor latência. O histórico da partida já existe
no cliente como lista de ações.

Postgres Changes obrigaria a gravar cada lance e escutar o replication stream — mais lento,
mais complexo, sem ganho.

Use **Presence** para detectar queda do adversário.

**Sumir não desclassifica na hora.** Rede cai, túnel, aba dormindo no celular — e reconectar
sai de graça aqui, porque a partida é estado inicial mais lista de ações: quem volta recebe a
lista e reexecuta. O desenho:

- queda detectada → quem ficou vê **"adversário desconectado"** e uma contagem de 60 segundos
- os **últimos 10 segundos** viram contagem explícita
- ao fim, **quem ficou decide**, com um botão para encerrar — nunca automático

O último ponto é o que importa. Se o adversário é um amigo cujo metrô entrou no túnel, você
pode querer esperar, e encerrar sozinho tiraria essa escolha de quem não fez nada errado.

O encaixe é exato: `send(action)` vira um broadcast, `onReceive` vira a subscrição. O jogo
continua sem saber que Supabase existe.

O sorteio da iniciativa **trafega, e em duas etapas**: cada lado manda o hash do seu valor,
e só depois os dois revelam. Derivar de semente compartilhada seria mais barato e está
errado — entrega a agenda dos sorteios futuros aos dois jogadores (seção 2.3). São duas
mensagens minúsculas por rodada, muito abaixo dos limites da seção 6.5.

### 6.5 Limites do plano gratuito

Confirmados em agosto de 2026: 200 conexões simultâneas de pico, 2 milhões de mensagens por
mês, 256 KB por mensagem. O estado da partida cabe em ~30 bits e cada ação são poucos bytes
— o projeto está a ordens de grandeza dos limites. 200 conexões são 100 partidas
simultâneas.

**Confirme os números atuais em supabase.com/pricing antes de arquitetar em cima deles** —
mudaram várias vezes nos últimos anos.

### 6.6 Duas armadilhas

**Projetos gratuitos pausam após uma semana sem requisições** e só voltam com religamento
manual. Para portfólio isso é péssimo: alguém abre num domingo e o multiplayer está morto.

Mitigação: **ping agendado por um Cloudflare Worker com cron trigger**, batendo no projeto
a cada poucos dias.

Não use GitHub Actions para isso: workflows agendados são desativados após 60 dias sem
atividade no repositório, então o cron congelaria pelo mesmo motivo que ele existe para
impedir — e num projeto terminado o repositório fica quieto justamente assim. O cron do
Worker não tem essa dependência.

**Não há SLA no plano gratuito.** Como o jogo inteiro funciona offline contra a IA, isso não
derruba o site — só o multiplayer. A interface deve degradar com elegância: se o Realtime
não conectar, o modo online avisa e some, e o resto continua.

### 6.7 O trabalho real

O custo de multiplayer aqui não é infraestrutura — é UX e casos de borda: esperando o
adversário entrar, adversário caiu, reconectando, revanche, alguém fechou a aba no meio.
Mais o atrito de testar, que passa a exigir dois clientes abertos em toda iteração.

Reconexão sai de graça se a partida for estado inicial + lista de ações: reconectar é
receber a lista e reexecutar. É literalmente o mesmo `replayMatch` que traz de volta a
partida salva no aparelho (seção 5.2), incluindo a recusa: lista que não obedece às regras
não vira partida, venha ela do `localStorage` ou da rede.

**Uma janela que já existe e vai crescer.** Enquanto a rodada espera a iniciativa, o motor
recusa propor empate e desistir — sem turno, não há de quem seja a desistência. Localmente
isso dura a encenação do sorteio e ninguém percebe; no online é a ida e volta do
commit-and-reveal, que é onde a janela fica longa o bastante para incomodar.

A decisão é **marcar os botões, não removê-los**: `aria-disabled`, nunca `disabled`. Controle
que some move o layout debaixo do polegar do jogador a cada rodada, e `disabled` tira o botão
da ordem de tabulação e do leitor de tela — o mesmo erro que o tabuleiro já evita. Responder a
uma proposta de empate aberta continua livre: o motor resolve isso antes de olhar para o
seletor.

---

## 7. Cards compartilháveis

Geração no cliente com Canvas, compartilhamento via Web Share API. Funciona bem no celular
e mantém o site estático. Prévia dinâmica de link (OG image) exigiria servidor — o card é
imagem compartilhada, não metadado de link.

> **Os cards esperam a paleta; a anotação não.** O card é uma imagem gerada — é embalagem, e
> depende da identidade visual definitiva para não ser refeita. A anotação abaixo é a
> substância: sai da tabela e da lista de ações, sem uma decisão visual envolvida. Ela foi
> feita primeiro, e é justamente o que dá ao card algo que valha compartilhar.

### 7.1 O card que só o Inversão pode fazer — a anotação está feita

Como a tabela conhece o valor exato de toda posição, o app **anota a partida inteira depois
que ela acaba** e aponta o lance em que o jogo virou.

Na Escolha Sorteada isso vira um **gráfico de probabilidade ao longo da partida**, com o
lance exato onde você caiu de 62% para 31%. É o que as engines de xadrez mostram, com a
diferença de que aqui o número é verdadeiro e não estimado. No Rodízio o veredito é discreto
e a frase é mais seca: "sua posição estava empatada até o lance 23".

Nenhum jogo casual mostra isso, porque nenhum é resolvido. É a ponte natural entre o jogo e
a página de análise, e o melhor motivo para alguém compartilhar. **Depende da tabela.**

**É aqui que a adjudicação do cronômetro foi parar.** Adjudicar decidia um resultado que o
jogador não tinha como conferir, e foi por isso que caiu (seção 3.4 da especificação).
Anotar não decide nada e explica o que aconteceu — mesma tabela, mesma competência exposta,
e nenhum incentivo a manipular. Por isso, ao contrário da barra ao vivo, **a anotação aparece
também contra a IA**: o que torna a barra perigosa é entregar a resposta *durante* o jogo, e
aqui o resultado já está na tela.

Duas coisas que a anotação não pode fazer, ambas encontradas por teste de mutação:

- **Não cobrar o sorteio de ninguém.** O sorteio é a única ação que ninguém escolheu, e move
  o valor bastante — da média das duas iniciativas para a que caiu. Cobrá-lo faria da moeda o
  maior erro da maioria das partidas.
- **Não cobrar a desistência.** Desistir joga o valor até o fim, e é a única ação que é
  *consequência* de estar perdendo, não causa. Cobrá-la faria "você desistiu" ser a anotação
  de toda partida desistida — verdadeiro e inútil. A guarda do sorteio não cobre esta
  sozinha: antes de um sorteio a vez já não é de ninguém, antes de uma desistência é.

### 7.2 Outros momentos

- **Vitória**, com a posição final desenhada e o número de lances
- **Vitória contra "Impossível — você abre"**, que é a conquista real do jogo (o outro nível
  impossível é matematicamente invencível — deixe isso claro no rótulo em vez de esconder)
- **Posição final como grade compacta**, 4×3 de símbolos. Compacta o bastante para caber em
  texto puro, no espírito do Wordle

---

## 8. Puzzle diário

Provavelmente o recurso de maior retorno sobre esforço do projeto, e possivelmente a
atração principal — não um acréscimo.

**Por que.** Uma partida completa exige aprender um jogo desconhecido, encarar um
adversário e investir minutos. Um puzzle exige trinta segundos, dá resposta clara, tem
motivo para voltar amanhã e é naturalmente compartilhável.

**Por que é barato.** Os puzzles são **extraídos por consulta à tabela, não escritos à mão**.
Conteúdo que nunca acaba e nunca tem erro. Nenhum jogo não resolvido consegue fazer isso.

### 8.1 Tipos que a tabela sustenta

- **"Só um lance mantém você na frente"** — o clássico, com gabarito exato.
- **"Qual peça obrigar o adversário a mexer"** — específico deste jogo e sem paralelo. A
  pergunta não é sobre a sua peça: é sobre qual das dele você quer tirar do lugar.
- **"Segure o empate"** — posições perdidas com exatamente um lance que não afunda.
- **"Escolha entre duas armadilhas"** — as posições mais afiadas do jogo, raras o bastante
  para virarem destaque.
- **Objetivos alternativos** — "leve qualquer peça ao outro lado em N lances", "chegue com
  as três sem se importar com a ordem", "o adversário está a dois lances de atravessar,
  impeça". Estes **não precisam de tabela própria**: são buscas curtas feitas na hora. Como
  modos de jogo custariam uma tabela de 5 MB cada; como puzzles, custam quase nada — e a
  inversão continua sendo o jogo, em vez de competir com uma versão dele sem a parte
  interessante.

### 8.2 Quantidade disponível

Varredura completa das tabelas convergidas, contando as posições em que a melhor escolha
supera a segunda por mais de 5 pontos percentuais:

| vantagem do melhor lance | Ponte `nbn` | Grade `bbb` | Setas `dbu` |
|---|---|---|---|
| 5–10 pontos | 27.203 | 24.744 | 23.836 |
| 10–20 | 9.685 | 8.527 | 8.671 |
| 20–30 | 1.086 | 1.168 | 1.092 |
| 30–40 | 185 | 154 | 172 |
| 40–50 | 26 | 21 | 22 |
| 50–60 | 7 | 9 | 7 |
| **total** | **38.192** | **34.623** | **33.800** |

Nenhuma posição passa de 60 pontos de vantagem em nenhum dos três: não existe lance único que
resolva a partida sozinho. Este é o conjunto bruto, medido sobre `lo`; o filtro de cruzamento
da seção 8.3 corta de 0,5% a 3,7% dele conforme o tabuleiro.

**A seleção é por cota, não uniforme.** A faixa de 5–10 pontos sozinha é 69% do conjunto, e
amostrar o total de forma espaçada produzia um puzzle diário em que quase todo dia era o dia
difícil. O `extrai.c` emite um terço de cada faixa — `sharp` 5–10, `subtle` 10–20, `clear`
acima de 20 — e avisa no `stderr` quando alguma não tem candidatos para a cota.

Exemplo real extraído (A = azul, L = laranja; o/t/q = círculo/triângulo/quadrado):

```
      Lt  Lo   .
      At   .  Lq
      Ao   .   .
       .  Aq   .
```

Solução: nomear o **triângulo** e mover para B2 — o que obriga o laranja a mexer o triângulo
dele, em A1, que é a peça que mais atrapalha o azul.

### 8.3 Como o "diário" funciona sem servidor

Todos os jogadores precisam ver o **mesmo** puzzle no mesmo dia, e o site é estático. A
solução é aritmética, não infraestrutura:

1. Uma **lista pré-selecionada** vai no build (`puzzles.json`), extraída das tabelas.
2. **São três por dia, um de cada tabuleiro.** Um só daria a alguém dois meses de uma
   topologia antes de conhecer outra, e as três topologias são o que o jogo tem de próprio.
   O custo é que um "dia" passa a ter três respostas, e tanto a página quanto o card
   compartilhado precisam dizer algo sobre isso.
3. Cada tabuleiro tem o seu **ciclo**: uma permutação fixa da própria lista, um passo por dia.
4. Fuso: use **data UTC**, não local. Senão o Brasil e o Japão veem puzzles diferentes no
   mesmo "dia" e o card compartilhado não bate com o que o amigo abriu.

Zero requisições, zero servidor, resultado idêntico para todo mundo. **Não invente um
endpoint para isso** — é o caminho natural e quebra a promessa de site estático.

> **Correção: `hash(data) % tamanho` não serve.** Era o que esta seção dizia, junto com "a
> lista é finita e repete quando esgota". A segunda frase não decorre da primeira — módulo
> sorteia **com reposição**, então repete muito antes de esgotar. Medido sobre as 180 que
> vão no build hoje:
>
> | | `% tamanho` | ciclo |
> |---|---|---|
> | primeira repetição | **dia 51** | dia 181 |
> | distintos em 180 dias | 110 de 180 | 180 de 180 |
> | nunca sorteados em 2 anos | 6 | 0 |
> | mais repetido em 2 anos | 9 vezes | 5 |
>
> Para um recurso cuja promessa inteira é "amanhã tem outro", isso é defeito. O ciclo custa o
> mesmo, a ordem continua parecendo arbitrária, e nenhum puzzle repete antes de todos terem
> aparecido. Cada tabuleiro tem semente própria, senão a mesma posição de cada lista sairia
> no mesmo dia para sempre.

**Tamanho do arquivo definitivo: um ano.** 365 por tabuleiro, 1.095 no total, ~250 KB no
bundle contra 41 KB hoje. O conjunto bruto tem 106 mil posições qualificadas, então é só
regerar; e como o arquivo está no bundle, qualquer um pode ler os puzzles futuros. Para
portfólio isso é irrelevante — não vale a complexidade de ofuscar.

### 8.4 O que faz alguém voltar

Praticar não é incentivo. O que este jogo tem e quase nenhum puzzle tem é **resposta exata**:
a posição está resolvida, então errar não devolve "errado", devolve *quanto custou* em pontos
de probabilidade de vitória. Tentativa vira medida, e é a mesma decisão que decide a partida
de verdade — qual peça obrigar o adversário a mexer. Quem melhora no puzzle melhora no jogo.

Em cima disso, duas coisas baratas e sem servidor: **sequência de dias** e o **card
compartilhável** da seção 7, que é onde o laço social fecha — uma grade sem spoiler.

Com três por dia, a sequência precisa de definição. Guardar **duas**: dias seguidos em que
tentou os três, e dias perfeitos em que acertou os três. Um número que quebra fácil demais
desestimula, e o segundo é o que vale gabar.

> **Pendência de dado.** Dizer o custo exato de um lance *qualquer* exige a tabela daquele
> tabuleiro (5 MB) ou um `puzzles.json` mais rico. Com o arquivo atual dá para dar o número
> exato quando o jogador acerta ou joga o segundo melhor, e só "não foi o melhor" no resto.

**O arquivo:** `puzzles.json` traz **1.098 puzzles — 366 por tabuleiro**, um ano bissexto de
desafios, equilibrados em 122 de cada faixa. Gerado pelo `extrai` a partir das tabelas em
`double` convergidas a delta < 1e-9, com margens de 0,0478 a 0,5120. Regenerável com
`make puzzles.json`, e a quantidade por tabuleiro é o `POR_TAB` do Makefile.

O ciclo da seção 8.3 garante que nenhum puzzle repete antes de todos terem saído — e o ciclo
tem o tamanho da lista. Com 60 por tabuleiro, quem jogasse todo dia via repetição em dois
meses; com 366, em um ano.

**Custo no bundle:** o arquivo é importado, não buscado, então vai no pacote principal — 245
KB crus, cerca de 18 KB comprimidos, carregados por todo mundo, inclusive quem nunca abre
`/desafios`. É o preço de os desafios funcionarem offline sem nenhuma requisição a mais.
Carregá-lo sob demanda economizaria isso, mas criaria um pedaço carregado tardiamente — e a
ausência deles é o que justifica o `skipWaiting` do service worker (seção 5.1).

**Todo puzzle é conferido contra os dois limites.** Como `lo` e `hi` não se encontram — a
distância entre eles é a massa de empate, propriedade do jogo e não erro de iteração (seção
7.1 da especificação) —, publicar só o `lo` seria publicar um limite inferior como se fosse
valor. Medido, isso trocaria o melhor lance em até 0,2% das posições e erraria a margem em
até 14 pontos.

O `extrai` então exige, para cada candidato: **mesmo melhor lance** sob os dois limites,
**mesmo símbolo no segundo melhor** (é dele que sai o `question`, e ele é bem mais volátil que
o primeiro) e **margens divergindo menos de 0,02**. Os números publicados são o ponto médio
dos dois. Custo do filtro, na mesma ordem da massa de empate de cada tabuleiro:

| tabuleiro | descartados |
|---|---|
| Grade `bbb` | 0,5% |
| Setas `dbu` | 3,7% |
| Ponte `nbn` | 3,7% |

Barato sobre um conjunto de trinta mil candidatos, e elimina a ressalva em vez de
documentá-la.

Duas armadilhas de consumo, ambas descobertas por um validador que as acusou como erro:

- **`margin` não é `value − secondValue`.** Os três são arredondados em separado a partir de
  floats e divergem em até 1e-4. Use `margin`; não recalcule.
- **`pass: true` é jogada, não dado faltando.** É nomear uma peça sem lance legal, passando de
  propósito para obrigar o adversário a mover aquele símbolo; aí `to` é `null`. São 28 dos 360
  lances gravados, contando os segundos melhores. Nunca `-1`: uma casa fora da faixa 0–11
  atravessa um tipo `Cell` sem ninguém perceber, enquanto `null` obriga o consumidor a tratar.

Formato de cada puzzle, também documentado em `_about` dentro do próprio arquivo:

```json
{"blue":[0,5,9], "orange":[2,1,7],
 "best":{"symbol":"triangle","to":4,"pass":false},
 "second":{"symbol":"circle","to":3,"pass":false},
 "value":0.4651, "secondValue":0.2883, "margin":0.1768,
 "question":"piece", "tier":"subtle"}
```

`blue` e `orange` são as casas de círculo, triângulo e quadrado, nessa ordem. O jogador tem a
iniciativa e joga com o azul; `value` e `secondValue` são P(azul vence) do melhor e do
segundo melhor lance. O campo `question` separa as duas perguntas da seção 8.1:

- `"piece"` — os dois melhores lances usam peças diferentes, então a pergunta é **qual peça
  nomear** (156 dos 180)
- `"destination"` — usam a mesma peça, então a pergunta é **para onde movê-la** (24 dos 180)

Sem esse campo a interface não sabe qual das duas está perguntando. `tier` vem das faixas
absolutas de `margin` da seção 8.2.

**Chaves e valores dos JSON são em inglês**, seguindo a convenção da seção 2.1 — eles viram
tipos TypeScript. Os documentos continuam em português; os artefatos, não.

**Peso na interface.** Vale considerar peso igual ao da partida na raiz, em vez de um item de
menu. Decisão consciente, não por inércia: o jogo é a coisa criada, mas o puzzle é a porta de
entrada mais provável.

**O que não existe:** puzzles do tipo "vence em N lances". Distância não existe com acaso.
Eles continuam disponíveis no Rodízio, que tem veredito discreto e distância.

**Depende da tabela** (passo 5 da seção 11).

---

## 9. Barra de avaliação — feita

Opcional e **desligada por padrão**. Mostra quem está ganhando em tempo real — como as
engines de xadrez, mas com verdade absoluta em vez de estimativa, porque vem da tabela. Na
Escolha Sorteada ela é uma barra contínua de probabilidade; no Rodízio, três estados
discretos e a distância em lances. Renderizar o segundo como porcentagem seria inventar uma
precisão que a tabela não tem.

Ligada, vira ferramenta de aprendizado. Desligada, preserva a tensão.

**Restrição obrigatória:** contra a IA ela é o mesmo oráculo do empate (seção 3.4 da
especificação do jogo) — resposta exata que o jogador não conquistou, entregue no meio da
partida. Liberada apenas em humano contra humano.

> **A checagem é nos assentos, não no ajuste.** Ligar a barra em dois jogadores e voltar para
> a IA com o interruptor ligado é exatamente como essa restrição seria contornada, então o
> que a interface consulta é quem está sentado. Há teste de mutação para isso.
>
> E o controle **aparece** contra a IA, marcado em vez de escondido: um controle que some
> nunca conta a ninguém que o recurso existe, e o motivo de estar travado vale ser lido.

**Depende da tabela** — sem ela não há nada honesto a desenhar, e a barra simplesmente não
aparece.

A leitura vem do mesmo `assess` que a IA usa para escolher, exposto em vez de duplicado: uma
segunda implementação de "quanto vale esta posição" seria uma segunda chance de errar a
armadilha do valor absoluto contra o relativo (seção 2.4).

---

## 10. A página de análise

**É o diferencial do projeto.** Nenhum outro jogo obscuro na internet vem com prova
computacional. Vale mais que qualquer recurso do jogo em si, e é o que transforma "site com
um joguinho" em "alguém que sabe o que está fazendo".

Boa parte do conteúdo já está escrita na seção 8 da especificação do jogo — é recortar e
ilustrar:

- **O teorema do estacionamento**, com um tabuleiro interativo demonstrando a peça parada
  que empata a partida
- **As variantes descartadas** e por que cada uma morreu — inclusive as três primeiras ideias
  do próprio autor
- **A escala da escolha**: rodízio 12,9% de empates, ordem livre 90,6%, escolha alternada
  99,7%, escolha sorteada 0,03%–2,6%. Três doses da mesma causa, e a descoberta de que trocar
  alternância por sorteio é o que separa um jogo morto de um vivo. As duas grandezas não são
  a mesma coisa e a página precisa dizer isso (seção 8.3 da especificação)
- **A ressurreição dos tabuleiros**: todos os desenhos descartados voltam a funcionar sob a
  mecânica nova, incluindo o primeiro rascunho do projeto
- **O trilema dos alvos**, com a prova
- **Os números**: 1.330.560 posições, 283 lances de profundidade no Rodízio, ~50/50 nos três
  tabuleiros na Escolha Sorteada
- **A limitação honesta**: trapaça possível no sorteio online, e por que o Rodízio é imune

Selo no rodapé do jogo: *verificado por busca exaustiva*, ligando para cá.

---

## 11. Ordem de construção

Nada de plataforma antes do jogo estar jogável no celular.

1. **Motor** + testes unitários + **oráculos** (seção 2.5). Sem UI.
2. **Tabuleiro jogável**, humano contra humano local. Já com "lado A / lado B", nunca "eu
   sou o de baixo". **Inclui desde já:** navegação por teclado, modo sem cor, e registro
   local do número de lances.
3. **IA de busca** — serve as duas mecânicas e os três tabuleiros, e destrava o jogo solo.
4. **PWA**: instalável, offline, partida salva localmente. *Feito* — manifesto, ícones,
   service worker e restauração da partida estão nas seções 5.1 e 5.2. O **limite de lances**
   entrou aqui também (seção 13), porque virou a única garantia de que a partida termina.
5. **Tabelas de solução**: geração offline, download sob demanda, níveis calibrados.
   *Feito.* As cinco tabelas foram geradas e verificadas (seção 2.7), o leitor recusa em vez
   de adivinhar (2.6), o download guarda em cache próprio (5) e o controlador troca busca por
   consulta. Os dois níveis sem erro fixam a abertura e o assento, que é o que separa
   *Insano* de *Impossível* (especificação 6).
6. **`/regras` e `/analise`.** *Feito, e antes da hora:* a `/regras` foi antecipada porque
   o teste com pessoas pediu, e a `/analise` na sequência.
7. **Puzzle diário** e **barra de avaliação**. *Feito.* São três desafios por dia, um de
   cada tabuleiro, em `/desafios`, com sequência guardada no aparelho (seções 8.3 e 8.4); a
   barra está na seção 9, desligada por padrão e só entre dois humanos. A **anotação
   pós-jogo** do passo 8 também já saiu (seção 7.1) — ela não dependia da paleta.
8. **Cards compartilháveis**, incluindo a anotação pós-jogo.
9. **Multiplayer por código.**

**O passo 3 já entrega um jogo completo.** A partir dele existe algo publicável e testável
com pessoas. Tudo depois é melhoria.

**Três coisas entram no passo 2, não no fim.** Teclado e modo sem cor custam pouco enquanto
o tabuleiro está sendo construído e viram retrabalho depois, porque mexem em como as peças
são renderizadas e selecionadas. O registro local de lances custa algumas linhas e só serve
se estiver desde o lançamento — os primeiros jogadores são os mais informativos, e são
justamente os que se perdem se ele chegar tarde.

**O passo 5 é a única dependência externa** e trava cinco recursos: níveis calibrados,
puzzle diário, barra de avaliação e anotação pós-jogo dos cards. Como as tabelas são geradas
está na seção 2.4. Até existirem, o jogo funciona inteiro com a IA de busca e os níveis viram
profundidade de busca.

**O multiplayer é o último passo por dependência, não por dúvida.** Ele exige o resto de pé,
é o mais caro em casos de borda, e a partir dele toda iteração passa a exigir dois clientes
abertos. Nada disso o tira do v1 — ver seção 6.2.

---

## 12. Som

**Efeitos sim, música não.** Cinco deixas curtas — pegar a peça, ela pousar, a moeda cair,
vitória, derrota —, todas **sintetizadas com a Web Audio API** em vez de tocadas de arquivo.

O motivo é orçamento: um punhado de osciladores custa **zero byte**, não precacheia, não
busca e não dá 404. Num projeto onde a instalação tem que ser leve e já há dezenas de
megabytes de tabelas disputando o mesmo espaço (seção 5), áudio em arquivo seria a segunda
maior classe de assets, atrás só delas.

**Música de fundo foi decidida contra, não esquecida.** Seria o maior arquivo do projeto, é a
primeira coisa que se desliga num jogo abstrato de sessão longa, e um link de portfólio que
começa a tocar é um link aberto no trabalho com o volume alto. O navegador ainda bloquearia o
início automático até haver gesto, então nem o efeito pretendido sairia de graça.

**Ligado por padrão, a meio volume.** Efeito só dispara em resposta a algo que o jogador fez,
e o navegador mantém o contexto de áudio suspenso até o primeiro gesto — então o sorteio de
abertura e o primeiro lance da IA são engolidos, e o primeiro som que alguém ouve é resposta
ao próprio clique. Com música a conta seria outra.

**Som nunca é o único canal**, pela mesma regra da cor (especificação 2): toda deixa marca um
momento que já tem canal visual e escrito. Sem som não se perde informação, só textura — e
sem Web Audio disponível o jogo segue funcionando, com teste para isso.

---

## 13. Limite de lances

Quem cria a partida define um teto de ações, no máximo 600. Alcançado sem ninguém completar
as três peças, é empate. O contador fica visível a cada jogada.

O máximo é 600 e não 500 porque o teto tem que caber o jogo mais longo que o solucionador
prova: Rodízio no Grade, aberto pelo quadrado, é vitória do segundo jogador em **524 lances**.
Com 500 o app chamaria de empate uma partida que ele sabe estar ganha. O padrão continua em
500 — partidas humanas terminaram entre 119 e 164 ações, e a linha de 524 é entre dois
jogadores perfeitos, o que só existe com as tabelas e "Impossível" dos dois lados.

**É a única coisa que garante que toda partida termina** — mais importante desde que o
empate por repetição virou opcional. Nenhum relógio garante isso: quem joga rápido nunca fica
sem tempo, e com incremento o relógio cresce.

O raciocínio completo de por que o cronômetro caiu está na seção 3.4 da especificação. Em
resumo: adjudicar a posição premiava quem estivesse à frente por parar de jogar, e produzia
um resultado que o jogador não tem como conferir.

**O que isso apaga do projeto:** a sincronização de tempo no online. Não há mais relógio para
os dois clientes discordarem sobre, nem valor de tempo viajando com a ação, nem margem de
tolerância a resolver. Um subsistema inteiro deixou de existir.

**O que continua necessário no online:** detectar quem sumiu. Isso é presença, não regra de
jogo, e teria que existir com ou sem cronômetro — ver seção 6.4.

---

## 14. Pendências

- [x] **O Inversão foi jogado, e se sustenta.** Testado com pessoas, em experiências e
      durações diferentes: o jogo prende e é bom. Era a pendência mais importante do projeto
      e a única não computável — toda a análise provava que ele não estava quebrado, não que
      valesse a pena.
- [x] **A página de regras existe, e saiu antes do previsto.** Veio do teste com pessoas:
      quem joga entende *o que* fazer pelo tabuleiro, mas queria saber **por quê** — que há
      um sorteio, o que separa as mecânicas, por que às vezes se passa a vez. É a `/regras`
      do passo 6, antecipada, e segue a regra da seção 4: referência para quem procurar,
      nunca pré-requisito. Falta a `/analise` para fechar o passo.
- [x] **Os três tabuleiros produzem experiências distintas — confirmado.** Cada um provou ter
      valor próprio no teste com pessoas: modos diferentes de jogar e de pensar. Nenhum é
      cortado, e as cinco combinações ficam.

      Vale registrar que a única métrica que os separava previa isso. O perfil estrutural os
      dá como quase idênticos; a **massa de empate** vai de 0,025% no Grade a 2,61% na Ponte,
      duas ordens de grandeza, e a hipótese era que a Ponte parecesse mais travada. A métrica
      virou experiência.
- [x] **As cinco tabelas de produção foram geradas e conferidas.** As da Escolha Sorteada
      convergiram a delta < 1e-9 — 1745 sweeps no Grade, 1802 no Setas e 3599 na Ponte, que é
      o caso apertado. As do Rodízio saíram exatas de uma vez. Os três limites somam 1,00000
      exato com os seus superiores, o que é a simetria de rotação aparecendo num solucionador
      que não sabe dela.
- [ ] **Regerar `puzzles.json` para um ano.** Hoje são 180 (60 por tabuleiro, 60 dias). O
      alvo da seção 8.3 é 365 por tabuleiro, ~250 KB no bundle. O conjunto bruto tem 106 mil
      posições qualificadas, então é só rodar.
- [ ] **`git init`.** O projeto ainda não é um repositório.
- [ ] **Acabamento visual do tabuleiro.** Peças, encaixes e faixa central são funcionais mas
      ainda são andaime. Fazer junto com a paleta (item abaixo): retocar cor e forma antes
      dela existir é fazer duas vezes.

      *Não confundir com legibilidade da mecânica* — a encenação do sorteio e o telegrafo do
      lance da IA não dependem de paleta e já estão feitos, porque são o que torna as regras
      visíveis, não o que as deixa bonitas.
- [x] **Endereço definitivo, sem custo.** `inversao.luizfreitas.com.br`, subdomínio de um
      domínio que já existia. A ideia de registrar um domínio próprio foi descartada: não se
      justifica para um jogo só, e um subdomínio pessoal serve melhor num portfólio.

      A rota `workers.dev` foi desligada — dois endereços servindo a mesma coisa confundem
      quem chega e contam como conteúdo duplicado para busca.
- [x] **Logo aplicado.** O ícone é o círculo invertido — a marca *é* o teorema, e há teste
      que gira o PNG 180° e exige a troca de cores. O ciclo da seção 5 ficou como marca cheia
      ao lado do nome, trocando de cor com ele.
- [ ] **Paleta final.** As seis cores continuam sendo as primeiras que entraram e ninguém
      voltou nelas. É o que falta para os cards do passo 8, que são imagem gerada.
- [x] **Ritmo medido, e o receio não se confirmou.** As partidas humanas terminaram entre
      **119 e 164 ações**, não nos ~20 lances que fariam o erro ser decisivo cedo demais. O
      registro local de lances existia exatamente para produzir esse número, e produziu.

      A observação sobre o Rodízio dar sensação de arrasto — esperar dois turnos pela peça
      que se quer — segue sem medição, porque a raiz abre na Escolha Sorteada.
