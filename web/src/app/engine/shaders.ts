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

// --- End Utility Library ---
`

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
  vec3 color = mix(bg, cellColor.rgb, cellColor.a);

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

  fragColor = vec4(color, 1.0);
}
`
}

/**
 * Effect pass: per-field GLSL effect. Uses u_fieldMask (R8 texture) instead of u_selectionTex.
 * Outputs alpha-blended result. Pixels outside the field mask get discard.
 */
export function buildEffectFragmentShader(injectedGlsl: string): string {
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

in vec2 v_uv;
out vec4 fragColor;

${SHADER_UTILITIES}

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

  // Check if this cell is part of the field mask
  vec2 cellTexUV = cellCoord / u_gridSize;
  float inField = texture(u_fieldMask, cellTexUV).r;

  if (inField < 0.5) {
    discard;
  }

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
export function buildStateUpdateShader(injectedGlsl: string): string {
  return buildCompositeStateShader([{ id: 'single', glsl: injectedGlsl }])
}

/**
 * Build a composite state shader from multiple field contributions.
 * Each field's cellUpdate is renamed to cellUpdate_N.
 * ADDITIVE composition: all shaders read the ORIGINAL state independently,
 * and their DELTAS (changes from original) are summed.
 * This prevents later shaders from overwriting earlier ones.
 * If a shader returns `state` unchanged for a pixel, its delta is zero.
 */
export function buildCompositeStateShader(fields: { id: string; glsl: string }[]): string {
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

in vec2 v_uv;
out vec4 fragColor;

${SHADER_UTILITIES}

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
export function buildWorldEffectFragmentShader(injectedGlsl: string): string {
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

${SHADER_UTILITIES}

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

/** Default field effect — solid color fill using params.rgba as the color */
export const DEFAULT_FIELD_EFFECT_GLSL = `
vec4 fieldEffect(vec2 coord, vec2 regionMin, vec2 regionMax, float time, vec4 params) {
  return vec4(params.rgb, params.a);
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
