/* Inversao — solucionador da ESCOLHA SORTEADA (iteracao de valor).
 *
 * Jogo estocastico: o valor de uma posicao e P(azul vence), nao um veredito.
 * Resolve por iteracao de valor e exporta a tabela consumida pelo jogo.
 *
 *   ./solver-sorteio <lo|hi> <sweeps> <codigo_tabuleiro> [saida.bin]
 *   ./solver-sorteio lo 3000 dbu tabela-dbu-sorteio.bin
 *
 * Rode 'lo' e 'hi' separadamente: convergem por baixo e por cima, tratando o
 * jogo infinito como derrota e como vitoria do azul. A LARGURA ENTRE ELES NAO
 * E ERRO DE ITERACAO — e a massa de empate estrutural do tabuleiro, e sobrevive
 * a convergencia completa. Medida: 2,61% na Ponte, 1,27% no Setas, 0,025% no
 * Grade. Itere ate delta < 1e-9 e ela nao encolhe.
 *
 * PRECISAO: os acumuladores sao 'double', nao 'float', e isso e obrigatorio.
 * Em float de 32 bits o menor incremento representavel perto de 0,5 e ~6e-8,
 * entao 'maxd < 1e-9' so dispara quando maxd e exatamente zero — ou seja, o
 * alvo de 1e-9 e inalcancavel e a mensagem "convergiu" significa estagnacao na
 * resolucao do tipo, nao convergencia. Custa o dobro de memoria durante a
 * geracao; a tabela de saida continua 1 byte por estado.
 *
 * O estado de convergencia e salvo em v_<tabuleiro>_<lo|hi>.bin a cada
 * execucao, entao da para continuar de onde parou. Checkpoints gravados pela
 * versao em float tem metade do tamanho e sao rejeitados na leitura.
 *
 * FORMATO DA TABELA
 *   cabecalho  16 bytes:  "INVS" | versao u32 | n_estados u32 | reservado u32
 *   valor      1 byte por estado: P(azul vence) quantizada, 0..255
 *
 *   indice do estado = pos*8 + escolhe*4 + fase
 *   pos     = indice compacto da colocacao das 6 pecas (12P6 = 665280)
 *   escolhe = 0 azul tem a iniciativa, 1 laranja
 *   fase    = 0 quem tem a iniciativa nomeia e move
 *             1+i o adversario responde com a peca i
 *
 * 256 niveis sao precisao de sobra para escolher lance e para calibrar erro em
 * pontos percentuais. Tamanho: ~5,3 MB por tabuleiro.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define NC 12
#define NPOS 665280L
static int adj[NC][6]; static int nadj[NC];
static void monta(const char*d){
 static const int und[14][2]={{0,1},{1,2},{3,4},{4,5},{6,7},{7,8},{9,10},{10,11},
                              {0,3},{1,4},{2,5},{6,9},{7,10},{8,11}};
 for(int i=0;i<NC;i++)nadj[i]=0;
 for(int k=0;k<14;k++){int a=und[k][0],b=und[k][1];
  adj[a][nadj[a]++]=b; adj[b][nadj[b]++]=a;}
 static const int mid[3][2]={{3,6},{4,7},{5,8}};
 for(int c=0;c<3;c++){int a=mid[c][0],b=mid[c][1];
  if(d[c]=='d'||d[c]=='b') adj[a][nadj[a]++]=b;
  if(d[c]=='u'||d[c]=='b') adj[b][nadj[b]++]=a;}
 for(int i=0;i<NC;i++) adj[i][nadj[i]]=-1;
}
static const int INI_A[3]={2,1,0}, INI_L[3]={9,10,11};
static const int ALVO_A[3]={9,11,10}, ALVO_L[3]={2,0,1};
static int *compact; static unsigned char (*cells)[6];
static int *succ;            /* [pos*6+peca]*4 + n  -> pos resultante */
static unsigned char *cnt;   /* numero de destinos; 0 = passe */
static unsigned char *fixo;  /* 0 livre, 1 azul venceu, 2 laranja venceu */
static double *A, *B;
static long sparse(const int*a,const int*b){return (((((long)a[0]*NC+a[1])*NC+a[2])*NC+b[0])*NC+b[1])*NC+b[2];}
static int venceu(const unsigned char*cl,int j){const int*al=j?ALVO_L:ALVO_A;const unsigned char*p=j?cl+3:cl;
 return p[0]==al[0]&&p[1]==al[1]&&p[2]==al[2];}

