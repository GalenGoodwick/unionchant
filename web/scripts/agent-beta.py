#!/usr/bin/env python3
"""Beta — Builds a creature: body with limbs as children, walking animation."""
import json, time, math, urllib.request

TOKEN = "engine-agent-dev-89230be3b2df362a"
BASE = "http://localhost:3000/api/engine/bridge"
MY_NAME = "Beta"
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
    "Origin": "http://localhost:3000",
}

BODY_SHADER = """
vec4 fieldEffect(vec2 c, vec2 mn, vec2 mx, float t, vec4 p) {
    vec2 center = (mn+mx)*0.5; vec2 sz = mx-mn; float mr = max(sz.x,sz.y)*0.5;
    vec2 d = c-center; float dist = length(d)/mr; float a = atan(d.y,d.x);
    float body = exp(-dist*2.0)*(0.9+0.1*sin(t*2.0));
    float pattern = 0.5+0.3*sin(a*4.0+t*0.5)*sin(dist*8.0-t);
    float edge = smoothstep(0.9,0.7,dist)*0.3;
    vec3 col = p.rgb*body*pattern + p.rgb*0.4*edge;
    col += vec3(1.0,0.8,0.6)*exp(-dist*5.0)*0.3;
    return vec4(col, smoothstep(1.0,0.2,dist)*(body*0.8+0.2));
}"""

LIMB_SHADER = """
vec4 fieldEffect(vec2 c, vec2 mn, vec2 mx, float t, vec4 p) {
    vec2 center = (mn+mx)*0.5; vec2 sz = mx-mn; float mr = max(sz.x,sz.y)*0.5;
    vec2 d = c-center; float dist = length(d)/mr;
    float limb = exp(-dist*2.5)*0.9;
    float pulse = 0.8+0.2*sin(t*3.0+dist*4.0);
    vec3 col = p.rgb*limb*pulse;
    col += p.rgb*0.3*exp(-dist*4.0);
    return vec4(col, smoothstep(1.0,0.3,dist)*limb);
}"""

EYE_SHADER = """
vec4 fieldEffect(vec2 c, vec2 mn, vec2 mx, float t, vec4 p) {
    vec2 center = (mn+mx)*0.5; vec2 sz = mx-mn; float mr = max(sz.x,sz.y)*0.5;
    vec2 d = c-center; float dist = length(d)/mr;
    float white = exp(-dist*3.0);
    float pupil = 1.0-smoothstep(0.0,0.35,dist);
    float glint = exp(-pow(dist-0.1,2.0)*80.0)*0.8;
    vec3 col = vec3(0.9,0.9,1.0)*white*(1.0-pupil) + vec3(0.05,0.05,0.1)*pupil;
    col += vec3(1.0)*glint;
    return vec4(col, smoothstep(1.0,0.3,dist)*(white+0.1));
}"""

PARTS = [
    {"suffix": "Head",    "color": [0.9, 0.5, 0.2, 1], "radius": 10, "shape": "circle",
     "offset": [0, -18], "shader": BODY_SHADER},
    {"suffix": "LArm",    "color": [0.8, 0.4, 0.15, 1], "radius": 5, "shape": "rect", "w": 4, "h": 12,
     "offset": [-18, 0], "shader": LIMB_SHADER, "swing": True, "swing_amp": 12, "swing_speed": 3.0},
    {"suffix": "RArm",    "color": [0.8, 0.4, 0.15, 1], "radius": 5, "shape": "rect", "w": 4, "h": 12,
     "offset": [18, 0],  "shader": LIMB_SHADER, "swing": True, "swing_amp": 12, "swing_speed": 3.0, "swing_phase": math.pi},
    {"suffix": "LLeg",    "color": [0.7, 0.35, 0.1, 1], "radius": 5, "shape": "rect", "w": 5, "h": 14,
     "offset": [-8, 20], "shader": LIMB_SHADER, "swing": True, "swing_amp": 10, "swing_speed": 3.0},
    {"suffix": "RLeg",    "color": [0.7, 0.35, 0.1, 1], "radius": 5, "shape": "rect", "w": 5, "h": 14,
     "offset": [8, 20],  "shader": LIMB_SHADER, "swing": True, "swing_amp": 10, "swing_speed": 3.0, "swing_phase": math.pi},
    {"suffix": "LEye",    "color": [1, 1, 1, 1], "radius": 3, "shape": "circle",
     "offset": [-4, -22], "shader": EYE_SHADER, "parent_suffix": "Head"},
    {"suffix": "REye",    "color": [1, 1, 1, 1], "radius": 3, "shape": "circle",
     "offset": [4, -22],  "shader": EYE_SHADER, "parent_suffix": "Head"},
]

