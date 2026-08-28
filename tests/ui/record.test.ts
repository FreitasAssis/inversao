import { beforeEach, describe, expect, test } from 'vitest'
import { readRecord, recordFinished } from '../../src/ui/record'

describe('local record', () => {
  beforeEach(() => localStorage.clear())

  test('starts empty', () => {
    expect(readRecord()).toEqual({ matches: 0, plies: [] })
  })

  test('keeps how long each finished match ran', () => {
    // A few lines now, and only useful if it ships with the first version: the
    // earliest players are the most informative and the ones you lose if it
    // arrives late (project doc 11, step 2).
    recordFinished(23)
    recordFinished(31)

    expect(readRecord()).toEqual({ matches: 2, plies: [23, 31] })
  })

  test('survives a corrupted store instead of taking the game down', () => {
    localStorage.setItem('inversao:record', '{ not json')

    expect(readRecord()).toEqual({ matches: 0, plies: [] })
  })
})
