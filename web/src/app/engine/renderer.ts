// Field Engine v4 — WebGPU Renderer (Multi-pass, multi-effect)

import { DEFAULT_GRID_SIZE } from './types'
import {
  vertexShaderSource,
  buildBaseFragmentShader,
  buildEffectFragmentShader,
  buildEffectComputeShader,
  buildAccumClearComputeShader,
  buildBlitFragmentShader,
  buildMaskClearShader,
  buildStateUpdateComputeShader,
  buildCompositeStateComputeShader,
  buildSuperimposedComputeShader,
  buildPropagationComputeShader,
  VisualTypeEntry,
  InteractionEntry,
} from './shaders'
import type { SuperFieldGPU } from './types'

type BlendMode = 'alpha' | 'additive' | 'multiply' | 'screen' | 'softlight' | 'opaque'

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
    case 'opaque':
      return { color: { srcFactor: 'one', dstFactor: 'zero', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'zero', operation: 'add' } }
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

  // Presence map (async readback — per-field rendering)
  private presenceTex: GPUTexture | null = null
  private presenceStagingBuf: GPUBuffer | null = null
  private presenceStagingBufCapacity: number = 0
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

  /** Render resolution scale (0.25–2.0). Lower = fewer pixels = faster. Default 1.0. */
  renderScale: number = 1.0

  // ─── Compute effect pipeline ───
  /** Whether compute effects are available and enabled */
  useComputeEffects: boolean = true
  private accumBuf: GPUBuffer | null = null
  private accumBufPixelCount: number = 0
  private accumBufStride: number = 0
  private clearComputePipeline: GPUComputePipeline | null = null
  private blitPipeline: GPURenderPipeline | null = null
  private dispatchUniformBuf: GPUBuffer | null = null
  private computeDispatchLayout: GPUBindGroupLayout | null = null
  private clearComputeLayout: GPUBindGroupLayout | null = null
  private blitStorageLayout: GPUBindGroupLayout | null = null
  private sharedComputePipelines: Map<string, { pipeline: GPUComputePipeline; refCount: number }> = new Map()
  private fieldComputeEntries: Map<string, { wgslHash: string }> = new Map()

  // Staging buffers for per-effect uniforms (fixes writeBuffer ordering)
  private effectUniformStagingBuf: GPUBuffer | null = null
  private dispatchStagingBuf: GPUBuffer | null = null
  private static readonly EFFECT_UNIFORM_SIZE = 112 // 28 floats
  private static readonly DISPATCH_UNIFORM_SIZE = 16 // 4 floats

  // ─── Superimposed rendering ───
  private superFieldBuffer: GPUBuffer | null = null
  private superFieldBufferCapacity: number = 0
  private superPipeline: GPUComputePipeline | null = null
  private superBindGroupLayout: GPUBindGroupLayout | null = null
  private superPipelineReady: boolean = false
  private superCompilationId: number = 0  // Bumped only by registerVisualType/registerInteraction
  private superCompiling: boolean = false  // Prevents re-entrant compilation
  static readonly SUPER_FIELD_STRIDE = 80 // 5 vec4f = 20 floats = 80 bytes per field
  static readonly SUPER_MAX_FIELDS = 128

  // ─── Interaction propagation ───
  private ixBuf: GPUBuffer | null = null
  private ixBufPixelCount: number = 0
  private propagationPipeline: GPUComputePipeline | null = null
  private propagationBindGroupLayout: GPUBindGroupLayout | null = null
  private superLayoutHasIxBuf: boolean = false

  // ─── Pixel-perfect hit testing ───
  private hitIdBuffer: GPUBuffer | null = null
  private hitIdStagingBuffer: GPUBuffer | null = null
  private hitIdPixelCount: number = 0
  private hitIdReadbackPending: boolean = false
  /** Latest readback: per-pixel field index (0xFFFFFFFF = no field) */
  hitMap: Uint32Array | null = null
  hitMapWidth: number = 0
  hitMapHeight: number = 0

  // Visual type registry (dynamic visual types)
  private visualTypeRegistry: Map<string, VisualTypeEntry> = new Map()
  private nextVisualTypeId: number = 0  // All visual types are runtime-defined

  // Interaction registry (a + b = c effects at overlap pixels)
  private interactionRegistry: Map<string, InteractionEntry> = new Map()
  private nextInteractionId: number = 0
  private interactionBuffer: GPUBuffer | null = null
  private interactionBufferCapacity: number = 0
  static readonly INTERACTION_STRIDE = 16 // 4 u32 per interaction
  private _ixLogDone = false
  private _propLogDone = false

  constructor(gridSize: number = DEFAULT_GRID_SIZE) {
    this.gridSize = gridSize
  }

  setRenderScale(scale: number): void {
    this.renderScale = Math.max(0.25, Math.min(2.0, scale))
  }

  /** Convert grid-space bounds to pixel-perfect screen-space scissor rect [x, y, w, h].
   *  Grid→UV→pixel: X is direct, Y is flipped (UV y=0 at screen bottom, pixel y=0 at screen top). */
  private gridBoundsToScissor(
    bounds: [number, number, number, number],
    camera: { x: number; y: number },
    zoom: number,
    bufferW: number,
    bufferH: number,
  ): [number, number, number, number] {
    const aspect = bufferW / bufferH
    const gridRange = this.gridSize / zoom
    const [gMinX, gMinY, gMaxX, gMaxY] = bounds

    // Formula: pixelCoord = ((gridCoord - camera) / visibleRange + 0.5) * bufferSize
    // This works for both X and Y because the UV→pixel Y flip cancels the grid→UV Y flip.
    let sMinX: number, sMinY: number, sMaxX: number, sMaxY: number
    if (aspect > 1) {
      const rangeX = gridRange * aspect
      sMinX = ((gMinX - camera.x) / rangeX + 0.5) * bufferW
      sMaxX = ((gMaxX - camera.x) / rangeX + 0.5) * bufferW
      sMinY = ((gMinY - camera.y) / gridRange + 0.5) * bufferH
      sMaxY = ((gMaxY - camera.y) / gridRange + 0.5) * bufferH
    } else {
      const rangeY = gridRange / aspect
      sMinX = ((gMinX - camera.x) / gridRange + 0.5) * bufferW
      sMaxX = ((gMaxX - camera.x) / gridRange + 0.5) * bufferW
      sMinY = ((gMinY - camera.y) / rangeY + 0.5) * bufferH
      sMaxY = ((gMaxY - camera.y) / rangeY + 0.5) * bufferH
    }

    const x = Math.max(0, Math.floor(sMinX))
    const y = Math.max(0, Math.floor(sMinY))
    const w = Math.min(bufferW, Math.ceil(sMaxX)) - x
    const h = Math.min(bufferH, Math.ceil(sMaxY)) - y
    return [x, y, Math.max(1, w), Math.max(1, h)]
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

    // Presence staging buffer — created dynamically in schedulePresenceReadback
    // sized to numFields * bytesPerRow * gridSize for per-field rendering

    // Build base pipeline
    const baseFragModule = device.createShaderModule({ code: buildBaseFragmentShader() })
    this.basePipeline = await this.createRenderPipeline(baseFragModule, this.baseTextureBindGroupLayout!, undefined)

    // Build mask clear pipeline
    const maskClearFragModule = device.createShaderModule({ code: buildMaskClearShader() })
    this.maskClearPipeline = await this.createMaskClearPipeline(maskClearFragModule)

    // ─── Staging buffers for per-effect uniforms ───
    // Each effect needs its own uniform slice; we write all to staging, then copyBufferToBuffer per pass.
    this.effectUniformStagingBuf = device.createBuffer({
      size: FieldRenderer.EFFECT_UNIFORM_SIZE * FieldRenderer.MAX_FIELD_EFFECTS,
      usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    })
    this.dispatchStagingBuf = device.createBuffer({
      size: FieldRenderer.DISPATCH_UNIFORM_SIZE * FieldRenderer.MAX_FIELD_EFFECTS,
      usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    })

    // ─── Compute effect pipeline resources ───
    this.dispatchUniformBuf = device.createBuffer({
      size: 16, // 4 floats: offsetX, offsetY, sizeX, sizeY
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    // Clear compute pipeline
    {
      const clearModule = device.createShaderModule({ code: buildAccumClearComputeShader() })
      this.clearComputePipeline = await device.createComputePipelineAsync({
        layout: device.createPipelineLayout({ bindGroupLayouts: [this.clearComputeLayout!] }),
        compute: { module: clearModule, entryPoint: 'main' },
      })
    }

    // Propagation compute pipeline (spreads interaction results beyond overlap zone)
    {
      const propModule = device.createShaderModule({ code: buildPropagationComputeShader() })
      this.propagationPipeline = await device.createComputePipelineAsync({
        layout: device.createPipelineLayout({
          bindGroupLayouts: [this.frameBindGroupLayout!, this.propagationBindGroupLayout!],
        }),
        compute: { module: propModule, entryPoint: 'main' },
      })
    }

    // Blit pipeline (reads from storage buffer, alpha-blends onto screen)
    {
      const blitModule = device.createShaderModule({ code: buildBlitFragmentShader() })
      const blitLayout = device.createPipelineLayout({
        bindGroupLayouts: [this.frameBindGroupLayout!, this.blitStorageLayout!],
      })
      this.blitPipeline = await device.createRenderPipelineAsync({
        layout: blitLayout,
        vertex: { module: this.vertexModule!, entryPoint: 'main' },
        fragment: {
          module: blitModule,
          entryPoint: 'main',
          targets: [{
            format: this.canvasFormat,
            blend: blendState('alpha'),
          }],
        },
        primitive: { topology: 'triangle-list' },
      })
    }

    if (!this.hasFloat32Filterable) {
      console.warn('WebGPU: float32-filterable not available — textureSample on float textures may fail. Consider using a GPU that supports this feature.')
    }
    console.log('WebGPU renderer initialized (compute effects: enabled)')
    return true
  }

  /** Ensure the accumulation buffer matches the current canvas pixel dimensions */
  private ensureAccumBuf(width: number, height: number): void {
    const device = this.device!
    const pixelCount = width * height
    if (this.accumBuf && this.accumBufPixelCount === pixelCount && this.accumBufStride === width) return

    this.accumBuf?.destroy()
    this.accumBuf = device.createBuffer({
      size: pixelCount * 16, // vec4f = 16 bytes per pixel
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })
    this.accumBufPixelCount = pixelCount
    this.accumBufStride = width
  }

  /** Ensure the interaction result buffer matches the current canvas pixel dimensions */
  private ensureIxBuf(width: number, height: number): void {
    const device = this.device!
    const pixelCount = width * height
    if (this.ixBuf && this.ixBufPixelCount === pixelCount) return

    this.ixBuf?.destroy()
    this.ixBuf = device.createBuffer({
      size: pixelCount * 16, // vec4f = 16 bytes per pixel
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })
    this.ixBufPixelCount = pixelCount
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
    // FRAGMENT | COMPUTE so the same bind group works for both render and compute pipelines
    this.effectTextureBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE, texture: { sampleType: texSampleType } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE, texture: { sampleType: texSampleType } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE, texture: { sampleType: texSampleType } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE, texture: { sampleType: texSampleType } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE, sampler: { type: samplerType } },
      ],
    })

    // Group 2: per-effect uniforms (FRAGMENT | COMPUTE)
    this.effectUniformBindGroupLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }],
    })

    // ─── Compute effect pipeline layouts ───

    // Group 3 for compute effects: dispatch region uniform + accumulation storage buffer
    this.computeDispatchLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })

    // Group 0 for accum clear compute: storage buffer
    this.clearComputeLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })

    // Group 1 for blit: read-only storage buffer
    this.blitStorageLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
      ],
    })

    // Mask clear: group 1 with fieldMask + sampler
    this.maskClearTextureBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: texSampleType } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: samplerType } },
      ],
    })

    // ─── Superimposed rendering bind group layout ───
    // Group 1: fields (read) + accum (rw) + hitId (rw) + interactions (read) + ixBuf (rw)
    this.superBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })

    this.superLayoutHasIxBuf = true

    // Propagation pass: ixBuf (read) + accumBuf (rw)
    this.propagationBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
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

  /** Write effect uniforms to the staging buffer at the given slot index.
   *  Use encoder.copyBufferToBuffer before each pass to transfer to effectUniformBuf. */
  private stageEffectUniforms(index: number, effect: FieldEffectData): void {
    const ac = effect.fieldAColor || [0, 0, 0, 0]
    const bc = effect.fieldBColor || [0, 0, 0, 0]
    const at = effect.fieldATransform || [0, 0, 0, 0]
    const bt = effect.fieldBTransform || [0, 0, 0, 0]
    const data = new Float32Array([...effect.bounds, ...effect.params, ...effect.transform, ...ac, ...bc, ...at, ...bt])
    this.device!.queue.writeBuffer(this.effectUniformStagingBuf!, index * FieldRenderer.EFFECT_UNIFORM_SIZE, data)
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

    // ─── Always compile render pipeline (used for presence maps + fallback) ───
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

    // ─── Also compile compute pipeline (for main render loop) ───
    if (this.useComputeEffects) {
      const computeSrc = buildEffectComputeShader(glsl, modCode)
      const computeHash = this.hashSource(computeSrc)

      let sharedCompute = this.sharedComputePipelines.get(computeHash)
      if (sharedCompute) {
        sharedCompute.refCount++
      } else {
        try {
          const computeModule = device.createShaderModule({ code: computeSrc })
          const info = await computeModule.getCompilationInfo()
          const errors = info.messages.filter(m => m.type === 'error')
          if (errors.length > 0) {
            console.warn(`[Compute] Shader compile failed for ${programKey}, using render fallback:`, errors[0].message)
          } else {
            const computePipelineLayout = device.createPipelineLayout({
              bindGroupLayouts: [
                this.frameBindGroupLayout!,
                this.effectTextureBindGroupLayout!,
                this.effectUniformBindGroupLayout!,
                this.computeDispatchLayout!,
              ],
            })
            const pipeline = await device.createComputePipelineAsync({
              layout: computePipelineLayout,
              compute: { module: computeModule, entryPoint: 'main' },
            })
            sharedCompute = { pipeline, refCount: 1 }
            this.sharedComputePipelines.set(computeHash, sharedCompute)
          }
        } catch (err) {
          console.warn(`[Compute] Pipeline creation failed for ${programKey}, using render fallback`)
        }
      }

      if (sharedCompute) {
        this.fieldComputeEntries.set(programKey, { wgslHash: sharedCompute ? computeHash : '' })
      }
    }

    return { success: true }
  }

  removeFieldEffect(programKey: string): void {
    const entry = this.fieldEntries.get(programKey)
    if (entry) {
      const shared = this.sharedPipelines.get(entry.wgslHash)
      if (shared) {
        shared.refCount--
        if (shared.refCount <= 0) {
          this.sharedPipelines.delete(entry.wgslHash)
        }
      }
      this.fieldEntries.delete(programKey)
    }

    // Also clean up compute pipeline entry
    const computeEntry = this.fieldComputeEntries.get(programKey)
    if (computeEntry) {
      const sharedCompute = this.sharedComputePipelines.get(computeEntry.wgslHash)
      if (sharedCompute) {
        sharedCompute.refCount--
        if (sharedCompute.refCount <= 0) {
          this.sharedComputePipelines.delete(computeEntry.wgslHash)
        }
      }
      this.fieldComputeEntries.delete(programKey)
    }

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
    superFields?: SuperFieldGPU[],
    activeInteractions?: { fieldIdxA: number; fieldIdxB: number; interactionType: number }[],
  ): void {
    const device = this.device
    const ctx = this.context
    if (!device || !ctx || !this.basePipeline) return

    const canvas = ctx.canvas as HTMLCanvasElement
    const dpr = (window.devicePixelRatio || 1) * this.renderScale
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

    // --- Effects ---
    const hasSuperFields = superFields && superFields.length > 0 && this.superPipelineReady
    if ((fieldEffects && fieldEffects.length > 0) || hasSuperFields) {
      // Separate effects into compute-eligible and render-fallback
      const computeEffects: FieldEffectData[] = []
      const renderEffects: FieldEffectData[] = []

      if (fieldEffects && fieldEffects.length > 0) {
        if (this.useComputeEffects && this.clearComputePipeline && this.blitPipeline) {
          for (const effect of fieldEffects) {
            const computeEntry = this.fieldComputeEntries.get(effect.programKey)
            if (computeEntry && this.sharedComputePipelines.has(computeEntry.wgslHash)) {
              computeEffects.push(effect)
            } else {
              renderEffects.push(effect)
            }
          }
        } else {
          renderEffects.push(...fieldEffects)
        }
      }

      // ─── Stage ALL effect uniforms upfront ───
      let stageIdx = 0
      const computeStageIndices: number[] = []
      for (const effect of computeEffects) {
        this.stageEffectUniforms(stageIdx, effect)
        computeStageIndices.push(stageIdx++)
      }
      const renderStageIndices: number[] = []
      for (const effect of renderEffects) {
        this.stageEffectUniforms(stageIdx, effect)
        renderStageIndices.push(stageIdx++)
      }

      // Stage dispatch uniforms for compute effects
      for (let i = 0; i < computeEffects.length; i++) {
        device.queue.writeBuffer(this.dispatchStagingBuf!, i * FieldRenderer.DISPATCH_UNIFORM_SIZE, new Float32Array([0, 0, bufferW, bufferH]))
      }

      // ─── Compute path: superimposed + per-field, blit once ───
      const needsAccum = computeEffects.length > 0 || hasSuperFields
      if (needsAccum) {
        this.ensureAccumBuf(bufferW, bufferH)

        // Clear accumulation buffer
        {
          const clearBG = device.createBindGroup({
            layout: this.clearComputeLayout!,
            entries: [{ binding: 0, resource: { buffer: this.accumBuf! } }],
          })
          const pass = encoder.beginComputePass()
          pass.setPipeline(this.clearComputePipeline!)
          pass.setBindGroup(0, clearBG)
          pass.dispatchWorkgroups(Math.ceil(this.accumBufPixelCount / 256))
          pass.end()
        }

        // ─── Superimposed fields (single uber-shader dispatch) ───
        if (hasSuperFields) {
          this.renderSuperimposed(encoder, superFields!, bufferW, bufferH, activeInteractions)
        }

        // ─── Per-field compute effects ───
        const frameBG = this.getFrameBindGroup()
        const effectUniformBG = this.getEffectUniformBindGroup()

        for (let i = 0; i < computeEffects.length; i++) {
          const effect = computeEffects[i]
          const computeEntry = this.fieldComputeEntries.get(effect.programKey)!
          const sharedCompute = this.sharedComputePipelines.get(computeEntry.wgslHash)!

          // Copy this effect's uniforms from staging → active buffer (ordered within encoder)
          encoder.copyBufferToBuffer(
            this.effectUniformStagingBuf!, computeStageIndices[i] * FieldRenderer.EFFECT_UNIFORM_SIZE,
            this.effectUniformBuf!, 0, FieldRenderer.EFFECT_UNIFORM_SIZE,
          )
          encoder.copyBufferToBuffer(
            this.dispatchStagingBuf!, i * FieldRenderer.DISPATCH_UNIFORM_SIZE,
            this.dispatchUniformBuf!, 0, FieldRenderer.DISPATCH_UNIFORM_SIZE,
          )

          const dispatchBG = device.createBindGroup({
            layout: this.computeDispatchLayout!,
            entries: [
              { binding: 0, resource: { buffer: this.dispatchUniformBuf! } },
              { binding: 1, resource: { buffer: this.accumBuf! } },
            ],
          })

          const pass = encoder.beginComputePass()
          pass.setPipeline(sharedCompute.pipeline)
          pass.setBindGroup(0, frameBG)
          pass.setBindGroup(1, this.getEffectTextureBindGroup(effect.fieldId))
          pass.setBindGroup(2, effectUniformBG)
          pass.setBindGroup(3, dispatchBG)
          // Fullscreen dispatch — shader handles pixel-perfect shape via alpha
          pass.dispatchWorkgroups(
            Math.ceil(bufferW / 16),
            Math.ceil(bufferH / 16),
          )
          pass.end()
        }

        // ─── Interaction propagation pass ───
        if (!this._propLogDone && hasSuperFields) {
          console.log('[Propagation] Check:', { hasPipeline: !!this.propagationPipeline, hasIxBuf: !!this.ixBuf, ixBufPixels: this.ixBufPixelCount })
          this._propLogDone = true
        }
        if (hasSuperFields && this.propagationPipeline && this.ixBuf) {
          const propBG = device.createBindGroup({
            layout: this.propagationBindGroupLayout!,
            entries: [
              { binding: 0, resource: { buffer: this.ixBuf } },
              { binding: 1, resource: { buffer: this.accumBuf! } },
            ],
          })
          const propPass = encoder.beginComputePass()
          propPass.setPipeline(this.propagationPipeline)
          propPass.setBindGroup(0, frameBG)
          propPass.setBindGroup(1, propBG)
          propPass.dispatchWorkgroups(
            Math.ceil(bufferW / 16),
            Math.ceil(bufferH / 16),
          )
          propPass.end()
        }

        // Blit accumulation buffer to screen
        {
          const blitBG = device.createBindGroup({
            layout: this.blitStorageLayout!,
            entries: [{ binding: 0, resource: { buffer: this.accumBuf! } }],
          })
          const pass = encoder.beginRenderPass({
            colorAttachments: [{
              view: textureView,
              loadOp: 'load',
              storeOp: 'store',
            }],
          })
          pass.setPipeline(this.blitPipeline!)
          pass.setBindGroup(0, frameBG)
          pass.setBindGroup(1, blitBG)
          pass.draw(6)
          pass.end()
        }
      }

      // ─── Render pass fallback for effects without compute pipelines ───
      if (renderEffects.length > 0) {
        const frameBG = this.getFrameBindGroup()
        const effectUniformBG = this.getEffectUniformBindGroup()

        for (let i = 0; i < renderEffects.length; i++) {
          const effect = renderEffects[i]
          const entry = this.fieldEntries.get(effect.programKey)
          if (!entry) continue
          const shared = this.sharedPipelines.get(entry.wgslHash)
          if (!shared) continue

          // Copy this effect's uniforms from staging → active buffer
          encoder.copyBufferToBuffer(
            this.effectUniformStagingBuf!, renderStageIndices[i] * FieldRenderer.EFFECT_UNIFORM_SIZE,
            this.effectUniformBuf!, 0, FieldRenderer.EFFECT_UNIFORM_SIZE,
          )

          if (effect.precedence && this.maskClearPipeline) {
            const maskTex = this.fieldMaskTextures.get(effect.fieldId)
            if (maskTex) {
              const mcPass = encoder.beginRenderPass({
                colorAttachments: [{ view: textureView, loadOp: 'load', storeOp: 'store' }],
              })
              // maskClear uses fullscreen — mask texture handles pixel-perfect clearing
              mcPass.setPipeline(this.maskClearPipeline)
              mcPass.setBindGroup(0, frameBG)
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

          // Fullscreen render pass — no scissor rect, shader alpha defines pixel-perfect shape
          const pass = encoder.beginRenderPass({
            colorAttachments: [{ view: textureView, loadOp: 'load', storeOp: 'store' }],
          })
          pass.setPipeline(shared.pipeline)
          pass.setBindGroup(0, frameBG)
          pass.setBindGroup(1, this.getEffectTextureBindGroup(effect.fieldId))
          pass.setBindGroup(2, effectUniformBG)
          pass.draw(6)
          pass.end()
        }
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
    const dpr = (window.devicePixelRatio || 1) * this.renderScale
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
      const computeEffects: FieldEffectData[] = []
      const renderEffects: FieldEffectData[] = []

      if (this.useComputeEffects && this.clearComputePipeline && this.blitPipeline) {
        for (const effect of fieldEffects) {
          const ce = this.fieldComputeEntries.get(effect.programKey)
          if (ce && this.sharedComputePipelines.has(ce.wgslHash)) {
            computeEffects.push(effect)
          } else {
            renderEffects.push(effect)
          }
        }
      } else {
        renderEffects.push(...fieldEffects)
      }

      // Stage all effect uniforms
      let stageIdx = 0
      const computeStageIndices: number[] = []
      for (const effect of computeEffects) { this.stageEffectUniforms(stageIdx, effect); computeStageIndices.push(stageIdx++) }
      const renderStageIndices: number[] = []
      for (const effect of renderEffects) { this.stageEffectUniforms(stageIdx, effect); renderStageIndices.push(stageIdx++) }
      // Fullscreen dispatch — no scissor clipping
      for (let i = 0; i < computeEffects.length; i++) {
        device.queue.writeBuffer(this.dispatchStagingBuf!, i * FieldRenderer.DISPATCH_UNIFORM_SIZE, new Float32Array([0, 0, bufferW, bufferH]))
      }

      if (computeEffects.length > 0) {
        this.ensureAccumBuf(bufferW, bufferH)
        const clearBG = device.createBindGroup({ layout: this.clearComputeLayout!, entries: [{ binding: 0, resource: { buffer: this.accumBuf! } }] })
        { const pass = encoder.beginComputePass(); pass.setPipeline(this.clearComputePipeline!); pass.setBindGroup(0, clearBG); pass.dispatchWorkgroups(Math.ceil(this.accumBufPixelCount / 256)); pass.end() }

        const frameBG = this.getFrameBindGroup()
        const effectUniformBG = this.getEffectUniformBindGroup()

        for (let i = 0; i < computeEffects.length; i++) {
          const effect = computeEffects[i]
          const ce = this.fieldComputeEntries.get(effect.programKey)!
          const sc = this.sharedComputePipelines.get(ce.wgslHash)!

          encoder.copyBufferToBuffer(this.effectUniformStagingBuf!, computeStageIndices[i] * FieldRenderer.EFFECT_UNIFORM_SIZE, this.effectUniformBuf!, 0, FieldRenderer.EFFECT_UNIFORM_SIZE)
          encoder.copyBufferToBuffer(this.dispatchStagingBuf!, i * FieldRenderer.DISPATCH_UNIFORM_SIZE, this.dispatchUniformBuf!, 0, FieldRenderer.DISPATCH_UNIFORM_SIZE)

          const dispatchBG = device.createBindGroup({ layout: this.computeDispatchLayout!, entries: [{ binding: 0, resource: { buffer: this.dispatchUniformBuf! } }, { binding: 1, resource: { buffer: this.accumBuf! } }] })
          const pass = encoder.beginComputePass()
          pass.setPipeline(sc.pipeline)
          pass.setBindGroup(0, frameBG)
          pass.setBindGroup(1, this.getEffectTextureBindGroup(effect.fieldId))
          pass.setBindGroup(2, effectUniformBG)
          pass.setBindGroup(3, dispatchBG)
          pass.dispatchWorkgroups(Math.ceil(bufferW / 16), Math.ceil(bufferH / 16))
          pass.end()
        }

        const blitBG = device.createBindGroup({ layout: this.blitStorageLayout!, entries: [{ binding: 0, resource: { buffer: this.accumBuf! } }] })
        const blitPass = encoder.beginRenderPass({ colorAttachments: [{ view: textureView, loadOp: 'load', storeOp: 'store' }] })
        blitPass.setPipeline(this.blitPipeline!)
        blitPass.setBindGroup(0, this.getFrameBindGroup())
        blitPass.setBindGroup(1, blitBG)
        blitPass.draw(6)
        blitPass.end()
      }

      if (renderEffects.length > 0) {
        const frameBG = this.getFrameBindGroup()
        const effectUniformBG = this.getEffectUniformBindGroup()
        for (let i = 0; i < renderEffects.length; i++) {
          const effect = renderEffects[i]
          const entry = this.fieldEntries.get(effect.programKey)
          if (!entry) continue
          const shared = this.sharedPipelines.get(entry.wgslHash)
          if (!shared) continue
          encoder.copyBufferToBuffer(this.effectUniformStagingBuf!, renderStageIndices[i] * FieldRenderer.EFFECT_UNIFORM_SIZE, this.effectUniformBuf!, 0, FieldRenderer.EFFECT_UNIFORM_SIZE)
          // Fullscreen render — no scissor, shader alpha defines pixel-perfect shape
          const pass = encoder.beginRenderPass({ colorAttachments: [{ view: textureView, loadOp: 'load', storeOp: 'store' }] })
          pass.setPipeline(shared.pipeline)
          pass.setBindGroup(0, frameBG)
          pass.setBindGroup(1, this.getEffectTextureBindGroup(effect.fieldId))
          pass.setBindGroup(2, effectUniformBG)
          pass.draw(6)
          pass.end()
        }
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

  async compileStateUpdate(wgsl: string, modCode?: string): Promise<{ success: boolean; error?: string }> {
    return this.compileCompositeStateUpdate([{ id: 'single', wgsl }], modCode)
  }

  async compileCompositeStateUpdate(fields: { id: string; wgsl: string }[], modCode?: string): Promise<{ success: boolean; error?: string }> {
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

  /** Render each field's effects individually to the presence texture, then async readback
   *  into per-field Uint8Array maps. Each field gets its OWN presence map (not shared).
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

    const numFields = effectsByField.size
    if (numFields === 0) return

    // Calculate per-field slice in the staging buffer
    const bytesPerRow = Math.ceil(this.gridSize * 16 / 256) * 256
    const sliceSize = bytesPerRow * this.gridSize
    const totalBufSize = numFields * sliceSize

    // Resize staging buffer if it's too small for current field count
    if (!this.presenceStagingBuf || this.presenceStagingBufCapacity < totalBufSize) {
      this.presenceStagingBuf?.destroy()
      this.presenceStagingBuf = device.createBuffer({
        size: totalBufSize,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      })
      this.presenceStagingBufCapacity = totalBufSize
    }

    // Identity camera — render full grid
    this.writeFrameUniforms(
      { x: this.gridSize / 2, y: this.gridSize / 2 },
      [this.gridSize, this.gridSize],
      1.0,
      time,
    )

    // Stage all effect uniforms upfront into the staging buffer
    let stageIdx = 0
    const fieldStageMap = new Map<string, number[]>()
    for (const [fieldId, effects] of effectsByField) {
      const indices: number[] = []
      for (const effect of effects) {
        this.stageEffectUniforms(stageIdx, effect)
        indices.push(stageIdx++)
      }
      fieldStageMap.set(fieldId, indices)
    }

    const encoder = device.createCommandEncoder()
    const frameBG = this.getFrameBindGroup()
    const effectUniformBG = this.getEffectUniformBindGroup()
    const fieldOrder: string[] = []
    let fieldIdx = 0

    for (const [fieldId, effects] of effectsByField) {
      fieldOrder.push(fieldId)
      const stageIndices = fieldStageMap.get(fieldId)!

      // Clear presence texture before rendering this field
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

      // Render only this field's effects
      for (let i = 0; i < effects.length; i++) {
        const effect = effects[i]
        const entry = this.fieldEntries.get(effect.programKey)
        if (!entry) continue
        const shared = this.sharedPipelines.get(entry.wgslHash)
        if (!shared) continue

        // Copy this effect's uniforms from staging → active buffer
        encoder.copyBufferToBuffer(
          this.effectUniformStagingBuf!, stageIndices[i] * FieldRenderer.EFFECT_UNIFORM_SIZE,
          this.effectUniformBuf!, 0, FieldRenderer.EFFECT_UNIFORM_SIZE,
        )

        const pass = encoder.beginRenderPass({
          colorAttachments: [{
            view: this.presenceTex.createView(),
            loadOp: 'load',
            storeOp: 'store',
          }],
        })
        pass.setPipeline(shared.pipeline)
        pass.setBindGroup(0, frameBG)
        pass.setBindGroup(1, this.getEffectTextureBindGroup(effect.fieldId))
        pass.setBindGroup(2, effectUniformBG)
        pass.draw(6)
        pass.end()
      }

      // Copy this field's presence render to its slot in the staging buffer
      encoder.copyTextureToBuffer(
        { texture: this.presenceTex },
        { buffer: this.presenceStagingBuf!, bytesPerRow, offset: fieldIdx * sliceSize },
        [this.gridSize, this.gridSize],
      )

      fieldIdx++
    }

    device.queue.submit([encoder.finish()])

    // Async readback — split staging buffer into per-field presence maps
    this.presenceReadPending = true
    this.presenceStagingBuf!.mapAsync(GPUMapMode.READ).then(() => {
      const mapped = this.presenceStagingBuf!.getMappedRange()
      const gs = this.gridSize
      const rowFloats = bytesPerRow / 4
      const result = new Map<string, Uint8Array>()

      for (let fi = 0; fi < fieldOrder.length; fi++) {
        const fieldId = fieldOrder[fi]
        const sliceOffset = fi * sliceSize
        const fieldData = new Float32Array(mapped, sliceOffset, sliceSize / 4)
        const presence = new Uint8Array(gs * gs)

        for (let y = 0; y < gs; y++) {
          const srcRow = y * rowFloats
          const dstRow = y * gs
          for (let x = 0; x < gs; x++) {
            const alpha = fieldData[srcRow + x * 4 + 3]
            if (alpha > 0.02) {
              presence[dstRow + x] = 255
            }
          }
        }

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

  // ─── Superimposed rendering ───

  /** Lazily compile the superimposed compute pipeline.
   *  Guards against re-entrant calls (render loop calls every frame).
   *  compilationId is only bumped by register methods — if it changes
   *  during async compilation, the result is discarded and recompilation
   *  is triggered on the next frame. */
  private async ensureSuperPipeline(): Promise<boolean> {
    if (this.superPipelineReady) return true
    if (this.superCompiling) return false  // Already compiling, wait for it
    const device = this.device
    if (!device || !this.superBindGroupLayout || !this.frameBindGroupLayout) return false

    this.superCompiling = true
    const myCompilationId = this.superCompilationId  // Snapshot — don't bump

    try {
      const allVisuals = this.getAllVisualTypes()
      const allInteractions = this.getAllInteractionTypes()
      console.log(`[Super] Compiling uber-shader with ${allVisuals.length} visuals, ${allInteractions.length} interactions`)
      const shaderSrc = buildSuperimposedComputeShader(allVisuals, allInteractions)
      console.log('[Super] Generated WGSL length:', shaderSrc.length, 'chars')
      // Log interaction-related WGSL
      if (allInteractions.length > 0) {
        const ixLines = shaderSrc.split('\n').filter((l: string) => l.includes('interaction') || l.includes('Interaction') || l.includes('dispatchInteraction'))
        console.log('[Super] Interaction-related WGSL lines:', ixLines)
      }
      const module = device.createShaderModule({ code: shaderSrc })
      const info = await module.getCompilationInfo()
      const errors = info.messages.filter(m => m.type === 'error')
      if (errors.length > 0) {
        console.error('[Super] Shader compile errors:')
        for (const e of errors) {
          console.error(`  Line ${e.lineNum}:${e.linePos}: ${e.message}`)
        }
        console.error('[Super] Generated shader source:\n', shaderSrc)
        return false
      }
      // Log warnings too
      const warnings = info.messages.filter(m => m.type === 'warning')
      if (warnings.length > 0) {
        console.warn('[Super] Shader warnings:', warnings.map(w => w.message).join('\n'))
      }

      // Check if a register call invalidated during compilation
      if (myCompilationId !== this.superCompilationId) {
        console.log('[Super] Compilation superseded, will recompile next frame')
        return false
      }

      const pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [this.frameBindGroupLayout, this.superBindGroupLayout],
      })
      this.superPipeline = await device.createComputePipelineAsync({
        layout: pipelineLayout,
        compute: { module, entryPoint: 'main' },
      })

      if (myCompilationId !== this.superCompilationId) {
        console.log('[Super] Compilation superseded after pipeline creation, will recompile')
        return false
      }

      this.superPipelineReady = true
      console.log('[Super] Pipeline compiled (' + this.getAllVisualTypes().length + ' visuals, ' + this.getAllInteractionTypes().length + ' interactions)')
      return true
    } catch (err) {
      console.error('[Super] Pipeline creation failed:', err)
      return false
    } finally {
      this.superCompiling = false
    }
  }

  /** Ensure the field storage buffer can hold the given number of fields */
  private ensureSuperFieldBuffer(fieldCount: number): void {
    const device = this.device!
    const needed = fieldCount * FieldRenderer.SUPER_FIELD_STRIDE
    if (this.superFieldBuffer && this.superFieldBufferCapacity >= needed) return

    this.superFieldBuffer?.destroy()
    const capacity = Math.max(needed, FieldRenderer.SUPER_MAX_FIELDS * FieldRenderer.SUPER_FIELD_STRIDE)
    this.superFieldBuffer = device.createBuffer({
      size: capacity,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })
    this.superFieldBufferCapacity = capacity
  }

  /** Ensure the hit ID buffer exists and is large enough for the current canvas size */
  private ensureHitIdBuffer(pixelCount: number): void {
    const device = this.device!
    if (this.hitIdBuffer && this.hitIdPixelCount >= pixelCount) return

    this.hitIdBuffer?.destroy()
    this.hitIdStagingBuffer?.destroy()

    const byteSize = pixelCount * 4 // u32 per pixel
    this.hitIdBuffer = device.createBuffer({
      size: byteSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    })
    this.hitIdStagingBuffer = device.createBuffer({
      size: byteSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })
    this.hitIdPixelCount = pixelCount
  }

  /** Ensure the interaction buffer exists and is large enough */
  private ensureInteractionBuffer(count: number): void {
    const device = this.device!
    // Need at least 1 entry so the storage buffer is non-zero size
    const needed = Math.max(1, count) * FieldRenderer.INTERACTION_STRIDE
    if (this.interactionBuffer && this.interactionBufferCapacity >= needed) return

    this.interactionBuffer?.destroy()
    this.interactionBuffer = device.createBuffer({
      size: needed,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })
    this.interactionBufferCapacity = needed
  }

  /** Pack field data into the GPU storage buffer and dispatch the superimposed shader.
   *  Call between accum clear and blit. */
  renderSuperimposed(
    encoder: GPUCommandEncoder,
    fields: SuperFieldGPU[],
    bufferW: number,
    bufferH: number,
    activeInteractions?: { fieldIdxA: number; fieldIdxB: number; interactionType: number }[],
  ): void {
    if (fields.length === 0 || !this.superPipeline || !this.accumBuf) return

    // Lazy upgrade: if renderer was initialized before ixBuf support, recreate layout
    if (!this.superLayoutHasIxBuf && this.device) {
      this.superBindGroupLayout = this.device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
          { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        ],
      })
      this.superLayoutHasIxBuf = true
      this.superPipelineReady = false // force uber-shader recompilation with new layout
    }

    // Lazy create propagation pipeline if missing
    if (!this.propagationPipeline && this.device) {
      if (!this.propagationBindGroupLayout) {
        this.propagationBindGroupLayout = this.device.createBindGroupLayout({
          entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
            { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          ],
        })
      }
      const propModule = this.device.createShaderModule({ code: buildPropagationComputeShader() })
      this.propagationPipeline = this.device.createComputePipeline({
        layout: this.device.createPipelineLayout({
          bindGroupLayouts: [this.frameBindGroupLayout!, this.propagationBindGroupLayout!],
        }),
        compute: { module: propModule, entryPoint: 'main' },
      })
    }

    this.ensureSuperFieldBuffer(fields.length)
    this.ensureHitIdBuffer(bufferW * bufferH)
    this.ensureIxBuf(bufferW, bufferH)
    this.hitMapWidth = bufferW
    this.hitMapHeight = bufferH

    // Pack all fields into a Float32Array (20 floats per field)
    const data = new Float32Array(fields.length * 20)
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i]
      const off = i * 20
      data[off +  0] = f.posScaleRot[0]
      data[off +  1] = f.posScaleRot[1]
      data[off +  2] = f.posScaleRot[2]
      data[off +  3] = f.posScaleRot[3]
      data[off +  4] = f.shapeDims[0]
      data[off +  5] = f.shapeDims[1]
      data[off +  6] = f.shapeDims[2]
      data[off +  7] = f.shapeDims[3]
      data[off +  8] = f.color[0]
      data[off +  9] = f.color[1]
      data[off + 10] = f.color[2]
      data[off + 11] = f.color[3]
      data[off + 12] = f.visualAndParams[0]
      data[off + 13] = f.visualAndParams[1]
      data[off + 14] = f.visualAndParams[2]
      data[off + 15] = f.visualAndParams[3]
      data[off + 16] = f.extraParams[0]
      data[off + 17] = f.extraParams[1]
      data[off + 18] = f.extraParams[2]
      data[off + 19] = f.extraParams[3]
    }
    this.device!.queue.writeBuffer(this.superFieldBuffer!, 0, data)

    // Pack interactions (4 u32 each: fieldIdxA, fieldIdxB, interactionType, pad)
    const ixList = activeInteractions || []
    if (ixList.length > 0 && !this._ixLogDone) {
      console.log('[Super] Active interactions:', JSON.stringify(ixList))
      this._ixLogDone = true
    }
    this.ensureInteractionBuffer(ixList.length)
    const ixData = new Uint32Array(Math.max(1, ixList.length) * 4)
    for (let i = 0; i < ixList.length; i++) {
      ixData[i * 4 + 0] = ixList[i].fieldIdxA
      ixData[i * 4 + 1] = ixList[i].fieldIdxB
      ixData[i * 4 + 2] = ixList[i].interactionType
      ixData[i * 4 + 3] = 0
    }
    // If no interactions, write a sentinel (0xFFFFFFFF indices won't match anything)
    if (ixList.length === 0) {
      ixData[0] = 0xFFFFFFFF
      ixData[1] = 0xFFFFFFFF
      ixData[2] = 0
      ixData[3] = 0
    }
    this.device!.queue.writeBuffer(this.interactionBuffer!, 0, ixData)

    // Create bind group
    const superBG = this.device!.createBindGroup({
      layout: this.superBindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: this.superFieldBuffer!, size: fields.length * FieldRenderer.SUPER_FIELD_STRIDE } },
        { binding: 1, resource: { buffer: this.accumBuf } },
        { binding: 2, resource: { buffer: this.hitIdBuffer! } },
        { binding: 3, resource: { buffer: this.interactionBuffer!, size: Math.max(1, ixList.length) * FieldRenderer.INTERACTION_STRIDE } },
        { binding: 4, resource: { buffer: this.ixBuf! } },
      ],
    })

    const pass = encoder.beginComputePass()
    pass.setPipeline(this.superPipeline)
    pass.setBindGroup(0, this.getFrameBindGroup())
    pass.setBindGroup(1, superBG)
    pass.dispatchWorkgroups(
      Math.ceil(bufferW / 16),
      Math.ceil(bufferH / 16),
    )
    pass.end()

    // Copy hit ID buffer to staging for CPU readback
    if (this.hitIdStagingBuffer && !this.hitIdReadbackPending) {
      const byteSize = bufferW * bufferH * 4
      encoder.copyBufferToBuffer(this.hitIdBuffer!, 0, this.hitIdStagingBuffer, 0, byteSize)
    }
  }

  /** Trigger async readback of the hit ID buffer. Call after queue.submit(). */
  readbackHitMap(): void {
    if (!this.hitIdStagingBuffer || this.hitIdReadbackPending) return
    this.hitIdReadbackPending = true

    const staging = this.hitIdStagingBuffer
    const w = this.hitMapWidth
    const h = this.hitMapHeight

    staging.mapAsync(GPUMapMode.READ).then(() => {
      const data = new Uint32Array(staging.getMappedRange().slice(0))
      staging.unmap()
      this.hitMap = data
      this.hitIdReadbackPending = false
    }).catch(() => {
      this.hitIdReadbackPending = false
    })
  }

  /** Check if the superimposed pipeline is ready, and trigger compilation if not */
  isSuperReady(): boolean {
    if (this.superPipelineReady) return true
    // Trigger lazy compilation
    this.ensureSuperPipeline()
    return false
  }

  /** Register a new visual type. Returns the assigned ID or updates existing.
   *  Triggers uber-shader recompilation. */
  registerVisualType(name: string, wgsl: string): { id: number; error?: string } {
    const existing = this.visualTypeRegistry.get(name)
    let id: number
    if (existing) {
      id = existing.id
      existing.wgsl = wgsl
    } else {
      id = this.nextVisualTypeId++
      this.visualTypeRegistry.set(name, { id, name, wgsl })
    }
    // Invalidate uber-shader — bump compilation ID so any in-flight compilation is discarded
    this.superCompilationId++
    this.superPipelineReady = false
    this.superPipeline = null
    return { id }
  }

  /** Get all registered visual types */
  getAllVisualTypes(): VisualTypeEntry[] {
    return [...this.visualTypeRegistry.values()]
  }

  /** Resolve a visual type name to its ID */
  resolveVisualType(name: string): number | undefined {
    const entry = this.visualTypeRegistry.get(name)
    return entry?.id
  }

  /** Register an interaction type. Triggers uber-shader recompilation. */
  registerInteraction(name: string, wgsl: string): { id: number } {
    const existing = this.interactionRegistry.get(name)
    let id: number
    if (existing) {
      id = existing.id
      existing.wgsl = wgsl
    } else {
      id = this.nextInteractionId++
      this.interactionRegistry.set(name, { id, name, wgsl })
    }
    this.superCompilationId++
    this.superPipelineReady = false
    this.superPipeline = null
    this._ixLogDone = false
    console.log(`[Super] Registered interaction '${name}' as id ${id}, triggering recompilation (compilationId=${this.superCompilationId})`)
    return { id }
  }

  /** Get all registered interaction types */
  getAllInteractionTypes(): InteractionEntry[] {
    return [...this.interactionRegistry.values()]
  }

  /** Resolve an interaction name to its ID */
  resolveInteraction(name: string): number | undefined {
    const entry = this.interactionRegistry.get(name)
    return entry?.id
  }

  /** Clear all visual type and interaction registries. Called on reset. */
  clearRegistries(): void {
    this.visualTypeRegistry.clear()
    this.nextVisualTypeId = 0
    this.interactionRegistry.clear()
    this.nextInteractionId = 0
    this.superPipelineReady = false
    this.superPipeline = null
    this.superCompilationId++
    this._ixLogDone = false
  }

  destroy(): void {
    this.sharedPipelines.clear()
    this.fieldEntries.clear()
    this.sharedComputePipelines.clear()
    this.fieldComputeEntries.clear()

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
    this.frameUniformBuf?.destroy()
    this.effectUniformBuf?.destroy()
    this.stateUniformBuf?.destroy()
    this.dispatchUniformBuf?.destroy()
    this.effectUniformStagingBuf?.destroy()
    this.dispatchStagingBuf?.destroy()
    this.accumBuf?.destroy()
    this.ixBuf?.destroy()
    this.superFieldBuffer?.destroy()

    this.device = null
    this.context = null
    this.basePipeline = null
    this.maskClearPipeline = null
    this.stateUpdatePipeline = null
    this.clearComputePipeline = null
    this.blitPipeline = null
    this.colorTex = null
    this.stateTex = null
    this.stateTex2 = null
    this.selectionTex = null
    this.effectTex = null
    this.presenceTex = null
    this.effectUniformStagingBuf = null
    this.dispatchStagingBuf = null
    this.accumBuf = null
    this.superFieldBuffer = null
    this.superPipeline = null
    this.superPipelineReady = false
    this.visualTypeRegistry.clear()
    this.nextVisualTypeId = 0
    this.interactionRegistry.clear()
    this.nextInteractionId = 0
    this.interactionBuffer?.destroy()
    this.interactionBuffer = null
    this.hitIdBuffer?.destroy()
    this.hitIdStagingBuffer?.destroy()
    this.hitIdBuffer = null
    this.hitIdStagingBuffer = null
    this.hitMap = null
  }
}
