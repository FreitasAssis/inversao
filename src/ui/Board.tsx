import { useEffect, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { Crossing } from './Crossing'
import { Draw } from './Draw'
import { lastMove } from '../engine/lastMove'
import { viewOf } from './view'
import type { CellView, Occupant } from './view'
import { middleLink } from '../engine/board'
import { legalMoves } from '../engine/moves'
import type { Action, Match } from '../engine/match'
import { PIECES } from '../engine/types'
import type { Cell, Piece, Side } from '../engine/types'

/**
 * The board, and the only place a move is started.
 *
 * **It is not a 4x3 grid.** It is two blocks of 2x3 joined by a middle band of
 * three links, and the band is the only thing that separates the three boards
 * (spec 1.2). Drawn as twelve identical squares, the Ponte and the Setas look
 * the same and the rule that distinguishes them is invisible — so the band is
 * drawn, with a direction where it only runs one way.
 *
 * Naming happens on the board too. Under Escolha Sorteada the initiative holder
 * picks a symbol, and the natural way to say "the square" is to touch the
 * square, not to read the word off a list beside the board.
 *
 * Illegal cells are marked with `aria-disabled`, never `disabled`: a disabled
 * button takes no focus, which would leave the position unreadable by keyboard.
 */

/** Exported because the puzzle page has to say a move out loud to explain it. */
export const CELL_NAMES = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'D1', 'D2', 'D3']
const COLUMNS = 3
const ROWS = 4

/** Capitalised: with no name given, the colour stands in as one. */
const SIDE_PT: Record<Side, string> = { blue: 'Azul', orange: 'Laranja' }
/**
 * Exported because the panel names pieces too, when it offers the Rodizio's
 * opening. The same word in two places drifts; this is the one that the board
 * itself speaks, so it is the one everybody borrows.
 */
export const PIECE_PT: Record<Piece, string> = {
  circle: 'círculo',
  triangle: 'triângulo',
  square: 'quadrado',
}

const describeOccupant = (occupant: Occupant) =>
  `${SIDE_PT[occupant.side]} ${PIECE_PT[occupant.piece]}`

function cellLabel(
  cell: CellView,
  flags: { legal: boolean; active: boolean; nameable: boolean },
): string {
  const parts = [CELL_NAMES[cell.cell] as string]
  if (cell.occupant) parts.push(describeOccupant(cell.occupant))
  else if (cell.slot) parts.push(`encaixe do ${describeOccupant(cell.slot)}`)
  else parts.push('vazia')
  if (flags.active) parts.push('peça da vez')
  if (flags.nameable) parts.push('pode ser escolhida')
  if (flags.legal) parts.push('destino possível')
  return parts.join(', ')
}

/** Where an arrow key lands, clamped at the edges. */
function stepFocus(from: Cell, key: string): Cell | null {
  const row = Math.floor(from / COLUMNS)
  const column = from % COLUMNS
  const moves: Record<string, [number, number] | undefined> = {
    ArrowUp: [row - 1, column],
    ArrowDown: [row + 1, column],
    ArrowLeft: [row, column - 1],
    ArrowRight: [row, column + 1],
  }
  const target = moves[key]
  if (!target) return null
  const [nextRow, nextColumn] = target
  if (nextRow < 0 || nextRow >= ROWS || nextColumn < 0 || nextColumn >= COLUMNS) return null
  return (nextRow * COLUMNS + nextColumn) as Cell
}

/** A move announced but not yet played, so the player can see it coming. */
export type Telegraph = { from: Cell; to: Cell }

export type BoardProps = Readonly<{
  match: Match
  onPlay: (action: Action) => void
  telegraph?: Telegraph | null
  /** Overlaid on the board when the match ends, so it lands in front of it. */
  outcome?: ReactNode
  /** What to call each side. Falls back to the colour when left blank. */
  names?: Partial<Record<Side, string>>
}>

