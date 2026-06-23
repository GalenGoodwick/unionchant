// Sprite Loader — PNG → pixel array conversion for the field engine
// Decodes sprite images and maps pixels to grid cell indices

import sharp from 'sharp'
import { DEFAULT_GRID_SIZE as GRID_SIZE } from '@/app/engine/types'

export interface SpriteData {
  width: number
  height: number
  /** RGBA float array, row-major, 4 floats per pixel */
  pixels: Float32Array
}

export interface SpriteFieldMapping {
  /** Cell indices to paint */
  cells: number[]
  /** Per-cell RGBA color in [0,1] range */
  colorData: Map<number, [number, number, number, number]>
}

export interface Color {
  r: number
  g: number
  b: number
  a: number
}

/**
 * Load a PNG/image buffer into a normalized RGBA float array.
 * Optionally resize to maxSize while preserving aspect ratio.
 */
export async function loadSprite(buffer: Buffer, maxSize?: number): Promise<SpriteData> {
  let pipeline = sharp(buffer).ensureAlpha()

  if (maxSize) {
    pipeline = pipeline.resize(maxSize, maxSize, {
      fit: 'inside',
      withoutEnlargement: false,
    })
  }

  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true })

  const pixelCount = info.width * info.height
  const pixels = new Float32Array(pixelCount * 4)

  for (let i = 0; i < pixelCount; i++) {
    pixels[i * 4] = data[i * 4] / 255
    pixels[i * 4 + 1] = data[i * 4 + 1] / 255
    pixels[i * 4 + 2] = data[i * 4 + 2] / 255
    pixels[i * 4 + 3] = data[i * 4 + 3] / 255
  }

  return { width: info.width, height: info.height, pixels }
}

/**
 * Convert sprite pixel data to grid cell indices + per-pixel colors.
 * Centers the sprite at (targetX, targetY) on the grid.
 * Skips fully transparent pixels so fields have proper shapes.
 */
export function spriteToFieldCells(
  sprite: SpriteData,
  targetX: number,
  targetY: number,
): SpriteFieldMapping {
  const cells: number[] = []
  const colorData = new Map<number, [number, number, number, number]>()

  // Center the sprite at the target position
  const offsetX = targetX - Math.floor(sprite.width / 2)
  const offsetY = targetY - Math.floor(sprite.height / 2)

  for (let sy = 0; sy < sprite.height; sy++) {
    for (let sx = 0; sx < sprite.width; sx++) {
      const pi = (sy * sprite.width + sx) * 4
      const a = sprite.pixels[pi + 3]

      // Skip transparent pixels (alpha < 0.1)
      if (a < 0.1) continue

      const gx = offsetX + sx
      const gy = offsetY + sy

      // Skip out-of-bounds
      if (gx < 0 || gx >= GRID_SIZE || gy < 0 || gy >= GRID_SIZE) continue

      const cellIdx = gy * GRID_SIZE + gx
      cells.push(cellIdx)
      colorData.set(cellIdx, [
        sprite.pixels[pi],
        sprite.pixels[pi + 1],
        sprite.pixels[pi + 2],
        sprite.pixels[pi + 3],
      ])
    }
  }

  return { cells, colorData }
}

/**
 * Extract dominant colors from a sprite using k-means clustering.
 * Returns up to maxColors dominant colors sorted by frequency.
 */
export function extractPalette(sprite: SpriteData, maxColors: number = 8): Color[] {
  // Collect non-transparent pixels
  const samples: [number, number, number][] = []
  const pixelCount = sprite.width * sprite.height

  for (let i = 0; i < pixelCount; i++) {
    const a = sprite.pixels[i * 4 + 3]
    if (a < 0.1) continue
    samples.push([
      sprite.pixels[i * 4],
      sprite.pixels[i * 4 + 1],
      sprite.pixels[i * 4 + 2],
    ])
  }

  if (samples.length === 0) return []
  if (samples.length <= maxColors) {
    return samples.map(([r, g, b]) => ({ r, g, b, a: 1 }))
  }

  // Simple k-means
  const k = Math.min(maxColors, samples.length)

  // Initialize centroids from evenly spaced samples
  const centroids: [number, number, number][] = []
  for (let i = 0; i < k; i++) {
    const idx = Math.floor((i / k) * samples.length)
    centroids.push([...samples[idx]])
  }

  const assignments = new Int32Array(samples.length)
  const counts = new Int32Array(k)

  // Run 10 iterations
  for (let iter = 0; iter < 10; iter++) {
    // Assign each sample to nearest centroid
    for (let si = 0; si < samples.length; si++) {
      let bestDist = Infinity
      let bestK = 0
      for (let ci = 0; ci < k; ci++) {
        const dr = samples[si][0] - centroids[ci][0]
        const dg = samples[si][1] - centroids[ci][1]
        const db = samples[si][2] - centroids[ci][2]
        const dist = dr * dr + dg * dg + db * db
        if (dist < bestDist) {
          bestDist = dist
          bestK = ci
        }
      }
      assignments[si] = bestK
    }

    // Update centroids
    for (let ci = 0; ci < k; ci++) {
      centroids[ci] = [0, 0, 0]
      counts[ci] = 0
    }
    for (let si = 0; si < samples.length; si++) {
      const ci = assignments[si]
      centroids[ci][0] += samples[si][0]
      centroids[ci][1] += samples[si][1]
      centroids[ci][2] += samples[si][2]
      counts[ci]++
    }
    for (let ci = 0; ci < k; ci++) {
      if (counts[ci] > 0) {
        centroids[ci][0] /= counts[ci]
        centroids[ci][1] /= counts[ci]
        centroids[ci][2] /= counts[ci]
      }
    }
  }

  // Build result sorted by cluster size (most frequent first)
  const clusters = centroids.map((c, i) => ({
    r: c[0],
    g: c[1],
    b: c[2],
    a: 1,
    count: counts[i],
  }))
  clusters.sort((a, b) => b.count - a.count)

  return clusters.filter(c => c.count > 0).map(({ r, g, b, a }) => ({ r, g, b, a }))
}

/**
 * Render field pixel data back to a PNG buffer (for vision analysis).
 * Reads color data from the grid for cells belonging to a field.
 */
export async function fieldToPng(
  cells: number[],
  colorData: Float32Array,
  gridSize: number,
): Promise<Buffer> {
  if (cells.length === 0) {
    // Return a 1x1 transparent PNG
    return sharp({
      create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer()
  }

  // Find bounding box
  let minX = gridSize, minY = gridSize, maxX = 0, maxY = 0
  for (const idx of cells) {
    const x = idx % gridSize
    const y = Math.floor(idx / gridSize)
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  const w = maxX - minX + 1
  const h = maxY - minY + 1
  const buf = Buffer.alloc(w * h * 4, 0)

  for (const idx of cells) {
    const gx = idx % gridSize
    const gy = Math.floor(idx / gridSize)
    const lx = gx - minX
    const ly = gy - minY
    const base = idx * 4
    const outBase = (ly * w + lx) * 4
    buf[outBase] = Math.round(colorData[base] * 255)
    buf[outBase + 1] = Math.round(colorData[base + 1] * 255)
    buf[outBase + 2] = Math.round(colorData[base + 2] * 255)
    buf[outBase + 3] = Math.round(colorData[base + 3] * 255)
  }

  return sharp(buf, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toBuffer()
}
