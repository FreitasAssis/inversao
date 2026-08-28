import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

/**
 * The deploy contract (issue #1). Cloudflare reads this file to decide what
 * gets served, and a mistake in it fails at deploy time or, worse, succeeds
 * while serving the wrong directory.
 *
 * It is checked here for the same reason `_headers` is: the file *is* the whole
 * agreement with the host, and there is nothing else to compare it against.
 */

/** JSONC: the file is commented on purpose, so the comments come out first. */
const config = JSON.parse(
  readFileSync('wrangler.jsonc', 'utf8')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, ''),
)

const vite = readFileSync('vite.config.ts', 'utf8')

describe('the deploy configuration', () => {
  test('serves the directory Vite actually writes', () => {
    // Vite's default output is `dist`, and it is not stated anywhere else. If
    // somebody sets `build.outDir`, the deploy would keep pointing at a folder
    // that no longer exists — and the failure would be at deploy time, in
    // somebody else's terminal.
    const outDir = vite.match(/outDir:\s*['"]([^'"]+)['"]/)?.[1] ?? 'dist'

    expect(config.assets.directory).toBe(`./${outDir}`)
  })

  test('sends unknown addresses to the app, not to a 404', () => {
    // The router lives in the page: /desafios and /regras are the same
    // document. Without this a shared link 404s on a direct hit, which is
    // exactly the link somebody would share.
    expect(config.assets.not_found_handling).toBe('single-page-application')
  })

  test('ships no server code at all', () => {
    // The whole project is built on there being no server: the engine, the
    // search, the tables and the puzzles all run in the browser. A `main` here
    // would be the first line of one.
    expect(config.main).toBeUndefined()
  })

  test('is pinned to a compatibility date', () => {
    // Without one the runtime's behaviour can shift under a deploy nobody made.
    expect(config.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
