// ── STAMP HELPERS — pixel pattern rendering at variable scales ──

// Star patterns at different sizes (# = filled pixel)
export const STAR_7 = [
  '   #   ',
  '  ###  ',
  '#######',
  ' ##### ',
  '#######',
  '  ###  ',
  '   #   ',
]

export const STAR_11 = [
  '     #     ',
  '    ###    ',
  '   #####   ',
  '  #######  ',
  '###########',
  ' ######### ',
  '###########',
  '  #######  ',
  '   #####   ',
  '    ###    ',
  '     #     ',
]

export const STAR_15 = [
  '       #       ',
  '      ###      ',
  '     #####     ',
  '    #######    ',
  '   #########   ',
  '  ###########  ',
  '###############',
  ' ############# ',
  '###############',
  '  ###########  ',
  '   #########   ',
  '    #######    ',
  '     #####     ',
  '      ###      ',
  '       #       ',
]

// 5-pointed star shape (more star-like than diamond)
export const STAR_5PT_9 = [
  '    #    ',
  '   ###   ',
  '  #####  ',
  '#########',
  ' ####### ',
  '  ## ##  ',
  ' ##   ## ',
  '##     ##',
  '#       #',
]

// Pick the right pattern based on target size
export function getStarPattern(targetSize: number): string[] {
  if (targetSize <= 8) return STAR_7
  if (targetSize <= 12) return STAR_11
  return STAR_15
}

// Stamp a pattern into color and object ID data arrays
// Data arrays are WORLD_W * WORLD_H * 4 (RGBA)
export function stampPattern(
  colorData: Float32Array,
  objData: Float32Array,
  pattern: string[],
  wx: number,
  wy: number,
  r: number, g: number, b: number,
  objId: number,
  worldW: number,
  worldH: number,
) {
  const ph = pattern.length
  const pw = pattern[0].length
  for (let py = 0; py < ph; py++) {
    for (let px = 0; px < pw; px++) {
      if (pattern[py][px] !== '#') continue
      const x = Math.floor(wx + px)
      const y = Math.floor(wy + py)
      if (x < 0 || x >= worldW || y < 0 || y >= worldH) continue
      const idx = (y * worldW + x) * 4
      colorData[idx] = r / 255
      colorData[idx + 1] = g / 255
      colorData[idx + 2] = b / 255
      colorData[idx + 3] = 1.0
      objData[idx] = objId / 255
      objData[idx + 1] = 0
      objData[idx + 2] = 0
      objData[idx + 3] = 1.0
    }
  }
}

// Stamp a pattern at a given scale (each pixel becomes scale x scale block)
export function stampScaledPattern(
  colorData: Float32Array,
  objData: Float32Array,
  pattern: string[],
  wx: number,
  wy: number,
  r: number, g: number, b: number,
  objId: number,
  scale: number,
  worldW: number,
  worldH: number,
) {
  const ph = pattern.length
  const pw = pattern[0].length
  for (let py = 0; py < ph; py++) {
    for (let px = 0; px < pw; px++) {
      if (pattern[py][px] !== '#') continue
      // Fill a scale x scale block
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const x = Math.floor(wx + px * scale + sx)
          const y = Math.floor(wy + py * scale + sy)
          if (x < 0 || x >= worldW || y < 0 || y >= worldH) continue
          const idx = (y * worldW + x) * 4
          colorData[idx] = r / 255
          colorData[idx + 1] = g / 255
          colorData[idx + 2] = b / 255
          colorData[idx + 3] = 1.0
          objData[idx] = objId / 255
          objData[idx + 1] = 0
          objData[idx + 2] = 0
          objData[idx + 3] = 1.0
        }
      }
    }
  }
}

// Stamp text using an offscreen canvas (rasterize to pixels)
export function stampText(
  colorData: Float32Array,
  objData: Float32Array,
  text: string,
  wx: number,
  wy: number,
  r: number, g: number, b: number,
  objId: number,
  worldW: number,
  worldH: number,
  fontSize: number = 11,
) {
  const canvas = document.createElement('canvas')
  const maxW = Math.min(text.length * fontSize, 200)
  canvas.width = maxW
  canvas.height = fontSize + 4
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.font = `bold ${fontSize}px monospace`
  ctx.fillStyle = 'white'
  ctx.textBaseline = 'top'
  ctx.fillText(text, 0, 0)

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let py = 0; py < canvas.height; py++) {
    for (let px = 0; px < canvas.width; px++) {
      const alpha = imgData.data[(py * canvas.width + px) * 4 + 3]
      if (alpha < 128) continue
      const x = Math.floor(wx + px)
      const y = Math.floor(wy + py)
      if (x < 0 || x >= worldW || y < 0 || y >= worldH) continue
      const idx = (y * worldW + x) * 4
      colorData[idx] = r / 255
      colorData[idx + 1] = g / 255
      colorData[idx + 2] = b / 255
      colorData[idx + 3] = 1.0
      objData[idx] = objId / 255
      objData[idx + 1] = 0
      objData[idx + 2] = 0
      objData[idx + 3] = 1.0
    }
  }
}

// Clear a rectangular region in data arrays
export function clearRegion(
  colorData: Float32Array,
  objData: Float32Array,
  wx: number,
  wy: number,
  w: number,
  h: number,
  worldW: number,
  worldH: number,
) {
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = Math.floor(wx + px)
      const y = Math.floor(wy + py)
      if (x < 0 || x >= worldW || y < 0 || y >= worldH) continue
      const idx = (y * worldW + x) * 4
      colorData[idx] = 0
      colorData[idx + 1] = 0
      colorData[idx + 2] = 0
      colorData[idx + 3] = 0
      objData[idx] = 0
      objData[idx + 1] = 0
      objData[idx + 2] = 0
      objData[idx + 3] = 0
    }
  }
}

// Get the pixel dimensions of a pattern at a given scale
export function getPatternSize(pattern: string[], scale: number = 1): { w: number; h: number } {
  return {
    w: pattern[0].length * scale,
    h: pattern.length * scale,
  }
}
