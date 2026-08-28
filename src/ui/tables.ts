import { readTable } from '../engine/table'
import type { Table } from '../engine/table'
import type { MatchConfig } from '../engine/match'
import type { BoardCode } from '../engine/types'

/**
 * Getting a solution table onto the device (project doc 5).
 *
 * The five tables come to 38 MB, so none of them is precached — that would kill
 * the install, and the Rodizio alone is 60% of the weight. Instead the one
 * combination being played is fetched in the background and kept in a cache of
 * its own. Whoever only ever plays the default downloads 5,1 MB and never sees
 * the other 33.
 *
 * **Nothing here is allowed to throw.** The search AI is playing while this
 * resolves, and it plays well — a failed download should cost the player
 * perfect play, never a working game.
 *
 * The one rule with teeth: **a table that did not parse is never kept.** Cache
 * one truncated download and that combination is broken on every future visit,
 * silently, with no way for anyone to notice or clear it. Same reasoning as the
 * service worker refusing to store an error page as the shell.
 *
 * The cache name is deliberately not `inversao-<version>`: the worker sweeps
 * caches by that prefix on every release, and these are far too expensive to
 * re-download for a shell change.
 */

const CACHE = 'inversao-tables-v1'

/** The tooling's own names, kept rather than renamed on the way out. */
const MECHANIC_FILE: Record<MatchConfig['mechanic'], string> = {
  choice: 'sorteio',
  rotation: 'rodizio',
}

export function tablePath(board: BoardCode, mechanic: MatchConfig['mechanic']): string {
  return `/data/tabela-${board}-${MECHANIC_FILE[mechanic]}.bin`
}

export async function loadTable(
  board: BoardCode,
  mechanic: MatchConfig['mechanic'],
): Promise<Table | null> {
  const path = tablePath(board, mechanic)
  const cache = await openCache()

  const kept = await parse(() => cache?.match(path))
  if (kept !== null) return kept

  try {
    const response = await fetch(path)
    if (!response.ok) return null

    // Read from a clone so the untouched response is what gets stored: a body
    // can only be consumed once.
    const table = readTable(await response.clone().arrayBuffer())
    if (table === null) return null

    // Storing is a bonus, not the point. The table is already in hand.
    try {
      await cache?.put(path, response)
    } catch {
      // Quota, or a cache that opens and will not write.
    }
    return table
  } catch {
    // Offline, blocked, or a body that never finished arriving.
    return null
  }
}

/**
 * Cache Storage is missing on an insecure origin and in some private-browsing
 * modes. Losing the saving is not losing the feature.
 */
async function openCache(): Promise<Cache | null> {
  try {
    return (await globalThis.caches?.open(CACHE)) ?? null
  } catch {
    return null
  }
}

/**
 * A stored copy, or null — including when it no longer parses. A format change
 * or a copy corrupted after it was written can only be escaped by going back to
 * the network, and that has to happen without anybody asking.
 */
async function parse(get: () => Promise<Response | undefined> | undefined): Promise<Table | null> {
  try {
    const response = await get()
    if (response === undefined) return null
    return readTable(await response.arrayBuffer())
  } catch {
    return null
  }
}
