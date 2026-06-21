// Field Engine v3 — WebGL2 Renderer (Multi-pass, multi-effect)

import { GRID_SIZE } from './types'
import { vertexShaderSource, buildBaseFragmentShader, buildEffectFragmentShader, buildWorldEffectFragmentShader, buildStateUpdateShader, buildCompositeStateShader } from './shaders'

/** Per-field compiled program + mask texture */
interface FieldProgram {
  program: WebGLProgram
  maskTex: WebGLTexture
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
}

/** World effect compiled program */
interface WorldProgram {
  id: string
  program: WebGLProgram
  uCamera: WebGLUniformLocation | null
  uResolution: WebGLUniformLocation | null
  uZoom: WebGLUniformLocation | null
  uTime: WebGLUniformLocation | null
  uGridSize: WebGLUniformLocation | null
  uColorTex: WebGLUniformLocation | null
  uStateTex: WebGLUniformLocation | null
  uEffectParams: WebGLUniformLocation | null
  blend: 'alpha' | 'additive' | 'multiply'
  params: [number, number, number, number]
}

/** Effect data passed to render() for each effect pass */
export interface FieldEffectData {
  fieldId: string
  /** Composite key for fieldPrograms map (fieldId or fieldId_effectId) */
  programKey: string
  bounds: [number, number, number, number]
  transform: [number, number, number, number]
  params: [number, number, number, number]
  blend: 'alpha' | 'additive' | 'multiply'
}

export class FieldRenderer {
  private gl: WebGL2RenderingContext | null = null
  private baseProgram: WebGLProgram | null = null
  private fieldPrograms: Map<string, FieldProgram> = new Map()
  private colorTex: WebGLTexture | null = null
  private stateTex: WebGLTexture | null = null
  private selectionTex: WebGLTexture | null = null
  private quadVAO: WebGLVertexArrayObject | null = null

  // World effects (multiple, composited)
  private worldPrograms: Map<string, WorldProgram> = new Map()

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

  static readonly MAX_FIELD_EFFECTS = 128

  init(canvas: HTMLCanvasElement): boolean {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: false,
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

    this.stateTex2 = this.createDataTexture()
    this.stateFBO = gl.createFramebuffer()

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

  /** Compile and store a field effect program (keyed by composite ID) */
  compileFieldEffect(programKey: string, glsl: string): { success: boolean; error?: string } {
    const gl = this.gl
    if (!gl) return { success: false, error: 'No WebGL context' }

    if (this.fieldPrograms.size >= FieldRenderer.MAX_FIELD_EFFECTS) {
      return { success: false, error: `Max ${FieldRenderer.MAX_FIELD_EFFECTS} field effects reached` }
    }

    const fragSrc = buildEffectFragmentShader(glsl)

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

    // Remove existing program with this key if any
    this.removeFieldEffect(programKey)

    const maskTex = this.createSelectionTexture()

    const fp: FieldProgram = {
      program,
      maskTex,
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
    }

    this.fieldPrograms.set(programKey, fp)
    return { success: true }
  }

  /** Remove a field's effect program and mask texture */
  removeFieldEffect(programKey: string): void {
    const gl = this.gl
    if (!gl) return

    const fp = this.fieldPrograms.get(programKey)
    if (!fp) return

    gl.deleteProgram(fp.program)
    gl.deleteTexture(fp.maskTex)
    this.fieldPrograms.delete(programKey)
  }

  /** Remove all effect programs for a given field ID prefix */
  removeAllFieldEffects(fieldId: string): void {
    const keysToRemove: string[] = []
    for (const key of this.fieldPrograms.keys()) {
      if (key === fieldId || key.startsWith(fieldId + '_')) {
        keysToRemove.push(key)
      }
    }
    for (const key of keysToRemove) {
      this.removeFieldEffect(key)
    }
  }

  /** Upload a per-field mask texture */
  uploadFieldMask(programKey: string, data: Uint8Array): void {
    const gl = this.gl
    if (!gl) return

    const fp = this.fieldPrograms.get(programKey)
    if (!fp) return

    gl.bindTexture(gl.TEXTURE_2D, fp.maskTex)
    gl.texSubImage2D(
      gl.TEXTURE_2D, 0, 0, 0,
      GRID_SIZE, GRID_SIZE,
      gl.RED, gl.UNSIGNED_BYTE,
      data
    )
  }

  /** Check if a field effect program exists */
  hasFieldEffect(programKey: string): boolean {
    return this.fieldPrograms.has(programKey)
  }

  /** Set GL blend mode for an effect */
  private setBlendMode(blend: 'alpha' | 'additive' | 'multiply'): void {
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
    }
  }