def bridge(cmds=None):
    if cmds:
        if isinstance(cmds, dict): cmds = [cmds]
        data = json.dumps({"commands": cmds}).encode()
        req = urllib.request.Request(BASE, data=data, headers=HEADERS, method="POST")
    else:
        req = urllib.request.Request(BASE, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())

cycle = 0
walk_target = [350, 280]
while True:
    cycle += 1
    try:
        state = bridge()
        fields = {f["name"]: f for f in state.get("fields", [])}
        me = fields.get(MY_NAME)

        if not me:
            bridge(cmds={"type": "create_field", "name": MY_NAME,
                         "color": [0.9, 0.5, 0.2, 1],
                         "x": 150, "y": 256})
            print(f"[{MY_NAME} c{cycle}] Created body", flush=True)
            time.sleep(2)
            continue

        fid = me["id"]
        mx, my = me["transform"]["x"], me["transform"]["y"]
        t = cycle * 0.15
        cmds = []

        # Ensure body shader
        if not me.get("effects"):
            cmds.append({"type": "add_effect", "fieldId": fid, "glsl": BODY_SHADER,
                         "description": "creature body", "blend": "additive", "author": MY_NAME})

        # Walk in a pattern — pick new target every 20 cycles
        if cycle % 20 == 1:
            angle = (cycle // 20) * 1.2
            walk_target = [256 + math.cos(angle) * 100, 256 + math.sin(angle) * 80]

        dx, dy = walk_target[0] - mx, walk_target[1] - my
        dist = math.sqrt(dx*dx + dy*dy)
        if dist > 5:
            speed = min(dist * 0.08, 4)
            a = math.atan2(dy, dx)
            cmds.append({"type": "set_velocity", "fieldId": fid,
                         "vx": math.cos(a)*speed, "vy": math.sin(a)*speed})
        else:
            cmds.append({"type": "set_velocity", "fieldId": fid, "vx": 0, "vy": 0})

        # Create and animate parts
        for part in PARTS:
            pname = f"{MY_NAME}_{part['suffix']}"
            p = fields.get(pname)

            # Determine parent position
            if "parent_suffix" in part:
                parent_name = f"{MY_NAME}_{part['parent_suffix']}"
                parent = fields.get(parent_name)
                if not parent:
                    continue
                ppx, ppy = parent["transform"]["x"], parent["transform"]["y"]
            else:
                ppx, ppy = mx, my

            if not p:
                # Create part
                cmds.append({"type": "create_field", "name": pname,
                              "color": part["color"],
                              "x": ppx + part["offset"][0],
                              "y": ppy + part["offset"][1]})
                print(f"[{MY_NAME} c{cycle}] Created {pname}", flush=True)
            else:
                pid = p["id"]
                # Ensure shader
                if not p.get("effects"):
                    cmds.append({"type": "add_effect", "fieldId": pid, "glsl": part["shader"],
                                 "description": f"{part['suffix']}", "blend": "additive",
                                 "author": MY_NAME})

                # Follow parent + offset with swing animation
                ox, oy = part["offset"]
                if part.get("swing"):
                    swing_phase = part.get("swing_phase", 0)
                    swing = math.sin(t * part["swing_speed"] + swing_phase) * part["swing_amp"]
                    oy += swing

                tx, ty = ppx + ox, ppy + oy
                px, py = p["transform"]["x"], p["transform"]["y"]
                ddx, ddy = tx - px, ty - py
                dd = math.sqrt(ddx*ddx + ddy*ddy)
                if dd > 1:
                    sp = min(dd * 0.3, 10)
                    aa = math.atan2(ddy, ddx)
                    cmds.append({"type": "set_velocity", "fieldId": pid,
                                 "vx": math.cos(aa)*sp, "vy": math.sin(aa)*sp})

        if cmds:
            bridge(cmds=cmds)
            part_names = [f"{MY_NAME}_{p['suffix']}" for p in PARTS if f"{MY_NAME}_{p['suffix']}" in fields]
            print(f"[{MY_NAME} c{cycle}] ({mx:.0f},{my:.0f}) parts={len(part_names)} cmds={len(cmds)}", flush=True)

    except Exception as e:
        print(f"[{MY_NAME} c{cycle}] ERROR: {e}", flush=True)

    time.sleep(2)
