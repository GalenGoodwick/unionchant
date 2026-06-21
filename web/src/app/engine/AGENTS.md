# Field Agent System

## For Claude Code (launcher)

### How to launch agents

Each agent is a background Task (subagent_type: "Bash"). Give them a token and the API. They create themselves.

```
Token: {TOKEN}
Read:  curl -s -H "Authorization: Bearer {TOKEN}" "http://localhost:3000/api/engine/bridge"
Write: curl -s -X POST -H "Authorization: Bearer {TOKEN}" -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d '{ JSON }' http://localhost:3000/api/engine/bridge
```

### Monitoring

- Browser: `http://localhost:3000/engine`
- Agent output: `tail -20 /private/tmp/claude-501/-Users-galengoodwick/tasks/AGENT_ID.output`
- Bridge: `curl -s -H "Authorization: Bearer TOKEN" http://localhost:3000/api/engine/bridge`

### User hints

```json
{"type":"set_world_data","data":{"hint":"your message here"}}
```
Agents see `worldData.hint` in bridge responses.

---

## For Agents

You exist in a 512x512 pixel grid. You act by sending JSON commands to the bridge API. Fields are defined by painting pixel indices (cell index = y * 512 + x).

### API

Read state:
```
curl -s -H "Authorization: Bearer TOKEN" "http://localhost:3000/api/engine/bridge"
```

Send commands:
```
curl -s -X POST -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d '{"type":"COMMAND",...}' http://localhost:3000/api/engine/bridge
```

### Commands

| Command | Parameters |
|---------|-----------|
| `create_field` | `{name, color:[r,g,b,a], cells:[indices]}` |
| `paint` | `{fieldId, cells:[indices], color:[r,g,b,a]}` |
| `erase` | `{cells:[indices]}` |
| `delete_field` | `{fieldId}` |
| `add_effect` | `{fieldId, glsl, description, blend, order}` |
| `remove_effect` | `{fieldId, effectId}` |
| `clear_effect` | `{fieldId}` |
| `set_position` | `{fieldId, x, y}` |
| `move` | `{fieldId, dx, dy}` |
| `set_velocity` | `{fieldId, vx, vy, vr}` |
| `apply_force` | `{fieldId, fx, fy}` |
| `field_message` | `{fromFieldId, toFieldId, content, data}` |
| `set_world_params` | `{params: {gravity, friction, collisionForce, boundaryMode, bounciness}}` |
| `define_interaction` | `{rule: {definedBy, trigger, fieldA, fieldB, effect, effectParams}}` |
| `remove_interaction` | `{ruleId}` |
| `add_world_effect` | `{glsl, description, blend}` |
| `remove_world_effect` | `{effectId}` |
| `add_step_hook` | `{hookId, author, description, code}` |
| `remove_step_hook` | `{hookId}` |
| `set_world_data` | `{data: {key: value}}` |
| `status` | `{}` |
| `reset` | `{}` |
| `{commands: [...]}` | batch multiple |

### Cell indices

Cell index = `y * 512 + x` where (0,0) is top-left. Paint pixels to define a field's body.

### GLSL

Signature: `vec4 fieldEffect(vec2 coord, vec2 regionMin, vec2 regionMax, float time, vec4 params)`

Returns `vec4(r, g, b, a)` per pixel. Only renders on painted cells.

Available: `u_stateTex`, `u_gridSize` (512.0), `u_time`.

### Bridge response

Each field in the response includes: `id`, `name`, `color`, `cellCount`, `bounds`, `transform`, `effects`, `memory`, `proximity`, `stateAtCenter`.

World-level: `worldParams`, `worldData`, `worldPlan`, `worldRules`, `worldRoles`, `worldPhase`.
