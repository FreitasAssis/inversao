import { existsSync, readFileSync } from 'node:fs'
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

  test('leaves the redirect rule to the platform, not to a _redirects file', () => {
    // A `/* /index.html 200` rule and `single-page-application` do the same
    // job, and having both is not merely redundant — the Workers validator
    // rejects the file outright:
    //
    //   Line 4: Infinite loop detected in this rule. This would cause a
    //   redirect to strip `.html` or `/index` and end up triggering this rule
    //   again. [code: 100324]
    //
    // It normalises `/index.html` back to `/`, which matches `/*` again. Pages
    // tolerated it; Workers refuses to deploy. The file was kept "in case the
    // project goes back to Pages" and that reasoning cost a failed deploy.
    expect(existsSync('public/_redirects')).toBe(false)
  })

  test('declara exatamente um código de servidor, e é a sala', () => {
    // Este teste dizia o contrário — `expect(config.main).toBeUndefined()` —, e
    // a promessa era real: motor, busca, tabelas e desafios rodam todos no
    // navegador.
    //
    // O passo 9 a quebra de propósito, e o que ela custa é pequeno o bastante
    // para caber numa frase: existe uma sala, ela carimba quem falou e sorteia a
    // iniciativa, e não conhece as regras do jogo. O que este teste guarda agora
    // é que não apareça um segundo.
    expect(config.main).toBe('worker/index.ts')
  })

  test('liga a sala como Durable Object, na variante que o plano gratuito serve', () => {
    // `new_classes` exigiria plano pago, e a falha só apareceria no deploy.
    expect(config.durable_objects.bindings).toEqual([{ name: 'SALA', class_name: 'Sala' }])
    expect(config.migrations[0].new_sqlite_classes).toEqual(['Sala'])
  })

  test('deixa a sala responder antes dos arquivos estáticos', () => {
    // Sem isto o multiplayer não existe, e o sintoma seria confuso:
    // `single-page-application` responde o `index.html` para **todo** endereço
    // sem arquivo correspondente, então o pedido de WebSocket receberia uma
    // página HTML em vez de chegar à sala.
    expect(config.assets.run_worker_first).toContain('/sala/*')
  })

  test('is pinned to a compatibility date', () => {
    // Without one the runtime's behaviour can shift under a deploy nobody made.
    expect(config.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
