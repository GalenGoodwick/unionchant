// Sprite Catalog API — lists available sprites from /public/sprites/
// GET: returns available sprite files with paths and metadata
// Cached in globalThis across hot-reloads for performance

import { NextRequest, NextResponse } from 'next/server'
import { readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import sharp from 'sharp'

export const dynamic = 'force-dynamic'

interface SpriteEntry {
  id: string
  path: string
  name: string
  category: string
  size: { width: number; height: number } | null
  url: string
}

// Cache in globalThis so it persists across hot-reloads
const g = globalThis as unknown as {
  __spriteCatalog?: { sprites: SpriteEntry[]; timestamp: number }
}

function scanDirectory(dir: string, baseDir: string, category: string): Omit<SpriteEntry, 'size'>[] {
  const entries: Omit<SpriteEntry, 'size'>[] = []

  try {
    const items = readdirSync(dir)
    for (const item of items) {
      const fullPath = join(dir, item)
      const stat = statSync(fullPath)

      if (stat.isDirectory()) {
        entries.push(...scanDirectory(fullPath, baseDir, `${category}/${item}`))
      } else if (/\.(png|jpg|jpeg|gif|webp)$/i.test(item)) {
        const relPath = relative(baseDir, fullPath)
        const id = relPath.replace(/\.[^.]+$/, '').replace(/[\\/]/g, '_')
        entries.push({
          id,
          path: relPath,
          name: item.replace(/\.[^.]+$/, ''),
          category,
          url: `/sprites/${relPath}`,
        })
      }
    }
  } catch {
    // Directory doesn't exist or not readable
  }

  return entries
}

async function buildCatalog(): Promise<SpriteEntry[]> {
  const spritesDir = join(process.cwd(), 'public', 'sprites')
  const rawEntries = scanDirectory(spritesDir, spritesDir, 'root')

  // Infer sizes from category conventions rather than reading every file
  // pixel-chars are 64x64, roguelike tiles are 16x16
  const entries: SpriteEntry[] = rawEntries.map(entry => {
    let size: { width: number; height: number } | null = null
    if (entry.category.includes('pixel-chars')) {
      size = { width: 64, height: 64 }
    } else if (entry.name === 'roguelike-tiles') {
      size = { width: 496, height: 496 } // full tileset
    }
    return { ...entry, size }
  })

  return entries
}

// Auth check — bearer token
function authorize(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  const envToken = process.env.ENGINE_AGENT_TOKEN || process.env.ANTHROPIC_API_KEY
  return !!envToken && token === envToken
}

export async function GET(req: NextRequest) {
  // Allow unauthenticated catalog browsing (read-only)
  const CACHE_TTL = 60_000 // 1 minute

  // Return cached catalog if fresh
  if (g.__spriteCatalog && Date.now() - g.__spriteCatalog.timestamp < CACHE_TTL) {
    const sprites = g.__spriteCatalog.sprites
    const categories: Record<string, SpriteEntry[]> = {}
    for (const sprite of sprites) {
      const cat = sprite.category
      if (!categories[cat]) categories[cat] = []
      categories[cat].push(sprite)
    }
    return NextResponse.json({
      total: sprites.length,
      categories,
      sprites,
      cached: true,
    })
  }

  // Build fresh catalog
  const sprites = await buildCatalog()
  g.__spriteCatalog = { sprites, timestamp: Date.now() }

  const categories: Record<string, SpriteEntry[]> = {}
  for (const sprite of sprites) {
    const cat = sprite.category
    if (!categories[cat]) categories[cat] = []
    categories[cat].push(sprite)
  }

  return NextResponse.json({
    total: sprites.length,
    categories,
    sprites,
  })
}
