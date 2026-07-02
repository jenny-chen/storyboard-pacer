// Generates app-icon.png (1024x1024) — a dark tile with an amber film frame
// and play triangle. Run `npm run tauri icon app-icon.png` to expand it into
// the full platform icon set.
const fs = require("fs")
const zlib = require("zlib")

const W = 1024
const H = 1024
const buf = Buffer.alloc(W * H * 3)

const BG = [19, 18, 16]
const PANEL = [28, 26, 22]
const AMBER = [232, 163, 61]

function set(x, y, c) {
  if (x < 0 || y < 0 || x >= W || y >= H) return
  const p = (y * W + x) * 3
  buf[p] = c[0]
  buf[p + 1] = c[1]
  buf[p + 2] = c[2]
}
function rect(x0, y0, x1, y1, c) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(x, y, c)
}
function roundedFill(x0, y0, x1, y1, r, c) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = x < x0 + r ? x0 + r - x : x > x1 - 1 - r ? x - (x1 - 1 - r) : 0
      const dy = y < y0 + r ? y0 + r - y : y > y1 - 1 - r ? y - (y1 - 1 - r) : 0
      if (dx * dx + dy * dy <= r * r) set(x, y, c)
    }
  }
}

// background
rect(0, 0, W, H, BG)
// rounded panel tile
roundedFill(96, 96, W - 96, H - 96, 120, PANEL)
// amber frame border (drawn as border by two rounded rects)
roundedFill(180, 180, W - 180, H - 180, 90, AMBER)
roundedFill(212, 212, W - 212, H - 212, 66, PANEL)

// play triangle (points right), amber, centered
const ax = 430
const bx = 660
const topY = 372
const botY = 652
const midY = (topY + botY) / 2
for (let y = topY; y < botY; y++) {
  // width shrinks linearly toward the tip
  const t = Math.abs(y - midY) / (midY - topY) // 0 at middle, 1 at edges
  const xEnd = ax + (bx - ax) * (1 - t)
  for (let x = ax; x < xEnd; x++) set(x, y, AMBER)
}

// --- encode PNG (RGB) ---
const crcTable = (() => {
  const t = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(b) {
  let c = 0xffffffff
  for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const tb = Buffer.from(type, "ascii")
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0)
  return Buffer.concat([len, tb, data, crc])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8
ihdr[9] = 2
const raw = Buffer.alloc(H * (1 + W * 3))
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0
  buf.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3)
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
])
fs.writeFileSync(__dirname + "/app-icon.png", png)
console.log("wrote app-icon.png", png.length, "bytes")
