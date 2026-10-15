/* ============================================================
   LIVE PLATE — ui/timeline.js（タイムラインは1本・行は4種。SPEC_21 §4-3）
   行：SHEET（紙＝クリップ。幅＝尺）／ REF（参照の帯・参照があるときだけ）／ 線・塗（選んだ層のセル）
   TAKE（P3）はそのフェーズで足す。**行は増やさない**（層ごとのトラックは作らない）。
   操作：ルーラー／クリップ本体をドラッグ＝スクラブ・右端ドラッグ＝尺・＋＝紙を足す・
         Ctrl+ホイール＝時間の拡縮・ホイール＝横送り・ファイルを落とす＝その位置に新しい紙。
   ★ ドラッグ中は DOM を作り直さない（掴んだ要素が消えると capture が切れる）。位置と文字だけ差し替える。
   ============================================================ */
var LP = window.LP || (window.LP = {});

(function(){
  'use strict';
  const $ = s => document.querySelector(s);
  let ppf = 8, fitOnce = true;     // 1コマあたりの px
  let scroller, inner;

  function init(){
    scroller = $('#tl-scroll'); inner = $('#tl-inner');
    $('#tl-ruler').addEventListener('pointerdown', e => scrubStart(e));
    $('#tl-sheets').addEventListener('pointerdown', onSheetsDown);
    $('#tl-add').addEventListener('click', () => LP.app.addSheet());
    $('#tl-zin').addEventListener('click', () => zoom(1.5));
    $('#tl-zout').addEventListener('click', () => zoom(1 / 1.5));
    $('#tl-fit').addEventListener('click', () => { fit(); render(); scroller.scrollLeft = 0; });
    $('#tl-play').addEventListener('click', () => LP.app.togglePlay());
    $('#tl-cells').addEventListener('pointerdown', onCellsDown);
    $('#tl-fills').addEventListener('pointerdown', onCellsDown);
    $('#tl-refs').addEventListener('pointerdown', onRefsDown);
    $('#tl-labels').addEventListener('click', onLaneHead);
    scroller.addEventListener('wheel', e => {
      if(e.ctrlKey){
        e.preventDefault();
        const r = scroller.getBoundingClientRect();
        zoom(Math.exp(-e.deltaY * 0.004), e.clientX - r.left);
      }else if(Math.abs(e.deltaY) > Math.abs(e.deltaX)){
        e.preventDefault();
        scroller.scrollLeft += e.deltaY;
      }
    }, { passive: false });
    new ResizeObserver(() => { if(!LP.book) return; if(fitOnce) fit(); render(); }).observe(scroller);
  }

  function total(){ return Math.max(1, LP.time.totalFrames(LP.book)); }
  function fit(){
    const w = Math.max(100, scroller.clientWidth - 48);
    ppf = Math.max(1, Math.min(40, w / total()));
    fitOnce = true;
  }
  function zoom(f, anchorX){
    const ax = anchorX == null ? scroller.clientWidth / 2 : anchorX;
    const fr = (scroller.scrollLeft + ax) / ppf;
    ppf = Math.max(0.5, Math.min(60, ppf * f));
    fitOnce = false;
    render();
    scroller.scrollLeft = fr * ppf - ax;
  }
  function frameAtClient(cx){
    const r = inner.getBoundingClientRect();
    return Math.floor((cx - r.left) / ppf);
  }

  /* ---------- 描画 ---------- */
  function render(){
    if(!LP.book || !inner) return;
    const book = LP.book, fps = book.fps, T = total();
    if(fitOnce) fit();
    const width = Math.ceil(T * ppf) + 60;
    inner.style.width = Math.max(width, scroller.clientWidth) + 'px';

    // ルーラー：秒ごとに太線＋ラベル、間に 6コマ刻み（詰まるときは間引く）
    let rh = '';
    const secPx = fps * ppf;
    const labEvery = secPx >= 48 ? 1 : secPx >= 20 ? 2 : secPx >= 8 ? 5 : 10;
    for(let s = 0; s * fps <= T; s++){
      const x = s * secPx;
      rh += '<i class="s" style="left:' + x + 'px"></i>';
      if(s % labEvery === 0) rh += '<u style="left:' + x + 'px">' + s + 's</u>';
      if(secPx >= 36) for(let k = 6; k < fps; k += 6) if(s * fps + k <= T) rh += '<i style="left:' + (x + k * ppf) + 'px"></i>';
    }
    $('#tl-ruler').innerHTML = rh;

    // SHEET 行
    const cur = LP.app.curAt();
    let h = '', acc = 0;
    book.sheets.forEach((s, i) => {
      h += '<div class="clip' + (cur && cur.i === i ? ' on' : '') + '" data-i="' + i + '" style="left:' + (acc * ppf) + 'px;width:' + Math.max(2, s.dur * ppf - 2) + 'px" title="' + LP.ui.esc(s.name) + '　ドラッグ＝スクラブ／右端ドラッグ＝尺">'
        + '<span class="nm">' + LP.ui.esc(s.name) + '</span><span class="du">' + LP.time.fmtDur(s.dur, fps) + '</span><span class="rh" data-rh="' + i + '"></span></div>';
      acc += s.dur;
    });
    $('#tl-sheets').innerHTML = h;
    $('#tl-add').style.left = (acc * ppf + 8) + 'px';

    renderCells();
    playhead();
  }

  /* 線／塗の行：選んだ層のセルを、紙の中の時間に並べる（cellIndexAt そのもの＝ステージと同じ式）。
     1巡目は濃く、ループの2巡目以降は薄く（.rep）。塗の行は「そのセルに塗りがあるか」の帯（SPEC_20 §1-4）。
     REF 行は参照の帯（SPEC_20 §1-5：offset＝横ドラッグ・×N＝押して 1→2→3→4）。 */
  function renderCells(){
    const el = $('#tl-cells'), fl = $('#tl-fills'), rf = $('#tl-refs');
    const L = LP.app.selLayer(), at = LP.app.curAt();
    const plate = L && LP.book.plates[L.plateId];
    const D = LP.state.draw;
    document.body.classList.toggle('lane-line', D.lane === 'line');
    document.body.classList.toggle('lane-fill', D.lane === 'fill');
    laneHeads(plate);
    const refs = plate ? (plate.refs || []) : [];
    document.body.classList.toggle('has-refs', refs.length > 0);
    if(!L || !plate || !at){
      el.innerHTML = '<span class="none">層を選ぶと、そのセル（コマ）がここに並びます（02 DRAW で描く）</span>';
      fl.innerHTML = ''; rf.innerHTML = '';
      return;
    }
    const start = at.start, sh = at.sheet, n = LP.time.plateLen(plate);
    const step = Math.max(1, L.step | 0 || 1);
    const curCi = LP.time.cellIndexAt(plate, L, at.local);
    const draw = LP.state.step === 'draw';
    let h = '', hf = '', f0 = 0, ci0 = null, rep0 = false;
    const flush = f1 => {
      if(ci0 == null || ci0 < 0) return;
      const w = (f1 - f0) * ppf, cell = plate.cells[ci0];
      const lab = w >= 14 ? (ci0 + 1) : '';
      const cur = ci0 === curCi && at.local >= f0 && at.local < f1 ? ' cur' : '';
      const pos = 'left:' + ((start + f0) * ppf) + 'px;width:' + Math.max(1, w - 1) + 'px';
      const rh = draw && !rep0 && w >= 8 ? '<span class="rh" data-cdur="' + ci0 + '" title="このセルの長さ（コマ打ち）"></span>' : '';
      h += '<div class="cel' + (rep0 ? ' rep' : '') + (plate.cells.length === 1 ? ' hold' : '') + cur + '" data-ci="' + ci0 + '" data-f="' + f0 + '" style="' + pos + '" title="セル ' + (ci0 + 1) + ' / ' + plate.cells.length + '（' + cell.dur + 'コマ）　クリック＝このセル・線レーン／Wクリック＝02 DRAW">' + lab + rh + '</div>';
      const b = LP.cells.get(cell.id);
      const has = !!(cell.fill || (b && b.fill));
      hf += '<div class="fb' + (has ? ' has' : '') + (rep0 ? ' rep' : '') + cur + '" data-ci="' + ci0 + '" data-f="' + f0 + '" data-lane="fill" style="' + pos + '" title="塗レーン（セル ' + (ci0 + 1) + (has ? '・塗りあり' : '・塗りなし') + '）　クリック＝このセル・塗レーン"></div>';
    };
    for(let f = 0; f <= sh.dur; f++){
      const ci = f < sh.dur ? LP.time.cellIndexAt(plate, L, f) : -2;
      const kr = Math.floor((f - (L.tOffset || 0)) / step);
      const rep = kr >= n || kr < 0;
      if(ci !== ci0 || rep !== rep0 || f === sh.dur){
        flush(f);
        f0 = f; ci0 = ci; rep0 = rep;
      }
    }
    el.innerHTML = h;
    fl.innerHTML = hf;
    // REF の帯
    let hr = '';
    refs.forEach(r => {
      const rp = LP.book.plates[r.plateId];
      if(!rp) return;
      const len = LP.time.plateLen(rp) * Math.max(1, r.step || 1);
      hr += '<div class="refb' + (r.visible === false ? ' off' : '') + '" data-ref="' + r.id + '" style="left:' + ((start + (r.offset || 0)) * ppf) + 'px;width:' + Math.max(12, len * ppf - 1) + 'px;background:' + r.color + '" title="参照 ' + LP.ui.esc(rp.name) + '　横ドラッグ＝ずらす（' + (r.offset || 0) + 'コマ）">'
        + '<span>' + LP.ui.esc(rp.name) + '</span><span class="sn" data-rstep="' + r.id + '" title="コマ打ち（押すたびに 1→2→3→4）">×' + (r.step || 1) + '</span><span class="x" data-rdel="' + r.id + '" title="参照を外す">✕</span></div>';
    });
    rf.innerHTML = hr;
  }
  function laneHeads(plate){
    const D = LP.state.draw;
    ['line', 'fill'].forEach(l => {
      const el = $(l === 'line' ? '#tl-lline' : '#tl-lfill');
      const ln = plate && plate.lanes ? plate.lanes[l] : null;
      el.classList.toggle('on', D.lane === l);
      el.title = (l === 'line' ? '線レーン' : '塗レーン') + '：クリックでこのレーンに描く（L で切替）／◉＝表示・🔒＝ロック（プレートごと）';
      el.innerHTML = '<span class="nm">' + (l === 'line' ? '線' : '塗') + '</span>'
        + (ln ? '<span class="t' + (ln.visible === false ? ' off' : '') + '" data-lv="' + l + '">◉</span><span class="t' + (ln.locked ? ' lk' : ' off') + '" data-ll="' + l + '">' + (ln.locked ? '🔒' : '🔓') + '</span>' : '');
    });
  }
  function onLaneHead(e){
    const L = LP.app.selLayer(), plate = L && LP.book.plates[L.plateId];
    const v = e.target.closest('[data-lv]'), k = e.target.closest('[data-ll]'), h = e.target.closest('.lane');
    if(plate && (v || k)){
      const lane = (v || k).dataset[v ? 'lv' : 'll'];
      const ln = plate.lanes[lane];
      if(v) ln.visible = ln.visible === false; else ln.locked = !ln.locked;
      LP.app.commit(v ? 'レーンの表示' : 'レーンのロック');
      return;
    }
    if(h){ LP.drawTools.setLane(h.dataset.lane); if(LP.state.step !== 'draw') renderCells(); }
  }
  /* セルを押す＝そのセルへ（いまそのセルの中にいれば動かない）＋レーン。右端＝長さ（コマ打ち） */
  let lastCel = { key: '', t: 0 };
  function onCellsDown(e){
    const rh = e.target.closest('[data-cdur]');
    if(rh){ cellDurStart(e, +rh.dataset.cdur, rh); return; }
    const c = e.target.closest('.cel, .fb');
    if(!c) return;
    e.preventDefault();
    const at = LP.app.curAt(), f = +c.dataset.f, ci = +c.dataset.ci;
    const L = LP.app.selLayer(), plate = L && LP.book.plates[L.plateId];
    if(!at || !plate) return;
    const inSpan = LP.time.cellIndexAt(plate, L, at.local) === ci && at.local >= f && at.local < f + Math.max(1, Math.round(c.offsetWidth / ppf));
    LP.app.stop();
    if(!inSpan) LP.app.seek(at.start + f);
    LP.drawTools.setLane(c.dataset.lane === 'fill' ? 'fill' : 'line');
    const key = ci + ':' + f, now = performance.now();
    if(lastCel.key === key && now - lastCel.t < 380 && LP.state.step !== 'draw'){ lastCel = { key: '', t: 0 }; LP.app.setStep('draw'); return; }
    lastCel = { key, t: now };
    renderCells();
  }
  function cellDurStart(e, ci, handle){
    e.preventDefault(); e.stopPropagation();
    const L = LP.app.selLayer(), plate = L && LP.book.plates[L.plateId];
    if(!plate || !plate.cells[ci]) return;
    LP.app.stop();
    handle.setPointerCapture(e.pointerId);
    const cel = handle.parentElement, cell = plate.cells[ci], d0 = cell.dur, x0 = e.clientX, w0 = cel.offsetWidth;
    const unit = ppf * Math.max(1, L.step | 0 || 1);
    let moved = false;
    const mv = ev => {
      const d = Math.max(1, Math.round(d0 + (ev.clientX - x0) / unit));
      if(d === cell.dur) return;
      moved = true;
      cell.dur = d;
      cel.style.width = Math.max(1, w0 + (d - d0) * unit) + 'px';
      cel.title = 'セル ' + (ci + 1) + '（' + d + 'コマ）';
      LP.stage.renderQ();
    };
    const up = () => {
      handle.removeEventListener('pointermove', mv); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up);
      if(moved){ LP.app.commit('セルの長さ'); LP.ui.toast('セル ' + (ci + 1) + '：' + cell.dur + 'コマ'); }
    };
    handle.addEventListener('pointermove', mv);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }
  /* REF の帯：横ドラッグ＝ずらす（離したら commit）・×N・✕ */
  function onRefsDown(e){
    const x = e.target.closest('[data-rdel]'), sn = e.target.closest('[data-rstep]'), b = e.target.closest('[data-ref]');
    if(x){ LP.drawTools.refDel(x.dataset.rdel); return; }
    if(sn){ const r = LP.drawTools.refOf(sn.dataset.rstep); if(r){ r.step = (r.step || 1) % 4 + 1; LP.app.commit('参照のコマ打ち'); } return; }
    if(!b) return;
    const r = LP.drawTools.refOf(b.dataset.ref);
    if(!r) return;
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    const o0 = r.offset || 0, x0 = e.clientX, l0 = parseFloat(b.style.left);
    let moved = false;
    const mv = ev => {
      const o = Math.round(o0 + (ev.clientX - x0) / ppf);
      if(o === r.offset) return;
      moved = true; r.offset = o;
      b.style.left = (l0 + (o - o0) * ppf) + 'px';
      LP.stage.renderQ();
    };
    const up = () => {
      b.removeEventListener('pointermove', mv); b.removeEventListener('pointerup', up); b.removeEventListener('pointercancel', up);
      if(moved){ LP.app.commit('参照をずらす'); LP.ui.toast('参照を ' + r.offset + ' コマずらしました'); }
      else { r.visible = r.visible === false; LP.app.commit('参照の表示'); }
    };
    b.addEventListener('pointermove', mv);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
  }

  function playhead(){
    const ph = $('#tl-ph');
    if(ph) ph.style.left = (LP.state.t * ppf + ppf / 2) + 'px';
    const T = total(), fps = LP.book.fps;
    const at = LP.app.curAt();
    $('#tl-time').innerHTML = LP.time.fmtDur(LP.state.t, fps) + ' <span>/ ' + LP.time.fmtDur(T, fps) + '　' + (at ? LP.ui.esc(at.sheet.name) + ' ' + LP.time.fmtDur(at.local, fps) : '') + '</span>';
    $('#tl-play').textContent = LP.state.playing ? '❚❚' : '▶';
    // 再生中はプレイヘッドを追いかける（画面外に出たら送る）
    if(LP.state.playing && scroller){
      const x = LP.state.t * ppf;
      if(x < scroller.scrollLeft || x > scroller.scrollLeft + scroller.clientWidth - 30) scroller.scrollLeft = Math.max(0, x - 40);
    }
  }
  function markCurrent(){
    const at = LP.app.curAt();
    document.querySelectorAll('#tl-sheets .clip').forEach(c => c.classList.toggle('on', !!at && +c.dataset.i === at.i));
  }

  /* ---------- 操作 ---------- */
  function scrubStart(e){
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    LP.app.stop();
    const go = ev => LP.app.seek(frameAtClient(ev.clientX));
    go(e);
    const mv = ev => go(ev);
    const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); LP.app.refresh(); };
    el.addEventListener('pointermove', mv);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }
  function onSheetsDown(e){
    const rh = e.target.closest('[data-rh]');
    if(rh){ durStart(e, +rh.dataset.rh, rh); return; }
    if(e.target.closest('.clip')) scrubStart(e);
  }
  /* 右端ドラッグ＝尺。ドラッグ中は幅・後続の位置・文字だけ、離したら commit＋全再描画 */
  function durStart(e, i, handle){
    e.preventDefault(); e.stopPropagation();
    LP.app.stop();
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('act');
    const sh = LP.book.sheets[i], d0 = sh.dur, x0 = e.clientX;
    const clips = [...document.querySelectorAll('#tl-sheets .clip')];
    let moved = false;
    const mv = ev => {
      const d = Math.max(1, Math.round(d0 + (ev.clientX - x0) / ppf));
      if(d === sh.dur) return;
      moved = true;
      sh.dur = d;
      let acc = 0;
      LP.book.sheets.forEach((s, k) => {
        const c = clips[k];
        if(c){ c.style.left = (acc * ppf) + 'px'; c.style.width = Math.max(2, s.dur * ppf - 2) + 'px'; }
        acc += s.dur;
      });
      clips[i].querySelector('.du').textContent = LP.time.fmtDur(d, LP.book.fps);
      $('#tl-add').style.left = (acc * ppf + 8) + 'px';
      LP.app.clampT();
      playhead(); LP.stage.renderQ();
    };
    const up = () => {
      handle.removeEventListener('pointermove', mv); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up);
      handle.classList.remove('act');
      if(moved){ fitOnce = false; LP.app.commit('紙の尺'); }
    };
    handle.addEventListener('pointermove', mv);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }
  /* ドロップ位置 → 紙の挿入位置（クリップの中央より右なら後ろへ） */
  function insertIndexAt(cx){
    const f = frameAtClient(cx);
    let acc = 0;
    for(let i = 0; i < LP.book.sheets.length; i++){
      const d = LP.book.sheets[i].dur;
      if(f < acc + d / 2) return i;
      acc += d;
    }
    return LP.book.sheets.length;
  }
  function showDropAt(cx){
    const m = $('#tl-drop');
    if(cx == null){ m.style.display = 'none'; return; }
    const idx = insertIndexAt(cx);
    const f = LP.time.sheetStart(LP.book, idx);
    m.style.display = 'block';
    m.style.left = (f * ppf - 1) + 'px';
  }

  LP.timeline = { init, render, playhead, markCurrent, renderCells, insertIndexAt, showDropAt, fit };
})();
