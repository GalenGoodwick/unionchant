// Field Engine v3 — WebGL2 Renderer (Multi-pass, multi-effect)

import { GRID_SIZE } from './types'
import { vertexShaderSource, buildBaseFragmentShader, buildEffectFragmentShader, buildMaskClearShader, buildStateUpdateShader, buildCompositeStateShader } from './shaders'

/** Shared compiled program — deduplicated by GLSL source hash */
interface SharedProgram {
  program: WebGLProgram
  refCount: number
  uCamera: WebGLUniformLocation | null
  uResolution: WebGLUniformLocation | null
  uZoom: WebGLUniformLocation | null
  uTime: WebGLUniformLocation | null
  uGridSize: WebGLUniformLocation | null
  uColorTex: WebGLUniformLocation | null
  uStateTex: WebGLUniformLocation | null
  uFieldMask: WebGLUniformLocation | null
  uEffectBounds: WebGLUniformLocation | null
  uEffectParams: WebGLUniformLocation | null
  uFieldTransform: WebGLUniformLocation | null
  uFieldAColor: WebGLUniformLocation | null
  uFieldBColor: WebGLUniformLocation | null
  uFieldATransform: WebGLUniformLocation | null
  uFieldBTransform: WebGLUniformLocation | null
  uFeedbackTex: WebGLUniformLocation | null
  uFeedbackSize: WebGLUniformLocation | null
}

/** Per-effect feedback ping-pong texture pair */
interface FeedbackBuffer {
  texA: WebGLTexture
  texB: WebGLTexture
  currentIndex: 0 | 1
}

/** Lightweight entry mapping a programKey to its shared program hash */
interface FieldProgramEntry {
  glslHash: string
}

/** Effect data passed to render() for each effect pass */
export interface FieldEffectData {
  fieldId: string
  /** Composite key for fieldPrograms map (fieldId or fieldId_effectId) */
  programKey: string
  bounds: [number, number, number, number]
  transform: [number, number, number, number]
  params: [number, number, number, number]
  blend: 'alpha' | 'additive' | 'multiply' | 'screen' | 'softlight'
  /** Interaction parent A color (omit for normal field effects) */
  fieldAColor?: [number, number, number, number]
  /** Interaction parent B color (omit for normal field effects) */
  fieldBColor?: [number, number, number, number]
  /** Interaction parent A transform (omit for normal field effects) */
  fieldATransform?: [number, number, number, number]
  /** Interaction parent B transform (omit for normal field effects) */
  fieldBTransform?: [number, number, number, number]
  /** If true, clears underlying field pixels before rendering (interaction precedence) */
  precedence?: boolean
  /** Enable per-effect feedback buffer (u_feedbackTex reads previous frame output) */
  feedback?: boolean
}

/** Compiled interaction effect program — like FieldProgram but with extra uniforms for both fields */
export class FieldRenderer {
  gl: WebGL2RenderingContext | null = null
  private baseProgram: WebGLProgram | null = null
  private sharedPrograms: Map<string, SharedProgram> = new Map()
  private fieldEntries: Map<string, FieldProgramEntry> = new Map()
  private fieldMaskTextures: Map<string, WebGLTexture> = new Map()
  private colorTex: WebGLTexture | null = null
  private stateTex: WebGLTexture | null = null
  private selectionTex: WebGLTexture | null = null
  private effectTex: WebGLTexture | null = null
  private quadVAO: WebGLVertexArrayObject | null = null

  // Mask clear program — erases underlying pixels where interaction takes precedence
  private maskClearProgram: WebGLProgram | null = null
  private mcCamera: WebGLUniformLocation | null = null
  private mcResolution: WebGLUniformLocation | null = null
  private mcZoom: WebGLUniformLocation | null = null
  private mcGridSize: WebGLUniformLocation | null = null
  private mcFieldMask: WebGLUniformLocation | null = null

  // Presence map — field effects rendered to transparent FBO for pixel-perfect readback
  private presenceTex: WebGLTexture | null = null
  private presenceFBO: WebGLFramebuffer | null = null
  private presenceReadback: Float32Array | null = null

  // State update (render-to-texture ping-pong)
  private stateTex2: WebGLTexture | null = null
  private stateFBO: WebGLFramebuffer | null = null
  private stateUpdateProgram: WebGLProgram | null = null
  private stateUpdateActive: boolean = false
  private stateTexCurrent: 0 | 1 = 0
  private suStateTex: WebGLUniformLocation | null = null
  private suColorTex: WebGLUniformLocation | null = null
  private suGridSize: WebGLUniformLocation | null = null
  private suTime: WebGLUniformLocation | null = null
  private suDt: WebGLUniformLocation | null = null

  // Base program uniform locations
  private uCamera: WebGLUniformLocation | null = null
  private uResolution: WebGLUniformLocation | null = null
  private uZoom: WebGLUniformLocation | null = null
  private uTime: WebGLUniformLocation | null = null
  private uGridSize: WebGLUniformLocation | null = null
  private uColorTex: WebGLUniformLocation | null = null
  private uStateTex: WebGLUniformLocation | null = null
  private uSelectionTex: WebGLUniformLocation | null = null
  private uEffectTex: WebGLUniformLocation | null = null

  // Per-effect feedback buffers
  private feedbackBuffers: Map<string, FeedbackBuffer> = new Map()
  private feedbackFBO: WebGLFramebuffer | null = null
  private static readonly MAX_FEEDBACK_BUFFERS = 32
  private static readonly FEEDBACK_SIZE = 256
  static readonly MAX_FIELD_EFFECTS = 128

  init(canvas: HTMLCanvasElement, options?: { alpha?: boolean }): boolean {
    const gl = canvas.getContext('webgl2', {
      alpha: options?.alpha ?? false,
      antialias: false,
      preserveDrawingBuffer: true,
    })
    if (!gl) {
      console.error('WebGL2 not supported')
      return false
    }
    this.gl = gl

    const ext = gl.getExtension('EXT_color_buffer_float')
    if (!ext) {
      console.warn('EXT_color_buffer_float not available')
    }

    const baseResult = this.compileProgram(vertexShaderSource, buildBaseFragmentShader())
    if (!baseResult) return false
    this.baseProgram = baseResult

    this.acquireBaseUniformLocations(baseResult)

    this.quadVAO = gl.createVertexArray()!

    this.colorTex = this.createDataTexture()
    this.stateTex = this.createDataTexture()
    this.selectionTex = this.createSelectionTexture()
    this.effectTex = this.createDataTexture()

    this.stateTex2 = this.createDataTexture()
    this.stateFBO = gl.createFramebuffer()
    this.feedbackFBO = gl.createFramebuffer()

    this.presenceTex = this.createDataTexture()
    this.presenceFBO = gl.createFramebuffer()

    // Mask clear program — erases underlying pixels where interactions take precedence
    const mcProgram = this.compileProgram(vertexShaderSource, buildMaskClearShader())
    if (mcProgram) {
      this.maskClearProgram = mcProgram
      this.mcCamera = gl.getUniformLocation(mcProgram, 'u_camera')
      this.mcResolution = gl.getUniformLocation(mcProgram, 'u_resolution')
      this.mcZoom = gl.getUniformLocation(mcProgram, 'u_zoom')
      this.mcGridSize = gl.getUniformLocation(mcProgram, 'u_gridSize')
      this.mcFieldMask = gl.getUniformLocation(mcProgram, 'u_fieldMask')
    }

    return true
  }

