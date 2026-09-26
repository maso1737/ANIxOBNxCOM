/* ============================================================
   LIVE PLATE — core/geom.js（コマの幾何。正準は manga-plate.html §v2-2）
   コマ ＝ base（分割前の多角形）∩ cuts（半平面の列）。poly は毎回 cuts から作り直す
   ＝一度引いた分割線をあとから動かす／回すが成立する。
   ★ ビューアに**文字列で同梱**される（render.js と同じ扱い）。外を参照しない。
   ============================================================ */
var LP = window.LP || (window.LP = {});
LP.lib = LP.lib || {};

LP.lib.geom = function(){
  'use strict';

  function polyArea(p){ let a = 0; for(let i = 0; i < p.length; i++){ const q = p[(i + 1) % p.length]; a += p[i].x * q.y - q.x * p[i].y; } return Math.abs(a) / 2; }
  function polyBounds(p){
    let x0 = 1e12, y0 = 1e12, x1 = -1e12, y1 = -1e12;
    for(const q of p){ if(q.x < x0) x0 = q.x; if(q.y < y0) y0 = q.y; if(q.x > x1) x1 = q.x; if(q.y > y1) y1 = q.y; }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  function pointInPoly(p, x, y){
    let c = false;
    for(let i = 0, j = p.length - 1; i < p.length; j = i++){
      if((p[i].y > y) !== (p[j].y > y) && x < (p[j].x - p[i].x) * (y - p[i].y) / (p[j].y - p[i].y) + p[i].x) c = !c;
    }
    return c;
  }
  function rectPoly(r){ return [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }]; }
  /* 半平面 n·P <= d を残す（Sutherland–Hodgman） */
  function clipHalf(poly, nx, ny, d){
    const out = [];
    for(let i = 0; i < poly.length; i++){
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const da = nx * a.x + ny * a.y - d, db = nx * b.x + ny * b.y - d;
      if(da <= 0) out.push(a);
      if((da < 0 && db > 0) || (da > 0 && db < 0)){ const t = da / (da - db); out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); }
    }
    return out;
  }
  function cutD(c){ return c.nx * c.ax + c.ny * c.ay; }
  function applyCuts(poly, cuts){
    for(const c of cuts){
      poly = c.side > 0 ? clipHalf(poly, c.nx, c.ny, cutD(c) - c.gap / 2)
                        : clipHalf(poly, -c.nx, -c.ny, -(cutD(c) + c.gap / 2));
      if(poly.length < 3) return null;
    }
    return poly;
  }
  /* cuts から poly を作り直す。破綻したら false（k は書き換えない） */
  function rebuildPanel(k){
    if(!k.cuts || !k.cuts.length){ k.poly = k.base.map(q => ({ x: q.x, y: q.y })); return true; }
    const p = applyCuts(k.base.map(q => ({ x: q.x, y: q.y })), k.cuts);
    if(!p) return false;
    k.poly = p;
    return true;
  }
  /* 断ち切り：内枠（fr.bas）に接した頂点を紙（fr.edge）の端まで出す。
     base だけを広げて分割線は切り直す＝斜めの辺は自分の角度のまま端まで伸びる（manga-plate の修正版と同じ） */
  function outToEdge(p, fr){
    const b = fr.bas, e = fr.edge, E = Math.max(4, e.w * 0.006);
    return p.map(q => ({
      x: Math.abs(q.x - b.x) < E ? e.x : (Math.abs(q.x - (b.x + b.w)) < E ? e.x + e.w : q.x),
      y: Math.abs(q.y - b.y) < E ? e.y : (Math.abs(q.y - (b.y + b.h)) < E ? e.y + e.h : q.y) }));
  }
  function dispPoly(k, fr){
    if(!k.bleed || !fr) return k.poly;
    if(!k.cuts || !k.cuts.length) return outToEdge(k.poly, fr);
    return applyCuts(outToEdge(k.base, fr), k.cuts) || k.poly;
  }
  /* 読み順（右綴じ＝上の段から、同じ段は右が先）。コマ番号の表示に使う */
  function sortPanels(panels, h, bindRight){
    const band = h / 26, dir = bindRight === false ? 1 : -1;
    panels.sort((a, b) => {
      const A = polyBounds(a.poly), B = polyBounds(b.poly);
      const ra = Math.round(A.y / band), rb = Math.round(B.y / band);
      if(ra !== rb) return ra - rb;
      return (A.cx - B.cx) * dir;
    });
    return panels;
  }
  /* 分割線（同じ cut.id を共有するコマたち）と、その見える範囲 */
  function cutsOf(panels){
    const m = new Map();
    panels.forEach(k => (k.cuts || []).forEach(c => {
      if(!m.has(c.id)) m.set(c.id, { id: c.id, nx: c.nx, ny: c.ny, ax: c.ax, ay: c.ay, gap: c.gap, panels: [] });
      m.get(c.id).panels.push(k);
    }));
    return [...m.values()];
  }
  function cutSegment(cu){
    const dx = -cu.ny, dy = cu.nx;
    let t0 = 1e12, t1 = -1e12;
    cu.panels.forEach(k => k.poly.forEach(q => {
      const t = (q.x - cu.ax) * dx + (q.y - cu.ay) * dy;
      if(t < t0) t0 = t; if(t > t1) t1 = t;
    }));
    if(t0 > t1){ t0 = -200; t1 = 200; }
    return { x0: cu.ax + dx * t0, y0: cu.ay + dy * t0, x1: cu.ax + dx * t1, y1: cu.ay + dy * t1, dx: dx, dy: dy, t0: t0, t1: t1 };
  }
  function pathPoly(g, p){
    g.beginPath(); g.moveTo(p[0].x, p[0].y);
    for(let i = 1; i < p.length; i++) g.lineTo(p[i].x, p[i].y);
    g.closePath();
  }

  return { polyArea, polyBounds, pointInPoly, rectPoly, clipHalf, cutD, rebuildPanel, dispPoly, sortPanels, cutsOf, cutSegment, pathPoly };
};
LP.geom = LP.lib.geom();
