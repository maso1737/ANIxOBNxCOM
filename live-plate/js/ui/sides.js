/* ============================================================
   LIVE PLATE — ui/sides.js（左右のペインは「棚」と「一覧」だけ。SPEC_21 §4-2）
   #side-l 素材棚  … BOOK.plates（画の実体プール）。タイルを掴んで
                     紙（ステージ）へ＝層になる／タイムラインへ＝新しい紙になる
   #side-r SHEETS  … 紙の一覧（サムネ・尺）。上下ドラッグ＝並べ替え（econte の SHEET 行と同じ手つき）
           ◆ITEMS … いまの紙の層（上＝手前）。上下ドラッグ＝前後、Wクリック＝02 DRAW
   ============================================================ */
var LP = window.LP || (window.LP = {});

(function(){
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => LP.ui.esc(s);
  const thumbDirty = new Set();    // 画像が読めていなかった紙のサムネ（読めたら描き直す）
  // Wクリックは自前で数える（1回目の選択で一覧を描き直すので、ブラウザの dblclick は要素が替わって届かない）
  let lastTap = { key: '', t: 0 };

  function init(){
    $('#shelf-add').addEventListener('click', () => { LP.io.pickFiles('shelf'); });
    $('#sheet-add').addEventListener('click', () => LP.app.addSheet());
    $('#side-l-toggle').addEventListener('click', () => togglePane('l'));
    $('#side-l .pn-strip').addEventListener('click', () => togglePane('l'));
    // 右は2列（SHEETS｜◆ITEMS）を別々に畳む
    $('#sheets-toggle').addEventListener('click', () => togglePane('s'));
    $('#sheets-strip').addEventListener('click', () => togglePane('s'));
    $('#items-toggle').addEventListener('click', () => togglePane('i'));
    $('#items-strip').addEventListener('click', () => togglePane('i'));
    $('#shelf-list').addEventListener('pointerdown', onShelfDown);
    $('#shelf-list').addEventListener('click', onShelfClick);
    $('#sheet-list').addEventListener('pointerdown', e => rowDown(e, 'sheet'));
    $('#item-list').addEventListener('pointerdown', e => rowDown(e, 'item'));
    $('#item-list').addEventListener('click', e => {
      const g = e.target.closest('.grp');
      if(g && g.dataset.pid) LP.app.select('panel', g.dataset.pid);
    });
    try{
      ['l', 's', 'i'].forEach(k => { if(localStorage.getItem('liveplate_pane_' + k) === '0') document.body.classList.add(k + '-off'); });
    }catch(e){}
  }
  function togglePane(side){
    const off = document.body.classList.toggle(side + '-off');
    try{ if(!LP.HARNESS_ON) localStorage.setItem('liveplate_pane_' + side, off ? '0' : '1'); }catch(e){}
  }
  /* 描いた絵が Blob になったとき（cells.flush）：棚のタイル・その素材を使う紙のサムネ・◆ITEMS を描き直す */
  function refreshPlate(pids){
    renderShelf();
    LP.book.sheets.forEach((s, i) => { if(s.layers.some(l => pids.indexOf(l.plateId) >= 0)) drawThumb(i); });
    renderItems();
  }

  /* ---------- 素材棚 ---------- */
  function renderShelf(){
    const book = LP.book;
    const ids = Object.keys(book.plates);
    $('#shelf-cnt').textContent = ids.length ? ids.length + '' : '';
    if(!ids.length){
      $('#shelf-list').innerHTML = '';
      $('#shelf-empty').style.display = '';
      return;
    }
    $('#shelf-empty').style.display = 'none';
    $('#shelf-list').innerHTML = ids.map(id => {
      const p = book.plates[id], use = LP.model.plateUse(book, id);
      const bd = p.src === 'seq' ? 'SEQ ' + p.cells.length : p.src === 'draw' ? 'DRAW' : 'IMG';
      return '<div class="tile' + (use ? ' used' : '') + '" data-pid="' + id + '" title="' + esc(p.name) + '　' + p.w + '×' + p.h + (use ? '　使用 ' + use : '　未使用') + '\n紙へドラッグ＝層にする／タイムラインへ＝新しい紙">'
        + '<div class="th">' + (p.thumb ? '<img src="' + LP.cache.thumbURL(p.thumb) + '" alt="">' : '') + '</div>'
        + '<span class="bd">' + bd + '</span><span class="x" data-del="' + id + '" title="素材を消す（使っている層も消えます・Ctrl+Z で戻せます）">✕</span>'
        + '<span class="nm">' + esc(p.name) + '</span></div>';
    }).join('');
  }
  function onShelfClick(e){
    const d = e.target.closest('[data-del]');
    if(d) LP.app.deletePlate(d.dataset.del);
  }
  /* タイルを掴む → ゴースト。落とした先で「層」か「紙」になる（pointer で統一＝マウスも指も同じ） */
  function onShelfDown(e){
    if(e.button !== 0 || e.target.closest('[data-del]')) return;
    const tile = e.target.closest('.tile');
    if(!tile) return;
    const pid = tile.dataset.pid, p = LP.book.plates[pid];
    const x0 = e.clientX, y0 = e.clientY;
    let ghost = null, over = null;
    tile.setPointerCapture(e.pointerId);
    const target = ev => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      if(!el) return null;
      if(el.closest('#tl-sheets, #tl-ruler, #tl-cells, #tl-scroll')) return 'tl';
      if(el.closest('#stage')) return 'stage';
      return null;
    };
    const mv = ev => {
      if(!ghost){
        if(Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        ghost = document.createElement('div'); ghost.id = 'drag-ghost';
        ghost.innerHTML = (p.thumb ? '<img src="' + LP.cache.thumbURL(p.thumb) + '" alt="">' : '') + '<div class="lb">' + esc(p.name) + '</div>';
        document.body.appendChild(ghost);
      }
      ghost.style.left = (ev.clientX + 12) + 'px'; ghost.style.top = (ev.clientY + 12) + 'px';
      const t = target(ev);
      if(t !== over){
        $('#stage').classList.toggle('drop-target', t === 'stage');
        $('#tl-scroll').classList.toggle('drop-target', t === 'tl');
        over = t;
      }
      LP.timeline.showDropAt(t === 'tl' ? ev.clientX : null);
    };
    const up = ev => {
      tile.removeEventListener('pointermove', mv); tile.removeEventListener('pointerup', up); tile.removeEventListener('pointercancel', up);
      $('#stage').classList.remove('drop-target'); $('#tl-scroll').classList.remove('drop-target');
      LP.timeline.showDropAt(null);
      if(!ghost) return;
      ghost.remove();
      if(ev.type !== 'pointerup') return;
      const t = target(ev);
      if(t === 'stage'){
        const pt = LP.stage.clientToPaper(ev.clientX, ev.clientY);
        LP.io.placePlates([pid], pt, 'stage');
      }else if(t === 'tl'){
        LP.io.placePlates([pid], null, 'timeline', LP.timeline.insertIndexAt(ev.clientX));
      }
    };
    tile.addEventListener('pointermove', mv);
    tile.addEventListener('pointerup', up);
    tile.addEventListener('pointercancel', up);
  }

  /* ---------- SHEETS / ◆ITEMS ---------- */
  function renderSheets(){
    const book = LP.book, at = LP.app.curAt();
    $('#sheet-cnt').textContent = book.sheets.length + '';
    $('#sheet-list').innerHTML = book.sheets.map((s, i) =>
      '<div class="row' + (at && at.i === i ? ' on' : '') + '" data-i="' + i + '" title="クリック＝この紙へ／Wクリック＝名前を変える／上下ドラッグ＝並べ替え">'
      + '<span class="no">' + String(i + 1).padStart(2, '0') + '</span>'
      + '<div class="th"><canvas width="144" height="81" data-thumb="' + i + '"></canvas></div>'
      + '<div class="mid"><span class="nm">' + esc(s.name) + '</span><span class="sb">' + LP.time.fmtDur(s.dur, book.fps) + '　層 ' + s.layers.length + '</span></div>'
      + '<span class="ic x" data-sdel="' + i + '" title="この紙を消す（Ctrl+Z で戻せます）">✕</span></div>'
    ).join('');
    thumbDirty.clear();
    book.sheets.forEach((s, i) => drawThumb(i));
  }
  function markCurrent(){
    const at = LP.app.curAt();
    document.querySelectorAll('#sheet-list .row').forEach(r => r.classList.toggle('on', !!at && +r.dataset.i === at.i));
  }
  function drawThumb(i){
    const c = document.querySelector('#sheet-list canvas[data-thumb="' + i + '"]');
    if(!c) return;
    const g = c.getContext('2d');
    const t = LP.time.sheetStart(LP.book, i);
    g.clearRect(0, 0, c.width, c.height);
    const r = LP.render.renderFrame(g, LP.book, t, { mode: 'export', img: LP.cache.img, rect: { x: 0, y: 0, w: c.width, h: c.height } });
    if(r.missing) thumbDirty.add(i); else thumbDirty.delete(i);
  }
  /* 画像が読めたら、欠けていた紙のサムネだけ描き直す（全部描き直すと常駐が回り続ける） */
  function onDecoded(){
    if(!thumbDirty.size) return;
    [...thumbDirty].forEach(drawThumb);
  }
  /* ◆ITEMS：コマごとの欄（manga-plate v2-9 のコマ欄）。上＝手前＝「枠の上」→ コマ n … コマ 1。
     欄の中は 仕上げ素材（段の上から）→ 層（手前から）。層の行は上下ドラッグで並べ替え／別の欄へ落とす＝そのコマへ移す */
  const TYPE_MARK = { tone: '網', focus: '集', stream: '流', text: '字', white: '白', frame: '枠', brush: '筆' };
  function renderItems(){
    const sh = LP.app.curSheet(), st = LP.state;
    $('#item-sheet').textContent = sh ? sh.name + '（上＝手前）' : '';
    const items = sh ? (sh.items || []) : [];
    if(!sh || (!sh.layers.length && !items.length && !sh.panels.length)){
      $('#item-list').innerHTML = '<div class="pn-note">この紙に層はまだありません。<br>素材を<b>紙に落とす</b>と層になります。</div>';
      return;
    }
    const groups = [{ id: '', label: sh.panels.length ? '枠の上' : '' }].concat(sh.panels.map((k, i) => ({ id: k.id, label: 'コマ ' + (i + 1) })).reverse());
    const ord = LP.items.drawOrder(items);
    let h = '';
    for(const g of groups){
      const gi = ord.filter(o => (o.panelId || '') === g.id).reverse();
      const gl = sh.layers.map((l, i) => ({ l, i })).filter(o => (o.l.panelId || '') === g.id).reverse();
      if(g.label) h += '<div class="grp' + (g.id && st.selPanel === g.id ? ' on' : '') + '" data-pid="' + g.id + '" title="' + (g.id ? 'クリック＝このコマを選ぶ' : 'コマに入れない（切り抜かない）もの＝擬音・飛び出し') + '"><span>' + g.label + '</span><span class="n">' + (gi.length + gl.length) + '</span></div>';
      h += gi.map(o => '<div class="row it' + (st.selItem === o.id ? ' on' : '') + (o.visible === false ? ' hid' : '') + '" data-kind="item" data-id="' + o.id + '" title="クリック＝選ぶ／Wクリック＝詳細">'
        + '<div class="th mk">' + (TYPE_MARK[o.type] || '?') + '</div>'
        + '<div class="mid"><span class="nm">' + esc(o.name) + '</span><span class="sb">' + esc(o.type === 'text' ? (String(o.text || '').split('\n')[0].slice(0, 14) || '（空）') : (LP.model.ITEM_NAMES[o.type] || o.type)) + '</span></div>'
        + '<span class="ic' + (o.visible === false ? ' off' : '') + '" data-vis="' + o.id + '" data-k="item" title="表示 ON/OFF">◉</span>'
        + '<span class="ic' + (o.locked ? ' lk' : ' off') + '" data-lock="' + o.id + '" data-k="item" title="ロック（紙の上で掴めなくする）">' + (o.locked ? '🔒' : '🔓') + '</span></div>').join('');
      h += gl.map(({ l, i }) => {
        const p = LP.book.plates[l.plateId];
        const sub = p ? (p.src === 'seq' ? 'SEQ ' + p.cells.length + (l.step > 1 ? '　' + l.step + 'コマ打ち' : '') : p.w + '×' + p.h) : '（素材なし）';
        return '<div class="row' + (st.selLayer === l.id ? ' on' : '') + (l.visible ? '' : ' hid') + '" data-kind="layer" data-li="' + i + '" data-id="' + l.id + '" title="クリック＝選ぶ／Wクリック＝02 DRAW で開く／上下ドラッグ＝前後・別のコマの欄へ落とす＝そのコマへ">'
          + '<div class="th ck">' + (p && p.thumb ? '<img src="' + LP.cache.thumbURL(p.thumb) + '" alt="">' : '') + '</div>'
          + '<div class="mid"><span class="nm">' + esc(l.name) + '</span><span class="sb">' + sub + (l.z ? '　' + (l.z < 0 ? '奥' : '手前') : '') + '</span></div>'
          + '<span class="ic' + (l.visible ? '' : ' off') + '" data-vis="' + l.id + '" title="表示 ON/OFF">◉</span>'
          + '<span class="ic' + (l.locked ? ' lk' : ' off') + '" data-lock="' + l.id + '" title="ロック（紙の上で掴めなくする）">' + (l.locked ? '🔒' : '🔓') + '</span></div>';
      }).join('');
    }
    $('#item-list').innerHTML = h;
  }
  /* 層の行を落とした位置 → 欄（コマ）と、配列のどこへ入れるか */
  function dropLayer(list, row, at){
    const kids = [...list.children].filter(el => el.classList.contains('row') || el.classList.contains('grp'));
    const sh = LP.app.curSheet(), L = LP.model.layerById(sh, row.dataset.id);
    if(!L) return;
    let pid = '';
    for(let i = Math.min(at, kids.length) - 1; i >= 0; i--) if(kids[i].classList.contains('grp')){ pid = kids[i].dataset.pid; break; }
    let target = null;
    for(let i = at; i < kids.length; i++){
      const el = kids[i];
      if(el.classList.contains('grp')) break;
      if(el.dataset.kind === 'layer' && el !== row){ target = LP.model.layerById(sh, el.dataset.id); break; }
    }
    const from = sh.layers.indexOf(L);
    sh.layers.splice(from, 1);
    let to;
    if(target) to = sh.layers.indexOf(target) + 1;                          // 下の行の手前
    else { const j = sh.layers.findIndex(o => (o.panelId || '') === pid); to = j < 0 ? 0 : j; }   // 欄のいちばん奥
    sh.layers.splice(to, 0, L);
    const moved = (L.panelId || '') !== pid;
    L.panelId = pid || null;
    LP.app.commit(moved ? '層を別のコマへ' : '層の前後');
    if(moved) LP.ui.toast(L.name + ' → ' + (pid ? 'コマ ' + (sh.panels.findIndex(k => k.id === pid) + 1) : '枠の上'));
  }

  /* 行を押す：アイコンなら切替、動かしたら並べ替え、動かさずに離したら選ぶ */
  function rowDown(e, kind){
    if(e.button !== 0) return;
    const row = e.target.closest('.row');
    if(!row) return;
    const list = row.parentElement;
    if(kind === 'sheet'){
      const x = e.target.closest('[data-sdel]');
      if(x){ LP.app.deleteSheet(+x.dataset.sdel); return; }
    }else{
      const v = e.target.closest('[data-vis]'), k = e.target.closest('[data-lock]');
      if(v){ LP.app.layerToggle(v.dataset.vis, 'visible', v.dataset.k); return; }
      if(k){ LP.app.layerToggle(k.dataset.lock, 'locked', k.dataset.k); return; }
    }
    const y0 = e.clientY;
    let lifted = false, line = null, dropAt = -1;
    const canLift = kind === 'sheet' || row.dataset.kind === 'layer';   // 仕上げ素材の並びはドックの 前へ／後ろへ
    row.setPointerCapture(e.pointerId);
    const rows = () => kind === 'sheet' ? [...list.querySelectorAll('.row')] : [...list.children].filter(el => el.classList.contains('row') || el.classList.contains('grp'));
    const mv = ev => {
      if(!lifted){
        if(!canLift || Math.abs(ev.clientY - y0) < 6) return;
        lifted = true; row.classList.add('lift');
        line = document.createElement('div'); line.className = 'drop-line';
      }
      const rs = rows();
      let at = rs.length;
      for(let i = 0; i < rs.length; i++){
        const r = rs[i].getBoundingClientRect();
        if(ev.clientY < r.top + r.height / 2){ at = i; break; }
      }
      dropAt = at;
      if(at < rs.length) list.insertBefore(line, rs[at]); else list.appendChild(line);
    };
    const up = ev => {
      row.removeEventListener('pointermove', mv); row.removeEventListener('pointerup', up); row.removeEventListener('pointercancel', up);
      if(line) line.remove();
      row.classList.remove('lift');
      if(ev.type !== 'pointerup') return;
      const from = rows().indexOf(row);
      if(!lifted){
        const key = kind + ':' + (row.dataset.id || row.dataset.i), now = performance.now();
        if(lastTap.key === key && now - lastTap.t < 380){
          lastTap = { key: '', t: 0 };
          if(kind === 'sheet') renameSheet(+row.dataset.i);
          else if(row.dataset.kind === 'item'){ LP.app.select('item', row.dataset.id); LP.detail.toggle(true); } else { LP.app.select('layer', row.dataset.id); LP.app.setStep('draw'); }
          return;
        }
        lastTap = { key, t: now };
        if(kind === 'sheet') LP.app.selectSheet(+row.dataset.i);
        else LP.app.select(row.dataset.kind === 'item' ? 'item' : 'layer', row.dataset.id);
        return;
      }
      if(kind !== 'sheet'){ dropLayer(list, row, dropAt); return; }
      const to = dropAt > from ? dropAt - 1 : dropAt;
      if(to === from || to < 0) return;
      LP.app.moveSheet(from, to);
    };
    row.addEventListener('pointermove', mv);
    row.addEventListener('pointerup', up);
    row.addEventListener('pointercancel', up);
  }
  function renameSheet(i){
    const row = document.querySelector('#sheet-list .row[data-i="' + i + '"]'), s = LP.book.sheets[i];
    if(!row || !s) return;
    const nm = row.querySelector('.nm');
    const inp = document.createElement('input');
    inp.className = 'qd-txt'; inp.value = s.name; inp.style.height = '22px';
    nm.replaceWith(inp); inp.focus(); inp.select();
    let fin = false;
    const done = ok => {
      if(fin) return; fin = true;
      const v = inp.value.trim();
      if(ok && v && v !== s.name){ s.name = v.slice(0, 40); LP.app.commit('紙の名前'); }
      else renderSheets();
    };
    inp.addEventListener('keydown', ev => { ev.stopPropagation(); if(ev.key === 'Enter') done(true); else if(ev.key === 'Escape') done(false); });
    inp.addEventListener('blur', () => done(true));
  }
  function render(){ renderShelf(); renderSheets(); renderItems(); }

  LP.sides = { init, render, renderItems, markCurrent, onDecoded, refreshPlate };
})();
