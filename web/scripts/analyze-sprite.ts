import { loadSprite } from '../src/lib/sprite-loader'
import { computeFullSegmentation } from '../src/app/api/engine/sprites/semantics'
import { readFileSync } from 'fs'

async function main() {
  const path = process.argv[2] || 'public/sprites/pixel-chars/data/0/42.png'
  const buf = readFileSync(path)
  const sprite = await loadSprite(buf, 64)
  const seg = computeFullSegmentation(sprite.pixels, sprite.width, sprite.height)

  console.log('Regions:', seg.regions.length)
  for (let i = 0; i < seg.regions.length; i++) {
    const r = seg.regions[i]
    const [cr, cg, cb] = r.color.map(c => Math.round(c * 255))
    const key = Math.round(r.value * 100)
    console.log(`  ${i + 1}: key=${key} rgb(${cr},${cg},${cb}) ${r.size}px center=(${r.center.x},${r.center.y}) y=${r.bounds.minY}-${r.bounds.maxY} neighbors=[${r.neighbors.join(',')}]`)
  }

  console.log('\nBoundaries:')
  for (const b of seg.boundaries.slice(0, 20)) {
    const rA = seg.regions.find(r => r.id === b.regionA)
    const rB = seg.regions.find(r => r.id === b.regionB)
    const idxA = rA ? seg.regions.indexOf(rA) + 1 : '?'
    const idxB = rB ? seg.regions.indexOf(rB) + 1 : '?'
    console.log(`  Region ${idxA} <-> Region ${idxB}: ${b.length}px ${b.orientation}`)
  }
}

main()
