#!/usr/bin/env python3
"""Generate an Excalidraw architecture diagram for the competition platform infra."""
import json, random

elements = []
_seed = [1000]
def nonce():
    _seed[0] += 1
    return _seed[0]

def base(**kw):
    e = dict(isDeleted=False, fillStyle="solid", strokeWidth=2, strokeStyle="solid",
             roughness=1, opacity=100, angle=0, strokeColor="#1e1e1e",
             backgroundColor="transparent", seed=nonce(), version=1, versionNonce=nonce(),
             groupIds=[], frameId=None, roundness=None, boundElements=[], updated=1,
             link=None, locked=False)
    e.update(kw)
    return e

def rect(id, x, y, w, h, fill, stroke="#1e1e1e"):
    elements.append(base(type="rectangle", id=id, x=x, y=y, width=w, height=h,
                         backgroundColor=fill, strokeColor=stroke,
                         roundness={"type": 3}))

def text(id, x, y, w, s, size=16, color="#1e1e1e", align="center", bold_lines=0):
    lines = s.count("\n") + 1
    h = lines * size * 1.25
    elements.append(base(type="text", id=id, x=x, y=y, width=w, height=h,
                         strokeColor=color, fontSize=size, fontFamily=1, text=s,
                         textAlign=align, verticalAlign="top", containerId=None,
                         originalText=s, lineHeight=1.25))

def box(id, x, y, w, h, fill, title, desc, stroke="#1e1e1e", tcolor="#1e1e1e"):
    rect(id, x, y, w, h, fill, stroke)
    # title
    text(id+"_t", x+8, y+12, w-16, title, size=18, color=tcolor)
    # description (smaller, below title)
    if desc:
        text(id+"_d", x+8, y+42, w-16, desc, size=13, color="#343a40")

def arrow(x1, y1, x2, y2, color="#1e1e1e", dashed=False, width=2):
    elements.append(base(type="arrow", x=x1, y=y1,
                         width=abs(x2-x1), height=abs(y2-y1),
                         strokeColor=color, strokeWidth=width,
                         strokeStyle="dashed" if dashed else "solid",
                         roundness={"type": 2},
                         points=[[0, 0], [x2-x1, y2-y1]],
                         startBinding=None, endBinding=None, lastCommittedPoint=None,
                         startArrowhead=None, endArrowhead="arrow"))

def label(x, y, s, size=13, color="#1e1e1e", w=220, align="left"):
    text("lbl"+str(nonce()), x, y, w, s, size=size, color=color, align=align)

# ---- palette ----
BLUE="#a5d8ff"; GREEN="#b2f2bb"; YELLOW="#ffec99"; RED="#ffc9c9"
VIOLET="#d0bfff"; GREY="#e9ecef"; TEAL="#96f2d7"; ORANGE="#ffd8a8"

# ===== Title =====
text("title", 60, 30, 1180, "Competition Platform — Infrastructure Design", size=28, align="left")
text("subtitle", 60, 70, 1180,
     "Real-time WebSocket competition platform · type-safe end-to-end · RLS-enforced",
     size=14, color="#495057", align="left")

# ===== Clients row =====
text("clients_h", 60, 120, 300, "CLIENTS (browser)", size=14, color="#868e96", align="left")
box("c1", 60, 150, 270, 78, GREY, "Organizer cockpit", "Create/run competitions,\nscores, live, simulation")
box("c2", 350, 150, 270, 78, GREY, "Judge (mobile)", "Token link, offline-safe\nscore submission")
box("c3", 640, 150, 270, 78, GREY, "Presenter", "Bracket / standings\nbroadcast view")
box("c4", 930, 150, 270, 78, GREY, "Public audience", "Live standings &\nbracket (read-only)")

# ===== Auth (Clerk) — right column spanning =====
box("clerk", 980, 300, 220, 110, VIOLET, "Clerk  (Auth)",
    "Multi-step email/password.\nIssues JWT. RLS identity =\nclerkUserId. LOGIN WORKS.", stroke="#7048e8")

# ===== Web (Vercel) =====
box("web", 60, 300, 600, 110, BLUE, "Next.js 16 Web  ·  Vercel",
    "App Router · RSC + client islands · next-intl (en/es) · Turbopack.\n"
    "proxy.ts middleware protects /dashboard, /competitions.  Dev port :3000", stroke="#1971c2")

# ===== API (Fly.io) =====
box("api", 60, 470, 600, 150, GREEN, "NestJS 11 API  ·  Fly.io   (modular monolith, :3001)",
    "", stroke="#2f9e44")
