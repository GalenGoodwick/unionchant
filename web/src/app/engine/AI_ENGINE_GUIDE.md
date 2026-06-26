# Engine AI Agent Guide

How to programmatically create fields, visuals, interactions, and effects via the Bridge API.

---

## Quick Start

```python
import json, urllib.request

URL = "http://localhost:3000/api/engine/bridge"
HEADERS = {
    "Content-Type": "application/json",
    "Authorization": "Bearer <ENGINE_AGENT_TOKEN>",
}

def send(body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(URL, data=data, headers=HEADERS, method="POST")
    return json.loads(urllib.request.urlopen(req).read().decode())

# Create a field with a custom visual
send({"type": "define_visual", "name": "my_visual", "wgsl": SHADER_CODE})
send({"type": "create_field", "name": "MyField", "shape": "rect",
      "x": 256, "y": 256, "width": 300, "height": 300,
      "visualType": "my_visual", "color": [1.0, 0.5, 0.0, 1.0]})
```

---

## Authentication

POST requests require a Bearer token matching the `ENGINE_AGENT_TOKEN` env var:
```
Authorization: Bearer <token>
```

GET requests return engine state (fields, world data, params).

---

## Bridge API

**Endpoint**: `POST /api/engine/bridge`

Send a single command or an array:
```json
{"type": "create_field", "name": "Foo", ...}
// or
{"commands": [{"type": "create_field", ...}, {"type": "set_color", ...}]}
```

**Read state**: `GET /api/engine/bridge`
- `?fieldId=xxx` — single field snapshot
- `?name=Foo` — field lookup by name

---

## Command Reference

### Field Lifecycle

| Command | Parameters | Description |
|---------|-----------|-------------|
| `create_field` | `name?, color?, shape?, shapeType?, radius?, w?, h?, x?, y?, parentFieldId?, fieldId?, visualType?` | Create a new field. Shape: `"circle"` or `"rect"`. Returns assigned `fieldId`. |
| `delete_field` | `fieldId` | Remove field and its effects |
| `clone_field` | `fieldId, name?, color?, offsetX?, offsetY?` | Duplicate a field |
| `list_fields` | — | List all fields |
| `reset` | — | Nuclear reset — clears everything |

### Field Properties

| Command | Parameters | Description |
|---------|-----------|-------------|
| `set_position` | `fieldId, x, y` | Move field to absolute position |
| `move` | `fieldId, dx, dy` | Relative position change |
| `set_color` | `fieldId, color: [r,g,b,a]` | Set field color (0.0–1.0 per channel) |
| `set_scale` | `fieldId, scale` | Scale transform |
| `set_shape` | `fieldId, shape?, shapeType?, radius?, w?, h?` | Change shape/size |
| `set_name` | `fieldId, name` | Rename field |
| `set_parent` | `fieldId, parentFieldId?` | Set parent (null to unparent) |
| `set_property` | `fieldId, key, value` | Store arbitrary key-value data |
| `get_properties` | `fieldId` | Read field properties |

### Visual Shaders (Superimposed Rendering)

| Command | Parameters | Description |
|---------|-----------|-------------|
| `define_visual` | `name, wgsl` | Register a visual type. Fields with `visualType` matching this name render using this shader. |
| `define_module` | `name, wgsl` | Register a reusable WGSL module. Functions must use `mod_NAME` prefix. Modules are injected before visuals in the uber-shader and can be called by any visual. Zero runtime cost (compile-time concatenation). |
| `create_render_target` | `name` | Create a named intermediate render buffer. Fields can write to it via `renderTarget` property, and other fields can sample from it via `sampleTarget()`. Max 6 targets. |
| `destroy_render_target` | `name` | Destroy a named render target and free its GPU memory. |

Fields with a `visualType` are rendered via the **uber-shader** — a single compute pass that evaluates all superimposed fields. This is the primary way to create complex 3D/2D visuals.

#### Shader Modules

Modules are reusable WGSL utility functions that any visual can call. Register with `define_module`, then call `mod_NAME(...)` from any visual shader.

