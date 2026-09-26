/* ============================================================
   LIVE PLATE — core/items.js（仕上げ素材の描画。正準は manga-plate.html drawItem ほか）
   網（tone）／集中線（focus）／流線（stream）／枠（frame）／文字（text）／ホワイト（white）／ブラシ（brush・読み込み専用）
   ★ ビューアに**文字列で同梱**される。外を参照しない（文字の寸法だけ canvas を1枚借りる）。
   ★ 乱数は seed から決まる（mulberry32）。同じ素材は何度描いても同じ絵。
   ★ 重なりは「種類ごとの段」（ITEM_BAND）：網・線は乗算（1）→ 文字・ホワイト（2）。同じ段の中は配列順。
   ★ manga-plate の「ぱかぱか（pk）」は持ち込まない（SPEC_21 §7-1：流線を層にしてセルを n 枚にすれば同じ）。
   ============================================================ */
var LP = window.LP || (window.LP = {});
LP.lib = LP.lib || {};

LP.lib.items = function(){
  'use strict';
  const TAU = Math.PI * 2;
  const ITEM_BAND = { tone: 1, focus: 1, stream: 1, frame: 1, text: 2, white: 2, brush: 2 };
  const INK_MULTIPLY = { tone: 1, focus: 1, stream: 1, frame: 1 };
  const TEXT_FONTS = [["アンチック", "'Shippori Antique'"], ["アンチックB1", "'Shippori Antique B1'"], ["ゴシック", "'Noto Sans JP'"]];
  const VERT_ROT = 'ー－—―‐～〜（）()「」『』【】〔〕｛｝{}［］[]<>＜＞…‥∼';   // 縦書きで90°倒す字
  const VERT_SHIFT = '、。，．,.';                                            // 右上に寄せる字
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function mulberry32(a){
    return function(){
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function fontStack(i){ return (TEXT_FONTS[i] || TEXT_FONTS[0])[1] + ",'Noto Sans JP',serif"; }
  function pathPoly(g, p){ g.beginPath(); g.moveTo(p[0].x, p[0].y); for(let i = 1; i < p.length; i++) g.lineTo(p[i].x, p[i].y); g.closePath(); }
  function polysOf(it){
    const head = it.type === 'brush' ? it.pts : it.poly;
    return [head || []].concat(it.subs || []).filter(p => p && p.length);
  }

  function drawTone(g, it){
    g.beginPath(); g.rect(-it.w / 2, -it.h / 2, it.w, it.h); g.clip();
    const gp = Math.max(2, it.gap), r = it.dot / 2;
    /* 画面上のドット間隔が 3px 未満（縮小表示・サムネ）は、同じ濃さの平らな塗りで出す＝モアレを出さない・軽い。
       書き出しの解像度では間隔が十分あるのでドットを打つ（出力は変わらない） */
    const m = g.getTransform(), dev = gp * Math.sqrt(m.a * m.a + m.b * m.b);
    if(dev < 3){
      const cov = it.shape === 'square' ? Math.min(1, (it.dot * it.dot) / (gp * gp)) : Math.min(1, Math.PI * r * r / (gp * gp));
      g.globalAlpha *= cov;
      g.fillRect(-it.w / 2, -it.h / 2, it.w, it.h);
      return;
    }
    g.rotate(it.angle * Math.PI / 180);
    const ca = Math.cos(-it.angle * Math.PI / 180), sa = Math.sin(-it.angle * Math.PI / 180);
    let i0 = 1e12, i1 = -1e12, j0 = 1e12, j1 = -1e12;
    for(const c of [[-it.w / 2, -it.h / 2], [it.w / 2, -it.h / 2], [it.w / 2, it.h / 2], [-it.w / 2, it.h / 2]]){
      const lx = c[0] * ca - c[1] * sa, ly = c[0] * sa + c[1] * ca;
      i0 = Math.min(i0, lx); i1 = Math.max(i1, lx); j0 = Math.min(j0, ly); j1 = Math.max(j1, ly);
    }
    const ia = Math.floor(i0 / gp) - 1, ib = Math.ceil(i1 / gp) + 1, ja = Math.floor(j0 / gp) - 1, jb = Math.ceil(j1 / gp) + 1;
    if((ib - ia) * (jb - ja) > 400000) return;   // 事故防止（間隔が細かすぎ）
    for(let j = ja; j <= jb; j++) for(let i = ia; i <= ib; i++){
      const px = i * gp, py = j * gp;
      if(it.shape === 'square') g.fillRect(px - r, py - r, it.dot, it.dot);
      else { g.beginPath(); g.arc(px, py, r, 0, TAU); g.fill(); }
    }
  }
  /* 集中線。芯くずし（core）＝白場の真円を低周波のうねりで崩す（manga-plate §v2-6b） */
  function drawFocus(g, it){
    const rnd = mulberry32(it.seed | 0);
    const core = clamp(it.core || 0, 0, 1);
    const cr = mulberry32((it.seed | 0) * 7919 + 13);
    const lobes = 2 + Math.floor(cr() * 4), ph = cr() * TAU, lobes2 = lobes * 2 + 1, ph2 = cr() * TAU;
    for(let i = 0; i < it.count; i++){
      const a = (i / it.count) * TAU + (rnd() - 0.5) * (TAU / it.count) * it.jitter * 2;
      const r0 = core ? Math.max(0, it.r0 * (1 + (Math.sin(a * lobes + ph) * 0.30 + Math.sin(a * lobes2 + ph2) * 0.14 + (cr() - 0.5) * 0.46) * core)) : it.r0;
      const len = Math.max(r0 + 4, it.r1 * (1 - rnd() * it.jitter * 0.4));
      const w0 = (it.lw * (0.6 + rnd() * 0.8)) / 2, w1 = w0 * (1 - it.taper);
      const ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
      g.beginPath();
      g.moveTo(ca * r0 + px * w0, sa * r0 + py * w0);
      g.lineTo(ca * len + px * w1, sa * len + py * w1);
      g.lineTo(ca * len - px * w1, sa * len - py * w1);
      g.lineTo(ca * r0 - px * w0, sa * r0 - py * w0);
      g.closePath(); g.fill();
    }
  }
  function drawStream(g, it){
    const rnd = mulberry32(it.seed | 0);
    for(let i = 0; i < it.count; i++){
      const yy = -it.h / 2 + ((i + 0.5) / it.count + ((rnd() - 0.5) * it.jitter) / it.count) * it.h;
      const x0 = -it.w / 2 + ((rnd() - 0.5) * it.jitter * 0.5) * it.w;
      const x1 = it.w / 2 * (1 - rnd() * it.jitter * 0.3);
      const w0 = (it.lw * (0.5 + rnd())) / 2, w1 = w0 * (1 - it.taper);
      g.beginPath();
      g.moveTo(x0, yy - w0); g.lineTo(x1, yy - w1); g.lineTo(x1, yy + w1); g.lineTo(x0, yy + w0);
      g.closePath(); g.fill();
    }
  }
  function textLines(it){ return String(it.text == null ? '' : it.text).split('\n'); }
  /* 文字。段落は「先頭合わせ」（縦書き＝上端そろえ／横書き＝左端そろえ）。フチ＝太らせた線で先に描く */
  function drawText(g, it){
    const lines = textLines(it);
    if(!lines.length || !lines.join('')) return;
    g.font = it.size + 'px ' + fontStack(it.font | 0);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const step = it.size * (it.lh || 1.18), adv = it.size * (1 + (it.ls || 0));
    const paint = fn => {
      if(it.edge && it.edge.on && it.edge.w > 0){
        g.save(); g.strokeStyle = it.edge.color; g.lineWidth = it.edge.w * 2;
        g.lineJoin = 'round'; g.lineCap = 'round'; g.miterLimit = 2;
        fn(true); g.restore();
      }
      g.fillStyle = it.color; fn(false);
    };
    if(it.vertical){
      const cols = lines.length;
      const maxc = Math.max(1, ...lines.map(l => [...l].length));
      const top = -(maxc - 1) / 2 * adv;
      paint(stroke => {
        lines.forEach((ln, ci) => {
          const cx0 = (cols - 1) / 2 * step - ci * step;   // 右の列が先頭
          [...ln].forEach((ch, i) => {
            g.save(); g.translate(cx0, top + i * adv);
            if(VERT_ROT.indexOf(ch) >= 0) g.rotate(Math.PI / 2);
            else if(VERT_SHIFT.indexOf(ch) >= 0) g.translate(it.size * 0.32, -it.size * 0.36);
            if(stroke) g.strokeText(ch, 0, 0); else g.fillText(ch, 0, 0);
            g.restore();
          });
        });
      });
    }else{
      const wOf = ln => [...ln].reduce((s, ch) => s + g.measureText(ch).width + it.size * (it.ls || 0), 0);
      const left = -Math.max(0, ...lines.map(wOf)) / 2;
      paint(stroke => {
        lines.forEach((ln, li) => {
          const cy = -(lines.length - 1) / 2 * step + li * step;
          let x = left;
          [...ln].forEach(ch => {
            const w = g.measureText(ch).width + it.size * (it.ls || 0);
            if(stroke) g.strokeText(ch, x + w / 2, cy); else g.fillText(ch, x + w / 2, cy);
            x += w;
          });
        });
      });
    }
  }
  let mc = null;
  function textBox(it){
    const lines = textLines(it), step = it.size * (it.lh || 1.18), adv = it.size * (1 + (it.ls || 0));
    if(!lines.length) return { w: it.size, h: it.size };
    if(it.vertical){
      const maxc = Math.max(1, ...lines.map(l => [...l].length));
      return { w: Math.max(it.size, lines.length * step), h: Math.max(it.size, maxc * adv) };
    }
    if(!mc) mc = document.createElement('canvas').getContext('2d');
    mc.font = it.size + 'px ' + fontStack(it.font | 0);
    const maxw = Math.max(it.size, ...lines.map(l => mc.measureText(l).width + [...l].length * it.size * (it.ls || 0)));
    return { w: maxw, h: Math.max(it.size, lines.length * step) };
  }
  function drawBrush(g, it){
    const strokes = polysOf(it);
    if(!strokes.length) return;
    const body = (pad, col) => {
      g.fillStyle = col;
      strokes.forEach(p => {
        if(it.fill && p.length > 2){ pathPoly(g, p); g.fill(); }
        const r = i => Math.max(0.5, it.lw * (p[i].w || 1) / 2 + pad);
        if(p.length === 1){ g.beginPath(); g.arc(p[0].x, p[0].y, r(0), 0, TAU); g.fill(); return; }
        for(let i = 0; i < p.length - 1; i++){
          const a = p[i], b = p[i + 1], ra = r(i), rb = r(i + 1);
          const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
          if(L > 0.01){
            const nx = -dy / L, ny = dx / L;
            g.beginPath();
            g.moveTo(a.x + nx * ra, a.y + ny * ra); g.lineTo(b.x + nx * rb, b.y + ny * rb);
            g.lineTo(b.x - nx * rb, b.y - ny * rb); g.lineTo(a.x - nx * ra, a.y - ny * ra);
            g.closePath(); g.fill();
          }
          g.beginPath(); g.arc(b.x, b.y, rb, 0, TAU); g.fill();
        }
        g.beginPath(); g.arc(p[0].x, p[0].y, r(0), 0, TAU); g.fill();
      });
    };
    if(it.edge && it.edge.on && it.edge.w > 0) body(it.edge.w, it.edge.color);
    body(0, it.color);
  }
  /* 1つ描く。env.bg＝紙の地の色（ホワイトの「消し」は地の色で塗る）、env.alpha＝全体の濃さ */
  function drawItem(g, it, env){
    g.save();
    g.translate(it.x, it.y); g.rotate((it.rot || 0) * Math.PI / 180);
    g.fillStyle = it.color; g.strokeStyle = it.color;
    g.globalAlpha = (env && env.alpha != null ? env.alpha : 1) * clamp(it.opacity == null ? 1 : it.opacity, 0, 1);
    if(it.type === 'white'){
      if(it.erase) g.fillStyle = (env && env.bg) || '#FFFFFF';
      polysOf(it).forEach(p => { if(p.length > 2){ pathPoly(g, p); g.fill(); } });
    }
    else if(it.type === 'frame'){ g.lineWidth = it.lw; g.lineJoin = 'miter'; g.strokeRect(-it.w / 2, -it.h / 2, it.w, it.h); }
    else if(it.type === 'tone') drawTone(g, it);
    else if(it.type === 'focus') drawFocus(g, it);
    else if(it.type === 'stream') drawStream(g, it);
    else if(it.type === 'text') drawText(g, it);
    else if(it.type === 'brush') drawBrush(g, it);
    g.restore();
  }
  /* 網・線は乗算＝下の線画を潰さない（白で置いたときは乗算にしない＝白く抜ける） */
  function drawItemComposited(g, it, env){
    const mul = INK_MULTIPLY[it.type] && String(it.color).toUpperCase() !== '#FFFFFF';
    if(mul) g.globalCompositeOperation = 'multiply';
    drawItem(g, it, env);
    if(mul) g.globalCompositeOperation = 'source-over';
  }
  function drawOrder(items){
    return items.map((it, i) => ({ it, i }))
      .sort((a, b) => (ITEM_BAND[a.it.type] || 0) - (ITEM_BAND[b.it.type] || 0) || a.i - b.i)
      .map(o => o.it);
  }
  /* 外形（選択枠・当たり判定）。中心 (x,y)・回転 rot のローカルで w×h */
  function itemBounds(it){
    if(it.type === 'focus') return { w: it.r1 * 2, h: it.r1 * 2 };
    if(it.type === 'white' || it.type === 'brush'){
      const all = [].concat(...polysOf(it));
      if(!all.length) return { w: 100, h: 100 };
      let x0 = 1e12, y0 = 1e12, x1 = -1e12, y1 = -1e12;
      for(const q of all){ x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
      const pad = it.type === 'brush' ? (it.lw || 10) : 0;
      return { w: Math.max(2 * Math.max(Math.abs(x0), Math.abs(x1)) + pad, 20), h: Math.max(2 * Math.max(Math.abs(y0), Math.abs(y1)) + pad, 20) };
    }
    if(it.type === 'text') return textBox(it);
    return { w: it.w, h: it.h };
  }

  return { ITEM_BAND, TEXT_FONTS, fontStack, mulberry32, drawItem, drawItemComposited, drawOrder, itemBounds, textBox };
};
LP.items = LP.lib.items();
