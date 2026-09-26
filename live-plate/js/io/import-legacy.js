/* ============================================================
   LIVE PLATE — io/import-legacy.js（旧形式を読む。SPEC_21 §5-2 / §9-1）
   P1 で読めるもの：MANGA_BOOK_v2（manga-plate の EXPORT JSON）
     pages → 紙（**新しい紙として足す**。いまの紙は消さない）
     ページは SCREEN の紙の中に「縦横比を保って収める」（用紙は SCREEN 固定＝§13-3）。
     コマ（base / cuts / poly）・仕上げ素材はそのまま座標だけ写す。紙ごとの frame にページの範囲を持たせるので、
     断ち切りは「ページの端」まで伸びる（SCREEN の紙の端ではない）。
     img 素材 → PLATE（1セル。srcs があれば n セル）＋ LAYER。奥行きタグ（奥/中/前）→ Z（中＝紙の面）
     ぱかぱか（pk）は持ち込まない（§7-1）。網点化（tone.on）は印刷用なので持ち込まない（§13-3）
   それ以外の旧形式（ANIMATOR_v1 / PROJECT_v2 / ECONTE zip / OBAN JSON）は P2・P3 で足す。
   ============================================================ */
var LP = window.LP || (window.LP = {});
LP.io = LP.io || {};

