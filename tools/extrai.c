/* Extrai uma lista de puzzles das tabelas de probabilidade da Escolha Sorteada.
 *
 *   ./extrai <codigo_tabuleiro> <rotulo> <quantidade>
 *
 * Le os DOIS checkpoints do solver, v_<tab>_lo.bin e v_<tab>_hi.bin, e so publica
 * a posicao quando eles concordam — ver o cruzamento mais abaixo. Emite um bloco
 * JSON por tabuleiro; o Makefile costura os tres. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define NC 12
#define NPOS 665280L
static int adj[NC][6], nadj[NC];
static void monta(const char*d){
 static const int und[14][2]={{0,1},{1,2},{3,4},{4,5},{6,7},{7,8},{9,10},{10,11},
  {0,3},{1,4},{2,5},{6,9},{7,10},{8,11}};
 static const int mid[3][2]={{3,6},{4,7},{5,8}};
 for(int i=0;i<NC;i++)nadj[i]=0;
 for(int k=0;k<14;k++){int a=und[k][0],b=und[k][1];adj[a][nadj[a]++]=b;adj[b][nadj[b]++]=a;}
 for(int c=0;c<3;c++){int a=mid[c][0],b=mid[c][1];
  if(d[c]=='d'||d[c]=='b')adj[a][nadj[a]++]=b;
  if(d[c]=='u'||d[c]=='b')adj[b][nadj[b]++]=a;}}
static const char*SIM[3]={"circle","triangle","square"};
static const int ALVO_A[3]={9,11,10}, ALVO_L[3]={2,0,1};
static int*compact; static unsigned char(*cells)[6]; static unsigned char*fixo;
static long sparse6(const int*a,const int*b){return (((((long)a[0]*NC+a[1])*NC+a[2])*NC+b[0])*NC+b[1])*NC+b[2];}
static double*A,*B;      /* limite inferior */
static double*A2,*B2;    /* limite superior */

/* Le um checkpoint v_<tabuleiro>_<lo|hi>.bin para (a,b). Devolve 0 se deu certo. */
static int carrega(const char*board,const char*lado,double*a,double*b){
 char ck[64]; snprintf(ck,64,"v_%s_%s.bin",board,lado);
 FILE*f=fopen(ck,"rb");
 if(!f){ fprintf(stderr,"falta %s\n",ck); return 1; }
 /* Checkpoint curto quase sempre e um v_*.bin da versao antiga em float, que tem
  * metade do tamanho. Ler assim mesmo produz puzzles com valores sem sentido e
  * nenhum sinal de erro — melhor abortar dizendo o motivo. */
 size_t la=fread(a,sizeof(double),NPOS*2,f), lb=fread(b,sizeof(double),NPOS*6,f);
 fclose(f);
 if(la!=(size_t)NPOS*2 || lb!=(size_t)NPOS*6){
  fprintf(stderr,"%s truncado (%zu/%ld e %zu/%ld doubles).\n"
                 "Se veio da versao em float, apague e regere a tabela.\n",ck,la,NPOS*2,lb,NPOS*6);
  return 1; }
 return 0;
}

/* Melhor e segundo melhor lance do azul na posicao p, segundo a tabela (a,b).
 * Devolve o numero de opcoes; -1 nas casas de destino significa passe. */
static int avalia(long p,const double*a,const double*b,
                  double*m1,double*m2,int*bi,int*bd,int*si,int*sd){
 const unsigned char*cl=cells[p]; int oc=0;
 for(int k=0;k<6;k++)oc|=1<<cl[k];
 *m1=-1;*m2=-1;*bi=-1;*bd=-1;*si=-1;*sd=-1; int nopt=0;
 (void)a;
 for(int i=0;i<3;i++){ int teve=0;
  for(int t=0;t<nadj[cl[i]];t++){ int q=adj[cl[i]][t]; if(oc&(1<<q))continue; teve=1;
   int aa[3],bb[3]; for(int z=0;z<3;z++){aa[z]=cl[z];bb[z]=cl[3+z];}
   aa[i]=q; long r=compact[sparse6(aa,bb)];
   double v=fixo[r]==1?1.0:fixo[r]==2?0.0:b[(r*2)*3+i]; nopt++;
   if(v>*m1){ *m2=*m1; *si=*bi; *sd=*bd; *m1=v; *bi=i; *bd=q; }
   else if(v>*m2){ *m2=v; *si=i; *sd=q; } }
  if(!teve){ double v=b[(p*2)*3+i]; nopt++;
   if(v>*m1){ *m2=*m1; *si=*bi; *sd=*bd; *m1=v; *bi=i; *bd=-1; }
   else if(v>*m2){ *m2=v; *si=i; *sd=-1; } } }
 return nopt;
}
static int venceu(const unsigned char*cl,int j){const int*al=j?ALVO_L:ALVO_A;const unsigned char*p=j?cl+3:cl;
 return p[0]==al[0]&&p[1]==al[1]&&p[2]==al[2];}
