// Field Engine v4 — WebGPU Renderer (Multi-pass, multi-effect)

import { DEFAULT_GRID_SIZE } from './types'
import {
  vertexShaderSource,
  buildBaseFragmentShader,
  buildEffectFragmentShader,
  buildMaskClearShader,
  buildStateUpdateComputeShader,
  buildCompositeStateComputeShader,
} from './shaders'

type BlendMode = 'alpha' | 'additive' | 'multiply' | 'screen' | 'softlight'

/** Shared compiled pipeline — deduplicated by WGSL source hash + blend mode */
interface SharedPipeline {
  pipeline: GPURenderPipeline
  refCount: number
}

/** Per-effect feedback ping-pong texture pair */
interface FeedbackBuffer {
  texA: GPUTexture
  texB: GPUTexture
  currentIndex: 0 | 1
}

/** Lightweight entry mapping a programKey to its shared pipeline hash */
interface FieldPipelineEntry {
  wgslHash: string
}

/** Effect data passed to render() for each effect pass */
export interface FieldEffectData {
  fieldId: string
  programKey: string
  bounds: [number, number, number, number]
  transform: [number, number, number, number]
  params: [number, number, number, number]
  blend: BlendMode
  fieldAColor?: [number, number, number, number]
  fieldBColor?: [number, number, number, number]
  fieldATransform?: [number, number, number, number]
  fieldBTransform?: [number, number, number, number]
  precedence?: boolean
  feedback?: boolean
}

/** Blend state descriptors keyed by blend mode */
function blendState(mode: BlendMode): GPUBlendState {
  switch (mode) {
    case 'alpha':
      return { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } }
    case 'additive':
      return { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } }
    case 'multiply':
      return { color: { srcFactor: 'dst', dstFactor: 'zero', operation: 'add' }, alpha: { srcFactor: 'dst-alpha', dstFactor: 'zero', operation: 'add' } }
    case 'screen':
      return { color: { srcFactor: 'one', dstFactor: 'one-minus-src', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } }
    case 'softlight':
      return { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } }
  }
}

export class FieldRenderer {
  device: GPUDevice | null = null
  private context: GPUCanvasContext | null = null
  private canvasFormat: GPUTextureFormat = 'bgra8unorm'
  private gridSize: number
  private hasFloat32Filterable: boolean = false

  // Base pipeline
  private basePipeline: GPURenderPipeline | null = null
  private vertexModule: GPUShaderModule | null = null

  // Shared pipelines: hash(wgsl+blend) → pipeline
  private sharedPipelines: Map<string, SharedPipeline> = new Map()
  private fieldEntries: Map<string, FieldPipelineEntry> = new Map()

  // Textures
  private colorTex: GPUTexture | null = null
  private stateTex: GPUTexture | null = null
  private stateTex2: GPUTexture | null = null
  private selectionTex: GPUTexture | null = null
  private effectTex: GPUTexture | null = null
  private fieldMaskTextures: Map<string, GPUTexture> = new Map()
  private sampler: GPUSampler | null = null

  // Presence map (async readback)
  private presenceTex: GPUTexture | null = null
  private presenceStagingBuf: GPUBuffer | null = null
  private presenceStagingBuf2: GPUBuffer | null = null
  private presenceReadPending: boolean = false
  private presenceLastResult: Map<string, Uint8Array> = new Map()

  // State update compute
  private stateUpdatePipeline: GPUComputePipeline | null = null
  private stateUpdateActive: boolean = false
  private stateTexCurrent: 0 | 1 = 0

  // Mask clear pipeline
  private maskClearPipeline: GPURenderPipeline | null = null

  // Frame uniform buffer
  private frameUniformBuf: GPUBuffer | null = null
  private effectUniformBuf: GPUBuffer | null = null
  private stateUniformBuf: GPUBuffer | null = null

  // Bind group layouts
  private frameBindGroupLayout: GPUBindGroupLayout | null = null
  private baseTextureBindGroupLayout: GPUBindGroupLayout | null = null
  private effectTextureBindGroupLayout: GPUBindGroupLayout | null = null
  private effectUniformBindGroupLayout: GPUBindGroupLayout | null = null
  private maskClearTextureBindGroupLayout: GPUBindGroupLayout | null = null
  private computeBindGroupLayout0: GPUBindGroupLayout | null = null
  private computeBindGroupLayout1: GPUBindGroupLayout | null = null

  // Feedback buffers
  private feedbackBuffers: Map<string, FeedbackBuffer> = new Map()
  private static readonly MAX_FEEDBACK_BUFFERS = 32
  private static readonly FEEDBACK_SIZE = 256
  static readonly MAX_FIELD_EFFECTS = 128

  constructor(gridSize: number = DEFAULT_GRID_SIZE) {
    this.gridSize = gridSize
  }

  async init(canvas: HTMLCanvasElement): Promise<boolean> {
    if (!navigator.gpu) {
      console.error('WebGPU not supported')
      return false
    }

    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) {
      console.error('No WebGPU adapter found')
      return false
    }

