/* ============================================================
   LIVE PLATE — core/brush.js（ブラシの種類。SPEC_21 §18-1）
   econte の暫定5種（SPEC_19 §7 = BRUSH LAB の §ENGINE の移植）をそのまま持ってきた。
     1 PEN    … AA なしの丸ペン（core/paint.js。ここは通らない＝いままでの描き味・バケツの壁も同じ）
     2 MARKER … 線モード。濃度<1 は **1本まとめて合成**（区間の重なりで継ぎ目が濃くならない）
     3 FLAT   … スタンプ。平筆（角度で太さが変わる）
     4 AIR    … スタンプ。ボケ足の大きいエアブラシ
     5 GLOW   … スタンプ＋加算。形＝光の筋・粒＝パルスの縦縞・暈（halo）
   ★ BRUSH LAB の移植の契約4点：
       ① plan は1区間1回・draw は描く紙の枚数ぶん（ここでは紙は1枚＝1回）
       ② 配る枠（Undo の矩形）は plan.bbox で決める
       ③ txTouch にも plan.bbox を渡す
       ④ 線モードの濃度<1 は1本まとめて合成（drawWhole：tx の控えを使う＝追加の控えは要らない）
   ★ state を読まない。ストロークの状態 S（間隔の持ち越し・進んだ距離・粒の番号）は呼ぶ側が begin() で持つ
   ★ 形・粒の画像の取り込み（econte の「形」「粒」「⇩ LAB」）は持ち込んでいない（§18-1）
   ============================================================ */
var LP = window.LP || (window.LP = {});

