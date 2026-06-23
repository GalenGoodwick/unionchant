#!/usr/bin/env npx tsx
/**
 * One-time GLSL → WGSL migration script for saved engine state.
 *
 * Reads .engine-store.json, converts all GLSL fieldEffect / interactionEffect / cellUpdate
 * shader bodies to WGSL, and writes back.
 *
 * Run:  npx tsx scripts/migrate-glsl-to-wgsl.ts
 *
 * This is a throwaway script. Delete after migration.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const STORE_PATH = resolve(__dirname, '../.engine-store.json')

// ─── Type transforms ───
const TYPE_MAP: [RegExp, string][] = [
  [/\bvec2\b/g, 'vec2f'],
  [/\bvec3\b/g, 'vec3f'],
  [/\bvec4\b/g, 'vec4f'],
  [/\bivec2\b/g, 'vec2i'],
  [/\bivec3\b/g, 'vec3i'],
  [/\bivec4\b/g, 'vec4i'],
  [/\buvec2\b/g, 'vec2u'],
  [/\buvec3\b/g, 'vec3u'],
  [/\buvec4\b/g, 'vec4u'],
  [/\bmat2\b/g, 'mat2x2f'],
  [/\bmat3\b/g, 'mat3x3f'],
  [/\bmat4\b/g, 'mat4x4f'],
  [/\bfloat\b/g, 'f32'],
  [/\bint\b/g, 'i32'],
  [/\buint\b/g, 'u32'],
  [/\bbool\b/g, 'bool'],
]

// ─── Function call transforms ───
const FUNC_MAP: [RegExp, string][] = [
  // texture() → textureSample()
  [/\btexture\s*\(/g, 'textureSample('],
  // mod() → glsl_mod() (preserves GLSL semantics: x - y * floor(x / y))
  [/\bmod\s*\(/g, 'glsl_mod('],
  // atan(y, x) → atan2(y, x)
  [/\batan\s*\(\s*([^,]+),\s*([^)]+)\)/g, 'atan2($1, $2)'],
  // fract, floor, ceil, abs, sign, step, smoothstep, mix, clamp — same in WGSL
  // length, distance, dot, normalize, cross, reflect, refract — same
  // min, max, pow, exp, log, sqrt, sin, cos, tan — same
]

// ─── Variable declaration transforms ───
function transformDeclarations(code: string): string {
  // GLSL:  float x = ...;   →  var x: f32 = ...;
  // GLSL:  vec2 uv = ...;   →  var uv: vec2f = ...;
  // GLSL:  const float x = ... → let x: f32 = ...;

  // Handle const declarations → let
  code = code.replace(/\bconst\s+(f32|i32|u32|bool|vec[234][fiu]|mat[234]x[234]f)\s+(\w+)\s*=/g,
    'let $2: $1 =')

  // Handle variable declarations → var
  code = code.replace(/^(\s*)(f32|i32|u32|bool|vec[234][fiu]|mat[234]x[234]f)\s+(\w+)\s*=/gm,
    '$1var $3: $2 =')

  // Handle declarations without initialization → var
  code = code.replace(/^(\s*)(f32|i32|u32|bool|vec[234][fiu]|mat[234]x[234]f)\s+(\w+)\s*;/gm,
    '$1var $3: $2;')

  return code
}

// ─── Function declaration transforms ───
function transformFunctionDecls(code: string): string {
  // GLSL:  vec4 fieldEffect(vec2 a, float b) { ... }
  // WGSL:  fn fieldEffect(a: vec2f, b: f32) -> vec4f { ... }

  // Match function declarations (return_type name(params) {)
  return code.replace(
    /\b(f32|i32|u32|bool|vec[234][fiu]|mat[234]x[234]f|void)\s+(\w+)\s*\(([^)]*)\)\s*\{/g,
    (_, retType: string, name: string, params: string) => {
      // Transform parameter list
      const wgslParams = params
        .split(',')
        .filter(p => p.trim())
        .map(p => {
          const parts = p.trim().split(/\s+/)
          if (parts.length >= 2) {
            const type = parts[0]
            const pname = parts[1]
            return `${pname}: ${type}`
          }
          return p.trim()
        })
        .join(', ')

      const retStr = retType === 'void' ? '' : ` -> ${retType}`
      return `fn ${name}(${wgslParams})${retStr} {`
    }
  )
}

// ─── Uniform reference transforms ───
function transformUniformRefs(code: string): string {
  // u_gridSize → frame.gridSize
  code = code.replace(/\bu_gridSize\b/g, 'frame.gridSize')
  // u_time → frame.time
  code = code.replace(/\bu_time\b/g, 'frame.time')
  // u_camera → frame.camera
  code = code.replace(/\bu_camera\b/g, 'frame.camera')
  // u_resolution → frame.resolution
  code = code.replace(/\bu_resolution\b/g, 'frame.resolution')
  // u_zoom → frame.zoom
  code = code.replace(/\bu_zoom\b/g, 'frame.zoom')
  // u_effectBounds → effect.bounds
  code = code.replace(/\bu_effectBounds\b/g, 'effect.bounds')
  // u_effectParams → effect.params
  code = code.replace(/\bu_effectParams\b/g, 'effect.params')
  // u_fieldTransform → effect.transform
  code = code.replace(/\bu_fieldTransform\b/g, 'effect.transform')
  // u_fieldAColor → effect.fieldAColor
  code = code.replace(/\bu_fieldAColor\b/g, 'effect.fieldAColor')
  // u_fieldBColor → effect.fieldBColor
  code = code.replace(/\bu_fieldBColor\b/g, 'effect.fieldBColor')
  // u_fieldMask reference
  code = code.replace(/\bu_fieldMask\b/g, 'fieldMask')
  // u_colorTex, u_stateTex
  code = code.replace(/\bu_colorTex\b/g, 'colorTex')
  code = code.replace(/\bu_stateTex\b/g, 'stateTex')
  return code
}

// ─── Misc syntax transforms ───
function transformMiscSyntax(code: string): string {
  // Remove #version, precision, in/out qualifiers
  code = code.replace(/^#version\s+.*$/gm, '')
  code = code.replace(/^precision\s+.*$/gm, '')
  code = code.replace(/^\s*(in|out|uniform)\s+.*$/gm, '')

  // Remove semicolons after closing braces (WGSL doesn't need them)
  code = code.replace(/\};/g, '}')

  // Array initialization: float[] → array<f32>
  code = code.replace(/\bf32\[\s*\]/g, 'array<f32>')
  code = code.replace(/\bi32\[\s*\]/g, 'array<i32>')

  // Ternary operator: a ? b : c → select(c, b, a)
  // Only handles simple cases (no nested ternaries)
  code = code.replace(/([a-zA-Z0-9_.()]+)\s*\?\s*([^:;]+)\s*:\s*([^;,)]+)/g,
    'select($3, $2, $1)')

  return code
}

function convertGlslToWgsl(glsl: string): string {
  if (!glsl || typeof glsl !== 'string') return glsl

  // Skip if it's already WGSL (has fn keyword and vec2f types)
  if (/\bfn\s+\w+\s*\(/.test(glsl) && /\bvec2f\b/.test(glsl)) {
    return glsl
  }

  let code = glsl

  // 1. Apply type replacements first
  for (const [pattern, replacement] of TYPE_MAP) {
    code = code.replace(pattern, replacement)
  }

  // 2. Transform function declarations
  code = transformFunctionDecls(code)

  // 3. Transform variable declarations
  code = transformDeclarations(code)

  // 4. Apply function call transforms
  for (const [pattern, replacement] of FUNC_MAP) {
    code = code.replace(pattern, replacement)
  }

  // 5. Transform uniform references
  code = transformUniformRefs(code)

  // 6. Misc syntax
  code = transformMiscSyntax(code)

  return code
}

// ─── Main ───

function main() {
  if (!existsSync(STORE_PATH)) {
    console.log('No .engine-store.json found — nothing to migrate.')
    process.exit(0)
  }

  const raw = readFileSync(STORE_PATH, 'utf-8')
  let store: Record<string, unknown>

  try {
    store = JSON.parse(raw)
  } catch {
    console.error('Failed to parse .engine-store.json')
    process.exit(1)
  }

  let converted = 0
  let skipped = 0

  // Migrate field effects
  const fields = (store.fields || []) as Array<Record<string, unknown>>
  for (const field of fields) {
    const effects = (field.effects || []) as Array<Record<string, unknown>>
    for (const effect of effects) {
      if (typeof effect.glsl === 'string' && effect.glsl.length > 0) {
        const original = effect.glsl
        effect.glsl = convertGlslToWgsl(original)
        if (effect.glsl !== original) {
          converted++
          console.log(`  Converted effect ${effect.id} on field ${field.name || field.id}`)
        } else {
          skipped++
        }
      }
    }
  }

  // Migrate interaction effects
  const interactions = (store.interactionEffects || []) as Array<Record<string, unknown>>
  for (const ie of interactions) {
    if (typeof ie.glsl === 'string' && ie.glsl.length > 0) {
      const original = ie.glsl
      ie.glsl = convertGlslToWgsl(original)
      if (ie.glsl !== original) {
        converted++
        console.log(`  Converted interaction effect ${ie.id}`)
      } else {
        skipped++
      }
    }
  }

  // Migrate GLSL mods
  const mods = (store.glslMods || []) as Array<Record<string, unknown>>
  for (const mod of mods) {
    if (typeof mod.code === 'string' && mod.code.length > 0) {
      const original = mod.code
      mod.code = convertGlslToWgsl(original)
      if (mod.code !== original) {
        converted++
        console.log(`  Converted mod ${mod.id}`)
      } else {
        skipped++
      }
    }
  }

  // Migrate state shader (if present)
  if (typeof store.stateShader === 'string' && store.stateShader.length > 0) {
    const original = store.stateShader as string
    store.stateShader = convertGlslToWgsl(original)
    if (store.stateShader !== original) {
      converted++
      console.log('  Converted state shader')
    }
  }

  // Write back
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8')

  console.log(`\nMigration complete: ${converted} converted, ${skipped} already WGSL/skipped`)
  console.log(`Updated: ${STORE_PATH}`)
}

main()
