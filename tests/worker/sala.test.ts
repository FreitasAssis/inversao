import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import type { SequencedAction } from '../../src/net/wire'

/**
 * The room, in the runtime that actually runs it.
 *
 * `WebSocketPair`, `DurableObjectNamespace` and `idFromName` do not exist in
 * jsdom, and standing in for them would test the stand-in. Miniflare is the same
 * `workerd` Cloudflare executes, reading the same `wrangler.jsonc` that deploys.
 *
 * Names are English here, unlike the rest of the suite: this pool sends the test
 * name in an HTTP header and warns twice per non-ASCII one, which would bury
 * every CI run under its own noise.
 *
 * **These tests run slightly behind production.** The `workerd` bundled with
 * the installed wrangler tops out at an older compatibility date than the one
 * `wrangler.jsonc` pins, and Miniflare says so and falls back. The room uses
 * only `WebSocketPair` and `crypto.getRandomValues`, so the gap is not worth
 * closing by giving up five months of runtime fixes in production — but it is
 * worth knowing, because it means green here is not proof there.
 */

type Wire = { socket: WebSocket; heard: SequencedAction[] }

/**
 * Um código novo por teste.
 *
 * O armazenamento isolado está desligado — a variante SQLite do Durable Object
 * quebra com ele nesta versão do pool —, então a mesma sala sobreviveria de um
 * teste para o outro com os assentos já ocupados. Códigos distintos são também
 * o que acontece de verdade: cada partida tem o seu.
 */
let counter = 0
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function fresh(): string {
  counter += 1
  let code = ''
  for (let digit = 0, n = counter; digit < 4; digit++, n = Math.floor(n / 31)) {
    code = (ALPHABET[n % 31] as string) + code
  }
  return code
}

async function connect(code: string): Promise<Wire> {
  const response = await SELF.fetch(`https://inversao.test/sala/${code}`, {
    headers: { Upgrade: 'websocket' },
  })
  const socket = response.webSocket
  if (socket === null) throw new Error('the room refused the upgrade')
  socket.accept()
  const heard: SequencedAction[] = []
  socket.addEventListener('message', (event) => {
    heard.push(JSON.parse(event.data as string) as SequencedAction)
  })
  return { socket, heard }
}

/** Delivery is asynchronous, so waiting on a count beats waiting on a clock. */
async function until(reached: () => boolean, what: string): Promise<void> {
  for (let tries = 0; tries < 200; tries++) {
    if (reached()) return
    await scheduler.wait(1)
  }
  throw new Error(`nunca aconteceu: ${what}`)
}

describe('the room', () => {
  it('turns away anything that is not a websocket', async () => {
    const response = await SELF.fetch(`https://inversao.test/sala/${fresh()}`)

    expect(response.status).toBe(426)
  })

  it('turns away a code that is not a code', async () => {
    // The code is the object's name, so an unchecked one would silently create
    // a room per typo — each of them empty and each of them billable.
    const response = await SELF.fetch('https://inversao.test/sala/nope!', {
      headers: { Upgrade: 'websocket' },
    })

    expect(response.status).toBe(404)
  })

  it('stamps the author from the seat, never from the message', async () => {
    // The one thing that has to be unforgeable. Without it, `resign` sent on the
    // opponent's turn records that *they* resigned.
    const code = fresh()
    const first = await connect(code)
    const second = await connect(code)

    first.socket.send(JSON.stringify({ kind: 'act', action: { type: 'offerDraw' } }))
    await until(() => second.heard.length > 0, 'a mensagem chegar ao outro lado')

    expect(second.heard[0]?.from).toBe('blue')
  })

  it('seats the second arrival on the other side', async () => {
    const code = fresh()
    const first = await connect(code)
    const second = await connect(code)

    second.socket.send(JSON.stringify({ kind: 'act', action: { type: 'offerDraw' } }))
    await until(() => first.heard.length > 0, 'a mensagem chegar ao outro lado')

    expect(first.heard[0]?.from).toBe('orange')
  })

  it('deals the initiative once, however many ask', async () => {
    // Both clients ask, because neither knows whether the other did. A second
    // draw in the list would be a round with two coins — and, worse, exactly the
    // "roll again until you like it" the design exists to prevent.
    const code = fresh()
    const first = await connect(code)
    const second = await connect(code)

    first.socket.send(JSON.stringify({ kind: 'draw', round: 0 }))
    second.socket.send(JSON.stringify({ kind: 'draw', round: 0 }))
    await until(() => first.heard.length > 0, 'o sorteio chegar')
    await scheduler.wait(20)

    expect(first.heard.filter((message) => message.action.type === 'draw')).toHaveLength(1)
    expect(first.heard[0]?.from).toBe('server')
  })

  it('catches a late arrival up on everything already said', async () => {
    // The normal case, not the exceptional one: the second player always joins
    // after the first. It is also the whole of reconnection.
    const code = fresh()
    const first = await connect(code)
    first.socket.send(JSON.stringify({ kind: 'draw', round: 0 }))
    await until(() => first.heard.length > 0, 'o sorteio chegar')

    const late = await connect(code)
    await until(() => late.heard.length > 0, 'o log alcançar quem chegou depois')

    expect(late.heard[0]?.action.type).toBe('draw')
    expect(late.heard[0]?.seq).toBe(0)
  })

  it('lets a third watch, and gives it nothing to play with', async () => {
    const code = fresh()
    const first = await connect(code)
    await connect(code)
    const watcher = await connect(code)

    watcher.socket.send(JSON.stringify({ kind: 'act', action: { type: 'resign' } }))
    await scheduler.wait(20)

    expect(first.heard).toHaveLength(0)
  })

  it('keeps a different code in a different room', async () => {
    // The code is the object name, and two matches sharing one would deal each
    // other's coins.
    const here = await connect(fresh())
    const elsewhere = await connect(fresh())

    here.socket.send(JSON.stringify({ kind: 'act', action: { type: 'offerDraw' } }))
    await scheduler.wait(20)

    expect(elsewhere.heard).toHaveLength(0)
  })

  it('ignores a malformed message instead of falling over', async () => {
    // A client that sends rubbish gets no error channel of its own: answering
    // would hand it a way to probe the room.
    const code = fresh()
    const first = await connect(code)
    const second = await connect(code)

    second.socket.send('not json at all')
    second.socket.send(JSON.stringify({ kind: 'act' }))
    second.socket.send(JSON.stringify({ kind: 'draw', round: 'zero' }))
    second.socket.send(JSON.stringify({ kind: 'act', action: { type: 'offerDraw' } }))
    await until(() => first.heard.length > 0, 'a mensagem boa passar')

    expect(first.heard).toHaveLength(1)
  })
})
