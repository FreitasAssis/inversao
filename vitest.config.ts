import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    // Nome próprio: sem ele os dois projetos do workspace herdam o nome do
    // pacote e colidem.
    name: 'browser',
    globals: true,
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // A sala roda no runtime do Workers, que não convive com `jsdom` no mesmo
    // processo. Ela tem projeto próprio em `vitest.workers.config.ts`, e o
    // `vitest.workspace.ts` reúne os dois.
    //
    // Espalhado sobre os padrões, e não no lugar deles: substituir a lista
    // apagaria `node_modules` e `dist` dela.
    exclude: [...configDefaults.exclude, 'tests/worker/**'],
  },
})
