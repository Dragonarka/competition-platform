#!/usr/bin/env python3
"""Lightweight .excalidraw -> SVG renderer (rect / text / arrow only) for preview."""
import json, html, math

d = json.load(open("/Users/dragonarka/git/competition-platform/dashboard/infra-architecture.excalidraw"))
els = d["elements"]

xs, ys = [], []
for e in els:
    xs += [e["x"], e["x"] + e.get("width", 0)]
    ys += [e["y"], e["y"] + e.get("height", 0)]
minx, maxx = min(xs) - 20, max(xs) + 20
miny, maxy = min(ys) - 20, max(ys) + 20
W, H = maxx - minx, maxy - miny

out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
       f'viewBox="{minx} {miny} {W} {H}" font-family="Comic Sans MS, Segoe Print, cursive">']
out.append(f'<rect x="{minx}" y="{miny}" width="{W}" height="{H}" fill="#ffffff"/>')
out.append('<defs>')
for cid, col in [("a", "#1e1e1e"), ("b", "#e03131"), ("c", "#7048e8"),
                 ("d", "#1971c2"), ("e", "#2f9e44"), ("f", "#f08c00"), ("g", "#e8590c")]:
    out.append(f'<marker id="ah{cid}" markerWidth="10" markerHeight="10" refX="8" refY="3" '
               f'orient="auto" markerUnits="strokeWidth"><path d="M0,0 L8,3 L0,6 Z" fill="{col}"/></marker>')
out.append('</defs>')
COLMAP = {"#1e1e1e": "a", "#e03131": "b", "#7048e8": "c", "#1971c2": "d",
          "#2f9e44": "e", "#f08c00": "f", "#e8590c": "g"}

def esc(s):
    return html.escape(s)

# rectangles first
for e in els:
    if e["type"] == "rectangle":
        out.append(f'<rect x="{e["x"]}" y="{e["y"]}" width="{e["width"]}" height="{e["height"]}" '
                   f'rx="8" fill="{e["backgroundColor"]}" stroke="{e["strokeColor"]}" stroke-width="2"/>')
# arrows
for e in els:
    if e["type"] == "arrow":
        x1, y1 = e["x"], e["y"]
        dx, dy = e["points"][-1]
        x2, y2 = x1 + dx, y1 + dy
        col = e["strokeColor"]
        m = COLMAP.get(col, "a")
        dash = ' stroke-dasharray="6 5"' if e.get("strokeStyle") == "dashed" else ""
        out.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{col}" '
                   f'stroke-width="{e.get("strokeWidth",2)}"{dash} marker-end="url(#ah{m})"/>')
# text
for e in els:
    if e["type"] == "text":
        size = e["fontSize"]
        col = e["strokeColor"]
        align = e.get("textAlign", "left")
        anchor = {"left": "start", "center": "middle", "right": "end"}[align]
        tx = e["x"] + (e["width"] / 2 if align == "center" else (e["width"] if align == "right" else 0))
        for i, line in enumerate(e["text"].split("\n")):
            ty = e["y"] + size * (1.0 + i * 1.25)
            weight = "bold" if size >= 18 else "normal"
            out.append(f'<text x="{tx}" y="{ty}" font-size="{size}" fill="{col}" '
                       f'text-anchor="{anchor}" font-weight="{weight}">{esc(line)}</text>')
out.append('</svg>')
open("/Users/dragonarka/git/competition-platform/dashboard/infra-architecture.svg", "w").write("\n".join(out))
print("wrote infra-architecture.svg", W, "x", H)
