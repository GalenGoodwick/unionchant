'use client'

import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import { SECTIONS, MOCK_PLAYERS, GRID_SIZE } from './world-data'
import type { SectionId } from './world-data'

// ── WORLD CONFIG ──
const WORLD_W = 1024
const WORLD_H = 1024

// Object IDs: 0 = background, 1-4 = sections, 10+ = players, 100 = center heart
const SECTION_OBJ_BASE = 1
const PLAYER_OBJ_BASE = 10
const HEART_OBJ_ID = 100

// Section bounding boxes in world space (for click/hover detection)
const SECTION_BOUNDS: { id: SectionId; objId: number; x: number; y: number; w: number; h: number }[] = []

// ── SHADERS ──

const VERT_SRC = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_pos, 0, 1);
}`

const FRAG_SRC = `#version 300 es
precision highp float;

uniform sampler2D u_colorTex;
uniform sampler2D u_objTex;
uniform sampler2D u_portColorTex;
uniform sampler2D u_portObjTex;
uniform vec2 u_camera;
uniform vec2 u_resolution;
uniform vec2 u_worldSize;
uniform float u_hoveredObj;
uniform float u_time;
uniform float u_portGlows[16];
uniform float u_portObjBase;
uniform float u_playerStarPulse;
uniform float u_facingAngle;