  /** Multi-pass render: base pass + world effects + per-field effect passes */
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

    gl.bindVertexArray(this.quadVAO)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    // --- Pass 2..M: World effects (composited) ---
    for (const wp of this.worldPrograms.values()) {
      this.setBlendMode(wp.blend)

      gl.useProgram(wp.program)

      gl.uniform2f(wp.uCamera, camera.x, camera.y)
      gl.uniform2f(wp.uResolution, bufferW, bufferH)
      gl.uniform1f(wp.uZoom, zoom)
      gl.uniform1f(wp.uTime, time)
      gl.uniform1f(wp.uGridSize, GRID_SIZE)
      gl.uniform4f(wp.uEffectParams, wp.params[0], wp.params[1], wp.params[2], wp.params[3])

      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.colorTex)
      gl.uniform1i(wp.uColorTex, 0)

      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, currentStateTex)
      gl.uniform1i(wp.uStateTex, 1)

      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }

    // --- Pass M+1..N: Per-field effects (with blend modes) ---
    if (fieldEffects && fieldEffects.length > 0) {
      for (const effect of fieldEffects) {
        const fp = this.fieldPrograms.get(effect.programKey)
        if (!fp) continue

        this.setBlendMode(effect.blend)

        gl.useProgram(fp.program)

        gl.uniform2f(fp.uCamera, camera.x, camera.y)
        gl.uniform2f(fp.uResolution, bufferW, bufferH)
        gl.uniform1f(fp.uZoom, zoom)
        gl.uniform1f(fp.uTime, time)
        gl.uniform1f(fp.uGridSize, GRID_SIZE)

        gl.uniform4f(fp.uEffectBounds, effect.bounds[0], effect.bounds[1], effect.bounds[2], effect.bounds[3])
        gl.uniform4f(fp.uEffectParams, effect.params[0], effect.params[1], effect.params[2], effect.params[3])
        gl.uniform4f(fp.uFieldTransform, effect.transform[0], effect.transform[1], effect.transform[2], effect.transform[3])

        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.colorTex)
        gl.uniform1i(fp.uColorTex, 0)

        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, currentStateTex)
        gl.uniform1i(fp.uStateTex, 1)

        gl.activeTexture(gl.TEXTURE2)
        gl.bindTexture(gl.TEXTURE_2D, fp.maskTex)
        gl.uniform1i(fp.uFieldMask, 2)

        gl.drawArrays(gl.TRIANGLES, 0, 6)
      }

      gl.disable(gl.BLEND)
    }

    gl.bindVertexArray(null)
  }

  /** Compile and store a world effect program */
  compileWorldEffect(effectId: string, glsl: string, blend: 'alpha' | 'additive' | 'multiply' = 'alpha'): { success: boolean; error?: string } {
    const gl = this.gl
    if (!gl) return { success: false, error: 'No WebGL context' }

    const fragSrc = buildWorldEffectFragmentShader(glsl)

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!
    gl.shaderSource(fs, fragSrc)
    gl.compileShader(fs)
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(fs) || 'World shader compile error'
      gl.deleteShader(fs)
      return { success: false, error }
    }
    gl.deleteShader(fs)

    const program = this.compileProgram(vertexShaderSource, fragSrc)
    if (!program) return { success: false, error: 'World shader link error' }

    // Remove existing with this ID
    this.removeWorldEffect(effectId)

    const wp: WorldProgram = {
      id: effectId,
      program,
      uCamera: gl.getUniformLocation(program, 'u_camera'),
      uResolution: gl.getUniformLocation(program, 'u_resolution'),
      uZoom: gl.getUniformLocation(program, 'u_zoom'),
      uTime: gl.getUniformLocation(program, 'u_time'),
      uGridSize: gl.getUniformLocation(program, 'u_gridSize'),
      uColorTex: gl.getUniformLocation(program, 'u_colorTex'),
      uStateTex: gl.getUniformLocation(program, 'u_stateTex'),
      uEffectParams: gl.getUniformLocation(program, 'u_effectParams'),
      blend,
      params: [0, 0, 0, 0],
    }

    this.worldPrograms.set(effectId, wp)
    return { success: true }
  }

  /** Remove a world effect by ID */
  removeWorldEffect(effectId: string): void {
    const gl = this.gl
    if (!gl) return
    const wp = this.worldPrograms.get(effectId)
    if (!wp) return
    gl.deleteProgram(wp.program)
    this.worldPrograms.delete(effectId)
  }

  /** Remove all world effects */
  removeAllWorldEffects(): void {
    const gl = this.gl
    if (!gl) return
    for (const wp of this.worldPrograms.values()) {
      gl.deleteProgram(wp.program)
    }
    this.worldPrograms.clear()
  }

  /** Check if any world effect is active */
  hasWorldEffect(): boolean {
    return this.worldPrograms.size > 0
  }

  /** Set params for a world effect */
  setWorldEffectParams(effectId: string, params: [number, number, number, number]): void {
    const wp = this.worldPrograms.get(effectId)
    if (wp) {
      wp.params = params
    }
  }

  /** Set params for all world effects */
  setAllWorldEffectParams(params: [number, number, number, number]): void {
    for (const wp of this.worldPrograms.values()) {
      wp.params = params
    }
  }


  /** Compile a global state update shader from agent-authored GLSL */
  compileStateUpdate(glsl: string): { success: boolean; error?: string } {
    const gl = this.gl
    if (!gl) return { success: false, error: 'No WebGL context' }

    const fragSrc = buildStateUpdateShader(glsl)

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
  compileCompositeStateUpdate(fields: { id: string; glsl: string }[]): { success: boolean; error?: string } {
    const gl = this.gl
    if (!gl) return { success: false, error: 'No WebGL context' }
    if (fields.length === 0) {
      this.removeStateUpdate()
      return { success: true }
    }

    const fragSrc = buildCompositeStateShader(fields)

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

  /** Check if a state update shader is active */
  hasStateUpdate(): boolean {
    return this.stateUpdateActive
  }

  destroy(): void {
    const gl = this.gl
    if (!gl) return

    for (const [, fp] of this.fieldPrograms) {
      gl.deleteProgram(fp.program)
      gl.deleteTexture(fp.maskTex)
    }
    this.fieldPrograms.clear()

    for (const wp of this.worldPrograms.values()) {
      gl.deleteProgram(wp.program)
    }
    this.worldPrograms.clear()

    if (this.colorTex) gl.deleteTexture(this.colorTex)
    if (this.stateTex) gl.deleteTexture(this.stateTex)
    if (this.stateTex2) gl.deleteTexture(this.stateTex2)
    if (this.stateFBO) gl.deleteFramebuffer(this.stateFBO)
    if (this.stateUpdateProgram) gl.deleteProgram(this.stateUpdateProgram)
    if (this.selectionTex) gl.deleteTexture(this.selectionTex)
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
    this.quadVAO = null
  }
}
