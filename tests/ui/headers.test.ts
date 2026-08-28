import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

/**
 * What the host is told to cache, and for how long (issue #1).
 *
 * This file exists for one footgun above all: **a service worker that the
 * browser caches**. The worker decides what every future visit is served, so a
 * broken one that the browser holds onto for a day is a site nobody can reload
 * their way out of — the exact failure the worker itself was written to avoid,
 * arriving through the door underneath it.
 *
 * Cloudflare Pages reads `public/_headers` verbatim, so the file is the
 * contract and there is nothing else to check it against.
 */

const headers = readFileSync('public/_headers', 'utf8')

/** The directives under one path rule, up to the next rule. */
function rule(path: string): string {
  const at = headers.indexOf(`\n${path}\n`)
  if (at < 0) throw new Error(`no rule for ${path}`)
  const rest = headers.slice(at + path.length + 2)
  const next = rest.search(/^\S/m)
  return next < 0 ? rest : rest.slice(0, next)
}

describe('what the host is told to cache', () => {
  test('never lets a browser sit on the service worker', () => {
    // A worker held in the HTTP cache keeps deciding what every visit gets,
    // and no amount of reloading replaces it. It has to be revalidated every
    // time; it is two kilobytes.
    expect(rule('/sw.js')).toMatch(/cache-control:.*no-cache/i)
  })

  test('lets the hashed build output be kept forever, because it can be', () => {
    // The content hash is in the filename, so a file at one of these names can
    // never change. This is the only place where "immutable" is a fact rather
    // than a hope.
    const assets = rule('/assets/*')
    expect(assets).toMatch(/cache-control:.*immutable/i)
    expect(assets).toMatch(/max-age=31536000/)
  })

  test('does not call the solution tables immutable, because they are not', () => {
    // They keep their names across regenerations — `tabela-dbu-sorteio.bin` is
    // the same address before and after a new solve. Marked immutable, a
    // regenerated table would never reach anybody who already had the old one.
    const tables = rule('/data/*')
    expect(tables).toMatch(/cache-control:/i)
    expect(tables).not.toMatch(/immutable/i)
  })

  test('keeps the manifest and the icons revalidating too', () => {
    // Same reason: their names outlive their contents.
    expect(rule('/manifest.webmanifest')).not.toMatch(/immutable/i)
  })
})