(function(){
  'use strict';
  const clamp = (v, a, z) => v < a ? a : (v > z ? z : v);
  function cvs(w, h){ const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  const DEF = {
    mode: 'stamp', shape: 'soft', size: 24, opacity: 1, flow: .5,
    spacing: .10, jitter: 0, sizeJit: 0, angJit: 0,
    hardness: 0, grain: 0, grainTex: null, roundness: 1, rotate: false, angle: 0,
    blend: 'source-over', pSize: .5, pOpa: .4, smooth: .25, taperIn: 0, halo: 0,
  };
  const mk = o => Object.assign({}, DEF, o);
  /* econte BR_FACTORY と同じ値（2026-09-24 の暫定）。size は既定の太さ（プレート px） */
  const LIST = [
    { id: 'pen', name: 'PEN', jp: '丸ペン（AA なし・バケツの壁）', legacy: true, size: 6 },
    mk({ id: 'marker', name: 'MARKER', jp: 'マーカー・面', mode: 'line', size: 34, opacity: .55, flow: 1, hardness: 1, pSize: .3, pOpa: .2, smooth: .4 }),
    mk({ id: 'flat', name: 'FLAT', jp: '平筆・角度で太さが変わる', shape: 'flat', size: 40, opacity: .85, flow: .9, spacing: .06, roundness: .16, angle: 38, pSize: .6, pOpa: .3, smooth: .3 }),
    mk({ id: 'air', name: 'AIR', jp: 'エアブラシ・ボケ足大', shape: 'soft', size: 120, opacity: .7, flow: .06, spacing: .05, hardness: 0, pSize: .3, pOpa: .7, smooth: .5 }),
    mk({ id: 'glow', name: 'GLOW', jp: '光（筋＋パルス・加算）', shape: 'streak', grainTex: 'pulse', grain: .55, size: 100, opacity: 1, flow: .50, spacing: .05,
         blend: 'lighter', rotate: true, angle: 90, halo: .60, pSize: .8, pOpa: .5, smooth: .5 }),
  ];
  const BY = {};
  LIST.forEach(b => { BY[b.id] = b; });
  function get(id){ return BY[id] || BY.pen; }

  /* ---------- ストロークの状態（plan だけが進める） ---------- */
  function begin(){ return { carry: 0, dist: 0, n: 0, seed: (Math.random() * 1e9) | 0, lastAng: 0, whole: null }; }
  function rnd(S, i){
    let x = S.seed ^ Math.imul(i, 0x9E3779B1);
    x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  }
  function dynSize(S, B, env){
    let k = 1 - B.pSize + B.pSize * env.press;
    if(B.taperIn > 0){
      const need = env.size * B.taperIn * 6;
      if(S.dist < need) k *= .12 + .88 * (S.dist / need);
    }
    return Math.max(.35, env.size * k);
  }
  function dynAlpha(B, env){ return clamp(B.opacity * (1 - B.pOpa + B.pOpa * env.press), 0, 1); }

  /* (1) 計画：何をどこに置くか。env = { color, size, press } */
  function plan(S, a, b, B, env){
    if(B.mode === 'line'){
      const lw = dynSize(S, B, env);
      S.dist += Math.hypot(b.x - a.x, b.y - a.y);
      const pad = lw / 2 + 1;
      return { mode: 'line', B, color: env.color, lw, alpha: dynAlpha(B, env), a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y },
               bbox: [Math.min(a.x, b.x) - pad, Math.min(a.y, b.y) - pad, Math.max(a.x, b.x) + pad, Math.max(a.y, b.y) + pad] };
    }
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    const size0 = dynSize(S, B, env);
    const sp = Math.max(.6, size0 * B.spacing);
    const dirAng = len > .001 ? Math.atan2(dy, dx) : S.lastAng;
    S.lastAng = dirAng;
    const stamps = [];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const put = (px, py, sz, an) => {
      const tw = tipPx(sz);
      const rot = B.rotate ? an + B.angle * Math.PI / 180 : (B.angJit > 0 ? an : B.angle * Math.PI / 180);
      const ext = Math.abs(rot) > 1e-4 ? tw * .7072 : tw / 2;
      stamps.push({ x: px, y: py, tw, rot, variant: (B.grain > 0 && !B.grainTex) ? ((S.n + stamps.length) & 3) : 0 });
      x0 = Math.min(x0, px - ext); y0 = Math.min(y0, py - ext);
      x1 = Math.max(x1, px + ext); y1 = Math.max(y1, py + ext);
    };
    let d = S.carry;
    if(len < .001 && S.n === 0) put(a.x, a.y, size0, dirAng);
    while(d <= len){
      const t = len > 0 ? d / len : 0;
      const i = S.n + stamps.length;
      let px = a.x + dx * t, py = a.y + dy * t, sz = size0, an = dirAng;
      if(B.jitter > 0){ px += (rnd(S, i * 3 + 1) - .5) * size0 * B.jitter; py += (rnd(S, i * 3 + 2) - .5) * size0 * B.jitter; }
      if(B.sizeJit > 0) sz *= 1 + ((.35 + rnd(S, i * 3 + 3) * .9) - 1) * B.sizeJit;
      if(B.angJit > 0) an += (rnd(S, i * 5 + 7) - .5) * Math.PI * 2 * B.angJit;
      put(px, py, sz, an);
      d += sp;
    }
    S.n += stamps.length;
    S.carry = d - len;
    S.dist += len;
    return { mode: 'stamp', B, color: env.color, alpha: dynAlpha(B, env) * B.flow, stamps, bbox: stamps.length ? [x0, y0, x1, y1] : [0, 0, -1, -1] };
  }
  /* (2) 描画：S に触らない */
  function draw(ctx, p, alpha, blend){
    const B = p.B;
    ctx.save();
    ctx.globalCompositeOperation = blend || B.blend || 'source-over';
    ctx.globalAlpha = clamp(alpha == null ? p.alpha : alpha, 0, 1);
    if(p.mode === 'line'){
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(.5, p.lw);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(p.a.x, p.a.y);
      ctx.lineTo(p.b.x + (p.a.x === p.b.x && p.a.y === p.b.y ? .01 : 0), p.b.y);
      ctx.stroke();
    }else{
      for(const st of p.stamps){
        const tip = getTip(B, st.tw, p.color, st.variant);
        const half = tip.width / 2;
        if(Math.abs(st.rot) < 1e-4 && B.roundness >= .999){
          ctx.drawImage(tip, st.x - half, st.y - half);
        }else{
          ctx.translate(st.x, st.y);
          ctx.rotate(st.rot);
          ctx.scale(1, B.roundness);
          ctx.drawImage(tip, -half, -half);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
      }
    }
    ctx.restore();
  }
  /* 線モードの「1本まとめて合成」（BRUSH LAB の実測③）。
     1本ぶんを不透明で控え（S.whole）に引き、描いた範囲だけ描く前の紙（tx の控え snap。無ければ透明）に戻して、控えを濃度1回ぶんで乗せる。
     ★ このあいだ「筆圧→濃さ」は効かない（1本で1つの濃さ）。太さの筆圧は効く */
  function drawWhole(ctx, p, S, snap){
    const c = ctx.canvas;
    if(!S.whole) S.whole = cvs(c.width, c.height);
    draw(S.whole.getContext('2d'), p, 1, 'source-over');
    const x = clamp(Math.floor(p.bbox[0]), 0, c.width), y = clamp(Math.floor(p.bbox[1]), 0, c.height);
    const x2 = clamp(Math.ceil(p.bbox[2]), 0, c.width), y2 = clamp(Math.ceil(p.bbox[3]), 0, c.height);
    if(x2 <= x || y2 <= y) return;
    ctx.save();
    ctx.clearRect(x, y, x2 - x, y2 - y);
    if(snap) ctx.drawImage(snap, x, y, x2 - x, y2 - y, x, y, x2 - x, y2 - y);
    ctx.globalAlpha = clamp(p.B.opacity, 0, 1);
    ctx.globalCompositeOperation = p.B.blend || 'source-over';
    ctx.drawImage(S.whole, x, y, x2 - x, y2 - y, x, y, x2 - x, y2 - y);
    ctx.restore();
  }

  /* ---------- 筆先（色つきハンコ）のキャッシュ ---------- */
  const TIP = new Map(), TIP_MAX = 200;
  function tipPx(size){
    const q = Math.max(2, Math.round(size / 16));
    return Math.max(2, Math.round(size / q) * q);
  }
  function getTip(B, size, color, variant){
    const px = tipPx(size);
    const key = B.id + '|' + px + '|' + color + '|' + variant;
    let c = TIP.get(key);
    if(c) return c;
    c = cvs(px, px);
    const x = c.getContext('2d');
    x.drawImage(mask(B, px, variant), 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, px, px);
    if(TIP.size > TIP_MAX) TIP.delete(TIP.keys().next().value);
    TIP.set(key, c);
    return c;
  }
  /* 形のマスク（白＝筆） */
  function mask(B, px, variant){
    const c = cvs(px, px), x = c.getContext('2d'), r = px / 2;
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    const hk = 1 - .45 * clamp(B.halo || 0, 0, 1), ho = px * (1 - hk) / 2, hs = px * hk;
    if(B.shape === 'streak'){
      x.drawImage(streakMask(), ho, ho, hs, hs);
    }else if(B.shape === 'flat'){
      x.fillStyle = '#fff';
      x.beginPath(); x.ellipse(r, r, r, r, 0, 0, Math.PI * 2); x.fill();
      if(B.hardness < .98){
        const g = x.createRadialGradient(r, r, r * B.hardness, r, r, r);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        x.globalCompositeOperation = 'destination-in';
        x.fillStyle = g; x.fillRect(0, 0, px, px);
        x.globalCompositeOperation = 'source-over';
      }
    }else{   // soft
      const h = clamp(B.hardness, 0, .98);
      const g = x.createRadialGradient(r, r, 0, r, r, r);
      for(let i = 0; i <= 12; i++){
        const t = i / 12;
        const a = t <= h ? 1 : Math.pow(1 - (t - h) / (1 - h), 1.9);
        g.addColorStop(t, 'rgba(255,255,255,' + clamp(a, 0, 1).toFixed(4) + ')');
      }
      x.fillStyle = g; x.fillRect(0, 0, px, px);
    }
    if(B.grain > 0){
      const tex = B.grainTex ? grainDepth(B) : noiseTile(Math.round(B.grain * 20) / 20, variant);
      x.globalCompositeOperation = 'destination-in';
      x.drawImage(tex, 0, 0, px, px);
      x.globalCompositeOperation = 'source-over';
    }
    if(B.halo > 0){
      const g = x.createRadialGradient(r, r, 0, r, r, r);
      for(let i = 0; i <= 10; i++){
        const t = i / 10;
        g.addColorStop(t, 'rgba(255,255,255,' + clamp(B.halo * .55 * Math.pow(1 - t, 2.2), 0, 1).toFixed(4) + ')');
      }
      x.globalCompositeOperation = 'destination-over';
      x.fillStyle = g; x.fillRect(0, 0, px, px);
      x.globalCompositeOperation = 'source-over';
    }
    return c;
  }
  /* 内蔵の「光の筋」（econte brStreakMask と同じ種・同じ式） */
  let streak = null;
  function streakMask(){
    if(streak) return streak;
    const N = 128, c = cvs(N, N), x = c.getContext('2d');
    const im = x.createImageData(N, N), p = im.data;
    let s = 0x51F15EED;
    const r = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    const col = [], top = [], bot = [];
    for(let i = 0; i < N; i++){ col.push(.2 + .8 * Math.pow(r(), .55)); top.push(r() * .25); bot.push(r() * .25); }
    const sm = col.map((v, i) => (v * 2 + (col[i - 1] || v) + (col[i + 1] || v)) / 4);
    const ss = (e0, e1, v) => { const t = clamp((v - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    for(let yy = 0; yy < N; yy++){
      for(let xx = 0; xx < N; xx++){
        const u = Math.abs((xx + .5) / N * 2 - 1), v = (yy + .5) / N;
        const ex = 1 - ss(.55, .95, u);
        const ey = ss(.08 + top[xx], .30 + top[xx], v) * (1 - ss(.70 - bot[xx], .92 - bot[xx], v));
        const o = (yy * N + xx) * 4;
        p[o] = p[o + 1] = p[o + 2] = 255;
        p[o + 3] = Math.round(255 * clamp(sm[xx] * ex * ey, 0, 1));
      }
    }
    x.putImageData(im, 0, 0);
    streak = c;
    return c;
  }
  /* 内蔵の「パルス」：柔らかい縦縞＋芯の細い光の線 */
  let pulse = null;
  function pulseMask(){
    if(pulse) return pulse;
    const N = 128, P = 32, c = cvs(N, N), x = c.getContext('2d');
    const im = x.createImageData(N, N), p = im.data;
    for(let xx = 0; xx < N; xx++){
      const t = ((xx + .5) % P) / P;
      const soft = .5 + .5 * Math.cos((t - .5) * Math.PI * 2);
      const line = Math.exp(-Math.pow((t - .5) * P, 2) / 2);
      const a = clamp(.18 + .55 * soft + .45 * line, 0, 1);
      for(let yy = 0; yy < N; yy++){
        const o = (yy * N + xx) * 4;
        p[o] = p[o + 1] = p[o + 2] = 255;
        p[o + 3] = Math.round(255 * a);
      }
    }
    x.putImageData(im, 0, 0);
    pulse = c;
    return c;
  }
  /* 粒の深さ：1 − grain × (1 − テクスチャ) */
  const DEPTH = new Map();
  function grainDepth(B){
    const key = B.id + '|' + B.grain.toFixed(2);
    let c = DEPTH.get(key);
    if(c) return c;
    const src = pulseMask(), N = src.width;
    c = cvs(N, N);
    const x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    const im = x.getImageData(0, 0, N, N), p = im.data, g = clamp(B.grain, 0, 1);
    for(let i = 0; i < p.length; i += 4){
      p[i] = p[i + 1] = p[i + 2] = 255;
      p[i + 3] = Math.round(255 * (1 - g * (1 - p[i + 3] / 255)));
    }
    x.putImageData(im, 0, 0);
    DEPTH.set(key, c);
    return c;
  }
  /* 粒ノイズ（BRUSH LAB と同じ。128×128 を量・種ごとに1回だけ） */
  const NOISE = new Map();
  function noiseTile(amt, variant){
    const key = amt.toFixed(2) + '|' + variant;
    let c = NOISE.get(key);
    if(c) return c;
    c = cvs(128, 128);
    const x = c.getContext('2d'), im = x.createImageData(128, 128), p = im.data;
    let sd = (0x2545F491 ^ Math.imul(variant, 0x9E3779B1) ^ ((amt * 1000) | 0)) >>> 0;
    for(let i = 0; i < p.length; i += 4){
      sd ^= sd << 13; sd >>>= 0; sd ^= sd >> 17; sd ^= sd << 5; sd >>>= 0;
      const n = sd / 4294967296;
      p[i] = p[i + 1] = p[i + 2] = 255;
      p[i + 3] = Math.round(255 * clamp(1 - amt + amt * n * n * 1.6, 0, 1));
    }
    x.putImageData(im, 0, 0);
    NOISE.set(key, c);
    return c;
  }

  LP.brush = { LIST, get, begin, plan, draw, drawWhole };
})();