```json
{"type": "define_module", "name": "sky", "wgsl": "fn mod_sky(uv: vec2f, t: f32) -> vec4f {\n  return vec4f(mix(vec3f(0.1,0.2,0.5), vec3f(0.5,0.7,1.0), uv.y*0.5+0.5), 1.0);\n}"}
```

Then use in a visual: `let sky = mod_sky(uv, time);`

#### Render-to-Texture (RTT)

Render targets let fields write to named intermediate buffers that other fields can sample from. This enables reflections, portals, blur/DOF, and multi-pass composition.

1. Create a target: `{"type": "create_render_target", "name": "bg"}`
2. Assign a field to write to it: `{"type": "create_field", ..., "renderTarget": "bg"}`
3. Sample from it in another visual's WGSL: `let color = sampleTarget(0u, pixelCoord);`
   - `sampleTarget(targetId: u32, pixelCoord: vec2f) -> vec4f` — sample by pixel coordinate
   - `sampleTargetUV(targetId: u32, uv: vec2f) -> vec4f` — sample by UV (0..1)
   - Target IDs are assigned in creation order (0, 1, 2, ...)

Fields can also declare `sampleTargets: ["bg"]` to document which targets they read from (used for dependency ordering).

### Per-Field Effects (Shader Stack)

| Command | Parameters | Description |
|---------|-----------|-------------|
| `add_effect` | `fieldId, wgsl, description?, blend?, order?, author?, fromFieldId?, feedback?` | Add a shader effect to a field's stack |
| `remove_effect` | `fieldId, effectId` | Remove specific effect |
| `update_effect` | `fieldId, effectId, wgsl, description?` | Atomic recompile of existing effect |
| `clear_effect` | `fieldId?` | Remove all effects from field |
| `inject_wgsl` | `wgsl, description?, fieldId?, fromFieldId?, feedback?` | Inject shader (auto-creates effect) |

Blend modes: `"alpha"` (default), `"additive"`, `"multiply"`

### World Effects

| Command | Parameters | Description |
|---------|-----------|-------------|
| `add_world_effect` | `wgsl, description?, blend?, fieldId?` | Composited over everything |
| `remove_world_effect` | `effectId` | Remove world effect |
| `inject_world_wgsl` | `wgsl, description?, fieldId?` | Inject world-level shader |
| `clear_world_effect` | — | Remove all world effects |

### Interactions

| Command | Parameters | Description |
|---------|-----------|-------------|
| `define_interaction` | `rule: {definedBy, trigger, triggerDistance?, fieldA?, fieldB?, effect, effectParams, description?}` | Rule-based interaction (overlap/proximity/always) |
| `remove_interaction` | `ruleId` | Remove interaction rule |
| `add_interaction_effect` | `fieldA?, fieldB?, wgsl, description?, blend?, spread?, order?, author?` | WGSL shader rendered at overlap pixels |
| `remove_interaction_effect` | `effectId` | Remove interaction effect |

Trigger types: `"overlap"`, `"proximity"`, `"always"`
Effect types: `"transfer_property"`, `"apply_force"`, `"modify_property"`, `"exchange_wgsl"`, `"send_event"`, `"damage"`, `"destroy_field"`

### Communication

