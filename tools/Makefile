# Inversao — ferramentas offline.
# Nada aqui vai para o site: geram artefatos estaticos que o jogo consome.
#
# Rode a partir de tools/. Os JSON versionados vao para ../data; as tabelas
# .bin ficam aqui (grandes, reproduziveis, ignoradas pelo git) e so sao
# copiadas para ../public/data pelo alvo 'dist'.

CC      ?= gcc
CFLAGS  ?= -O2 -Wall
BOARDS   = dbu nbn bbb          # Escolha Sorteada: os tres
ROD      = dbu bbb              # Rodizio: so onde produz jogo vivo
SWEEPS  ?= 4000
# Puzzles por tabuleiro. 366 cobre um ano bissexto e divide exato por tres, que
# e o numero de faixas de dificuldade — 122 de cada, sem sobra.
POR_TAB ?= 366
DATA    ?= ../data
DIST    ?= ../public/data

BINS = solver-rodizio solver-sorteio oraculos extrai

all: $(BINS)

# Regra explicita, nao pega-tudo: '%: %.c' faz o make tentar construir
# qualquer alvo a partir de um .c homonimo, inclusive alvos que nao sao
# binarios.
$(BINS): %: %.c
	$(CC) $(CFLAGS) -o $@ $<

# ---------------------------------------------------------------- oraculos
# Fixture de verificacao do motor. Barato: rode a vontade.
$(DATA)/oraculos.json: oraculos
	./oraculos > $@

# ---------------------------------------------------------------- tabelas
# Rodizio: analise retrograda, resolve de uma vez e sai exato — nao ha
# convergencia envolvida. So Grade e Setas: na Ponte o Rodizio empata.
tabela-%-rodizio.bin: solver-rodizio
	./solver-rodizio $* $@

# Escolha Sorteada: iteracao de valor, precisa de varias passadas ate
# delta < 1e-9. O estado fica em v_<tab>_lo.bin, entao repetir o alvo
# continua de onde parou em vez de recomecar.
#
# FORCE de proposito: a tabela existir NAO significa que convergiu, e o
# fluxo documentado na secao 2.7 do projeto e rodar 'make tabelas'
# repetidamente ate o
# solver parar de avisar. Sem isso o make responde 'is up to date' na
# segunda rodada e a convergencia nunca avanca. (.PHONY nao serve aqui:
# o GNU make ignora padroes dentro de .PHONY.)
tabela-%-sorteio.bin: solver-sorteio FORCE
	./solver-sorteio lo $(SWEEPS) $* $@

FORCE:

# Limites superiores. A largura entre 'lo' e 'hi' E a massa de empate estrutural
# do tabuleiro (secao 7.1 da especificacao): ela nao encolhe por mais que se
# itere, e e resultado, nao erro.
#
# Nao viram tabela, mas o 'extrai' PRECISA deles: cada puzzle e conferido contra
# os dois limites antes de ser publicado. Por isso o checkpoint e alvo do make,
# e nao so um comando avulso.
v_%_hi.bin: solver-sorteio FORCE
	./solver-sorteio hi $(SWEEPS) $*

verifica-%: v_%_hi.bin
	@:

tabelas: $(foreach b,$(ROD),tabela-$(b)-rodizio.bin) \
        $(foreach b,$(BOARDS),tabela-$(b)-sorteio.bin)

# ---------------------------------------------------------------- puzzles
# Depende das tabelas convergidas. Regere sempre que elas mudarem.
# O bloco _about e parte do formato: documenta as convencoes que o
# consumidor precisa conhecer (ver secao 8.3 do documento do projeto).
$(DATA)/puzzles.json: extrai $(foreach b,$(BOARDS),tabela-$(b)-sorteio.bin) \
              $(foreach b,$(BOARDS),v_$(b)_hi.bin)
	@echo '{' > $@
	@printf '  "_about": "%s",\n' \
	  "Puzzles extracted from the Escolha Sorteada probability tables. The player holds the initiative (plays blue) and must name the symbol and pick the destination. value/secondValue are P(blue wins) for the best and second-best move; margin is the difference. Every puzzle is cross-checked against BOTH converged bounds: lo and hi must agree on the best move and on the second-best symbol, and their margins must agree within 0.02; the published numbers are the midpoint. This matters because lo and hi do not meet - the gap between them is the board structural draw mass, not iteration error. NOTE: value, secondValue and margin are rounded independently from the solver doubles, so value-secondValue differs from margin by up to 1e-4 - use margin, do not recompute. pass=true means the move is to name a piece with no legal move, passing on purpose to force the opponent to move that symbol; to is null in that case, never -1. question=piece when the two best moves belong to different symbols (the puzzle is which piece to name), destination when they share a symbol. tier comes from absolute margin bands: sharp 0.05-0.10, subtle 0.10-0.20, clear above 0.20." >> $@
	@echo '  "boards": [' >> $@
	@./extrai dbu Setas $(POR_TAB) >> $@ ; echo ',' >> $@
	@./extrai nbn Ponte $(POR_TAB) >> $@ ; echo ',' >> $@
	@./extrai bbb Grade $(POR_TAB) >> $@
	@echo '  ]' >> $@
	@echo '}' >> $@

# ---------------------------------------------------------------- entrega
# Copia os artefatos para onde o build do site os encontra.
# Somente 'tabela-*.bin': os v_*.bin sao estado de convergencia do solver,
# ~20 MB cada, e nao tem uso nenhum no navegador.
dist: tabelas $(DATA)/oraculos.json $(DATA)/puzzles.json
	mkdir -p $(DIST)
	cp tabela-*.bin $(DATA)/oraculos.json $(DATA)/puzzles.json $(DIST)/
	@echo "artefatos em $(DIST)"

# ---------------------------------------------------------------- publicacao
# O que o site precisa para ser publicado, e nada alem disso.
#
# Existe separado de 'dist' por um motivo que custa sete minutos: 'dist' pede
# $(DATA)/puzzles.json como *alvo*, e esse alvo depende dos limites superiores,
# que sao FORCE. Num clone limpo — que e o caso do ambiente de build do
# Cloudflare — isso dispara a convergencia dos tres 'hi' inteiros para
# reproduzir um arquivo que ja esta versionado e nao mudou.
#
# Aqui os dois JSON sao copiados como arquivos, nunca pedidos como alvos.
#
# Custo real: as tres tabelas da Escolha Sorteada, que sao FORCE de proposito
# porque a tabela existir nao significa que convergiu. Cerca de seis minutos,
# contra um teto de vinte no Pages.
publica: tabelas
	mkdir -p $(DIST)
	cp tabela-*.bin $(DIST)/
	cp $(DATA)/oraculos.json $(DATA)/puzzles.json $(DIST)/
	@echo "artefatos em $(DIST)"

limpa:
	rm -f $(BINS) *.o

# Apaga tambem o estado de convergencia: a proxima rodada recomeca do zero
# e leva horas. Use com intencao.
# Nao apaga os JSON de ../data: eles sao versionados e pequenos. So o estado
# de convergencia, que e o caro de refazer.
limpa-tudo: limpa
	rm -f *.bin

# Atalhos: 'make oraculos.json' continua funcionando de dentro de tools/.
oraculos.json: $(DATA)/oraculos.json
puzzles.json: $(DATA)/puzzles.json

.PHONY: all tabelas dist publica limpa limpa-tudo FORCE oraculos.json puzzles.json
