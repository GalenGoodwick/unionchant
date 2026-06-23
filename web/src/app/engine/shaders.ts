// Field Engine — GLSL 300 ES Shaders
// Split into base pass (grid + colors + selection highlight) and effect pass (per-field GLSL)

export const vertexShaderSource = `#version 300 es
precision highp float;

// Fullscreen quad — two triangles covering clip space
const vec2 positions[6] = vec2[6](
  vec2(-1.0, -1.0),
  vec2( 1.0, -1.0),
  vec2(-1.0,  1.0),
  vec2(-1.0,  1.0),
  vec2( 1.0, -1.0),
  vec2( 1.0,  1.0)
);

const vec2 uvs[6] = vec2[6](
  vec2(0.0, 0.0),
  vec2(1.0, 0.0),
  vec2(0.0, 1.0),
  vec2(0.0, 1.0),
  vec2(1.0, 0.0),
  vec2(1.0, 1.0)
);

out vec2 v_uv;

void main() {
  v_uv = uvs[gl_VertexID];
  gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
}
`

// Shared coordinate math — camera → grid coord conversion
const COORD_MATH = `
  float aspect = u_resolution.x / u_resolution.y;
  vec2 gridRange = vec2(u_gridSize) / u_zoom;

  vec2 gridCoord;
  if (aspect > 1.0) {
    gridCoord.x = u_camera.x + (v_uv.x - 0.5) * gridRange.x * aspect;
    gridCoord.y = u_camera.y + (0.5 - v_uv.y) * gridRange.y;
  } else {
    gridCoord.x = u_camera.x + (v_uv.x - 0.5) * gridRange.x;
    gridCoord.y = u_camera.y + (0.5 - v_uv.y) * gridRange.y / aspect;
  }

  vec2 texUV = gridCoord / u_gridSize;
`