export function Board({
  match,
  onPlay,
  telegraph = null,
  outcome = null,
  names,
}: BoardProps) {
  const naming = (side: Side) => names?.[side]?.trim() || SIDE_PT[side]
  // Where the piece standing here came from, so it can slide in from there.
  const arrived = lastMove(match)
  const view = viewOf(match)
  const [focus, setFocus] = useState<Cell>(0)
  /** The symbol the initiative holder has touched but not yet committed. */
  const [named, setNamed] = useState<Piece | null>(null)

  // A new round clears any half-finished naming.
  useEffect(() => setNamed(null), [match.actions.length])

  const namer = view.awaitingName ? view.mover : null
  const active = view.active ?? (namer && named ? pieceOf(match, namer, named) : null)
  const legal =
    namer && named ? legalMoves(match.config.board, match.placement, namer, named) : view.legal
  const stuck = active !== null && legal.length === 0

  /**
   * A piece stays nameable even after one has been picked. Naming is not
   * committed until the move is, and seeing where a piece can go is exactly how
   * you find out you wanted a different one.
   */
  function nameableAt(cell: Cell): boolean {
    if (namer === null) return false
    return PIECES.some((piece) => pieceOf(match, namer, piece).at === cell)
  }

  function activate(cell: Cell) {
    if (nameableAt(cell)) {
      const picked = PIECES.find((piece) => pieceOf(match, namer as Side, piece).at === cell)
      // Touching the chosen piece again drops it; touching another switches.
      setNamed(picked === named ? null : (picked ?? null))
      return
    }
    if (legal.includes(cell) && active) {
      onPlay({ type: 'move', piece: active.piece, to: cell })
    }
  }

  function announce(): string {
    if (telegraph) {
      return `Lance anunciado: ${CELL_NAMES[telegraph.from]} para ${CELL_NAMES[telegraph.to]}.`
    }
    if (view.mover === null) return 'Sorteando a iniciativa…'
    const who = naming(view.mover)
    if (namer !== null && named === null) return `Iniciativa: ${who}. Escolha uma peça.`
    const piece = PIECE_PT[active?.piece ?? 'circle']
    if (stuck) return `${who} passa: o ${piece} não tem lance legal.`
    // "de" for the same reason the result uses it: the name has no gender.
    return `Vez de ${who}, movendo o ${piece}.`
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const next = stepFocus(focus, event.key)
    if (next === null) return
    event.preventDefault()
    setFocus(next)
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-cell="${next}"]`)?.focus()
  }

  const blocks = [0, 1].map((block) =>
    Array.from({ length: 2 }, (_, row) => {
      const first = (block * 2 + row) * COLUMNS
      return view.cells.slice(first, first + COLUMNS)
    }),
  )

  return (
    <section className="board-area">
      {outcome}
      {/* The hint instructs a game in progress and the coin shows an initiative
          that no longer applies: both go quiet once the match is decided, and
          neither belongs behind the result overlay. */}
      {match.result === null && (
        <>
          <p className="hint">leve cada peça ao seu encaixe</p>
          {match.config.mechanic === 'choice' && <Draw winner={view.mover} />}
        </>
      )}
      {/* No next move to announce once the match is over. */}
      {match.result === null && <output className="turn">{announce()}</output>}

      <div role="grid" aria-label="Tabuleiro" className="board" onKeyDown={onKeyDown}>
        {blocks.map((rows, block) => (
          <div key={block === 0 ? 'top' : 'bottom'} data-block={block} className="block">
            {rows.map((cells) => (
              <div role="row" key={CELL_NAMES[cells[0]?.cell ?? 0]} className="row">
                {cells.map((cell) => {
                  const flags = {
                    legal: legal.includes(cell.cell),
                    active: active?.at === cell.cell,
                    nameable: nameableAt(cell.cell),
                  }
                  const announced =
                    telegraph?.from === cell.cell
                      ? 'from'
                      : telegraph?.to === cell.cell
                        ? 'to'
                        : undefined
                  return (
                    <button
                      key={cell.cell}
                      role="gridcell"
                      type="button"
                      data-cell={cell.cell}
                      tabIndex={cell.cell === focus ? 0 : -1}
                      aria-disabled={!flags.legal && !flags.nameable}
                      aria-label={cellLabel(cell, flags)}
                      data-legal={flags.legal || undefined}
                      data-active={flags.active || undefined}
                      data-nameable={flags.nameable || undefined}
                      data-side={cell.occupant?.side}
                      data-piece={cell.occupant?.piece}
                      data-slot={cell.slot ? cell.slot.piece : undefined}
                      // Whose slot it is, and not only which symbol. Without
                      // it every empty outline looks alike and there is no way
                      // to see which direction you are going — which is exactly
                      // the question a puzzle drops somebody into.
                      data-slot-side={cell.slot ? cell.slot.side : undefined}
                      data-telegraph={announced}
                      data-arrived={arrived?.to === cell.cell || undefined}
                      data-from={arrived?.to === cell.cell ? arrived.from : undefined}
                      style={
                        arrived?.to === cell.cell
                          ? ({
                              '--dx': arrived.from % COLUMNS - (cell.cell % COLUMNS),
                              '--dy': Math.floor(arrived.from / COLUMNS) - Math.floor(cell.cell / COLUMNS),
                            } as CSSProperties)
                          : undefined
                      }
                      className="cell"
                      onClick={() => activate(cell.cell)}
                    >
                      <span aria-hidden="true" className="glyph" />
                    </button>
                  )
                })}
              </div>
            ))}
            {block === 0 && (
              <div className="band">
                {[0, 1, 2].map((column) => (
                  <Crossing
                    key={column}
                    column={column}
                    link={middleLink(match.config.board, column)}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {stuck && active && (
        <button type="button" onClick={() => onPlay({ type: 'pass', piece: active.piece })}>
          Passar
        </button>
      )}
    </section>
  )
}

function pieceOf(match: Match, side: Side, piece: Piece) {
  return {
    side,
    piece,
    at: match.placement[side][PIECES.indexOf(piece)] as Cell,
  }
}
