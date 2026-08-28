import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

/**
 * Draws the app icons, from nothing, with no image library.
 *
 * The same reasoning as the sound: this is one circle and two arcs, and a
 * dependency that can rasterise anything in order to draw them is a bad trade.
 * Node already ships the only hard part, which is zlib.
 *
 * **The mark is the theorem.** A circle split by an S — the yin-yang cut,
 * without the dots. Rotate it 180 degrees and it is itself with the colours
 * swapped, which is precisely why P(azul vence) is exactly 0,5 and not merely
 * close to it (spec 7.1): the game is invariant under that rotation. It is also
 * the name.
 *
 * Dropping the dots is not only simplification. They are the first thing to
 * disappear when a mark is shrunk, and they are what makes the symbol a
 * *borrowed* one — without them this is a circle inverted, and it arrives
 * without the meditative baggage the game does not want.
 *
 * It survives being rendered in one colour, which is the test spec 5 sets and
 * the test this project's first icon failed: two discs became two identical
 * dots. Here the S survives, because the boundary is the shape.
 *
 *   node tools/icons.mjs
 */

const INK = [0x3d, 0x3d, 0x3a]
const BLUE = [0x37, 0x8a, 0xdd]
const ORANGE = [0xef, 0x9f, 0x27]

/** Subpixels per axis. Sixteen samples is plenty for edges this smooth. */
const SAMPLES = 4

/**
 * Which half a point falls in, or null outside the circle.
 *
 * The dividing line is two half-circles of half the radius, one bulging right
 * across the top and one bulging left across the bottom. Under a 180 degree
 * rotation the upper one maps onto the lower and left maps onto right, so every
 * blue point maps to an orange one — the symmetry is in the construction rather
 * than in the drawing.
 */
function halves(cx, cy, r) {
  const small = r / 2
  const near = (px, py, ox, oy) => {
    const dx = px - ox
    const dy = py - oy
    return dx * dx + dy * dy <= small * small
  }

  return (px, py) => {
    const dx = px - cx
    const dy = py - cy
    if (dx * dx + dy * dy > r * r) return null
    if (near(px, py, cx, cy - small)) return BLUE
    if (near(px, py, cx, cy + small)) return ORANGE
    return px < cx ? BLUE : ORANGE
  }
}

/** `size` is the mark's diameter as a fraction of the icon's side. */
function draw(side, size) {
  const pixels = Buffer.alloc(side * side * 3)
  const where = halves(side / 2, side / 2, (size * side) / 2)

  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      // Coverage per colour by supersampling: the only anti-aliasing here, and
      // it has to be per colour because the two meet along the S.
      let blue = 0
      let orange = 0
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const found = where(x + (sx + 0.5) / SAMPLES, y + (sy + 0.5) / SAMPLES)
          if (found === BLUE) blue++
          else if (found === ORANGE) orange++
        }
      }
      const total = SAMPLES * SAMPLES

      const at = (y * side + x) * 3
      for (let channel = 0; channel < 3; channel++) {
        pixels[at + channel] = Math.round(
          (INK[channel] * (total - blue - orange) +
            BLUE[channel] * blue +
            ORANGE[channel] * orange) /
            total,
        )
      }
    }
  }
  return pixels
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes) {
  let c = 0xffffffff
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/** Eight-bit truecolour, no alpha: the icon is opaque everywhere. */
function encodePng(side, pixels) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(side, 0)
  header.writeUInt32BE(side, 4)
  header[8] = 8
  header[9] = 2

  // One filter byte per scanline, and filter 0 — the image is smooth enough
  // that predicting from the left buys almost nothing after deflate.
  const raw = Buffer.alloc(side * (side * 3 + 1))
  for (let y = 0; y < side; y++) {
    pixels.copy(raw, y * (side * 3 + 1) + 1, y * side * 3, (y + 1) * side * 3)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * A circle of diameter 0,76 sits at 0,38 from the centre, inside the maskable
 * safe zone of 0,4. The cropped variant is pulled in further anyway, because
 * platforms crop harder than the specification promises.
 */
const FILES = [
  ['public/icon-192.png', 192, 0.76],
  ['public/icon-512.png', 512, 0.76],
  ['public/icon-maskable-512.png', 512, 0.62],
  // iOS ignores the manifest and reads a link tag instead, at this size.
  ['public/apple-touch-icon.png', 180, 0.76],
]

for (const [path, side, size] of FILES) {
  writeFileSync(path, encodePng(side, draw(side, size)))
  console.log(`${path} ${side}x${side}`)
}
