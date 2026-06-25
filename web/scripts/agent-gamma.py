#!/usr/bin/env python3
"""Gamma — Builds a flower: center with petals as children, blooming animation."""
import json, time, math, urllib.request

TOKEN = "engine-agent-dev-89230be3b2df362a"
BASE = "http://localhost:3000/api/engine/bridge"
MY_NAME = "Gamma"
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
    "Origin": "http://localhost:3000",
}

CENTER_SHADER = """
vec4 fieldEffect(vec2 c, vec2 mn, vec2 mx, float t, vec4 p) {
    vec2 center = (mn+mx)*0.5; vec2 sz = mx-mn; float mr = max(sz.x,sz.y)*0.5;
    vec2 d = c-center; float dist = length(d)/mr; float a = atan(d.y,d.x);
    float core = exp(-dist*3.0)*(0.9+0.1*sin(t*2.0));
    float seeds = 0.5+0.5*sin(a*8.0+dist*12.0)*exp(-dist*2.0);
    vec3 col = vec3(0.9,0.7,0.1)*core*seeds;
    col += vec3(1.0,0.9,0.3)*exp(-dist*5.0)*0.5;
    return vec4(col, smoothstep(1.0,0.2,dist)*(core+0.1));
}"""

PETAL_SHADER = """
vec4 fieldEffect(vec2 c, vec2 mn, vec2 mx, float t, vec4 p) {
    vec2 center = (mn+mx)*0.5; vec2 sz = mx-mn; float mr = max(sz.x,sz.y)*0.5;
    vec2 d = c-center; float dist = length(d)/mr; float a = atan(d.y,d.x);
    float petal = exp(-dist*1.8)*(0.8+0.2*sin(t*1.5));
    float vein = abs(sin(a*2.0))*exp(-dist*2.0)*0.4;
    float glow = exp(-dist*3.0)*0.5;
    vec3 col = p.rgb*petal + p.rgb*0.6*vein + vec3(1.0,0.9,0.9)*glow;
    return vec4(col, smoothstep(1.0,0.3,dist)*petal);
}"""

LEAF_SHADER = """
vec4 fieldEffect(vec2 c, vec2 mn, vec2 mx, float t, vec4 p) {
    vec2 center = (mn+mx)*0.5; vec2 sz = mx-mn; float mr = max(sz.x,sz.y)*0.5;
    vec2 d = c-center; float dist = length(d)/mr; float a = atan(d.y,d.x);
    float leaf = exp(-dist*2.0)*0.8;
    float vein = abs(sin(a+1.57))*exp(-dist*1.5)*0.5;
    float sway = 0.9+0.1*sin(t*1.0+dist*3.0);
    vec3 col = p.rgb*leaf*sway + p.rgb*0.4*vein;
    return vec4(col, smoothstep(1.0,0.3,dist)*leaf);
}"""

