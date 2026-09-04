import { App } from './App'
import { Analysis } from './Analysis'
import { Puzzle } from './Puzzle'
import { Room } from './Room'
import { Rules } from './Rules'
import { useRoute } from './routes'

/**
 * Picks the page. Kept apart from `App` so the game does not have to know that
 * anything else exists — and so the root stays a board and nothing else
 * (project doc 3).
 */
export function Site() {
  const [place] = useRoute()
  if (place.route === 'puzzle') return <Puzzle />
  if (place.route === 'rules') return <Rules />
  if (place.route === 'analysis') return <Analysis />
  if (place.route === 'room' && place.code !== null) return <Room code={place.code} />
  return <App />
}
