import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

/**
 * The service worker is the one file that can break the site permanently: a bad
 * one keeps serving a broken release to somebody who has already reloaded five
 * times, and there is no way for them to get out of it.
 *
 * It cannot be imported — it ships raw out of `public/` and runs in a worker
 * scope — so the real file is evaluated here against a stand-in `self`. That is
 * why everything inside it goes through `self.caches` and `self.clients` rather
 * than the bare globals: in a worker they are the same object, and here they are
 * something a test can hold.
 */

const source = readFileSync('public/sw.js', 'utf8')

type Event = { waitUntil: (work: Promise<unknown>) => void }

type Reply = { ok: boolean; body: string; clone: () => Reply }
const reply = (body: string, ok = true): Reply => ({ ok, body, clone: () => reply(body, ok) })

/** Enough of the Cache API to hold what the worker puts in it. */
function makeCaches() {
  const store = new Map<string, Reply>()
  const keyOf = (key: string | { url: string }) => (typeof key === 'string' ? key : key.url)
  return {
    store,
    api: {
      open: async () => ({
        put: async (key: string | { url: string }, value: Reply) => {
          store.set(keyOf(key), value)
        },
        match: async (key: string | { url: string }) => store.get(keyOf(key)),
        addAll: async () => {},
      }),
      keys: async () => [],
      delete: async () => true,
    },
  }
}

function load(caches: unknown = makeCaches().api, fetch: unknown = async () => reply('net')) {
  const handlers: Record<string, (event: Event) => void> = {}
  const scope = {
    location: new URL('https://inversao.example/'),
    addEventListener: (type: string, fn: (event: Event) => void) => {
      handlers[type] = fn
    },
    skipWaiting: () => {},
    clients: { claim: async () => {} },
    caches,
    fetch,
  }
  const built = new Function(
    'self',
    `${source}\nreturn { strategyFor, answer, VERSION, PRECACHE }`,
  ) as (self: unknown) => {
    strategyFor: (request: unknown) => string
    answer: (request: unknown, strategy: string) => Promise<Reply>
    VERSION: string
    PRECACHE: string[]
  }
  return { ...built(scope), handlers }
}

const get = (url: string, mode = 'no-cors') => ({ method: 'GET', mode, url })

