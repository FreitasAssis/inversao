import { isCode } from '../src/net/code'
import { parseConfig } from '../src/net/protocol'
import type { Inbound, Outbound, RoomConfig } from '../src/net/protocol'
import { createRoom } from '../src/net/transport'
import type { Room, Transport } from '../src/net/transport'
import type { Side } from '../src/engine/types'

/**
 * A sala, como Durable Object (desenho do passo 9, seção 3.1).
 *
 * **Este é o único código de servidor do projeto**, e a sua pequenez é o
 * argumento: ele carimba autor, numera, senta quem chega e sorteia uma vez por
 * rodada. Não conhece peças, casas nem regras — o único conhecimento de jogo
 * que tem é um inteiro, o número da rodada.
 *
 * A lógica não mora aqui. Ela é a mesma `createRoom` que os testes de duas telas
 * exercitam sem rede nenhuma, e este arquivo é o adaptador: WebSocket no lugar
 * dos callbacks. O que se testa em milissegundos num `jsdom` é literalmente o
 * que roda em produção.
 */

/** Aleatório de verdade. A moeda é o que os dois jogadores precisam confiar. */
const honestCoin = (): Side => {
  const [byte] = crypto.getRandomValues(new Uint8Array(1))
  return ((byte as number) & 1) === 0 ? 'blue' : 'orange'
}

type Env = {
  SALA: DurableObjectNamespace
  /** Os arquivos do site. O Worker os serve porque está na frente deles. */
  ASSETS: { fetch(request: Request): Promise<Response> }
}

export class Sala {
  /**
   * Criada na primeira conexão, e não no construtor: quem define a partida é
   * quem cria a sala, e essa informação chega com ela.
   */
  private room: Room | null = null

  fetch(request: Request): Response {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('esperava um websocket', { status: 426 })
    }

    if (this.room === null) {
      const asked = configFrom(new URL(request.url))
      if (asked === null) {
        // Sala vazia e ninguém dizendo que partida é: ou o link é de uma sala
        // que já se desfez, ou é um código que nunca existiu. Os dois casos são
        // o mesmo para quem abriu, e "não existe" é a verdade dos dois.
        return new Response('sala não encontrada', { status: 404 })
      }
      this.room = createRoom(honestCoin, asked)
    }

    const transport = this.room.join()
    if (transport === null) {
      // Sala lotada. O teto é folgado e existe só por segurança: sem ele, um
      // código conhecido é tudo o que alguém precisa para abrir conexões até
      // doer, e nada disso pede autenticação.
      return new Response('sala cheia', { status: 503 })
    }

    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]
    server.accept()
    this.attach(server, transport)

    return new Response(null, { status: 101, webSocket: client })
  }

  /** Liga um socket a um lugar na sala. Toda a decisão está do outro lado. */
  private attach(socket: WebSocket, transport: Transport): void {
    const stop = transport.onReceive((message) => deliver(socket, message))

    socket.addEventListener('message', (event) => {
      const outbound = parse(event.data)
      // Descartado em silêncio: um cliente que manda lixo não merece um canal de
      // erro próprio, e responder daria a ele uma forma de sondar a sala.
      if (outbound !== null) transport.send(outbound)
    })
    socket.addEventListener('close', () => {
      stop()
      transport.close()
    })
  }
}

function deliver(socket: WebSocket, message: Inbound): void {
  try {
    socket.send(JSON.stringify(message))
  } catch {
    // Socket já fechado entre o broadcast e a entrega. Não é erro de ninguém.
  }
}

/** A configuração de quem cria, que viaja no endereço da própria conexão. */
function configFrom(url: URL): RoomConfig | null {
  return parseConfig({
    board: url.searchParams.get('b'),
    mechanic: url.searchParams.get('m'),
    evaluation: url.searchParams.get('e') === '1',
  })
}

/**
 * O que chega do cliente, conferido o bastante para não derrubar a sala.
 *
 * Não valida o **conteúdo** da ação de propósito: quem faz isso é o motor, nos
 * dois clientes, e uma segunda opinião aqui seria uma segunda chance de
 * discordar da primeira. O que se confere é só a forma.
 */
function parse(data: unknown): Outbound | null {
  if (typeof data !== 'string') return null
  try {
    const value: unknown = JSON.parse(data)
    if (typeof value !== 'object' || value === null) return null
    const message = value as Partial<Outbound>
    if (message.kind === 'act' && typeof (message as { action?: unknown }).action === 'object') {
      return message as Outbound
    }
    if (message.kind === 'draw' && Number.isInteger((message as { round?: unknown }).round)) {
      return message as Outbound
    }
    if (message.kind === 'ready') return { kind: 'ready' }
    if (message.kind === 'over') return { kind: 'over' }
    return null
  } catch {
    return null
  }
}

/** O código da sala é o nome do objeto: mesmo código, mesma instância. */
export default {
  fetch(request: Request, env: Env): Promise<Response> | Response {
    // Quem chega sem pedir upgrade é um navegador abrindo o endereço, e o que
    // ele quer é a página. O `run_worker_first` põe este Worker na frente dos
    // arquivos para o WebSocket poder existir, e sem esta linha o preço disso
    // seria `/sala/K3M9` responder "esperava um websocket" em texto puro.
    if (request.headers.get('Upgrade') !== 'websocket') return env.ASSETS.fetch(request)

    const code = new URL(request.url).pathname.replace(/^\/sala\//, '').toUpperCase()
    // A mesma lista que gera. Estiveram separadas, e discordavam: este teste
    // era `[A-Z2-9]{4}`, que aceita `O`, `I` e `L` — símbolos que o gerador
    // nunca produz. Um código digitado com O no lugar de zero criava uma sala
    // vazia em vez de falhar na hora.
    if (!isCode(code)) return new Response('código inválido', { status: 404 })
    return env.SALA.get(env.SALA.idFromName(code)).fetch(request)
  },
}
