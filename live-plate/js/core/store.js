/* ============================================================
   LIVE PLATE — core/store.js（保存と画像の常駐）SPEC_21 §9-3 / §11-2
   IndexedDB `live_plate_db_v1`
     book  : 'main' → BOOK の JSON（Blob は true に置き換えて外す）
     blobs : '<cellId>|line' '<cellId>|fill' '<plateId>|thumb' → Blob（行単位＝差分保存）
     assets: 写真・音（P4/P5）
   ★ Blob が正・ビットマップは遅延デコード（econte ensureResident の考え方）。
     常駐はセル単位のバイト予算で古いものから捨てる（連番プレートは1本でセルが数百枚あるので
     econte の「プレート8枚」では数えられない＝SPEC_21 からの変更点。§15 に記録）。
   ★ HARNESS_ON のときは読まない・書かない。
   ============================================================ */
var LP = window.LP || (window.LP = {});

(function(){
  'use strict';
  const DB_NAME = 'live_plate_db_v1', DB_VER = 1;
  let db = null, timer = 0, busy = false, again = false;
  let saved = new Map();          // key → 保存済みの Blob（同じ Blob なら書かない）

  function openDB(){
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = () => {
        const d = r.result;
        ['book', 'blobs', 'assets'].forEach(n => { if(!d.objectStoreNames.contains(n)) d.createObjectStore(n); });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  function reqP(r){ return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  function txDone(tx){ return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); }); }

  function blobEntries(book){
    const m = new Map();
    for(const pid in book.plates){
      const p = book.plates[pid];
      if(p.thumb instanceof Blob) m.set(pid + '|thumb', p.thumb);
      for(const c of p.cells){
        if(c.line instanceof Blob) m.set(c.id + '|line', c.line);
        if(c.fill instanceof Blob) m.set(c.id + '|fill', c.fill);
      }
    }
    return m;
  }
  function bookJSON(book){
    return JSON.stringify(book, (k, v) => (v instanceof Blob) ? true : v);
  }

  async function load(){
    if(LP.HARNESS_ON) return null;
    try{ db = await openDB(); }catch(e){ console.warn('[LIVE PLATE] IndexedDB を開けません', e); return null; }
    try{ if(navigator.storage && navigator.storage.persist) navigator.storage.persist(); }catch(e){}
    const tx = db.transaction(['book', 'blobs'], 'readonly');
    const json = await reqP(tx.objectStore('book').get('main'));
    const keys = await reqP(tx.objectStore('blobs').getAllKeys());
    const vals = await reqP(tx.objectStore('blobs').getAll());
    if(!json) return null;
    const blobs = new Map();
    keys.forEach((k, i) => blobs.set(k, vals[i]));
    const book = LP.model.migrate(JSON.parse(json));
    for(const pid in book.plates){
      const p = book.plates[pid];
      p.thumb = blobs.get(pid + '|thumb') || null;
      for(const c of p.cells){
        c.line = c.line ? (blobs.get(c.id + '|line') || null) : null;
        c.fill = c.fill ? (blobs.get(c.id + '|fill') || null) : null;
      }
    }
    saved = blobEntries(book);
    return book;
  }

  async function save(){
    if(LP.HARNESS_ON || !db) return;
    if(busy){ again = true; return; }
    busy = true;
    try{
      const cur = blobEntries(LP.book);
      const tx = db.transaction(['book', 'blobs'], 'readwrite');
      tx.objectStore('book').put(bookJSON(LP.book), 'main');
      const bs = tx.objectStore('blobs');
      for(const [k, b] of cur) if(saved.get(k) !== b) bs.put(b, k);
      for(const k of saved.keys()) if(!cur.has(k)) bs.delete(k);
      await txDone(tx);
      saved = cur;
      LP.app && LP.app.onSaved && LP.app.onSaved(true);
    }catch(e){
      console.warn('[LIVE PLATE] 保存に失敗', e);
      LP.app && LP.app.onSaved && LP.app.onSaved(false, e);
    }
    busy = false;
    if(again){ again = false; saveSoon(); }
  }
  function saveSoon(){
    if(LP.HARNESS_ON) return;
    clearTimeout(timer);
    timer = setTimeout(save, 400);
    LP.app && LP.app.onSaved && LP.app.onSaved(null);
  }
  /* 全消去（NEW BOOK）。戻せない操作なので呼ぶ側で確認を取る */
  async function wipe(){
    if(LP.HARNESS_ON || !db) return;
    const tx = db.transaction(['book', 'blobs'], 'readwrite');
    tx.objectStore('book').clear(); tx.objectStore('blobs').clear();
    await txDone(tx);
    saved = new Map();
  }

  LP.store = { load, save, saveSoon, wipe };

  /* ------------------------------------------------------------
     ビットマップの常駐（LRU・バイト予算）
     img(cell, lane)：drawable ／ null（そのレーンは空）／ false（デコード中＝あとで描き直す）
     ------------------------------------------------------------ */
  const MAX_BYTES = 1024 * 1024 * 1024;   // PC 前提（§13-6）。iPad を載せるときに下げる
  const map = new Map();                   // key → {bmp, src, bytes} | {pending, src} | {bad, src}
  let bytes = 0, notifyT = 0;

  function img(cell, lane){
    const b = cell[lane];
    if(!b) return null;
    const k = cell.id + '|' + lane;
    let e = map.get(k);
    if(e && e.src !== b){ drop(k); e = null; }   // 描き直しで Blob が差し替わった（P2）
    if(e){
      if(e.bmp){ map.delete(k); map.set(k, e); return e.bmp; }   // 触ったものを最後尾へ＝最近使った
      return e.bad ? null : false;
    }
    decode(k, b);
    return false;
  }
  function decode(k, b){
    map.set(k, { pending: true, src: b });
    createImageBitmap(b).then(bmp => {
      const cur = map.get(k);
      if(!cur || cur.src !== b){ bmp.close && bmp.close(); return; }
      const e = { bmp, src: b, bytes: bmp.width * bmp.height * 4 };
      map.set(k, e); bytes += e.bytes;
      evict();
      clearTimeout(notifyT);
      notifyT = setTimeout(() => LP.app && LP.app.onDecoded && LP.app.onDecoded(), 16);
    }).catch(() => map.set(k, { bad: true, src: b }));
  }
  function drop(k){
    const e = map.get(k);
    if(e && e.bmp){ bytes -= e.bytes; e.bmp.close && e.bmp.close(); }
    map.delete(k);
  }
  function evict(){
    if(bytes <= MAX_BYTES) return;
    for(const k of map.keys()){
      if(bytes <= MAX_BYTES * 0.85) break;
      const e = map.get(k);
      if(e && e.bmp) drop(k);
    }
  }
  /* 検証フィクスチャ用：デコードを待たずに絵を直接置く（決定論のため） */
  function put(cell, lane, drawable){
    const k = cell.id + '|' + lane;
    drop(k);
    map.set(k, { bmp: drawable, src: cell[lane], bytes: drawable.width * drawable.height * 4 });
    bytes += drawable.width * drawable.height * 4;
  }
  /* 棚・一覧のサムネ（Blob → objectURL を1回だけ作る） */
  const urls = new WeakMap();
  function thumbURL(blob){
    if(!blob) return '';
    let u = urls.get(blob);
    if(!u){ u = URL.createObjectURL(blob); urls.set(blob, u); }
    return u;
  }
  function stats(){ let n = 0; for(const e of map.values()) if(e.bmp) n++; return { resident: n, bytes }; }

  LP.cache = { img, put, thumbURL, stats };
})();
