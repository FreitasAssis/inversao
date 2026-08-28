import { BOARD_CODES } from '../engine/board'
import { replayMatch } from '../engine/match'
import type { Action, Match, MatchConfig } from '../engine/match'
import { PIECES } from '../engine/types'
import type { BoardCode, Cell, Piece, Side } from '../engine/types'
import { DEFAULT_LEVEL, isLevel } from './levels'
import type { Level } from './levels'

/**
 * The match in progress, kept on the device. Closing the tab must not lose the
 * game (project doc 5).
 *
 * What is stored is the config and the action list — never a position. Coming
 * back replays the whole match through `applyAction`, so the engine re-derives
 * every position and re-checks every rule. A stored position would simply be
 * believed; a stored action list has to earn its way back. That matters more
 * than it sounds: the same list can be legal on the Grade and impossible on the
 * Ponte, and a save written under older rules should die rather than resume as
 * a game nobody could have played.
 *
 * It is the same validation the online path needs in step 9, which is why it
 * lives in the engine and not here. This file only deals with the store, and
 * with the fact that everything coming out of it is untrusted text.
 *
 * Two things ride along that are not the match. The **seed**, because the
 * initiative source is a pure function of seed and round — restore it and the
 * draws carry on the schedule the interrupted game was on. And the **seats**,
 * because bringing a two-player game back as a game against the AI would not
 * merely look wrong: the AI would move for the person sitting there.
 *
 * Nothing leaves the device.
 */

const KEY = 'inversao:match'

export type Saved = {
  match: Match
  seed: number
  humans: readonly Side[]
  level: Level
}

export function readSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return null
    const stored: unknown = JSON.parse(raw)
    if (typeof stored !== 'object' || stored === null) return null

    const { config, actions, seed, humans, level } = stored as Record<string, unknown>
    const clean = cleanConfig(config)
    if (clean === null || !Array.isArray(actions)) return null

    const played: Action[] = []
    for (const entry of actions) {
      const action = cleanAction(entry)
      if (action === null) return null
      played.push(action)
    }

    // The engine has the last word: shape is not legality.
    const match = replayMatch(clean, played)
    if (match === null) return null

    return {
      match,
      seed: typeof seed === 'number' && Number.isFinite(seed) ? seed : Date.now(),
      humans: cleanHumans(humans),
      // A difficulty is a dial on the opponent, not part of the match. Throwing
      // a real game away over one would be the wrong trade.
      level: isLevel(level) ? level : DEFAULT_LEVEL,
    }
  } catch {
    // Private mode, or a store somebody else wrote to. Never worth an error.
    return null
  }
}

/**
 * Keeps the match, or clears the store when there is no game to keep. An
 * untouched board is not a game in progress, and a finished one is a result —
 * reopening the site onto somebody's old result is worse than onto a board.
 */
export function writeSaved({ match, seed, humans, level }: Saved): void {
  if (match.result !== null || match.actions.length === 0) {
    clearSaved()
    return
  }
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ config: match.config, actions: match.actions, seed, humans, level }),
    )
  } catch {
    // Full quota or no storage: losing the save is not worth an error.
  }
}

export function clearSaved(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Same: an unavailable store must never take the game down with it.
  }
}

function cleanPiece(value: unknown): Piece | null {
  return PIECES.find((piece) => piece === value) ?? null
}

function cleanConfig(value: unknown): MatchConfig | null {
  if (typeof value !== 'object' || value === null) return null
  const { board, mechanic, drawOnRepetition, maxActions, opening } = value as Record<
    string,
    unknown
  >
  const code = BOARD_CODES.find((known) => known === board)
  if (code === undefined) return null
  if (mechanic !== 'rotation' && mechanic !== 'choice') return null

  const config: MatchConfig = { board: code as BoardCode, mechanic }
  if (typeof drawOnRepetition === 'boolean') config.drawOnRepetition = drawOnRepetition
  if (typeof maxActions === 'number' && Number.isInteger(maxActions) && maxActions > 0) {
    config.maxActions = maxActions
  }
  const piece = cleanPiece(opening)
  if (piece !== null) config.opening = piece
  return config
}

/**
 * Rebuilt field by field rather than cast: an object that merely has the right
 * `type` could carry anything at all in the rest of it.
 */
function cleanAction(value: unknown): Action | null {
  if (typeof value !== 'object' || value === null) return null
  const { type, piece, to, initiative } = value as Record<string, unknown>

  if (type === 'offerDraw' || type === 'acceptDraw' || type === 'declineDraw') return { type }
  if (type === 'resign') return { type }
  if (type === 'draw') {
    return initiative === 'blue' || initiative === 'orange' ? { type, initiative } : null
  }

  const symbol = cleanPiece(piece)
  if (symbol === null) return null
  if (type === 'pass') return { type, piece: symbol }
  if (type !== 'move') return null
  if (typeof to !== 'number' || !Number.isInteger(to) || to < 0 || to > 11) return null
  return { type, piece: symbol, to: to as Cell }
}

function cleanHumans(value: unknown): readonly Side[] {
  if (!Array.isArray(value)) return ['blue']
  const seated = [...new Set(value)].filter(
    (side): side is Side => side === 'blue' || side === 'orange',
  )
  // Nobody seated is not a game anyone is playing; fall back to the local one.
  return seated.length === 0 ? ['blue'] : seated
}
