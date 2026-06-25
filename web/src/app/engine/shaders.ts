// Field Engine — WGSL Shaders
// Split into base pass (grid + colors + selection highlight), effect pass (per-field WGSL),
// state update compute, and utility library

// ─── Vertex shader (fullscreen quad) ───

export const vertexShaderSource = /* wgsl */`
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn main(@builtin(vertex_index) vi: u32) -> VertexOutput {
  var positions = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f( 1.0, -1.0),
    vec2f(-1.0,  1.0),
    vec2f(-1.0,  1.0),
    vec2f( 1.0, -1.0),
    vec2f( 1.0,  1.0),
  );
  var uvs = array<vec2f, 6>(
    vec2f(0.0, 0.0),
    vec2f(1.0, 0.0),
    vec2f(0.0, 1.0),
    vec2f(0.0, 1.0),
    vec2f(1.0, 0.0),
    vec2f(1.0, 1.0),
  );
  var out: VertexOutput;
  out.position = vec4f(positions[vi], 0.0, 1.0);
  out.uv = uvs[vi];
  return out;
}
`

// ─── Per-frame uniform struct (Group 0) ───
const FRAME_UNIFORM_STRUCT = /* wgsl */`
struct FrameUniforms {
  camera: vec2f,
  resolution: vec2f,
  zoom: f32,
  time: f32,
  gridSize: f32,
  _pad: f32,
};
@group(0) @binding(0) var<uniform> frame: FrameUniforms;
`

// ─── Per-effect uniform struct (Group 2) ───
const EFFECT_UNIFORM_STRUCT = /* wgsl */`
struct EffectUniforms {
  bounds: vec4f,
  params: vec4f,
  transform: vec4f,
  fieldAColor: vec4f,
  fieldBColor: vec4f,
  fieldATransform: vec4f,
  fieldBTransform: vec4f,
};
@group(2) @binding(0) var<uniform> effect: EffectUniforms;
`

// ─── State update uniform struct ───
const STATE_UNIFORM_STRUCT = /* wgsl */`
struct StateUniforms {
  gridSize: f32,
  time: f32,
  dt: f32,
  _pad: f32,
};
@group(0) @binding(0) var<uniform> state_uniforms: StateUniforms;
`

// ─── Shared coordinate math — camera → grid coord conversion ───
const COORD_MATH = /* wgsl */`
  let aspect = frame.resolution.x / frame.resolution.y;
  let gridRange = vec2f(frame.gridSize) / frame.zoom;

  var gridCoord: vec2f;
  if (aspect > 1.0) {
    gridCoord.x = frame.camera.x + (in.uv.x - 0.5) * gridRange.x * aspect;
    gridCoord.y = frame.camera.y + (0.5 - in.uv.y) * gridRange.y;
  } else {
    gridCoord.x = frame.camera.x + (in.uv.x - 0.5) * gridRange.x;
    gridCoord.y = frame.camera.y + (0.5 - in.uv.y) * gridRange.y / aspect;
  }

  let texUV = gridCoord / frame.gridSize;
`

