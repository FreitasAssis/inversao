/* Inversao — gerador de oraculos de verificacao.
 *
 * Produz oraculos.json para servir de fixture aos testes do motor em TypeScript.
 * Implementacao independente, escrita a partir da especificacao.
 *
 *   cd tools && make oraculos.json      (escreve ../data/oraculos.json)
 *
 * Quatro oraculos, que pegam classes diferentes de bug:
 *   1. perft (contagem de nos por profundidade)  -> geracao de lances
 *   2. posicoes distintas por profundidade       -> modelagem de estado
 *   3. passeio deterministico                    -> ciclo, passe, alternancia
 *   4. ordem do codec (samples + checksum)       -> enumeracao divergente
 *
 * Cobre as cinco combinacoes de lancamento: Rodizio no Grade e no Setas, Escolha
 * Sorteada nos tres tabuleiros.
 *
 * Nada aqui usa aleatoriedade: as duas implementacoes tem de concordar exatamente.
 * No modo Escolha Sorteada o passeio usa iniciativa ALTERNADA — que nao e a regra do
 * jogo, mas exercita a mesma geracao de lances e as jogadas duplas sem depender de
 * sorteio. O perft desse modo trata o sorteio como um no de acaso explicito com dois
 * ramos, o que tambem e determinístico de enumerar.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define NC 12
#define NPOS 665280L          /* 12P6 */

static const char *NOME[NC] = {"A1","A2","A3","B1","B2","B3","C1","C2","C3","D1","D2","D3"};
static const char *SIM[3]   = {"circle","triangle","square"};

/* peca 0=circulo 1=triangulo 2=quadrado */
static const int INI_A[3]  = {2, 1, 0};       /* azul:    circulo A3, triangulo A2, quadrado A1 */
static const int INI_L[3]  = {9, 10, 11};     /* laranja: circulo D1, triangulo D2, quadrado D3 */
static const int ALVO_A[3] = {9, 11, 10};     /* ciclo B */
static const int ALVO_L[3] = {2, 0, 1};

static const int ABERTURA_RODIZIO = 2;        /* abre pelo quadrado */

/* ---------------------------------------------------------------- tabuleiro */
static int adj[NC][6], nadj[NC];

static void monta(const char *d){
    static const int und[14][2] = {
        {0,1},{1,2},{3,4},{4,5},{6,7},{7,8},{9,10},{10,11},
        {0,3},{1,4},{2,5},{6,9},{7,10},{8,11}
    };
    static const int mid[3][2] = {{3,6},{4,7},{5,8}};
    for(int i=0;i<NC;i++) nadj[i]=0;
    for(int k=0;k<14;k++){
        int a=und[k][0], b=und[k][1];
        adj[a][nadj[a]++]=b; adj[b][nadj[b]++]=a;
    }
    for(int c=0;c<3;c++){
        int a=mid[c][0], b=mid[c][1];
        if(d[c]=='d'||d[c]=='b') adj[a][nadj[a]++]=b;
        if(d[c]=='u'||d[c]=='b') adj[b][nadj[b]++]=a;
    }
    for(int i=0;i<NC;i++) adj[i][nadj[i]]=-1;
}

/* ------------------------------------------------------------------- codec */
static int *compact;                 /* esparso -> compacto */
static unsigned char (*cells)[6];    /* compacto -> 6 casas */

static long sparse6(const int *a, const int *b){
    return (((((long)a[0]*NC + a[1])*NC + a[2])*NC + b[0])*NC + b[1])*NC + b[2];
}

static long constroi_codec(void){
    compact = malloc(2985984L*sizeof(int));
    for(long i=0;i<2985984L;i++) compact[i] = -1;
    cells = malloc(NPOS*6);
    long np = 0; int a[3], b[3];
    for(a[0]=0;a[0]<NC;a[0]++) for(a[1]=0;a[1]<NC;a[1]++){ if(a[1]==a[0])continue;
    for(a[2]=0;a[2]<NC;a[2]++){ if(a[2]==a[0]||a[2]==a[1])continue;
    for(b[0]=0;b[0]<NC;b[0]++){ if(b[0]==a[0]||b[0]==a[1]||b[0]==a[2])continue;
    for(b[1]=0;b[1]<NC;b[1]++){ if(b[1]==a[0]||b[1]==a[1]||b[1]==a[2]||b[1]==b[0])continue;
    for(b[2]=0;b[2]<NC;b[2]++){ if(b[2]==a[0]||b[2]==a[1]||b[2]==a[2]||b[2]==b[0]||b[2]==b[1])continue;
        compact[sparse6(a,b)] = (int)np;
        for(int t=0;t<3;t++){ cells[np][t]=a[t]; cells[np][3+t]=b[t]; }
        np++;
    }}}}}
    return np;
}

