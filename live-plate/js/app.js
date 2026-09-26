/* ============================================================
   LIVE PLATE — app.js（状態・ステップ・再生・BOOK の操作・起動）
   BOOK（LP.book）が唯一のデータ。LP.state は「いまどこを見ているか」だけ（作品ではない）。
   ★ 変更の流れ：BOOK を直接書き換える → LP.app.commit(label)（Undo に積む・保存予約・全体を描き直す）
   ★ いまの紙＝プレイヘッドのいる紙（sheetAt(t)）。紙を選ぶ＝その頭へ移動する（econte と同じ）。
   ============================================================ */
var LP = window.LP || (window.LP = {});
LP.HARNESS_ON = /[?&]harness=1\b/.test(location.search);

(function(){
  'use strict';
  const $ = s => document.querySelector(s);
  LP.state = {
    step: 'sheet', t: 0, playing: false, clean: false, exporting: false,
    // 選択は1つだけ（層／仕上げ素材／コマ）。分割線（EDIT）は道具の中だけ
    selLayer: null, selItem: null, selPanel: null, selCut: null,
    // 01 SHEET の道具とモード（mode/sheet.js）
    tool: 'sel', selMode: 'art', divMode: 'f', toneKind: 'tone', textVert: true, whiteErase: false,
    // 02 DRAW の道具（mode/draw.js。localStorage に覚える＝作品ではない）
    draw: LP.drawTools.D,
  };
  const STEPS = ['sheet', 'draw', 'take', 'show'];
  const TOOL_HINT = {
    sel:   () => LP.state.selMode === 'panel' ? 'SEL（コマ）：コマをクリックで選ぶ／Wクリックで素材へ' : 'SEL：選んで動かす・角で大きさ（層を Wクリックで 02 DRAW）',
    div:   () => 'DIV：紙の上に線を引いてコマを割る（' + { f: '斜め', v: '縦', h: '横' }[LP.state.divMode] + '・紙の外から引く＝縦横・Shift＝15°）',
    edit:  () => 'EDIT：分割線の ■＝平行移動／●＝回転（Shift＝15°）',
    text:  () => 'TEXT：クリックした所に文字（' + (LP.state.textVert ? '縦書き' : '横書き') + '）→ 詳細で打つ',
    tone:  () => 'TONE：クリックしたコマに ' + LP.model.ITEM_NAMES[LP.state.toneKind] + '（Wクリックで種類）',
    white: () => '白：' + (LP.state.whiteErase ? '消し' : 'ホワイト') + '（ドラッグで囲う／クリックで始める＝多角形・Enter で閉じる）',
  };
  const HINT = {
    sheet: ['01 SHEET', ''],
    draw:  ['02 DRAW',  ''],
    take:  ['03 TAKE',  'カメラの窓＝書き出しと同じ画（KF を打つのは P3）'],
    show:  ['04 SHOW',  '▶ PLAY で全画面 ／ HTML を書き出す'],
  };
  const DRAW_HINT = {
    pen:   () => 'PEN：' + (LP.state.draw.lane === 'fill' ? '塗レーン（塗り残しの補修）' : '線レーン') + '・筆圧 ' + (LP.state.draw.pressure ? 'ON' : 'OFF') + '（P を2回）・Shift＋クリック＝直線',
    erase: () => 'ERASE：透明にする（E を2回＝このセルを全消去）',
    fill:  () => LP.state.draw.fillErase ? 'FILL：投げ縄消し（囲った中を透明に・いまのレーン）' : LP.state.draw.fillMode === 'lasso' ? 'FILL：投げ縄塗り（塗レーン）' : 'FILL：バケツ（線が壁・' + LP.state.draw.under + 'px 潜る）',
    sel:   () => 'SEL：ドラッグ＝投げ縄／Shift＝矩形で持ち上げる → 隅＝拡縮・外＝回転・Ctrl＋隅＝自由変形（A を2回＝WARP）',
    eye:   () => 'EYE：クリックした所の色を拾う（Alt＋クリックはどの道具からでも）',
  };
  let lastIdx = -1, raf = 0, lastNow = 0, acc = 0;

  /* ---------- いま ---------- */
  function total(){ return LP.time.totalFrames(LP.book); }
  function curAt(){ return LP.time.sheetAt(LP.book, LP.state.t); }
  function curSheet(){ const a = curAt(); return a ? a.sheet : null; }
  function selLayer(){
    const s = curSheet();
    return s && LP.state.selLayer ? LP.model.layerById(s, LP.state.selLayer) : null;
  }
  function selItem(){ const s = curSheet(); return s && LP.state.selItem ? LP.model.itemById(s, LP.state.selItem) : null; }
  function selPanel(){ return LP.model.panelById(curSheet(), LP.state.selPanel); }
  function clampT(){ LP.state.t = Math.max(0, Math.min(total() - 1, Math.round(LP.state.t))); }
  function outSize(long){ long = long || LP.book.out.long; return { w: long, h: Math.round(long * 9 / 16) }; }

  /* ---------- 時間 ---------- */
  function seek(t){
    LP.state.t = t;
    clampT();
    onTime();
  }
  let lastCell = null;
  function onTime(){
    const a = curAt(), i = a ? a.i : -1;
    LP.timeline.playhead();
    LP.stage.renderQ();
    if(LP.state.step === 'draw'){
      // 描いているセルが替わった＝浮いている形は先に確定・次のセルを開く・セル行の「いま」を付け直す
      const tg = LP.drawTools.target(), cid = tg && tg.cell ? tg.cell.id : null;
      if(cid !== lastCell){
        lastCell = cid;
        if(LP.drawSel.floatCell() && LP.drawSel.floatCell() !== cid) LP.drawSel.settle();
        LP.drawTools.sync();
        if(!LP.state.playing){ LP.timeline.renderCells(); LP.dock.render(); }
        hud();
      }
    }
    if(i !== lastIdx){
      lastIdx = i;
      LP.timeline.markCurrent();
      LP.timeline.renderCells();
      LP.sides.markCurrent();
      LP.sides.renderItems();
      if(!LP.state.exporting) LP.dock.render();
      LP.detail.render();
    }
  }
  function jumpSheet(d){
    const a = curAt();
    if(!a) return;
    stop();
    if(d < 0) seek(a.local > 0 ? a.start : LP.time.sheetStart(LP.book, Math.max(0, a.i - 1)));
    else if(a.i < LP.book.sheets.length - 1) seek(LP.time.sheetStart(LP.book, a.i + 1));
  }
  function prefetch(){
    for(let k = 1; k <= 4; k++){
      const a = LP.time.sheetAt(LP.book, (LP.state.t + k) % Math.max(1, total()));
      if(!a) continue;
      for(const L of a.sheet.layers){
        const p = LP.book.plates[L.plateId];
        if(!p || !L.visible) continue;
        const ci = LP.time.cellIndexAt(p, L, a.local);
        if(ci >= 0){ LP.cache.img(p.cells[ci], 'line'); LP.cache.img(p.cells[ci], 'fill'); }
      }
    }
  }
  function tick(now){
    if(!LP.state.playing) return;
    acc += (now - lastNow) * LP.book.fps / 1000;
    lastNow = now;
    if(acc >= 1){
      const n = Math.floor(acc);
      acc -= n;
      LP.state.t = (LP.state.t + n) % Math.max(1, total());
      onTime();
      prefetch();
    }
    raf = requestAnimationFrame(tick);
  }
  function play(){
    if(LP.state.playing || total() <= 1) return;
    LP.state.playing = true;
    lastNow = performance.now(); acc = 0;
    raf = requestAnimationFrame(tick);
    LP.timeline.playhead();
  }
  function stop(){
    if(!LP.state.playing) return;
    LP.state.playing = false;
    cancelAnimationFrame(raf);
    LP.timeline.playhead();
  }
  function togglePlay(){ LP.state.playing ? stop() : play(); }
  /* SHOW の ▶ PLAY：UI を全部消して頭から（Esc で戻る） */
  function playFull(){
    LP.state.clean = true;
    document.body.classList.add('cleanview');
    seek(0);
    play();
  }
  function exitClean(){
    LP.state.clean = false;
    document.body.classList.remove('cleanview');
    stop();
    LP.stage.fit();
  }

  /* ---------- ステップ ---------- */
  function setStep(s){
    if(STEPS.indexOf(s) < 0) return;
    if(s !== 'draw' && LP.state.step === 'draw'){ LP.drawSel.settle(); LP.drawTools.cancel(); }
    LP.state.step = s;
    STEPS.forEach(k => document.body.classList.toggle('step-' + k, k === s));
    document.querySelectorAll('#bar .step').forEach(b => b.classList.toggle('on', b.dataset.step === s));
    LP.dock.render();
    crumb();
    LP.stage.renderQ();
    LP.stage.renderOv();
    LP.timeline.renderCells();
    if(s === 'draw') LP.drawTools.sync();
    hud();
  }
  function crumb(){
    const h = HINT[LP.state.step];
    const txt = LP.state.step === 'sheet' ? TOOL_HINT[LP.state.tool]() : LP.state.step === 'draw' ? DRAW_HINT[LP.state.draw.tool]() : h[1];
    $('#crumb').innerHTML = '<b>' + h[0] + '</b>' + LP.ui.esc(txt);
  }
  function hud(){
    const z = LP.stage.zoomPct();
    $('#stage-hud').innerHTML = (LP.state.step === 'draw' ? LP.drawTools.hudText() : LP.state.step === 'sheet' ? 'PAPER' : 'CAMERA') + ' <b>' + z + '%</b>';
  }
  function escape(){
    if(LP.state.step === 'draw' && LP.drawTools.cancel()) return;   // 変形・投げ縄（02 DRAW）
    if(LP.sheetTools.cancel()) return;          // 投げ縄・分割のプレビュー
    if(LP.settings.open){ LP.settings.toggle(false); return; }
    if(LP.state.clean){ exitClean(); return; }
    if(LP.state.playing){ stop(); return; }
    if(LP.state.step === 'draw'){ setStep('sheet'); return; }
    if(LP.state.selLayer || LP.state.selItem || LP.state.selPanel){ select(null); return; }
  }

  /* ---------- 描き直し ---------- */
  function refresh(){
    clampT();
    lastIdx = curAt() ? curAt().i : -1;
    LP.sides.render();
    LP.timeline.render();
    if(!LP.state.exporting) LP.dock.render();
    LP.detail.render();
    crumb(); hud();
    LP.stage.renderQ();
    LP.drawTools.sync();
  }
  function commit(label){
    LP.hist.commit(label);
    refresh();
  }
  function undo(){ if(LP.drawTools.beforeUndo()) return; histGo(LP.hist.undo(), '↶ '); }
  function redo(){ if(LP.drawTools.beforeUndo()) return; histGo(LP.hist.redo(), '↷ '); }
  /* book の手＝BOOK が差し替わったので全部描き直す／px の手＝画素を貼るだけ（cells.applyTiles が描き直す） */
  function histGo(r, mark){
    if(r == null){ LP.ui.toast(mark === '↶ ' ? 'これ以上戻れません' : 'これ以上進めません'); return; }
    stop();
    if(r.kind === 'book') refresh();
    LP.ui.toast(mark + r.label);
  }

  /* ---------- 選択（1つだけ） ---------- */
  /* 打たずに離れた空の文字は消す（履歴にも積まない＝置いた手ごと無かったことに） */
  function pruneEmptyText(keepId){
    const s = curSheet();
    if(!s) return;
    const i = (s.items || []).findIndex(o => o.type === 'text' && o.id !== keepId && !String(o.text || '').trim());
    if(i >= 0) s.items.splice(i, 1);
  }
  function select(kind, id, quiet){
    const st = LP.state;
    st.selLayer = kind === 'layer' ? id : null;
    st.selItem = kind === 'item' ? id : null;
    st.selPanel = kind === 'panel' ? id : null;
    pruneEmptyText(st.selItem);
    if(!quiet) selRefresh();
  }
  function selectLayer(id){ select(id ? 'layer' : null, id); }
  function selRefresh(){
    if(LP.state.step === 'draw'){ LP.drawSel.settle(); LP.drawTools.sync(); lastCell = null; }
    LP.sides.renderItems();
    LP.timeline.renderCells();
    if(!LP.state.exporting) LP.dock.render();
    LP.detail.render();
    LP.stage.renderQ();
    hud();
  }
  function selectSheet(i){
    stop();
    const t = LP.time.sheetStart(LP.book, i);
    const keep = curAt() && curAt().i === i;
    if(!keep) select(null, null, true);
    seek(t);
  }

  /* ---------- 紙 ---------- */
  function addSheet(){
    const sh = LP.model.newSheet(LP.book);
    LP.book.sheets.push(sh);
    select(null, null, true);
    commit('紙を足す');
    seek(LP.time.sheetStart(LP.book, LP.book.sheets.length - 1));
    LP.ui.toast(sh.name + ' を足しました');
  }
  function deleteSheet(i){
    const b = LP.book, s = b.sheets[i];
    if(!s) return;
    stop();
    b.sheets.splice(i, 1);
    if(!b.sheets.length) b.sheets.push(LP.model.newSheet(b));
    commit('紙を消す');
    LP.ui.toast(s.name + ' を消しました（Ctrl+Z で戻せます）');
  }
  function moveSheet(from, to){
    const b = LP.book;
    const [s] = b.sheets.splice(from, 1);
    b.sheets.splice(to, 0, s);
    commit('紙の並べ替え');
    seek(LP.time.sheetStart(b, to));
  }

  /* ---------- 層 ---------- */
  function moveLayer(from, to){
    const s = curSheet();
    if(!s) return;
    const [l] = s.layers.splice(from, 1);
    s.layers.splice(to, 0, l);
    commit('層の前後');
  }
  function layerStep(d){
    const s = curSheet(), L = selLayer();
    if(!s || !L) return;
    const i = s.layers.indexOf(L), j = Math.max(0, Math.min(s.layers.length - 1, i + d));
    if(i === j) return;
    moveLayer(i, j);
  }
  /* 表示／ロックの切替（層 or 仕上げ素材。kind==='item' で素材） */
  function layerToggle(id, key, kind){
    const o = kind === 'item' ? LP.model.itemById(curSheet(), id) : LP.model.layerById(curSheet(), id);
    if(!o) return;
    o[key] = key === 'visible' ? o[key] === false : !o[key];
    commit(key === 'visible' ? '表示' : 'ロック');
  }
  /* 選んでいるもの（層 or 仕上げ素材）を消す／複製する */
  function deleteSel(){
    const s = curSheet();
    if(!s || LP.state.step !== 'sheet') return;
    const L = selLayer(), it = selItem();
    if(L){ s.layers.splice(s.layers.indexOf(L), 1); LP.state.selLayer = null; commit('層を消す'); LP.ui.toast('層を消しました（Ctrl+Z で戻せます）'); }
    else if(it){ s.items.splice(s.items.indexOf(it), 1); LP.state.selItem = null; commit('素材を消す'); LP.ui.toast(it.name + ' を消しました（Ctrl+Z で戻せます）'); }
  }
  function dupSel(){
    const s = curSheet(), L = selLayer(), it = selItem();
    if(!s) return;
    if(L){
      const c = LP.model.clone(L);
      c.id = LP.model.uid('l'); c.x += 48; c.y += 48; c.locked = false;
      s.layers.splice(s.layers.indexOf(L) + 1, 0, c);
      select('layer', c.id, true);
      commit('層を複製');
    }else if(it){
      const c = LP.model.clone(it);
      c.id = LP.model.uid('i'); c.x += 48; c.y += 48; c.locked = false;
      s.items.splice(s.items.indexOf(it) + 1, 0, c);
      select('item', c.id, true);
      commit('素材を複製');
    }
  }
  /* 仕上げ素材の前後（同じ段の中の並び） */
  function itemStep(d){
    const s = curSheet(), it = selItem();
    if(!s || !it) return;
    const i = s.items.indexOf(it), j = Math.max(0, Math.min(s.items.length - 1, i + d));
    if(i === j) return;
    s.items.splice(i, 1); s.items.splice(j, 0, it);
    commit('素材の前後');
  }
  function fitLayerToPaper(){
    const L = selLayer();
    if(!L) return;
    const k = L.panelId && LP.model.panelById(curSheet(), L.panelId);
    if(k){ LP.panels.fitLayerToPanel(curSheet(), L, k); commit('コマに合わせる'); return; }
    const p = LP.book.plates[L.plateId];
    const r = LP.model.fitRect(LP.book, p ? p.w : L.w, p ? p.h : L.h);
    Object.assign(L, { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h), rot: 0 });
    commit('紙に合わせる');
  }
  function deletePlate(pid){
    const b = LP.book, p = b.plates[pid];
    if(!p) return;
    let n = 0;
    b.sheets.forEach(s => { const k = s.layers.length; s.layers = s.layers.filter(l => l.plateId !== pid); n += k - s.layers.length; });
    delete b.plates[pid];
    if(LP.state.selLayer && !selLayer()) LP.state.selLayer = null;
    commit('素材を消す');
    LP.ui.toast(p.name + ' を消しました' + (n ? '（層 ' + n + ' 枚も）' : '') + '（Ctrl+Z で戻せます）');
  }

  /* ---------- 通知 ---------- */
  function onDecoded(){ LP.stage.renderQ(); LP.sides.onDecoded(); }
  function onSaved(ok){
    const el = $('#save-st');
    if(!el) return;
    el.textContent = ok == null ? '●' : ok ? 'SAVED' : '保存失敗';
    el.title = ok == null ? '保存待ち' : ok ? 'この端末のブラウザ（IndexedDB）に保存済み' : '保存に失敗しました（容量不足の可能性）';
    el.classList.toggle('err', ok === false);
  }
  function liveDetail(){ LP.detail.renderLive(); }

  /* ---------- 起動 ---------- */
  async function boot(){
    LP.ui.syncCanvasColors();
    if(LP.HARNESS_ON) document.body.classList.add('harness');
    LP.keys.init();
    LP.stage.init();
    LP.timeline.init();
    LP.sides.init();
    LP.detail.init();
    LP.dock.init();
    LP.settings.init();
    LP.io.init();
    // バー
    document.querySelectorAll('#bar .step').forEach(b => b.addEventListener('click', () => setStep(b.dataset.step)));
    $('#b-detail').addEventListener('click', () => LP.detail.toggle());
    const fs = $('#b-fs');
    if(!document.fullscreenEnabled) fs.style.display = 'none';   // iPad Safari など（SPEC_18 canFS）
    fs.addEventListener('click', () => {
      if(document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    });
    document.addEventListener('visibilitychange', () => { if(document.hidden) LP.store.save(); });

    let book = null;
    if(!LP.HARNESS_ON) book = await LP.store.load();
    LP.book = book || LP.model.newBook();
    LP.hist.reset();
    setStep('sheet');
    refresh();
    LP.timeline.fit();
    LP.timeline.render();
    if(book){
      const np = Object.keys(book.plates).length;
      LP.ui.toast('BOOK を復元 — 紙 ' + book.sheets.length + ' 枚・素材 ' + np);
      onSaved(true);
    }else if(!LP.HARNESS_ON){
      LP.store.saveSoon();
    }
    LP.ready = true;
  }

  LP.app = {
    curAt, curSheet, selLayer, selItem, selPanel, clampT, outSize,
    seek, jumpSheet, play, stop, togglePlay, playFull,
    setStep, hud, crumb, escape, refresh, commit, undo, redo,
    select, selectLayer, selectSheet, addSheet, deleteSheet, moveSheet,
    moveLayer, layerStep, itemStep, layerToggle, deleteSel, dupSel, fitLayerToPaper, deletePlate,
    onDecoded, onSaved, liveDetail,
  };
  LP.bootPromise = boot();
})();
