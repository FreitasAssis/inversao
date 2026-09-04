import { useEffect, useState } from 'react'
import { isCode } from '../net/code'

/**
 * Routing, in thirty lines and no dependency.
 *
 * There are four addresses in the whole project (project doc 3) and the site is
 * static. A router library would weigh more than the game's entire sound system
 * and cover cases that will never exist here.
 *
 * Anything unrecognised lands on the board. One game, one domain: a stale link
 * should drop somebody into something playable, never onto an error.
 */

export type Route = 'game' | 'puzzle' | 'rules' | 'analysis' | 'room'

const PATHS: Record<Exclude<Route, 'room'>, string> = {
  game: '/',
  puzzle: '/desafios',
  rules: '/regras',
  analysis: '/analise',
}

/** A única rota com parte variável: o código da sala. */
const ROOM = /^\/sala\/([^/]+)$/

/**
 * O código da sala no endereço, ou null.
 *
 * Confere pelo mesmo alfabeto que gera. Um código torto cai no tabuleiro, como
 * qualquer endereço desconhecido — nunca numa tela de erro.
 */
export function roomCodeOf(pathname: string): string | null {
  const found = ROOM.exec(pathname.replace(/\/+$/, ''))?.[1]
  return found !== undefined && isCode(found) ? found.toUpperCase() : null
}

export function routeOf(pathname: string): Route {
  const trimmed = pathname.replace(/\/+$/, '')
  if (roomCodeOf(trimmed) !== null) return 'room'
  const found = (Object.keys(PATHS) as Exclude<Route, 'room'>[]).find(
    (route) => PATHS[route].replace(/\/+$/, '') === trimmed,
  )
  return found ?? 'game'
}

export function pathOf(route: Exclude<Route, 'room'>): string {
  return PATHS[route]
}

/** O endereço de uma sala. É ele que se compartilha, e por isso não leva query. */
export function roomPath(code: string): string {
  return `/sala/${code.toUpperCase()}`
}

/** The current route, following back and forward as well as in-app links. */
export type Place = {
  route: Route
  /** Só na sala. Null em todo o resto. */
  code: string | null
}

export function useRoute(): [Place, (to: string) => void] {
  const [path, setPath] = useState(() => globalThis.location?.pathname ?? '/')

  useEffect(() => {
    const onPop = () => setPath(globalThis.location.pathname)
    globalThis.addEventListener('popstate', onPop)
    return () => globalThis.removeEventListener('popstate', onPop)
  }, [])

  /**
   * Recebe o endereço, e não a rota, porque a sala tem parte variável — e
   * porque quem cria precisa mandar a configuração junto, na query.
   */
  const go = (to: string) => {
    globalThis.history?.pushState(null, '', to)
    setPath(new URL(to, globalThis.location?.origin ?? 'http://x').pathname)
  }

  return [{ route: routeOf(path), code: roomCodeOf(path) }, go]
}
