/* ============================================================
   LIVE PLATE — mode/draw-sel.js（02 DRAW の SEL：持ち上げて変形。SPEC_21 §7-2 / SPEC_20 §1-7）
   正準：animator.html（econte gFloat の移植・SPEC_20 §7-8）。形の持ち方＝**箱(x,y,w,h)+rot+warp{u,v}**（箱ローカルの正規化座標）。
     ドラッグ＝投げ縄／Shift＋ドラッグ＝矩形で持ち上げる → 中＝移動・隅＝拡縮（Shift＝縦横比）・Ctrl＋隅＝自由変形・
     隅の外＝回転（Shift＝15°）・WARP（A を2回）＝4×4 の格子。Enter／Wクリック＝確定・Esc＝取消。
   ★ 確定は AA OFF（既定）なら flBakeNearest＝1px ずつ逆写像して元の画素だけ拾う（半透明を作らない＝あとでバケツが途切れない）。
   ★ 持ち上げ〜確定で Undo 1手（持ち上げる前の紙を core/cells.js の txBegin で控える。取消は txAbort＝積まない）。
   ★ 座標はプレート px。ハンドルの大きさだけ画面 px（H.scale で割る）。
   ============================================================ */
var LP = window.LP || (window.LP = {});

(function(){
  'use strict';
  const HANDLE_PX = 9, ROT_PX = 42, WARP_N = 4;
  const FL_HANDLES = [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]];
  const D = () => LP.state.draw;
  const JP = { line: '線', fill: '塗' };
  let gFloat = null, gSelDraw = null, gClip = null, lastK = 1;

  function clamp(v, a, b){ return v < a ? a : (v > b ? b : v); }
  function cvs(w, h){ const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  /* --- 形（箱＋回転＋warp）: econte / animator と同じ式 --- */
  function flAxes(g){ const c = Math.cos(g.rot || 0), s = Math.sin(g.rot || 0); return { ex: { x: c, y: s }, ey: { x: -s, y: c } }; }
  function flCenter(g){ return { x: g.x + g.w / 2, y: g.y + g.h / 2 }; }
  function flBox(g, u, v){
    const c = Math.cos(g.rot || 0), s = Math.sin(g.rot || 0);
    const lx = (u - 0.5) * g.w, ly = (v - 0.5) * g.h;
    return { x: g.x + g.w / 2 + lx * c - ly * s, y: g.y + g.h / 2 + lx * s + ly * c };
  }
  function flToLocal(g, p){
    const c = Math.cos(g.rot || 0), s = Math.sin(g.rot || 0);
    const dx = p.x - (g.x + g.w / 2), dy = p.y - (g.y + g.h / 2);
    return { u: (dx * c + dy * s) / Math.max(1e-6, g.w) + 0.5, v: (-dx * s + dy * c) / Math.max(1e-6, g.h) + 0.5 };
  }
  function flHomo(g){
    if(g._h) return g._h;
    const W = g.warp, P0 = W[0], P1 = W[1], P3 = W[2], P2 = W[3];   // 0=TL 1=TR 2=BL 3=BR
    const dx1 = P1.u - P2.u, dy1 = P1.v - P2.v, dx2 = P3.u - P2.u, dy2 = P3.v - P2.v;
    const sx = P0.u - P1.u + P2.u - P3.u, sy = P0.v - P1.v + P2.v - P3.v;
    const den = dx1 * dy2 - dx2 * dy1;
    let gg = 0, hh = 0;
    if((Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) && Math.abs(den) > 1e-9){ gg = (sx * dy2 - dx2 * sy) / den; hh = (dx1 * sy - sx * dy1) / den; }
    g._h = { a: P1.u - P0.u + gg * P1.u, b: P3.u - P0.u + hh * P3.u, c: P0.u, d: P1.v - P0.v + gg * P1.v, e: P3.v - P0.v + hh * P3.v, f: P0.v, g: gg, h: hh };
    return g._h;
  }
  function flCr1(vals, t){
    const n = vals.length;
    if(n < 2) return vals[0] || 0;
    if(n === 2) return vals[0] + (vals[1] - vals[0]) * t;
    const s = clamp(t, 0, 1) * (n - 1);
    const i = Math.min(n - 2, Math.floor(s)), f = s - i;
    const at = k => (k < 0) ? 2 * vals[0] - vals[1] : (k > n - 1 ? 2 * vals[n - 1] - vals[n - 2] : vals[k]);
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    return 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
  }
  function flLocalWarp(g, u, v){
    if(!g.warp) return { u, v };
    if(g.wn === 2){
      const m = flHomo(g), w = m.g * u + m.h * v + 1, iw = Math.abs(w) < 1e-9 ? 1e9 : 1 / w;
      return { u: (m.a * u + m.b * v + m.c) * iw, v: (m.d * u + m.e * v + m.f) * iw };
    }
    const n = g.wn, ru = [], rv = [];
    for(let i = 0; i < n; i++){
      const ro = [], rw = [];
      for(let j = 0; j < n; j++){ ro.push(g.warp[i * n + j].u); rw.push(g.warp[i * n + j].v); }
      ru.push(flCr1(ro, u)); rv.push(flCr1(rw, u));
    }
    return { u: flCr1(ru, v), v: flCr1(rv, v) };
  }
  function flMap(g, u, v){ const l = flLocalWarp(g, u, v); return flBox(g, l.u, l.v); }
  function flEnsureWarp(g, n){
    if(g.warp && g.wn >= n) return;
    const old = g.warp ? (u, v) => flLocalWarp(g, u, v) : (u, v) => ({ u, v });
    const pts = [];
    for(let i = 0; i < n; i++) for(let j = 0; j < n; j++) pts.push(old(j / (n - 1), i / (n - 1)));
    g.warp = pts; g.wn = n; g._h = null;
  }
  function flCornerIndex(g, hx, hy){ const n = g.wn; return (hy === 0 ? 0 : n - 1) * n + (hx === 0 ? 0 : n - 1); }
  function flOutline(g, seg){
    const s = seg || 8, pts = [];
    for(let i = 0; i < s; i++) pts.push(flMap(g, i / s, 0));
    for(let i = 0; i < s; i++) pts.push(flMap(g, 1, i / s));
    for(let i = 0; i < s; i++) pts.push(flMap(g, 1 - i / s, 1));
    for(let i = 0; i < s; i++) pts.push(flMap(g, 0, 1 - i / s));
    return pts;
  }
  function flShapeBBox(g){
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for(let i = 0; i <= 8; i++) for(let j = 0; j <= 8; j++){
      const p = flMap(g, j / 8, i / 8);
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    }
    return { x0, y0, x1, y1 };
  }
  function flInside(g, bx, by){
    const p = flOutline(g, 8);
    let hit = false;
    for(let i = 0, j = p.length - 1; i < p.length; j = i++){
      if((p[i].y > by) !== (p[j].y > by) && bx < (p[j].x - p[i].x) * (by - p[i].y) / (p[j].y - p[i].y) + p[i].x) hit = !hit;
    }
    return hit;
  }
  /* 表示用（canvas に描かせる＝速い） */
  function flDrawTri(ctx, img, s, d){
    const den = s[0].x * (s[2].y - s[1].y) + s[1].x * (s[0].y - s[2].y) + s[2].x * (s[1].y - s[0].y);
    if(Math.abs(den) < 1e-9) return;
    const m11 = (d[0].x * (s[2].y - s[1].y) + d[1].x * (s[0].y - s[2].y) + d[2].x * (s[1].y - s[0].y)) / den;
    const m12 = (d[0].y * (s[2].y - s[1].y) + d[1].y * (s[0].y - s[2].y) + d[2].y * (s[1].y - s[0].y)) / den;
    const m21 = (d[0].x * (s[1].x - s[2].x) + d[1].x * (s[2].x - s[0].x) + d[2].x * (s[0].x - s[1].x)) / den;
    const m22 = (d[0].y * (s[1].x - s[2].x) + d[1].y * (s[2].x - s[0].x) + d[2].y * (s[0].x - s[1].x)) / den;
    const dx = (d[0].x * (s[2].x * s[1].y - s[1].x * s[2].y) + d[1].x * (s[0].x * s[2].y - s[2].x * s[0].y) + d[2].x * (s[1].x * s[0].y - s[0].x * s[1].y)) / den;
    const dy = (d[0].y * (s[2].x * s[1].y - s[1].x * s[2].y) + d[1].y * (s[0].x * s[2].y - s[2].x * s[0].y) + d[2].y * (s[1].x * s[0].y - s[0].x * s[1].y)) / den;
    const cx = (d[0].x + d[1].x + d[2].x) / 3, cy = (d[0].y + d[1].y + d[2].y) / 3;
    ctx.save();
    ctx.beginPath();
    for(let i = 0; i < 3; i++){
      const vx = d[i].x - cx, vy = d[i].y - cy, len = Math.hypot(vx, vy) || 1;
      const x = d[i].x + vx / len * 0.45, y = d[i].y + vy / len * 0.45;
      if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.clip();
    ctx.transform(m11, m12, m21, m22, dx, dy);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }
  function flMeshSub(g){ return !g.warp ? 1 : (g.wn === 2 ? 10 : 14); }
  function flPaint(ctx, g, cv, smooth){
    ctx.save();
    ctx.imageSmoothingEnabled = !!smooth;
    if(smooth) ctx.imageSmoothingQuality = 'high';
    if(!g.warp){
      const p0 = flMap(g, 0, 0), p1 = flMap(g, 1, 0), p3 = flMap(g, 0, 1);
      ctx.transform((p1.x - p0.x) / cv.width, (p1.y - p0.y) / cv.width, (p3.x - p0.x) / cv.height, (p3.y - p0.y) / cv.height, p0.x, p0.y);
      ctx.drawImage(cv, 0, 0);
    }else{
      const sub = flMeshSub(g), P = [];
      for(let i = 0; i <= sub; i++){ const row = []; for(let j = 0; j <= sub; j++) row.push(flMap(g, j / sub, i / sub)); P.push(row); }
      const W = cv.width, H = cv.height;
      for(let i = 0; i < sub; i++) for(let j = 0; j < sub; j++){
        const u0 = j / sub * W, u1 = (j + 1) / sub * W, v0 = i / sub * H, v1 = (i + 1) / sub * H;
        const s00 = { x: u0, y: v0 }, s10 = { x: u1, y: v0 }, s11 = { x: u1, y: v1 }, s01 = { x: u0, y: v1 };
        flDrawTri(ctx, cv, [s00, s10, s11], [P[i][j], P[i][j + 1], P[i + 1][j + 1]]);
        flDrawTri(ctx, cv, [s00, s11, s01], [P[i][j], P[i + 1][j + 1], P[i + 1][j]]);
      }
    }
    ctx.restore();
  }
  /* 確定用（AA OFF）：1px ずつ逆写像して元の画素をそのまま拾う（animator flBakeNearest） */
  function flBakeNearest(dstCtx, g, srcCv){
    const W = dstCtx.canvas.width, H = dstCtx.canvas.height;
    const bb = flShapeBBox(g);
    const bx0 = Math.max(0, Math.floor(bb.x0) - 1), by0 = Math.max(0, Math.floor(bb.y0) - 1);
    const bx1 = Math.min(W, Math.ceil(bb.x1) + 1), by1 = Math.min(H, Math.ceil(bb.y1) + 1);
    const bw = bx1 - bx0, bh = by1 - by0;
    if(bw <= 0 || bh <= 0) return;
    const sw = srcCv.width, sh = srcCv.height;
    const sd = srcCv.getContext('2d').getImageData(0, 0, sw, sh).data;
    const dst = dstCtx.getImageData(bx0, by0, bw, bh), dd = dst.data;
    const done = new Uint8Array(bw * bh);
    const sub = flMeshSub(g), P = [];
    for(let i = 0; i <= sub; i++){ const row = []; for(let j = 0; j <= sub; j++) row.push(flMap(g, j / sub, i / sub)); P.push(row); }
    const tri = (a, b, c, sa, sb, sc) => {
      const den = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
      if(Math.abs(den) < 1e-12) return;
      const minx = Math.max(bx0, Math.floor(Math.min(a.x, b.x, c.x))), maxx = Math.min(bx1 - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
      const miny = Math.max(by0, Math.floor(Math.min(a.y, b.y, c.y))), maxy = Math.min(by1 - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
      for(let py = miny; py <= maxy; py++){
        const Y = py + 0.5;
        for(let px = minx; px <= maxx; px++){
          const X = px + 0.5;
          const l0 = ((b.y - c.y) * (X - c.x) + (c.x - b.x) * (Y - c.y)) / den;
          const l1 = ((c.y - a.y) * (X - c.x) + (a.x - c.x) * (Y - c.y)) / den;
          const l2 = 1 - l0 - l1;
          if(l0 < -1e-9 || l1 < -1e-9 || l2 < -1e-9) continue;
          const q = (py - by0) * bw + (px - bx0);
          if(done[q]) continue;
          done[q] = 1;
          const ix = clamp(Math.floor(l0 * sa.x + l1 * sb.x + l2 * sc.x), 0, sw - 1);
          const iy = clamp(Math.floor(l0 * sa.y + l1 * sb.y + l2 * sc.y), 0, sh - 1);
          const si = (iy * sw + ix) * 4;
          if(sd[si + 3] === 0) continue;
          const di = q * 4;
          dd[di] = sd[si]; dd[di + 1] = sd[si + 1]; dd[di + 2] = sd[si + 2]; dd[di + 3] = sd[si + 3];
        }
      }
    };
    for(let i = 0; i < sub; i++) for(let j = 0; j < sub; j++){
      const u0 = j / sub * sw, u1 = (j + 1) / sub * sw, v0 = i / sub * sh, v1 = (i + 1) / sub * sh;
      tri(P[i][j], P[i][j + 1], P[i + 1][j + 1], { x: u0, y: v0 }, { x: u1, y: v0 }, { x: u1, y: v1 });
      tri(P[i][j], P[i + 1][j + 1], P[i + 1][j], { x: u0, y: v0 }, { x: u1, y: v1 }, { x: u0, y: v1 });
    }
    dstCtx.putImageData(dst, bx0, by0);
  }

  /* --- 持ち上げ --- */
  function lift(pts, tg, copy){
    const b = tg.cell && LP.cells.get(tg.cell.id);
    if(!b){ LP.ui.toast('セルを読み込み中です…もう一度'); return; }
    const W = b.w, H = b.h;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    pts.forEach(p => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); });
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(W, Math.ceil(x1) + 1); y1 = Math.min(H, Math.ceil(y1) + 1);
    const w = x1 - x0, h = y1 - y0;
    if(w < 2 || h < 2) return;
    let lanes = D().selBoth ? ['line', 'fill'] : [D().lane];
    const locked = lanes.filter(l => tg.plate.lanes && tg.plate.lanes[l] && tg.plate.lanes[l].locked);
    if(locked.length){ LP.ui.toast('🔒 ' + locked.map(l => JP[l]).join('・') + 'レーンはロック中'); return; }
    const mask = LP.paint.polyMask(pts, x0, y0, w, h);
    const out = {}, ids = {};
    for(const l of lanes){
      if(!b[l]) continue;
      const id = b[l].getContext('2d').getImageData(x0, y0, w, h), d = id.data;
      const o = new ImageData(w, h), od = o.data;
      let ink = false;
      for(let q = 0; q < mask.length; q++){
        if(!mask[q]) continue;
        const i = q * 4;
        if(!d[i + 3]) continue;
        od[i] = d[i]; od[i + 1] = d[i + 1]; od[i + 2] = d[i + 2]; od[i + 3] = d[i + 3];
        ink = true;
      }
      if(!ink) continue;
      const cv = cvs(w, h); cv.getContext('2d').putImageData(o, 0, 0);
      out[l] = cv; ids[l] = id;
    }
    lanes = lanes.filter(l => out[l]);
    if(!lanes.length){ LP.ui.toast('選んだ範囲に画がありません（' + (D().selBoth ? '線+塗' : JP[D().lane] + 'レーン') + '）'); return; }
    LP.cells.txBegin();
    lanes.forEach(l => LP.cells.txTouchAll(b, l));   // 持ち上げる前の紙を控える＝確定まで1手
    gFloat = { b, plateId: tg.plate.id, cellId: b.cellId, lanes, cvs: out, x: x0, y: y0, w, h, rot: 0, warp: null, wn: 0, _h: null, drag: null };
    if(!copy){
      for(const l of lanes){
        const d = ids[l].data;
        for(let q = 0; q < mask.length; q++) if(mask[q]) d[q * 4 + 3] = 0;
        b[l].getContext('2d').putImageData(ids[l], x0, y0);
      }
    }
    if(D().selWarp) flEnsureWarp(gFloat, WARP_N);
    LP.stage.renderQ(); LP.stage.renderOv(); LP.dock.render();
    LP.ui.toast((copy ? 'コピー' : '切り取り') + '（' + lanes.map(l => JP[l]).join('+') + '）：隅=拡縮／Ctrl+隅=自由変形／隅の外=回転／Enter 確定・Esc 取消');
  }

  /* --- 当たり判定・ドラッグ --- */
  function hitTest(p){
    const g = gFloat;
    if(!g) return null;
    const k = lastK, hp = (HANDLE_PX * 0.75 + 3) / k;
    if(g.warp && g.wn > 2 && D().selWarp){
      const n = g.wn;
      for(let i = 0; i < n * n; i++){
        const r = (i / n) | 0, c = i % n;
        if((r === 0 || r === n - 1) && (c === 0 || c === n - 1)) continue;
        const q = flBox(g, g.warp[i].u, g.warp[i].v);
        if(Math.abs(p.x - q.x) <= hp && Math.abs(p.y - q.y) <= hp) return { type: 'warp', i };
      }
    }
    for(let i = 0; i < FL_HANDLES.length; i++){
      const q = flMap(g, FL_HANDLES[i][0], FL_HANDLES[i][1]);
      if(Math.abs(p.x - q.x) <= hp && Math.abs(p.y - q.y) <= hp) return { type: 'scale', i };
    }
    if(flInside(g, p.x, p.y)) return { type: 'move' };
    const rp = ROT_PX / k;
    for(const [hx, hy] of [[0, 0], [1, 0], [1, 1], [0, 1]]){ const q = flMap(g, hx, hy); if(Math.hypot(p.x - q.x, p.y - q.y) <= rp) return { type: 'rotate' }; }
    return null;
  }
  function dragStart(hit, p, e){
    const g = gFloat;
    if(hit.type === 'warp'){ g.drag = { type: 'warp', i: hit.i }; return; }
    if(hit.type === 'rotate'){ const c = flCenter(g); g.drag = { type: 'rotate', a0: Math.atan2(p.y - c.y, p.x - c.x), rot0: g.rot }; return; }
    if(hit.type === 'scale'){
      const hx = FL_HANDLES[hit.i][0], hy = FL_HANDLES[hit.i][1];
      if(e && (e.ctrlKey || e.metaKey) && hx !== 0.5 && hy !== 0.5){ flEnsureWarp(g, 2); g.drag = { type: 'warp', i: flCornerIndex(g, hx, hy) }; return; }
      const qa = flLocalWarp(g, 1 - hx, 1 - hy), qh = flLocalWarp(g, hx, hy);
      g.drag = { type: 'scale', qa, A: flBox(g, qa.u, qa.v), du: qh.u - qa.u, dv: qh.v - qa.v, w: g.w, h: g.h };
      return;
    }
    g.drag = { type: 'move', sx: p.x, sy: p.y, x: g.x, y: g.y };
  }
  function dragMove(p, shift){
    const g = gFloat;
    if(!g || !g.drag) return;
    const d = g.drag;
    if(d.type === 'move'){ g.x = d.x + (p.x - d.sx); g.y = d.y + (p.y - d.sy); return; }
    if(d.type === 'warp'){ const l = flToLocal(g, p); g.warp[d.i] = { u: l.u, v: l.v }; g._h = null; return; }
    if(d.type === 'rotate'){
      const c = flCenter(g);
      let a = Math.atan2(p.y - c.y, p.x - c.x) - d.a0 + d.rot0;
      if(shift) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
      g.rot = a; return;
    }
    const ax = flAxes(g);
    const dx = p.x - d.A.x, dy = p.y - d.A.y;
    const pu = dx * ax.ex.x + dy * ax.ex.y, pv = dx * ax.ey.x + dy * ax.ey.y;
    let w = d.w, h = d.h;
    if(Math.abs(d.du) > 1e-6) w = Math.max(4, Math.abs(pu / d.du));
    if(Math.abs(d.dv) > 1e-6) h = Math.max(4, Math.abs(pv / d.dv));
    if(shift && Math.abs(d.du) > 1e-6 && Math.abs(d.dv) > 1e-6){
      const kx = w / d.w, ky = h / d.h, s = Math.max(0.02, Math.abs(kx - 1) > Math.abs(ky - 1) ? kx : ky);
      w = d.w * s; h = d.h * s;
    }
    const cx = d.A.x - ax.ex.x * ((d.qa.u - 0.5) * w) - ax.ey.x * ((d.qa.v - 0.5) * h);
    const cy = d.A.y - ax.ex.y * ((d.qa.u - 0.5) * w) - ax.ey.y * ((d.qa.v - 0.5) * h);
    g.w = w; g.h = h; g.x = cx - w / 2; g.y = cy - h / 2;
  }

  /* --- ポインタ（draw.js から。p＝プレート px） --- */
  function down(e, sp, p, tg, H){
    lastK = H.scale;
    if(gFloat){
      const hit = hitTest(p);
      if(hit){ dragStart(hit, p, e); return { kind: 'sel', float: true }; }
      commit(true);   // 形の外を押した＝確定して、新しく囲い始める
    }
    if(!tg.cell){ LP.ui.toast('このコマではこの層のセルが出ていません'); return { kind: 'none' }; }
    if(!LP.cells.get(tg.cell.id)){ LP.drawTools.sync(); LP.ui.toast('セルを読み込み中です…もう一度'); return { kind: 'none' }; }
    gSelDraw = { pts: [p], rect: !!e.shiftKey, start: p, copy: !!e.altKey, tg };
    return { kind: 'sel', float: false };
  }
  function move(e, sp, p, d, H){
    lastK = H.scale;
    if(d.float){ dragMove(p, e.shiftKey); LP.stage.renderOv(); return; }
    if(!gSelDraw) return;
    const q = gSelDraw.pts[gSelDraw.pts.length - 1];
    if(Math.hypot(p.x - q.x, p.y - q.y) > 2 / H.scale) gSelDraw.pts.push(p);
    LP.stage.renderOv();
  }
  function up(e, sp, p, d){
    if(d.float){ if(gFloat) gFloat.drag = null; LP.stage.renderOv(); return; }
    const s = gSelDraw;
    gSelDraw = null;
    if(!s){ LP.stage.renderOv(); return; }
    let pts = s.pts;
    if(s.rect){
      const a = s.start, b = pts[pts.length - 1];
      pts = [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }];
    }
    if(pts.length < 3){ LP.stage.renderOv(); return; }
    lift(pts, s.tg, s.copy);
  }
  function cursor(p){
    if(!gFloat) return 'crosshair';
    const hit = hitTest(p);
    if(!hit) return 'crosshair';
    if(hit.type === 'move') return 'move';
    if(hit.type === 'rotate') return 'alias';
    if(hit.type === 'warp') return 'crosshair';
    return 'nwse-resize';
  }
  function dbl(){ if(gFloat) commit(); }

  /* --- 表示（#cv-ov。書き出しには出ない） --- */
  function overlay(ctx, H){
    const v = H.view(), d = H.dpr, k = v.s;
    lastK = k;
    const C = LP.ui.CVC;
    ctx.save();
    ctx.setTransform(v.s * d, 0, 0, v.s * d, v.ox * d, v.oy * d);
    if(gSelDraw && gSelDraw.pts.length){
      const s = gSelDraw;
      ctx.lineWidth = 1.5 / k; ctx.setLineDash([6 / k, 4 / k]); ctx.strokeStyle = C.acc;
      ctx.beginPath();
      if(s.rect){ const a = s.start, b = s.pts[s.pts.length - 1]; ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); }
      else { ctx.moveTo(s.pts[0].x, s.pts[0].y); for(let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i].x, s.pts[i].y); ctx.closePath(); }
      ctx.stroke(); ctx.setLineDash([]);
    }
    const g = gFloat;
    if(g){
      for(const l of ['fill', 'line']) if(g.cvs[l]) flPaint(ctx, g, g.cvs[l], !!D().selAA);
      const hs = HANDLE_PX / k;
      const out = flOutline(g, 16);
      ctx.lineWidth = 1.5 / k; ctx.strokeStyle = C.acc; ctx.setLineDash([8 / k, 5 / k]);
      ctx.beginPath(); ctx.moveTo(out[0].x, out[0].y); for(let i = 1; i < out.length; i++) ctx.lineTo(out[i].x, out[i].y); ctx.closePath(); ctx.stroke();
      ctx.setLineDash([]);
      if(g.warp && g.wn > 2 && D().selWarp){
        ctx.strokeStyle = 'rgba(90,233,255,.55)'; ctx.lineWidth = 1 / k;
        for(let a = 1; a < g.wn - 1; a++) for(const dir of [0, 1]){
          ctx.beginPath();
          for(let t = 0; t <= 24; t++){ const u = dir ? t / 24 : a / (g.wn - 1), vv = dir ? a / (g.wn - 1) : t / 24; const q = flMap(g, u, vv); t ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }
          ctx.stroke();
        }
        ctx.fillStyle = C.pt;
        for(let i = 0; i < g.wn * g.wn; i++){
          const r = (i / g.wn) | 0, c = i % g.wn;
          if((r === 0 || r === g.wn - 1) && (c === 0 || c === g.wn - 1)) continue;
          const q = flBox(g, g.warp[i].u, g.warp[i].v);
          ctx.beginPath(); ctx.arc(q.x, q.y, hs * 0.42, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.fillStyle = C.acc; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.lineWidth = 1 / k;
      FL_HANDLES.forEach(([hx, hy]) => { const q = flMap(g, hx, hy); ctx.fillRect(q.x - hs / 2, q.y - hs / 2, hs, hs); ctx.strokeRect(q.x - hs / 2, q.y - hs / 2, hs, hs); });
      const lp = flMap(g, 0, 0), fs = 11 / k;
      ctx.font = 'bold ' + fs.toFixed(2) + 'px monospace'; ctx.textBaseline = 'bottom';
      const label = g.lanes.map(l => JP[l]).join('+') + (D().selAA ? ' / AA' : '') + (g.warp ? (g.wn > 2 ? ' / WARP' : ' / 自由変形') : '') + (g.rot ? ' / ' + Math.round(g.rot * 180 / Math.PI) + '°' : '');
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(lp.x, lp.y - fs * 1.7, tw + fs * 0.6, fs * 1.5);
      ctx.fillStyle = C.mark; ctx.fillText(label, lp.x + fs * 0.3, lp.y - fs * 0.35);
    }
    ctx.restore();
  }

  /* --- 確定・取消 --- */
  function commit(silent){
    const g = gFloat;
    if(!g) return false;
    gFloat = null;
    for(const l of g.lanes){
      const src = g.cvs[l];
      if(!src) continue;
      const ctx = LP.cells.laneCanvas(g.b, l, true).getContext('2d');
      if(D().selAA) flPaint(ctx, g, src, true);
      else flBakeNearest(ctx, g, src);
    }
    LP.cells.txEnd('変形（' + g.lanes.map(l => JP[l]).join('+') + '）');
    LP.drawTools.afterPixels(); LP.stage.renderOv(); LP.dock.render();
    if(!silent) LP.ui.toast('確定しました（Ctrl+Z で持ち上げる前に戻ります）');
    return true;
  }
  function cancel(){
    if(gSelDraw){ gSelDraw = null; LP.stage.renderOv(); return true; }
    const g = gFloat;
    if(!g) return false;
    gFloat = null;
    LP.cells.txAbort();
    LP.stage.renderQ(); LP.stage.renderOv(); LP.dock.render();
    LP.ui.toast('取り消しました');
    return true;
  }
  /* 他の操作へ移る前に紙へ落とす（PS と同じ：他のことをしたら確定） */
  function settle(){ if(gFloat) commit(true); if(gSelDraw){ gSelDraw = null; LP.stage.renderOv(); } }

  /* --- コピー／ペースト（同じ座標に浮かせる） --- */
  function copy(){
    const g = gFloat;
    if(!g){ LP.ui.toast('SEL で囲って持ち上げてから COPY（Ctrl+C）'); return; }
    const W = g.b.w, H = g.b.h, bb = flShapeBBox(g);
    const x0 = Math.max(0, Math.floor(bb.x0) - 1), y0 = Math.max(0, Math.floor(bb.y0) - 1);
    const x1 = Math.min(W, Math.ceil(bb.x1) + 1), y1 = Math.min(H, Math.ceil(bb.y1) + 1);
    const w = x1 - x0, h = y1 - y0;
    if(w < 1 || h < 1){ LP.ui.toast('範囲がプレートの外です'); return; }
    const full = cvs(W, H), fx = full.getContext('2d'), out = {};
    for(const l of g.lanes){
      fx.clearRect(0, 0, W, H);
      if(D().selAA) flPaint(fx, g, g.cvs[l], true); else flBakeNearest(fx, g, g.cvs[l]);
      const cv = cvs(w, h); cv.getContext('2d').drawImage(full, x0, y0, w, h, 0, 0, w, h);
      out[l] = cv;
    }
    gClip = { lanes: g.lanes.slice(), cvs: out, x: x0, y: y0, w, h };
    LP.dock.render();
    LP.ui.toast('コピーしました（' + w + '×' + h + '）— 別のセルで PASTE（Ctrl+V）');
  }
  function paste(){
    if(!gClip){ LP.ui.toast('コピーした形がありません（SEL で持ち上げて COPY）'); return; }
    settle();
    const tg = LP.drawTools.target(), b = tg && tg.cell && LP.cells.get(tg.cell.id);
    if(!b){ LP.ui.toast('貼るセルがありません'); return; }
    const locked = gClip.lanes.filter(l => tg.plate.lanes && tg.plate.lanes[l] && tg.plate.lanes[l].locked);
    if(locked.length){ LP.ui.toast('🔒 ' + locked.map(l => JP[l]).join('・') + 'レーンはロック中'); return; }
    const out = {};
    for(const l of gClip.lanes){ const cv = cvs(gClip.w, gClip.h); cv.getContext('2d').drawImage(gClip.cvs[l], 0, 0); out[l] = cv; }
    LP.cells.txBegin();
    gClip.lanes.forEach(l => LP.cells.txTouchAll(b, l));
    gFloat = { b, plateId: tg.plate.id, cellId: b.cellId, lanes: gClip.lanes.slice(), cvs: out, x: gClip.x, y: gClip.y, w: gClip.w, h: gClip.h, rot: 0, warp: null, wn: 0, _h: null, drag: null };
    if(D().selWarp) flEnsureWarp(gFloat, WARP_N);
    if(D().tool !== 'sel') LP.drawTools.setTool('sel', true);
    LP.stage.renderOv(); LP.dock.render();
    LP.ui.toast('同じ位置に貼りました（' + gFloat.lanes.map(l => JP[l]).join('+') + '）：Enter 確定・Esc 取消');
  }
  function toggleWarp(){
    const d = D();
    d.selWarp = !d.selWarp;
    if(d.selWarp && gFloat) flEnsureWarp(gFloat, WARP_N);
    LP.drawTools.savePrefs(); LP.stage.renderOv(); LP.dock.render();
    LP.ui.toast('WARP（3×3）: ' + (d.selWarp ? 'ON（格子の点をドラッグ）' : 'OFF'));
  }
  function toggleAA(){ const d = D(); d.selAA = !d.selAA; LP.drawTools.savePrefs(); LP.stage.renderOv(); LP.dock.render(); LP.ui.toast(d.selAA ? 'AA ON：なめらかに貼る' : 'AA OFF：アンチ無しのまま（色も変わらない）'); }
  function toggleBoth(){ const d = D(); if(gFloat) return; d.selBoth = !d.selBoth; LP.drawTools.savePrefs(); LP.dock.render(); LP.ui.toast(d.selBoth ? '線+塗：両レーンを同じ形で持ち上げる' : 'いまのレーンだけ持ち上げる'); }

  LP.drawSel = {
    down, move, up, cursor, dbl, overlay, commit, cancel, settle, copy, paste, toggleWarp, toggleAA, toggleBoth,
    floatCell: () => gFloat ? gFloat.cellId : null, get active(){ return !!gFloat; }, get hasClip(){ return !!gClip; },
  };
})();