NUM_PETALS = 7
PETAL_COLORS = [
    [1.0, 0.3, 0.4, 1],
    [1.0, 0.4, 0.5, 1],
    [0.9, 0.2, 0.4, 1],
    [1.0, 0.5, 0.6, 1],
    [0.95, 0.3, 0.35, 1],
    [1.0, 0.35, 0.45, 1],
    [0.85, 0.25, 0.4, 1],
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
while True:
    cycle += 1
    try:
        state = bridge()
        fields = {f["name"]: f for f in state.get("fields", [])}
        me = fields.get(MY_NAME)

        if not me:
            bridge(cmds={"type": "create_field", "name": MY_NAME,
                         "color": [0.9, 0.7, 0.1, 1],
                         "x": 380, "y": 280})
            print(f"[{MY_NAME} c{cycle}] Created flower center", flush=True)
            time.sleep(2)
            continue

        fid = me["id"]
        mx, my = me["transform"]["x"], me["transform"]["y"]
        t = cycle * 0.12
        cmds = []

        # Ensure center shader
        if not me.get("effects"):
            cmds.append({"type": "add_effect", "fieldId": fid, "glsl": CENTER_SHADER,
                         "description": "flower center", "blend": "additive", "author": MY_NAME})

        # Gentle sway
        cmds.append({"type": "set_velocity", "fieldId": fid,
                     "vx": math.sin(t*0.3)*0.3, "vy": math.cos(t*0.5)*0.2, "vr": 0.01})

        # Create petals
        for i in range(NUM_PETALS):
            pname = f"{MY_NAME}_Petal{i}"
            p = fields.get(pname)

            # Breathing bloom — petals move in and out
            bloom_phase = t * 0.5
            bloom_r = 22 + 6 * math.sin(bloom_phase + i * 0.3)
            base_angle = (2 * math.pi * i / NUM_PETALS)
            # Petals slowly rotate around center
            rot = t * 0.1
            angle = base_angle + rot

            tx = mx + math.cos(angle) * bloom_r
            ty = my + math.sin(angle) * bloom_r

            if not p:
                cmds.append({"type": "create_field", "name": pname,
                             "color": PETAL_COLORS[i % len(PETAL_COLORS)],
                             "x": tx, "y": ty})
                print(f"[{MY_NAME} c{cycle}] Created {pname}", flush=True)
            else:
                pid = p["id"]
                if not p.get("effects"):
                    cmds.append({"type": "add_effect", "fieldId": pid, "glsl": PETAL_SHADER,
                                 "description": f"petal {i}", "blend": "additive",
                                 "author": MY_NAME})

                # Chase target position
                px, py = p["transform"]["x"], p["transform"]["y"]
                dx, dy = tx - px, ty - py
                dd = math.sqrt(dx*dx + dy*dy)
                if dd > 1:
                    sp = min(dd * 0.25, 6)
                    aa = math.atan2(dy, dx)
                    # Rotate petal to face outward
                    petal_rot = angle - math.pi/2
                    cmds.append({"type": "set_velocity", "fieldId": pid,
                                 "vx": math.cos(aa)*sp, "vy": math.sin(aa)*sp})
                    cmds.append({"type": "set_rotation", "fieldId": pid,
                                 "rotation": petal_rot})

        # Create two leaves (stem children)
        for side, lx_off, ly_off, rot in [("L", -15, 25, 0.5), ("R", 15, 25, -0.5)]:
            lname = f"{MY_NAME}_Leaf{side}"
            lf = fields.get(lname)
            leaf_sway = math.sin(t * 0.8 + (0 if side == "L" else math.pi)) * 3

            tx = mx + lx_off + leaf_sway
            ty = my + ly_off

            if not lf:
                cmds.append({"type": "create_field", "name": lname,
                             "color": [0.2, 0.7, 0.2, 1],
                             "x": tx, "y": ty})
                print(f"[{MY_NAME} c{cycle}] Created {lname}", flush=True)
            else:
                lid = lf["id"]
                if not lf.get("effects"):
                    cmds.append({"type": "add_effect", "fieldId": lid, "glsl": LEAF_SHADER,
                                 "description": f"leaf {side}", "blend": "additive",
                                 "author": MY_NAME})
                lpx, lpy = lf["transform"]["x"], lf["transform"]["y"]
                ddx, ddy = tx - lpx, ty - lpy
                dd = math.sqrt(ddx*ddx + ddy*ddy)
                if dd > 1:
                    sp = min(dd * 0.2, 5)
                    aa = math.atan2(ddy, ddx)
                    cmds.append({"type": "set_velocity", "fieldId": lid,
                                 "vx": math.cos(aa)*sp, "vy": math.sin(aa)*sp})
                cmds.append({"type": "set_rotation", "fieldId": lid, "rotation": rot + leaf_sway * 0.05})

        if cmds:
            bridge(cmds=cmds)
            parts = [k for k in fields if k.startswith(MY_NAME + "_")]
            print(f"[{MY_NAME} c{cycle}] ({mx:.0f},{my:.0f}) parts={len(parts)} cmds={len(cmds)}", flush=True)

    except Exception as e:
        print(f"[{MY_NAME} c{cycle}] ERROR: {e}", flush=True)

    time.sleep(2)
