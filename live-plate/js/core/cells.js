/* ============================================================
   LIVE PLATE — core/cells.js（描いている絵の置き場＝編集バッファ・Blob への書き戻し・矩形タイル Undo）
   SPEC_21 §7-2 / §9-3。
   ・02 DRAW で開いたセルは、レーンごとに**プレート原寸の canvas**（編集バッファ）を持つ。描くのはここ。
   ・LP.cache.img(cell, lane) はバッファがあればそれを返す＝ステージ・サムネ・カメラ・書き出しが**描いた瞬間の絵**を見る
     （renderFrame は view.img しか知らない＝描画経路は増えない）。
   ・Blob（BOOK の正）は後から作る：描き終えて少し待つ（ENCODE_MS）か、保存・書き出し・BOOK zip の前に flush()。
     作った Blob は BOOK と**全部の Undo スナップショット**へ書き込む（history.patchBlob）。
   ・塗レーンは最初に塗るまで作らない（SPEC_20：線だけのセルのメモリを増やさない）。
   ・Undo は econte の txBegin / txTouch / txEnd：触る前に紙を1枚控え、離したら**変わった矩形だけ** before/after で積む。
   ・バッファは LRU（MAX_BUFS）。まだ Blob にしていないものは捨てない。
   ============================================================ */
var LP = window.LP || (window.LP = {});

