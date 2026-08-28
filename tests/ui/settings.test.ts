import { beforeEach, describe, expect, test } from 'vitest'
import { beatFor, readSettings, writeSettings } from '../../src/ui/settings'

describe('settings', () => {
  beforeEach(() => localStorage.clear())

  test('animates at normal speed by default', () => {
    expect(readSettings({ prefersReducedMotion: false })).toEqual({
      speed: 2,
      colourless: false,
      evaluation: false,
      volume: 0.5,
      playerName: '',
      guestName: '',
    })
  })

  test('runs faster as the dial goes up, which is the only way a dial reads', () => {
    // `beat` multiplies duration, so a bigger beat is a slower game. Exposing
    // that directly made the control mean the opposite of what it looked like.
    expect(beatFor(0)).toBeGreaterThan(beatFor(1))
    expect(beatFor(1)).toBeGreaterThan(beatFor(3))
  })

  test('ends the dial at instant, which is where fastest belongs', () => {
    // No animation is not the slow end of a speed dial; it is the fast end.
    expect(beatFor(4)).toBe(0)
  })

  test('starts at half volume, not silent', () => {
    // Effects only ever fire in reply to something the player did, and the
    // browser keeps the audio context suspended until the first gesture — so
    // nothing can blare at someone who just opened the link.
    expect(readSettings({ prefersReducedMotion: false }).volume).toBe(0.5)
  })

  test('remembers a muted game', () => {
    writeSettings({ speed: 2, colourless: false, evaluation: false, volume: 0, playerName: '', guestName: '' })

    expect(readSettings({ prefersReducedMotion: false }).volume).toBe(0)
  })

  test('ignores a stored volume outside the range', () => {
    writeSettings({ speed: 2, colourless: false, evaluation: false, volume: 42, playerName: '', guestName: '' })

    expect(readSettings({ prefersReducedMotion: false }).volume).toBe(0.5)
  })

  test('starts instant when the system asks for less motion', () => {
    // It is an operating system preference, not one of ours, and someone who
    // set it there should not have to set it again here.
    const settings = readSettings({ prefersReducedMotion: true })
    expect(beatFor(settings.speed)).toBe(0)
  })

  test('lets a stored choice override the system default', () => {
    // The dial is an explicit control, so moving it is an explicit opt-in — and
    // a control that cannot be moved is worse than no control at all.
    writeSettings({ speed: 3, colourless: false, evaluation: false, volume: 0.5, playerName: '', guestName: '' })

    expect(readSettings({ prefersReducedMotion: true }).speed).toBe(3)
  })

  test('remembers the colourless mode', () => {
    // An accessibility preference that resets on every visit is barely a
    // preference.
    writeSettings({ speed: 2, colourless: true, evaluation: false, volume: 0.5, playerName: '', guestName: '' })

    expect(readSettings({ prefersReducedMotion: false }).colourless).toBe(true)
  })

  test('falls back rather than taking the game down with a corrupt store', () => {
    localStorage.setItem('inversao:settings', 'not json at all')

    expect(readSettings({ prefersReducedMotion: false })).toEqual({
      speed: 2,
      colourless: false,
      evaluation: false,
      volume: 0.5,
      playerName: '',
      guestName: '',
    })
  })

  test('ignores a stored dial that is out of range', () => {
    writeSettings({ speed: 99, colourless: false, evaluation: false, volume: 0.5, playerName: '', guestName: '' })

    expect(readSettings({ prefersReducedMotion: false }).speed).toBe(2)
  })

  test('starts with nobody named', () => {
    const settings = readSettings({ prefersReducedMotion: false })

    expect(settings.playerName).toBe('')
    expect(settings.guestName).toBe('')
  })

  test('remembers your name, so it is not retyped every visit', () => {
    // The point of naming yourself is the shareable card (project doc 7), and
    // retyping it before every match is exactly the friction that kills that.
    writeSettings({ speed: 2, colourless: false, evaluation: false, volume: 0.5, playerName: 'Luiz', guestName: '' })

    expect(readSettings({ prefersReducedMotion: false }).playerName).toBe('Luiz')
  })

  test('stores your name and the guest separately, never by colour', () => {
    // Colour is not identity: online you do not pick your side, and the name
    // has to follow the person rather than whichever colour they were dealt.
    writeSettings({ speed: 2, colourless: false, evaluation: false, volume: 0.5, playerName: 'Luiz', guestName: 'Ana' })
    const settings = readSettings({ prefersReducedMotion: false })

    expect(settings.playerName).toBe('Luiz')
    expect(settings.guestName).toBe('Ana')
  })

  test('trims a name and caps how long it can be', () => {
    // It goes on a shared image and into the other player interface, so it is
    // untrusted input even when it is your own.
    writeSettings({
      speed: 2,
      colourless: false,
      evaluation: false,
      volume: 0.5,
      playerName: '   ' + 'a'.repeat(80) + '   ',
      guestName: '',
    })

    const stored = readSettings({ prefersReducedMotion: false }).playerName
    expect(stored.length).toBeLessThanOrEqual(20)
    expect(stored).toBe('a'.repeat(20))
  })

  test('ignores a name that is not text at all', () => {
    localStorage.setItem(
      'inversao:settings',
      JSON.stringify({ speed: 2, colourless: false, evaluation: false, volume: 0.5, playerName: 42 }),
    )

    expect(readSettings({ prefersReducedMotion: false }).playerName).toBe('')
  })
})