// Shader utility library — available to all AI-generated fieldEffect functions
const SHADER_UTILITIES = `
// --- Utility Library ---

// Hash functions
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}

// Value noise
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Gradient noise (Perlin-like)
float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(hash22(i) * 2.0 - 1.0, f),
                 dot(hash22(i + vec2(1.0, 0.0)) * 2.0 - 1.0, f - vec2(1.0, 0.0)), u.x),
             mix(dot(hash22(i + vec2(0.0, 1.0)) * 2.0 - 1.0, f - vec2(0.0, 1.0)),
                 dot(hash22(i + vec2(1.0, 1.0)) * 2.0 - 1.0, f - vec2(1.0, 1.0)), u.x), u.y);
}

// Fractal Brownian Motion
float fbm(vec2 p, int octaves) {
  float val = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    val += amp * vnoise(p * freq);
    freq *= 2.0;
    amp *= 0.5;
  }
  return val;
}

// Domain warping
vec2 warp(vec2 p, float strength, float time) {
  vec2 q = vec2(fbm(p + vec2(0.0, 0.0), 4), fbm(p + vec2(5.2, 1.3), 4));
  vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2) + 0.15 * time, 4),
                fbm(p + 4.0 * q + vec2(8.3, 2.8) + 0.126 * time, 4));
  return p + strength * r;
}

// SDF primitives (2D)
float sdCircle(vec2 p, float r) { return length(p) - r; }
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float sdRoundedBox(vec2 p, vec2 b, float r) { return sdBox(p, b - r) - r; }
float sdSegment(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float sdEquilateralTriangle(vec2 p, float r) {
  float k = 1.732050808;
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}
float sdStar(vec2 p, float r, int n, float m) {
  float an = 3.141593 / float(n);
  float en = 3.141593 / m;
  vec2 acs = vec2(cos(an), sin(an));
  vec2 ecs = vec2(cos(en), sin(en));
  float bn = mod(atan(p.x, p.y), 2.0 * an) - an;
  p = length(p) * vec2(cos(bn), abs(sin(bn)));
  p -= r * acs;
  p += ecs * clamp(-dot(p, ecs), 0.0, r * acs.y / ecs.y);
  return length(p) * sign(p.x);
}

// SDF operations
float opUnion(float d1, float d2) { return min(d1, d2); }
float opSubtract(float d1, float d2) { return max(-d1, d2); }
float opIntersect(float d1, float d2) { return max(d1, d2); }
float opSmoothUnion(float d1, float d2, float k) { float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0); return mix(d2, d1, h) - k * h * (1.0 - h); }
float opSmoothSubtract(float d1, float d2, float k) { float h = clamp(0.5 - 0.5 * (d2 + d1) / k, 0.0, 1.0); return mix(d2, -d1, h) + k * h * (1.0 - h); }

// Color utilities
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318 * (c * t + d));
}

// Rotation matrix
mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// Normalize position within region to 0..1
vec2 regionUV(vec2 cellPos, vec2 regionMin, vec2 regionMax) {
  return (cellPos - regionMin) / max(regionMax - regionMin, vec2(1.0));
}

// Centered region UV (-1..1)
vec2 regionUVCentered(vec2 cellPos, vec2 regionMin, vec2 regionMax) {
  return regionUV(cellPos, regionMin, regionMax) * 2.0 - 1.0;
}

// Aspect-corrected centered UV
vec2 regionUVAspect(vec2 cellPos, vec2 regionMin, vec2 regionMax) {
  vec2 uv = regionUVCentered(cellPos, regionMin, regionMax);
  vec2 size = regionMax - regionMin;
  float aspect = size.x / max(size.y, 1.0);
  uv.x *= aspect;
  return uv;
}

// Simple lighting
float diffuseLight(vec2 p, vec2 lightPos, float falloff) {
  float d = length(p - lightPos);
  return 1.0 / (1.0 + d * d * falloff);
}

// Glow effect
vec3 glow(float d, vec3 col, float intensity, float radius) {
  return col * intensity * exp(-d * d / (radius * radius));
}

// --- Skeleton Utilities ---
// Skeleton data is a 128x1 RGBA32F texture: each pixel = (x, y, radius, parentIndex)

// Read skeleton node: returns vec4(x, y, radius, parentIndex)
vec4 skelNode(int i) {
  return texelFetch(u_skeletonTex, ivec2(i, 0), 0);
}

// SDF for a tapered capsule between two skeleton nodes
float sdSkelEdge(vec2 p, int nodeA, int nodeB) {
  vec4 a = skelNode(nodeA);
  vec4 b = skelNode(nodeB);
  vec2 pa = p - a.xy;
  vec2 ba = b.xy - a.xy;
  float lenSq = dot(ba, ba);
  if (lenSq < 0.001) return length(pa) - a.z;
  float h = clamp(dot(pa, ba) / lenSq, 0.0, 1.0);
  float r = mix(a.z, b.z, h);  // taper radius
  return length(pa - ba * h) - r;
}

// Full skeleton SDF — union of all parent→child tapered edges
float sdSkeleton(vec2 p) {
  float d = 1e9;
  for (int i = 0; i < u_skeletonNodeCount; i++) {
    vec4 node = skelNode(i);
    int parent = int(node.w);
    if (parent >= 0) {
      d = min(d, sdSkelEdge(p, parent, i));
    }
  }
  return d;
}

// --- End Utility Library ---
`

