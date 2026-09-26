/* ============================================================
   LIVE PLATE — ui/timeline.js（タイムラインは1本・行は4種。SPEC_21 §4-3）
   P0 の行：SHEET（紙＝クリップ。幅＝尺）／ 線（選んだ層のセル。読むだけ）
   TAKE（P3）と REF（P2）はそのフェーズで足す。**行は増やさない**（層ごとのトラックは作らない）。
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

  /* 線の行：選んだ層のセルを、紙の中の時間に並べる（cellIndexAt そのもの＝ステージと同じ式）。
     1巡目は濃く、ループの2巡目以降は薄く（.rep） */
  function renderCells(){
    const el = $('#tl-cells');
    const L = LP.app.selLayer(), at = LP.app.curAt();
    const plate = L && LP.book.plates[L.plateId];
    if(!L || !plate || !at){
      el.innerHTML = '<span class="none">層を選ぶと、そのセル（コマ）がここに並びます</span>';
      return;
    }
    const start = at.start, sh = at.sheet, n = LP.time.plateLen(plate);
    const step = Math.max(1, L.step | 0 || 1);
    let h = '', f0 = 0, ci0 = null, rep0 = false;
    const flush = f1 => {
      if(ci0 == null || ci0 < 0) return;
      const w = (f1 - f0) * ppf;
      const lab = w >= 14 ? (ci0 + 1) : '';
      h += '<div class="cel' + (rep0 ? ' rep' : '') + (plate.cells.length === 1 ? ' hold' : '') + '" style="left:' + ((start + f0) * ppf) + 'px;width:' + Math.max(1, w - 1) + 'px" title="セル ' + (ci0 + 1) + ' / ' + plate.cells.length + '">' + lab + '</div>';
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
