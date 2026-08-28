/* Inversao — solucionador do RODIZIO (analise retrograda completa).
 *
 * Resolve o espaco inteiro e exporta a tabela consumida pelo jogo.
 *
 *   ./solver-rodizio [codigo_tabuleiro] [saida.bin]
 *   ./solver-rodizio dbu tabela-dbu-rodizio.bin
 *
 * O Rodizio produz jogo vivo no Setas (dbu) e no Grade (bbb); so na Ponte (nbn)
 * ele empata, com 34,7% do espaco em empate e as tres aberturas empatadas.
 * Medido com este programa:
 *
 *   dbu  azul 43,5%  laranja 43,5%  empate 12,9%   quadrado vence em 283 lances
 *   bbb  azul 48,8%  laranja 48,8%  empate  2,4%   triangulo vence em 401,
 *                                                  quadrado perde em 524
 *   nbn  azul 32,7%  laranja 32,7%  empate 34,7%   todas as aberturas empatam
 *
 * O Grade e a combinacao menos empatada do jogo inteiro, e por isso e o padrao
 * do Rodizio (espec 4.2).
 *
 * FORMATO DA TABELA
 *   cabecalho  16 bytes:  "INVR" | versao u32 | n_estados u32 | reservado u32
 *   veredito   1 byte por estado   0=empate 1=azul vence 2=laranja vence 3=inalcancavel
 *   distancia  2 bytes por estado  lances ate o fim (0 quando empate)
 *
 *   indice do estado = pos*6 + vez*3 + ciclo
 *   pos  = indice compacto da colocacao das 6 pecas, na ordem de enumeracao
 *          canonica (ver indexa()); 12P6 = 665280 posicoes
 *   vez  = 0 azul, 1 laranja      ciclo = 0 circulo, 1 triangulo, 2 quadrado
 *
 * Tamanho: ~12 MB. Comprime bem; sirva com gzip/brotli.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define NC 12
#define NPOS 665280L
static int adj[NC][6], nadj[NC], radj[NC][6], nradj[NC];
static void monta(const char*cod){
 static const int und[14][2]={{0,1},{1,2},{3,4},{4,5},{6,7},{7,8},{9,10},{10,11},
  {0,3},{1,4},{2,5},{6,9},{7,10},{8,11}};
 static const int mid[3][2]={{3,6},{4,7},{5,8}};
 for(int i=0;i<NC;i++){nadj[i]=0;nradj[i]=0;}
 #define LIGA(a,b) do{ adj[a][nadj[a]++]=b; radj[b][nradj[b]++]=a; }while(0)
 for(int k=0;k<14;k++){int a=und[k][0],b=und[k][1];LIGA(a,b);LIGA(b,a);}
 for(int c=0;c<3;c++){int a=mid[c][0],b=mid[c][1];
  if(cod[c]=='d'||cod[c]=='b')LIGA(a,b);
  if(cod[c]=='u'||cod[c]=='b')LIGA(b,a);}
 for(int i=0;i<NC;i++){adj[i][nadj[i]]=-1;radj[i][nradj[i]]=-1;}}
static const int INI_A[3]={2,1,0}, INI_L[3]={9,10,11};
static const int ALVO_A[3]={9,11,10}, ALVO_L[3]={2,0,1};
static int *compact; static unsigned char (*cells)[6];
static unsigned char *val,*deg; static unsigned int *fila,*dist; static long ht,hh;
static long sparse(const int*a,const int*b){return (((((long)a[0]*NC+a[1])*NC+a[2])*NC+b[0])*NC+b[1])*NC+b[2];}
#define NCOMBO 6
#define CID(v,c) ((v)*3+(c))
#define SIDX(p,k) ((long)(p)*NCOMBO+(k))
static int venceu(const unsigned char*cl,int j){const int*al=j?ALVO_L:ALVO_A;const unsigned char*p=j?cl+3:cl;
 return p[0]==al[0]&&p[1]==al[1]&&p[2]==al[2];}
int main(int argc,char**argv){
 const char*cod = argc>1?argv[1]:"dbu";
 const char*saida = argc>2?argv[2]:NULL;
 monta(cod);
 compact=malloc(2985984L*sizeof(int)); for(long i=0;i<2985984L;i++)compact[i]=-1;
 cells=malloc(NPOS*6); long np=0; int a[3],b[3];
 for(a[0]=0;a[0]<NC;a[0]++)for(a[1]=0;a[1]<NC;a[1]++){if(a[1]==a[0])continue;
 for(a[2]=0;a[2]<NC;a[2]++){if(a[2]==a[0]||a[2]==a[1])continue;
 for(b[0]=0;b[0]<NC;b[0]++){if(b[0]==a[0]||b[0]==a[1]||b[0]==a[2])continue;
 for(b[1]=0;b[1]<NC;b[1]++){if(b[1]==a[0]||b[1]==a[1]||b[1]==a[2]||b[1]==b[0])continue;
 for(b[2]=0;b[2]<NC;b[2]++){if(b[2]==a[0]||b[2]==a[1]||b[2]==a[2]||b[2]==b[0]||b[2]==b[1])continue;
  compact[sparse(a,b)]=(int)np; cells[np][0]=a[0];cells[np][1]=a[1];cells[np][2]=a[2];
  cells[np][3]=b[0];cells[np][4]=b[1];cells[np][5]=b[2]; np++;}}}}}
 long N=NPOS*NCOMBO;
 val=calloc(N,1); deg=malloc(N); dist=calloc(N,sizeof(unsigned int)); fila=malloc(N*sizeof(unsigned int));
 hh=ht=0;
 for(long p=0;p<NPOS;p++){const unsigned char*cl=cells[p]; int va=venceu(cl,0),vl=venceu(cl,1);
  int oc=0; for(int k=0;k<6;k++)oc|=1<<cl[k];
  for(int v=0;v<2;v++)for(int c=0;c<3;c++){long s=SIDX(p,CID(v,c));
   if(va){ if(v==0){val[s]=3;continue;} val[s]=1;dist[s]=0;fila[ht++]=(unsigned int)s;continue; }
   if(vl){ if(v==1){val[s]=3;continue;} val[s]=2;dist[s]=0;fila[ht++]=(unsigned int)s;continue; }
   int n=0,from=cl[v*3+c]; for(const int*q=adj[from];*q>=0;q++) if(!(oc&(1<<*q)))n++;
   deg[s]=(unsigned char)(n?n:1);}}
 while(hh<ht){ long s=fila[hh++]; int r=val[s]; unsigned int d=dist[s];
  long p=s/NCOMBO; int k=(int)(s%NCOMBO), v=k/3, c=k%3;
  int u=1-v, cp=(c+2)%3; const unsigned char*cl=cells[p];
  int oc=0; for(int i=0;i<6;i++)oc|=1<<cl[i];
  int to=cl[u*3+cp]; int pk=CID(u,cp);
  for(const int*q=radj[to];*q>=0;q++){ int x=*q; if(oc&(1<<x))continue;
   int aa[3],bb[3]; for(int i=0;i<3;i++){aa[i]=cl[i];bb[i]=cl[3+i];}
   if(u==0)aa[cp]=x; else bb[cp]=x;
   long ps=SIDX(compact[sparse(aa,bb)],pk); if(val[ps])continue;
   if(r==u+1){val[ps]=r;dist[ps]=d+1;fila[ht++]=(unsigned int)ps;}
   else if(--deg[ps]==0){val[ps]=2-u;dist[ps]=d+1;fila[ht++]=(unsigned int)ps;} }
  { int algum=0; for(const int*q=adj[to];*q>=0;q++) if(!(oc&(1<<*q))){algum=1;break;}
    if(!algum){ long ps=SIDX(p,pk); if(!val[ps]){
      if(r==u+1){val[ps]=r;dist[ps]=d+1;fila[ht++]=(unsigned int)ps;}
      else if(--deg[ps]==0){val[ps]=2-u;dist[ps]=d+1;fila[ht++]=(unsigned int)ps;}}}}}
 long w=0,l=0,dr=0;
 for(long s=0;s<N;s++){ if(val[s]==1)w++; else if(val[s]==2)l++; else if(val[s]!=3)dr++; }
 long tot=w+l+dr;
 printf("RODIZIO FIXO (controle, rotulos absolutos)\n  azul %.1f%%  laranja %.1f%%  EMPATE %.1f%%\n",100.0*w/tot,100.0*l/tot,100.0*dr/tot);
 long p0=compact[sparse(INI_A,INI_L)];
 const char*nm[3]={"circulo","triangulo","quadrado"};
 for(int c=0;c<3;c++){ long s0=SIDX(p0,CID(0,c));
  printf("  abertura pelo %-10s ",nm[c]);
  if(val[s0]==1)printf("AZUL (1o) vence em %u lances\n",dist[s0]);
  else if(val[s0]==2)printf("LARANJA (2o) vence em %u lances\n",dist[s0]);
  else printf("empate\n"); }
 if(saida){
  FILE*o=fopen(saida,"wb");
  if(!o){ perror("saida"); return 1; }
  unsigned int cab[4]={0,1,(unsigned int)N,0};
  memcpy(&cab[0],"INVR",4);
  fwrite(cab,sizeof(unsigned int),4,o);
  fwrite(val,1,N,o);
  unsigned short*d16=malloc(N*sizeof(unsigned short));
  for(long s2=0;s2<N;s2++) d16[s2]=(unsigned short)(dist[s2]>65535?65535:dist[s2]);
  fwrite(d16,sizeof(unsigned short),N,o);
  fclose(o); free(d16);
  printf("\n  tabela escrita em %s (%ld estados, %.1f MB)\n",
         saida, N, (16.0+N*3.0)/1048576.0);
 }
 return 0; }
