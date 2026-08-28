import { BOARD_CODES } from '../engine/board'
import type { BoardCode } from '../engine/types'

/**
 * What you did on the daily puzzles, kept on the device (project doc 8.4).
 *
 * **Two streaks, not one.** With three puzzles a day, "all three correct" snaps
 * so easily that it would spend most of its life at zero, and a counter that is
 * usually zero is not a reason to come back. So one counts the days you showed
 * up for and the other the days you were perfect: the first is the habit, the
 * second is what is worth bragging about.
 *
 * Nothing leaves the device and there is no account anywhere — the whole
 * feature is arithmetic over `localStorage`, which is what keeps the site
 * static (project doc 8.3).
 */

const KEY = 'inversao:puzzles'

/** Which of the day's three were faced, and whether each was right. */
export type Answers = Partial<Record<BoardCode, boolean>>

export type PuzzleRecord = { days: Record<string, Answers> }

const EMPTY: PuzzleRecord = { days: {} }

/**
 * Far enough back that no live streak can reach it. A year of daily play is a
 * few kilobytes, but "forever" is not a size — and nothing older than the
 * longest streak anybody is currently on has any bearing on anything.
 */
const KEEP_DAYS = 120

export function readPuzzleRecord(): PuzzleRecord {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return EMPTY
    const stored: unknown = JSON.parse(raw)
    if (typeof stored !== 'object' || stored === null) return EMPTY
    const days = (stored as PuzzleRecord).days
    if (typeof days !== 'object' || days === null) return EMPTY
    return { days: clean(days) }
  } catch {
    // Private mode, or a store somebody else wrote to. Never worth an error.
    return EMPTY
  }
}

/** Records one answer and writes the whole record back. */
export function recordAnswer(
  record: PuzzleRecord,
  day: string,
  board: BoardCode,
  correct: boolean,
): PuzzleRecord {
  const next: PuzzleRecord = {
    days: { ...record.days, [day]: { ...record.days[day], [board]: correct } },
  }
  const pruned = { days: prune(next.days) }
  try {
    localStorage.setItem(KEY, JSON.stringify(pruned))
  } catch {
    // Full quota or no storage: losing the streak is not worth an error.
  }
  return pruned
}

export function answersOn(record: PuzzleRecord, day: string): Answers {
  return record.days[day] ?? {}
}

const complete = (answers: Answers) => BOARD_CODES.every((board) => board in answers)
const flawless = (answers: Answers) => BOARD_CODES.every((board) => answers[board] === true)

/** The day before, as a key. Dates are UTC everywhere in this feature. */
function dayBefore(day: string): string {
  return new Date(new Date(`${day}T12:00:00Z`).getTime() - 86_400_000)
    .toISOString()
    .slice(0, 10)
}

/**
 * Counts back from today, twice: once for days you turned up, once for days you
 * were perfect. Being flawless implies being complete, so the second can never
 * exceed the first.
 *
 * **Today only counts once all three are done** — but an unfinished today does
 * not break anything either. Opening the page at breakfast has to show
 * yesterday's streak, not a zero, because that is exactly the moment the number
 * is meant to be doing its job.
 */
export function streaksOf(
  record: PuzzleRecord,
  today: string,
): { attempted: number; perfect: number } {
  const start = complete(answersOn(record, today)) ? today : dayBefore(today)
  return {
    attempted: runFrom(record, start, complete),
    perfect: runFrom(record, start, flawless),
  }
}

/** Days in a row, backwards from `start`, for as long as `holds` holds. */
function runFrom(
  record: PuzzleRecord,
  start: string,
  holds: (answers: Answers) => boolean,
): number {
  let day = start
  let count = 0
  // Bounded by what is kept, so nothing here can spin on a strange store.
  while (count < KEEP_DAYS && holds(answersOn(record, day))) {
    count++
    day = dayBefore(day)
  }
  return count
}

function clean(days: Record<string, unknown>): Record<string, Answers> {
  const out: Record<string, Answers> = {}
  for (const [day, answers] of Object.entries(days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue
    if (typeof answers !== 'object' || answers === null) continue
    const kept: Answers = {}
    for (const board of BOARD_CODES) {
      const value = (answers as Answers)[board]
      if (typeof value === 'boolean') kept[board] = value
    }
    out[day] = kept
  }
  return prune(out)
}

function prune(days: Record<string, Answers>): Record<string, Answers> {
  const keys = Object.keys(days).sort()
  const keep = keys.slice(-KEEP_DAYS)
  return Object.fromEntries(keep.map((day) => [day, days[day] as Answers]))
}