// ─── WGSL Utility Library ───
const SHADER_UTILITIES = /* wgsl */`
// --- Utility Library ---

// GLSL mod semantics: x - y * floor(x / y)
fn glsl_mod(x: f32, y: f32) -> f32 { return x - y * floor(x / y); }
fn glsl_mod2(x: vec2f, y: vec2f) -> vec2f { return x - y * floor(x / y); }

// Hash functions
fn hash11(p_in: f32) -> f32 {
  var p = fract(p_in * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

fn hash21(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, vec3f(p3.y, p3.z, p3.x) + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn hash22(p: vec2f) -> vec2f {
  var p3 = fract(vec3f(p.x, p.y, p.x) * vec3f(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, vec3f(p3.y, p3.z, p3.x) + 33.33);
  return fract((vec2f(p3.x, p3.x) + vec2f(p3.y, p3.z)) * vec2f(p3.z, p3.y));
}

fn hash33(p3_in: vec3f) -> vec3f {
  var p3 = fract(p3_in * vec3f(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, vec3f(p3.y, p3.x, p3.z) + 33.33);
  return fract((vec3f(p3.x, p3.x, p3.y) + vec3f(p3.y, p3.x, p3.x)) * vec3f(p3.z, p3.y, p3.x));
}

// Value noise
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  var f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Gradient noise (Perlin-like)
fn gnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(hash22(i) * 2.0 - 1.0, f),
                 dot(hash22(i + vec2f(1.0, 0.0)) * 2.0 - 1.0, f - vec2f(1.0, 0.0)), u.x),
             mix(dot(hash22(i + vec2f(0.0, 1.0)) * 2.0 - 1.0, f - vec2f(0.0, 1.0)),
                 dot(hash22(i + vec2f(1.0, 1.0)) * 2.0 - 1.0, f - vec2f(1.0, 1.0)), u.x), u.y);
}

// Fractal Brownian Motion (2D)
fn fbm(p: vec2f, octaves: i32) -> f32 {
  var val = 0.0;
  var amp = 0.5;
  var freq = 1.0;
  for (var i = 0; i < 8; i++) {
    if (i >= octaves) { break; }
    val += amp * vnoise(p * freq);
    freq *= 2.0;
    amp *= 0.5;
  }
  return val;
}

// 3D hash → scalar
fn hash31(p: vec3f) -> f32 {
  var p3 = fract(p * vec3f(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, vec3f(p3.y, p3.z, p3.x) + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// 3D value noise — trilinear interpolation of hashed cube corners
fn vnoise3(p: vec3f) -> f32 {
  let i = floor(p);
  var f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  let a = hash31(i);
  let b = hash31(i + vec3f(1.0, 0.0, 0.0));
  let c = hash31(i + vec3f(0.0, 1.0, 0.0));
  let d = hash31(i + vec3f(1.0, 1.0, 0.0));
  let e = hash31(i + vec3f(0.0, 0.0, 1.0));
  let g = hash31(i + vec3f(1.0, 0.0, 1.0));
  let h = hash31(i + vec3f(0.0, 1.0, 1.0));
  let k = hash31(i + vec3f(1.0, 1.0, 1.0));
  let x1 = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  let x2 = mix(mix(e, g, f.x), mix(h, k, f.x), f.y);
  return mix(x1, x2, f.z);
}

// 3D Fractal Brownian Motion
fn fbm3d(p: vec3f, octaves: i32) -> f32 {
  var val = 0.0;
  var amp = 0.5;
  var freq = 1.0;
  for (var i = 0; i < 8; i++) {
    if (i >= octaves) { break; }
    val += amp * vnoise3(p * freq);
    freq *= 2.0;
    amp *= 0.5;
  }
  return val;
}

// Domain warping
fn warp(p: vec2f, strength: f32, time: f32) -> vec2f {
  let q = vec2f(fbm(p + vec2f(0.0, 0.0), 4), fbm(p + vec2f(5.2, 1.3), 4));
  let r = vec2f(fbm(p + 4.0 * q + vec2f(1.7, 9.2) + 0.15 * time, 4),
                fbm(p + 4.0 * q + vec2f(8.3, 2.8) + 0.126 * time, 4));
  return p + strength * r;
}

// SDF primitives (2D)
fn sdCircle(p: vec2f, r: f32) -> f32 { return length(p) - r; }
fn sdBox(p: vec2f, b: vec2f) -> f32 { let d = abs(p) - b; return length(max(d, vec2f(0.0))) + min(max(d.x, d.y), 0.0); }
fn sdRoundedBox(p: vec2f, b: vec2f, r: f32) -> f32 { return sdBox(p, b - r) - r; }
fn sdSegment(p: vec2f, a: vec2f, b: vec2f) -> f32 { let pa = p - a; let ba = b - a; let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
fn sdEquilateralTriangle(p_in: vec2f, r: f32) -> f32 {
  let k = 1.732050808;
  var p = p_in;
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) { p = vec2f(p.x - k * p.y, -k * p.x - p.y) / 2.0; }
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}
fn sdStar(p_in: vec2f, r: f32, n: i32, m: f32) -> f32 {
  let an = 3.141593 / f32(n);
  let en = 3.141593 / m;
  let acs = vec2f(cos(an), sin(an));
  let ecs = vec2f(cos(en), sin(en));
  let bn = glsl_mod(atan2(p_in.x, p_in.y), 2.0 * an) - an;
  var p = length(p_in) * vec2f(cos(bn), abs(sin(bn)));
  p -= r * acs;
  p += ecs * clamp(-dot(p, ecs), 0.0, r * acs.y / ecs.y);
  return length(p) * sign(p.x);
}

// SDF operations
fn opUnion(d1: f32, d2: f32) -> f32 { return min(d1, d2); }
fn opSubtract(d1: f32, d2: f32) -> f32 { return max(-d1, d2); }
fn opIntersect(d1: f32, d2: f32) -> f32 { return max(d1, d2); }
fn opSmoothUnion(d1: f32, d2: f32, k: f32) -> f32 { let h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0); return mix(d2, d1, h) - k * h * (1.0 - h); }
fn opSmoothSubtract(d1: f32, d2: f32, k: f32) -> f32 { let h = clamp(0.5 - 0.5 * (d2 + d1) / k, 0.0, 1.0); return mix(d2, -d1, h) + k * h * (1.0 - h); }

// Color utilities
fn hsv2rgb(c: vec3f) -> vec3f {
  let K = vec4f(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  let p = abs(fract(vec3f(c.x) + vec3f(K.x, K.y, K.z)) * 6.0 - vec3f(K.w));
  return c.z * mix(vec3f(K.x), clamp(p - vec3f(K.x), vec3f(0.0), vec3f(1.0)), c.y);
}

fn palette(t: f32, a: vec3f, b: vec3f, c: vec3f, d: vec3f) -> vec3f {
  return a + b * cos(6.28318 * (c * t + d));
}

// Rotation matrix
fn rot2(a: f32) -> mat2x2f { let c = cos(a); let s = sin(a); return mat2x2f(c, -s, s, c); }

// Normalize position within region to 0..1
fn regionUV(cellPos: vec2f, regionMin: vec2f, regionMax: vec2f) -> vec2f {
  return (cellPos - regionMin) / max(regionMax - regionMin, vec2f(1.0));
}

// Centered region UV (-1..1)
fn regionUVCentered(cellPos: vec2f, regionMin: vec2f, regionMax: vec2f) -> vec2f {
  return regionUV(cellPos, regionMin, regionMax) * 2.0 - 1.0;
}

// Aspect-corrected centered UV
fn regionUVAspect(cellPos: vec2f, regionMin: vec2f, regionMax: vec2f) -> vec2f {
  var uv = regionUVCentered(cellPos, regionMin, regionMax);
  let size = regionMax - regionMin;
  let aspect = size.x / max(size.y, 1.0);
  uv.x *= aspect;
  return uv;
}

// Simple lighting
fn diffuseLight(p: vec2f, lightPos: vec2f, falloff: f32) -> f32 {
  let d = length(p - lightPos);
  return 1.0 / (1.0 + d * d * falloff);
}

// Glow effect
fn glow(d: f32, col: vec3f, intensity: f32, radius: f32) -> vec3f {
  return col * intensity * exp(-d * d / (radius * radius));
}

// ─── Agent-Friendly Convenience Wrappers ───
// These have fewer arguments and simpler signatures so AI agents can use them without errors.

// FBM with preset octave counts — 2D versions
fn fbm3(p: vec2f) -> f32 { return fbm(p, 3); }
fn fbm4(p: vec2f) -> f32 { return fbm(p, 4); }
fn fbm5(p: vec2f) -> f32 { return fbm(p, 5); }
fn fbm6(p: vec2f) -> f32 { return fbm(p, 6); }

// FBM with preset octave counts — 3D versions (use vec3f for time-animated noise)
fn fbm3v(p: vec3f) -> f32 { return fbm3d(p, 3); }
fn fbm4v(p: vec3f) -> f32 { return fbm3d(p, 4); }
fn fbm5v(p: vec3f) -> f32 { return fbm3d(p, 5); }
fn fbm6v(p: vec3f) -> f32 { return fbm3d(p, 6); }

// Rotate a 2D point by angle (agents struggled with rot2() * vec2f multiplication)
fn rotate(p: vec2f, angle: f32) -> vec2f { return rot2(angle) * p; }

// Simple noise at a point — 2D and 3D
fn noise(p: vec2f) -> f32 { return vnoise(p); }
fn noisev(p: vec3f) -> f32 { return vnoise3(p); }
fn noise3(p: vec2f) -> f32 { return fbm(p, 3); }

// Simple circle mask: 1.0 inside, 0.0 outside, with smooth edge
fn circleMask(uv: vec2f, radius: f32) -> f32 { return smoothstep(radius, radius - 0.05, length(uv)); }

// Polar coordinates from centered UV
fn polar(uv: vec2f) -> vec2f { return vec2f(length(uv), atan2(uv.y, uv.x)); }

// Quick color ramp between two colors based on value 0..1
fn colorRamp(a: vec3f, b: vec3f, t: f32) -> vec3f { return mix(a, b, clamp(t, 0.0, 1.0)); }

// Soft glow centered at origin
fn softGlow(uv: vec2f, intensity: f32, radius: f32) -> f32 { return intensity * exp(-dot(uv, uv) / (radius * radius)); }

// Ring shape: returns intensity of a ring at given radius with given width
fn ring(uv: vec2f, radius: f32, width: f32) -> f32 { return exp(-pow(length(uv) - radius, 2.0) / (width * width)); }

// --- End Utility Library ---
`

