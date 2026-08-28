import type { Link } from '../engine/board'

/**
 * One column of the middle band: the passage between the two blocks, drawn as a
 * line with an arrowhead on each end that traffic may leave by.
 *
 * The band is the only thing that separates the three boards (spec 1.2). Drawn
 * as twelve identical squares the Ponte and the Setas look the same, so the
 * crossing is drawn — nothing at all where a column does not cross, which is
 * the whole of the Ponte's character.
 *
 * Nothing here moves. A belt of sliding chevrons was tried and dropped: the
 * band would be in perpetual motion, competing with the one movement that
 * matters — the pieces — and the likeliest pacing complaint about this game is
 * that it feels slow (project doc 13).
 *
 * It draws strictly inside its own box. A first version let the artwork
 * overflow and it landed on the row below; `overflow: visible` on something
 * sitting in a 2rem strip between two blocks is a trap.
 */

const LINK_PT: Record<Link, string> = {
  none: 'sem passagem',
  both: 'passagem nos dois sentidos',
  down: 'passagem só para baixo',
  up: 'passagem só para cima',
}

const W = 24
const H = 32
const MID = W / 2
const HEAD = 5

/** Arrowhead pointing the way traffic leaves, drawn at the end it exits by. */
function head(direction: 'down' | 'up') {
  const tip = direction === 'down' ? H : 0
  const base = direction === 'down' ? H - HEAD * 1.6 : HEAD * 1.6
  return (
    <polygon
      key={direction}
      data-head={direction}
      className="head"
      points={`${MID},${tip} ${MID - HEAD},${base} ${MID + HEAD},${base}`}
    />
  )
}

export type CrossingProps = Readonly<{ link: Link; column: number }>

export function Crossing({ link, column }: CrossingProps) {
  const label = `Coluna ${column + 1}: ${LINK_PT[link]}`

  if (link === 'none') {
    return <span role="img" aria-label={label} data-link={link} className="crossing" />
  }

  const DIRECTIONS: Record<Exclude<Link, 'none'>, ('down' | 'up')[]> = {
    both: ['down', 'up'],
    down: ['down'],
    up: ['up'],
  }
  const directions = DIRECTIONS[link]

  return (
    <svg
      role="img"
      aria-label={label}
      data-link={link}
      className="crossing"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <line data-line x1={MID} y1={1} x2={MID} y2={H - 1} className="track" />
      {directions.map(head)}
    </svg>
  )
}
