/* ============================================================
   LIVE PLATE — core/paint.js（画素の道具。SPEC_21 §7-2 / SPEC_20 §1-3）
   正準：animator.html（fillCircleRows / bresenham / drawLineRadius / floodFill / lassoFillPolygon / selPolyMask）。
   数式と落とし穴はそのまま、canvas と色だけ引数で受け取る（state を読まない）。
   ★ アンチ無し（AA なし）。円は水平スパンで fillRect／clearRect（1px 毎判定と塗る画素は同じ・呼び出しは約2r回）
   ★ 座標は整数で渡す（bresenham は整数刻み。小数だと終点に届かない＝SPEC_20 §7-4）。入口で丸める。
   ============================================================ */
var LP = window.LP || (window.LP = {});

(function(){
  'use strict';
  const FILL_WALL_A = 128;   // 塗レーンの FILL が「壁」とみなす線レーンの α（animator と同値）

  function hexToRgb(hex){
    const h = String(hex || '#000000').replace('#', '');
    return { r: parseInt(h.substr(0, 2), 16) || 0, g: parseInt(h.substr(2, 2), 16) || 0, b: parseInt(h.substr(4, 2), 16) || 0 };
  }
  function rgbToHex(r, g, b){
    const c = n => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, '0');
    return ('#' + c(r) + c(g) + c(b)).toUpperCase();
  }

  /* 円を水平スパンで塗る（1行＝1矩形） */
  function fillCircleRows(x, y, r, row){
    const ir = Math.max(1, Math.round(r));
    const r2 = r * r;
    for(let dy = -ir; dy < ir; dy++){
      const ddy = dy + 0.5;
      const s2 = r2 - ddy * ddy;
      if(s2 <= 0) continue;
      const s = Math.sqrt(s2);
      const x0 = Math.max(-ir, Math.ceil(-s - 0.5));
      const x1 = Math.min(ir - 1, Math.floor(s - 0.5));
      if(x1 >= x0) row(x + x0, y + dy, x1 - x0 + 1);
    }
  }
  /* ブレゼンハム直線を1画素ずつ辿る。visit(x, y, t) t=進行度 0..1 */
  function bresenham(x0, y0, x1, y1, visit){
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    const steps = Math.max(dx, dy) || 1;
    let err = dx - dy, x = x0, y = y0, n = 0;
    while(true){
      visit(x, y, n / steps);
      if(x === x1 && y === y1) break;
      const e2 = 2 * err;
      if(e2 > -dy){ err -= dy; x += sx; }
      if(e2 < dx){ err += dx; y += sy; }
      n++;
    }
  }
  /* 任意半径の点（erase＝透明にする）。r ≤ 0.7 は 1px */
  function dot(ctx, x, y, r, erase){
    x = Math.round(x); y = Math.round(y);
    if(r <= 0.7){ erase ? ctx.clearRect(x, y, 1, 1) : ctx.fillRect(x, y, 1, 1); return; }
    fillCircleRows(x, y, r, erase ? (px, py, w) => ctx.clearRect(px, py, w, 1) : (px, py, w) => ctx.fillRect(px, py, w, 1));
  }
  /* 半径を線形補間しながら結ぶ（筆圧の入り抜き。animator drawLineRadius / eraseLineRadius） */
  function line(ctx, x0, y0, x1, y1, r0, r1, erase){
    bresenham(x0, y0, x1, y1, (x, y, t) => dot(ctx, x, y, r0 + (r1 - r0) * t, erase));
  }

  /* バケツ（スキャンライン）。SPEC_20 §1-3：
       wallCtx があれば「その α ≥ 128」が壁（塗レーンで塗るとき＝線レーン）。自分のバッファは同色の連続が領域。
       under（0〜3）だけ線の下へ膨らませる（線のアンチの縁に白い隙間を出さない）。伸ばす先は「線の上」か「まだ透明」だけ。
     戻り値：塗った矩形 { x0, y0, x1, y1 }（何も塗らなければ false）＝ Undo のタイルをその範囲だけにする */
  function floodFill(ctx, wallCtx, sx, sy, hex, opt){
    opt = opt || {};
    const W = ctx.canvas.width, H = ctx.canvas.height;
    sx = Math.floor(sx); sy = Math.floor(sy);
    if(sx < 0 || sy < 0 || sx >= W || sy >= H) return false;
    const img = ctx.getImageData(0, 0, W, H), data = img.data;
    let wall = null;
    if(wallCtx){
      const ld = wallCtx.getImageData(0, 0, W, H).data;
      wall = new Uint8Array(W * H);
      for(let i = 0, q = 0; q < wall.length; i += 4, q++) if(ld[i + 3] >= FILL_WALL_A) wall[q] = 1;
      if(wall[sy * W + sx]) return false;   // 線の上を突いたときは何もしない
    }
    const erase = !!opt.erase;
    const si = (sy * W + sx) * 4;
    const tR = data[si], tG = data[si + 1], tB = data[si + 2], tA = data[si + 3];
    const fc = erase ? { r: 0, g: 0, b: 0 } : hexToRgb(hex), fA = erase ? 0 : 255;
    if(erase){ if(tA === 0) return false; }
    else if(tR === fc.r && tG === fc.g && tB === fc.b && tA === 255) return false;
    const painted = wall ? new Uint8Array(W * H) : null;
    let bx0 = W, by0 = H, bx1 = -1, by1 = -1;
    const grow = (x, y) => { if(x < bx0) bx0 = x; if(x > bx1) bx1 = x; if(y < by0) by0 = y; if(y > by1) by1 = y; };
    const matches = i => !(wall && wall[i >> 2]) && data[i] === tR && data[i + 1] === tG && data[i + 2] === tB && data[i + 3] === tA;
    const stack = [[sx, sy]];
    while(stack.length){
      const [x, y] = stack.pop();
      let lx = x;
      while(lx >= 0 && matches((y * W + lx) * 4)) lx--;
      lx++;
      let up = false, dn = false;
      while(lx < W && matches((y * W + lx) * 4)){
        const i = (y * W + lx) * 4;
        data[i] = fc.r; data[i + 1] = fc.g; data[i + 2] = fc.b; data[i + 3] = fA;
        if(painted) painted[i >> 2] = 1;
        grow(lx, y);
        if(y > 0){ if(matches(i - W * 4)){ if(!up){ stack.push([lx, y - 1]); up = true; } } else up = false; }
        if(y < H - 1){ if(matches(i + W * 4)){ if(!dn){ stack.push([lx, y + 1]); dn = true; } } else dn = false; }
        lx++;
      }
    }
    const under = wall && !erase ? Math.max(0, Math.min(3, opt.under | 0)) : 0;
    if(under > 0){
      let cur = painted;
      for(let step = 0; step < under; step++){
        const next = new Uint8Array(cur);
        for(let y = 0; y < H; y++){
          for(let x = 0; x < W; x++){
            const q = y * W + x;
            if(cur[q]) continue;
            const i = q * 4;
            if(!(wall[q] || data[i + 3] === 0)) continue;
            if((x > 0 && cur[q - 1]) || (x < W - 1 && cur[q + 1]) || (y > 0 && cur[q - W]) || (y < H - 1 && cur[q + W])){
              next[q] = 1;
              data[i] = fc.r; data[i + 1] = fc.g; data[i + 2] = fc.b; data[i + 3] = fA;
              grow(x, y);
            }
          }
        }
        cur = next;
      }
    }
    if(bx1 < 0) return false;
    ctx.putImageData(img, 0, 0, bx0, by0, bx1 - bx0 + 1, by1 - by0 + 1);
    return { x0: bx0, y0: by0, x1: bx1 + 1, y1: by1 + 1 };
  }

  function bboxOf(pts, W, H){
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for(const p of pts){ if(p.x < x0) x0 = p.x; if(p.x > x1) x1 = p.x; if(p.y < y0) y0 = p.y; if(p.y > y1) y1 = p.y; }
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(W - 1, Math.ceil(x1)); y1 = Math.min(H - 1, Math.ceil(y1));
    return { x0, y0, x1, y1 };
  }
  /* 多角形の内側（画素の中心で偶奇判定）を w×h のマスクで返す */
  function polyMask(pts, x0, y0, w, h){
    const m = new Uint8Array(w * h), n = pts.length, xs = [];
    for(let y = 0; y < h; y++){
      const yc = y0 + y + 0.5;
      xs.length = 0;
      for(let i = 0, j = n - 1; i < n; j = i++){
        const yi = pts[i].y, yj = pts[j].y;
        if((yi > yc) !== (yj > yc)) xs.push(pts[i].x + (yc - yi) / (yj - yi) * (pts[j].x - pts[i].x));
      }
      if(xs.length < 2) continue;
      xs.sort((a, b) => a - b);
      for(let k = 0; k + 1 < xs.length; k += 2){
        const a = Math.max(0, Math.ceil(xs[k] - 0.5) - x0), b = Math.min(w - 1, Math.floor(xs[k + 1] - 0.5) - x0);
        for(let x = a; x <= b; x++) m[y * w + x] = 1;
      }
    }
    return m;
  }
  /* 投げ縄塗り／投げ縄消し。戻り値：塗った矩形（無ければ null） */
  function lassoFill(ctx, pts, hex, erase){
    if(!pts || pts.length < 3) return null;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const b = bboxOf(pts, W, H);
    if(b.x0 > b.x1 || b.y0 > b.y1) return null;
    const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
    const m = polyMask(pts, b.x0, b.y0, bw, bh);
    const img = ctx.getImageData(b.x0, b.y0, bw, bh), d = img.data;
    const fc = erase ? { r: 0, g: 0, b: 0 } : hexToRgb(hex), fA = erase ? 0 : 255;
    for(let q = 0; q < m.length; q++){
      if(!m[q]) continue;
      const i = q * 4;
      d[i] = fc.r; d[i + 1] = fc.g; d[i + 2] = fc.b; d[i + 3] = fA;
    }
    ctx.putImageData(img, b.x0, b.y0);
    return { x: b.x0, y: b.y0, w: bw, h: bh };
  }

  LP.paint = { FILL_WALL_A, hexToRgb, rgbToHex, fillCircleRows, bresenham, dot, line, floodFill, lassoFill, polyMask, bboxOf };
})();
