/**
 * How long finished matches ran, kept locally.
 *
 * A few lines, and only worth anything if it ships with the first version: the
 * earliest players are the most informative, and they are exactly the ones lost
 * if this arrives late (project doc 11, step 2).
 *
 * It answers the open question in project doc 13 — whether human games end in
 * about twenty plies when the theoretical line runs to 283, which would mean
 * mistakes decide things far too early. That is the one number the exhaustive
 * analysis cannot produce.
 *
 * Nothing leaves the device.
 */

const KEY = 'inversao:record'

export type Record = { matches: number; plies: readonly number[] }

const EMPTY: Record = { matches: 0, plies: [] }

export function readRecord(): Record {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return EMPTY
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as Record).plies)
    ) {
      return EMPTY
    }
    const plies = (parsed as Record).plies.filter((n) => Number.isFinite(n))
    return { matches: plies.length, plies }
  } catch {
    // A corrupted or unavailable store must never take the game down with it.
    return EMPTY
  }
}

export function recordFinished(plies: number): void {
  try {
    const current = readRecord()
    const next: Record = {
      matches: current.matches + 1,
      plies: [...current.plies, plies],
    }
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Private mode, full quota: losing the record is not worth an error.
  }
}