describe('the service worker', () => {
  test('answers a navigation with the shell, so any address opens offline', () => {
    // /regras and /analise are the same document as / — the router is in the
    // page. It is the platform's `single-page-application` handling, said
    // again for the offline case.
    const { strategyFor } = load()

    expect(strategyFor(get('https://inversao.example/regras', 'navigate'))).toBe('shell')
    expect(strategyFor(get('https://inversao.example/', 'navigate'))).toBe('shell')
  })

  test('keeps hashed build output without asking again', () => {
    // The hash is in the name, so the file at that name can never change. This
    // is the only case where trusting the cache outright is actually safe.
    const { strategyFor } = load()

    expect(strategyFor(get('https://inversao.example/assets/index-A1b2C3.js'))).toBe('immutable')
  })

  test('rechecks anything whose name stays the same when the file changes', () => {
    // An icon or the manifest keeps its name across releases. Served from the
    // cache for speed, refreshed behind the player's back so a deploy lands.
    const { strategyFor } = load()

    expect(strategyFor(get('https://inversao.example/icon-192.png'))).toBe('revalidate')
    expect(strategyFor(get('https://inversao.example/manifest.webmanifest'))).toBe('revalidate')
  })

  test('stays out of the way of the solution tables', () => {
    // They are 38 MB and have an owner already: the loader downloads the one
    // combination being played and keeps it in its own cache. Letting the
    // worker also revalidate them would store every table twice.
    const { strategyFor } = load()

    expect(strategyFor(get('https://inversao.example/data/tabela-dbu-sorteio.bin'))).toBe(
      'network',
    )
  })

  test('stays out of the way of anything that is not a plain GET', () => {
    const { strategyFor } = load()

    expect(strategyFor({ method: 'POST', mode: 'cors', url: 'https://inversao.example/' })).toBe(
      'network',
    )
  })

  test('stays out of the way of another origin', () => {
    // There are none today — the game loads nothing from anywhere else — and
    // caching somebody else's responses is not this worker's business anyway.
    const { strategyFor } = load()

    expect(strategyFor(get('https://example.com/thing.js'))).toBe('network')
  })

  test('precaches enough to open a first visit with no network at all', () => {
    const { PRECACHE } = load()

    expect(PRECACHE).toContain('/')
    expect(PRECACHE).toContain('/manifest.webmanifest')
    expect(PRECACHE).toContain('/icon-512.png')
  })

  test('sweeps its own older caches when it takes over', async () => {
    const swept: string[] = []
    const { VERSION, handlers } = load({
      keys: async () => ['inversao-shell-v0', 'inversao-shell-v1', 'chat-history'],
      delete: async (key: string) => {
        swept.push(key)
        return true
      },
    })

    let work: Promise<unknown> = Promise.resolve()
    handlers.activate?.({ waitUntil: (promise) => (work = promise) })
    await work

    expect(swept).toContain('inversao-shell-v0')
    expect(swept).not.toContain(VERSION)
  })

  test('takes the shell from the network while there is one, and keeps a copy', async () => {
    // Online always means today's release. A worker that answered navigations
    // from the cache first is how a site stays broken through five reloads.
    const caches = makeCaches()
    // A copy is already in hand, and it still must not be the one served.
    caches.store.set('/', reply('yesterday'))
    const { answer } = load(caches.api, async () => reply('today'))

    const served = await answer(get('https://inversao.example/', 'navigate'), 'shell')

    expect(served.body).toBe('today')
    expect(caches.store.get('/')?.body).toBe('today')
  })

  test('falls back on the kept copy when the network is gone', async () => {
    const caches = makeCaches()
    caches.store.set('/', reply('yesterday'))
    const { answer } = load(caches.api, async () => {
      throw new Error('offline')
    })

    const served = await answer(get('https://inversao.example/regras', 'navigate'), 'shell')

    expect(served.body).toBe('yesterday')
  })

  test('never keeps an error page as the shell', async () => {
    // This is the permanent breakage: store one 500 under the shell key and
    // every future offline visit is served that page, forever.
    const caches = makeCaches()
    const { answer } = load(caches.api, async () => reply('502 Bad Gateway', false))

    await answer(get('https://inversao.example/', 'navigate'), 'shell')

    expect(caches.store.has('/')).toBe(false)
  })

  test('answers an immutable asset without touching the network at all', async () => {
    const caches = makeCaches()
    const url = 'https://inversao.example/assets/index-A1b2C3.js'
    caches.store.set(url, reply('bundle'))
    const { answer } = load(caches.api, async () => {
      throw new Error('the network must not be asked')
    })

    expect((await answer(get(url), 'immutable')).body).toBe('bundle')
  })

  test('fails honestly when it is offline with nothing to serve', async () => {
    // Resolving to nothing would surface as a confusing TypeError instead of
    // what actually happened, which is that there is no network.
    const { answer } = load(makeCaches().api, async () => {
      throw new Error('offline')
    })

    await expect(answer(get('https://inversao.example/icon-192.png'), 'revalidate')).rejects.toThrow(
      /offline/,
    )
  })

  test('leaves the solution tables alone when it sweeps', async () => {
    // The tables are 38 MB, downloaded on demand and kept in their own cache
    // (project doc 5). A sweep that took every "inversao-" cache would throw
    // them away on every release, and the only symptom would be somebody
    // re-downloading 11 MB for no reason.
    const swept: string[] = []
    const { handlers } = load({
      keys: async () => ['inversao-shell-v0', 'inversao-tables-v1'],
      delete: async (key: string) => {
        swept.push(key)
        return true
      },
    })

    let work: Promise<unknown> = Promise.resolve()
    handlers.activate?.({ waitUntil: (promise) => (work = promise) })
    await work

    expect(swept).toEqual(['inversao-shell-v0'])
  })

  test('leaves alone a cache it did not create', async () => {
    // One game, one domain — but deleting storage that is not yours is not a
    // thing to do on the strength of an assumption.
    const swept: string[] = []
    const { handlers } = load({
      keys: async () => ['chat-history'],
      delete: async (key: string) => {
        swept.push(key)
        return true
      },
    })

    let work: Promise<unknown> = Promise.resolve()
    handlers.activate?.({ waitUntil: (promise) => (work = promise) })
    await work

    expect(swept).toEqual([])
  })
})
