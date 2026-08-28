import { describe, expect, test } from 'vitest'
import { aiController, drawController } from '../../src/engine/controller'
import { applyAction, awaitingDraw, startMatch } from '../../src/engine/match'
import type { Match } from '../../src/engine/match'

const rodizio = () => startMatch({ board: 'dbu', mechanic: 'rotation' })

describe('aiController', () => {
  test('answers with an action the match accepts', async () => {
    // Every side is a controller returning a promise of an action: a human
    // resolves on tap, the AI after its search, a remote player on the message.
    // One shape for all three, or adding the network means rewriting the loop
    // (project doc 2.2, decision 1).
    const play = aiController(2)

    const action = await play(rodizio())

    expect(applyAction(rodizio(), action).ok).toBe(true)
  })

  test('searches deeper when asked to play harder', async () => {
    // Depth is the difficulty dial until the tables exist (spec 6).
    const easy = await aiController(1)(rodizio())
    const hard = await aiController(6)(rodizio())

    expect(applyAction(rodizio(), easy).ok).toBe(true)
    expect(applyAction(rodizio(), hard).ok).toBe(true)
  })
})

describe('drawController', () => {
  test('supplies the initiative a pending round is waiting for', async () => {
    const sorteada = startMatch({ board: 'dbu', mechanic: 'choice' })
    expect(awaitingDraw(sorteada)).toBe(true)

    const action = await drawController(1234)(sorteada)

    expect(action.type).toBe('draw')
    expect(applyAction(sorteada, action).ok).toBe(true)
  })

  test('gives the same match the same draws twice over', async () => {
    // Seeded so a local game can be replayed and debugged. The seed is never
    // shared with an opponent — that is what the commit-and-reveal in project
    // doc 2.3 is for.
    const run = async (): Promise<string[]> => {
      let match: Match = startMatch({ board: 'dbu', mechanic: 'choice' })
      const draw = drawController(99)
      const drawn: string[] = []
      for (let i = 0; i < 12 && match.result === null; i++) {
        const action = awaitingDraw(match)
          ? await draw(match)
          : await aiController(2)(match)
        if (action.type === 'draw') drawn.push(action.initiative)
        const result = applyAction(match, action)
        if (!result.ok) throw new Error(result.reason)
        match = result.match
      }
      return drawn
    }

    expect(await run()).toEqual(await run())
  })
})