    this.hasFloat32Filterable = adapter.features.has('float32-filterable')
    const features: GPUFeatureName[] = []
    if (this.hasFloat32Filterable) {
      features.push('float32-filterable')
    }
    const device = await adapter.requestDevice({
      requiredFeatures: features,
    })
    this.device = device

    const ctx = canvas.getContext('webgpu')
    if (!ctx) {
      console.error('Failed to get webgpu context')
      return false
    }
    this.context = ctx
    this.canvasFormat = navigator.gpu.getPreferredCanvasFormat()

    ctx.configure({
      device,
      format: this.canvasFormat,
      alphaMode: 'opaque',
    })

    // Create bind group layouts
    this.createBindGroupLayouts()

    // Create shared resources
    this.sampler = device.createSampler({
      magFilter: 'nearest',
      minFilter: 'nearest',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })

    this.frameUniformBuf = device.createBuffer({
      size: 32, // 8 floats: camera(2) + resolution(2) + zoom(1) + time(1) + gridSize(1) + pad(1)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    this.effectUniformBuf = device.createBuffer({
      size: 112, // 28 floats: bounds(4) + params(4) + transform(4) + fieldAColor(4) + fieldBColor(4) + fieldATransform(4) + fieldBTransform(4)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    this.stateUniformBuf = device.createBuffer({
      size: 16, // 4 floats: gridSize, time, dt, pad
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    // Compile vertex module (shared across all render pipelines)
    this.vertexModule = device.createShaderModule({ code: vertexShaderSource })

    // Create textures
    this.colorTex = this.createDataTexture()
    this.stateTex = this.createDataTexture()
    this.stateTex2 = this.createDataTexture()
    this.selectionTex = this.createDataTexture()
    this.effectTex = this.createDataTexture()
    this.presenceTex = this.createDataTexture()

    // Presence staging buffers (double-buffered for async readback)
    const presenceBufSize = this.gridSize * this.gridSize * 4 * 4 // RGBA32F
    // Align row to 256 bytes for copyTextureToBuffer
    const bytesPerRow = Math.ceil(this.gridSize * 16 / 256) * 256
    const totalBufSize = bytesPerRow * this.gridSize
    this.presenceStagingBuf = device.createBuffer({
      size: totalBufSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    })
    this.presenceStagingBuf2 = device.createBuffer({
      size: totalBufSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    })

    // Build base pipeline
    const baseFragModule = device.createShaderModule({ code: buildBaseFragmentShader() })
    this.basePipeline = await this.createRenderPipeline(baseFragModule, this.baseTextureBindGroupLayout!, undefined)

    // Build mask clear pipeline
    const maskClearFragModule = device.createShaderModule({ code: buildMaskClearShader() })
    this.maskClearPipeline = await this.createMaskClearPipeline(maskClearFragModule)

    if (!this.hasFloat32Filterable) {
      console.warn('WebGPU: float32-filterable not available — textureSample on float textures may fail. Consider using a GPU that supports this feature.')
    }
    console.log('WebGPU renderer initialized')
    return true
  }

  private createBindGroupLayouts(): void {
    const device = this.device!
    // When float32-filterable is available, textureSample works with float textures
    const texSampleType: GPUTextureSampleType = this.hasFloat32Filterable ? 'float' : 'unfilterable-float'
    const samplerType: GPUSamplerBindingType = this.hasFloat32Filterable ? 'filtering' : 'non-filtering'

    // Group 0: per-frame uniforms
    this.frameBindGroupLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }],
    })

    // Group 1 for base pass: colorTex, stateTex, selectionTex, effectTex, sampler
    this.baseTextureBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: texSampleType } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: texSampleType } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: texSampleType } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: texSampleType } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: samplerType } },
      ],
    })

    // Group 1 for effect pass: colorTex, stateTex, fieldMask, feedbackTex, sampler
    this.effectTextureBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: texSampleType } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: texSampleType } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: texSampleType } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: texSampleType } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: samplerType } },
      ],
    })

    // Group 2: per-effect uniforms
    this.effectUniformBindGroupLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    })

    // Mask clear: group 1 with fieldMask + sampler
    this.maskClearTextureBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: texSampleType } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: samplerType } },
      ],
    })

    // Compute bind group layout 0: state uniforms
    this.computeBindGroupLayout0 = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }],
    })

    // Compute bind group layout 1: stateTex, colorTex, outputTex
    this.computeBindGroupLayout1 = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba32float' } },
      ],
    })
  }

  private createDataTexture(): GPUTexture {
    return this.device!.createTexture({
      size: [this.gridSize, this.gridSize],
      format: 'rgba32float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.STORAGE_BINDING,
    })
  }

  private createFeedbackTexture(): GPUTexture {
    return this.device!.createTexture({
      size: [FieldRenderer.FEEDBACK_SIZE, FieldRenderer.FEEDBACK_SIZE],
      format: 'rgba32float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    })
  }

  private async createRenderPipeline(
    fragModule: GPUShaderModule,
    textureBindGroupLayout: GPUBindGroupLayout,
    blend: GPUBlendState | undefined,
    extraGroupLayouts?: GPUBindGroupLayout[],
  ): Promise<GPURenderPipeline> {
    const layouts = [this.frameBindGroupLayout!, textureBindGroupLayout]
    if (extraGroupLayouts) layouts.push(...extraGroupLayouts)

    const layout = this.device!.createPipelineLayout({ bindGroupLayouts: layouts })

    return this.device!.createRenderPipelineAsync({
      layout,
      vertex: { module: this.vertexModule!, entryPoint: 'main' },
      fragment: {
        module: fragModule,
        entryPoint: 'main',
        targets: [{
          format: this.canvasFormat,
          blend,
        }],
      },
      primitive: { topology: 'triangle-list' },
    })
  }

  private async createPresenceRenderPipeline(
    fragModule: GPUShaderModule,
    textureBindGroupLayout: GPUBindGroupLayout,
    blend: GPUBlendState | undefined,
    extraGroupLayouts?: GPUBindGroupLayout[],
  ): Promise<GPURenderPipeline> {
    const layouts = [this.frameBindGroupLayout!, textureBindGroupLayout]
    if (extraGroupLayouts) layouts.push(...extraGroupLayouts)

    const layout = this.device!.createPipelineLayout({ bindGroupLayouts: layouts })

    return this.device!.createRenderPipelineAsync({
      layout,
      vertex: { module: this.vertexModule!, entryPoint: 'main' },
      fragment: {
        module: fragModule,
        entryPoint: 'main',
        targets: [{
          format: 'rgba32float',
          blend: blend ? {
            color: blend.color,
            alpha: blend.alpha,
          } : undefined,
        }],
      },
      primitive: { topology: 'triangle-list' },
    })
  }

  private async createMaskClearPipeline(fragModule: GPUShaderModule): Promise<GPURenderPipeline> {
    const layout = this.device!.createPipelineLayout({
      bindGroupLayouts: [this.frameBindGroupLayout!, this.maskClearTextureBindGroupLayout!],
    })

    return this.device!.createRenderPipelineAsync({
      layout,
      vertex: { module: this.vertexModule!, entryPoint: 'main' },
      fragment: {
        module: fragModule,
        entryPoint: 'main',
        targets: [{ format: this.canvasFormat }],
      },
      primitive: { topology: 'triangle-list' },
    })
  }

  /** FNV-1a hash of source string */
  private hashSource(source: string): string {
    let hash = 0x811c9dc5 | 0
    for (let i = 0; i < source.length; i++) {
      hash ^= source.charCodeAt(i)
      hash = Math.imul(hash, 0x01000193)
    }
    return (hash >>> 0).toString(36)
  }

  private writeFrameUniforms(camera: { x: number; y: number }, resolution: [number, number], zoom: number, time: number): void {
    const data = new Float32Array([camera.x, camera.y, resolution[0], resolution[1], zoom, time, this.gridSize, 0])
    this.device!.queue.writeBuffer(this.frameUniformBuf!, 0, data)
  }

  private writeEffectUniforms(
    bounds: [number, number, number, number],
    params: [number, number, number, number],
    transform: [number, number, number, number],
    fieldAColor?: [number, number, number, number],
    fieldBColor?: [number, number, number, number],
    fieldATransform?: [number, number, number, number],
    fieldBTransform?: [number, number, number, number],
  ): void {
    const ac = fieldAColor || [0, 0, 0, 0]
    const bc = fieldBColor || [0, 0, 0, 0]
    const at = fieldATransform || [0, 0, 0, 0]
    const bt = fieldBTransform || [0, 0, 0, 0]
    const data = new Float32Array([...bounds, ...params, ...transform, ...ac, ...bc, ...at, ...bt])
    this.device!.queue.writeBuffer(this.effectUniformBuf!, 0, data)
  }

  private getFrameBindGroup(): GPUBindGroup {
    return this.device!.createBindGroup({
      layout: this.frameBindGroupLayout!,
      entries: [{ binding: 0, resource: { buffer: this.frameUniformBuf! } }],
    })
  }

  private getBaseTextureBindGroup(): GPUBindGroup {
    return this.device!.createBindGroup({
      layout: this.baseTextureBindGroupLayout!,
      entries: [
        { binding: 0, resource: this.colorTex!.createView() },
        { binding: 1, resource: this.getCurrentStateTex().createView() },
        { binding: 2, resource: this.selectionTex!.createView() },
        { binding: 3, resource: this.effectTex!.createView() },
        { binding: 4, resource: this.sampler! },
      ],
    })
  }

  private getEffectTextureBindGroup(fieldId: string, feedbackTex?: GPUTexture): GPUBindGroup {
    const maskTex = this.fieldMaskTextures.get(fieldId) || this.createEmptyMaskTexture(fieldId)
    return this.device!.createBindGroup({
      layout: this.effectTextureBindGroupLayout!,
      entries: [
        { binding: 0, resource: this.colorTex!.createView() },
        { binding: 1, resource: this.getCurrentStateTex().createView() },
        { binding: 2, resource: maskTex.createView() },
        { binding: 3, resource: (feedbackTex || this.colorTex!).createView() },
        { binding: 4, resource: this.sampler! },
      ],
    })
  }

  private getEffectUniformBindGroup(): GPUBindGroup {
    return this.device!.createBindGroup({
      layout: this.effectUniformBindGroupLayout!,
      entries: [{ binding: 0, resource: { buffer: this.effectUniformBuf! } }],
    })
  }

  private createEmptyMaskTexture(fieldId: string): GPUTexture {
    const tex = this.createDataTexture()
    // Already zeroed — GPUTexture initial contents are 0
    this.fieldMaskTextures.set(fieldId, tex)
    return tex
  }

  // --- Public texture upload methods ---

  uploadColorData(data: Float32Array): void {
    if (!this.device || !this.colorTex) return
    this.device.queue.writeTexture(
      { texture: this.colorTex },
      data.buffer as ArrayBuffer,
      { bytesPerRow: this.gridSize * 16 },
      [this.gridSize, this.gridSize],
    )
  }

  uploadStateData(data: Float32Array): void {
    if (!this.device) return
    const tex = this.stateTexCurrent === 0 ? this.stateTex : this.stateTex2
    if (!tex) return
    this.device.queue.writeTexture(
      { texture: tex },
      data.buffer as ArrayBuffer,
      { bytesPerRow: this.gridSize * 16 },
      [this.gridSize, this.gridSize],
    )
  }

  uploadEffectData(data: Float32Array): void {
    if (!this.device || !this.effectTex) return
    this.device.queue.writeTexture(
      { texture: this.effectTex },
      data.buffer as ArrayBuffer,
      { bytesPerRow: this.gridSize * 16 },
      [this.gridSize, this.gridSize],
    )
  }

  uploadSelectionData(data: Uint8Array): void {
    if (!this.device || !this.selectionTex) return
    // Selection data is single-channel uint8 — expand to rgba32float
    const expanded = new Float32Array(this.gridSize * this.gridSize * 4)
    for (let i = 0; i < data.length; i++) {
      expanded[i * 4] = data[i] > 0 ? 1.0 : 0.0
    }
    this.device.queue.writeTexture(
      { texture: this.selectionTex },
      expanded.buffer as ArrayBuffer,
      { bytesPerRow: this.gridSize * 16 },
      [this.gridSize, this.gridSize],
    )
  }

  uploadFieldMask(fieldId: string, data: Uint8Array): void {
    if (!this.device) return
    let maskTex = this.fieldMaskTextures.get(fieldId)
    if (!maskTex) {
      maskTex = this.createEmptyMaskTexture(fieldId)
    }
    // Expand to rgba32float (mask in red channel)
    const expanded = new Float32Array(this.gridSize * this.gridSize * 4)
    for (let i = 0; i < data.length; i++) {
      expanded[i * 4] = data[i] > 0 ? 1.0 : 0.0
    }
    this.device.queue.writeTexture(
      { texture: maskTex },
      expanded.buffer as ArrayBuffer,
      { bytesPerRow: this.gridSize * 16 },
      [this.gridSize, this.gridSize],
    )
  }

  // --- Effect pipeline compilation ---

  async compileFieldEffect(programKey: string, fieldId: string, glsl: string, modCode?: string): Promise<{ success: boolean; error?: string }> {
    const device = this.device
    if (!device) return { success: false, error: 'No WebGPU device' }

    const fragSrc = buildEffectFragmentShader(glsl, modCode)
    const hash = this.hashSource(fragSrc)

    this.removeFieldEffect(programKey)

    let shared = this.sharedPipelines.get(hash)
    if (shared) {
      shared.refCount++
    } else {
      if (this.sharedPipelines.size >= FieldRenderer.MAX_FIELD_EFFECTS) {
        return { success: false, error: `Max ${FieldRenderer.MAX_FIELD_EFFECTS} unique field effects reached` }
      }

      try {
        const fragModule = device.createShaderModule({ code: fragSrc })

        // Check for compilation errors
        const info = await fragModule.getCompilationInfo()
        const errors = info.messages.filter(m => m.type === 'error')
        if (errors.length > 0) {
          return { success: false, error: errors.map(e => e.message).join('\n') }
        }

        const pipeline = await this.createRenderPipeline(
          fragModule,
          this.effectTextureBindGroupLayout!,
          blendState('alpha'),
          [this.effectUniformBindGroupLayout!],
        )

        shared = { pipeline, refCount: 1 }
        this.sharedPipelines.set(hash, shared)
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Pipeline creation failed' }
      }
    }

    if (!this.fieldMaskTextures.has(fieldId)) {
      this.createEmptyMaskTexture(fieldId)
    }

    this.fieldEntries.set(programKey, { wgslHash: hash })
    return { success: true }
  }

  removeFieldEffect(programKey: string): void {
    const entry = this.fieldEntries.get(programKey)
    if (!entry) return

    const shared = this.sharedPipelines.get(entry.wgslHash)
    if (shared) {
      shared.refCount--
      if (shared.refCount <= 0) {
        this.sharedPipelines.delete(entry.wgslHash)
      }
    }

    this.fieldEntries.delete(programKey)

    const fb = this.feedbackBuffers.get(programKey)
    if (fb) {
      fb.texA.destroy()
      fb.texB.destroy()
      this.feedbackBuffers.delete(programKey)
    }
  }

  removeAllFieldEffects(fieldId: string): void {
    const keysToRemove: string[] = []
    for (const key of this.fieldEntries.keys()) {
      if (key === fieldId || key.startsWith(fieldId + '_')) {
        keysToRemove.push(key)
      }
    }
    for (const key of keysToRemove) {
      this.removeFieldEffect(key)
    }
    const maskTex = this.fieldMaskTextures.get(fieldId)
    if (maskTex) {
      maskTex.destroy()
      this.fieldMaskTextures.delete(fieldId)
    }
  }

  getFieldEffectKeys(): IterableIterator<string> {
    return this.fieldEntries.keys()
  }

  removeFieldMask(fieldId: string): void {
    const tex = this.fieldMaskTextures.get(fieldId)
    if (tex) {
      tex.destroy()
      this.fieldMaskTextures.delete(fieldId)
    }
  }

  hasFieldEffect(programKey: string): boolean {
    return this.fieldEntries.has(programKey)
  }

  // --- Render ---

  render(
    camera: { x: number; y: number },
    zoom: number,
    time: number,
    fieldEffects?: FieldEffectData[],
  ): void {
    const device = this.device
    const ctx = this.context
    if (!device || !ctx || !this.basePipeline) return

    const canvas = ctx.canvas as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const displayW = canvas.clientWidth
    const displayH = canvas.clientHeight
    const bufferW = Math.round(displayW * dpr)
    const bufferH = Math.round(displayH * dpr)

    if (canvas.width !== bufferW || canvas.height !== bufferH) {
      canvas.width = bufferW
      canvas.height = bufferH
    }

    this.writeFrameUniforms(camera, [bufferW, bufferH], zoom, time)

    const encoder = device.createCommandEncoder()
    const textureView = ctx.getCurrentTexture().createView()

    // --- Pass 1: Base (opaque) ---
    {
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: textureView,
          clearValue: { r: 0.035, g: 0.045, b: 0.065, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        }],
      })

      pass.setPipeline(this.basePipeline)
      pass.setBindGroup(0, this.getFrameBindGroup())
      pass.setBindGroup(1, this.getBaseTextureBindGroup())
      pass.draw(6)
      pass.end()
    }

    // --- Pass 2..N: Effect passes ---
    if (fieldEffects && fieldEffects.length > 0) {
      for (const effect of fieldEffects) {
        const entry = this.fieldEntries.get(effect.programKey)
        if (!entry) continue
        const shared = this.sharedPipelines.get(entry.wgslHash)
        if (!shared) continue

        // Precedence pass
        if (effect.precedence && this.maskClearPipeline) {
          const maskTex = this.fieldMaskTextures.get(effect.fieldId)
          if (maskTex) {
            const mcPass = encoder.beginRenderPass({
              colorAttachments: [{
                view: textureView,
                loadOp: 'load',
                storeOp: 'store',
              }],
            })
            mcPass.setPipeline(this.maskClearPipeline)
            mcPass.setBindGroup(0, this.getFrameBindGroup())
            mcPass.setBindGroup(1, device.createBindGroup({
              layout: this.maskClearTextureBindGroupLayout!,
              entries: [
                { binding: 0, resource: maskTex.createView() },
                { binding: 1, resource: this.sampler! },
              ],
            }))
            mcPass.draw(6)
            mcPass.end()
          }
        }

        this.writeEffectUniforms(
          effect.bounds, effect.params, effect.transform,
          effect.fieldAColor, effect.fieldBColor,
          effect.fieldATransform, effect.fieldBTransform,
        )

        const pass = encoder.beginRenderPass({
          colorAttachments: [{
            view: textureView,
            loadOp: 'load',
            storeOp: 'store',
          }],
        })

        pass.setPipeline(shared.pipeline)
        pass.setBindGroup(0, this.getFrameBindGroup())
        pass.setBindGroup(1, this.getEffectTextureBindGroup(effect.fieldId))
        pass.setBindGroup(2, this.getEffectUniformBindGroup())
        pass.draw(6)
        pass.end()
      }
    }

    device.queue.submit([encoder.finish()])
  }

  /** Effects-only render — used for spatial canvas decoration */
  renderEffectsOnly(
    camera: { x: number; y: number },
    zoom: number,
    time: number,
    fieldEffects: FieldEffectData[],
    clearColor: [number, number, number, number] = [0.008, 0.024, 0.09, 1.0],
  ): void {
    const device = this.device
    const ctx = this.context
    if (!device || !ctx) return

    const canvas = ctx.canvas as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const displayW = canvas.clientWidth
    const displayH = canvas.clientHeight
    const bufferW = Math.round(displayW * dpr)
    const bufferH = Math.round(displayH * dpr)

    if (canvas.width !== bufferW || canvas.height !== bufferH) {
      canvas.width = bufferW
      canvas.height = bufferH
    }

    this.writeFrameUniforms(camera, [bufferW, bufferH], zoom, time)

    const encoder = device.createCommandEncoder()
    const textureView = ctx.getCurrentTexture().createView()

    // Clear pass
    {
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: textureView,
          clearValue: { r: clearColor[0], g: clearColor[1], b: clearColor[2], a: clearColor[3] },
          loadOp: 'clear',
          storeOp: 'store',
        }],
      })
      pass.end()
    }

    if (fieldEffects.length > 0) {
      for (const effect of fieldEffects) {
        const entry = this.fieldEntries.get(effect.programKey)
        if (!entry) continue
        const shared = this.sharedPipelines.get(entry.wgslHash)
        if (!shared) continue

        this.writeEffectUniforms(
          effect.bounds, effect.params, effect.transform,
          effect.fieldAColor, effect.fieldBColor,
          effect.fieldATransform, effect.fieldBTransform,
        )

        const pass = encoder.beginRenderPass({
          colorAttachments: [{
            view: textureView,
            loadOp: 'load',
            storeOp: 'store',
          }],
        })

        pass.setPipeline(shared.pipeline)
        pass.setBindGroup(0, this.getFrameBindGroup())
        pass.setBindGroup(1, this.getEffectTextureBindGroup(effect.fieldId))
        pass.setBindGroup(2, this.getEffectUniformBindGroup())
        pass.draw(6)
        pass.end()
      }
    }

    device.queue.submit([encoder.finish()])
  }

  /** Sample rendered pixels in a region — async version using buffer readback */
  async sampleRenderedRegion(
    camera: { x: number; y: number },
    zoom: number,
    gridX: number, gridY: number,
    gridW: number, gridH: number,
    sampleSize: number = 16,
  ): Promise<{ width: number; height: number; pixels: number[] } | null> {
    const device = this.device
    const ctx = this.context
    if (!device || !ctx) return null
    const canvas = ctx.canvas as HTMLCanvasElement

    const bufferW = canvas.width
    const bufferH = canvas.height
    const aspect = bufferW / bufferH

    const gridRange = this.gridSize / zoom
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

    const x0 = Math.max(0, Math.floor(screenX))
    const y0 = Math.max(0, Math.floor(screenY))
    const x1 = Math.min(bufferW, Math.ceil(screenX + screenW))
    const y1 = Math.min(bufferH, Math.ceil(screenY + screenH))
    const pw = x1 - x0
    const ph = y1 - y0
    if (pw <= 0 || ph <= 0) return null

    // Copy region from current texture to buffer
    const canvasTex = ctx.getCurrentTexture()
    const bytesPerRow = Math.ceil(pw * 4 / 256) * 256
    const buf = device.createBuffer({
      size: bytesPerRow * ph,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    })

    const encoder = device.createCommandEncoder()
    encoder.copyTextureToBuffer(
      { texture: canvasTex, origin: [x0, y0, 0] },
      { buffer: buf, bytesPerRow, rowsPerImage: ph },
      [pw, ph],
    )
    device.queue.submit([encoder.finish()])

    await buf.mapAsync(GPUMapMode.READ)
    const raw = new Uint8Array(buf.getMappedRange())

    const outW = Math.min(sampleSize, pw)
    const outH = Math.min(sampleSize, ph)
    const pixels: number[] = []
    for (let sy = 0; sy < outH; sy++) {
      for (let sx = 0; sx < outW; sx++) {
        const srcX = Math.floor((sx / outW) * pw)
        const srcY = Math.floor((sy / outH) * ph)
        const rowStart = srcY * bytesPerRow
        const idx = rowStart + srcX * 4
        // BGRA → RGBA
        pixels.push(raw[idx + 2] / 255, raw[idx + 1] / 255, raw[idx] / 255, raw[idx + 3] / 255)
      }
    }
    buf.unmap()
    buf.destroy()

    return { width: outW, height: outH, pixels }
  }

  // --- State update compute ---

  async compileStateUpdate(glsl: string, modCode?: string): Promise<{ success: boolean; error?: string }> {
    return this.compileCompositeStateUpdate([{ id: 'single', glsl }], modCode)
  }

  async compileCompositeStateUpdate(fields: { id: string; glsl: string }[], modCode?: string): Promise<{ success: boolean; error?: string }> {
    const device = this.device
    if (!device) return { success: false, error: 'No WebGPU device' }
    if (fields.length === 0) {
      this.removeStateUpdate()
      return { success: true }
    }

    const computeSrc = buildCompositeStateComputeShader(fields, modCode)

    try {
      const module = device.createShaderModule({ code: computeSrc })
      const info = await module.getCompilationInfo()
      const errors = info.messages.filter(m => m.type === 'error')
      if (errors.length > 0) {
        return { success: false, error: errors.map(e => e.message).join('\n') }
      }

      const pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [this.computeBindGroupLayout0!, this.computeBindGroupLayout1!],
      })

      const pipeline = await device.createComputePipelineAsync({
        layout: pipelineLayout,
        compute: { module, entryPoint: 'main' },
      })

      this.stateUpdatePipeline = pipeline
      this.stateUpdateActive = true
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Compute pipeline creation failed' }
    }
  }

  removeStateUpdate(): void {
    this.stateUpdatePipeline = null
    this.stateUpdateActive = false
  }

  runStateUpdate(time: number, dt: number): void {
    const device = this.device
    if (!device || !this.stateUpdateActive || !this.stateUpdatePipeline) return

    const srcTex = this.stateTexCurrent === 0 ? this.stateTex! : this.stateTex2!
    const dstTex = this.stateTexCurrent === 0 ? this.stateTex2! : this.stateTex!

    device.queue.writeBuffer(this.stateUniformBuf!, 0, new Float32Array([this.gridSize, time, dt, 0]))

    const bindGroup0 = device.createBindGroup({
      layout: this.computeBindGroupLayout0!,
      entries: [{ binding: 0, resource: { buffer: this.stateUniformBuf! } }],
    })

    const bindGroup1 = device.createBindGroup({
      layout: this.computeBindGroupLayout1!,
      entries: [
        { binding: 0, resource: srcTex.createView() },
        { binding: 1, resource: this.colorTex!.createView() },
        { binding: 2, resource: dstTex.createView() },
      ],
    })

    const encoder = device.createCommandEncoder()
    const pass = encoder.beginComputePass()
    pass.setPipeline(this.stateUpdatePipeline)
    pass.setBindGroup(0, bindGroup0)
    pass.setBindGroup(1, bindGroup1)
    pass.dispatchWorkgroups(Math.ceil(this.gridSize / 16), Math.ceil(this.gridSize / 16))
    pass.end()

    device.queue.submit([encoder.finish()])
    this.stateTexCurrent = this.stateTexCurrent === 0 ? 1 : 0
  }

  getCurrentStateTex(): GPUTexture {
    return this.stateTexCurrent === 0 ? this.stateTex! : this.stateTex2!
  }

  /** Read GPU state back to CPU. Async — non-blocking. */
  async readbackState(target: Float32Array): Promise<void> {
    const device = this.device
    if (!device) return

    const currentTex = this.getCurrentStateTex()
    const bytesPerRow = Math.ceil(this.gridSize * 16 / 256) * 256
    const buf = device.createBuffer({
      size: bytesPerRow * this.gridSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    })

    const encoder = device.createCommandEncoder()
    encoder.copyTextureToBuffer(
      { texture: currentTex },
      { buffer: buf, bytesPerRow },
      [this.gridSize, this.gridSize],
    )
    device.queue.submit([encoder.finish()])

    await buf.mapAsync(GPUMapMode.READ)
    const mapped = new Float32Array(buf.getMappedRange())
    // Copy row by row (bytesPerRow may include padding)
    const rowFloats = this.gridSize * 4
    const rowBytes = bytesPerRow / 4
    for (let y = 0; y < this.gridSize; y++) {
      target.set(mapped.subarray(y * rowBytes, y * rowBytes + rowFloats), y * rowFloats)
    }
    buf.unmap()
    buf.destroy()
  }

  /** Render field effects to presence texture and initiate async readback.
   *  Call consumePresenceMaps() next frame to get results. */
  schedulePresenceReadback(
    time: number,
    fieldEffects: FieldEffectData[],
  ): void {
    const device = this.device
    if (!device || !this.presenceTex || this.presenceReadPending) return

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

    if (effectsByField.size === 0) return

    // For simplicity, render ALL field effects into the presence texture with identity camera
    this.writeFrameUniforms(
      { x: this.gridSize / 2, y: this.gridSize / 2 },
      [this.gridSize, this.gridSize],
      1.0,
      time,
    )

    const encoder = device.createCommandEncoder()

    // Clear presence texture
    {
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: this.presenceTex.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        }],
      })
      pass.end()
    }

    // Render effects
    for (const effect of fieldEffects) {
      const entry = this.fieldEntries.get(effect.programKey)
      if (!entry) continue
      const shared = this.sharedPipelines.get(entry.wgslHash)
      if (!shared) continue

      this.writeEffectUniforms(
        effect.bounds, effect.params, effect.transform,
        effect.fieldAColor, effect.fieldBColor,
        effect.fieldATransform, effect.fieldBTransform,
      )

      // Need a presence-format pipeline (rgba32float target)
      // For now, reuse the shared pipeline (it's configured for canvas format)
      // TODO: cache presence pipelines separately if format differs
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: this.presenceTex.createView(),
          loadOp: 'load',
          storeOp: 'store',
        }],
      })

      pass.setPipeline(shared.pipeline)
      pass.setBindGroup(0, this.getFrameBindGroup())
      pass.setBindGroup(1, this.getEffectTextureBindGroup(effect.fieldId))
      pass.setBindGroup(2, this.getEffectUniformBindGroup())
      pass.draw(6)
      pass.end()
    }

    // Copy presence texture to staging buffer
    const bytesPerRow = Math.ceil(this.gridSize * 16 / 256) * 256
    encoder.copyTextureToBuffer(
      { texture: this.presenceTex },
      { buffer: this.presenceStagingBuf!, bytesPerRow },
      [this.gridSize, this.gridSize],
    )

    device.queue.submit([encoder.finish()])

    // Start async map
    this.presenceReadPending = true
    this.presenceStagingBuf!.mapAsync(GPUMapMode.READ).then(() => {
      const mapped = new Float32Array(this.presenceStagingBuf!.getMappedRange())
      const rowFloats = bytesPerRow / 4
      const gs = this.gridSize

      // Build per-field presence from the combined render
      // Since all effects are rendered together, we get combined presence
      const presence = new Uint8Array(gs * gs)
      for (let y = 0; y < gs; y++) {
        const srcRow = y * rowFloats
        const dstRow = y * gs
        for (let x = 0; x < gs; x++) {
          const alpha = mapped[srcRow + x * 4 + 3]
          if (alpha > 0.02) {
            presence[dstRow + x] = 255
          }
        }
      }

      // Group presence by field using effect bounds
      const result = new Map<string, Uint8Array>()
      for (const [fieldId] of effectsByField) {
        result.set(fieldId, presence)
      }

      this.presenceLastResult = result
      this.presenceStagingBuf!.unmap()
      this.presenceReadPending = false
    }).catch(() => {
      this.presenceReadPending = false
    })
  }

  /** Consume the results from the previous frame's presence readback */
  consumePresenceMaps(): Map<string, Uint8Array> {
    const result = this.presenceLastResult
    this.presenceLastResult = new Map()
    return result
  }

  /** Synchronous presence map render — renders each field individually.
   *  Fallback for when async pipeline isn't set up yet. */
  renderFieldPresenceMaps(
    time: number,
    fieldEffects: FieldEffectData[],
  ): Map<string, Uint8Array> {
    // Use the last async result if available
    if (this.presenceLastResult.size > 0) {
      return this.consumePresenceMaps()
    }

    // Schedule for next frame
    this.schedulePresenceReadback(time, fieldEffects)
    return new Map()
  }

  /** Render a single-pixel presence check */
  pickFieldAtPixel(field: { id: string; effects: { id: string }[]; transform: { x: number; y: number; rotation: number; scale: number }; color: [number, number, number, number] }, gx: number, gy: number): boolean {
    // For WebGPU, we use the last presence map result instead of per-pixel GPU pick
    const presence = this.presenceLastResult.get(field.id)
    if (!presence) return false
    if (gx < 0 || gx >= this.gridSize || gy < 0 || gy >= this.gridSize) return false
    return presence[gy * this.gridSize + gx] > 0
  }

  hasStateUpdate(): boolean {
    return this.stateUpdateActive
  }

  /** Render presence map into target buffer (legacy sync API wrapper) */
  renderPresenceMap(
    camera: { x: number; y: number },
    zoom: number,
    time: number,
    fieldEffects: FieldEffectData[],
    target: Float32Array,
  ): void {
    // Schedule async readback — results available next frame
    this.schedulePresenceReadback(time, fieldEffects)
  }

  destroy(): void {
    this.sharedPipelines.clear()
    this.fieldEntries.clear()

    for (const tex of this.fieldMaskTextures.values()) {
      tex.destroy()
    }
    this.fieldMaskTextures.clear()

    for (const fb of this.feedbackBuffers.values()) {
      fb.texA.destroy()
      fb.texB.destroy()
    }
    this.feedbackBuffers.clear()

    this.colorTex?.destroy()
    this.stateTex?.destroy()
    this.stateTex2?.destroy()
    this.selectionTex?.destroy()
    this.effectTex?.destroy()
    this.presenceTex?.destroy()
    this.presenceStagingBuf?.destroy()
    this.presenceStagingBuf2?.destroy()
    this.frameUniformBuf?.destroy()
    this.effectUniformBuf?.destroy()
    this.stateUniformBuf?.destroy()

    this.device = null
    this.context = null
    this.basePipeline = null
    this.maskClearPipeline = null
    this.stateUpdatePipeline = null
    this.colorTex = null
    this.stateTex = null
    this.stateTex2 = null
    this.selectionTex = null
    this.effectTex = null
    this.presenceTex = null
  }
}
