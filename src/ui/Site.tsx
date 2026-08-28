import { App } from './App'
import { Analysis } from './Analysis'
import { Puzzle } from './Puzzle'
import { Rules } from './Rules'
import { useRoute } from './routes'

/**
 * Picks the page. Kept apart from `App` so the game does not have to know that
 * anything else exists — and so the root stays a board and nothing else
 * (project doc 3).
 */
export function Site() {
  const [route] = useRoute()
  if (route === 'puzzle') return <Puzzle />
  if (route === 'rules') return <Rules />
  if (route === 'analysis') return <Analysis />
  return <App />
}
