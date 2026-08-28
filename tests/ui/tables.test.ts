import { afterEach, describe, expect, test, vi } from 'vitest'
import { loadTable, tablePath } from '../../src/ui/tables'

/**
 * Downloading a solution table and keeping it (project doc 5).
 *
 * Everything here is a failure mode, because the success path is four lines.
 * The table is 5 to 11 MB and the game plays perfectly well without it — so
 * nothing in this file is allowed to throw, and a table that did not arrive
 * intact must never be kept. A cached broken table is a combination that never
 * works again.
 */

const POSITIONS = 665280

/** A table the reader will accept: real header, all states zero. */
function choiceBytes(): ArrayBuffer {
  const states = POSITIONS * 8
  const view = new DataView(new ArrayBuffer(16 + states))
  for (const [i, code] of [...'INVS'].entries()) view.setUint8(i, code.charCodeAt(0))
  view.setUint32(4, 1, true)
  view.setUint32(8, states, true)
  return view.buffer
}

type Reply = { ok: boolean; clone: () => Reply; arrayBuffer: () => Promise<ArrayBuffer> }
const reply = (bytes: ArrayBuffer, ok = true): Reply => ({
  ok,
  clone: () => reply(bytes, ok),
  arrayBuffer: async () => bytes,
})

function fakeCaches() {
  const store = new Map<string, Reply>()
  return {
    store,
    api: {
      open: async () => ({
        match: async (key: string) => store.get(key),
        put: async (key: string, value: Reply) => {
          store.set(key, value)
        },
      }),
    },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('the address of a table', () => {
  test('is the name the C tooling actually writes', () => {
    // The artifacts are named in the tooling's own dialect and there is no
    // reason to rename them on the way out of the Makefile.
    expect(tablePath('dbu', 'choice')).toBe('/data/tabela-dbu-sorteio.bin')
    expect(tablePath('bbb', 'rotation')).toBe('/data/tabela-bbb-rodizio.bin')
  })
})

describe('loading a solution table', () => {
  test('downloads one and hands it back parsed', async () => {
    const caches = fakeCaches()
    vi.stubGlobal('caches', caches.api)
    vi.stubGlobal('fetch', async () => reply(choiceBytes()))

    expect((await loadTable('dbu', 'choice'))?.kind).toBe('choice')
  })

  test('keeps it, so the next visit does not spend the megabytes again', async () => {
    const caches = fakeCaches()
    vi.stubGlobal('caches', caches.api)
    vi.stubGlobal('fetch', async () => reply(choiceBytes()))

    await loadTable('dbu', 'choice')

    expect(caches.store.has('/data/tabela-dbu-sorteio.bin')).toBe(true)
  })

  test('answers from the cache without touching the network', async () => {
    const caches = fakeCaches()
    caches.store.set('/data/tabela-dbu-sorteio.bin', reply(choiceBytes()))
    vi.stubGlobal('caches', caches.api)
    vi.stubGlobal('fetch', async () => {
      throw new Error('the network must not be asked')
    })

    expect((await loadTable('dbu', 'choice'))?.kind).toBe('choice')
  })

  test('never keeps a table that did not parse', async () => {
    // The permanent breakage: cache a truncated download once and that
    // combination is broken on every future visit, with nothing to notice.
    const caches = fakeCaches()
    vi.stubGlobal('caches', caches.api)
    vi.stubGlobal('fetch', async () => reply(new ArrayBuffer(64)))

    expect(await loadTable('dbu', 'choice')).toBeNull()
    expect(caches.store.size).toBe(0)
  })

  test('never keeps a download the server refused', async () => {
    const caches = fakeCaches()
    vi.stubGlobal('caches', caches.api)
    vi.stubGlobal('fetch', async () => reply(choiceBytes(), false))

    expect(await loadTable('dbu', 'choice')).toBeNull()
    expect(caches.store.size).toBe(0)
  })

  test('discards a cached table that no longer parses', async () => {
    // A format change, or a copy that was corrupted after it was stored. Going
    // to the network is the only way out of that, and it has to be automatic.
    const caches = fakeCaches()
    caches.store.set('/data/tabela-dbu-sorteio.bin', reply(new ArrayBuffer(64)))
    vi.stubGlobal('caches', caches.api)
    vi.stubGlobal('fetch', async () => reply(choiceBytes()))

    expect((await loadTable('dbu', 'choice'))?.kind).toBe('choice')
  })

  test('still downloads where there is no Cache Storage at all', async () => {
    // An insecure origin, or a private-browsing mode that hides it. Losing the
    // saving is not losing the feature.
    vi.stubGlobal('caches', undefined)
    vi.stubGlobal('fetch', async () => reply(choiceBytes()))

    expect((await loadTable('dbu', 'choice'))?.kind).toBe('choice')
  })

  test('returns nothing rather than throwing when the network is gone', async () => {
    // The search AI is playing until this resolves, so a rejection here would
    // break a game that was working.
    vi.stubGlobal('caches', undefined)
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline')
    })

    expect(await loadTable('dbu', 'choice')).toBeNull()
  })

  test('survives a Cache Storage that refuses to store', async () => {
    // Quota, or a browser that allows opening a cache and not writing to it.
    // The table is already in hand by then; failing the load would be perverse.
    vi.stubGlobal('caches', {
      open: async () => ({
        match: async () => undefined,
        put: async () => {
          throw new Error('quota exceeded')
        },
      }),
    })
    vi.stubGlobal('fetch', async () => reply(choiceBytes()))

    expect((await loadTable('dbu', 'choice'))?.kind).toBe('choice')
  })
})