in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec2 screenPos = v_uv * u_resolution;
  vec2 worldPos = screenPos + u_camera - u_resolution * 0.5;
  vec2 texUV = worldPos / u_worldSize;

  // Out of bounds = void
  if (texUV.x < 0.0 || texUV.x > 1.0 || texUV.y < 0.0 || texUV.y > 1.0) {
    float n = fract(sin(dot(screenPos, vec2(12.9898, 78.233))) * 43758.5453);
    fragColor = vec4(vec3(0.008 + n * 0.008), 1.0);
    return;
  }

  // Sample world layer
  vec3 color = texture(u_colorTex, texUV).rgb;
  float objId = texture(u_objTex, texUV).r * 255.0;

  // Composite port overlay layer on top
  vec4 portColor = texture(u_portColorTex, texUV);
  if (portColor.a > 0.5) {
    color = portColor.rgb;
    objId = texture(u_portObjTex, texUV).r * 255.0;
  }

  // Hovered object glow (existing)
  if (u_hoveredObj > 0.0 && abs(objId - u_hoveredObj) < 0.5) {
    float pulse = sin(u_time * 3.0) * 0.15 + 0.85;
    float texelW = 1.0 / u_worldSize.x;
    float texelH = 1.0 / u_worldSize.y;
    bool isEdge = false;
    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        if (dx == 0 && dy == 0) continue;
        vec2 nUV = texUV + vec2(float(dx) * texelW, float(dy) * texelH);
        if (nUV.x < 0.0 || nUV.x > 1.0 || nUV.y < 0.0 || nUV.y > 1.0) { isEdge = true; continue; }
        float nObj = texture(u_portObjTex, nUV).r * 255.0;
        float nObjW = texture(u_objTex, nUV).r * 255.0;
        float nObjFinal = texture(u_portColorTex, nUV).a > 0.5 ? nObj : nObjW;
        if (abs(nObjFinal - u_hoveredObj) > 0.5) isEdge = true;
      }
    }
    if (isEdge) {
      color = mix(color, vec3(0.133, 0.827, 0.933), 0.7 * pulse);
    } else {
      color = mix(color, vec3(0.133, 0.827, 0.933), 0.15 * pulse);
    }
  }

  // Port proximity glow (for ports in the port layer)
  float portIdx = objId - u_portObjBase;
  if (portIdx >= 0.0 && portIdx < 16.0) {
    int idx = int(portIdx);
    float glow = u_portGlows[idx];
    if (glow > 0.01) {
      float pulse = sin(u_time * 2.0) * 0.1 + 0.9;
      float texelW = 1.0 / u_worldSize.x;
      float texelH = 1.0 / u_worldSize.y;
      bool isEdge = false;
      for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
          if (dx == 0 && dy == 0) continue;
          vec2 nUV = texUV + vec2(float(dx) * texelW, float(dy) * texelH);
          float nPortColor = texture(u_portColorTex, nUV).a;
          float nObj = nPortColor > 0.5 ? texture(u_portObjTex, nUV).r * 255.0 : texture(u_objTex, nUV).r * 255.0;
          if (abs(nObj - objId) > 0.5) isEdge = true;
        }
      }
      if (isEdge) {
        color = mix(color, vec3(0.133, 0.827, 0.933), glow * 0.8 * pulse);
      } else {
        color = mix(color, vec3(0.133, 0.827, 0.933), glow * 0.3 * pulse);
      }
    }
  }

  // Player star at screen center with facing indicator
  vec2 center = u_resolution * 0.5;
  vec2 toCenter = screenPos - center;
  float dist = length(toCenter);
  float starRadius = 6.0 + u_playerStarPulse * 2.0;

  if (dist < starRadius) {
    // Cross-shaped star
    float ax = abs(toCenter.x);
    float ay = abs(toCenter.y);
    bool inStar = (ax + ay < starRadius * 0.8) || (ax < starRadius * 0.3) || (ay < starRadius * 0.3);
    if (inStar) {
      float brightness = 0.8 + u_playerStarPulse * 0.2;
      color = vec3(0.133 * brightness, 0.827 * brightness, 0.933 * brightness);
    }
  }

  // Facing direction indicator (small triangle ahead of star)
  float facingDist = 12.0;
  vec2 facingDir = vec2(cos(u_facingAngle), sin(u_facingAngle));
  vec2 facingCenter = center + facingDir * facingDist;
  vec2 toFacing = screenPos - facingCenter;
  float facingLen = length(toFacing);
  if (facingLen < 3.0 && u_facingAngle != 0.0) {
    color = vec3(0.133, 0.827, 0.933) * 0.6;
  }

  fragColor = vec4(color, 1.0);
}`

// ── PIXEL ART HELPERS ──

// Heart shape pattern (11x10)
const HEART_PATTERN = [
  '  ##   ##  ',
  ' #### #### ',
  '###########',
  '###########',
  '###########',
  ' ######### ',
  '  #######  ',
  '   #####   ',
  '    ###    ',
  '     #     ',
]

function stampPattern(
  colorData: Uint8Array,
  objData: Uint8Array,
  pattern: string[],
  wx: number, wy: number,
  r: number, g: number, b: number,
  objId: number,
) {
  for (let py = 0; py < pattern.length; py++) {
    for (let px = 0; px < pattern[py].length; px++) {
      if (pattern[py][px] !== '#') continue
      const x = wx + px
      const y = wy + py
      if (x < 0 || x >= WORLD_W || y < 0 || y >= WORLD_H) continue
      const idx = (y * WORLD_W + x) * 4
      colorData[idx] = r
      colorData[idx + 1] = g
      colorData[idx + 2] = b
      colorData[idx + 3] = 255
      objData[idx] = objId
      objData[idx + 1] = 0
      objData[idx + 2] = 0
      objData[idx + 3] = 255
    }
  }
}

function stampRect(
  colorData: Uint8Array,
  objData: Uint8Array,
  wx: number, wy: number, w: number, h: number,
  r: number, g: number, b: number,
  objId: number,
  borderR = 0, borderG = 0, borderB = 0,
) {
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = wx + px
      const y = wy + py
      if (x < 0 || x >= WORLD_W || y < 0 || y >= WORLD_H) continue
      const idx = (y * WORLD_W + x) * 4
      const isBorder = px === 0 || px === w - 1 || py === 0 || py === h - 1
      colorData[idx] = isBorder ? borderR : r
      colorData[idx + 1] = isBorder ? borderG : g
      colorData[idx + 2] = isBorder ? borderB : b
      colorData[idx + 3] = 255
      objData[idx] = objId
      objData[idx + 1] = 0
      objData[idx + 2] = 0
      objData[idx + 3] = 255
    }
  }
}

function stampText(
  colorData: Uint8Array,
  objData: Uint8Array,
  text: string,
  wx: number, wy: number,
  r: number, g: number, b: number,
  objId: number,
) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  ctx.font = 'bold 11px monospace'
  const metrics = ctx.measureText(text)
  canvas.width = Math.ceil(metrics.width) + 4
  canvas.height = 14
  ctx.font = 'bold 11px monospace'
  ctx.fillStyle = `rgb(${r},${g},${b})`
  ctx.fillText(text, 2, 11)

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let py = 0; py < canvas.height; py++) {
    for (let px = 0; px < canvas.width; px++) {
      const srcIdx = (py * canvas.width + px) * 4
      if (imgData.data[srcIdx + 3] < 80) continue
      const x = wx + px
      const y = wy + py
      if (x < 0 || x >= WORLD_W || y < 0 || y >= WORLD_H) continue
      const idx = (y * WORLD_W + x) * 4
      colorData[idx] = r
      colorData[idx + 1] = g
      colorData[idx + 2] = b
      colorData[idx + 3] = 255
      objData[idx] = objId
    }
  }
  return canvas.width
}

// ── WORLD INITIALIZATION ──

function initWorld(): { colorData: Uint8Array; objData: Uint8Array } {
  const colorData = new Uint8Array(WORLD_W * WORLD_H * 4)
  const objData = new Uint8Array(WORLD_W * WORLD_H * 4)

  // Background landscape
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const idx = (y * WORLD_W + x) * 4
      let r: number, g: number, b: number

      const ny = y / WORLD_H
      if (ny < 0.4) {
        const t = ny / 0.4
        r = Math.floor(2 + t * 12)
        g = Math.floor(6 + t * 18)
        b = Math.floor(23 + t * 35)
      } else {
        const t = (ny - 0.4) / 0.6
        r = Math.floor(12 + t * 15 + Math.sin(x * 0.02) * 6)
        g = Math.floor(18 + t * 22 + Math.cos(x * 0.03 + y * 0.01) * 8)
        b = Math.floor(28 + t * 18)
      }

      const noise = (Math.sin(x * 3.7 + y * 7.3) * 0.5 + 0.5) * 8 - 4
      r = Math.max(0, Math.min(255, r + noise))
      g = Math.max(0, Math.min(255, g + noise))
      b = Math.max(0, Math.min(255, b + noise))

      // Sparse accent pixels
      if (Math.sin(x * 17.1 + y * 23.3) > 0.985) {
        r = 34; g = 211; b = 238
      }

      colorData[idx] = r
      colorData[idx + 1] = g
      colorData[idx + 2] = b
      colorData[idx + 3] = 255
    }
  }

  // Center of world
  const cx = WORLD_W / 2
  const cy = WORLD_H / 2

  // Stamp section entities
  SECTION_BOUNDS.length = 0
  SECTIONS.forEach((section, i) => {
    const objId = SECTION_OBJ_BASE + i
    const sx = cx + section.position.x
    const sy = cy + section.position.y

    // Section colors
    const colors: Record<string, [number, number, number, number, number, number]> = {
      chants: [15, 30, 50, 34, 211, 238],    // dark bg, cyan border
      podiums: [15, 25, 45, 168, 85, 247],    // dark bg, purple border
      groups: [15, 30, 40, 52, 211, 153],     // dark bg, green border
      how: [20, 25, 40, 234, 179, 8],         // dark bg, amber border
    }
    const [bgR, bgG, bgB, brR, brG, brB] = colors[section.id] || [15, 25, 40, 100, 100, 100]

    // Card dimensions
    const cardW = 100
    const cardH = 40
    const cardX = Math.floor(sx - cardW / 2)
    const cardY = Math.floor(sy - cardH / 2)

    // Background rect
    stampRect(colorData, objData, cardX, cardY, cardW, cardH, bgR, bgG, bgB, objId, brR, brG, brB)

    // Label text
    stampText(colorData, objData, section.label, cardX + 6, cardY + 6, brR, brG, brB, objId)

    // Description text
    stampText(colorData, objData, section.description, cardX + 6, cardY + 22, Math.floor(brR * 0.6), Math.floor(brG * 0.6), Math.floor(brB * 0.6), objId)

    // Count badge
    if (section.count > 0) {
      stampText(colorData, objData, `${section.count} active`, cardX + cardW - 60, cardY + 6, brR, brG, brB, objId)
    }

    SECTION_BOUNDS.push({ id: section.id, objId, x: cardX, y: cardY, w: cardW, h: cardH })
  })

  // Stamp center heart
  stampPattern(colorData, objData, HEART_PATTERN, Math.floor(cx - 5), Math.floor(cy - 5), 34, 211, 238, HEART_OBJ_ID)

  // Stamp mock player hearts
  MOCK_PLAYERS.forEach((player, i) => {
    const objId = PLAYER_OBJ_BASE + i
    const px = Math.floor(cx + player.position.x - 5)
    const py = Math.floor(cy + player.position.y - 5)
    const [r, g, b] = hexToRgb(player.color)
    stampPattern(colorData, objData, HEART_PATTERN, px, py, r, g, b, objId)
    // Name below heart
    stampText(colorData, objData, player.name, px - 10, py + 12, r, g, b, objId)
  })

  return { colorData, objData }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

// ── ENGINE HANDLE ──

export interface PixelEngineHandle {
  screenToWorld: (sx: number, sy: number) => { x: number; y: number }
  getObjectAtWorld: (wx: number, wy: number) => number
  getSectionAtWorld: (wx: number, wy: number) => SectionId | null
  updatePortTextures: (colorData: Uint8Array, objData: Uint8Array) => void
  setPortGlows: (glows: number[]) => void
  setPlayerStarPulse: (pulse: number) => void
  setFacingAngle: (angle: number) => void
}

// ── COMPONENT ──

interface PixelEngineProps {
  cameraX: number
  cameraY: number
  hoveredObjId: number
}

const PixelEngine = forwardRef<PixelEngineHandle, PixelEngineProps>(function PixelEngine(
  { cameraX, cameraY, hoveredObjId },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glRef = useRef<WebGL2RenderingContext | null>(null)
  const uniformsRef = useRef<{
    uCamera: WebGLUniformLocation | null
    uResolution: WebGLUniformLocation | null
    uHoveredObj: WebGLUniformLocation | null
    uTime: WebGLUniformLocation | null
    uPortGlows: WebGLUniformLocation | null
    uPortObjBase: WebGLUniformLocation | null
    uPlayerStarPulse: WebGLUniformLocation | null
    uFacingAngle: WebGLUniformLocation | null
  }>({ uCamera: null, uResolution: null, uHoveredObj: null, uTime: null, uPortGlows: null, uPortObjBase: null, uPlayerStarPulse: null, uFacingAngle: null })
  const objDataRef = useRef<Uint8Array | null>(null)
  const portColorTexRef = useRef<WebGLTexture | null>(null)
  const portObjTexRef = useRef<WebGLTexture | null>(null)
  const animRef = useRef(0)
  const startTimeRef = useRef(0)

  // Expose methods
  useImperativeHandle(ref, () => ({
    screenToWorld(sx: number, sy: number) {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      return {
        x: sx + cameraX - w / 2,
        y: sy + cameraY - h / 2,
      }
    },
    getObjectAtWorld(wx: number, wy: number) {
      const data = objDataRef.current
      if (!data) return 0
      const ix = Math.floor(wx)
      const iy = Math.floor(wy)
      if (ix < 0 || ix >= WORLD_W || iy < 0 || iy >= WORLD_H) return 0
      return data[(iy * WORLD_W + ix) * 4]
    },
    getSectionAtWorld(wx: number, wy: number) {
      for (const sb of SECTION_BOUNDS) {
        if (wx >= sb.x && wx < sb.x + sb.w && wy >= sb.y && wy < sb.y + sb.h) {
          return sb.id
        }
      }
      return null
    },
    updatePortTextures(colorData: Uint8Array, objData: Uint8Array) {
      const gl = glRef.current
      if (!gl) return
      if (portColorTexRef.current) {
        gl.activeTexture(gl.TEXTURE2)
        gl.bindTexture(gl.TEXTURE_2D, portColorTexRef.current)
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, WORLD_W, WORLD_H, gl.RGBA, gl.UNSIGNED_BYTE, colorData)
      }
      if (portObjTexRef.current) {
        gl.activeTexture(gl.TEXTURE3)
        gl.bindTexture(gl.TEXTURE_2D, portObjTexRef.current)
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, WORLD_W, WORLD_H, gl.RGBA, gl.UNSIGNED_BYTE, objData)
      }
    },
    setPortGlows(glows: number[]) {
      const gl = glRef.current
      if (!gl || !uniformsRef.current.uPortGlows) return
      const arr = new Float32Array(16)
      for (let i = 0; i < Math.min(glows.length, 16); i++) arr[i] = glows[i]
      gl.uniform1fv(uniformsRef.current.uPortGlows, arr)
    },
    setPlayerStarPulse(pulse: number) {
      const gl = glRef.current
      if (!gl || !uniformsRef.current.uPlayerStarPulse) return
      gl.uniform1f(uniformsRef.current.uPlayerStarPulse, pulse)
    },
    setFacingAngle(angle: number) {
      const gl = glRef.current
      if (!gl || !uniformsRef.current.uFacingAngle) return
      gl.uniform1f(uniformsRef.current.uFacingAngle, angle)
    },
  }), [cameraX, cameraY])

  // Init WebGL2
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl2')
    if (!gl) { console.error('WebGL2 not available'); return }
    glRef.current = gl
    startTimeRef.current = performance.now()

    // Fullscreen quad
    const quadBuf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)

    // Compile shaders
    const vs = gl.createShader(gl.VERTEX_SHADER)!
    gl.shaderSource(vs, VERT_SRC)
    gl.compileShader(vs)
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) console.error('VS:', gl.getShaderInfoLog(vs))

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!
    gl.shaderSource(fs, FRAG_SRC)
    gl.compileShader(fs)
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) console.error('FS:', gl.getShaderInfoLog(fs))

    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) console.error('Link:', gl.getProgramInfoLog(prog))
    gl.useProgram(prog)

    // Attributes
    const aPos = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    // Uniforms
    uniformsRef.current = {
      uCamera: gl.getUniformLocation(prog, 'u_camera'),
      uResolution: gl.getUniformLocation(prog, 'u_resolution'),
      uHoveredObj: gl.getUniformLocation(prog, 'u_hoveredObj'),
      uTime: gl.getUniformLocation(prog, 'u_time'),
      uPortGlows: gl.getUniformLocation(prog, 'u_portGlows'),
      uPortObjBase: gl.getUniformLocation(prog, 'u_portObjBase'),
      uPlayerStarPulse: gl.getUniformLocation(prog, 'u_playerStarPulse'),
      uFacingAngle: gl.getUniformLocation(prog, 'u_facingAngle'),
    }
    gl.uniform2f(gl.getUniformLocation(prog, 'u_worldSize'), WORLD_W, WORLD_H)
    gl.uniform1f(uniformsRef.current.uPortObjBase!, 50.0) // PORT_OBJ_BASE
    gl.uniform1f(uniformsRef.current.uPlayerStarPulse!, 0.5)
    gl.uniform1f(uniformsRef.current.uFacingAngle!, 0.0)
    gl.uniform1fv(uniformsRef.current.uPortGlows!, new Float32Array(16))

    // Init world data
    const { colorData, objData } = initWorld()
    objDataRef.current = objData

    // Helper to create + upload a texture
    const createTex = (unit: number, data: Uint8Array, name: string) => {
      const tex = gl.createTexture()!
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, WORLD_W, WORLD_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, data)
      gl.uniform1i(gl.getUniformLocation(prog, name), unit)
      return tex
    }

    // World textures (TEXTURE0, TEXTURE1)
    const colorTex = createTex(0, colorData, 'u_colorTex')
    const objTex = createTex(1, objData, 'u_objTex')

    // Port overlay textures (TEXTURE2, TEXTURE3) — start empty
    const emptyData = new Uint8Array(WORLD_W * WORLD_H * 4)
    const portColorTex = createTex(2, emptyData, 'u_portColorTex')
    const portObjTex = createTex(3, new Uint8Array(WORLD_W * WORLD_H * 4), 'u_portObjTex')
    portColorTexRef.current = portColorTex
    portObjTexRef.current = portObjTex

    return () => {
      cancelAnimationFrame(animRef.current)
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      gl.deleteTexture(colorTex)
      gl.deleteTexture(objTex)
      gl.deleteTexture(portColorTex)
      gl.deleteTexture(portObjTex)
      gl.deleteBuffer(quadBuf)
    }
  }, [])

  // Render loop
  useEffect(() => {
    const gl = glRef.current
    if (!gl) return

    const render = () => {
      const canvas = canvasRef.current
      if (!canvas || !gl) return

      // Resize canvas to viewport
      const w = window.innerWidth
      const h = window.innerHeight
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        canvas.style.width = `${w}px`
        canvas.style.height = `${h}px`
        gl.viewport(0, 0, w, h)
      }

      const u = uniformsRef.current
      // World center offset: camera position maps to world center (WORLD_W/2, WORLD_H/2)
      gl.uniform2f(u.uCamera, WORLD_W / 2 + cameraX, WORLD_H / 2 + cameraY)
      gl.uniform2f(u.uResolution, w, h)
      gl.uniform1f(u.uHoveredObj, hoveredObjId)
      gl.uniform1f(u.uTime, (performance.now() - startTimeRef.current) / 1000)

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      animRef.current = requestAnimationFrame(render)
    }

    animRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(animRef.current)
  }, [cameraX, cameraY, hoveredObjId])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0"
      style={{ imageRendering: 'pixelated' }}
    />
  )
})

export default PixelEngine
export { SECTION_BOUNDS, SECTION_OBJ_BASE, WORLD_W, WORLD_H }
