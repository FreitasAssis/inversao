/**
 * The full mark, beside the name: the **ciclo** of spec 5 — circle, triangle
 * and square in a triangular arrangement, with arrows of rotation. It is
 * literally cycle B, the rule that defines the game, so somebody who has played
 * one match understands the logo.
 *
 * It is not the icon. The arrows disappear below about 48px, which is why the
 * favicon and the app icon are the inverted circle instead — same idea, in a
 * form that survives being shrunk.
 *
 * **The mark and the name trade colours.** A blue cycle takes an orange
 * wordmark and the other way round, which makes the pair itself an inversion —
 * the same operation the game is named after and the icon draws.
 *
 * Every coordinate below is derived from one radius rather than typed. The
 * first version was a page of magic numbers, and the shapes ended up small
 * inside a box that was mostly air.
 */

export type MarkProps = Readonly<{
  /** The colour of the shapes. The name beside it takes the other one. */
  side?: 'blue' | 'orange'
  /**
   * Beside the written name, where announcing "Inversão Inversão" would be the
   * logo talking over the heading it belongs to.
   */
  decorative?: boolean
}>

/*
 * As variáveis, não os valores. As cores das peças mudam com o esquema — o azul
 * do tema claro não é o do escuro — e a marca fica ao lado do tabuleiro: fixá-la
 * deixaria o logo numa cor e as peças noutra, na mesma tela.
 *
 * Os ícones do app continuam com os valores originais, e é a linha certa: eles
 * são arquivo, não podem seguir o esquema de ninguém, e nunca aparecem ao lado
 * de uma peça.
 */
const HUE = { blue: 'var(--blue)', orange: 'var(--orange)' } as const

const BOX = 140
const MIDDLE = BOX / 2
/** How far each shape sits from the centre, and how big it is. */
const ORBIT = 40
const SIZE = 18
/**
 * The arcs ride in the gaps between the shapes rather than outside them, so
 * their radius overlaps the band the shapes occupy — what keeps them apart is
 * angular clearance, not distance.
 *
 * Both numbers below were wrong on the first pass, and only arithmetic caught
 * it: the clearance was under two degrees, and the arrow tips reached three
 * units past the edge of the box and were being clipped.
 */
const ARC = 56
/** Degrees of clearance either side of a shape. Its half-width is about 24. */
const CLEAR = 36
const HEAD = 10

const radians = (degrees: number) => (degrees * Math.PI) / 180
const at = (angle: number, radius: number) => ({
  x: MIDDLE + radius * Math.cos(radians(angle)),
  y: MIDDLE + radius * Math.sin(radians(angle)),
})
const round = (value: number) => value.toFixed(1)

/** Clockwise from the top, in the order the cycle runs. */
const PLACES = [-90, 30, 150]

/**
 * One arc per gap, each ending in a chevron so the ring reads as *rotation*
 * rather than as a circle somebody drew around three shapes.
 */
function arcs() {
  return PLACES.map((from, index) => {
    const to = (PLACES[(index + 1) % PLACES.length] as number) + (index === 2 ? 360 : 0)
    const start = at(from + CLEAR, ARC)
    const end = at(to - CLEAR, ARC)

    // The tangent at the far end, which is the way the arrow points.
    const facing = to - CLEAR + 90
    const tip = end
    const wing = (spread: number) => ({
      x: tip.x + HEAD * Math.cos(radians(facing + spread)),
      y: tip.y + HEAD * Math.sin(radians(facing + spread)),
    })
    const back = wing(148)
    const front = wing(-148)

    return {
      key: from,
      arc: `M${round(start.x)} ${round(start.y)} A${ARC} ${ARC} 0 0 1 ${round(end.x)} ${round(end.y)}`,
      head: `M${round(back.x)} ${round(back.y)} L${round(tip.x)} ${round(tip.y)} L${round(front.x)} ${round(front.y)}`,
    }
  })
}

const RING = arcs()
const [circle, triangle, square] = PLACES.map((angle) => at(angle, ORBIT))

/**
 * The construction, in numbers, so it can be checked rather than eyeballed.
 *
 * Exported because the two things that went wrong here — the ring cutting
 * through the shapes and the arrow tips falling off the edge — are both
 * arithmetic, and neither is visible by reading path strings. A test that
 * scraped the `d` attributes looked like it covered them and covered neither:
 * the arcs' *middles* are not in the text at all, and the tips point along the
 * ring rather than away from it, so the worst case is not where it seemed.
 */
export const MARK = {
  box: BOX,
  /** Half-width of a shape. The square's half-diagonal is this times √2. */
  size: SIZE,
  shapes: [circle, triangle, square] as { x: number; y: number }[],
  /** Every point actually drawn: the arcs sampled, and the arrowhead corners. */
  outline: PLACES.flatMap((from, index) => {
    const to = (PLACES[(index + 1) % PLACES.length] as number) + (index === 2 ? 360 : 0)
    const along = Array.from({ length: 21 }, (_, step) =>
      at(from + CLEAR + ((to - CLEAR - (from + CLEAR)) * step) / 20, ARC),
    )
    const tip = at(to - CLEAR, ARC)
    const facing = to - CLEAR + 90
    const wings = [148, -148].map((spread) => ({
      x: tip.x + HEAD * Math.cos(radians(facing + spread)),
      y: tip.y + HEAD * Math.sin(radians(facing + spread)),
    }))
    return [...along, ...wings]
  }),
}

export function Mark({ side = 'blue', decorative = false }: MarkProps) {
  const colour = HUE[side]

  return (
    <svg
      className="mark"
      viewBox={`0 0 ${BOX} ${BOX}`}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : 'Inversão'}
      aria-hidden={decorative || undefined}
      data-side={side}
    >
      <g
        className="mark-ring"
        fill="none"
        stroke={colour}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      >
        {RING.map(({ key, arc, head }) => (
          <g key={key}>
            <path d={arc} />
            <path d={head} />
          </g>
        ))}
      </g>

      <g className="mark-shapes" fill={colour}>
        <circle cx={round((circle as { x: number }).x)} cy={round((circle as { y: number }).y)} r={SIZE} />
        <polygon
          points={[
            `${round((triangle as { x: number }).x)},${round((triangle as { y: number }).y - SIZE)}`,
            `${round((triangle as { x: number }).x + SIZE)},${round((triangle as { y: number }).y + SIZE * 0.75)}`,
            `${round((triangle as { x: number }).x - SIZE)},${round((triangle as { y: number }).y + SIZE * 0.75)}`,
          ].join(' ')}
        />
        <rect
          x={round((square as { x: number }).x - SIZE)}
          y={round((square as { y: number }).y - SIZE)}
          width={SIZE * 2}
          height={SIZE * 2}
          rx="4"
        />
      </g>
    </svg>
  )
}
