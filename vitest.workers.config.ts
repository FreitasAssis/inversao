import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

/**
 * A sala roda no runtime de verdade, e não num dublê.
 *
 * `WebSocketPair`, `DurableObjectNamespace` e `idFromName` não existem em
 * `jsdom`, e um dublê deles testaria o dublê. O Miniflare é o mesmo
 * `workerd` que a Cloudflare executa.
 */
export default defineWorkersConfig({
  test: {
    name: 'worker',
    include: ['tests/worker/**/*.test.ts'],
    poolOptions: {
      workers: {
        // Lê o mesmo `wrangler.jsonc` que publica: o binding e a migração
        // testados são exatamente os que vão ao ar.
        wrangler: { configPath: './wrangler.jsonc' },
        // A sala não usa `state.storage` — o log vive na memória do objeto,
        // que permanece vivo enquanto houver socket aberto. Isolar
        // armazenamento entre testes não protege nada aqui, e nesta versão do
        // pool a variante SQLite do Durable Object quebra ao tentar.
        isolatedStorage: false,
      },
    },
  },
})
