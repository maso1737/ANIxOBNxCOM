/* ============================================================
   LIVE PLATE — harness.js（VERIFY HARNESS 契約。SPEC_08 / single-html-verify）
   window.__HARNESS__ = { version, kind, canvas, ready, seek, render, info }
   ・**?harness=1 の窓でしか動かない**（LP.HARNESS_ON）。その窓は IndexedDB を読まない・書かない。
   ・素材は写真を使わず、canvas に決定論の絵を描いて作る（Math.random を使わない）。
     デコード待ちを挟まないよう、絵は LP.cache.put で直接置く。
   ・撮るのは #harness-shot（960×540）。中身は renderFrame の mode:'export'＝HTML 書き出しと同じ関数。
   ・フィクスチャ（24fps）：
       C1  0〜23  … 全面の背景（グラデ＋格子）＋ α付きの小さな絵（不透明度 0.8）
       C2 24〜59  … 連番 6セル（丸が回る）2コマ打ち・ループ ＋ 同じ素材を tOffset=3 で並べた2枚目
       C3 60〜83  … 乗算の層＋ 12° 回した層
       C4 84〜107 … コマ割り（斜めの縦線＋右を横線・右下は断ち切り）。背景は割ると全コマにコピー（panels.divide）、
                    フチ付きの層（コマ1）・網（コマ2・乗算）・集中線（コマ3）・流線（枠の上）・ホワイト（コマ1）・Z 付きの層
                    ★ 文字は入れない（書体の読み込みが検証窓で揺れる＝決定論にならない）
   ============================================================ */
var LP = window.LP || (window.LP = {});

