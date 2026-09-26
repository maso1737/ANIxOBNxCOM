/* ============================================================
   LIVE PLATE — core/model.js
   BOOK（唯一のデータ）の形と、作る・複製する・直すための関数。SPEC_21 §5。
   ★ グローバルはこの LP 1つだけ（古典 <script src>・file:// 直開きで動く）。
   ★ 画像の実体は cell.line / cell.fill の Blob。JSON にするときだけ外す（store.js）。
   ============================================================ */
var LP = window.LP || (window.LP = {});
LP.lib = LP.lib || {};

(function(){
  'use strict';

  /* 用紙（§5-1）。紙の px は「世界の座標」であって作業解像度ではない（§11-2）。
     ★ 既定は SCREEN で固定（§13-3）。印刷系は将来のために表だけ残す */
  const PAPER_PRESETS = {
    SCREEN:      { w: 3840, h: 2160, dpi: 0,   label: 'SCREEN 3840×2160（16:9）' },
    SCREEN_TALL: { w: 3840, h: 6480, dpi: 0,   label: 'SCREEN TALL 3840×6480（縦3画面）' },
    B4_600:      { w: 6071, h: 8598, dpi: 600, label: 'B4 600dpi' },
  };
  const MAX_AREA = 3840 * 2160;   // プレート1枚の上限（§11-2。animator CFG.MAX_AREA と同じ）
  const DEF_SHEET_DUR = 48;       // 紙の既定尺（2秒）

  let seq = 0;
  function uid(p){
    seq = (seq + 1) % 1679616;
    return (p || 'x') + Date.now().toString(36).slice(-5) + seq.toString(36) + Math.floor(Math.random() * 1296).toString(36);
  }

  function newBook(){
    const pp = PAPER_PRESETS.SCREEN;
    const b = {
      ver: 1, name: 'LIVE PLATE',
      paper: { preset: 'SCREEN', w: pp.w, h: pp.h, dpi: pp.dpi },
      fps: 24,
      out: { mode: 'x1', long: 1920, bleed: 1 },
      // コマ割りの設定（BOOK 共通。紙ごとの上書きは sheet.frame）。余白＝内枠までの距離・lr/tb＝縦線/横線の間隔
      frame: { margin: 80, lr: 48, tb: 64, lw: 8, color: '#000000', bindRight: true },
      sheets: [],
      plates: {},
      fx: null,
      audio: null,
      markers: [],
      ui: {},
      seqNo: 0,        // 紙の通し番号（C1, C2…。並べ替えても名前は変えない）
    };
    b.sheets.push(newSheet(b));
    return b;
  }

  function newSheet(book, dur){
    book.seqNo = (book.seqNo || 0) + 1;
    return {
      id: uid('s'), name: 'C' + book.seqNo,
      dur: Math.max(1, Math.round(dur || DEF_SHEET_DUR)),
      in: { type: 'cut', dur: 0 },
      panels: [], items: [], layers: [],
      frame: null,     // 紙ごとのコマ割り設定の上書き（旧 MANGA_BOOK を読んだ紙＝ページの範囲）
      take: null, fx: null, shake: null,
      bg: 255,
    };
  }

  function newPlate(name, w, h, src){
    return {
      id: uid('p'), name: name || 'plate',
      w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)),
      cells: [], loop: true, src: src || 'import',
      refs: [],
      lanes: { line: { visible: true, locked: false, opacity: 1 }, fill: { visible: true, locked: false, opacity: 1 } },
      thumb: null,     // 棚のサムネ（Blob・派生物。作品データではない）
    };
  }

  function newCell(line, dur){
    return { id: uid('c'), dur: Math.max(1, dur || 1), line: line || null, fill: null };
  }

  function newLayer(plate, rect){
    return {
      id: uid('l'), name: plate.name, plateId: plate.id,
      panelId: null,
      x: rect.x, y: rect.y, w: rect.w, h: rect.h, rot: 0,
      z: 0, pad: 1.15,
      opacity: 1, blend: 'normal',
      edge: { on: false, w: 16, color: '#FFFFFF' },   // 境界効果（α の外側のフチ・紙 px）
      tIn: 0, tOut: null, tOffset: 0, step: 1,
      visible: true, locked: false,
    };
  }

  /* 仕上げ素材（manga-plate v2 の ITEM。SCREEN 3840 の紙に合わせた大きさ） */
  const ITEM_NAMES = { tone: '網', focus: '集中線', stream: '流線', text: '文字', white: 'ホワイト', frame: '枠', brush: 'ブラシ' };
  function newItem(type, box, n){
    const it = { id: uid('i'), type, name: (ITEM_NAMES[type] || type) + ' ' + (n || 1), panelId: null, visible: true, locked: false,
      x: Math.round(box.x + box.w / 2), y: Math.round(box.y + box.h / 2), rot: 0, opacity: 1, color: '#000000', tIn: 0, tOut: null };
    const w = Math.round(box.w), h = Math.round(box.h);
    if(type === 'tone') Object.assign(it, { w, h, dot: 12, gap: 18, angle: 45, shape: 'dot' });
    else if(type === 'focus') Object.assign(it, { r0: Math.round(Math.min(w, h) * 0.22), r1: Math.round(Math.hypot(w, h) * 0.62), count: 110, lw: 6, taper: 0.9, jitter: 0.35, core: 0.25, seed: 1 });
    else if(type === 'stream') Object.assign(it, { w, h, count: 34, lw: 5, taper: 0.85, jitter: 0.3, seed: 1 });
    else if(type === 'text') Object.assign(it, { text: '', size: 72, lh: 1.18, ls: 0.02, font: 0, vertical: true, edge: { on: false, w: 10, color: '#FFFFFF' } });
    else if(type === 'white') Object.assign(it, { poly: [], subs: [], erase: false, color: '#FFFFFF' });
    else if(type === 'frame') Object.assign(it, { w, h, lw: 10 });
    return it;
  }

  /* 取り込んだ絵を紙に置くときの大きさ。
     「カメラ出力の 1px ＝ 絵の 1px」で置く（1920×1080 の絵＝紙いっぱい）。紙より大きければ紙に収める。
     ★ animator 既定 2048×1152 も紙いっぱいになる（縮めて収める側）
     ★ カメラの基準窓は render.js の camBase が正（式を2つ持たない） */
  function placeSize(book, w, h){
    const k = LP.render.camBase(book).w / Math.max(1, book.out.long);
    let lw = w * k, lh = h * k;
    const fit = Math.min(1, book.paper.w / lw, book.paper.h / lh);
    return { w: lw * fit, h: lh * fit };
  }
  function fitRect(book, w, h){   // 紙に contain（新しい紙を作るとき）
    const s = Math.min(book.paper.w / w, book.paper.h / h);
    const rw = w * s, rh = h * s;
    return { x: (book.paper.w - rw) / 2, y: (book.paper.h - rh) / 2, w: rw, h: rh };
  }

  /* 深い複製。Blob は参照のまま渡す（不変なので共有してよい）＝ Undo のスナップショットが軽い */
  function clone(v){
    if(v === null || typeof v !== 'object') return v;
    if(typeof Blob !== 'undefined' && v instanceof Blob) return v;
    if(Array.isArray(v)) return v.map(clone);
    const o = {};
    for(const k in v) if(Object.prototype.hasOwnProperty.call(v, k)) o[k] = clone(v[k]);
    return o;
  }

  /* 読み込んだ BOOK の欠けを埋める（ver が上がったらここで移行する） */
  function migrate(b){
    const d = newBook();
    const out = Object.assign({}, d, b);
    out.paper = Object.assign({}, d.paper, b.paper || {});
    out.out = Object.assign({}, d.out, b.out || {});
    out.frame = Object.assign({}, d.frame, b.frame || {});
    out.sheets = Array.isArray(b.sheets) && b.sheets.length ? b.sheets : d.sheets;
    out.plates = b.plates || {};
    out.sheets.forEach(s => {
      s.layers = s.layers || []; s.panels = s.panels || []; s.items = s.items || [];
      if(s.frame === undefined) s.frame = null;
      s.panels.forEach(k => { if(!Array.isArray(k.cuts)) k.cuts = []; if(!Array.isArray(k.base)) k.base = k.poly; if(k.border === undefined) k.border = true; });
      s.items.forEach(it => { if(it.visible === undefined) it.visible = true; if(it.panelId === undefined) it.panelId = null; if(it.tIn == null) it.tIn = 0; if(it.tOut === undefined) it.tOut = null; });
      s.in = s.in || { type: 'cut', dur: 0 };
      s.dur = Math.max(1, s.dur | 0 || DEF_SHEET_DUR);
      if(s.bg == null) s.bg = 255;
      s.layers.forEach(l => {
        if(l.step == null) l.step = 1;
        if(l.tOffset == null) l.tOffset = 0;
        if(l.opacity == null) l.opacity = 1;
        if(l.visible == null) l.visible = true;
        if(l.pad == null) l.pad = 1.15;
        if(!l.edge) l.edge = { on: false, w: 16, color: '#FFFFFF' };
        if(l.panelId === undefined) l.panelId = null;
      });
    });
    return out;
  }

  function sheetById(book, id){ return book.sheets.find(s => s.id === id) || null; }
  function layerById(sheet, id){ return sheet ? (sheet.layers.find(l => l.id === id) || null) : null; }
  function itemById(sheet, id){ return sheet ? ((sheet.items || []).find(o => o.id === id) || null) : null; }
  function panelById(sheet, id){ return sheet && id ? ((sheet.panels || []).find(o => o.id === id) || null) : null; }
  function plateUse(book, plateId){
    let n = 0;
    for(const s of book.sheets) for(const l of s.layers) if(l.plateId === plateId) n++;
    return n;
  }

  LP.model = {
    PAPER_PRESETS, MAX_AREA, DEF_SHEET_DUR,
    uid, newBook, newSheet, newPlate, newCell, newLayer, newItem, ITEM_NAMES,
    placeSize, fitRect, clone, migrate,
    sheetById, layerById, itemById, panelById, plateUse,
  };
})();
