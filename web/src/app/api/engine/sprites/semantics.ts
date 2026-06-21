// Pixel Semantics Engine — color-region segmentation + boundary mapping
// Each pixel gets ONE semantic value: its region ID.
// Regions are discovered by flood-filling connected similar-color areas.
// Boundary pixels encode which two regions they sit between.

/**
 * Color distance in RGB space (Euclidean, values in [0,1])
 */
function colorDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

/** A discovered color region in the sprite */
export interface SpriteRegion {
  id: number
  /** Normalized ID in [0,1] for state channel */
  value: number
  /** Average color of this region */
  color: [number, number, number]
  /** Number of pixels */
  size: number
  /** Bounding box */
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
  /** Center of mass */
  center: { x: number; y: number }
  /** Which other region IDs border this one */
  neighbors: number[]
}

/** Boundary between two regions */
export interface RegionBoundary {
  regionA: number
  regionB: number
  /** Number of pixel-pairs along this boundary */
  length: number
  /** Where the boundary sits (average of boundary pixel positions) */
  center: { x: number; y: number }
  /** Direction: 'horizontal' if regions are left-right, 'vertical' if top-bottom, 'mixed' */
  orientation: 'horizontal' | 'vertical' | 'mixed'
}

/** Full segmentation result */
export interface SpriteSegmentation {
  /** Region ID per pixel (0 = transparent) */
  regionMap: Int32Array
  /** All discovered regions */
  regions: SpriteRegion[]
  /** Boundaries between adjacent regions */
  boundaries: RegionBoundary[]
  /** Per-pixel semantic value for state channel: region value in R, boundary flag in G */
  semantics: Array<[number, number, number, number]>
}

/**
 * Flood-fill segmentation: group connected pixels with similar colors into regions.
 * Then compute boundaries between adjacent regions.
 *
 * @param pixels - Float32Array RGBA [0,1] row-major
 * @param w - sprite width
 * @param h - sprite height
 * @param threshold - max color distance to consider "same region" (default 0.15)
 */
