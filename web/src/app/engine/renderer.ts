// Field Engine — WebGL2 Renderer (Multi-pass)

import { GRID_SIZE } from './types'
import { vertexShaderSource, buildBaseFragmentShader, buildEffectFragmentShader } from './shaders'

/** Per-field compiled program + mask texture */
interface FieldProgram {
  program: WebGLProgram
  maskTex: WebGLTexture
  // Uniform locations for this program
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

/** Effect data passed to render() for each field */
export interface FieldEffectData {
  fieldId: string
  bounds: [number, number, number, number]
  transform: [number, number, number, number]
  params: [number, number, number, number]
}

export class FieldRenderer {
  private gl: WebGL2RenderingContext | null = null
  private baseProgram: WebGLProgram | null = null
  private fieldPrograms: Map<string, FieldProgram> = new Map()
  private colorTex: WebGLTexture | null = null
  private stateTex: WebGLTexture | null = null
  private selectionTex: WebGLTexture | null = null
  private quadVAO: WebGLVertexArrayObject | null = null

  // Base program uniform locations
  private uCamera: WebGLUniformLocation | null = null
  private uResolution: WebGLUniformLocation | null = null
  private uZoom: WebGLUniformLocation | null = null
  private uTime: WebGLUniformLocation | null = null
  private uGridSize: WebGLUniformLocation | null = null
  private uColorTex: WebGLUniformLocation | null = null
  private uStateTex: WebGLUniformLocation | null = null
  private uSelectionTex: WebGLUniformLocation | null = null

  static readonly MAX_FIELD_EFFECTS = 8

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

    // Check for float texture support
    const ext = gl.getExtension('EXT_color_buffer_float')
    if (!ext) {
      console.warn('EXT_color_buffer_float not available')
    }

    // Compile base program
    const baseResult = this.compileProgram(vertexShaderSource, buildBaseFragmentShader())
    if (!baseResult) return false
    this.baseProgram = baseResult

    // Get base uniform locations
    this.acquireBaseUniformLocations(baseResult)

    // Create empty VAO for vertex-pulling (no attributes needed)
    this.quadVAO = gl.createVertexArray()!

    // Create textures
    this.colorTex = this.createDataTexture()
    this.stateTex = this.createDataTexture()
    this.selectionTex = this.createSelectionTexture()

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
    if (!gl || !this.stateTex) return
    gl.bindTexture(gl.TEXTURE_2D, this.stateTex)
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

  /** Compile and store a per-field effect program */
  compileFieldEffect(fieldId: string, glsl: string): { success: boolean; error?: string } {
    const gl = this.gl
    if (!gl) return { success: false, error: 'No WebGL context' }

    if (this.fieldPrograms.size >= FieldRenderer.MAX_FIELD_EFFECTS) {
      return { success: false, error: `Max ${FieldRenderer.MAX_FIELD_EFFECTS} field effects reached` }
    }

    const fragSrc = buildEffectFragmentShader(glsl)

    // Try compile fragment shader first for error reporting
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!
    gl.shaderSource(fs, fragSrc)
    gl.compileShader(fs)
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(fs) || 'Fragment shader compile error'
      gl.deleteShader(fs)
      return { success: false, error }
    }
    gl.deleteShader(fs)

    // Full compile
    const program = this.compileProgram(vertexShaderSource, fragSrc)
    if (!program) {
      return { success: false, error: 'Program link error' }
    }

    // Remove existing program for this field if any
    this.removeFieldEffect(fieldId)

    // Create mask texture for this field
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

    this.fieldPrograms.set(fieldId, fp)
    return { success: true }
  }

  /** Remove a field's effect program and mask texture */
  removeFieldEffect(fieldId: string): void {
    const gl = this.gl
    if (!gl) return

    const fp = this.fieldPrograms.get(fieldId)
    if (!fp) return

    gl.deleteProgram(fp.program)
    gl.deleteTexture(fp.maskTex)
    this.fieldPrograms.delete(fieldId)
  }

  /** Upload a per-field mask texture */
  uploadFieldMask(fieldId: string, data: Uint8Array): void {
    const gl = this.gl
    if (!gl) return

    const fp = this.fieldPrograms.get(fieldId)
    if (!fp) return

    gl.bindTexture(gl.TEXTURE_2D, fp.maskTex)
    gl.texSubImage2D(
      gl.TEXTURE_2D, 0, 0, 0,
      GRID_SIZE, GRID_SIZE,
      gl.RED, gl.UNSIGNED_BYTE,
      data
    )
  }

  /** Check if a field has an active compiled effect */
  hasFieldEffect(fieldId: string): boolean {
    return this.fieldPrograms.has(fieldId)
  }

  /** Multi-pass render: base pass + per-field effect passes */
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

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.stateTex)
    gl.uniform1i(this.uStateTex, 1)

    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, this.selectionTex)
    gl.uniform1i(this.uSelectionTex, 2)

    gl.bindVertexArray(this.quadVAO)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    // --- Pass 2..N: Per-field effects (alpha blended) ---
    if (fieldEffects && fieldEffects.length > 0) {
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

      for (const effect of fieldEffects) {
        const fp = this.fieldPrograms.get(effect.fieldId)
        if (!fp) continue

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
        gl.bindTexture(gl.TEXTURE_2D, this.stateTex)
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

  destroy(): void {
    const gl = this.gl
    if (!gl) return

    // Clean up field programs
    for (const [, fp] of this.fieldPrograms) {
      gl.deleteProgram(fp.program)
      gl.deleteTexture(fp.maskTex)
    }
    this.fieldPrograms.clear()

    if (this.colorTex) gl.deleteTexture(this.colorTex)
    if (this.stateTex) gl.deleteTexture(this.stateTex)
    if (this.selectionTex) gl.deleteTexture(this.selectionTex)
    if (this.quadVAO) gl.deleteVertexArray(this.quadVAO)
    if (this.baseProgram) gl.deleteProgram(this.baseProgram)

    this.gl = null
    this.baseProgram = null
    this.colorTex = null
    this.stateTex = null
    this.selectionTex = null
    this.quadVAO = null
  }
}