# module chips inside api
rect("m1", 80, 520, 180, 40, "#d3f9d8", "#2f9e44")
text("m1t", 80, 532, 180, "tRPC routers", size=13)
rect("m2", 270, 520, 180, 40, "#d3f9d8", "#2f9e44")
text("m2t", 270, 532, 180, "Socket.IO gateways", size=13)
rect("m3", 460, 520, 180, 40, "#d3f9d8", "#2f9e44")
text("m3t", 460, 532, 180, "Auth / RLS helper", size=13)
rect("m4", 80, 570, 270, 38, "#d3f9d8", "#2f9e44")
text("m4t", 80, 581, 270, "format-sdk  (plugin contract)", size=13)
rect("m5", 360, 570, 280, 38, "#d3f9d8", "#2f9e44")
text("m5t", 360, 581, 280, "packages/formats (Cypher, Bracket)", size=13)

# ===== CI/CD =====
box("ci", 700, 470, 230, 150, ORANGE, "GitHub Actions",
    "ci.yml: lint · typecheck ·\nunit · build.\ntest.yml: Playwright + burn-in.\ndeploy.yml → Fly (gated).", stroke="#e8590c")

# ===== Data row =====
box("pg", 60, 690, 360, 110, YELLOW, "PostgreSQL 16/17",
    "Neon (prod) · local Docker (dev, :5432).\nDrizzle ORM · RLS via\nsession.current_organizer_id", stroke="#f08c00")
box("redis", 470, 690, 360, 110, RED, "Redis 7",
    "Upstash (prod) · local Docker (dev, :6379).\nSocket.IO adapter (pub/sub) +\nephemeral state", stroke="#e03131")

# ===== Arrows =====
# clients -> web
arrow(195, 228, 300, 300, color="#1971c2")
# clients -> clerk (login)
arrow(1090, 228, 1090, 300, color="#7048e8")
# clients -> API (tRPC + WS) — the CORS path (highlight red)
arrow(700, 228, 480, 470, color="#e03131", width=3)
# web -> clerk (session)
arrow(660, 350, 980, 350, color="#7048e8", dashed=True)
# web -> api (server fetch / tRPC)
arrow(360, 410, 360, 470, color="#2f9e44")
# api -> clerk (verify jwt)
arrow(660, 520, 980, 400, color="#7048e8", dashed=True)
# api -> postgres
arrow(240, 620, 240, 690, color="#f08c00", width=3)
# api -> redis
arrow(520, 620, 620, 690, color="#e03131", width=3)
# ci -> web (deploy) and ci -> api
arrow(760, 470, 660, 410, color="#e8590c", dashed=True)
arrow(720, 470, 660, 540, color="#e8590c", dashed=True)

# ===== Arrow captions =====
label(180, 250, "HTTPS / RSC", color="#1971c2", w=120)
label(1095, 250, "Sign in (JWT)", color="#7048e8", w=140)
label(560, 300, "tRPC + WebSocket  ⟂  CORS gate", color="#e03131", w=300, size=14)
label(700, 322, "session", color="#7048e8", w=120)
label(250, 432, "tRPC", color="#2f9e44", w=80)
label(700, 452, "verify JWT", color="#7048e8", w=120)
label(120, 648, "Drizzle + RLS", color="#f08c00", w=160)
label(540, 648, "Socket.IO adapter", color="#e03131", w=180)
label(660, 430, "deploy", color="#e8590c", w=80)

# ===== CORS callout (the fix) =====
rect("cors", 900, 250, 320, 36, "#fff5f5", "#e03131")
text("cors_t", 905, 258, 310,
     "FIX: dev CORS now allows any localhost port", size=13, color="#c92a2a")

# ===== Local dev ports note =====
rect("ports", 60, 850, 1160, 70, "#f1f3f5", "#adb5bd")
text("ports_t", 75, 860, 1140,
     "LOCAL DEV PORTS   —   web :3000   ·   API :3001   ·   Postgres :5432   ·   Redis :6379   ·   "
     "langfuse remapped 3000 → 3010 (was colliding with web)", size=14, color="#495057", align="left")
text("ports_t2", 75, 890, 1140,
     "Root cause of breakage: API CORS was pinned to :3000; langfuse squatted :3000, pushing web to another "
     "port → every tRPC/WS call blocked (login = Clerk, exempt). Now fixed at both layers.",
     size=12, color="#868e96", align="left")

doc = {"type": "excalidraw", "version": 2, "source": "https://excalidraw.com",
       "elements": elements,
       "appState": {"viewBackgroundColor": "#ffffff", "gridSize": None},
       "files": {}}

out = "/Users/dragonarka/git/competition-platform/dashboard/infra-architecture.excalidraw"
with open(out, "w") as f:
    json.dump(doc, f, indent=2)
print("wrote", out, "with", len(elements), "elements")
