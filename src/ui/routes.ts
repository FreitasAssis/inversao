import { useEffect, useState } from 'react'

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

export type Route = 'game' | 'puzzle' | 'rules' | 'analysis'

const PATHS: Record<Route, string> = {
  game: '/',
  puzzle: '/desafios',
  rules: '/regras',
  analysis: '/analise',
}

export function routeOf(pathname: string): Route {
  const trimmed = pathname.replace(/\/+$/, '')
  const found = (Object.keys(PATHS) as Route[]).find(
    (route) => PATHS[route].replace(/\/+$/, '') === trimmed,
  )
  return found ?? 'game'
}

export function pathOf(route: Route): string {
  return PATHS[route]
}

/** The current route, following back and forward as well as in-app links. */
export function useRoute(): [Route, (route: Route) => void] {
  const [path, setPath] = useState(() => globalThis.location?.pathname ?? '/')

  useEffect(() => {
    const onPop = () => setPath(globalThis.location.pathname)
    globalThis.addEventListener('popstate', onPop)
    return () => globalThis.removeEventListener('popstate', onPop)
  }, [])

  const go = (route: Route) => {
    const next = pathOf(route)
    globalThis.history?.pushState(null, '', next)
    setPath(next)
  }

  return [routeOf(path), go]
}
