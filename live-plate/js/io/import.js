/* ============================================================
   LIVE PLATE — io/import.js（読む。SPEC_21 §9-1）
   α付き PNG / WebP / JPEG → PLATE（1セル・src:'import'）
   連番 ^(.*?)(\d{3,5})\.(png|webp|jpe?g)$ の同名4枚以上 → PLATE（cells n枚・dur:1・src:'seq'）
   落とした先で行き先が決まる：
     紙（ステージ）   … いまの紙に層として置く（落とした位置が中心）
     タイムライン     … 1素材＝1枚の新しい紙（落とした位置に差し込む・紙いっぱいに収める）
     素材棚          … しまうだけ（層は作らない）
   ★ 画像は Blob のまま持つ（再エンコードしない）。MAX_AREA を超えるときだけ縮めて作り直す。
   ============================================================ */
var LP = window.LP || (window.LP = {});
LP.io = LP.io || {};

(function(){
  'use strict';
  const $ = s => document.querySelector(s);
  const IMG_RE = /\.(png|webp|jpe?g)$/i;
  const SEQ_RE = /^(.*?)(\d{3,5})\.(png|webp|jpe?g)$/i;
  const THUMB = 240;
  let pickTarget = 'stage', queue = Promise.resolve();

  function canvas(w, h){ const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function toBlob(c, type, q){ return new Promise(res => c.toBlob(b => res(b), type || 'image/png', q)); }
  function stripExt(n){ return n.replace(/\.[^.]+$/, ''); }

  async function thumbOf(bmp){
    const s = Math.min(1, THUMB / Math.max(bmp.width, bmp.height));
    const c = canvas(Math.max(1, Math.round(bmp.width * s)), Math.max(1, Math.round(bmp.height * s)));
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, 0, 0, c.width, c.height);
    return toBlob(c, 'image/png');
  }
  /* 面積の上限を超えたら縮めて作り直す（超えなければ元の Blob のまま＝劣化なし） */
  async function fitBlob(file, bmp){
    const w = bmp.width, h = bmp.height, A = LP.model.MAX_AREA;
    if(w * h <= A) return { blob: file, w, h };
    const k = Math.sqrt(A / (w * h));
    const nw = Math.floor(w * k), nh = Math.floor(h * k);
    const c = canvas(nw, nh), g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, 0, 0, nw, nh);
    const jpg = /jpe?g$/i.test(file.type) || /\.jpe?g$/i.test(file.name);
    return { blob: await toBlob(c, jpg ? 'image/jpeg' : 'image/png', 0.92), w: nw, h: nh, scaled: true };
  }

  /* ファイル群 → プレート群（BOOK にはまだ入れない） */
  async function filesToPlates(files){
    const imgs = [...files].filter(f => (f.type && f.type.startsWith('image/')) || IMG_RE.test(f.name || ''));
    const groups = new Map(), singles = [];
    for(const f of imgs){
      const m = (f.name || '').match(SEQ_RE);
      if(m){
        const key = m[1].toLowerCase() + '|' + m[3].toLowerCase().replace('jpeg', 'jpg');
        if(!groups.has(key)) groups.set(key, { prefix: m[1], list: [] });
        groups.get(key).list.push({ f, n: parseInt(m[2], 10) });
      }else singles.push(f);
    }
    const jobs = [];
    for(const g of groups.values()){
      if(g.list.length < 4){ g.list.forEach(o => singles.push(o.f)); continue; }
      g.list.sort((a, b) => a.n - b.n);
      jobs.push({ kind: 'seq', files: g.list.map(o => o.f), name: (g.prefix.replace(/[_\-. ]+$/, '') || stripExt(g.list[0].f.name)) });
    }
    singles.forEach(f => jobs.push({ kind: 'img', files: [f], name: stripExt(f.name || 'image') }));
    jobs.sort((a, b) => a.name.localeCompare(b.name, 'ja', { numeric: true }));

    const plates = [], bad = [];
    let scaled = 0;
    for(const j of jobs){
      let bmp;
      try{ bmp = await createImageBitmap(j.files[0]); }catch(e){ bad.push(j.files[0].name); continue; }
      const f0 = await fitBlob(j.files[0], bmp);
      if(f0.scaled) scaled++;
      const p = LP.model.newPlate(j.name, f0.w, f0.h, j.kind === 'seq' ? 'seq' : 'import');
      p.thumb = await thumbOf(bmp);
      p.cells.push(LP.model.newCell(f0.blob, 1));
      bmp.close && bmp.close();
      for(let i = 1; i < j.files.length; i++){
        const f = j.files[i];
        let blob = f;
        if(f0.scaled){
          try{ const b = await createImageBitmap(f); blob = (await fitBlob(f, b)).blob; b.close && b.close(); }catch(e){ bad.push(f.name); continue; }
        }
        p.cells.push(LP.model.newCell(blob, 1));
        if(i % 24 === 0) LP.ui.toast('読み込み中… ' + j.name + '  ' + i + ' / ' + j.files.length);
      }
      plates.push(p);
    }
    return { plates, bad, scaled };
  }

  /* 取り込み本体。target: 'stage' | 'timeline' | 'shelf'
     ★ 読み込み中に次を落とされても捨てない＝順番待ちにする（前の取り込みが BOOK に入ってから次） */
  function importFiles(files, target, pt, idx){
    const list = [...files];
    queue = queue.then(() => importNow(list, target, pt, idx)).catch(e => { console.error(e); LP.ui.toast('取り込みに失敗しました：' + (e && e.message || e)); });
    return queue;
  }
  async function importNow(files, target, pt, idx){
    const r = await filesToPlates(files);
    if(!r.plates.length){
      LP.ui.toast(r.bad.length ? '読めない画像でした：' + r.bad.slice(0, 3).join(', ') : '画像がありません（PNG / WebP / JPEG）');
      return;
    }
    r.plates.forEach(p => { LP.book.plates[p.id] = p; });
    const ids = r.plates.map(p => p.id);
    const seqs = r.plates.filter(p => p.src === 'seq');
    let msg = r.plates.length + ' 素材' + (seqs.length ? '（連番 ' + seqs.map(p => p.cells.length + '枚').join('・') + '）' : '');
    if(r.scaled) msg += '　※' + r.scaled + '件は上限（3840×2160 相当）に縮めました';
    if(r.bad.length) msg += '　※読めない ' + r.bad.length + '件';
    if(target === 'shelf'){
      LP.app.commit('素材を取り込む');
      LP.ui.toast(msg + ' → 棚へ');
    }else{
      placePlates(ids, pt, target, idx, msg);
    }
  }

  /* 素材を紙へ（層）／タイムラインへ（新しい紙） */
  function placePlates(ids, pt, target, idx, msg){
    const book = LP.book;
    if(target === 'timeline'){
      let at = idx == null ? book.sheets.length : idx;
      const first = at;
      ids.forEach(id => {
        const p = book.plates[id];
        // 連番の紙は「ループが切れ目で終わる」長さ（12コマ未満なら周回を足す。8枚→16コマ）
        const len = LP.time.plateLen(p);
        const sh = LP.model.newSheet(book, p.cells.length > 1 ? len * Math.ceil(12 / len) : LP.model.DEF_SHEET_DUR);
        sh.name = sh.name + ' ' + p.name.slice(0, 16);
        sh.layers.push(LP.model.newLayer(p, LP.model.fitRect(book, p.w, p.h)));
        book.sheets.splice(at++, 0, sh);
      });
      LP.app.commit('紙を足す');
      LP.app.seek(LP.time.sheetStart(book, first));
      LP.app.refresh(true);
      LP.ui.toast((msg ? msg + ' → ' : '') + ids.length + ' 枚の紙にしました');
      return;
    }
    const sh = LP.app.curSheet();
    if(!sh) return;
    const c = pt || { x: book.paper.w / 2, y: book.paper.h / 2 };
    let last = null;
    ids.forEach((id, i) => {
      const p = book.plates[id];
      const s = LP.model.placeSize(book, p.w, p.h);
      const L = LP.model.newLayer(p, { x: Math.round(c.x - s.w / 2 + i * 48), y: Math.round(c.y - s.h / 2 + i * 48), w: Math.round(s.w), h: Math.round(s.h) });
      const k = LP.panels.panelAt(sh, c.x, c.y);        // 落とした所のコマに入る（コマの外＝枠の上）
      L.panelId = k ? k.id : null;
      sh.layers.push(L);
      last = L;
    });
    if(last) LP.app.select('layer', last.id, true);
    if(LP.state.step !== 'sheet') LP.app.setStep('sheet');
    LP.app.commit('層を置く');
    const k = last && LP.model.panelById(sh, last.panelId);
    LP.ui.toast((msg ? msg + ' → ' : '') + sh.name + (k ? ' のコマ ' + (sh.panels.indexOf(k) + 1) : '') + ' に ' + ids.length + ' 層' + (k ? '（「コマに合わせる」でコマいっぱいに）' : ''));
  }

  /* ファイル選択（棚の＋・ドックの「画像を置く」） */
  function pickFiles(target){
    pickTarget = target || 'stage';
    $('#file-in').click();
  }

  /* D&D：落とした場所で行き先を決める */
  function dropTarget(x, y){
    const el = document.elementFromPoint(x, y);
    if(!el) return 'stage';
    if(el.closest('#side-l')) return 'shelf';
    if(el.closest('#timeline')) return 'timeline';
    return 'stage';
  }
  /* ---- SPEC_24（2026-11-05）: ECONTE CROP からの直送の受け箱 ----
     連携チャンネル（tdr_live / tdr_exchange）には今も参加しない。これは ECONTE の切り出しを
     素材棚へ入れる一方通行の受け口だけ：共有 IDB tdr_crop_push の 'liveplate'（1件・上書き）を
     ts が前回より新しければ棚へ取り込む → 消す → crop-ack。
     連番＝一度に渡す（4枚以上で1素材 cells n枚）／1枚ずつ＝1枚ずつ渡す（別々の素材） */
  const CROP_ID = 'liveplate', CROP_SEEN = 'tdr_crop_seen_v1:liveplate';
  let cropChan = null, cropBusy = false;
  function cropDB(){
    return new Promise((res, rej) => {
      const r = indexedDB.open('tdr_crop_push', 1);
      r.onupgradeneeded = () => { const d = r.result; if(!d.objectStoreNames.contains('push')) d.createObjectStore('push', { keyPath: 'id' }); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function cropInboxCheck(){
    if(cropBusy || LP.state.exporting) return;
    cropBusy = true;
    try{
      const d = await cropDB();
      const rec = await new Promise(res => { const r = d.transaction('push', 'readonly').objectStore('push').get(CROP_ID); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); });
      if(!rec || !Array.isArray(rec.files) || !rec.files.length) return;
      let seen = 0;
      try{ seen = +localStorage.getItem(CROP_SEEN) || 0; }catch(e){}
      if(!(rec.ts > seen)) return;
      try{ localStorage.setItem(CROP_SEEN, String(rec.ts)); }catch(e){}
      const files = rec.files.map(f => new File([f.blob], f.name, { type: f.type || 'image/png' }));
      if(rec.mode === 'seq') await importFiles(files, 'shelf');
      else for(const f of files) await importFiles([f], 'shelf');
      await new Promise(res => { const tx = d.transaction('push', 'readwrite'); tx.objectStore('push').delete(CROP_ID); tx.oncomplete = res; tx.onerror = res; });
      if(cropChan) cropChan.postMessage({ type: 'crop-ack', target: CROP_ID, ts: rec.ts, n: files.length });
      const sz = [...new Set(rec.files.map(f => f.w + '×' + f.h))];
      const msg = 'ECONTE CROP → 素材棚｜' + files.length + '枚・' + (rec.mode === 'seq' ? '連番' : '1枚ずつ') + '｜' + (sz.length === 1 ? sz[0] : ('大きさ ' + sz.length + ' 種類'));
      LP.ui.toast(msg);
      try{ localStorage.setItem('tdr_link_log_v1:ec-lp:recv', JSON.stringify({ t: new Date().toISOString(), app: 'LIVE PLATE', msg })); }catch(e){}
    }catch(e){ console.warn('crop inbox', e); }
    finally{ cropBusy = false; }
  }
  function setupCropInbox(){
    try{ cropChan = new BroadcastChannel('tdr_crop'); cropChan.onmessage = ev => { const m = ev.data; if(m && m.type === 'crop-push' && m.target === CROP_ID) cropInboxCheck(); }; }catch(e){}
    window.addEventListener('storage', e => { if(e.key === 'tdr_crop_inbox_v1:' + CROP_ID) cropInboxCheck(); });
    window.addEventListener('focus', cropInboxCheck);
    setTimeout(cropInboxCheck, 800);
  }

  function init(){
    setupCropInbox();
    $('#file-in').addEventListener('change', e => {
      const fs = e.target.files;
      if(fs && fs.length) importFiles(fs, pickTarget, null, null);
      e.target.value = '';
    });
    let depth = 0;
    const hasFiles = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
    window.addEventListener('dragenter', e => { if(!hasFiles(e)) return; depth++; document.body.classList.add('dragover'); });
    window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if(!depth){ document.body.classList.remove('dragover'); LP.timeline.showDropAt(null); } });
    window.addEventListener('dragover', e => {
      if(!hasFiles(e)) return;
      e.preventDefault();
      const t = dropTarget(e.clientX, e.clientY);
      LP.timeline.showDropAt(t === 'timeline' ? e.clientX : null);
    });
    window.addEventListener('drop', e => {
      if(!hasFiles(e)) return;
      e.preventDefault();
      depth = 0; document.body.classList.remove('dragover'); LP.timeline.showDropAt(null);
      if(LP.state.clean || LP.state.exporting) return;
      const fs = e.dataTransfer.files;
      if(!fs || !fs.length) return;
      // BOOK zip / 旧 MANGA_BOOK_v2 JSON は場所に関係なく「開く」
      const doc = [...fs].find(f => /\.(zip|json)$/i.test(f.name || ''));
      if(doc){ LP.io.openAny(doc); return; }
      const t = dropTarget(e.clientX, e.clientY);
      if(t === 'timeline') importFiles(fs, 'timeline', null, LP.timeline.insertIndexAt(e.clientX));
      else if(t === 'shelf') importFiles(fs, 'shelf');
      else importFiles(fs, 'stage', LP.state.step === 'draw' ? null : LP.stage.clientToPaper(e.clientX, e.clientY));
    });
    // Ctrl+V：画像ならいまの紙に層として（入力欄にいるときは文字の貼り付けを優先）
    window.addEventListener('paste', e => {
      const t = e.target;
      if(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const items = [...((e.clipboardData && e.clipboardData.items) || [])];
      const files = items.filter(it => it.kind === 'file' && it.type.startsWith('image/')).map(it => it.getAsFile()).filter(Boolean);
      if(!files.length) return;
      e.preventDefault();
      importFiles(files, 'stage', null, null);
    });
  }

  Object.assign(LP.io, { init, importFiles, placePlates, pickFiles, filesToPlates });
})();