(function(){
  'use strict';
  if(!LP.HARNESS_ON){ return; }
  const SW = 960, SH = 540;
  let shot = null, sctx = null, readyP = null;

  function cvs(w, h){ const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function blobOf(c){ return new Promise(res => c.toBlob(b => res(b), 'image/png')); }

  function drawBg(c){
    const g = c.getContext('2d'), w = c.width, h = c.height;
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, '#1d2b53'); gr.addColorStop(0.5, '#7e2553'); gr.addColorStop(1, '#ff77a8');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2;
    for(let x = 0; x <= w; x += 120){ g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for(let y = 0; y <= h; y += 120){ g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  }
  function drawSprite(c){
    const g = c.getContext('2d'), w = c.width, h = c.height;
    g.fillStyle = '#ffec27';
    g.beginPath(); g.moveTo(w / 2, 10); g.lineTo(w - 10, h - 10); g.lineTo(10, h - 10); g.closePath(); g.fill();
    g.lineWidth = 8; g.strokeStyle = '#000'; g.stroke();
  }
  function drawSeq(c, k, n){
    const g = c.getContext('2d'), w = c.width, h = c.height;
    g.fillStyle = '#fff1e8'; g.fillRect(0, 0, w, h);
    const a = k / n * Math.PI * 2;
    g.fillStyle = '#29adff';
    g.beginPath(); g.arc(w / 2 + Math.cos(a) * w * 0.3, h / 2 + Math.sin(a) * h * 0.3, h * 0.12, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#000'; g.fillRect(8, 8, 24 + k * 20, 16);
  }
  function drawTone(c){
    const g = c.getContext('2d'), w = c.width, h = c.height;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#83769c';
    for(let y = 12; y < h; y += 24) for(let x = 12 + ((y / 24) % 2) * 12; x < w; x += 24){ g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill(); }
  }
  function drawBar(c){
    const g = c.getContext('2d'), w = c.width, h = c.height;
    g.fillStyle = '#00e436'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#008751'; g.fillRect(0, h * 0.4, w, h * 0.2);
  }

  async function plateFrom(name, w, h, painters, src){
    const p = LP.model.newPlate(name, w, h, src || 'import');
    const cs = [];
    for(let i = 0; i < painters.length; i++){
      const c = cvs(w, h);
      painters[i](c);
      const cell = LP.model.newCell(await blobOf(c), 1);
      p.cells.push(cell);
      cs.push([cell, c]);
    }
    LP.book.plates[p.id] = p;
    cs.forEach(([cell, c]) => LP.cache.put(cell, 'line', c));
    return p;
  }

  async function build(){
    await LP.bootPromise;
    const b = LP.model.newBook();
    LP.book = b;
    b.sheets[0].dur = 24;
    const s2 = LP.model.newSheet(b, 36), s3 = LP.model.newSheet(b, 24);
    b.sheets.push(s2, s3);
    const bg = await plateFrom('bg', 1920, 1080, [drawBg]);
    const sp = await plateFrom('sprite', 400, 360, [drawSprite]);
    const N = 6, seqP = [];
    for(let k = 0; k < N; k++) seqP.push(c => drawSeq(c, k, N));
    const sq = await plateFrom('seq', 640, 360, seqP, 'seq');
    const tn = await plateFrom('tone', 960, 540, [drawTone]);
    const br = await plateFrom('bar', 800, 200, [drawBar]);

    const put = (sheet, p, r, extra) => { const L = LP.model.newLayer(p, r); Object.assign(L, extra || {}); sheet.layers.push(L); return L; };
    put(b.sheets[0], bg, { x: 0, y: 0, w: 3840, h: 2160 });
    put(b.sheets[0], sp, { x: 2400, y: 1100, w: 800, h: 720 }, { opacity: 0.8 });
    put(s2, sq, { x: 200, y: 400, w: 1600, h: 900 }, { step: 2 });
    put(s2, sq, { x: 2040, y: 860, w: 1600, h: 900 }, { step: 2, tOffset: 3 });
    put(s3, bg, { x: 0, y: 0, w: 3840, h: 2160 });
    put(s3, tn, { x: 480, y: 270, w: 2880, h: 1620 }, { blend: 'multiply' });
    put(s3, br, { x: 1120, y: 880, w: 1600, h: 400 }, { rot: 12 });
    // C4：コマ割り
    const s4 = LP.model.newSheet(b, 24);
    b.sheets.push(s4);
    put(s4, bg, { x: 0, y: 0, w: 3840, h: 2160 });
    put(s4, sp, { x: 2500, y: 300, w: 700, h: 630 }, { edge: { on: true, w: 24, color: '#FFFFFF' }, z: 120 });
    LP.panels.divide(s4, 1900, 100, 180, 1900, null);           // 斜めの縦線
    const right = s4.panels.find(k => LP.geom.polyBounds(k.poly).cx > 1920);
    LP.panels.divide(s4, 2600, 1150, 1, 0.06, right.id);         // 右を横に
    const P = n => s4.panels[n];
    P(2).bleed = true;
    const box = k => { const r = LP.geom.polyBounds(k.poly); return { x: r.x, y: r.y, w: r.w, h: r.h }; };
    const addIt = (type, k, extra) => { const it = LP.model.newItem(type, k ? box(k) : { x: 0, y: 0, w: 3840, h: 2160 }, 1); Object.assign(it, extra || {}); it.panelId = k ? k.id : null; s4.items.push(it); return it; };
    addIt('tone', P(1), { dot: 10, gap: 16 });
    addIt('focus', P(2), { count: 90 });
    addIt('stream', null, { x: 1920, y: 1950, w: 3000, h: 260, count: 12, lw: 8 });
    addIt('white', P(0), { x: 2900, y: 900, poly: [{ x: -200, y: -120 }, { x: 220, y: -90 }, { x: 180, y: 140 }, { x: -160, y: 110 }] });

    LP.hist.reset();
    LP.state.t = 0;
    LP.app.refresh();
    shot = cvs(SW, SH); shot.id = 'harness-shot';
    document.body.appendChild(shot);
    sctx = shot.getContext('2d');
  }

  function render(){
    if(!sctx) return;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, SW, SH);
    LP.render.renderFrame(sctx, LP.book, LP.state.t, { mode: 'export', img: LP.cache.img, rect: { x: 0, y: 0, w: SW, h: SH } });
  }

  window.__HARNESS__ = {
    version: 1,
    kind: 'canvas2d',
    canvas: '#harness-shot',
    ready(){ return readyP || (readyP = build()); },
    // t(ms) → 通しフレーム。状態を決めるだけで描かない
    seek(t){
      const T = Math.max(1, LP.time.totalFrames(LP.book));
      LP.state.t = Math.floor(t / (1000 / LP.book.fps)) % T;
    },
    render(){ render(); },
    info(){
      const st = LP.cache.stats();
      return { sheets: LP.book.sheets.length, frames: LP.time.totalFrames(LP.book), plates: Object.keys(LP.book.plates).length,
        resident: st.resident, pixelBytes: st.bytes, vramBytesEstimate: st.bytes };
    },
  };
})();
