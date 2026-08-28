import { afterEach, describe, expect, test, vi } from 'vitest'
import { registerServiceWorker } from '../../src/ui/pwa'

/**
 * Registering is five lines, and every one of them is a way to take the whole
 * game down on load. A worker is missing on an insecure origin and in some
 * private-browsing modes, and registration rejects outright in others — none of
 * which is a reason for somebody not to get a board.
 */

function withServiceWorker(register: () => Promise<unknown>) {
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { register },
    configurable: true,
  })
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker')
})

describe('registering the service worker', () => {
  test('waits for the page to finish loading before asking', () => {
    // Nothing about offline support is worth competing with the first paint.
    const register = vi.fn(async () => ({}))
    withServiceWorker(register)

    registerServiceWorker()
    expect(register).not.toHaveBeenCalled()

    window.dispatchEvent(new Event('load'))
    expect(register).toHaveBeenCalledWith('/sw.js')
  })

  test('does nothing at all where service workers do not exist', () => {
    // An insecure origin, or a browser mode that hides the API. The game still
    // works entirely; it just does not survive being offline.
    expect(() => registerServiceWorker()).not.toThrow()
  })

  test('swallows a registration that is refused', async () => {
    // Some browsers reject rather than hide the API. An unhandled rejection
    // here would be a broken page over a feature nobody asked for.
    const register = vi.fn(async () => {
      throw new Error('refused')
    })
    withServiceWorker(register)

    registerServiceWorker()

    expect(() => window.dispatchEvent(new Event('load'))).not.toThrow()
    await Promise.resolve()
  })
})