(function(){
  'use strict';
  const ENCODE_MS = 700, MAX_BUFS = 16, UNDO_PAD = 3;
  const bufs = new Map();          // cellId → { plateId, cellId, w, h, line, fill, dirty:{}, ver:{}, t }
  let encT = 0, encoding = null, tick = 0, gTx = null;

  function cvs(w, h){ const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function find(cellId, plateId){
    const b = LP.book;
    if(plateId && b.plates[plateId]){
      const c = b.plates[plateId].cells.find(o => o.id === cellId);
      if(c) return { plate: b.plates[plateId], cell: c };
    }
    for(const pid in b.plates){
      const c = b.plates[pid].cells.find(o => o.id === cellId);
      if(c) return { plate: b.plates[pid], cell: c };
    }
    return null;
  }

  /* LP.cache.img から：バッファがあれば canvas（そのレーンが無ければ null）／無ければ undefined */
  function live(cell, lane){
    const b = bufs.get(cell.id);
    if(!b) return undefined;
    b.t = ++tick;
    return b[lane] || null;
  }
  function get(cellId){ return bufs.get(cellId) || null; }

  async function laneFromBlob(blob, w, h){
    const c = cvs(w, h);
    if(!blob) return c;
    const bmp = await createImageBitmap(blob);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.drawImage(bmp, 0, 0, w, h);
    bmp.close && bmp.close();
    return c;
  }
  /* セルを開く（バッファを作る）。すでにあればそれ */
  const opening = new Map();
  function open(plate, cell){
    const hit = bufs.get(cell.id);
    if(hit){ hit.t = ++tick; return Promise.resolve(hit); }
    if(opening.has(cell.id)) return opening.get(cell.id);
    const pr = (async () => {
      const line = await laneFromBlob(cell.line, plate.w, plate.h);
      const fill = cell.fill ? await laneFromBlob(cell.fill, plate.w, plate.h) : null;
      const b = { plateId: plate.id, cellId: cell.id, w: plate.w, h: plate.h, line, fill, dirty: {}, ver: { line: 0, fill: 0 }, t: ++tick };
      if(!bufs.has(cell.id)) bufs.set(cell.id, b);
      opening.delete(cell.id);
      evict();
      return bufs.get(cell.id);
    })();
    opening.set(cell.id, pr);
    pr.catch(() => opening.delete(cell.id));
    return pr;
  }
  /* 空のセルを作ったときなど、Blob を経ずにバッファを直接持たせる */
  function adopt(plate, cell, line, fill){
    const b = { plateId: plate.id, cellId: cell.id, w: plate.w, h: plate.h, line: line || cvs(plate.w, plate.h), fill: fill || null, dirty: {}, ver: { line: 0, fill: 0 }, t: ++tick };
    bufs.set(cell.id, b);
    if(line) mark(b, 'line');
    if(fill) mark(b, 'fill');
    evict();
    return b;
  }
  function laneCanvas(b, lane, create){
    if(!b[lane] && create) b[lane] = cvs(b.w, b.h);
    return b[lane];
  }
  function evict(){
    if(bufs.size <= MAX_BUFS) return;
    const keep = LP.drawTools && LP.drawTools.protectedCells ? LP.drawTools.protectedCells() : new Set();
    const list = [...bufs.values()].filter(b => !b.dirty.line && !b.dirty.fill && !keep.has(b.cellId)).sort((a, b) => a.t - b.t);
    while(bufs.size > MAX_BUFS && list.length) bufs.delete(list.shift().cellId);
  }

  /* 変えた印。少し待って Blob にする */
  function mark(b, lane){
    b.dirty[lane] = true;
    b.ver[lane] = (b.ver[lane] || 0) + 1;
    clearTimeout(encT);
    encT = setTimeout(() => { flush(); }, ENCODE_MS);
    if(LP.app && LP.app.onSaved) LP.app.onSaved(null);
  }
  function toBlob(c){ return new Promise(res => c.toBlob(res, 'image/png')); }
  /* 変えたレーンを全部 Blob にして BOOK へ（保存・書き出しの前にも呼ぶ） */
  function flush(quiet){
    clearTimeout(encT);
    if(encoding) return encoding.then(() => (anyDirty() ? flush(quiet) : null));
    if(!anyDirty()) return Promise.resolve();
    encoding = (async () => {
      const touched = new Set();
      for(const b of [...bufs.values()]){
        for(const lane of ['line', 'fill']){
          if(!b.dirty[lane] || !b[lane]) continue;
          const v = b.ver[lane];
          const blob = await toBlob(b[lane]);
          if(b.ver[lane] === v) b.dirty[lane] = false;
          const f = find(b.cellId, b.plateId);
          if(!f || !blob) continue;
          f.cell[lane] = blob;
          LP.hist.patchBlob(f.plate.id, b.cellId, lane, blob);
          touched.add(f.plate.id);
        }
      }
      for(const pid of touched) await thumb(pid);
      encoding = null;
      if(touched.size){
        if(!quiet) LP.store.saveSoon();
        if(LP.sides) LP.sides.refreshPlate([...touched]);
      }
    })().catch(e => { encoding = null; console.error('[LIVE PLATE] 絵の書き戻しに失敗', e); });
    return encoding;
  }
  function anyDirty(){ for(const b of bufs.values()) if(b.dirty.line || b.dirty.fill) return true; return false; }
  /* 棚のサムネ（1枚目のセル＝塗→線） */
  async function thumb(pid){
    const p = LP.book.plates[pid];
    if(!p || !p.cells.length) return;
    const c0 = p.cells[0], k = Math.min(1, 240 / Math.max(p.w, p.h));
    const c = cvs(Math.max(1, Math.round(p.w * k)), Math.max(1, Math.round(p.h * k)));
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    for(const lane of ['fill', 'line']){
      const im = LP.cache.img(c0, lane);
      if(im) g.drawImage(im, 0, 0, c.width, c.height);
    }
    p.thumb = await toBlob(c);
  }

  /* ---------- 矩形タイル Undo（econte txBegin / txTouch / txEnd） ---------- */
  function txBegin(){ if(gTx) txEnd(); gTx = new Map(); }
  /* x0..y1 はプレート px（呼ぶ側で線幅ぶん膨らませる） */
  function txTouch(b, lane, x0, y0, x1, y1){
    if(!gTx || !b) return;
    const key = b.cellId + ':' + lane;
    let e = gTx.get(key);
    if(!e){
      const c = b[lane];
      let snap = null;
      if(c){ snap = cvs(c.width, c.height); snap.getContext('2d').drawImage(c, 0, 0); }
      e = { b, lane, snap, x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
      gTx.set(key, e);
    }
    e.x0 = Math.min(e.x0, x0); e.y0 = Math.min(e.y0, y0);
    e.x1 = Math.max(e.x1, x1); e.y1 = Math.max(e.y1, y1);
  }
  function txTouchAll(b, lane){ txTouch(b, lane, 0, 0, b.w, b.h); }
  const clamp = (v, a, z) => v < a ? a : (v > z ? z : v);
  function txEnd(label){
    const tx = gTx;
    gTx = null;
    if(!tx || !tx.size) return false;
    const items = [];
    tx.forEach(e => {
      const c = e.b[e.lane];
      if(!c || e.x1 < e.x0) return;
      const x = clamp(Math.floor(e.x0) - UNDO_PAD, 0, c.width - 1), y = clamp(Math.floor(e.y0) - UNDO_PAD, 0, c.height - 1);
      const w = clamp(Math.ceil(e.x1) + UNDO_PAD, x + 1, c.width) - x, h = clamp(Math.ceil(e.y1) + UNDO_PAD, y + 1, c.height) - y;
      if(w <= 0 || h <= 0) return;
      const before = e.snap ? e.snap.getContext('2d').getImageData(x, y, w, h) : new ImageData(w, h);
      const after = c.getContext('2d').getImageData(x, y, w, h);
      items.push({ plateId: e.b.plateId, cellId: e.b.cellId, lane: e.lane, x, y, before, after });
      mark(e.b, e.lane);
    });
    if(!items.length) return false;
    LP.hist.pushPx(label, items);
    return true;
  }
  /* 控えに戻して、その回を積まずに捨てる（浮いた選択の Esc 専用） */
  function txAbort(){
    const tx = gTx;
    gTx = null;
    if(!tx) return;
    tx.forEach(e => {
      const c = e.b[e.lane];
      if(!c) return;
      const g = c.getContext('2d');
      if(e.snap){ g.save(); g.globalCompositeOperation = 'copy'; g.drawImage(e.snap, 0, 0); g.restore(); }
      else e.b[e.lane] = null;   // このときに作ったレーン＝無かったことに
    });
  }
  function txOpen(){ return !!gTx; }
  /* Undo / Redo（history.js から）。追い出されたセルは起こしてから貼る */
  async function applyTiles(items, which){
    for(const it of items){
      let b = bufs.get(it.cellId);
      if(!b){
        const f = find(it.cellId, it.plateId);
        if(!f) continue;              // セルがもう無い（BOOK の手で消えた先）
        b = await open(f.plate, f.cell);
      }
      laneCanvas(b, it.lane, true).getContext('2d').putImageData(it[which], it.x, it.y);
      mark(b, it.lane);
    }
    LP.stage.renderQ();
    if(LP.drawTools) LP.drawTools.afterPixels();
  }

  /* セルの複製（バッファがあれば中身ごと。Blob はまだ古いかもしれないので） */
  function copyInto(plate, src, dst){
    const b = bufs.get(src.id);
    if(!b) return;
    const cp = c => { if(!c) return null; const n = cvs(c.width, c.height); n.getContext('2d').drawImage(c, 0, 0); return n; };
    adopt(plate, dst, cp(b.line), cp(b.fill));
  }
  function stats(){ let n = 0, d = 0; for(const b of bufs.values()){ n++; if(b.dirty.line || b.dirty.fill) d++; } return { bufs: n, dirty: d }; }
  function clear(){ bufs.clear(); opening.clear(); gTx = null; clearTimeout(encT); }

  LP.cells = { live, get, open, adopt, laneCanvas, mark, flush, anyDirty, txBegin, txTouch, txTouchAll, txEnd, txAbort, txOpen, applyTiles, copyInto, stats, clear };
})();
