import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import type { Inbound } from '../../src/net/protocol'

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

type Wire = { socket: WebSocket; heard: Inbound[] }

/** The creator carries the configuration in the address; whoever joins does not. */
const CREATE = 'b=dbu&m=choice&e=0'

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

async function connect(code: string, query = ''): Promise<Wire> {
  const response = await SELF.fetch(`https://inversao.test/sala/${code}?${query}`, {
    headers: { Upgrade: 'websocket' },
  })
  const socket = response.webSocket
  if (socket === null) throw new Error(`the room refused the upgrade: ${response.status}`)
  socket.accept()
  const heard: Inbound[] = []
  socket.addEventListener('message', (event) => {
    heard.push(JSON.parse(event.data as string) as Inbound)
  })
  return { socket, heard }
}

const actions = (heard: Inbound[]) =>
  heard.flatMap((message) => (message.kind === 'action' ? [message.message] : []))

const welcome = (heard: Inbound[]) =>
  heard.find((message) => message.kind === 'welcome') as
    | Extract<Inbound, { kind: 'welcome' }>
    | undefined

/** Delivery is asynchronous, so waiting on a count beats waiting on a clock. */
async function until(reached: () => boolean, what: string): Promise<void> {
  for (let tries = 0; tries < 200; tries++) {
    if (reached()) return
    await scheduler.wait(1)
  }
  throw new Error(`nunca aconteceu: ${what}`)
}

const send = (wire: Wire, message: unknown) => wire.socket.send(JSON.stringify(message))

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

  it('turns away a link to a room nobody established', async () => {
    // A room is memory, not a record: the link outlives it. Whoever opens a
    // code whose creator is gone gets the truth — there is no such room — and
    // not a blank board on some default configuration.
    const response = await SELF.fetch(`https://inversao.test/sala/${fresh()}`, {
      headers: { Upgrade: 'websocket' },
    })

    expect(response.status).toBe(404)
  })

  it('tells each arrival which seat it took', async () => {
    // The client cannot work this out on its own, and everything it is allowed
    // to do follows from it.
    const code = fresh()
    const first = await connect(code, CREATE)
    const second = await connect(code)

    await until(() => welcome(first.heard) !== undefined, 'as boas-vindas chegarem')
    await until(() => welcome(second.heard) !== undefined, 'as boas-vindas chegarem')

    expect(welcome(first.heard)?.seat).toBe('blue')
    expect(welcome(second.heard)?.seat).toBe('orange')
  })

  it('tells them which match this is', async () => {
    const code = fresh()
    await connect(code, 'b=nbn&m=rotation&e=1')
    const second = await connect(code)

    await until(() => welcome(second.heard) !== undefined, 'as boas-vindas chegarem')

    expect(welcome(second.heard)?.config).toEqual({
      board: 'nbn',
      mechanic: 'rotation',
      evaluation: true,
    })
  })

  it('marks only the arrival that established the room', async () => {
    // This is how the creator finds a code collision: getting `false` means the
    // code was already in use, and the fix is to draw another.
    const code = fresh()
    const first = await connect(code, CREATE)
    const second = await connect(code)

    await until(() => welcome(first.heard) !== undefined, 'as boas-vindas chegarem')
    await until(() => welcome(second.heard) !== undefined, 'as boas-vindas chegarem')

    expect(welcome(first.heard)?.first).toBe(true)
    expect(welcome(second.heard)?.first).toBe(false)
  })

  it('stamps the author from the seat, never from the message', async () => {
    // The one thing that has to be unforgeable. Without it, `resign` sent on the
    // opponent's turn records that *they* resigned.
    const code = fresh()
    const first = await connect(code, CREATE)
    const second = await connect(code)

    send(first, { kind: 'act', action: { type: 'offerDraw' } })
    await until(() => actions(second.heard).length > 0, 'a mensagem chegar ao outro lado')

    expect(actions(second.heard)[0]?.from).toBe('blue')
  })

  it('seats the second arrival on the other side', async () => {
    const code = fresh()
    const first = await connect(code, CREATE)
    const second = await connect(code)

    send(second, { kind: 'act', action: { type: 'offerDraw' } })
    await until(() => actions(first.heard).length > 0, 'a mensagem chegar ao outro lado')

    expect(actions(first.heard)[0]?.from).toBe('orange')
  })

  it('deals the initiative once, however many ask', async () => {
    // Both clients ask, because neither knows whether the other did. A second
    // draw in the list would be a round with two coins — and, worse, exactly the
    // "roll again until you like it" the design exists to prevent.
    const code = fresh()
    const first = await connect(code, CREATE)
    const second = await connect(code)

    send(first, { kind: 'draw', round: 0 })
    send(second, { kind: 'draw', round: 0 })
    await until(() => actions(first.heard).length > 0, 'o sorteio chegar')
    await scheduler.wait(20)

    expect(actions(first.heard).filter((message) => message.action.type === 'draw')).toHaveLength(1)
    expect(actions(first.heard)[0]?.from).toBe('server')
  })

  it('catches a late arrival up on everything already said', async () => {
    // The normal case, not the exceptional one: the second player always joins
    // after the first. It is also the whole of reconnection.
    const code = fresh()
    const first = await connect(code, CREATE)
    send(first, { kind: 'draw', round: 0 })
    await until(() => actions(first.heard).length > 0, 'o sorteio chegar')

    const late = await connect(code)
    await until(() => actions(late.heard).length > 0, 'o log alcançar quem chegou depois')

    expect(late.heard[0]?.kind).toBe('welcome')
    expect(actions(late.heard)[0]?.action.type).toBe('draw')
    expect(actions(late.heard)[0]?.seq).toBe(0)
  })

  it('lets a third watch, and gives it nothing to play with', async () => {
    const code = fresh()
    const first = await connect(code, CREATE)
    await connect(code)
    const watcher = await connect(code)

    await until(() => welcome(watcher.heard) !== undefined, 'as boas-vindas chegarem')
    send(watcher, { kind: 'act', action: { type: 'resign' } })
    await scheduler.wait(20)

    expect(welcome(watcher.heard)?.seat).toBe('spectator')
    expect(actions(first.heard)).toHaveLength(0)
  })

  it('keeps a different code in a different room', async () => {
    // The code is the object name, and two matches sharing one would deal each
    // other's coins.
    const here = await connect(fresh(), CREATE)
    const elsewhere = await connect(fresh(), CREATE)

    send(here, { kind: 'act', action: { type: 'offerDraw' } })
    await scheduler.wait(20)

    expect(actions(elsewhere.heard)).toHaveLength(0)
  })

  it('ignores a malformed message instead of falling over', async () => {
    // A client that sends rubbish gets no error channel of its own: answering
    // would hand it a way to probe the room.
    const code = fresh()
    const first = await connect(code, CREATE)
    const second = await connect(code)

    second.socket.send('not json at all')
    send(second, { kind: 'act' })
    send(second, { kind: 'draw', round: 'zero' })
    send(second, { kind: 'act', action: { type: 'offerDraw' } })
    await until(() => actions(first.heard).length > 0, 'a mensagem boa passar')

    expect(actions(first.heard)).toHaveLength(1)
  })
})