static int venceu(long p, int jog){
    const unsigned char *cl = cells[p];
    const int *al = jog ? ALVO_L : ALVO_A;
    const unsigned char *q = jog ? cl+3 : cl;
    return q[0]==al[0] && q[1]==al[1] && q[2]==al[2];
}
static int acabou(long p){ return venceu(p,0) ? 1 : venceu(p,1) ? 2 : 0; }

/* destinos legais da peca i do jogador j; devolve quantidade */
static int destinos(long p, int j, int i, int *out){
    const unsigned char *cl = cells[p];
    int oc=0; for(int k=0;k<6;k++) oc |= 1<<cl[k];
    int n=0, from = cl[j*3+i];
    for(const int *q=adj[from]; *q>=0; q++) if(!(oc & (1<<*q))) out[n++] = *q;
    return n;
}

static long move(long p, int j, int i, int para){
    int a[3], b[3];
    for(int t=0;t<3;t++){ a[t]=cells[p][t]; b[t]=cells[p][3+t]; }
    if(j==0) a[i]=para; else b[i]=para;
    return compact[sparse6(a,b)];
}

/* ============================================================== RODIZIO ====
 * estado = posicao, vez (0/1), ciclo (0/1/2)
 * chave  = p*6 + vez*3 + ciclo
 */
#define KR(p,v,c) ((p)*6L + (v)*3 + (c))

static long *nivel_r, *prox_r; static unsigned char *visto_r;

static void perft_rodizio(int prof_max, long *nos, long *dist){
    long n = 0;
    nivel_r[n++] = KR(compact[sparse6(INI_A,INI_L)], 0, ABERTURA_RODIZIO);
    for(int d=0; d<prof_max; d++){
        long m = 0;
        memset(visto_r, 0, NPOS*6);
        for(long k=0;k<n;k++){
            long s = nivel_r[k], p = s/6; int v=(int)((s%6)/3), c=(int)(s%3);
            if(acabou(p)) continue;
            int dst[6], nd = destinos(p, v, c, dst);
            int pc = (c+1)%3;
            if(nd==0){ prox_r[m++] = KR(p, 1-v, pc); }
            else for(int t=0;t<nd;t++) prox_r[m++] = KR(move(p,v,c,dst[t]), 1-v, pc);
        }
        nos[d] = m;
        long u = 0;
        for(long k=0;k<m;k++) if(!visto_r[prox_r[k]]){ visto_r[prox_r[k]]=1; u++; }
        dist[d] = u;
        memcpy(nivel_r, prox_r, m*sizeof(long)); n = m;
        if(!n) { for(int e=d+1;e<prof_max;e++){nos[e]=0;dist[e]=0;} break; }
    }
}

/* ====================================================== ESCOLHA SORTEADA ====
 * fase 0      = no de acaso (sorteia a iniciativa): 2 ramos
 * fase 1+ch   = quem tem a iniciativa nomeia a peca e move
 * fase 3+ch*3+i = o adversario responde com a peca i
 * chave = p*10 + fase
 */
#define KS(p,f) ((p)*10L + (f))

static long *nivel_s, *prox_s; static unsigned char *visto_s;

static void perft_sorteio(int prof_max, long *nos, long *dist){
    long n = 0;
    nivel_s[n++] = KS(compact[sparse6(INI_A,INI_L)], 0);
    for(int d=0; d<prof_max; d++){
        long m = 0;
        memset(visto_s, 0, NPOS*10);
        for(long k=0;k<n;k++){
            long s = nivel_s[k], p = s/10; int f = (int)(s%10);
            if(acabou(p)) continue;
            if(f==0){                                   /* no de acaso */
                prox_s[m++] = KS(p,1); prox_s[m++] = KS(p,2);
            } else if(f<3){                             /* nomeia e move */
                int ch = f-1;
                for(int i=0;i<3;i++){
                    int dst[6], nd = destinos(p, ch, i, dst);
                    if(nd==0) prox_s[m++] = KS(p, 3+ch*3+i);
                    else for(int t=0;t<nd;t++) prox_s[m++] = KS(move(p,ch,i,dst[t]), 3+ch*3+i);
                }
            } else {                                    /* responde */
                int ch = (f-3)/3, i = (f-3)%3, mv = 1-ch;
                int dst[6], nd = destinos(p, mv, i, dst);
                if(nd==0) prox_s[m++] = KS(p, 0);
                else for(int t=0;t<nd;t++) prox_s[m++] = KS(move(p,mv,i,dst[t]), 0);
            }
        }
        nos[d] = m;
        long u = 0;
        for(long k=0;k<m;k++) if(!visto_s[prox_s[k]]){ visto_s[prox_s[k]]=1; u++; }
        dist[d] = u;
        memcpy(nivel_s, prox_s, m*sizeof(long)); n = m;
        if(!n){ for(int e=d+1;e<prof_max;e++){nos[e]=0;dist[e]=0;} break; }
    }
}