int main(int argc,char**argv){
 int hi = (argc>1 && argv[1][0]=='h');
 const char*board = argc>3? argv[3] : "dbu";
 const char*saida = argc>4? argv[4] : NULL;
 monta(board);
 long sweeps = argc>2? atol(argv[2]) : 500;
 compact=malloc(2985984L*sizeof(int)); for(long i=0;i<2985984L;i++)compact[i]=-1;
 cells=malloc(NPOS*6); long np=0; int a[3],b[3];
 for(a[0]=0;a[0]<NC;a[0]++)for(a[1]=0;a[1]<NC;a[1]++){if(a[1]==a[0])continue;
 for(a[2]=0;a[2]<NC;a[2]++){if(a[2]==a[0]||a[2]==a[1])continue;
 for(b[0]=0;b[0]<NC;b[0]++){if(b[0]==a[0]||b[0]==a[1]||b[0]==a[2])continue;
 for(b[1]=0;b[1]<NC;b[1]++){if(b[1]==a[0]||b[1]==a[1]||b[1]==a[2]||b[1]==b[0])continue;
 for(b[2]=0;b[2]<NC;b[2]++){if(b[2]==a[0]||b[2]==a[1]||b[2]==a[2]||b[2]==b[0]||b[2]==b[1])continue;
  compact[sparse(a,b)]=(int)np; cells[np][0]=a[0];cells[np][1]=a[1];cells[np][2]=a[2];
  cells[np][3]=b[0];cells[np][4]=b[1];cells[np][5]=b[2]; np++;}}}}}

 succ=malloc(NPOS*6*4*sizeof(int)); cnt=malloc(NPOS*6); fixo=calloc(NPOS,1);
 for(long p=0;p<NPOS;p++){
  const unsigned char*cl=cells[p]; int oc=0;
  for(int k=0;k<6;k++)oc|=1<<cl[k];
  if(venceu(cl,0)) fixo[p]=1; else if(venceu(cl,1)) fixo[p]=2;
  for(int j=0;j<2;j++)for(int i=0;i<3;i++){
   long key=(p*6+j*3+i); int n=0, from=cl[j*3+i];
   for(const int*q=adj[from];*q>=0;q++){ if(oc&(1<<*q))continue;
    int aa[3],bb[3]; for(int t=0;t<3;t++){aa[t]=cl[t];bb[t]=cl[3+t];}
    if(j==0)aa[i]=*q; else bb[i]=*q;
    succ[key*4+n]=compact[sparse(aa,bb)]; n++; }
   cnt[key]=(unsigned char)n; }}
 

 A=malloc(NPOS*2*sizeof(double)); B=malloc(NPOS*2*3*sizeof(double));
 char ck[64]; snprintf(ck,64,"v_%s_%s.bin",board,hi?"hi":"lo");
 FILE*f=fopen(ck,"rb");
 if(f){ /* Checkpoint truncado le lixo em silencio e a iteracao continua a partir
         * de valores invalidos — que e exatamente o tipo de erro que so aparece
         * horas depois, no numero publicado. Melhor abortar. */
        size_t la=fread(A,sizeof(double),NPOS*2,f), lb=fread(B,sizeof(double),NPOS*6,f);
        fclose(f);
        if(la!=(size_t)NPOS*2 || lb!=(size_t)NPOS*6){
         fprintf(stderr,"checkpoint %s truncado (%zu/%ld e %zu/%ld doubles).\n"
                        "Apague-o para recomecar do zero.\n", ck,la,NPOS*2,lb,NPOS*6);
         return 1; }
        printf("retomando checkpoint\n"); }
 else { double init = hi?1.0:0.0;
  for(long p=0;p<NPOS;p++){ double v = fixo[p]==1?1.0 : fixo[p]==2?0.0 : init;
   A[p*2]=A[p*2+1]=v; for(int k=0;k<6;k++) B[p*6+k]=v; } }

 double maxd=0;
 for(long it=0; it<sweeps; it++){
  maxd=0;
  /* B: fase 1 (responde com a peca i, move quem NAO escolheu) */
  for(long p=0;p<NPOS;p++){
   if(fixo[p]) continue;
   for(int ch=0;ch<2;ch++){ int mov=1-ch;
    for(int i=0;i<3;i++){
     long key=p*6+mov*3+i; int n=cnt[key];
     double best;
     if(n==0){ long q=p; best=0.5*(A[q*2]+A[q*2+1]); }
     else { best = mov==0? -1.0 : 2.0;
      for(int t=0;t<n;t++){ long q=succ[key*4+t];
       double v = fixo[q]==1?1.0 : fixo[q]==2?0.0 : 0.5*(A[q*2]+A[q*2+1]);
       if(mov==0){ if(v>best)best=v; } else { if(v<best)best=v; } } }
     long bi=(p*2+ch)*3+i;
     double d=best-B[bi]; if(d<0)d=-d; if(d>maxd)maxd=d;
     B[bi]=best; }}}
  /* A: fase 0 (escolhe e move) */
  for(long p=0;p<NPOS;p++){
   if(fixo[p]) continue;
   for(int ch=0;ch<2;ch++){
    double best = ch==0? -1.0 : 2.0;
    for(int i=0;i<3;i++){
     long key=p*6+ch*3+i; int n=cnt[key];
     double v;
     if(n==0){ v=B[(p*2+ch)*3+i]; }
     else { v = ch==0? -1.0 : 2.0;
      for(int t=0;t<n;t++){ long q=succ[key*4+t];
       double w = fixo[q]==1?1.0 : fixo[q]==2?0.0 : B[(q*2+ch)*3+i];
       if(ch==0){ if(w>v)v=w; } else { if(w<v)v=w; } } }
     if(ch==0){ if(v>best)best=v; } else { if(v<best)best=v; } }
    double d=best-A[p*2+ch]; if(d<0)d=-d; if(d>maxd)maxd=d;
    A[p*2+ch]=best; }}
  if(maxd<1e-9) { printf("convergiu em %ld sweeps\n", it+1); break; }
 }
 f=fopen(ck,"wb");
 if(!f){ perror(ck); return 1; }   /* sem checkpoint, horas de iteracao se perdem */
 fwrite(A,sizeof(double),NPOS*2,f); fwrite(B,sizeof(double),NPOS*6,f); fclose(f);
 long p0=compact[sparse(INI_A,INI_L)];
 double v0=0.5*(A[p0*2]+A[p0*2+1]);
 printf("[%s] %s: P(azul vence) = %.5f   (delta %.2e)\n", board, hi?"sup":"inf", v0, maxd);
 if(maxd>=1e-9) printf("  AVISO: ainda nao convergiu para producao (alvo delta < 1e-9)\n");
 if(saida){
  long N = NPOS*8;
  unsigned char*q = malloc(N);
  for(long p=0;p<NPOS;p++){
   for(int ch=0;ch<2;ch++){
    double v = fixo[p]==1?1.0 : fixo[p]==2?0.0 : A[p*2+ch];
    q[p*8+ch*4+0] = (unsigned char)(v*255.0+0.5);
    for(int i=0;i<3;i++){
     double w = fixo[p]==1?1.0 : fixo[p]==2?0.0 : B[(p*2+ch)*3+i];
     q[p*8+ch*4+1+i] = (unsigned char)(w*255.0+0.5);
    }}}
  FILE*o=fopen(saida,"wb");
  if(!o){ perror("saida"); return 1; }
  unsigned int cab[4]={0,1,(unsigned int)N,0};
  memcpy(&cab[0],"INVS",4);
  fwrite(cab,sizeof(unsigned int),4,o);
  fwrite(q,1,N,o); fclose(o); free(q);
  printf("  tabela escrita em %s (%ld estados, %.1f MB)\n",
         saida, N, (16.0+N)/1048576.0);
 }
 return 0; }
