/**
 * Turns the site into something installable that survives being offline
 * (project doc 11, step 4).
 *
 * Whether to do it at all is decided at the call site, on `import.meta.env.PROD`
 * — registering in development would cache a dev server's shell and then serve
 * it back, which looks exactly like the build being broken.
 *
 * Every branch here is a failure mode, not a feature: the API is absent on an
 * insecure origin and in some private-browsing modes, and in others it is
 * present and rejects. None of that is a reason for somebody not to get a
 * board, so nothing in here is allowed to reach the page.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return

  // After load: offline support is not worth competing with the first paint.
  addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Refused, or blocked by a policy. The game is fine; only the offline
      // copy is missing, and there is nobody to tell who could act on it.
    })
  })
}
