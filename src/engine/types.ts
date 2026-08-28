/**
 * One of the twelve board cells, 0-11 (spec 1).
 *
 * Named `Cell` and not `Square` on purpose: "quadrado" is one of the three piece
 * symbols, so `square` is reserved for that (project doc 2.1).
 */
export type Cell = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11

/** A piece symbol. Also the piece's name in the interface (spec 2). */
export type Piece = 'circle' | 'triangle' | 'square'

/** Fixed order of the three pieces, matching the layout of every artifact. */
export const PIECES = ['circle', 'triangle', 'square'] as const

/**
 * A player. Blue starts on row A and crosses downwards, orange on row D
 * crossing upwards (spec 2.1).
 *
 * Neither name means "me": the requirement in project doc 6.1 is that no
 * component may assume it owns the bottom side. Colours are fixed properties of
 * the game, so they carry that neutrality and match the data files.
 */
export type Side = 'blue' | 'orange'

/**
 * A board, named by its middle band: one letter per column for 3-6, 4-7 and
 * 5-8, where `n` is no link, `b` both ways, `d` down only and `u` up only
 * (spec 1.2). The same code names the table files.
 */
export type BoardCode = 'nbn' | 'bbb' | 'dbu'

/** Where the six pieces stand, indexed as PIECES. */
export type Placement = {
  readonly blue: readonly [Cell, Cell, Cell]
  readonly orange: readonly [Cell, Cell, Cell]
}