int main(int argc,char**argv){
 if(argc<4){ fprintf(stderr,"uso: %s <codigo_tabuleiro> <rotulo> <quantidade>\n",argv[0]); return 2; }
 const char*board=argv[1]; const char*rot=argv[2]; int alvo_n=atoi(argv[3]);
 if(alvo_n<3){ fprintf(stderr,"quantidade minima e 3 (uma por faixa)\n"); return 2; }
 monta(board);
 compact=malloc(2985984L*sizeof(int)); for(long i=0;i<2985984L;i++)compact[i]=-1;
 cells=malloc(NPOS*6); fixo=calloc(NPOS,1); long np=0; int a[3],b[3];
 for(a[0]=0;a[0]<NC;a[0]++)for(a[1]=0;a[1]<NC;a[1]++){if(a[1]==a[0])continue;
 for(a[2]=0;a[2]<NC;a[2]++){if(a[2]==a[0]||a[2]==a[1])continue;
 for(b[0]=0;b[0]<NC;b[0]++){if(b[0]==a[0]||b[0]==a[1]||b[0]==a[2])continue;
 for(b[1]=0;b[1]<NC;b[1]++){if(b[1]==a[0]||b[1]==a[1]||b[1]==a[2]||b[1]==b[0])continue;
 for(b[2]=0;b[2]<NC;b[2]++){if(b[2]==a[0]||b[2]==a[1]||b[2]==a[2]||b[2]==b[0]||b[2]==b[1])continue;
  compact[sparse6(a,b)]=(int)np; for(int t=0;t<3;t++){cells[np][t]=a[t];cells[np][3+t]=b[t];}
  if(venceu(cells[np],0))fixo[np]=1; else if(venceu(cells[np],1))fixo[np]=2; np++;}}}}}
 A =malloc(NPOS*2*sizeof(double)); B =malloc(NPOS*6*sizeof(double));
 A2=malloc(NPOS*2*sizeof(double)); B2=malloc(NPOS*6*sizeof(double));
 /* Precisa das DUAS tabelas. 'lo' e 'hi' bracketam o valor verdadeiro, e a
  * distancia entre eles e a massa de empate — que nao encolhe com iteracao
  * (secao 7.1 da especificacao). Usar so 'lo' publica um limite inferior como
  * se fosse valor: medido, isso troca o melhor lance em ate 0,2% das posicoes
  * e erra a margem em ate 14 pontos. Cruzar as duas elimina os dois riscos. */
 if(carrega(board,"lo",A,B)) return 1;
 if(carrega(board,"hi",A2,B2)) return 1;
 /* Faixas de margem, alinhadas com a tabela da secao 8.2 do documento do projeto.
  * A selecao e por COTA: alvo_n/3 de cada faixa, espacada dentro dela. Amostrar o
  * conjunto inteiro de forma uniforme produzia quase so "sharp", porque a faixa
  * estreita e de longe a mais populosa — ou seja, um puzzle diario em que quase
  * todo dia era o dia dificil.
  * Duas passagens: a primeira conta os qualificados por faixa, a segunda emite. */
 static const char*TIER[3]={"sharp","subtle","clear"};
 long qual[3]={0,0,0}, vistos[3]={0,0,0}, stride[3]={1,1,1};
 int cota[3], emit[3]={0,0,0};
 for(int t=0;t<3;t++) cota[t] = alvo_n/3 + (t < alvo_n%3);
 long desc_lance=0, desc_margem=0;
 for(int passe=0;passe<2;passe++){
 int primeiro=1;
 if(passe==1){
   for(int t=0;t<3;t++){ stride[t] = cota[t] ? qual[t]/cota[t] : 1; if(stride[t]<1) stride[t]=1; }
   printf("    { \"board\": \"%s\", \"label\": \"%s\", \"puzzles\": [", board, rot); }
 for(long p=0;p<NPOS;p++){
  if(fixo[p])continue;
  double m1,m2,n1,n2; int bi,bd,si,sd, ci,cd,ti,td;
  int nopt = avalia(p,A ,B ,&m1,&m2,&bi,&bd,&si,&sd);
  if(nopt<4||m2<0||si<0) continue;
  double gl=m1-m2;
  if(gl<0.05) continue;                     /* abaixo disso a escolha nao e nitida */
  if(m1>0.995||m1<0.05) continue;           /* nem decidido, nem perdido */

  /* Cruzamento com o limite superior. Sem isso o puzzle publica um limite
   * inferior como se fosse valor.
   * Exige acordo tambem sobre o SEGUNDO melhor lance, porque o campo 'question'
   * depende dele — e o segundo e bem mais volatil que o primeiro. Custo medido:
   * 3,7% dos candidatos na Ponte e no Setas, 0,5% no Grade, na mesma ordem da
   * massa de empate de cada tabuleiro. Sobre um conjunto de 30 mil, e barato. */
  avalia(p,A2,B2,&n1,&n2,&ci,&cd,&ti,&td);
  if(bi!=ci || bd!=cd || si!=ti){ if(passe==0) desc_lance++; continue; }
  double gh=n1-n2, dif=gl-gh; if(dif<0) dif=-dif;
  if(dif>0.02){ if(passe==0) desc_margem++; continue; }

  /* Ponto medio dos dois limites: melhor estimativa do valor verdadeiro, e
   * consistente entre si (a margem do meio e a media das duas margens). */
  double v1=0.5*(m1+n1), v2=0.5*(m2+n2), gap=0.5*(gl+gh);
  int tier = gap>0.20 ? 2 : gap>0.10 ? 1 : 0;
  if(passe==0){ qual[tier]++; continue; }
  if(emit[tier] >= cota[tier]) continue;
  if(vistos[tier]++ % stride[tier]) continue;
  /* mesma peca nos dois melhores lances => a pergunta e "para onde";
     pecas diferentes => a pergunta e "qual peca nomear" */
  const char*tipo = (si==bi) ? "destination" : "piece";
  const unsigned char*cl=cells[p];
  printf("%s\n      {\"blue\":[%d,%d,%d],\"orange\":[%d,%d,%d],",
    primeiro?"":",", cl[0],cl[1],cl[2],cl[3],cl[4],cl[5]);
  /* to=null com pass=true e o passe deliberado: nomear uma peca sem lance legal
   * para obrigar o adversario a mover aquele simbolo. E jogada, nao ausencia de
   * dado — e -1 nao e uma casa. */
  if(bd<0) printf("\"best\":{\"symbol\":\"%s\",\"to\":null,\"pass\":true},", SIM[bi]);
  else     printf("\"best\":{\"symbol\":\"%s\",\"to\":%d,\"pass\":false},", SIM[bi], bd);
  if(sd<0) printf("\"second\":{\"symbol\":\"%s\",\"to\":null,\"pass\":true},", SIM[si]);
  else     printf("\"second\":{\"symbol\":\"%s\",\"to\":%d,\"pass\":false},", SIM[si], sd);
  printf("\"value\":%.4f,\"secondValue\":%.4f,\"margin\":%.4f,",v1,v2,gap);
  printf("\"question\":\"%s\",\"tier\":\"%s\"}",tipo,TIER[tier]);
  primeiro=0; emit[tier]++;
 }
 if(passe==1){ printf("\n    ] }");
   fprintf(stderr,"%s: emitidos %d/%d/%d (sharp/subtle/clear) de %ld/%ld/%ld qualificados\n",
     board, emit[0],emit[1],emit[2], qual[0],qual[1],qual[2]);
   fprintf(stderr,"  descartados no cruzamento lo/hi: %ld por melhor lance divergente, %ld por margem\n",
     desc_lance, desc_margem);
   for(int t=0;t<3;t++) if(emit[t]<cota[t])
     fprintf(stderr,"  AVISO: faixa %s tinha so %ld qualificados; cota de %d nao preenchida\n",
       TIER[t], qual[t], cota[t]); } }
 return 0; }
