/**
 * Dois ambientes, um comando.
 *
 * O navegador e o runtime do Workers não convivem no mesmo processo — os dois
 * definem `WebSocket` de formas diferentes, entre outras coisas. Separar aqui é
 * o que deixa `npm test` continuar sendo uma linha só.
 */
export default ['./vitest.config.ts', './vitest.workers.config.ts']