(function(){
  'use strict';
  // manga-plate の PAPER_PRESETS（mm と dpi）。paperOf() と同じ式で px にする
  const MP_PAPER = {
    B4_600: { dpi: 600, mm: { w: 230, h: 320, bw: 180, bh: 270 } },
    B4_350: { dpi: 350, mm: { w: 230, h: 320, bw: 180, bh: 270 } },
    B5_600: { dpi: 600, mm: { w: 192, h: 267, bw: 150, bh: 220 } },
  };
  function mpPaper(key){
    const p = MP_PAPER[key] || MP_PAPER.B4_600, k = p.dpi / 25.4, R = v => Math.round(v * k);
    const w = R(p.mm.w), h = R(p.mm.h), bw = R(p.mm.bw), bh = R(p.mm.bh);
    return { w, h, bas: { x: (w - bw) / 2, y: (h - bh) / 2, w: bw, h: bh } };
  }
  const Z_D = { bg: 0.35, mid: 0.6, fg: 0.85 };   // 奥・中（紙の面）・前 → 定規の d
  const ITEM_TYPES = { tone: 1, focus: 1, stream: 1, frame: 1, text: 1, white: 1, brush: 1 };

  function grayOf(c){
    if(!c || c === 'transparent') return 255;
    const m = /^#?([0-9a-f]{6})$/i.exec(c);
    if(!m) return 255;
    const n = parseInt(m[1], 16);
    return Math.round(((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114);
  }

  async function importMangaBook(o){
    const mb = o.book, src = o.src || {};
    const book = LP.book;
    const PP = mpPaper(mb.paper);
    const s = Math.min(book.paper.w / PP.w, book.paper.h / PP.h);
    const ox = (book.paper.w - PP.w * s) / 2, oy = (book.paper.h - PP.h * s) / 2;
    const T = p => ({ x: +(ox + p.x * s).toFixed(2), y: +(oy + p.y * s).toFixed(2) });
    const TR = r => ({ x: ox + r.x * s, y: oy + r.y * s, w: r.w * s, h: r.h * s });
    const S = v => +(v * s).toFixed(2);
    const Sp = p => ({ x: S(p.x), y: S(p.y), w: p.w });
    const gut = mb.gut || { lr: 60, tb: 180 };

    // 画像：srcId → プレート（同じ画像を使う素材が何枚あっても1本）
    const plateOf = new Map();
    let bad = 0;
    async function plateFor(it){
      const ids = Array.isArray(it.srcs) && it.srcs.length ? it.srcs : [it.srcId];
      const key = ids.join('|');
      if(plateOf.has(key)) return plateOf.get(key);
      let plate = null;
      for(const sid of ids){
        const url = src[sid];
        if(!url){ bad++; continue; }
        const blob = await (await fetch(url)).blob();
        let bmp;
        try{ bmp = await createImageBitmap(blob); }catch(e){ bad++; continue; }
        if(!plate){
          plate = LP.model.newPlate(it.name || 'image', bmp.width, bmp.height, 'import');
          const c = document.createElement('canvas'), k = Math.min(1, 240 / Math.max(bmp.width, bmp.height));
          c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
          c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
          plate.thumb = await new Promise(r => c.toBlob(r, 'image/png'));
        }
        plate.cells.push(LP.model.newCell(blob, 1));
        bmp.close && bmp.close();
      }
      if(plate){ book.plates[plate.id] = plate; }
      plateOf.set(key, plate);
      return plate;
    }

    const made = [];
    for(let pi = 0; pi < (mb.pages || []).length; pi++){
      const pg = mb.pages[pi];
      const sh = LP.model.newSheet(book);
      sh.name = sh.name + ' ' + (pg.name || ('P' + (pi + 1)));
      sh.bg = grayOf(mb.bg);
      sh.frame = { bas: TR(PP.bas), edge: TR({ x: 0, y: 0, w: PP.w, h: PP.h }), lw: S(mb.lw || 18), lr: S(gut.lr), tb: S(gut.tb), bindRight: mb.bindRight !== false };
      sh.panels = (pg.panels || []).map(k => ({
        id: k.id, border: k.border !== false, bleed: !!k.bleed,
        base: (k.base || k.poly || []).map(T), poly: (k.poly || []).map(T),
        cuts: (k.cuts || []).map(c => Object.assign({}, c, T({ x: c.ax, y: c.ay }), { gap: S(c.gap || 0) })).map(c => { c.ax = c.x; c.ay = c.y; delete c.x; delete c.y; return c; }),
      }));
      sh.manualOrder = !!pg.manualOrder;
      for(const it of pg.items || []){
        if(it.type === 'img'){
          const plate = await plateFor(it);
          if(!plate) continue;
          const sc = (it.scale || 1) * s, c = T({ x: it.x, y: it.y });
          const w = plate.w * sc, h = plate.h * sc;
          const L = LP.model.newLayer(plate, { x: Math.round(c.x - w / 2), y: Math.round(c.y - h / 2), w: Math.round(w), h: Math.round(h) });
          L.name = it.name || plate.name;
          L.rot = it.rot || 0;
          L.opacity = it.opacity == null ? 1 : it.opacity;
          L.panelId = it.panelId || null;
          L.visible = it.visible !== false; L.locked = !!it.locked;
          if(it.edge) L.edge = { on: !!it.edge.on, w: S(it.edge.w || 24), color: it.edge.color || '#FFFFFF' };
          const d = Z_D[it.z];
          L.z = d == null || d === 0.6 ? 0 : +LP.panels.zFromD(d).toFixed(1);
          sh.layers.push(L);
          continue;
        }
        if(!ITEM_TYPES[it.type]) continue;
        const n = JSON.parse(JSON.stringify(it));
        delete n.pk; delete n.z;
        Object.assign(n, T({ x: it.x, y: it.y }));
        if(n.tIn == null) n.tIn = 0;
        if(n.tOut === undefined) n.tOut = null;
        ['w', 'h', 'dot', 'gap', 'r0', 'r1', 'lw', 'size'].forEach(key => { if(typeof n[key] === 'number') n[key] = S(n[key]); });
        if(n.edge && typeof n.edge.w === 'number') n.edge.w = S(n.edge.w);
        if(Array.isArray(n.poly)) n.poly = n.poly.map(Sp);
        if(Array.isArray(n.pts)) n.pts = n.pts.map(Sp);
        if(Array.isArray(n.subs)) n.subs = n.subs.map(sub => sub.map(Sp));
        sh.items.push(n);
      }
      made.push(sh);
    }
    if(!made.length){ LP.ui.toast('ページがありません'); return false; }
    const first = book.sheets.length;
    made.forEach(sh => book.sheets.push(sh));
    LP.app.select(null, null, true);
    LP.app.commit('MANGA_BOOK を読む');
    LP.app.seek(LP.time.sheetStart(book, first));
    LP.ui.toast('MANGA_BOOK_v2 から ' + made.length + ' 枚の紙を足しました（ページを SCREEN の紙に収めて ' + Math.round(s * 100) + '%）' + (bad ? '　※画像 ' + bad + ' 枚が読めませんでした' : ''), 5000);
    return true;
  }

  /* 何かのファイルを「開く」：BOOK zip（置き換え）／ JSON（旧形式を見分けて足す） */
  async function openAny(file){
    const name = (file.name || '').toLowerCase();
    if(name.endsWith('.zip')) return LP.io.openBookZip(file);
    let o = null;
    try{ o = JSON.parse(await file.text()); }catch(e){ LP.ui.toast('読めないファイルです（JSON ではありません）'); return false; }
    if(o && o.format === 'MANGA_BOOK_v2' && o.book){
      try{ return await importMangaBook(o); }catch(e){ console.error(e); LP.ui.toast('MANGA_BOOK_v2 を読めませんでした：' + (e && e.message || e)); return false; }
    }
    const kind = o && (o.format || o.type || o.kind || (Array.isArray(o.cells) ? 'ANIMATOR_v1' : '') || (o.take && o.panels ? 'OBAN' : ''));
    LP.ui.toast('この形式はまだ読めません' + (kind ? '（' + kind + '）' : '') + '。P1 は MANGA_BOOK_v2 だけ（ANIMATOR / COMPOSER / ECONTE / OBAN は P2・P3）', 5000);
    return false;
  }

  Object.assign(LP.io, { openAny, importMangaBook });
})();
