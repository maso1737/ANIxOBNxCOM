/* ============================================================
   LIVE PLATE — io/book-zip.js（BOOK zip：作品を丸ごと持ち出す／戻す。SPEC_21 §9-1）
   中身：liveplate.json（BOOK。画像の所は zip 内のパス文字列）＋ cells/<cellId>.<lane>.<ext> ＋ thumbs/<plateId>.png
   ★ 依存ゼロの zip（書く＝無圧縮 store／読む＝store と deflate。deflate は DecompressionStream）。
     画像はもともと圧縮済み（PNG/JPEG/WebP）なので store で十分小さい。CDN が無いオフラインでも動く。
   ★ 読み込みは「置き換え」（§9-1。戻せないので確認を取る）。
   ============================================================ */
var LP = window.LP || (window.LP = {});
LP.io = LP.io || {};

(function(){
  'use strict';
  const FORMAT = 'LIVE_PLATE_BOOK';
  const enc = new TextEncoder();

  /* ---------- CRC32 ---------- */
  let CRC_T = null;
  function crc32(u8){
    if(!CRC_T){
      CRC_T = new Uint32Array(256);
      for(let n = 0; n < 256; n++){ let c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; }
    }
    let c = 0xFFFFFFFF;
    for(let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function dosTime(d){
    return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
  }

  /* ---------- 書く（store） entries: [{name, data: Uint8Array}] → Blob ---------- */
  function zipStore(entries){
    const parts = [], central = [];
    let off = 0;
    const t = dosTime(new Date());
    for(const e of entries){
      const name = enc.encode(e.name), data = e.data, crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, t.time, true); h.setUint16(12, t.date, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
      h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(h.buffer, name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, t.time, true); c.setUint16(14, t.date, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(c.buffer, name);
      off += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((a, b) => a + b.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
    return new Blob(parts.concat(central, [end.buffer]), { type: 'application/zip' });
  }

  /* ---------- 読む（store / deflate） file → Map(name → Blob) ---------- */
  async function unzip(file){
    const buf = await file.arrayBuffer(), dv = new DataView(buf), u8 = new Uint8Array(buf);
    let eocd = -1;
    for(let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if(dv.getUint32(i, true) === 0x06054b50){ eocd = i; break; }
    if(eocd < 0) throw new Error('zip ではありません');
    const n = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const dec = new TextDecoder();
    const out = new Map();
    for(let i = 0; i < n; i++){
      if(dv.getUint32(p, true) !== 0x02014b50) throw new Error('zip の目次が壊れています');
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      const lo = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
      p += 46 + nl + xl + cl;
      if(name.endsWith('/')) continue;
      const ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
      const raw = file.slice(ds, ds + csize);
      if(method === 0) out.set(name, raw);
      else if(method === 8){
        if(typeof DecompressionStream === 'undefined') throw new Error('このブラウザは圧縮 zip を読めません');
        out.set(name, await new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob());
      }else throw new Error('対応していない圧縮方式です（' + method + '）');
    }
    return out;
  }

  const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

  /* BOOK → zip */
  async function saveBookZip(){
    await LP.cells.flush();                    // 02 DRAW で描いた絵を Blob へ
    const book = LP.book;
    const paths = new Map(), files = [];
    const pathOf = (blob, base) => {
      if(!paths.has(blob)){
        const p = base + '.' + (EXT[blob.type] || 'png');
        paths.set(blob, p); files.push([p, blob]);
      }
      return paths.get(blob);
    };
    for(const pid in book.plates){
      const pl = book.plates[pid];
      if(pl.thumb instanceof Blob) pathOf(pl.thumb, 'thumbs/' + pid);
      for(const c of pl.cells){
        if(c.line instanceof Blob) pathOf(c.line, 'cells/' + c.id + '.line');
        if(c.fill instanceof Blob) pathOf(c.fill, 'cells/' + c.id + '.fill');
      }
    }
    const json = JSON.stringify({ format: FORMAT, ver: 1, saved: new Date().toISOString(), book: book }, (k, v) => (v instanceof Blob) ? paths.get(v) : v);
    LP.ui.toast('BOOK を zip にまとめています…（画像 ' + files.length + ' 枚）');
    const entries = [{ name: 'liveplate.json', data: enc.encode(json) }];
    for(const [p, b] of files) entries.push({ name: p, data: new Uint8Array(await b.arrayBuffer()) });
    const zip = zipStore(entries);
    const d = new Date(), pad = x => String(x).padStart(2, '0');
    const fname = 'liveplate-' + (book.name || 'book').replace(/[\\/:*?"<>|\s]+/g, '_') + '-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.zip';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(zip); a.download = fname;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    LP.ui.toast('BOOK を保存しました — ' + fname + '（' + (zip.size / 1048576).toFixed(1) + ' MB）', 5000);
    return { name: fname, size: zip.size, blob: zip };
  }

  /* zip → BOOK（置き換え。確認は呼ぶ側） */
  async function readBookZip(file){
    const m = await unzip(file);
    const j = m.get('liveplate.json');
    if(!j) throw new Error('LIVE PLATE の BOOK zip ではありません（liveplate.json が無い）');
    const o = JSON.parse(await j.text());
    if(!o || o.format !== FORMAT || !o.book) throw new Error('LIVE PLATE の BOOK zip ではありません');
    const typed = (p) => {
      const b = m.get(p);
      if(!b) return null;
      const ext = (p.split('.').pop() || '').toLowerCase();
      return b.type ? b : new Blob([b], { type: MIME[ext] || 'application/octet-stream' });
    };
    let missing = 0;
    for(const pid in o.book.plates || {}){
      const pl = o.book.plates[pid];
      pl.thumb = typeof pl.thumb === 'string' ? typed(pl.thumb) : null;
      for(const c of pl.cells || []){
        ['line', 'fill'].forEach(ln => {
          if(typeof c[ln] === 'string'){ const b = typed(c[ln]); if(!b) missing++; c[ln] = b; }
          else c[ln] = null;
        });
      }
    }
    return { book: LP.model.migrate(o.book), missing };
  }

  async function openBookZip(file){
    const ok = await LP.ui.modalConfirm('いまの BOOK を「' + file.name + '」で置き換えます。\nいまの紙・層・素材は消えます（元に戻せません）。\n残したいときは先に ⇩ BOOK 保存 を。', '置き換える');
    if(!ok) return false;
    try{
      const r = await readBookZip(file);
      LP.app.stop();
      LP.cells.clear();
      LP.book = r.book;
      LP.state.t = 0; LP.state.selLayer = null; LP.state.selItem = null; LP.state.selPanel = null;
      LP.hist.reset();
      LP.store.saveSoon();
      LP.app.refresh();
      LP.ui.toast('BOOK を開きました — 紙 ' + r.book.sheets.length + ' 枚・素材 ' + Object.keys(r.book.plates).length + (r.missing ? '（画像が ' + r.missing + ' 枚見つかりませんでした）' : ''), 4000);
      return true;
    }catch(e){
      console.error(e);
      LP.ui.toast('開けませんでした：' + (e && e.message || e), 4000);
      return false;
    }
  }

  Object.assign(LP.io, { saveBookZip, openBookZip, readBookZip, zipStore, unzip });
})();
