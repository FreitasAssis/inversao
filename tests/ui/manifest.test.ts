import { readFileSync, existsSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { describe, expect, test } from 'vitest'

/**
 * The install manifest is a contract with the browser, and a browser answers a
 * broken one by silently not offering to install. There is no error to notice,
 * which is exactly why it is worth a test: every requirement below is something
 * Chrome checks and nothing else does.
 */

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'))

type Icon = { src: string; sizes: string; type: string; purpose?: string }
const icons: Icon[] = manifest.icons

/** Width and height straight out of the PNG header. */
function pixelsOf(path: string): { width: number; height: number; png: boolean } {
  const bytes = readFileSync(path)
  return {
    png: bytes.subarray(1, 4).toString('ascii') === 'PNG',
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  }
}

describe('the install manifest', () => {
  test('names the game, and short enough to sit under an icon', () => {
    expect(manifest.name).toBe('Inversão')
    expect(manifest.short_name.length).toBeLessThanOrEqual(12)
  })

  test('opens standalone, straight onto the board', () => {
    // Installed, it is a game and not a browser tab; and the address it opens
    // is the one that is already playable in two seconds (project doc 3).
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/')
  })

  test('is in the language the player reads', () => {
    expect(manifest.lang).toBe('pt-BR')
    expect(manifest.description).toMatch(/\S/)
  })

  test('carries the two sizes a browser requires to offer the install', () => {
    const sizes = icons.map((icon) => icon.sizes)

    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
    expect(icons.every((icon) => icon.type === 'image/png')).toBe(true)
  })

  test('carries a maskable icon, so the platform is not handed a white square', () => {
    // Without one, Android draws the icon inside a white circle of its own.
    expect(icons.some((icon) => icon.purpose === 'maskable')).toBe(true)
  })

  test('points at icons that are actually there', () => {
    for (const icon of icons) {
      expect(existsSync(`public${icon.src}`), icon.src).toBe(true)
    }
  })

  test('ships icons of the size they claim to be', () => {
    for (const icon of icons) {
      const [width, height] = icon.sizes.split('x').map(Number)
      expect(pixelsOf(`public${icon.src}`), icon.src).toEqual({ png: true, width, height })
    }
  })

  test('dresses the window in the paper the page is already made of', () => {
    // What the platform paints before the page exists, so a cold start does not
    // flash a colour the game never uses. It cannot follow a dark preference —
    // a manifest has no media queries — so the page carries its own pair of
    // theme-color tags and takes over the moment it loads.
    expect(manifest.theme_color).toBe('#faf9f5')
    expect(manifest.background_color).toBe('#faf9f5')
  })
})

describe('the mark', () => {
  /** Decodes one of our own PNGs: truecolour, eight bits, filter 0 throughout. */
  function pixelsOfPng(path: string): { side: number; rgb: Buffer } {
    const bytes = readFileSync(path)
    const side = bytes.readUInt32BE(16)

    let at = 8
    const parts: Buffer[] = []
    while (at < bytes.length) {
      const length = bytes.readUInt32BE(at)
      const type = bytes.subarray(at + 4, at + 8).toString('ascii')
      if (type === 'IDAT') parts.push(bytes.subarray(at + 8, at + 8 + length))
      at += 12 + length
    }

    const raw = inflateSync(Buffer.concat(parts))
    const rgb = Buffer.alloc(side * side * 3)
    for (let y = 0; y < side; y++) {
      // One filter byte per scanline, and the encoder only ever writes 0.
      const from = y * (side * 3 + 1)
      if (raw[from] !== 0) throw new Error('unexpected PNG filter')
      raw.copy(rgb, y * side * 3, from + 1, from + 1 + side * 3)
    }
    return { side, rgb }
  }

  test('is its own 180 degree rotation, with the colours swapped', () => {
    // This is not decoration: it is the theorem. The game is invariant under a
    // 180 degree rotation that exchanges the two players, which is *why*
    // P(azul vence) is exactly 0,5 rather than merely close to it — and why the
    // two solvers came back equidistant from it (spec 7.1). So the mark can be
    // checked rather than asserted in a comment.
    //
    // Measured as a mixture rather than as a colour match. Along the S the two
    // colours meet and every pixel there is a blend; demanding pure colours
    // made the test fail on anti-aliasing while the construction was exactly
    // symmetric all along.
    const { side, rgb } = pixelsOfPng('public/icon-512.png')
    const INK = [0x3d, 0x3d, 0x3a]
    // The blue channel runs 221 on pure blue down to 39 on pure orange, so it
    // alone says how far along the mixture a pixel sits.
    const orangeness = (at: number) => (0xdd - (rgb[at + 2] as number)) / (0xdd - 0x27)
    /** One 8-bit level, on that measure. */
    const STEP = 1 / (0xdd - 0x27)
    const isInk = (at: number) =>
      INK.every((value, channel) => Math.abs((rgb[at + channel] as number) - value) < 10)

    // Only the inside of the disc. The rim is anti-aliased against the ink
    // background, and a blue-and-ink blend reads as partly orange through this
    // measure — ink's blue channel sits near orange's. The rim is symmetric
    // too; it is the measure that cannot see it, not the mark that lacks it.
    const inside = 0.66 * (side / 2)

    let checked = 0
    for (let y = 0; y < side; y += 3) {
      for (let x = 0; x < side; x += 3) {
        const dx = x + 0.5 - side / 2
        const dy = y + 0.5 - side / 2
        if (dx * dx + dy * dy > inside * inside) continue

        const here = (y * side + x) * 3
        // The same pixel after rotating the image half a turn.
        const there = ((side - 1 - y) * side + (side - 1 - x)) * 3
        if (isInk(here) || isInk(there)) continue

        // One is as orange as the other is blue, everywhere at once — within
        // two 8-bit levels, which is the floor this measure can resolve. The
        // symmetry is exact; the file it is stored in is quantised.
        const off = Math.abs(orangeness(here) + orangeness(there) - 1)
        expect(off, `${x},${y}`).toBeLessThanOrEqual(2 * STEP)
        checked++
      }
    }

    // Guards against the whole thing passing on an icon that is simply blank.
    expect(checked).toBeGreaterThan(1000)
  })

  test('carries both players, so neither colour is the brand on its own', () => {
    const { side, rgb } = pixelsOfPng('public/icon-512.png')
    const middle = (Math.floor(side / 2) * side + Math.floor(side / 4)) * 3
    const mirror = (Math.floor(side / 2) * side + Math.floor((side * 3) / 4)) * 3

    expect(rgb[middle]).not.toBe(rgb[mirror])
  })
})