export function segmentSprite(
  pixels: Float32Array,
  w: number,
  h: number,
  threshold: number = 0.15,
): SpriteSegmentation {
  const totalPixels = w * h
  const regionMap = new Int32Array(totalPixels) // 0 = unassigned/transparent

  // Pass 1: flood-fill to discover regions
  let nextRegionId = 1
  const regionPixels = new Map<number, number[]>() // regionId -> pixel indices
  const regionColors = new Map<number, [number, number, number]>() // regionId -> avg color

  for (let i = 0; i < totalPixels; i++) {
    if (regionMap[i] !== 0) continue // already assigned
    const a = pixels[i * 4 + 3]
    if (a < 0.1) continue // transparent

    // Start a new region from this pixel
    const regionId = nextRegionId++
    const queue: number[] = [i]
    const members: number[] = []
    let sumR = 0, sumG = 0, sumB = 0

    regionMap[i] = regionId

    while (queue.length > 0) {
      const idx = queue.pop()!
      members.push(idx)
      const base = idx * 4
      const r = pixels[base]
      const g = pixels[base + 1]
      const b = pixels[base + 2]
      sumR += r
      sumG += g
      sumB += b

      // Check 4 neighbors
      const x = idx % w
      const y = Math.floor(idx / w)
      const neighbors = [
        y > 0 ? idx - w : -1,       // up
        y < h - 1 ? idx + w : -1,   // down
        x > 0 ? idx - 1 : -1,       // left
        x < w - 1 ? idx + 1 : -1,   // right
      ]

      for (const ni of neighbors) {
        if (ni < 0 || regionMap[ni] !== 0) continue
        const na = pixels[ni * 4 + 3]
        if (na < 0.1) continue // transparent neighbor

        const nr = pixels[ni * 4]
        const ng = pixels[ni * 4 + 1]
        const nb = pixels[ni * 4 + 2]

        if (colorDist(r, g, b, nr, ng, nb) < threshold) {
          regionMap[ni] = regionId
          queue.push(ni)
        }
      }
    }

    const count = members.length
    regionPixels.set(regionId, members)
    regionColors.set(regionId, [sumR / count, sumG / count, sumB / count])
  }

  // Build region metadata
  const regionCount = nextRegionId - 1
  const regions: SpriteRegion[] = []

  for (let rid = 1; rid <= regionCount; rid++) {
    const members = regionPixels.get(rid)
    if (!members || members.length === 0) continue

    const color = regionColors.get(rid)!
    let minX = w, minY = h, maxX = 0, maxY = 0
    let cx = 0, cy = 0

    for (const idx of members) {
      const x = idx % w
      const y = Math.floor(idx / w)
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      cx += x
      cy += y
    }

    cx /= members.length
    cy /= members.length

    regions.push({
      id: rid,
      value: rid / (regionCount + 1), // normalized to (0,1)
      color,
      size: members.length,
      bounds: { minX, minY, maxX, maxY },
      center: { x: Math.round(cx), y: Math.round(cy) },
      neighbors: [], // filled in pass 2
    })
  }

  // Sort regions by size (largest first) and reassign values so biggest = lowest value
  regions.sort((a, b) => b.size - a.size)
  for (let i = 0; i < regions.length; i++) {
    regions[i].value = (i + 1) / (regions.length + 1)
  }

  // Pass 2: find boundaries between adjacent regions
  const boundaryMap = new Map<string, { count: number; sumX: number; sumY: number; dxSum: number; dySum: number }>()
  const neighborSets = new Map<number, Set<number>>()

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      const rid = regionMap[idx]
      if (rid === 0) continue

      // Check right and down neighbors for region transitions
      const pairs: [number, number, number][] = [] // [neighborIdx, dx, dy]
      if (x < w - 1) pairs.push([idx + 1, 1, 0])
      if (y < h - 1) pairs.push([idx + w, 0, 1])

      for (const [ni, dx, dy] of pairs) {
        const nrid = regionMap[ni]
        if (nrid === 0 || nrid === rid) continue

        // Found a boundary between rid and nrid
        const key = Math.min(rid, nrid) + '_' + Math.max(rid, nrid)
        let entry = boundaryMap.get(key)
        if (!entry) {
          entry = { count: 0, sumX: 0, sumY: 0, dxSum: 0, dySum: 0 }
          boundaryMap.set(key, entry)
        }
        entry.count++
        entry.sumX += x + dx * 0.5
        entry.sumY += y + dy * 0.5
        entry.dxSum += Math.abs(dx)
        entry.dySum += Math.abs(dy)

        // Track neighbor relationships
        if (!neighborSets.has(rid)) neighborSets.set(rid, new Set())
        if (!neighborSets.has(nrid)) neighborSets.set(nrid, new Set())
        neighborSets.get(rid)!.add(nrid)
        neighborSets.get(nrid)!.add(rid)
      }
    }
  }

  // Fill in neighbor lists
  for (const region of regions) {
    const ns = neighborSets.get(region.id)
    if (ns) region.neighbors = Array.from(ns)
  }

  // Build boundary objects
  const boundaries: RegionBoundary[] = []
  for (const [key, entry] of boundaryMap) {
    const [aStr, bStr] = key.split('_')
    const a = parseInt(aStr)
    const b = parseInt(bStr)

    let orientation: 'horizontal' | 'vertical' | 'mixed'
    if (entry.dxSum > entry.dySum * 2) {
      orientation = 'vertical' // boundary runs vertically (regions are left-right)
    } else if (entry.dySum > entry.dxSum * 2) {
      orientation = 'horizontal' // boundary runs horizontally (regions are top-bottom)
    } else {
      orientation = 'mixed'
    }

    boundaries.push({
      regionA: a,
      regionB: b,
      length: entry.count,
      center: {
        x: Math.round(entry.sumX / entry.count),
        y: Math.round(entry.sumY / entry.count),
      },
      orientation,
    })
  }

  boundaries.sort((a, b) => b.length - a.length)

  // Pass 3: build per-pixel semantics
  // R = region value (unique per region)
  // G = boundary flag (0 = interior, >0 = boundary between two regions)
  // B = vertical position within region (0=top, 1=bottom) — useful for directional effects
  // A = region size normalized (small regions = detail, large = body)
  const semantics: Array<[number, number, number, number]> = new Array(totalPixels)
  const regionById = new Map<number, SpriteRegion>()
  for (const r of regions) regionById.set(r.id, r)

  // Precompute max region size for normalization
  const maxRegionSize = regions.length > 0 ? regions[0].size : 1

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      const rid = regionMap[idx]

      if (rid === 0) {
        semantics[idx] = [0, 0, 0, 0]
        continue
      }

      const region = regionById.get(rid)
      if (!region) {
        semantics[idx] = [0, 0, 0, 0]
        continue
      }

      // R = region value
      const regionValue = region.value

      // G = boundary flag — check if any neighbor is a different region
      let boundaryValue = 0
      const neighborOffsets = [[-1, 0], [1, 0], [0, -1], [0, 1]]
      for (const [dx, dy] of neighborOffsets) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
        const nrid = regionMap[ny * w + nx]
        if (nrid !== 0 && nrid !== rid) {
          // Encode which region we border: use the neighbor's region value
          const nRegion = regionById.get(nrid)
          boundaryValue = nRegion ? nRegion.value : 0.5
          break
        }
      }

      // B = vertical position within this region's bounds (0=top, 1=bottom)
      const regionH = region.bounds.maxY - region.bounds.minY
      const localY = regionH > 0 ? (y - region.bounds.minY) / regionH : 0.5

      // A = region size (normalized, large regions > small)
      const sizeValue = region.size / maxRegionSize

      semantics[idx] = [regionValue, boundaryValue, localY, sizeValue]
    }
  }

  return { regionMap, regions, boundaries, semantics }
}

/**
 * Main entry point — replaces the old multi-channel spatial priors.
 * Returns per-pixel semantics based on color-region flood fill.
 */
export function computeSpriteSemantics(
  pixels: Float32Array,
  w: number,
  h: number,
): Array<[number, number, number, number]> {
  const result = segmentSprite(pixels, w, h)
  return result.semantics
}

/**
 * Get full segmentation with region metadata and boundaries.
 * Use this when you need the region graph, not just per-pixel values.
 */
export function computeFullSegmentation(
  pixels: Float32Array,
  w: number,
  h: number,
  threshold?: number,
): SpriteSegmentation {
  return segmentSprite(pixels, w, h, threshold)
}