  private acquireBaseUniformLocations(program: WebGLProgram): void {
    const gl = this.gl!
    this.uCamera = gl.getUniformLocation(program, 'u_camera')
    this.uResolution = gl.getUniformLocation(program, 'u_resolution')
    this.uZoom = gl.getUniformLocation(program, 'u_zoom')
    this.uTime = gl.getUniformLocation(program, 'u_time')
    this.uGridSize = gl.getUniformLocation(program, 'u_gridSize')
    this.uColorTex = gl.getUniformLocation(program, 'u_colorTex')
    this.uStateTex = gl.getUniformLocation(program, 'u_stateTex')
    this.uSelectionTex = gl.getUniformLocation(program, 'u_selectionTex')
    this.uEffectTex = gl.getUniformLocation(program, 'u_effectTex')
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    const gl = this.gl!
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader))
      gl.deleteShader(shader)
      return null
    }
    return shader
  }

  private compileProgram(vertSrc: string, fragSrc: string): WebGLProgram | null {
    const gl = this.gl!

    const vs = this.compileShader(gl.VERTEX_SHADER, vertSrc)
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fragSrc)
    if (!vs || !fs) {
      if (vs) gl.deleteShader(vs)
      if (fs) gl.deleteShader(fs)
      return null
    }

    const program = gl.createProgram()!
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    gl.deleteShader(vs)
    gl.deleteShader(fs)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program))
      gl.deleteProgram(program)
      return null
    }

    return program
  }

  private createDataTexture(): WebGLTexture {
    const gl = this.gl!
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)

    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA32F,
      GRID_SIZE, GRID_SIZE, 0,
      gl.RGBA, gl.FLOAT,
      null
    )
    if (gl.getError() !== gl.NO_ERROR) {
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA16F,
        GRID_SIZE, GRID_SIZE, 0,
        gl.RGBA, gl.FLOAT,
        null
      )
    }

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    return tex
  }

  private createSelectionTexture(): WebGLTexture {
    const gl = this.gl!
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.R8,
      GRID_SIZE, GRID_SIZE, 0,
      gl.RED, gl.UNSIGNED_BYTE,
      null
    )
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return tex
  }

  private createFeedbackTexture(): WebGLTexture | null {
    const gl = this.gl
    if (!gl) return null
    const tex = gl.createTexture()
    if (!tex) return null
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA16F,
      FieldRenderer.FEEDBACK_SIZE, FieldRenderer.FEEDBACK_SIZE, 0,
      gl.RGBA, gl.FLOAT, null
    )
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return tex
  }

  private getOrCreateFeedbackBuffer(programKey: string): FeedbackBuffer | null {
    let buf = this.feedbackBuffers.get(programKey)
    if (buf) return buf
    if (this.feedbackBuffers.size >= FieldRenderer.MAX_FEEDBACK_BUFFERS) return null
    const texA = this.createFeedbackTexture()
    const texB = this.createFeedbackTexture()
    if (!texA || !texB) return null
    buf = { texA, texB, currentIndex: 0 }
    this.feedbackBuffers.set(programKey, buf)
    return buf
  }

  /** Create a mask texture pre-filled with 0 (empty — effects only render where cells are painted) */
  private createEmptyMaskTexture(): WebGLTexture {
    const gl = this.gl!
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    const fullMask = new Uint8Array(GRID_SIZE * GRID_SIZE)
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.R8,
      GRID_SIZE, GRID_SIZE, 0,
      gl.RED, gl.UNSIGNED_BYTE,
      fullMask
    )
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return tex
  }

  uploadColorData(data: Float32Array): void {
    const gl = this.gl
    if (!gl || !this.colorTex) return
    gl.bindTexture(gl.TEXTURE_2D, this.colorTex)
    gl.texSubImage2D(
      gl.TEXTURE_2D, 0, 0, 0,
      GRID_SIZE, GRID_SIZE,
      gl.RGBA, gl.FLOAT,
      data
    )
  }

  uploadStateData(data: Float32Array): void {
    const gl = this.gl
    if (!gl) return
    const tex = this.stateTexCurrent === 0 ? this.stateTex : this.stateTex2
    if (!tex) return
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texSubImage2D(
      gl.TEXTURE_2D, 0, 0, 0,
      GRID_SIZE, GRID_SIZE,
      gl.RGBA, gl.FLOAT,
      data
    )
  }

  uploadEffectData(data: Float32Array): void {
    const gl = this.gl
    if (!gl || !this.effectTex) return
    gl.bindTexture(gl.TEXTURE_2D, this.effectTex)
    gl.texSubImage2D(
      gl.TEXTURE_2D, 0, 0, 0,
      GRID_SIZE, GRID_SIZE,
      gl.RGBA, gl.FLOAT,
      data
    )
  }

  uploadSelectionData(data: Uint8Array): void {
    const gl = this.gl
    if (!gl || !this.selectionTex) return
    gl.bindTexture(gl.TEXTURE_2D, this.selectionTex)
    gl.texSubImage2D(
      gl.TEXTURE_2D, 0, 0, 0,
      GRID_SIZE, GRID_SIZE,
      gl.RED, gl.UNSIGNED_BYTE,
      data
    )
  }

  /** FNV-1a hash of GLSL source, returned as base36 string */
  private hashGLSL(source: string): string {
    let hash = 0x811c9dc5 | 0
    for (let i = 0; i < source.length; i++) {
      hash ^= source.charCodeAt(i)
      hash = Math.imul(hash, 0x01000193)
    }
    return (hash >>> 0).toString(36)
  }

  /** Compile and store a field effect program (keyed by composite ID, deduplicated by GLSL hash) */
  compileFieldEffect(programKey: string, fieldId: string, glsl: string, modCode?: string): { success: boolean; error?: string } {
    const gl = this.gl
    if (!gl) return { success: false, error: 'No WebGL context' }

    const fragSrc = buildEffectFragmentShader(glsl, modCode)
    const hash = this.hashGLSL(fragSrc)

    // Clean up any existing entry for this programKey
    this.removeFieldEffect(programKey)

    // Check if we already have a shared program for this hash
    let shared = this.sharedPrograms.get(hash)
    if (shared) {
      shared.refCount++
    } else {
      // Limit check on unique programs, not instances
      if (this.sharedPrograms.size >= FieldRenderer.MAX_FIELD_EFFECTS) {
        return { success: false, error: `Max ${FieldRenderer.MAX_FIELD_EFFECTS} unique field effects reached` }
      }

      // Validate fragment shader
      const fs = gl.createShader(gl.FRAGMENT_SHADER)!
      gl.shaderSource(fs, fragSrc)
      gl.compileShader(fs)
      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(fs) || 'Fragment shader compile error'
        gl.deleteShader(fs)
        return { success: false, error }
      }
      gl.deleteShader(fs)

      const program = this.compileProgram(vertexShaderSource, fragSrc)
      if (!program) {
        return { success: false, error: 'Program link error' }
      }

      shared = {
        program,
        refCount: 1,
        uCamera: gl.getUniformLocation(program, 'u_camera'),
        uResolution: gl.getUniformLocation(program, 'u_resolution'),
        uZoom: gl.getUniformLocation(program, 'u_zoom'),
        uTime: gl.getUniformLocation(program, 'u_time'),
        uGridSize: gl.getUniformLocation(program, 'u_gridSize'),
        uColorTex: gl.getUniformLocation(program, 'u_colorTex'),
        uStateTex: gl.getUniformLocation(program, 'u_stateTex'),
        uFieldMask: gl.getUniformLocation(program, 'u_fieldMask'),
        uEffectBounds: gl.getUniformLocation(program, 'u_effectBounds'),
        uEffectParams: gl.getUniformLocation(program, 'u_effectParams'),
        uFieldTransform: gl.getUniformLocation(program, 'u_fieldTransform'),
        uFieldAColor: gl.getUniformLocation(program, 'u_fieldAColor'),
        uFieldBColor: gl.getUniformLocation(program, 'u_fieldBColor'),
        uFieldATransform: gl.getUniformLocation(program, 'u_fieldATransform'),
        uFieldBTransform: gl.getUniformLocation(program, 'u_fieldBTransform'),
        uFeedbackTex: gl.getUniformLocation(program, 'u_feedbackTex'),
        uFeedbackSize: gl.getUniformLocation(program, 'u_feedbackSize'),
      }
      this.sharedPrograms.set(hash, shared)
    }

    // Get or create mask texture for this field
    if (!this.fieldMaskTextures.has(fieldId)) {
      this.fieldMaskTextures.set(fieldId, this.createEmptyMaskTexture())
    }

    this.fieldEntries.set(programKey, { glslHash: hash })
    return { success: true }
  }

  /** Remove a field effect entry, decrementing shared program refcount */
  removeFieldEffect(programKey: string): void {
    const gl = this.gl
    if (!gl) return

    const entry = this.fieldEntries.get(programKey)
    if (!entry) return

    const shared = this.sharedPrograms.get(entry.glslHash)
    if (shared) {
      shared.refCount--
      if (shared.refCount <= 0) {
        gl.deleteProgram(shared.program)
        this.sharedPrograms.delete(entry.glslHash)
      }
    }

    this.fieldEntries.delete(programKey)
    // Do NOT delete mask texture — it belongs to the field

    // Clean up feedback buffer for this effect
    const fb = this.feedbackBuffers.get(programKey)
    if (fb) {
      gl.deleteTexture(fb.texA)
      gl.deleteTexture(fb.texB)
      this.feedbackBuffers.delete(programKey)
    }
  }

  /** Remove all effect entries for a given field ID prefix, and delete the field's mask texture */
  removeAllFieldEffects(fieldId: string): void {
    const gl = this.gl
    const keysToRemove: string[] = []
    for (const key of this.fieldEntries.keys()) {
      if (key === fieldId || key.startsWith(fieldId + '_')) {
        keysToRemove.push(key)
      }
    }
    for (const key of keysToRemove) {
      this.removeFieldEffect(key)
    }

    // Delete the field's mask texture
    if (gl) {
      const maskTex = this.fieldMaskTextures.get(fieldId)
      if (maskTex) {
        gl.deleteTexture(maskTex)
        this.fieldMaskTextures.delete(fieldId)
      }
    }
  }

  /** Upload a per-field mask texture (shared by all effects on this field) */
  uploadFieldMask(fieldId: string, data: Uint8Array): void {
    const gl = this.gl
    if (!gl) return

    const maskTex = this.fieldMaskTextures.get(fieldId)
    if (!maskTex) return

    gl.bindTexture(gl.TEXTURE_2D, maskTex)
    gl.texSubImage2D(
      gl.TEXTURE_2D, 0, 0, 0,
      GRID_SIZE, GRID_SIZE,
      gl.RED, gl.UNSIGNED_BYTE,
      data
    )
  }

  /** Get all field effect program keys (for cleanup iteration) */
  getFieldEffectKeys(): IterableIterator<string> {
    return this.fieldEntries.keys()
  }

  /** Remove a field mask texture */
  removeFieldMask(fieldId: string): void {
    const tex = this.fieldMaskTextures.get(fieldId)
    if (tex) {
      this.gl?.deleteTexture(tex)
      this.fieldMaskTextures.delete(fieldId)
    }
  }

  /** Check if a field effect program exists */
  hasFieldEffect(programKey: string): boolean {
    return this.fieldEntries.has(programKey)
  }

  /** Set GL blend mode for an effect */
  private setBlendMode(blend: 'alpha' | 'additive' | 'multiply' | 'screen' | 'softlight'): void {
    const gl = this.gl!
    gl.enable(gl.BLEND)
    switch (blend) {
      case 'alpha':
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
        break
      case 'additive':
        gl.blendFunc(gl.ONE, gl.ONE)
        break
      case 'multiply':
        gl.blendFunc(gl.DST_COLOR, gl.ZERO)
        break
      case 'screen':
        // Screen blend: result = 1 - (1-src)*(1-dst), approximated with GL blend
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR)
        break
      case 'softlight':
        // Soft light approximation — use alpha blend as fallback
        // (true soft light requires a shader pass, so this is a close approximation)
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
        break
    }
  }

  /** Multi-pass render: base pass + unified field/interaction effect passes */
  render(
    camera: { x: number; y: number },
    zoom: number,
    time: number,
    fieldEffects?: FieldEffectData[]
  ): void {
    const gl = this.gl
    if (!gl || !this.baseProgram) return

    const canvas = gl.canvas as HTMLCanvasElement

    const dpr = window.devicePixelRatio || 1
    const displayW = canvas.clientWidth
    const displayH = canvas.clientHeight
    const bufferW = Math.round(displayW * dpr)
    const bufferH = Math.round(displayH * dpr)

    if (canvas.width !== bufferW || canvas.height !== bufferH) {
      canvas.width = bufferW
      canvas.height = bufferH
    }

    gl.viewport(0, 0, bufferW, bufferH)

    // --- Pass 1: Base (opaque) ---
    gl.disable(gl.BLEND)
    gl.clearColor(0.035, 0.045, 0.065, 1.0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    gl.useProgram(this.baseProgram)

    gl.uniform2f(this.uCamera, camera.x, camera.y)
    gl.uniform2f(this.uResolution, bufferW, bufferH)
    gl.uniform1f(this.uZoom, zoom)
    gl.uniform1f(this.uTime, time)
    gl.uniform1f(this.uGridSize, GRID_SIZE)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.colorTex)
    gl.uniform1i(this.uColorTex, 0)

    const currentStateTex = this.getCurrentStateTex()

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, currentStateTex)
    gl.uniform1i(this.uStateTex, 1)

    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, this.selectionTex)
    gl.uniform1i(this.uSelectionTex, 2)

    gl.activeTexture(gl.TEXTURE3)
    gl.bindTexture(gl.TEXTURE_2D, this.effectTex)
    gl.uniform1i(this.uEffectTex, 3)

    gl.bindVertexArray(this.quadVAO)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    // --- Pass 2..N: Unified field + interaction effects (with blend modes) ---
    if (fieldEffects && fieldEffects.length > 0) {
      for (const effect of fieldEffects) {
        const entry = this.fieldEntries.get(effect.programKey)
        if (!entry) continue
        const shared = this.sharedPrograms.get(entry.glslHash)
        if (!shared) continue

        // Precedence pass: clear underlying pixels where the overlap mask is active
        if (effect.precedence && this.maskClearProgram) {
          gl.disable(gl.BLEND)
          gl.useProgram(this.maskClearProgram)
          gl.uniform2f(this.mcCamera, camera.x, camera.y)
          gl.uniform2f(this.mcResolution, bufferW, bufferH)
          gl.uniform1f(this.mcZoom, zoom)
          gl.uniform1f(this.mcGridSize, GRID_SIZE)
          gl.activeTexture(gl.TEXTURE0)
          const precMaskTex = this.fieldMaskTextures.get(effect.fieldId)
          gl.bindTexture(gl.TEXTURE_2D, precMaskTex || null)
          gl.uniform1i(this.mcFieldMask, 0)
          gl.drawArrays(gl.TRIANGLES, 0, 6)
        }

        this.setBlendMode(effect.blend)

        gl.useProgram(shared.program)

        gl.uniform2f(shared.uCamera, camera.x, camera.y)
        gl.uniform2f(shared.uResolution, bufferW, bufferH)
        gl.uniform1f(shared.uZoom, zoom)
        gl.uniform1f(shared.uTime, time)
        gl.uniform1f(shared.uGridSize, GRID_SIZE)

        gl.uniform4f(shared.uEffectBounds, effect.bounds[0], effect.bounds[1], effect.bounds[2], effect.bounds[3])
        gl.uniform4f(shared.uEffectParams, effect.params[0], effect.params[1], effect.params[2], effect.params[3])
        gl.uniform4f(shared.uFieldTransform, effect.transform[0], effect.transform[1], effect.transform[2], effect.transform[3])

        // Parent field data (zero for normal fields, populated for interaction effects)
        const ac = effect.fieldAColor || [0, 0, 0, 0]
        const bc = effect.fieldBColor || [0, 0, 0, 0]
        const at = effect.fieldATransform || [0, 0, 0, 0]
        const bt = effect.fieldBTransform || [0, 0, 0, 0]
        gl.uniform4f(shared.uFieldAColor, ac[0], ac[1], ac[2], ac[3])
        gl.uniform4f(shared.uFieldBColor, bc[0], bc[1], bc[2], bc[3])
        gl.uniform4f(shared.uFieldATransform, at[0], at[1], at[2], at[3])
        gl.uniform4f(shared.uFieldBTransform, bt[0], bt[1], bt[2], bt[3])

        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.colorTex)
        gl.uniform1i(shared.uColorTex, 0)

        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, currentStateTex)
        gl.uniform1i(shared.uStateTex, 1)

        gl.activeTexture(gl.TEXTURE2)
        const maskTex = this.fieldMaskTextures.get(effect.fieldId)
        gl.bindTexture(gl.TEXTURE_2D, maskTex || null)
        gl.uniform1i(shared.uFieldMask, 2)

        // Feedback buffer: FBO pass then screen pass
        const feedbackBuf = effect.feedback ? this.getOrCreateFeedbackBuffer(effect.programKey) : null

        if (feedbackBuf && this.feedbackFBO) {
          const readTex = feedbackBuf.currentIndex === 0 ? feedbackBuf.texA : feedbackBuf.texB
          const writeTex = feedbackBuf.currentIndex === 0 ? feedbackBuf.texB : feedbackBuf.texA

          // Compute FBO camera/zoom so the effect bounds fill the 256x256 texture
          const fbW = effect.bounds[2] - effect.bounds[0]
          const fbH = effect.bounds[3] - effect.bounds[1]
          const fbMaxDim = Math.max(fbW, fbH, 1)
          const fbCamX = (effect.bounds[0] + effect.bounds[2]) / 2
          const fbCamY = (effect.bounds[1] + effect.bounds[3]) / 2
          const fbZoom = GRID_SIZE / fbMaxDim

          // FBO pass: render to feedback texture
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.feedbackFBO)
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, writeTex, 0)
          gl.viewport(0, 0, FieldRenderer.FEEDBACK_SIZE, FieldRenderer.FEEDBACK_SIZE)
          gl.disable(gl.BLEND)

          // Override camera/resolution/zoom for FBO coordinate space
          gl.uniform2f(shared.uCamera, fbCamX, fbCamY)
          gl.uniform2f(shared.uResolution, FieldRenderer.FEEDBACK_SIZE, FieldRenderer.FEEDBACK_SIZE)
          gl.uniform1f(shared.uZoom, fbZoom)

          gl.activeTexture(gl.TEXTURE3)
          gl.bindTexture(gl.TEXTURE_2D, readTex)
          gl.uniform1i(shared.uFeedbackTex, 3)
          gl.uniform2f(shared.uFeedbackSize, FieldRenderer.FEEDBACK_SIZE, FieldRenderer.FEEDBACK_SIZE)

          gl.bindVertexArray(this.quadVAO)
          gl.drawArrays(gl.TRIANGLES, 0, 6)

          // Flip ping-pong
          feedbackBuf.currentIndex = feedbackBuf.currentIndex === 0 ? 1 : 0

          // Restore screen framebuffer, viewport, and camera uniforms
          gl.bindFramebuffer(gl.FRAMEBUFFER, null)
          gl.viewport(0, 0, bufferW, bufferH)
          gl.uniform2f(shared.uCamera, camera.x, camera.y)
          gl.uniform2f(shared.uResolution, bufferW, bufferH)
          gl.uniform1f(shared.uZoom, zoom)

          // Bind updated feedback for screen pass
          const newReadTex = feedbackBuf.currentIndex === 0 ? feedbackBuf.texA : feedbackBuf.texB
          gl.activeTexture(gl.TEXTURE3)
          gl.bindTexture(gl.TEXTURE_2D, newReadTex)
          gl.uniform1i(shared.uFeedbackTex, 3)
          gl.uniform2f(shared.uFeedbackSize, FieldRenderer.FEEDBACK_SIZE, FieldRenderer.FEEDBACK_SIZE)
        }

        // Screen pass
        this.setBlendMode(effect.blend)
        gl.bindVertexArray(this.quadVAO)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
      }

      gl.disable(gl.BLEND)
    }

    gl.bindVertexArray(null)
  }

  /** Effects-only render: skips base pass, clears to a background color, only renders field effects.
   *  Used by the spatial canvas to display saved fields as background decoration. */
  renderEffectsOnly(
    camera: { x: number; y: number },
    zoom: number,
    time: number,
    fieldEffects: FieldEffectData[],
    clearColor: [number, number, number, number] = [0.008, 0.024, 0.09, 1.0]
  ): void {
    const gl = this.gl
    if (!gl) return

    const canvas = gl.canvas as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const displayW = canvas.clientWidth
    const displayH = canvas.clientHeight
    const bufferW = Math.round(displayW * dpr)
    const bufferH = Math.round(displayH * dpr)

    if (canvas.width !== bufferW || canvas.height !== bufferH) {
      canvas.width = bufferW
      canvas.height = bufferH
    }

    gl.viewport(0, 0, bufferW, bufferH)
    gl.disable(gl.BLEND)
    gl.clearColor(clearColor[0], clearColor[1], clearColor[2], clearColor[3])
    gl.clear(gl.COLOR_BUFFER_BIT)

    if (fieldEffects.length === 0) return

    const currentStateTex = this.getCurrentStateTex()

    for (const effect of fieldEffects) {
      const entry = this.fieldEntries.get(effect.programKey)
      if (!entry) continue
      const shared = this.sharedPrograms.get(entry.glslHash)
      if (!shared) continue

      this.setBlendMode(effect.blend)

      gl.useProgram(shared.program)

      gl.uniform2f(shared.uCamera, camera.x, camera.y)
      gl.uniform2f(shared.uResolution, bufferW, bufferH)
      gl.uniform1f(shared.uZoom, zoom)
      gl.uniform1f(shared.uTime, time)
      gl.uniform1f(shared.uGridSize, GRID_SIZE)

      gl.uniform4f(shared.uEffectBounds, effect.bounds[0], effect.bounds[1], effect.bounds[2], effect.bounds[3])
      gl.uniform4f(shared.uEffectParams, effect.params[0], effect.params[1], effect.params[2], effect.params[3])
      gl.uniform4f(shared.uFieldTransform, effect.transform[0], effect.transform[1], effect.transform[2], effect.transform[3])

      const ac = effect.fieldAColor || [0, 0, 0, 0]
      const bc = effect.fieldBColor || [0, 0, 0, 0]
      const at = effect.fieldATransform || [0, 0, 0, 0]
      const bt = effect.fieldBTransform || [0, 0, 0, 0]
      gl.uniform4f(shared.uFieldAColor, ac[0], ac[1], ac[2], ac[3])
      gl.uniform4f(shared.uFieldBColor, bc[0], bc[1], bc[2], bc[3])
      gl.uniform4f(shared.uFieldATransform, at[0], at[1], at[2], at[3])
      gl.uniform4f(shared.uFieldBTransform, bt[0], bt[1], bt[2], bt[3])

      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.colorTex)
      gl.uniform1i(shared.uColorTex, 0)

      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, currentStateTex)
      gl.uniform1i(shared.uStateTex, 1)

      gl.activeTexture(gl.TEXTURE2)
      const maskTex = this.fieldMaskTextures.get(effect.fieldId)
      gl.bindTexture(gl.TEXTURE_2D, maskTex || null)
      gl.uniform1i(shared.uFieldMask, 2)

      // Feedback buffer: FBO pass then screen pass
      const feedbackBuf = effect.feedback ? this.getOrCreateFeedbackBuffer(effect.programKey) : null

      if (feedbackBuf && this.feedbackFBO) {
        const readTex = feedbackBuf.currentIndex === 0 ? feedbackBuf.texA : feedbackBuf.texB
        const writeTex = feedbackBuf.currentIndex === 0 ? feedbackBuf.texB : feedbackBuf.texA

        // Compute FBO camera/zoom so the effect bounds fill the 256x256 texture
        const fbW = effect.bounds[2] - effect.bounds[0]
        const fbH = effect.bounds[3] - effect.bounds[1]
        const fbMaxDim = Math.max(fbW, fbH, 1)
        const fbCamX = (effect.bounds[0] + effect.bounds[2]) / 2
        const fbCamY = (effect.bounds[1] + effect.bounds[3]) / 2
        const fbZoom = GRID_SIZE / fbMaxDim

        // FBO pass: render to feedback texture
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.feedbackFBO)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, writeTex, 0)
        gl.viewport(0, 0, FieldRenderer.FEEDBACK_SIZE, FieldRenderer.FEEDBACK_SIZE)
        gl.disable(gl.BLEND)

        // Override camera/resolution/zoom for FBO coordinate space
        gl.uniform2f(shared.uCamera, fbCamX, fbCamY)
        gl.uniform2f(shared.uResolution, FieldRenderer.FEEDBACK_SIZE, FieldRenderer.FEEDBACK_SIZE)
        gl.uniform1f(shared.uZoom, fbZoom)

        gl.activeTexture(gl.TEXTURE3)
        gl.bindTexture(gl.TEXTURE_2D, readTex)
        gl.uniform1i(shared.uFeedbackTex, 3)
        gl.uniform2f(shared.uFeedbackSize, FieldRenderer.FEEDBACK_SIZE, FieldRenderer.FEEDBACK_SIZE)

        gl.bindVertexArray(this.quadVAO)
        gl.drawArrays(gl.TRIANGLES, 0, 6)

        // Flip ping-pong
        feedbackBuf.currentIndex = feedbackBuf.currentIndex === 0 ? 1 : 0

        // Restore screen framebuffer, viewport, and camera uniforms
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        gl.viewport(0, 0, bufferW, bufferH)
        gl.uniform2f(shared.uCamera, camera.x, camera.y)
        gl.uniform2f(shared.uResolution, bufferW, bufferH)
        gl.uniform1f(shared.uZoom, zoom)

        // Bind updated feedback for screen pass
        const newReadTex = feedbackBuf.currentIndex === 0 ? feedbackBuf.texA : feedbackBuf.texB
        gl.activeTexture(gl.TEXTURE3)
        gl.bindTexture(gl.TEXTURE_2D, newReadTex)
        gl.uniform1i(shared.uFeedbackTex, 3)
        gl.uniform2f(shared.uFeedbackSize, FieldRenderer.FEEDBACK_SIZE, FieldRenderer.FEEDBACK_SIZE)
      }

      // Screen pass
      this.setBlendMode(effect.blend)
      gl.bindVertexArray(this.quadVAO)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }

    gl.disable(gl.BLEND)
    gl.bindVertexArray(null)
  }

  /** Sample rendered pixels in a region — returns downsampled RGBA grid.
   *  Reads from the current framebuffer (call after render()).
   *  Returns a flat array of [r,g,b,a] values, row-major, bottom-to-top. */
  sampleRenderedRegion(
    camera: { x: number; y: number },
    zoom: number,
    gridX: number, gridY: number,
    gridW: number, gridH: number,
    sampleSize: number = 16
  ): { width: number; height: number; pixels: number[] } | null {
    const gl = this.gl
    if (!gl) return null
    const canvas = gl.canvas as HTMLCanvasElement

    const bufferW = canvas.width
    const bufferH = canvas.height
    const aspect = bufferW / bufferH

    // Convert grid coords to screen (pixel) coords — match the camera math in render()
    const gridRange = 512 / zoom
    let screenX: number, screenY: number, screenW: number, screenH: number
    if (aspect > 1) {
      screenX = ((gridX - camera.x) / (gridRange * aspect) + 0.5) * bufferW
      screenY = ((gridY - camera.y) / gridRange + 0.5) * bufferH
      screenW = (gridW / (gridRange * aspect)) * bufferW
      screenH = (gridH / gridRange) * bufferH
    } else {
      screenX = ((gridX - camera.x) / gridRange + 0.5) * bufferW
      screenY = ((gridY - camera.y) / (gridRange / aspect) + 0.5) * bufferH
      screenW = (gridW / gridRange) * bufferW
      screenH = (gridH / (gridRange / aspect)) * bufferH
    }

    // Clamp to canvas bounds
    const x0 = Math.max(0, Math.floor(screenX))
    const y0 = Math.max(0, Math.floor(screenY))
    const x1 = Math.min(bufferW, Math.ceil(screenX + screenW))
    const y1 = Math.min(bufferH, Math.ceil(screenY + screenH))
    const pw = x1 - x0
    const ph = y1 - y0
    if (pw <= 0 || ph <= 0) return null

    // Read the full region
    const raw = new Uint8Array(pw * ph * 4)
    gl.readPixels(x0, y0, pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, raw)

    // Downsample to sampleSize x sampleSize
    const outW = Math.min(sampleSize, pw)
    const outH = Math.min(sampleSize, ph)
    const pixels: number[] = []
    for (let sy = 0; sy < outH; sy++) {
      for (let sx = 0; sx < outW; sx++) {
        const srcX = Math.floor((sx / outW) * pw)
        const srcY = Math.floor((sy / outH) * ph)
        const idx = (srcY * pw + srcX) * 4
        pixels.push(
          raw[idx] / 255,
          raw[idx + 1] / 255,
          raw[idx + 2] / 255,
          raw[idx + 3] / 255
        )
      }
    }
    return { width: outW, height: outH, pixels }
  }

  /** Compile a global state update shader from agent-authored GLSL */
  compileStateUpdate(glsl: string, modCode?: string): { success: boolean; error?: string } {
    const gl = this.gl
    if (!gl) return { success: false, error: 'No WebGL context' }

    const fragSrc = buildStateUpdateShader(glsl, modCode)

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!
    gl.shaderSource(fs, fragSrc)
    gl.compileShader(fs)
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(fs) || 'State update shader compile error'
      gl.deleteShader(fs)
      return { success: false, error }
    }
    gl.deleteShader(fs)

    const program = this.compileProgram(vertexShaderSource, fragSrc)
    if (!program) return { success: false, error: 'State update program link error' }

    if (this.stateUpdateProgram) gl.deleteProgram(this.stateUpdateProgram)

    this.stateUpdateProgram = program
    this.stateUpdateActive = true
    this.suStateTex = gl.getUniformLocation(program, 'u_stateTex')
    this.suColorTex = gl.getUniformLocation(program, 'u_colorTex')
    this.suGridSize = gl.getUniformLocation(program, 'u_gridSize')
    this.suTime = gl.getUniformLocation(program, 'u_time')
    this.suDt = gl.getUniformLocation(program, 'u_dt')

    return { success: true }
  }

  /** Compile a composite state update shader from multiple field contributions */
  compileCompositeStateUpdate(fields: { id: string; glsl: string }[], modCode?: string): { success: boolean; error?: string } {
    const gl = this.gl
    if (!gl) return { success: false, error: 'No WebGL context' }
    if (fields.length === 0) {
      this.removeStateUpdate()
      return { success: true }
    }

    const fragSrc = buildCompositeStateShader(fields, modCode)

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!
    gl.shaderSource(fs, fragSrc)
    gl.compileShader(fs)
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(fs) || 'Composite state shader compile error'
      gl.deleteShader(fs)
      return { success: false, error }
    }
    gl.deleteShader(fs)

    const program = this.compileProgram(vertexShaderSource, fragSrc)
    if (!program) return { success: false, error: 'Composite state update program link error' }

    if (this.stateUpdateProgram) gl.deleteProgram(this.stateUpdateProgram)

    this.stateUpdateProgram = program
    this.stateUpdateActive = true
    this.suStateTex = gl.getUniformLocation(program, 'u_stateTex')
    this.suColorTex = gl.getUniformLocation(program, 'u_colorTex')
    this.suGridSize = gl.getUniformLocation(program, 'u_gridSize')
    this.suTime = gl.getUniformLocation(program, 'u_time')
    this.suDt = gl.getUniformLocation(program, 'u_dt')

    return { success: true }
  }

  /** Remove active state update shader */
  removeStateUpdate(): void {
    const gl = this.gl
    if (!gl) return
    if (this.stateUpdateProgram) {
      gl.deleteProgram(this.stateUpdateProgram)
      this.stateUpdateProgram = null
    }
    this.stateUpdateActive = false
  }

  /** Run the state update pass (ping-pong render-to-texture) */
  runStateUpdate(time: number, dt: number): void {
    const gl = this.gl
    if (!gl || !this.stateUpdateActive || !this.stateUpdateProgram || !this.stateFBO) return

    const srcTex = this.stateTexCurrent === 0 ? this.stateTex : this.stateTex2
    const dstTex = this.stateTexCurrent === 0 ? this.stateTex2 : this.stateTex

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.stateFBO)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dstTex, 0)

    gl.viewport(0, 0, GRID_SIZE, GRID_SIZE)
    gl.disable(gl.BLEND)

    gl.useProgram(this.stateUpdateProgram)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, srcTex)
    gl.uniform1i(this.suStateTex, 0)

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.colorTex)
    gl.uniform1i(this.suColorTex, 1)

    gl.uniform1f(this.suGridSize, GRID_SIZE)
    gl.uniform1f(this.suTime, time)
    gl.uniform1f(this.suDt, dt)

    gl.bindVertexArray(this.quadVAO)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    this.stateTexCurrent = this.stateTexCurrent === 0 ? 1 : 0

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** Get the current state texture (for visual shader reads) */
  getCurrentStateTex(): WebGLTexture | null {
    return this.stateTexCurrent === 0 ? this.stateTex : this.stateTex2
  }

  /** Read GPU state back to CPU Float32Array */
  readbackState(target: Float32Array): void {
    const gl = this.gl
    if (!gl || !this.stateFBO) return

    const currentTex = this.getCurrentStateTex()
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.stateFBO)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, currentTex, 0)
    gl.readPixels(0, 0, GRID_SIZE, GRID_SIZE, gl.RGBA, gl.FLOAT, target)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** Render field effects into the presence FBO (transparent background) and read back.
   *  colorData gets pixel-perfect field presence: only pixels where shaders actually drew. */
  renderPresenceMap(
    camera: { x: number; y: number },
    zoom: number,
    time: number,
    fieldEffects: FieldEffectData[],
    target: Float32Array
  ): void {
    const gl = this.gl
    if (!gl || !this.presenceFBO || !this.presenceTex) return

    // Render field effects into presence FBO with transparent clear
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.presenceFBO)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.presenceTex, 0)
    gl.viewport(0, 0, GRID_SIZE, GRID_SIZE)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    const currentStateTex = this.getCurrentStateTex()

    if (fieldEffects.length > 0) {
      for (const effect of fieldEffects) {
        const entry = this.fieldEntries.get(effect.programKey)
        if (!entry) continue
        const shared = this.sharedPrograms.get(entry.glslHash)
        if (!shared) continue

        this.setBlendMode(effect.blend)
        gl.useProgram(shared.program)

        // Use identity camera and zoom=1 so coords map 1:1 to grid pixels
        gl.uniform2f(shared.uCamera, GRID_SIZE / 2, GRID_SIZE / 2)
        gl.uniform2f(shared.uResolution, GRID_SIZE, GRID_SIZE)
        gl.uniform1f(shared.uZoom, 1.0)
        gl.uniform1f(shared.uTime, time)
        gl.uniform1f(shared.uGridSize, GRID_SIZE)

        gl.uniform4f(shared.uEffectBounds, effect.bounds[0], effect.bounds[1], effect.bounds[2], effect.bounds[3])
        gl.uniform4f(shared.uEffectParams, effect.params[0], effect.params[1], effect.params[2], effect.params[3])
        gl.uniform4f(shared.uFieldTransform, effect.transform[0], effect.transform[1], effect.transform[2], effect.transform[3])

        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.colorTex)
        gl.uniform1i(shared.uColorTex, 0)

        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, currentStateTex)
        gl.uniform1i(shared.uStateTex, 1)

        gl.activeTexture(gl.TEXTURE2)
        const maskTex = this.fieldMaskTextures.get(effect.fieldId)
        gl.bindTexture(gl.TEXTURE_2D, maskTex || null)
        gl.uniform1i(shared.uFieldMask, 2)

        gl.bindVertexArray(this.quadVAO)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
      }
      gl.disable(gl.BLEND)
    }

    // Read back as RGBA32F — pixel-perfect presence data
    // GL readback is bottom-to-top but colorData is top-to-bottom, so flip Y
    if (!this.presenceReadback) {
      this.presenceReadback = new Float32Array(GRID_SIZE * GRID_SIZE * 4)
    }
    gl.readPixels(0, 0, GRID_SIZE, GRID_SIZE, gl.RGBA, gl.FLOAT, this.presenceReadback)
    for (let y = 0; y < GRID_SIZE; y++) {
      const srcRow = (GRID_SIZE - 1 - y) * GRID_SIZE * 4
      const dstRow = y * GRID_SIZE * 4
      target.set(this.presenceReadback.subarray(srcRow, srcRow + GRID_SIZE * 4), dstRow)
    }

    // Restore default framebuffer and canvas viewport
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    const canvas = gl.canvas as HTMLCanvasElement
    gl.viewport(0, 0, canvas.width, canvas.height)
  }

  /** Render each field individually to the presence FBO and extract per-field pixel presence masks.
   *  Returns a Map from fieldId → Uint8Array (GRID_SIZE × GRID_SIZE, 0 or 255 per pixel).
   *  This is the "field renders to pixels → pixels return superimposition data" pipeline. */
  renderFieldPresenceMaps(
    time: number,
    fieldEffects: FieldEffectData[],
  ): Map<string, Uint8Array> {
    const gl = this.gl
    if (!gl || !this.presenceFBO || !this.presenceTex) return new Map()

    const result = new Map<string, Uint8Array>()

    // Group effects by fieldId
    const effectsByField = new Map<string, FieldEffectData[]>()
    for (const effect of fieldEffects) {
      let list = effectsByField.get(effect.fieldId)
      if (!list) {
        list = []
        effectsByField.set(effect.fieldId, list)
      }
      list.push(effect)
    }

    if (effectsByField.size === 0) return result

    // Reuse readback buffer
    if (!this.presenceReadback) {
      this.presenceReadback = new Float32Array(GRID_SIZE * GRID_SIZE * 4)
    }

    const currentStateTex = this.getCurrentStateTex()

    for (const [fieldId, effects] of effectsByField) {
      // Bind presence FBO, clear to transparent
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.presenceFBO)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.presenceTex, 0)
      gl.viewport(0, 0, GRID_SIZE, GRID_SIZE)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)

      // Render this field's effects into the FBO
      for (const effect of effects) {
        const entry = this.fieldEntries.get(effect.programKey)
        if (!entry) continue
        const shared = this.sharedPrograms.get(entry.glslHash)
        if (!shared) continue

        this.setBlendMode(effect.blend)
        gl.useProgram(shared.program)

        // Identity camera: grid coords map 1:1 to FBO pixels
        gl.uniform2f(shared.uCamera, GRID_SIZE / 2, GRID_SIZE / 2)
        gl.uniform2f(shared.uResolution, GRID_SIZE, GRID_SIZE)
        gl.uniform1f(shared.uZoom, 1.0)
        gl.uniform1f(shared.uTime, time)
        gl.uniform1f(shared.uGridSize, GRID_SIZE)

        gl.uniform4f(shared.uEffectBounds, effect.bounds[0], effect.bounds[1], effect.bounds[2], effect.bounds[3])
        gl.uniform4f(shared.uEffectParams, effect.params[0], effect.params[1], effect.params[2], effect.params[3])
        gl.uniform4f(shared.uFieldTransform, effect.transform[0], effect.transform[1], effect.transform[2], effect.transform[3])

        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.colorTex)
        gl.uniform1i(shared.uColorTex, 0)

        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, currentStateTex)
        gl.uniform1i(shared.uStateTex, 1)

        gl.activeTexture(gl.TEXTURE2)
        const maskTex = this.fieldMaskTextures.get(effect.fieldId)
        gl.bindTexture(gl.TEXTURE_2D, maskTex || null)
        gl.uniform1i(shared.uFieldMask, 2)

        gl.bindVertexArray(this.quadVAO)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
      }
      gl.disable(gl.BLEND)

      // Read back as FLOAT (guaranteed for RGBA32F FBO)
      gl.readPixels(0, 0, GRID_SIZE, GRID_SIZE, gl.RGBA, gl.FLOAT, this.presenceReadback!)

      // Extract presence mask: alpha > threshold, Y-flipped (GL bottom-up → grid top-down)
      const presence = new Uint8Array(GRID_SIZE * GRID_SIZE)
      for (let y = 0; y < GRID_SIZE; y++) {
        const srcRow = (GRID_SIZE - 1 - y) * GRID_SIZE
        const dstRow = y * GRID_SIZE
        for (let x = 0; x < GRID_SIZE; x++) {
          const alpha = this.presenceReadback![(srcRow + x) * 4 + 3]
          if (alpha > 0.02) {
            presence[dstRow + x] = 255
          }
        }
      }

      result.set(fieldId, presence)
    }

    // Restore default framebuffer and canvas viewport
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    const canvas = gl.canvas as HTMLCanvasElement
    gl.viewport(0, 0, canvas.width, canvas.height)

    return result
  }

  /** GPU pick: render a single field's effect at one grid pixel and check if alpha > 0.
   *  Uses the presence FBO as scratch space. Returns true if the field rendered at (gx, gy). */
  pickFieldAtPixel(field: { id: string; effects: { id: string }[]; transform: { x: number; y: number; rotation: number; scale: number }; color: [number, number, number, number] }, gx: number, gy: number): boolean {
    const gl = this.gl
    if (!gl || !this.presenceFBO || !this.presenceTex) return false

    const effect = field.effects[0]
    if (!effect) return false
    const programKey = `${field.id}_${effect.id}`
    const entry = this.fieldEntries.get(programKey)
    if (!entry) return false
    const shared = this.sharedPrograms.get(entry.glslHash)
    if (!shared) return false

    // Render into 1x1 area of presence FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.presenceFBO)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.presenceTex, 0)
    gl.viewport(0, 0, GRID_SIZE, GRID_SIZE)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    gl.disable(gl.BLEND)
    gl.useProgram(shared.program)

    gl.uniform2f(shared.uCamera, GRID_SIZE / 2, GRID_SIZE / 2)
    gl.uniform2f(shared.uResolution, GRID_SIZE, GRID_SIZE)
    gl.uniform1f(shared.uZoom, 1.0)
    gl.uniform1f(shared.uTime, performance.now() / 1000)
    gl.uniform1f(shared.uGridSize, GRID_SIZE)

    const bounds = this.getFieldBoundsForPick(field.transform)
    gl.uniform4f(shared.uEffectBounds, bounds[0], bounds[1], bounds[2], bounds[3])
    gl.uniform4f(shared.uEffectParams, field.color[0], field.color[1], field.color[2], field.color[3])
    gl.uniform4f(shared.uFieldTransform, field.transform.x, field.transform.y, field.transform.rotation, field.transform.scale)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.colorTex)
    gl.uniform1i(shared.uColorTex, 0)

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.getCurrentStateTex())
    gl.uniform1i(shared.uStateTex, 1)

    gl.activeTexture(gl.TEXTURE2)
    const maskTex = this.fieldMaskTextures.get(field.id)
    gl.bindTexture(gl.TEXTURE_2D, maskTex || null)
    gl.uniform1i(shared.uFieldMask, 2)

    gl.bindVertexArray(this.quadVAO)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    // Read the single pixel (y-flipped)
    const pickPixel = new Float32Array(4)
    gl.readPixels(gx, GRID_SIZE - 1 - gy, 1, 1, gl.RGBA, gl.FLOAT, pickPixel)

    // Restore
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    const canvas = gl.canvas as HTMLCanvasElement
    gl.viewport(0, 0, canvas.width, canvas.height)

    return pickPixel[3] > 0.01
  }

  private getFieldBoundsForPick(transform: { x: number; y: number }): [number, number, number, number] {
    const extent = 32 // FIELD_RENDER_EXTENT
    return [
      transform.x - extent,
      transform.y - extent,
      transform.x + extent,
      transform.y + extent,
    ]
  }

  /** Check if a state update shader is active */
  hasStateUpdate(): boolean {
    return this.stateUpdateActive
  }

  destroy(): void {
    const gl = this.gl
    if (!gl) return

    for (const shared of this.sharedPrograms.values()) {
      gl.deleteProgram(shared.program)
    }
    this.sharedPrograms.clear()
    this.fieldEntries.clear()
    for (const tex of this.fieldMaskTextures.values()) {
      gl.deleteTexture(tex)
    }
    this.fieldMaskTextures.clear()

    if (this.maskClearProgram) gl.deleteProgram(this.maskClearProgram)

    // Clean up feedback buffers
    for (const fb of this.feedbackBuffers.values()) {
      gl.deleteTexture(fb.texA)
      gl.deleteTexture(fb.texB)
    }
    this.feedbackBuffers.clear()
    if (this.feedbackFBO) gl.deleteFramebuffer(this.feedbackFBO)

    if (this.colorTex) gl.deleteTexture(this.colorTex)
    if (this.stateTex) gl.deleteTexture(this.stateTex)
    if (this.stateTex2) gl.deleteTexture(this.stateTex2)
    if (this.stateFBO) gl.deleteFramebuffer(this.stateFBO)
    if (this.stateUpdateProgram) gl.deleteProgram(this.stateUpdateProgram)
    if (this.selectionTex) gl.deleteTexture(this.selectionTex)
    if (this.effectTex) gl.deleteTexture(this.effectTex)
    if (this.quadVAO) gl.deleteVertexArray(this.quadVAO)
    if (this.baseProgram) gl.deleteProgram(this.baseProgram)

    this.gl = null
    this.baseProgram = null
    this.colorTex = null
    this.stateTex = null
    this.stateTex2 = null
    this.stateFBO = null
    this.stateUpdateProgram = null
    this.selectionTex = null
    this.effectTex = null
    this.quadVAO = null
  }
}
