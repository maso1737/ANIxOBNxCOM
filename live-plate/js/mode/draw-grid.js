/* ============================================================
   LIVE PLATE — mode/draw-grid.js（02 DRAW のセル一覧 GRID。SPEC_21 §7-2 / §18-4）
   いま描いているプレートのセルを全部、**同じ縮尺**で並べる（1枚のプレートのセルは同じ大きさ＝econte の統一解像度）。
     クリック＝そのセルへ（プレイヘッドを動かす）／Wクリック・Enter・Esc・X＝FOCUS（いつもの 02 DRAW）へ戻る
     ドラッグ＝並べ替え（Undo 1手）／Ctrl＋ホイール・S M L＝セルの大きさ／⇩ 一覧 PNG＝同じ並びを1枚の PNG に（C.SCRIPT 一覧に当たる）
   ★ 置き場は #stage の上の DOM（#grid）。ステージのポインタに渡さない（stopPropagation）＝描いてしまわない
   ★ セルの画は塗→線（cells.thumb と同じ重ね方）。デコード待ちは onDecoded で描き直す
   ★ セルの操作（＋・複製・削除・長さ）はドックの CELL がそのまま効く（commit → render）
   ============================================================ */
var LP = window.LP || (window.LP = {});

(function(){
  'use strict';
  const GAP = 10, PAD = 14, SIZES = [['120', 'S'], ['200', 'M'], ['320', 'L']];
  let el = null, on = false, pending = false, drag = null, lastTap = { i: -1, at: 0 };

  function D(){ return LP.state.draw; }
  function tg(){ return LP.drawTools.target(); }
  /* 1セルの箱（統一の縮尺）。縦長のプレートは高さ 1.2×幅 で抑える */
  function tileSize(p, w){
    const s = Math.min(w / p.w, w * 1.2 / p.h);
    return { w: Math.max(1, Math.round(p.w * s)), h: Math.max(1, Math.round(p.h * s)), s };
  }
  /* 並び（画面と PNG で同じ式）：cols 列・左上から */
  function layout(n, cols, tw, th, lab){
    const out = [];
    for(let i = 0; i < n; i++) out.push({ x: PAD + (i % cols) * (tw + GAP), y: PAD + Math.floor(i / cols) * (th + lab + GAP) });
    return { cells: out, w: PAD * 2 + cols * tw + (cols - 1) * GAP, h: PAD * 2 + Math.ceil(n / cols) * (th + lab + GAP) - GAP };
  }
  function colsFor(width, tw){ return Math.max(1, Math.floor((width - PAD * 2 + GAP) / (tw + GAP))); }
  /* この紙の尺の中で出ているセル（出ていないセルは薄く） */
  function shown(t){
    const s = new Set(), sh = t.at.sheet;
    for(let f = 0; f < sh.dur; f++){ const ci = LP.time.cellIndexAt(t.plate, t.L, f); if(ci >= 0) s.add(ci); }
    return s;
  }

  function init(){
    el = document.querySelector('#grid');
    if(!el) return;
    // ステージ（#stage）のポインタ・ホイールに渡さない
    ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'dblclick', 'contextmenu'].forEach(ev => el.addEventListener(ev, e => e.stopPropagation()));
    el.addEventListener('wheel', e => {
      e.stopPropagation();
      if(!e.ctrlKey) return;   // ふつうのホイール＝スクロール
      e.preventDefault();
      setSize(D().gridW * Math.exp(-e.deltaY * 0.004));
    }, { passive: false });
    el.addEventListener('click', onClick);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', () => endDrag(false));
    new ResizeObserver(() => { if(on) render(); }).observe(el);
  }
  function open(){
    if(LP.state.step !== 'draw') return false;
    const t = tg();
    if(!t){ LP.ui.toast('層を選んでから（GRID はいまのプレートのセル一覧）'); return false; }
    if(LP.drawSel) LP.drawSel.settle();
    LP.drawTools.cancel();
    LP.app.stop();
    on = true;
    el.classList.add('show');
    render();
    const cur = el.querySelector('.gd-c.on');
    if(cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
    LP.dock.render();
    return true;
  }
  function close(){
    if(!on) return false;
    on = false;
    endDrag(false);
    el.classList.remove('show');
    el.innerHTML = '';
    LP.dock.render();
    LP.stage.renderQ();
    return true;
  }
  function toggle(){ return on ? close() : open(); }
  function setSize(w){
    D().gridW = Math.max(80, Math.min(480, Math.round(w)));
    LP.drawTools.savePrefs();
    if(on) render();
  }

  /* ---------- 描く ---------- */
  function render(){
    if(!on || !el) return;
    const t = tg();
    if(!t){ close(); return; }
    const p = t.plate, n = p.cells.length, sz = tileSize(p, D().gridW);
    const bodyW = Math.max(200, el.clientWidth - 2), cols = colsFor(bodyW, sz.w);
    const vis = shown(t), esc = LP.ui.esc;
    const tot = p.cells.reduce((a, c) => a + (c.dur || 1), 0);
    const scrollTop = el.querySelector('.gd-body') ? el.querySelector('.gd-body').scrollTop : 0;
    el.innerHTML = '<div class="gd-head"><span class="en">GRID</span><span class="nm">' + esc(p.name) + '</span>'
      + '<span class="s">セル <b>' + n + '</b>・合計 <b>' + tot + '</b> コマ・' + p.w + '×' + p.h + '</span><span class="sp"></span>'
      + '<span class="s">クリック＝そのセル／Wクリック＝描く／ドラッグ＝並べ替え／Ctrl＋ホイール＝大きさ</span>'
      + LP.ui.qdSeg('gdSize', SIZES, String(nearest(D().gridW)))
      + '<button class="qd-sb" data-gd="png" title="この並びを1枚の PNG に（C.SCRIPT 一覧）">⇩ 一覧 PNG</button>'
      + '<button class="qd-sb on" data-gd="close" title="FOCUS（いつもの 02 DRAW）へ戻る（Esc / X）">✕ 描く</button></div>'
      + '<div class="gd-body"><div class="gd-grid" style="grid-template-columns:repeat(' + cols + ',' + sz.w + 'px)">'
      + p.cells.map((c, i) => '<div class="gd-c' + (i === t.ci ? ' on' : '') + (vis.has(i) ? '' : ' off') + '" data-i="' + i + '" title="セル ' + (i + 1) + (vis.has(i) ? '' : '（この紙の尺の中に出ていない）') + '">'
        + '<canvas width="' + sz.w + '" height="' + sz.h + '" style="width:' + sz.w + 'px;height:' + sz.h + 'px"></canvas>'
        + '<div class="lb"><span class="no">' + (i + 1) + '</span><span class="du">×' + (c.dur || 1) + '</span>'
        + (c.fill ? '<span class="fl">塗</span>' : '') + (vis.has(i) ? '' : '<span class="nx">出ていない</span>') + '</div></div>').join('')
      + '</div></div>';
    el.querySelector('.gd-body').scrollTop = scrollTop;
    drawThumbs();
  }
  function nearest(w){ let best = SIZES[0][0]; SIZES.forEach(([v]) => { if(Math.abs(+v - w) < Math.abs(+best - w)) best = v; }); return best; }
  function drawThumbs(){
    const t = tg();
    if(!t) return;
    pending = false;
    el.querySelectorAll('.gd-c').forEach(d => {
      const cell = t.plate.cells[+d.dataset.i], cv = d.querySelector('canvas');
      if(!cell || !cv) return;
      const g = cv.getContext('2d');
      g.clearRect(0, 0, cv.width, cv.height);
      g.imageSmoothingQuality = 'high';
      for(const lane of ['fill', 'line']){
        const im = LP.cache.img(cell, lane);
        if(im === false){ pending = true; continue; }
        if(im) g.drawImage(im, 0, 0, cv.width, cv.height);
      }
    });
  }
  function onDecoded(){ if(on && pending) drawThumbs(); }
  /* セルが替わった（↑↓・タイムライン）：印だけ付け直す */
  function mark(){
    if(!on) return;
    const t = tg();
    el.querySelectorAll('.gd-c').forEach(d => d.classList.toggle('on', !!t && +d.dataset.i === t.ci));
    const cur = el.querySelector('.gd-c.on');
    if(cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
  }

  /* ---------- 操作 ---------- */
  function onClick(e){
    const b = e.target.closest('[data-gd],[data-act]');
    if(!b) return;
    if(b.dataset.act === 'gdSize'){ setSize(+b.dataset.v); return; }
    if(b.dataset.gd === 'close') close();
    else if(b.dataset.gd === 'png') exportPNG();
  }
  function tileAt(x, y){
    const hit = document.elementFromPoint(x, y);
    const d = hit && hit.closest && hit.closest('.gd-c');
    return d && el.contains(d) ? d : null;
  }
  function onDown(e){
    if(e.button !== 0) return;
    const d = e.target.closest('.gd-c');
    if(!d) return;
    drag = { i: +d.dataset.i, x: e.clientX, y: e.clientY, moved: false, to: -1, src: d, id: e.pointerId };
  }
  function onMove(e){
    if(!drag || e.pointerId !== drag.id) return;
    if(!drag.moved){
      if(Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      drag.moved = true;
      try{ el.setPointerCapture(e.pointerId); }catch(err){}
      drag.src.classList.add('drag');
      el.classList.add('dragging');
    }
    el.querySelectorAll('.gd-c.ins-l,.gd-c.ins-r').forEach(o => o.classList.remove('ins-l', 'ins-r'));
    const d = tileAt(e.clientX, e.clientY);
    drag.to = -1;
    if(!d) return;
    const r = d.getBoundingClientRect(), right = e.clientX > r.left + r.width / 2, j = +d.dataset.i;
    drag.to = right ? j + 1 : j;
    d.classList.add(right ? 'ins-r' : 'ins-l');
  }
  function onUp(e){
    if(!drag || e.pointerId !== drag.id) return;
    const dr = drag;
    if(!dr.moved){
      drag = null;
      const now = performance.now();
      if(lastTap.i === dr.i && now - lastTap.at < 380){ lastTap = { i: -1, at: 0 }; if(LP.drawTools.seekCell(dr.i)) close(); return; }
      lastTap = { i: dr.i, at: now };
      LP.drawTools.seekCell(dr.i);
      return;
    }
    endDrag(true);
  }
  function endDrag(apply){
    const dr = drag;
    drag = null;
    if(!el) return;
    el.classList.remove('dragging');
    el.querySelectorAll('.gd-c.drag,.gd-c.ins-l,.gd-c.ins-r').forEach(o => o.classList.remove('drag', 'ins-l', 'ins-r'));
    if(!apply || !dr || dr.to < 0) return;
    move(dr.i, dr.to);
  }
  /* セル i を「to の前」へ（to は並べ替え前の番号。n＝最後） */
  function move(i, to){
    const t = tg();
    if(!t) return;
    const cs = t.plate.cells;
    if(i < 0 || i >= cs.length || to === i || to === i + 1) return;
    const [c] = cs.splice(i, 1);
    const ni = to > i ? to - 1 : to;
    cs.splice(ni, 0, c);
    LP.app.commit('セルの並べ替え');
    LP.drawTools.seekCell(ni);
    LP.ui.toast('セル ' + (i + 1) + ' → ' + (ni + 1) + '（Ctrl+Z で戻せます）');
  }

  /* ---------- ⇩ 一覧 PNG（画面と同じ layout。1セル＝画面の2倍の細かさ） ---------- */
  async function bitmap(cell, lane){
    const lv = LP.cells.live(cell, lane);
    if(lv !== undefined) return lv;
    return cell[lane] ? createImageBitmap(cell[lane]) : null;
  }
  async function exportPNG(){
    const t = tg();
    if(!t) return;
    const p = t.plate, K = 2, sz = tileSize(p, D().gridW);
    const bodyW = Math.max(200, el.clientWidth - 2), cols = Math.min(p.cells.length, colsFor(bodyW, sz.w));
    let tw = sz.w * K, th = sz.h * K;
    const LAB = 22 * K, HEAD = 40 * K;
    let L = layout(p.cells.length, cols, tw, th, LAB);
    // 大きすぎるときは縮める（canvas の上限）
    const k = Math.min(1, 16000 / L.w, 16000 / (L.h + HEAD), Math.sqrt(2.5e8 / (L.w * (L.h + HEAD))));
    if(k < 1){ tw = Math.max(16, Math.floor(tw * k)); th = Math.max(9, Math.floor(th * k)); L = layout(p.cells.length, cols, tw, th, LAB); }
    const c = document.createElement('canvas');
    c.width = L.w; c.height = L.h + HEAD;
    const g = c.getContext('2d');
    g.fillStyle = '#EDEEF0'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#16181C'; g.textBaseline = 'middle';
    g.font = '600 ' + (15 * K) + 'px "Saira Condensed", "Noto Sans JP", sans-serif';
    const tot = p.cells.reduce((a, x) => a + (x.dur || 1), 0);
    g.fillText((LP.book.name || 'BOOK') + ' — ' + p.name + '   ' + p.cells.length + ' cells · ' + tot + ' frames · ' + p.w + '×' + p.h + ' · ' + LP.book.fps + 'fps', PAD * K / 2 + 6, HEAD / 2);
    LP.ui.toast('一覧 PNG を作っています…');
    for(let i = 0; i < p.cells.length; i++){
      const cell = p.cells[i], q = L.cells[i], x = q.x, y = q.y + HEAD;
      g.fillStyle = '#FFFFFF'; g.fillRect(x, y, tw, th);
      for(const lane of ['fill', 'line']){
        const im = await bitmap(cell, lane);
        if(im){ g.imageSmoothingQuality = 'high'; g.drawImage(im, x, y, tw, th); if(im.close && !(im instanceof HTMLCanvasElement)) im.close(); }
      }
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, tw - 1, th - 1);
      g.fillStyle = '#16181C';
      g.font = '600 ' + (13 * K) + 'px "Saira Condensed", sans-serif';
      g.fillText(String(i + 1), x + 2, y + th + LAB / 2);
      g.fillStyle = '#6A6F78';
      g.font = '500 ' + (11 * K) + 'px "JetBrains Mono", monospace';
      g.fillText('×' + (cell.dur || 1), x + 2 + 30 * K, y + th + LAB / 2);
    }
    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    if(!blob){ LP.ui.toast('PNG にできませんでした（大きすぎる）'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'liveplate-cells-' + String(p.name || 'plate').replace(/[\\/:*?"<>|\s]+/g, '_') + '.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    LP.ui.toast('一覧 PNG：' + p.cells.length + ' セル・' + c.width + '×' + c.height);
  }

  LP.drawGrid = { init, open, close, toggle, render, mark, onDecoded, move, exportPNG, layout, get on(){ return on; } };
})();
