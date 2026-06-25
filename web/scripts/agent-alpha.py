#!/usr/bin/env python3
"""Alpha — Builds a solar system: sun body with orbiting planet children."""
import json, time, math, urllib.request

TOKEN = "engine-agent-dev-89230be3b2df362a"
BASE = "http://localhost:3000/api/engine/bridge"
MY_NAME = "Alpha"
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
    "Origin": "http://localhost:3000",
}

SUN_SHADER = """
vec4 fieldEffect(vec2 c, vec2 mn, vec2 mx, float t, vec4 p) {
    vec2 center = (mn+mx)*0.5; vec2 sz = mx-mn; float mr = max(sz.x,sz.y)*0.5;
    vec2 d = c-center; float dist = length(d)/mr; float a = atan(d.y,d.x);
    float pulse = sin(dist*8.0-t*2.0)*0.5+0.5;
    float glow = exp(-dist*2.0)*(0.9+0.1*sin(t*1.5));
    float corona = pow(abs(sin(a*5.0+t*0.7)), 3.0)*exp(-dist*1.2)*0.6;
    float flare = exp(-dist*4.0)*(0.8+0.2*sin(t*3.0));
    vec3 col = vec3(1.0,0.6,0.1)*glow + vec3(1.0,0.9,0.3)*pulse*exp(-dist*3.0);
    col += vec3(1.0,0.4,0.05)*corona + vec3(1.0,1.0,0.8)*flare;
    return vec4(col, smoothstep(1.0,0.1,dist)*(glow+0.3));
}"""

PLANET_SHADER = """
vec4 fieldEffect(vec2 c, vec2 mn, vec2 mx, float t, vec4 p) {
    vec2 center = (mn+mx)*0.5; vec2 sz = mx-mn; float mr = max(sz.x,sz.y)*0.5;
    vec2 d = c-center; float dist = length(d)/mr; float a = atan(d.y,d.x);
    float surface = 0.5+0.3*sin(a*3.0+d.x*0.2)*cos(d.y*0.15+t*0.3);
    float atmo = smoothstep(0.9,0.6,dist)*0.4;
    float core = exp(-dist*3.0)*0.8;
    vec3 col = mix(p.rgb*0.8, p.rgb*1.2, surface)*core;
    col += p.rgb*0.5*atmo;
    col += vec3(0.3,0.5,0.8)*exp(-dist*2.0)*0.2;
    return vec4(col, smoothstep(1.0,0.3,dist)*(core+atmo));
}"""

MOON_SHADER = """
vec4 fieldEffect(vec2 c, vec2 mn, vec2 mx, float t, vec4 p) {
    vec2 center = (mn+mx)*0.5; vec2 sz = mx-mn; float mr = max(sz.x,sz.y)*0.5;
    vec2 d = c-center; float dist = length(d)/mr;
    float glow = exp(-dist*2.5)*0.9;
    float shimmer = 0.8+0.2*sin(t*2.0+dist*6.0);
    vec3 col = p.rgb*glow*shimmer;
    return vec4(col, smoothstep(1.0,0.4,dist)*glow);
}"""

CHILDREN = [
    {"suffix": "P1", "color": [0.2, 0.6, 1.0, 1], "radius": 8, "orbit_r": 60, "orbit_speed": 0.4,  "shader": PLANET_SHADER},
    {"suffix": "P2", "color": [0.8, 0.3, 0.2, 1], "radius": 6, "orbit_r": 100, "orbit_speed": 0.25, "shader": PLANET_SHADER},
    {"suffix": "P3", "color": [0.3, 0.9, 0.4, 1], "radius": 5, "orbit_r": 140, "orbit_speed": 0.15, "shader": PLANET_SHADER},
    {"suffix": "Moon", "color": [0.7, 0.7, 0.8, 1], "radius": 3, "orbit_r": 20, "orbit_speed": 1.2,  "shader": MOON_SHADER, "parent_suffix": "P1"},
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
                         "color": [1, 0.6, 0.1, 1],
                         "x": 256, "y": 256})
            print(f"[{MY_NAME} c{cycle}] Created sun", flush=True)
            time.sleep(2)
            continue

        fid = me["id"]
        mx, my = me["transform"]["x"], me["transform"]["y"]
        cmds = []

        # Ensure sun shader
        if not me.get("effects"):
            cmds.append({"type": "add_effect", "fieldId": fid, "glsl": SUN_SHADER,
                         "description": "solar corona", "blend": "additive", "author": MY_NAME})

        # Slow drift around center
        t = cycle * 0.08
        cmds.append({"type": "set_velocity", "fieldId": fid,
                     "vx": math.sin(t)*0.5, "vy": math.cos(t)*0.5, "vr": 0.02})

        # Create and animate children
        for child in CHILDREN:
            cname = f"{MY_NAME}_{child['suffix']}"
            c = fields.get(cname)

            # Determine orbit center — either sun or another child
            if "parent_suffix" in child:
                parent_name = f"{MY_NAME}_{child['parent_suffix']}"
                parent = fields.get(parent_name)
                if not parent:
                    continue  # parent not created yet
                pcx, pcy = parent["transform"]["x"], parent["transform"]["y"]
                parent_id = parent["id"]
            else:
                pcx, pcy = mx, my
                parent_id = fid

            if not c:
                # Create child field parented to orbit center
                angle = len([x for x in CHILDREN if x["suffix"] <= child["suffix"]]) * 1.5
                cx = pcx + math.cos(angle) * child["orbit_r"]
                cy = pcy + math.sin(angle) * child["orbit_r"]
                cmds.append({"type": "create_field", "name": cname,
                             "color": child["color"], "x": cx, "y": cy})
                print(f"[{MY_NAME} c{cycle}] Created {cname}", flush=True)
            else:
                cid = c["id"]
                # Ensure shader
                if not c.get("effects"):
                    cmds.append({"type": "add_effect", "fieldId": cid, "glsl": child["shader"],
                                 "description": f"{child['suffix']} surface", "blend": "additive",
                                 "author": MY_NAME})

                # Orbit around parent
                angle = t * child["orbit_speed"]
                tx = pcx + math.cos(angle) * child["orbit_r"]
                ty = pcy + math.sin(angle) * child["orbit_r"]
                ccx, ccy = c["transform"]["x"], c["transform"]["y"]
                dx, dy = tx - ccx, ty - ccy
                dist = math.sqrt(dx*dx + dy*dy)
                if dist > 2:
                    speed = min(dist * 0.15, 8)
                    a = math.atan2(dy, dx)
                    cmds.append({"type": "set_velocity", "fieldId": cid,
                                 "vx": math.cos(a)*speed, "vy": math.sin(a)*speed,
                                 "vr": 0.05})

        if cmds:
            bridge(cmds=cmds)
            child_names = [f"{MY_NAME}_{c['suffix']}" for c in CHILDREN if f"{MY_NAME}_{c['suffix']}" in fields]
            print(f"[{MY_NAME} c{cycle}] ({mx:.0f},{my:.0f}) children={len(child_names)} cmds={len(cmds)}", flush=True)

    except Exception as e:
        print(f"[{MY_NAME} c{cycle}] ERROR: {e}", flush=True)

    time.sleep(3)