| Command | Parameters | Description |
|---------|-----------|-------------|
| `field_message` | `fromFieldId, toFieldId, content, data?` | Send message between fields (stored in both fields' memory) |

### Physics

| Command | Parameters | Description |
|---------|-----------|-------------|
| `set_world_params` | `params: {gravity?, friction?, collisionForce?, boundaryMode?, bounciness?, gravitationalConstant?}` | Physics parameters |
| `apply_force` | `fieldId, fx, fy` | Apply impulse to field |

Boundary modes: `"solid"`, `"wrap"`, `"open"`

### Simulation Hooks (JavaScript)

| Command | Parameters | Description |
|---------|-----------|-------------|
| `add_step_hook` | `hookId, author, description, code` | JavaScript executed every simulation tick |
| `remove_step_hook` | `hookId` | Remove hook |

Step hooks run in the browser and have access to field state, world data, and can emit commands.

### Shared State

| Command | Parameters | Description |
|---------|-----------|-------------|
| `set_world_data` | `data: Record<string, unknown>, fieldId?` | Merge into global worldData object (set key to null to delete) |

### Field Links (Visual Beams)

| Command | Parameters | Description |
|---------|-----------|-------------|
| `link_fields` | `fromFieldId, toFieldId, color?, width?, style?, intensity?, bidirectional?, author?` | Visual energy beam between fields |
| `unlink_fields` | `linkId` | Remove link |

Styles: `"beam"`, `"lightning"`, `"pulse"`, `"helix"`

### Reusable Shader Code

| Command | Parameters | Description |
|---------|-----------|-------------|
| `register_wgsl_mod` | `id, author, description, code` | Register reusable WGSL utility functions |
| `remove_wgsl_mod` | `id` | Remove mod |

Registered mods are automatically injected into all shader compilations.

### Macros

| Command | Parameters | Description |
|---------|-----------|-------------|
| `define_command` | `command: {name, definedBy, description, macro: [...]}` | Define a macro command with `{{arg}}` template substitution |
| `execute_command` | `name, args?` | Expand and execute macro |

---

## Visual Shader Interface

### Function Signature

```wgsl
fn visual_NAME(uv: vec2f, sdf: f32, color: vec4f, time: f32, params: vec4f, behind: vec4f) -> vec4f
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `uv` | `vec2f` | Local UV coordinates within field bounds. Range: **-1.0 to 1.0** (center = 0,0) |
| `sdf` | `f32` | Signed distance to field boundary. Negative = inside field |
| `color` | `vec4f` | Field's base RGBA color (set via `set_color`) |
| `time` | `f32` | Seconds since engine start |
| `params` | `vec4f` | 4 custom float parameters (from field's `visualParams`) |
| `behind` | `vec4f` | Color of fields rendered behind this one (for layering) |

**Return**: `vec4f` — RGBA color. Alpha=0 for transparent pixels.

**UV Orientation**: `uv.y = -1.0` is the **top** of the field, `uv.y = 1.0` is the **bottom**. To use standard y-up coordinates, negate: `let p = vec2f(uv.x, -uv.y);`

### Example: Simple Pulsing Circle

```wgsl
fn visual_pulse(uv: vec2f, sdf: f32, color: vec4f, time: f32, params: vec4f, behind: vec4f) -> vec4f {
  let d = length(uv);
  let pulse = 0.3 + sin(time * 3.0) * 0.1;
  if (d > pulse) { return vec4f(0.0); }
  let bright = 1.0 - d / pulse;
  return vec4f(color.rgb * bright, 1.0);
}
```

### Example: Raymarched 3D Sphere

```wgsl
fn visual_sphere(uv: vec2f, sdf: f32, color: vec4f, time: f32, params: vec4f, behind: vec4f) -> vec4f {
  let ro = vec3f(uv * 0.8, -1.5);
  let rd = vec3f(0.0, 0.0, 1.0);

  // Ray-sphere intersection
  let b = dot(ro, rd);
  let c = dot(ro, ro) - 0.5 * 0.5;
  let disc = b * b - c;
  if (disc < 0.0) { return vec4f(0.0); }

  let t = -b - sqrt(disc);
  let hit = ro + rd * t;
  let nrm = normalize(hit);

  let lightDir = normalize(vec3f(0.5, -0.7, -1.0));
  let diff = max(dot(nrm, -lightDir), 0.0);

  return vec4f(color.rgb * (0.2 + diff * 0.8), 1.0);
}
```

### Available WGSL Utility Functions

All functions below are automatically available in visual shaders. No imports needed.

#### Hash (Deterministic Pseudo-Random)

| Function | Signature | Description |
|----------|-----------|-------------|
| `hash11` | `(p: f32) -> f32` | Scalar hash, range [0,1] |
| `hash21` | `(p: vec2f) -> f32` | 2D → scalar hash |
| `hash22` | `(p: vec2f) -> vec2f` | 2D → 2D hash (for random offsets) |
| `hash31` | `(p: vec3f) -> f32` | 3D → scalar hash |
| `hash33` | `(p: vec3f) -> vec3f` | 3D → 3D hash |

#### Noise

| Function | Signature | Description |
|----------|-----------|-------------|
| `vnoise` | `(p: vec2f) -> f32` | 2D value noise, smooth random field |
| `vnoise3` | `(p: vec3f) -> f32` | 3D value noise (use `.z` for time) |
| `gnoise` | `(p: vec2f) -> f32` | 2D gradient noise (Perlin-like), range [-1,1] |
| `simplex2d` | `(p: vec2f) -> f32` | 2D simplex noise |
| `noise` | `(p: vec2f) -> f32` | Alias for `vnoise` |
| `noisev` | `(p: vec3f) -> f32` | Alias for `vnoise3` |

#### FBM (Fractal Brownian Motion)

| Function | Signature | Description |
|----------|-----------|-------------|
| `fbm` | `(p: vec2f, octaves: i32) -> f32` | Generic 2D FBM, 1-8 octaves |
| `fbm3` | `(p: vec2f) -> f32` | 2D FBM, 3 octaves (fast) |
| `fbm4` | `(p: vec2f) -> f32` | 2D FBM, 4 octaves |
| `fbm5` | `(p: vec2f) -> f32` | 2D FBM, 5 octaves |
| `fbm6` | `(p: vec2f) -> f32` | 2D FBM, 6 octaves (heavy) |
| `fbm3d` | `(p: vec3f, octaves: i32) -> f32` | Generic 3D FBM |
| `fbm3v` | `(p: vec3f) -> f32` | 3D FBM, 3 octaves |
| `fbm4v` | `(p: vec3f) -> f32` | 3D FBM, 4 octaves |
| `fbm5v` | `(p: vec3f) -> f32` | 3D FBM, 5 octaves |
| `fbm6v` | `(p: vec3f) -> f32` | 3D FBM, 6 octaves (heavy) |
| `warp` | `(p: vec2f, strength: f32, time: f32) -> vec2f` | Domain warping via FBM |

#### Voronoi (Cellular Noise)

| Function | Signature | Description |
|----------|-----------|-------------|
| `voronoi` | `(p: vec2f) -> vec2f` | Returns `(minDist, secondMinDist)`. Use `.y - .x` for edges. Expensive (9-cell loop). |
| `voronoiEdge` | `(p: vec2f, width: f32) -> f32` | Edge detection, returns 0-1 (1 = on edge). `width` controls thickness. |

#### SDF 2D Primitives

| Function | Signature | Description |
|----------|-----------|-------------|
| `sdCircle` | `(p: vec2f, r: f32) -> f32` | Circle SDF. `r` = radius. |
| `sdBox` | `(p: vec2f, b: vec2f) -> f32` | Box SDF. `b` = half-extents. |
| `sdRoundedBox` | `(p: vec2f, b: vec2f, r: f32) -> f32` | Rounded box. `r` = corner radius. |
| `sdSegment` | `(p: vec2f, a: vec2f, b: vec2f) -> f32` | Line segment from `a` to `b`. |
| `sdEquilateralTriangle` | `(p: vec2f, r: f32) -> f32` | Equilateral triangle. |
| `sdStar` | `(p: vec2f, r: f32, n: i32, m: f32) -> f32` | Star shape. `n` = points, `m` = inner ratio. |

#### SDF Operations

| Function | Signature | Description |
|----------|-----------|-------------|
| `opUnion` | `(d1: f32, d2: f32) -> f32` | Union (min) |
| `opSubtract` | `(d1: f32, d2: f32) -> f32` | Subtract d1 from d2 |
| `opIntersect` | `(d1: f32, d2: f32) -> f32` | Intersection (max) |
| `opSmoothUnion` | `(d1: f32, d2: f32, k: f32) -> f32` | Smooth union. `k` = blend radius. |
| `opSmoothSubtract` | `(d1: f32, d2: f32, k: f32) -> f32` | Smooth subtraction. |

#### Color

| Function | Signature | Description |
|----------|-----------|-------------|
| `hsv2rgb` | `(c: vec3f) -> vec3f` | HSV to RGB. `c` = (hue 0-1, saturation, value). |
| `palette` | `(t: f32, a: vec3f, b: vec3f, c: vec3f, d: vec3f) -> vec3f` | Cosine palette (Inigo Quilez). |
| `colorRamp` | `(a: vec3f, b: vec3f, t: f32) -> vec3f` | Linear interpolation, clamped to [0,1]. |

#### Math & Geometry

| Function | Signature | Description |
|----------|-----------|-------------|
| `rot2` | `(a: f32) -> mat2x2f` | 2D rotation matrix. |
| `rotate` | `(p: vec2f, angle: f32) -> vec2f` | Rotate point by angle. Easier than `rot2() * p`. |
| `polar` | `(uv: vec2f) -> vec2f` | Returns `(radius, angle)` from centered UV. |
| `glsl_mod` | `(x: f32, y: f32) -> f32` | GLSL-style mod (always positive). |
| `glsl_mod2` | `(x: vec2f, y: vec2f) -> vec2f` | Vec2 version. |

#### Visual Effects

| Function | Signature | Description |
|----------|-----------|-------------|
| `circleMask` | `(uv: vec2f, radius: f32) -> f32` | Smooth circle mask, 1 inside, 0 outside. |
| `softGlow` | `(uv: vec2f, intensity: f32, radius: f32) -> f32` | Gaussian glow at origin. |
| `ring` | `(uv: vec2f, radius: f32, width: f32) -> f32` | Ring shape intensity. |
| `glow` | `(d: f32, col: vec3f, intensity: f32, radius: f32) -> vec3f` | Color glow from distance. |
| `diffuseLight` | `(p: vec2f, lightPos: vec2f, falloff: f32) -> f32` | Point light falloff. |

#### Region Helpers (for per-field effects)

| Function | Signature | Description |
|----------|-----------|-------------|
| `regionUV` | `(cell: vec2f, min: vec2f, max: vec2f) -> vec2f` | Normalize to 0-1 range. |
| `regionUVCentered` | `(cell: vec2f, min: vec2f, max: vec2f) -> vec2f` | Normalize to -1..1 range. |
| `regionUVAspect` | `(cell: vec2f, min: vec2f, max: vec2f) -> vec2f` | Aspect-corrected centered UV. |

---

## Per-Field Effect Shader Interface

### Function Signature

```wgsl
fn fieldEffect(coord: vec2f, regionMin: vec2f, regionMax: vec2f, time: f32, params: vec4f) -> vec4f
```

| Parameter | Description |
|-----------|-------------|
| `coord` | Cell coordinate in grid space |
| `regionMin/Max` | Bounds of the painted field region |
| `time` | Seconds since engine start |
| `params` | Field color [r,g,b,a] |

**Return**: RGBA color

### Available Bindings in Effects

```wgsl
@group(0) @binding(0) var<uniform> frame: FrameUniforms;
// frame.camera, frame.resolution, frame.zoom, frame.time, frame.gridSize

@group(1) @binding(0) var colorTex: texture_2d<f32>;    // Field presence
@group(1) @binding(1) var stateTex: texture_2d<f32>;    // State data
@group(1) @binding(3) var feedbackTex: texture_2d<f32>; // Previous frame (if feedback=true)

@group(2) @binding(0) var<uniform> effect: EffectUniforms;
// effect.bounds, effect.params, effect.transform
```

---

## Interaction Effect Shader Interface

```wgsl
fn interactionEffect(coord: vec2f, regionMin: vec2f, regionMax: vec2f, time: f32, params: vec4f) -> vec4f
```

Rendered only at pixels where both fields overlap. Has access to both fields' colors via `effect.fieldAColor` and `effect.fieldBColor`.

---

## WGSL Language Rules

WGSL is not GLSL. Key differences that cause silent compilation failures:

### Variables
- `let` = immutable (like `const`). Cannot reassign.
- `var` = mutable. Use when you need to modify a value.
```wgsl
let x = 5.0;    // immutable — cannot do x = 6.0
var y = 5.0;    // mutable — y = 6.0 is fine
```

### Types
- No implicit casts. `f32` and `i32` don't auto-convert.
- Use `f32(intVal)` or `i32(floatVal)` explicitly.
- Vector constructors: `vec2f(1.0, 2.0)`, `vec3f(0.0)`, `vec4f(rgb, 1.0)`
- `u32` is unsigned — loop counters can be `i32` or `var i = 0`

### Swizzles
- Both `.xyzw` and `.rgba` work: `v.rgb`, `v.xy`, `v.a`

### Loops
- Loop bounds must be statically known or use `var` counter with constant limit.
- Deeply nested loops multiply per-pixel cost. Budget: ~100 total inner iterations max for smooth 60fps.
- Break/continue work normally.

### Conditionals
- `if (condition) { }` — condition must be `bool`, not numeric.
- `if (x > 0.5)` is valid — comparison returns bool
- `if (x)` is invalid — numeric value is not bool

### Functions
- Declared with `fn name(param: type) -> returnType { }`
- No function overloading — each name is unique.

### Common Pitfalls
- `mod(x, y)` does not exist — use `glsl_mod(x, y)` (provided utility) or `x % y` for integers
- `fract()`, `floor()`, `ceil()`, `clamp()`, `smoothstep()`, `mix()` all work like GLSL
- `atan2(y, x)` not `atan(y, x)` — WGSL uses `atan2`
- Matrix multiplication: `mat * vec` (not `vec * mat` for column-major)

---

## HDR & Post-Processing

The engine applies post-processing after all shaders run. Shaders should output **linear HDR** values — the engine handles tone mapping and bloom.

### What the engine does automatically
1. **Bloom** — 13-tap cross kernel extracts bright pixels above threshold, blurs, and composites
2. **ACES filmic tone mapping** — maps HDR to displayable range with natural rolloff
3. **Vignette** — darkens edges
4. **Exposure** — multiplies all colors before tone mapping

### How to use HDR in your shaders
- Output values **greater than 1.0** for bright/glowing elements (neon, fire, lava, bioluminescence)
- The bloom pass catches anything above the threshold and makes it glow
- Don't clamp output to [0,1] — let HDR values through
- Don't apply your own tone mapping or gamma correction — the engine does this

```wgsl
// Good: output HDR values for bloom to catch
col += vec3f(3.0, 0.5, 0.0) * fireIntensity;  // bright orange fire
col += vec3f(0.0, 2.0, 3.0) * glowPulse;       // cyan bioluminescence

// Bad: clamping kills HDR, bloom has nothing to catch
col = clamp(col, vec3f(0.0), vec3f(1.0));  // don't do this
col = col / (col + vec3f(1.0));             // don't do Reinhard in the shader
```

### Configuring post-processing

```json
{"type": "set_world_data", "data": {
  "postProcess": {
    "bloomIntensity": 0.4,
    "bloomThreshold": 0.5,
    "exposure": 1.0,
    "vignetteStrength": 0.3,
    "vignetteRadius": 0.7
  }
}}
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `bloomIntensity` | 0.3 | Strength of bloom glow (0 = off, 1 = heavy) |
| `bloomThreshold` | 0.6 | Minimum brightness for bloom (lower = more glow) |
| `exposure` | 1.0 | Pre-tonemap exposure multiplier |
| `vignetteStrength` | 0.3 | Edge darkening amount (0 = off) |
| `vignetteRadius` | 0.7 | How far vignette extends from center |

---

## Performance Guidelines

1. **Field size matters most** — pixel count is the primary cost driver. A 500x500 field = 250k pixels per frame. Use the smallest field that looks good.

2. **Circle clip for raymarching** — add `if (length(uv) > 0.97) { return vec4f(0.0); }` at the top of visual shaders to reject corner pixels cheaply (~21% savings on rect fields).

3. **Bounding sphere** — for raymarched visuals, use a tight bounding sphere. If it covers the full UV range, every pixel runs the expensive march.

4. **SDF primitive count** — each primitive adds cost per raymarch step. 20-30 primitives is comfortable, 40+ gets heavy. Combine small details.

5. **March steps** — 32-48 is typical. Reduce for simpler shapes. Use over-relaxation (`t += d * 1.2`) for convex shapes.

6. **Forward-difference normals** — use 3 SDF evaluations instead of 6:
   ```wgsl
   let nrm = normalize(vec3f(
     sdf(p + vec3f(e,0,0), ...) - d0,
     sdf(p + vec3f(0,e,0), ...) - d0,
     sdf(p + vec3f(0,0,e), ...) - d0
   ));
   ```

7. **Noise octaves** — 3 FBM octaves is usually enough. Each octave doubles the cost.

8. **Voronoi** — expensive (9-cell loop). Use hash-based cracks as a cheaper alternative.

9. **Volumetric effects** — keep step count low (12-16). Use 2 noise octaves max.

10. **Safari vs Chrome** — Chrome's WebGPU (Dawn) handles complex compute shaders much better than Safari (Metal). Target Chrome for heavy shaders. Safari accumulates GPU state across shader recompilations.

11. **Multiple fields** — each field with a `visualType` adds a compute dispatch. Keep the number of superimposed fields reasonable (2-4 for complex visuals).

12. **Uber-shader compile budget** — all visual types compile into a single compute shader. Complex shaders across multiple fields compound. Keep total nested loop iterations under ~100 per visual. If 3 visuals each have 8x4 nested loops = 96 iterations each, the combined shader may exceed GPU compile limits or timeout.

13. **Silent failures** — if a visual shader has a WGSL error, the uber-shader won't compile and ALL visuals stop rendering (not just the broken one). Check the terminal panel for `COMPILE ERROR` messages. Common causes: wrong function signatures, missing `var` on mutable variables, type mismatches.

14. **Deploy incrementally** — when building multi-layer scenes, deploy and test one visual at a time. If all visuals are registered at once and one has an error, it's hard to tell which one broke.

---

## Complete Example: Animated Creature

```python
#!/usr/bin/env python3
import json, urllib.request

URL = "http://localhost:3000/api/engine/bridge"
HEADERS = {
    "Content-Type": "application/json",
    "Authorization": "Bearer <your-token>",
}

WGSL = r"""
fn visual_blob(uv: vec2f, sdf: f32, color: vec4f, time: f32, params: vec4f, behind: vec4f) -> vec4f {
  if (length(uv) > 0.95) { return vec4f(0.0); }

  // Animated blob body (2D SDF)
  let p = uv * 1.2;
  let bodyD = length(p) - 0.3 - sin(time * 2.0 + p.x * 5.0) * 0.03;

  // Eyes
  let leD = length(p - vec2f(-0.08, -0.08)) - 0.04;
  let reD = length(p - vec2f(0.08, -0.08)) - 0.04;

  if (bodyD > 0.02) { return vec4f(0.0); }

  // Body color with edge glow
  let edge = smoothstep(0.0, 0.02, bodyD);
  var col = mix(color.rgb, color.rgb * 0.3, edge);

  // Eyes
  let eyeD = min(leD, reD);
  col = mix(col, vec3f(1.0), smoothstep(0.01, -0.01, eyeD));
  col = mix(col, vec3f(0.0), smoothstep(0.005, -0.005, eyeD - 0.02));

  return vec4f(col, 1.0 - edge);
}
"""

def send(body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(URL, data=data, headers=HEADERS, method="POST")
    return json.loads(urllib.request.urlopen(req).read().decode())

send({"type": "reset"})
send({"type": "define_visual", "name": "blob", "wgsl": WGSL})
send({
    "type": "create_field",
    "name": "Blobby",
    "shape": "rect",
    "x": 256, "y": 256,
    "width": 200, "height": 200,
    "visualType": "blob",
    "color": [0.2, 0.8, 0.4, 1.0],
})
```

---

## Architecture Notes

- Commands flow: **Agent → Bridge API → SSE queue → Browser FieldEngine → WebGPU Renderer**
- The SSE stream (`/api/engine/agent`) replays all commands since last reset on reconnect
- Visual types are compiled into the uber-shader (single compute dispatch for all superimposed fields)
- Server persists state to `.engine-store.json` (survives server restarts)
- Field memory (messages, events) is capped at 100 entries per field
- The engine runs at the browser's requestAnimationFrame rate