// Extract function names defined in the base SHADER_UTILITIES
const BASE_FUNC_NAMES: Set<string> = new Set()
{
  const funcDefRegex = /(?:float|vec[234]|mat[234]|int|void|bool)\s+(\w+)\s*\(/g
  let m: RegExpExecArray | null
  while ((m = funcDefRegex.exec(SHADER_UTILITIES)) !== null) {
    BASE_FUNC_NAMES.add(m[1])
  }
}

/**
 * Strip duplicate GLSL function definitions from mod code.
 * Single pass: accumulates seen names as it goes, so both base conflicts
 * and cross-mod conflicts are handled.
 */
function deduplicateModCode(code: string, seen: Set<string>): string {
  const funcStartRegex = /(?:float|vec[234]|mat[234]|int|void|bool)\s+(\w+)\s*\([^)]*\)\s*\{/g
  let result = ''
  let lastEnd = 0

  let match: RegExpExecArray | null
  while ((match = funcStartRegex.exec(code)) !== null) {
    const funcName = match[1]
    // Find matching closing brace (handle nesting)
    const braceStart = match.index + match[0].length - 1
    let depth = 1
    let pos = braceStart + 1
    while (pos < code.length && depth > 0) {
      if (code[pos] === '{') depth++
      else if (code[pos] === '}') depth--
      pos++
    }

    if (seen.has(funcName)) {
      // Strip: keep text before this function, skip the function body
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
  return SHADER_UTILITIES + '\n// --- GLSL Mods ---\n' + cleaned + '\n// --- End GLSL Mods ---\n'
}

/**
 * Base pass: grid lines, painted colors, selection highlight.
 * No fieldEffect(). Uses u_selectionTex for UI selection highlight only.
 */
export function buildBaseFragmentShader(): string {
  return `#version 300 es
precision highp float;

uniform sampler2D u_colorTex;
uniform sampler2D u_stateTex;
uniform sampler2D u_selectionTex;
uniform sampler2D u_effectTex;
uniform vec2 u_camera;
uniform vec2 u_resolution;
uniform float u_zoom;
uniform float u_time;
uniform float u_gridSize;

in vec2 v_uv;
out vec4 fragColor;

void main() {
${COORD_MATH}

  // Out-of-bounds background
  if (texUV.x < 0.0 || texUV.x > 1.0 || texUV.y < 0.0 || texUV.y > 1.0) {
    fragColor = vec4(0.035, 0.045, 0.065, 1.0);
    return;
  }

  vec4 cellColor = texture(u_colorTex, texUV);
  float selection = texture(u_selectionTex, texUV).r;

  // Grid lines
  float cellSize = u_resolution.y * u_zoom / u_gridSize;
  float gridAlpha = smoothstep(2.0, 6.0, cellSize) * 0.15;
  vec2 cellFrac = fract(gridCoord);
  float lineWidth = 1.0 / max(cellSize, 1.0);
  float gridLine = 1.0 - step(lineWidth, cellFrac.x) * step(lineWidth, cellFrac.y)
                       * step(cellFrac.x, 1.0 - lineWidth) * step(cellFrac.y, 1.0 - lineWidth);

  vec3 bg = vec3(0.055, 0.065, 0.09);
  // colorData stores field presence (R,G,B=avg color, A=field count) — not for visual rendering.
  // Effect shaders read it via u_colorTex. Base pass just shows the dark background.
  vec3 color = bg;

  // Grid lines
  vec3 gridColor = vec3(0.15, 0.18, 0.22);
  color = mix(color, gridColor, gridLine * gridAlpha);

  // Selection highlight
  if (selection > 0.5) {
    float pulse = 0.5 + 0.5 * sin(u_time * 3.0);
    // Brighten selected cells
    color = mix(color, vec3(1.0), 0.08 + 0.04 * pulse);
    // Edge glow: detect border of selection region
    vec2 texelSize = 1.0 / vec2(u_gridSize);
    float nL = texture(u_selectionTex, texUV + vec2(-texelSize.x, 0.0)).r;
    float nR = texture(u_selectionTex, texUV + vec2( texelSize.x, 0.0)).r;
    float nU = texture(u_selectionTex, texUV + vec2(0.0, -texelSize.y)).r;
    float nD = texture(u_selectionTex, texUV + vec2(0.0,  texelSize.y)).r;
    float edge = step(0.5, 1.0 - min(min(nL, nR), min(nU, nD)));
    color = mix(color, vec3(0.3, 0.7, 1.0), edge * (0.4 + 0.2 * pulse));
  }

  // --- Effect layer rendering ---
  vec4 effectPixel = texture(u_effectTex, texUV);
  float effectType = effectPixel.r;

  if (effectType > 0.5) {
    float hue = effectPixel.g;
    float brightness = effectPixel.b;
    float intensity = effectPixel.a;

    // HSV to RGB (inline)
    float h6 = hue * 6.0;
    float h6i = floor(h6);
    float f = h6 - h6i;
    float q = 1.0 - f;
    float t = f;
    vec3 effectColor;
    if (h6i < 1.0) effectColor = vec3(1.0, t, 0.0);
    else if (h6i < 2.0) effectColor = vec3(q, 1.0, 0.0);
    else if (h6i < 3.0) effectColor = vec3(0.0, 1.0, t);
    else if (h6i < 4.0) effectColor = vec3(0.0, q, 1.0);
    else if (h6i < 5.0) effectColor = vec3(t, 0.0, 1.0);
    else effectColor = vec3(1.0, 0.0, q);
    effectColor *= brightness;

    // Glow from neighbors
    float glow = 0.0;
    vec2 texelSize = 1.0 / vec2(u_gridSize);
    for (int dy = -2; dy <= 2; dy++) {
      for (int dx = -2; dx <= 2; dx++) {
        if (dx == 0 && dy == 0) continue;
        vec2 nb = texUV + vec2(float(dx), float(dy)) * texelSize;
        vec4 nbData = texture(u_effectTex, nb);
        if (nbData.r > 0.5) glow += nbData.a;
      }
    }
    glow = min(glow * 0.06, 0.8);

    // Additive blend onto scene
    color = mix(color, effectColor, intensity * 0.9);
    color += effectColor * glow * 0.4;
  }

  fragColor = vec4(color, 1.0);
}
`
}

/**
 * Effect pass: per-field GLSL effect. Uses u_fieldMask (R8 texture) instead of u_selectionTex.
 * Outputs alpha-blended result. Pixels outside the field mask get discard.
 */
export function buildEffectFragmentShader(injectedGlsl: string, modCode?: string): string {
  return `#version 300 es
precision highp float;

uniform sampler2D u_colorTex;
uniform sampler2D u_stateTex;
uniform sampler2D u_fieldMask;
uniform vec2 u_camera;
uniform vec2 u_resolution;
uniform float u_zoom;
uniform float u_time;
uniform float u_gridSize;
uniform vec4 u_effectBounds;   // (minX, minY, maxX, maxY) in grid coords
uniform vec4 u_effectParams;   // user-controllable params passed to fieldEffect
uniform vec4 u_fieldTransform; // (posX, posY, rotation, scale)
uniform vec4 u_fieldAColor;       // interaction parent A color (zero for normal fields)
uniform vec4 u_fieldBColor;       // interaction parent B color (zero for normal fields)
uniform vec4 u_fieldATransform;   // interaction parent A (x,y,rot,scale) (zero for normal fields)
uniform vec4 u_fieldBTransform;   // interaction parent B (x,y,rot,scale) (zero for normal fields)
uniform sampler2D u_skeletonTex;  // 128x1 RGBA32F: (x, y, radius, parentIndex) per node
uniform int u_skeletonNodeCount;  // number of active skeleton nodes
uniform sampler2D u_feedbackTex;  // previous frame output (256x256 RGBA16F, opt-in per effect)
uniform vec2 u_feedbackSize;      // feedback texture dimensions

in vec2 v_uv;
out vec4 fragColor;

${getShaderUtilities(modCode)}

// Map cell coordinate to feedback texture UV (0..1 within effect bounds)
// Y is flipped because GL renders bottom-to-top but grid Y increases downward
vec2 feedbackUV(vec2 cellCoord) {
  vec2 uv = clamp((cellCoord - u_effectBounds.xy) / max(u_effectBounds.zw - u_effectBounds.xy, vec2(1.0)), 0.0, 1.0);
  uv.y = 1.0 - uv.y;
  return uv;
}

${injectedGlsl}

void main() {
${COORD_MATH}

  // Out-of-bounds: transparent (will be blended)
  if (texUV.x < 0.0 || texUV.x > 1.0 || texUV.y < 0.0 || texUV.y > 1.0) {
    discard;
  }

  vec2 regionMin = u_effectBounds.xy;
  vec2 regionMax = u_effectBounds.zw;

  // Snap to cell center — pixel art style
  vec2 cellCoord = floor(gridCoord) + 0.5;

  // No mask clipping — the shader itself defines its form via alpha
  vec4 effect = fieldEffect(cellCoord, regionMin, regionMax, u_time, u_effectParams);
  fragColor = vec4(effect.rgb, clamp(effect.a, 0.0, 1.0));
}
`
}

/**
 * State update pass: agent-authored GLSL that reads current state + neighbors, writes new state.
 * Runs per-pixel on GPU each frame via render-to-texture ping-pong.
 * Agent provides a cellUpdate function:
 *   vec4 cellUpdate(vec2 coord, vec4 state, vec4 color, float time, float dt)
 * Available: texture(u_stateTex, ...) for neighbor reads, u_colorTex, u_gridSize
 */
export function buildStateUpdateShader(injectedGlsl: string, modCode?: string): string {
  return buildCompositeStateShader([{ id: 'single', glsl: injectedGlsl }], modCode)
}

/**
 * Build a composite state shader from multiple field contributions.
 * Each field's cellUpdate is renamed to cellUpdate_N.
 * ADDITIVE composition: all shaders read the ORIGINAL state independently,
 * and their DELTAS (changes from original) are summed.
 * This prevents later shaders from overwriting earlier ones.
 * If a shader returns `state` unchanged for a pixel, its delta is zero.
 */
export function buildCompositeStateShader(fields: { id: string; glsl: string }[], modCode?: string): string {
  // Rename each field's cellUpdate to cellUpdate_N
  const renamedFunctions = fields.map((f, i) => {
    return f.glsl.replace(/cellUpdate\s*\(/g, `cellUpdate_${i}(`)
  })

  // Each shader reads original state, computes delta, sum all deltas
  const deltaCalls = fields.map((_, i) => {
    return `  vec4 out${i} = cellUpdate_${i}(coord, state, color, u_time, u_dt);
  delta += (out${i} - state);`
  })

  return `#version 300 es
precision highp float;

uniform sampler2D u_stateTex;
uniform sampler2D u_colorTex;
uniform float u_gridSize;
uniform float u_time;
uniform float u_dt;
uniform sampler2D u_skeletonTex;  // 128x1 RGBA32F: (x, y, radius, parentIndex) per node
uniform int u_skeletonNodeCount;  // number of active skeleton nodes

in vec2 v_uv;
out vec4 fragColor;

${getShaderUtilities(modCode)}

${renamedFunctions.join('\n\n')}

void main() {
  vec2 coord = floor(v_uv * u_gridSize) + 0.5;
  vec4 state = texture(u_stateTex, v_uv);
  vec4 color = texture(u_colorTex, v_uv);

  vec4 delta = vec4(0.0);
${deltaCalls.join('\n')}
  fragColor = clamp(state + delta, 0.0, 1.0);
}
`
}

/**
 * World effect pass: full-grid GLSL effect with no field mask.
 * Renders behind field effects, covers the entire grid.
 * Same fieldEffect(coord, regionMin, regionMax, time, params) signature.
 * regionMin = (0,0), regionMax = (gridSize, gridSize).
 */

/** Mask clear shader — erases underlying pixels where an interaction mask is active.
 *  Renders background color at full alpha, giving interaction effects visual precedence. */
export function buildMaskClearShader(): string {
  return `#version 300 es
precision highp float;
uniform sampler2D u_fieldMask;
uniform vec2 u_camera;
uniform vec2 u_resolution;
uniform float u_zoom;
uniform float u_gridSize;
in vec2 v_uv;
out vec4 fragColor;
void main() {
${COORD_MATH}
  if (texUV.x < 0.0 || texUV.x > 1.0 || texUV.y < 0.0 || texUV.y > 1.0) {
    discard;
  }
  float maskVal = texture(u_fieldMask, texUV).r;
  if (maskVal < 0.5) discard;
  // Paint background color — erases fire/ice/etc underneath so interaction takes precedence
  fragColor = vec4(0.055, 0.065, 0.09, 1.0);
}
`;
}

export function buildWorldEffectFragmentShader(injectedGlsl: string, modCode?: string): string {
  return `#version 300 es
precision highp float;

uniform sampler2D u_colorTex;
uniform sampler2D u_stateTex;
uniform vec2 u_camera;
uniform vec2 u_resolution;
uniform float u_zoom;
uniform float u_time;
uniform float u_gridSize;
uniform vec4 u_effectParams;

in vec2 v_uv;
out vec4 fragColor;

${getShaderUtilities(modCode)}

${injectedGlsl}

void main() {
${COORD_MATH}

  if (texUV.x < 0.0 || texUV.x > 1.0 || texUV.y < 0.0 || texUV.y > 1.0) {
    discard;
  }

  vec2 cellCoord = floor(gridCoord) + 0.5;
  vec4 effect = fieldEffect(cellCoord, vec2(0.0), vec2(u_gridSize), u_time, u_effectParams);
  fragColor = vec4(effect.rgb, clamp(effect.a, 0.0, 1.0));
}
`
}

/** Default field effect — SDF circle at field position using u_fieldTransform.
 *  Renders a smooth circle at the field's position without relying on shape masks.
 *  The field's shape radius is encoded in u_effectBounds (bounding box). */
export const DEFAULT_FIELD_EFFECT_GLSL = `
vec4 fieldEffect(vec2 coord, vec2 regionMin, vec2 regionMax, float time, vec4 params) {
  vec2 pos = u_fieldTransform.xy;
  float d = length(coord - pos);
  // Derive radius from bounding box
  float r = (regionMax.x - regionMin.x) * 0.5;
  float alpha = smoothstep(r + 0.5, r - 0.5, d);
  return vec4(params.rgb, params.a * alpha);
}
`


// Backward-compatible exports
export function buildFragmentShader(injectedGlsl?: string): string {
  if (injectedGlsl) {
    return buildEffectFragmentShader(injectedGlsl)
  }
  return buildBaseFragmentShader()
}

export const fragmentShaderSource = buildBaseFragmentShader()