// Extract function names defined in the base SHADER_UTILITIES
const BASE_FUNC_NAMES: Set<string> = new Set()
{
  const funcDefRegex = /fn\s+(\w+)\s*\(/g
  let m: RegExpExecArray | null
  while ((m = funcDefRegex.exec(SHADER_UTILITIES)) !== null) {
    BASE_FUNC_NAMES.add(m[1])
  }
}

/**
 * Auto-fix agent WGSL: rewrite vec2f function calls that got vec3f arguments
 * to use the 3D variant instead. e.g. fbm4(vec3f(...)) → fbm4v(vec3f(...))
 */
const VEC2_TO_VEC3_FUNCS: Record<string, string> = {
  'vnoise': 'vnoise3', 'noise': 'noisev', 'fbm3': 'fbm3v', 'fbm4': 'fbm4v',
  'fbm5': 'fbm5v', 'fbm6': 'fbm6v',
}
function autoFixVec3Calls(code: string): string {
  for (const [fn2d, fn3d] of Object.entries(VEC2_TO_VEC3_FUNCS)) {
    // Match funcName(vec3f( — the agent passed a vec3f to a vec2f function
    const pattern = new RegExp(`\\b${fn2d}\\(\\s*vec3f\\(`, 'g')
    code = code.replace(pattern, `${fn3d}(vec3f(`)
  }
  return code
}

/**
 * Strip duplicate WGSL function definitions from mod code.
 * Single pass: accumulates seen names as it goes, so both base conflicts
 * and cross-mod conflicts are handled.
 */
function deduplicateModCode(code: string, seen: Set<string>): string {
  const funcStartRegex = /fn\s+(\w+)\s*\([^)]*\)\s*(?:-> [^{]+)?\{/g
  let result = ''
  let lastEnd = 0

  let match: RegExpExecArray | null
  while ((match = funcStartRegex.exec(code)) !== null) {
    const funcName = match[1]
    const braceStart = match.index + match[0].length - 1
    let depth = 1
    let pos = braceStart + 1
    while (pos < code.length && depth > 0) {
      if (code[pos] === '{') depth++
      else if (code[pos] === '}') depth--
      pos++
    }

    if (seen.has(funcName)) {
      result += code.slice(lastEnd, match.index)
      lastEnd = pos
      funcStartRegex.lastIndex = pos
    } else {
      seen.add(funcName)
    }
  }
  result += code.slice(lastEnd)
  return result
}

/** Get the SHADER_UTILITIES string with optional mod code appended (duplicates stripped) */
export function getShaderUtilities(modCode?: string): string {
  if (!modCode) return SHADER_UTILITIES
  const seen = new Set(BASE_FUNC_NAMES)
  const cleaned = deduplicateModCode(modCode, seen)
  return SHADER_UTILITIES + '\n// --- WGSL Mods ---\n' + cleaned + '\n// --- End WGSL Mods ---\n'
}

/**
 * Base pass: grid lines, painted colors, selection highlight.
 * No fieldEffect(). Uses u_selectionTex for UI selection highlight only.
 */
export function buildBaseFragmentShader(): string {
  return /* wgsl */`
${FRAME_UNIFORM_STRUCT}

@group(1) @binding(0) var colorTex: texture_2d<f32>;
@group(1) @binding(1) var stateTex: texture_2d<f32>;
@group(1) @binding(2) var selectionTex: texture_2d<f32>;
@group(1) @binding(3) var effectTex: texture_2d<f32>;
@group(1) @binding(4) var texSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@fragment
fn main(in: VertexOutput) -> @location(0) vec4f {
${COORD_MATH}

  // Use textureLoad (integer coords, no sampler) — works on all GPUs including
  // those without float32-filterable (Safari). No filtering needed for a grid engine.
  let texCoord = vec2i(clamp(vec2i(floor(gridCoord)), vec2i(0), vec2i(i32(frame.gridSize) - 1)));
  let cellColor = textureLoad(colorTex, texCoord, 0);
  let selection = textureLoad(selectionTex, texCoord, 0).r;
  let effectPixel = textureLoad(effectTex, texCoord, 0);

  // Out-of-bounds background
  if (texUV.x < 0.0 || texUV.x > 1.0 || texUV.y < 0.0 || texUV.y > 1.0) {
    return vec4f(0.035, 0.045, 0.065, 1.0);
  }

  // Grid lines
  let cellSize = frame.resolution.y * frame.zoom / frame.gridSize;
  let gridAlpha = smoothstep(2.0, 6.0, cellSize) * 0.15;
  let cellFrac = fract(gridCoord);
  let lineWidth = 1.0 / max(cellSize, 1.0);
  let gridLine = 1.0 - step(lineWidth, cellFrac.x) * step(lineWidth, cellFrac.y)
                     * step(cellFrac.x, 1.0 - lineWidth) * step(cellFrac.y, 1.0 - lineWidth);

  let bg = vec3f(0.055, 0.065, 0.09);
  var color = bg;

  // Grid lines
  let gridColor = vec3f(0.15, 0.18, 0.22);
  color = mix(color, gridColor, gridLine * gridAlpha);

  // Selection highlight
  if (selection > 0.5) {
    let pulse = 0.5 + 0.5 * sin(frame.time * 3.0);
    color = mix(color, vec3f(1.0), 0.08 + 0.04 * pulse);
    let selTexCoord = vec2i(floor(gridCoord));
    let nL = textureLoad(selectionTex, selTexCoord + vec2i(-1, 0), 0).r;
    let nR = textureLoad(selectionTex, selTexCoord + vec2i(1, 0), 0).r;
    let nU = textureLoad(selectionTex, selTexCoord + vec2i(0, -1), 0).r;
    let nD = textureLoad(selectionTex, selTexCoord + vec2i(0, 1), 0).r;
    let edge = step(0.5, 1.0 - min(min(nL, nR), min(nU, nD)));
    color = mix(color, vec3f(0.3, 0.7, 1.0), edge * (0.4 + 0.2 * pulse));
  }

  // --- Effect layer rendering ---
  let effectType = effectPixel.r;

  if (effectType > 0.5) {
    let hue = effectPixel.g;
    let brightness = effectPixel.b;
    let intensity = effectPixel.a;

    let h6 = hue * 6.0;
    let h6i = floor(h6);
    let f = h6 - h6i;
    let q = 1.0 - f;
    let t = f;
    var effectColor: vec3f;
    if (h6i < 1.0) { effectColor = vec3f(1.0, t, 0.0); }
    else if (h6i < 2.0) { effectColor = vec3f(q, 1.0, 0.0); }
    else if (h6i < 3.0) { effectColor = vec3f(0.0, 1.0, t); }
    else if (h6i < 4.0) { effectColor = vec3f(0.0, q, 1.0); }
    else if (h6i < 5.0) { effectColor = vec3f(t, 0.0, 1.0); }
    else { effectColor = vec3f(1.0, 0.0, q); }
    effectColor *= brightness;

    // Glow from neighbors
    var glowVal = 0.0;
    let glowCenter = vec2i(floor(gridCoord));
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        if (dx == 0 && dy == 0) { continue; }
        let nbCoord = glowCenter + vec2i(dx, dy);
        let nbData = textureLoad(effectTex, nbCoord, 0);
        if (nbData.r > 0.5) { glowVal += nbData.a; }
      }
    }
    glowVal = min(glowVal * 0.06, 0.8);

    color = mix(color, effectColor, intensity * 0.9);
    color += effectColor * glowVal * 0.4;
  }

  return vec4f(color, 1.0);
}
`
}

/**
 * Effect pass: per-field WGSL effect. Outputs alpha-blended result.
 */
export function buildEffectFragmentShader(injectedWgsl: string, modCode?: string): string {
  // Auto-fix common agent mistake: passing vec3f to vec2f functions
  const fixedWgsl = autoFixVec3Calls(injectedWgsl)
  return /* wgsl */`
${FRAME_UNIFORM_STRUCT}

@group(1) @binding(0) var colorTex: texture_2d<f32>;
@group(1) @binding(1) var stateTex: texture_2d<f32>;
@group(1) @binding(2) var fieldMask: texture_2d<f32>;
@group(1) @binding(3) var feedbackTex: texture_2d<f32>;
@group(1) @binding(4) var texSampler: sampler;

${EFFECT_UNIFORM_STRUCT}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

${getShaderUtilities(modCode)}

// Map cell coordinate to feedback texture UV (0..1 within effect bounds)
fn feedbackUV(cellCoord: vec2f) -> vec2f {
  var uv = clamp((cellCoord - effect.bounds.xy) / max(effect.bounds.zw - effect.bounds.xy, vec2f(1.0)), vec2f(0.0), vec2f(1.0));
  uv.y = 1.0 - uv.y;
  return uv;
}

${fixedWgsl}

@fragment
fn main(in: VertexOutput) -> @location(0) vec4f {
${COORD_MATH}

  let regionMin = effect.bounds.xy;
  let regionMax = effect.bounds.zw;

  // Snap to cell center
  let cellCoord = floor(gridCoord) + 0.5;

  // Call fieldEffect in uniform control flow (before any non-uniform branches)
  // so that user-injected code can safely use textureSample
  let effectResult = fieldEffect(cellCoord, regionMin, regionMax, frame.time, effect.params);

  if (texUV.x < 0.0 || texUV.x > 1.0 || texUV.y < 0.0 || texUV.y > 1.0) {
    return vec4f(0.0);
  }
  return vec4f(effectResult.rgb, clamp(effectResult.a, 0.0, 1.0));
}
`
}

/**
 * State update compute shader template.
 * Agent provides a cellUpdate function:
 *   fn cellUpdate(coord: vec2f, state: vec4f, color: vec4f, time: f32, dt: f32) -> vec4f
 */
export function buildStateUpdateComputeShader(injectedWgsl: string, modCode?: string): string {
  return buildCompositeStateComputeShader([{ id: 'single', wgsl: injectedWgsl }], modCode)
}

/**
 * Build a composite state compute shader from multiple field contributions.
 * ADDITIVE composition: all shaders read ORIGINAL state, deltas are summed.
 */
export function buildCompositeStateComputeShader(fields: { id: string; wgsl: string }[], modCode?: string): string {
  const renamedFunctions = fields.map((f, i) => {
    return f.wgsl.replace(/cellUpdate\s*\(/g, `cellUpdate_${i}(`)
  })

  const deltaCalls = fields.map((_, i) => {
    return `  let out${i} = cellUpdate_${i}(coord, state, color, state_uniforms.time, state_uniforms.dt);
  delta += (out${i} - state);`
  })

  return /* wgsl */`
${STATE_UNIFORM_STRUCT}

@group(1) @binding(0) var stateTex: texture_2d<f32>;
@group(1) @binding(1) var colorTex: texture_2d<f32>;
@group(1) @binding(2) var outputTex: texture_storage_2d<rgba32float, write>;

${getShaderUtilities(modCode)}

${renamedFunctions.join('\n\n')}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let gs = u32(state_uniforms.gridSize);
  if (gid.x >= gs || gid.y >= gs) { return; }

  let coord = vec2f(f32(gid.x) + 0.5, f32(gid.y) + 0.5);
  let uv = coord / state_uniforms.gridSize;
  let texCoord = vec2i(gid.xy);
  let state = textureLoad(stateTex, texCoord, 0);
  let color = textureLoad(colorTex, texCoord, 0);

  var delta = vec4f(0.0);
${deltaCalls.join('\n')}
  textureStore(outputTex, texCoord, clamp(state + delta, vec4f(0.0), vec4f(1.0)));
}
`
}

// Backward compat: buildStateUpdateShader wraps single field
export function buildStateUpdateShader(wgsl: string, modCode?: string): string {
  return buildCompositeStateComputeShader([{ id: 'single', wgsl }], modCode)
}

export function buildCompositeStateShader(fields: { id: string; wgsl: string }[], modCode?: string): string {
  return buildCompositeStateComputeShader(fields, modCode)
}

/**
 * Mask clear shader — erases underlying pixels where an interaction mask is active.
 */
export function buildMaskClearShader(): string {
  return /* wgsl */`
${FRAME_UNIFORM_STRUCT}

@group(1) @binding(0) var fieldMask: texture_2d<f32>;
@group(1) @binding(1) var texSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@fragment
fn main(in: VertexOutput) -> @location(0) vec4f {
${COORD_MATH}
  // Use textureLoad — works on all GPUs (no sampler/filtering needed)
  let maskTexCoord = vec2i(clamp(vec2i(floor(gridCoord)), vec2i(0), vec2i(i32(frame.gridSize) - 1)));
  let maskVal = textureLoad(fieldMask, maskTexCoord, 0).r;
  if (texUV.x < 0.0 || texUV.x > 1.0 || texUV.y < 0.0 || texUV.y > 1.0) {
    discard;
  }
  if (maskVal < 0.5) { discard; }
  return vec4f(0.055, 0.065, 0.09, 1.0);
}
`
}

/**
 * World effect pass: full-grid WGSL effect with no field mask.
 */
export function buildWorldEffectFragmentShader(injectedWgsl: string, modCode?: string): string {
  return /* wgsl */`
${FRAME_UNIFORM_STRUCT}

@group(1) @binding(0) var colorTex: texture_2d<f32>;
@group(1) @binding(1) var stateTex: texture_2d<f32>;
@group(1) @binding(4) var texSampler: sampler;

${EFFECT_UNIFORM_STRUCT}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

${getShaderUtilities(modCode)}

${injectedWgsl}

@fragment
fn main(in: VertexOutput) -> @location(0) vec4f {
${COORD_MATH}

  let cellCoord = floor(gridCoord) + 0.5;

  // Call fieldEffect in uniform control flow so user code can use textureSample
  let effectResult = fieldEffect(cellCoord, vec2f(0.0), vec2f(frame.gridSize), frame.time, effect.params);

  if (texUV.x < 0.0 || texUV.x > 1.0 || texUV.y < 0.0 || texUV.y > 1.0) {
    return vec4f(0.0);
  }
  return vec4f(effectResult.rgb, clamp(effectResult.a, 0.0, 1.0));
}
`
}

/** Default field effect — SDF circle at field position using transform. */
export const DEFAULT_FIELD_EFFECT_WGSL = /* wgsl */`
fn fieldEffect(coord: vec2f, regionMin: vec2f, regionMax: vec2f, time: f32, params: vec4f) -> vec4f {
  let pos = effect.transform.xy;
  let d = length(coord - pos);
  let r = (regionMax.x - regionMin.x) * 0.5;
  let alpha = smoothstep(r + 0.5, r - 0.5, d);
  return vec4f(params.rgb, params.a * alpha);
}
`

// ─── Compute effect pipeline shaders ───

/**
 * Compute shader version of effect pass.
 * Dispatched over a field's pixel region only. Reads/blends into a storage buffer.
 * Uses storage buffer (universally supported) instead of read_write storage textures.
 */
export function buildEffectComputeShader(injectedWgsl: string, modCode?: string): string {
  const fixedWgsl = autoFixVec3Calls(injectedWgsl)
  return /* wgsl */`
${FRAME_UNIFORM_STRUCT}

@group(1) @binding(0) var colorTex: texture_2d<f32>;
@group(1) @binding(1) var stateTex: texture_2d<f32>;
@group(1) @binding(2) var fieldMask: texture_2d<f32>;
@group(1) @binding(3) var feedbackTex: texture_2d<f32>;
@group(1) @binding(4) var texSampler: sampler;

${EFFECT_UNIFORM_STRUCT}

struct DispatchRegion {
  offset: vec2f,
  size: vec2f,
};
@group(3) @binding(0) var<uniform> dispatchRegion: DispatchRegion;
@group(3) @binding(1) var<storage, read_write> accumBuf: array<vec4f>;

${getShaderUtilities(modCode)}

fn feedbackUV(cellCoord: vec2f) -> vec2f {
  var uv = clamp((cellCoord - effect.bounds.xy) / max(effect.bounds.zw - effect.bounds.xy, vec2f(1.0)), vec2f(0.0), vec2f(1.0));
  uv.y = 1.0 - uv.y;
  return uv;
}

${fixedWgsl}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let pixel = vec2f(f32(gid.x) + dispatchRegion.offset.x, f32(gid.y) + dispatchRegion.offset.y);
  let pixelI = vec2i(i32(pixel.x), i32(pixel.y));
  let stride = u32(frame.resolution.x);

  if (pixel.x < 0.0 || pixel.y < 0.0 || pixel.x >= frame.resolution.x || pixel.y >= frame.resolution.y) { return; }

  // Pixel → UV (match fragment shader convention: UV y=0 at bottom, y=1 at top)
  let uv = vec2f((pixel.x + 0.5) / frame.resolution.x, 1.0 - (pixel.y + 0.5) / frame.resolution.y);

  // UV → grid coordinate (same as fragment shader COORD_MATH)
  let aspect = frame.resolution.x / frame.resolution.y;
  let gridRange = vec2f(frame.gridSize) / frame.zoom;
  var gridCoord: vec2f;
  if (aspect > 1.0) {
    gridCoord.x = frame.camera.x + (uv.x - 0.5) * gridRange.x * aspect;
    gridCoord.y = frame.camera.y + (0.5 - uv.y) * gridRange.y;
  } else {
    gridCoord.x = frame.camera.x + (uv.x - 0.5) * gridRange.x;
    gridCoord.y = frame.camera.y + (0.5 - uv.y) * gridRange.y / aspect;
  }

  let texUV = gridCoord / frame.gridSize;
  if (texUV.x < 0.0 || texUV.x > 1.0 || texUV.y < 0.0 || texUV.y > 1.0) { return; }

  let cellCoord = floor(gridCoord) + 0.5;
  let regionMin = effect.bounds.xy;
  let regionMax = effect.bounds.zw;

  let result = fieldEffect(cellCoord, regionMin, regionMax, frame.time, effect.params);
  let alpha = clamp(result.a, 0.0, 1.0);
  if (alpha < 0.002) { return; }

  // Alpha-blend into accumulation buffer
  let idx = u32(pixelI.y) * stride + u32(pixelI.x);
  let existing = accumBuf[idx];
  accumBuf[idx] = vec4f(
    mix(existing.rgb, result.rgb, alpha),
    existing.a + alpha * (1.0 - existing.a),
  );
}
`
}

/**
 * Clear compute shader — zeros the accumulation buffer.
 */
export function buildAccumClearComputeShader(): string {
  return /* wgsl */`
@group(0) @binding(0) var<storage, read_write> buf: array<vec4f>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x < arrayLength(&buf)) {
    buf[gid.x] = vec4f(0.0);
  }
}
`
}

/**
 * Blit shader — reads from accumulation storage buffer and outputs to screen.
 */
export function buildBlitFragmentShader(): string {
  return /* wgsl */`
${FRAME_UNIFORM_STRUCT}

@group(1) @binding(0) var<storage, read> accumBuf: array<vec4f>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@fragment
fn main(in: VertexOutput) -> @location(0) vec4f {
  let pixel = vec2u(in.position.xy);
  let stride = u32(frame.resolution.x);
  let idx = pixel.y * stride + pixel.x;
  let color = accumBuf[idx];
  if (color.a < 0.001) { discard; }
  return color;
}
`
}

// ─── Dynamic Visual Type System ───

/** Visual type definition — each type provides a WGSL rendering function.
 *  Function signature: fn visual_NAME(uv: vec2f, sdf: f32, color: vec4f, time: f32, params: vec4f) -> vec4f
 *  - uv: local UV coordinates within the field (-1..1)
 *  - sdf: signed distance to field boundary (negative = inside)
 *  - color: field's base color (RGBA)
 *  - time: current frame time in seconds
 *  - params: 4 custom parameters from visualParams
 *  Returns: RGBA color for this pixel (alpha=0 means transparent)
 */
export interface VisualTypeEntry {
  id: number
  name: string
  /** Complete WGSL function definition */
  wgsl: string
}

// No built-in visual types. All visual types are defined at runtime via define_visual.
// The uber-shader's default case provides a basic solid fill as fallback.

/** Interaction visual — renders at pixels where two specific fields overlap.
 *  Function signature: fn interaction_NAME(uvA: vec2f, uvB: vec2f, colorA: vec4f, colorB: vec4f, time: f32) -> vec4f
 *  - uvA/uvB: local UV coordinates within each field (-1..1)
 *  - colorA/colorB: base colors of each field
 *  - time: frame time in seconds
 *  Returns: RGBA color to render at the overlap pixel (replaces both field visuals) */
export interface InteractionEntry {
  id: number
  name: string
  wgsl: string
}

// ─── Superimposed rendering compute shader ───

/**
 * Uber-shader for superimposed rendering. All fields are evaluated in a single
 * compute pass. Each pixel loops over every field, evaluates SDF membership and
 * visual type, and resolves overlaps natively (no alpha compositing between fields).
 *
 * Fields are stored in a storage buffer as packed FieldGPU structs (5 vec4f each).
 * Visual types are parameterized function IDs dispatched via switch.
 */
export function buildSuperimposedComputeShader(
  visualTypes?: VisualTypeEntry[],
  interactionTypes?: InteractionEntry[],
): string {
  const types = visualTypes || []
  const interactions = interactionTypes || []

  // Generate visual function definitions from registry (deduplicate by name)
  const seenNames = new Set<string>()
  const dedupedTypes = types.filter(t => {
    if (seenNames.has(t.name)) return false
    seenNames.add(t.name)
    return true
  })
  const visualFunctions = dedupedTypes.map(t => t.wgsl).join('\n\n')

  // Generate switch cases for visual dispatch
  const switchCases = dedupedTypes.map(t =>
    `    case ${t.id}u: { return visual_${t.name}(uv, sdf, col, time, p, behind); }`
  ).join('\n')

  // Generate interaction function definitions (deduplicate by name)
  const seenIx = new Set<string>()
  const dedupedIx = interactions.filter(ix => {
    if (seenIx.has(ix.name)) return false
    seenIx.add(ix.name)
    return true
  })
  const interactionFunctions = dedupedIx.map(ix => ix.wgsl).join('\n\n')
  const interactionSwitchCases = dedupedIx.map(ix =>
    `    case ${ix.id}u: { return interaction_${ix.name}(uvA, uvB, colorA, colorB, time); }`
  ).join('\n')
  const hasInteractions = dedupedIx.length > 0

  return /* wgsl */`
${FRAME_UNIFORM_STRUCT}

struct FieldGPU {
  posScaleRot: vec4f,
  shapeDims: vec4f,
  color: vec4f,
  visualAndParams: vec4f,
  extraParams: vec4f,
};

struct InteractionGPU {
  fieldIdxA: u32,
  fieldIdxB: u32,
  interactionType: u32,
  _pad: u32,
};

@group(1) @binding(0) var<storage, read> superFields: array<FieldGPU>;
@group(1) @binding(1) var<storage, read_write> accumBuf: array<vec4f>;
@group(1) @binding(2) var<storage, read_write> hitIdBuf: array<u32>;
@group(1) @binding(3) var<storage, read> interactions: array<InteractionGPU>;
@group(1) @binding(4) var<storage, read_write> ixBuf: array<vec4f>;

${SHADER_UTILITIES}

// ─── SDF for field shape ───
fn superSDF(coord: vec2f, f: FieldGPU) -> f32 {
  let pos = f.posScaleRot.xy;
  let scale = max(f.posScaleRot.z, 0.001);
  let rot = f.posScaleRot.w;

  var local = coord - pos;
  if (rot != 0.0) {
    let c = cos(-rot);
    let s = sin(-rot);
    local = vec2f(c * local.x - s * local.y, s * local.x + c * local.y);
  }
  local /= scale;

  let st = u32(f.shapeDims.x);
  if (st == 1u) { // rect
    return sdBox(local, vec2f(f.shapeDims.y * 0.5, f.shapeDims.z * 0.5));
  }
  // default: circle
  return length(local) - f.shapeDims.y;
}

// ─── Local UV within field bounds (-1..1) ───
fn superLocalUV(coord: vec2f, f: FieldGPU) -> vec2f {
  let pos = f.posScaleRot.xy;
  let scale = max(f.posScaleRot.z, 0.001);
  let rot = f.posScaleRot.w;

  var local = coord - pos;
  if (rot != 0.0) {
    let c = cos(-rot);
    let s = sin(-rot);
    local = vec2f(c * local.x - s * local.y, s * local.x + c * local.y);
  }
  local /= scale;

  let st = u32(f.shapeDims.x);
  if (st == 1u) { // rect — normalize by half-extents
    return vec2f(local.x / max(f.shapeDims.y * 0.5, 1.0), local.y / max(f.shapeDims.z * 0.5, 1.0));
  }
  // circle — normalize by radius
  return local / max(f.shapeDims.y, 1.0);
}

// ─── Visual type functions (dynamically generated from registry) ───
${visualFunctions}

// ─── Visual dispatch (dynamically generated switch) ───
// behind: vec4f(rgb, a) = whatever has already been rendered at this pixel by
// earlier fields in the loop. Fields can see and respond to what's underneath.
fn superVisual(uv: vec2f, sdf: f32, f: FieldGPU, time: f32, behind: vec4f) -> vec4f {
  let vtype = u32(f.visualAndParams.x);
  let col = f.color;
  let p = vec4f(f.visualAndParams.yzw, f.extraParams.x);

  switch (vtype) {
${switchCases}
    default: {
      // Inline solid fallback — no visual type defined for this field
      let fa = smoothstep(0.5, -0.5, sdf);
      if (fa < 0.01) { return vec4f(0.0); }
      return vec4f(col.rgb, fa);
    }
  }
}

// ─── Interaction functions (a + b = c at overlap pixels) ───
${interactionFunctions}

fn dispatchInteraction(itype: u32, uvA: vec2f, uvB: vec2f, colorA: vec4f, colorB: vec4f, time: f32) -> vec4f {
  switch (itype) {
${interactionSwitchCases}
    default: { return vec4f(0.0); }
  }
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let pixel = vec2f(f32(gid.x), f32(gid.y));
  if (pixel.x >= frame.resolution.x || pixel.y >= frame.resolution.y) { return; }

  let stride = u32(frame.resolution.x);
  let idx = gid.y * stride + gid.x;

  // Clear interaction buffer for this pixel (before any early return)
  ixBuf[idx] = vec4f(0.0);

  // Pixel → UV → grid coord (same transform as effect compute shader)
  let uv = vec2f((pixel.x + 0.5) / frame.resolution.x, 1.0 - (pixel.y + 0.5) / frame.resolution.y);
  let aspect = frame.resolution.x / frame.resolution.y;
  let gridRange = vec2f(frame.gridSize) / frame.zoom;
  var gridCoord: vec2f;
  if (aspect > 1.0) {
    gridCoord.x = frame.camera.x + (uv.x - 0.5) * gridRange.x * aspect;
    gridCoord.y = frame.camera.y + (0.5 - uv.y) * gridRange.y;
  } else {
    gridCoord.x = frame.camera.x + (uv.x - 0.5) * gridRange.x;
    gridCoord.y = frame.camera.y + (0.5 - uv.y) * gridRange.y / aspect;
  }

  let cellCoord = floor(gridCoord) + 0.5;
  let fieldCount = arrayLength(&superFields);

  // ─── Superimposed field evaluation ───
  //
  // SUPERIMPOSITION LEAK (intentional, documented behavior):
  //
  // Fields do NOT composite independently. The overlap loop has a structural
  // asymmetry: color is OVERWRITTEN by each successive field (last wins), but
  // presence (alpha) is ACCUMULATED via max(). This means:
  //
  //   - If field A (alpha=1.0) is behind field B (alpha=0.3 at its edge),
  //     the pixel renders B's color at A's alpha. B appears more opaque than
  //     it would alone because A's presence is "ghost-writing" B's compositing.
  //
  //   - Neither field fully owns the pixel. The color belongs to one field,
  //     the opacity to another. It's an accidental superposition where each
  //     field leaks into the other's rendering.
  //
  //   - The effect is asymmetric and order-dependent: field array position
  //     determines which field's color survives, but any field's alpha can
  //     dominate. Reordering the fields changes the visual.
  //
  //   - At overlap boundaries where both fields have partial SDF coverage,
  //     the result is a color-opacity mismatch that creates a third visual
  //     state — belonging to neither field alone.
  //
  // This is NOT a bug. It creates emergent visual interaction between fields
  // without any explicit interaction shader. The fields affect each other
  // through shared compositing state, not through shared computation.
  //
  var resultColor = vec3f(0.0);
  var resultPresence: f32 = 0.0;

  // Overlap tracking — store indices of all fields present at this pixel (max 8)
  var overlapIndices: array<u32, 8>;
  var overlapCount: u32 = 0u;

  for (var i = 0u; i < fieldCount; i++) {
    let f = superFields[i];
    let sdf = superSDF(cellCoord, f);
    let localUV = superLocalUV(cellCoord, f);
    let behind = vec4f(resultColor, resultPresence);
    let visual = superVisual(localUV, sdf, f, frame.time, behind);

    if (visual.a > 0.01) {
      resultColor = visual.rgb;
      resultPresence = max(resultPresence, visual.a);
      if (overlapCount < 8u) {
        overlapIndices[overlapCount] = i;
        overlapCount++;
      }
    }
  }

  if (resultPresence < 0.01) {
    hitIdBuf[idx] = 0xFFFFFFFFu;
    return;
  }

  // ─── Interaction effects: a + b = c ───
  // When two fields overlap, check if an interaction is defined for that pair.
  // If so, the interaction visual replaces both fields at this pixel.
  let intCount = arrayLength(&interactions);
  if (overlapCount >= 2u && intCount > 0u) {
    for (var oi = 0u; oi < overlapCount; oi++) {
      for (var oj = oi + 1u; oj < overlapCount; oj++) {
        let idxA = overlapIndices[oi];
        let idxB = overlapIndices[oj];
        for (var k = 0u; k < intCount; k++) {
          let ix = interactions[k];
          let matchAB = (ix.fieldIdxA == idxA && ix.fieldIdxB == idxB);
          let matchBA = (ix.fieldIdxA == idxB && ix.fieldIdxB == idxA);
          if (matchAB || matchBA) {
            let fA = superFields[idxA];
            let fB = superFields[idxB];
            let uvA = superLocalUV(cellCoord, fA);
            let uvB = superLocalUV(cellCoord, fB);
            let ixResult = dispatchInteraction(ix.interactionType, uvA, uvB, fA.color, fB.color, frame.time);
            if (ixResult.a > 0.01) {
              resultColor = ixResult.rgb;
              resultPresence = ixResult.a;
              ixBuf[idx] = ixResult;
            }
          }
        }
      }
    }
  }

  // Write topmost field index for pixel-perfect hit testing
  hitIdBuf[idx] = overlapIndices[overlapCount - 1u];

  // Write to accumulation buffer (blend with existing for coexistence with per-field effects)
  let existing = accumBuf[idx];
  accumBuf[idx] = vec4f(
    mix(existing.rgb, resultColor, resultPresence),
    existing.a + resultPresence * (1.0 - existing.a),
  );
}
`
}

/**
 * Propagation compute shader — spreads interaction results beyond the overlap zone.
 * Reads ixBuf (raw interaction output from uber-shader), samples at offset positions
 * below the current pixel (so effects visually rise upward), and blends into accumBuf.
 */
export function buildPropagationComputeShader(): string {
  return /* wgsl */`
${FRAME_UNIFORM_STRUCT}

@group(1) @binding(0) var<storage, read> ixBuf: array<vec4f>;
@group(1) @binding(1) var<storage, read_write> accumBuf: array<vec4f>;

fn propHash(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, vec3f(p3.y, p3.z, p3.x) + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let px = f32(gid.x);
  let py = f32(gid.y);
  if (px >= frame.resolution.x || py >= frame.resolution.y) { return; }

  let stride = u32(frame.resolution.x);
  let idx = gid.y * stride + gid.x;
  let resX = i32(frame.resolution.x);
  let resY = i32(frame.resolution.y);

  var spreadColor = vec3f(0.0);
  var spreadAlpha: f32 = 0.0;
  let maxDist: f32 = 200.0;
  let steps: i32 = 16;
  let stepSize: f32 = maxDist / f32(steps);

  // Sample pixels BELOW this pixel (larger y = lower on screen)
  // so the propagated effect appears ABOVE the source = rising steam
  for (var s: i32 = 1; s <= steps; s++) {
    let dist = f32(s) * stepSize;
    let srcY = i32(py) + i32(dist);
    if (srcY >= resY) { break; }

    // Turbulent horizontal wobble — wider at greater distance
    let seed1 = vec2f(px * 0.07 + frame.time * 1.3, f32(srcY) * 0.09 + f32(s) * 3.7);
    let seed2 = vec2f(px * 0.13 - frame.time * 0.9, f32(srcY) * 0.05 + f32(s) * 7.1);
    let wobble = (propHash(seed1) - 0.5) * 2.0 + (propHash(seed2) - 0.5);
    let wobbleAmt = dist * 0.4;
    let srcX = clamp(i32(px + wobble * wobbleAmt), 0, resX - 1);

    let srcIdx = u32(srcY) * stride + u32(srcX);
    let samp = ixBuf[srcIdx];

    if (samp.a > 0.01) {
      let t = dist / maxDist;
      let falloff = (1.0 - t * t);  // inverse-quadratic: stays strong near source
      spreadColor = max(spreadColor, samp.rgb * falloff);
      spreadAlpha = max(spreadAlpha, samp.a * falloff);
    }
  }

  // Wider lateral spread — sample neighbors at multiple offsets
  for (var dx: i32 = -3; dx <= 3; dx++) {
    if (dx == 0) { continue; }
    let lSrcX = i32(px) + dx * 4;
    let lSrcY = i32(py) + 3;
    if (lSrcX < 0 || lSrcX >= resX || lSrcY >= resY) { continue; }
    let lIdx = u32(lSrcY) * stride + u32(lSrcX);
    let lSamp = ixBuf[lIdx];
    if (lSamp.a > 0.01) {
      let lFalloff = 1.0 - f32(abs(dx)) * 0.2;
      spreadColor = max(spreadColor, lSamp.rgb * lFalloff * 0.5);
      spreadAlpha = max(spreadAlpha, lSamp.a * lFalloff * 0.5);
    }
  }

  if (spreadAlpha > 0.005) {
    let existing = accumBuf[idx];
    accumBuf[idx] = vec4f(
      existing.rgb + spreadColor * spreadAlpha,
      max(existing.a, spreadAlpha),
    );
  }
}
`
}

// Backward-compatible exports
export function buildFragmentShader(injectedWgsl?: string): string {
  if (injectedWgsl) {
    return buildEffectFragmentShader(injectedWgsl)
  }
  return buildBaseFragmentShader()
}

export const fragmentShaderSource = buildBaseFragmentShader()