/* ------------------------------------------------- passeios deterministicos */
static void tabuleiro_json(long p){
    printf("{\"blue\":[%d,%d,%d],\"orange\":[%d,%d,%d]}",
        cells[p][0],cells[p][1],cells[p][2],cells[p][3],cells[p][4],cells[p][5]);
}

/* Rodizio: sempre o PRIMEIRO destino disponivel na ordem de adjacencia — que
 * nao e a menor casa. adj[] e montada com as arestas horizontais antes das
 * verticais, entao adj[10] e {9,11,7}. A ordem faz parte do oraculo: um motor
 * que gere vizinhos em outra ordem escolhe outro destino e diverge aqui. */
static void passeio_rodizio(int n_lances){
    long p = compact[sparse6(INI_A,INI_L)];
    int v = 0, c = ABERTURA_RODIZIO;
    printf("[");
    for(int i=0;i<n_lances;i++){
        if(acabou(p)){ printf("%s{\"ply\":%d,\"event\":\"fim\",\"winner\":%d}",
                              i?",":"", i, acabou(p)-1); break; }
        int dst[6], nd = destinos(p, v, c, dst);
        int esc = nd ? dst[0] : -1;
        printf("%s{\"ply\":%d,\"side\":\"%s\",\"symbol\":\"%s\",\"from\":\"%s\",\"to\":\"%s\",\"legal\":[",
               i?",":"", i, v?"orange":"blue", SIM[c], NOME[cells[p][v*3+c]],
               esc<0?"PASSE":NOME[esc]);
        for(int t=0;t<nd;t++) printf("%s\"%s\"", t?",":"", NOME[dst[t]]);
        printf("]}");
        if(esc>=0) p = move(p, v, c, esc);
        v = 1-v; c = (c+1)%3;
    }
    printf("]");
}

/* Escolha Sorteada: iniciativa ALTERNADA (comeca no azul); a peca nomeada percorre
 * circulo -> triangulo -> quadrado por rodada, caindo na proxima que tenha lance
 * legal; destino = primeiro na ordem de adjacencia (ver passeio_rodizio). Sem
 * aleatoriedade.
 *
 * O rodizio da peca nomeada existe so no oraculo: nomear sempre a primeira peca
 * com lance legal faz o passeio entrar num ciclo de duas rodadas e exercitar
 * quase nada do motor. */
static void passeio_sorteio(int n_rodadas){
    long p = compact[sparse6(INI_A,INI_L)];
    int ch = 0;
    printf("[");
    int primeiro = 1;
    for(int r=0;r<n_rodadas;r++){
        if(acabou(p)){ printf("%s{\"round\":%d,\"event\":\"fim\",\"winner\":%d}",
                              primeiro?"":",", r, acabou(p)-1); break; }
        /* peca nomeada: rodizio por rodada, caindo na proxima com lance legal */
        int esc_i = r % 3, dst[6], nd = 0;
        for(int t=0;t<3;t++){ int i = (r + t) % 3; int d2[6]; int k = destinos(p,ch,i,d2);
            if(k){ esc_i=i; nd=k; memcpy(dst,d2,sizeof(d2)); break; } }
        if(!nd) nd = destinos(p, ch, (esc_i = r % 3), dst);
        int para = nd ? dst[0] : -1;
        printf("%s{\"round\":%d,\"initiative\":\"%s\",\"symbol\":\"%s\",",
               primeiro?"":",", r, ch?"orange":"blue", SIM[esc_i]);
        primeiro = 0;
        printf("\"chooserMove\":{\"from\":\"%s\",\"to\":\"%s\"}",
               NOME[cells[p][ch*3+esc_i]], para<0?"PASSE":NOME[para]);
        if(para>=0) p = move(p, ch, esc_i, para);
        if(!acabou(p)){
            int d3[6], k = destinos(p, 1-ch, esc_i, d3);
            int pr = k ? d3[0] : -1;
            printf(",\"responderMove\":{\"from\":\"%s\",\"to\":\"%s\",\"legal\":[",
                   NOME[cells[p][(1-ch)*3+esc_i]], pr<0?"PASSE":NOME[pr]);
            for(int t=0;t<k;t++) printf("%s\"%s\"", t?",":"", NOME[d3[t]]);
            printf("]}");
            if(pr>=0) p = move(p, 1-ch, esc_i, pr);
        }
        printf(",\"positionAfter\":"); tabuleiro_json(p); printf("}");
        ch = 1-ch;
    }
    printf("]");
}

/* --------------------------------------------------------------------- main */
int main(void){
    long np = constroi_codec();

    nivel_r = malloc(4000000L*sizeof(long)); prox_r = malloc(4000000L*sizeof(long));
    nivel_s = malloc(4000000L*sizeof(long)); prox_s = malloc(4000000L*sizeof(long));
    visto_r = malloc(NPOS*6); visto_s = malloc(NPOS*10);

    const char *codigos[3] = {"nbn","bbb","dbu"};
    const char *rotulos[3] = {"Ponte","Grade","Setas"};

    printf("{\n");
    printf("  \"_about\": \"Oraculos de verificacao do Inversao. Gerados por implementacao independente em C. Nenhum valor depende de aleatoriedade.\",\n");
    /* Contagem e bijecao NAO bastam: qualquer enumeracao das 665280 colocacoes
     * tem o mesmo total e continua sendo bijecao, entao um motor que enumere em
     * outra ordem passaria batido — e cada consulta a tabela devolveria o valor
     * de outra posicao. O que prende a ORDEM sao as amostras e o checksum. */
    printf("  \"codec\": {\n");
    printf("    \"_sobre\": \"samples e checksum prendem a ORDEM da enumeracao, nao so a contagem. checksum = FNV-1a 32 bits sobre as 6 casas de cada colocacao, na ordem do indice.\",\n");
    printf("    \"distinctPlacements\": %ld, \"expected\": 665280,\n", np);
    {
        unsigned int h = 2166136261u;
        for(long i=0;i<np;i++)
            for(int k=0;k<6;k++){ h ^= cells[i][k]; h *= 16777619u; }
        printf("    \"checksum\": %u,\n", h);
    }
    {
        const long amostra[5] = {0, 1, 116304, 332640, 665279};
        printf("    \"samples\": [");
        for(int s=0;s<5;s++){
            long i = amostra[s];
            printf("%s\n      {\"index\": %ld, \"blue\": [%d,%d,%d], \"orange\": [%d,%d,%d]}",
                   s?",":"", i, cells[i][0],cells[i][1],cells[i][2],
                   cells[i][3],cells[i][4],cells[i][5]);
        }
        printf("\n    ]\n  },\n");
    }

    /* --- Rodizio: Grade e Setas, que e onde ele produz jogo vivo.
     * Na Ponte o Rodizio empata (34,7%) e fica fora do lancamento, logo fora
     * do oraculo tambem. --- */
    {
        const char *rod_cod[2] = {"bbb","dbu"};
        const char *rod_rot[2] = {"Grade","Setas"};
        printf("  \"rodizio\": {\n    \"opening\": \"square\",\n    \"boards\": {\n");
        for(int b=0;b<2;b++){
            monta(rod_cod[b]);
            long nos[20], dist[20];
            perft_rodizio(20, nos, dist);
            printf("      \"%s\": {\n        \"label\": \"%s\",\n", rod_cod[b], rod_rot[b]);
            printf("        \"perftNodes\": [");
            for(int d=0; d<20; d++) printf("%s%ld", d?",":"", nos[d]);
            printf("],\n        \"perftDistinctPositions\": [");
            for(int d=0; d<20; d++) printf("%s%ld", d?",":"", dist[d]);
            printf("],\n        \"walk\": ");
            passeio_rodizio(24);
            printf("\n      }%s\n", b<1?",":"");
        }
        printf("    }\n  },\n");
    }

    /* --- Escolha Sorteada: os tres tabuleiros --- */
    printf("  \"escolhaSorteada\": {\n");
    printf("    \"_perft\": \"O sorteio da iniciativa e um no de acaso explicito com 2 ramos. Ciclo de fases: acaso -> nomeia+move -> responde -> acaso.\",\n");
    printf("    \"_walk\": \"Iniciativa ALTERNADA comecando no azul (blue) (nao e a regra do jogo; serve para eliminar aleatoriedade do oraculo).\",\n");
    printf("    \"boards\": {\n");
    for(int b=0;b<3;b++){
        monta(codigos[b]);
        long nos[13], dist[13];
        perft_sorteio(13, nos, dist);
        printf("      \"%s\": {\n        \"label\": \"%s\",\n", codigos[b], rotulos[b]);
        printf("        \"perftNodes\": [");
        for(int d=0; d<13; d++) printf("%s%ld", d?",":"", nos[d]);
        printf("],\n        \"perftDistinctPositions\": [");
        for(int d=0; d<13; d++) printf("%s%ld", d?",":"", dist[d]);
        printf("],\n        \"walk\": ");
        passeio_sorteio(12);
        printf("\n      }%s\n", b<2?",":"");
    }
    printf("    }\n  }\n}\n");
    return 0;
}
