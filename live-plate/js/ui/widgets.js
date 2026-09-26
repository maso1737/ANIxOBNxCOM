/* ============================================================
   LIVE PLATE — ui/widgets.js（小さな共通部品）
   toast / modalConfirm / フローティングパネル（移動・▾・下端リサイズ）/ qd-* の組み立て /
   数値スクラブ（左右ドラッグ・Wクリックで直接入力）/ CVC（canvas が CSS 変数を読むための橋）
   正準：oban-builder.html（toast・modalConfirm・makePanelDraggable/Resizable・qdSect/qdRow/qdSeg）
   ============================================================ */
var LP = window.LP || (window.LP = {});

(function(){
  'use strict';
  const $ = s => document.querySelector(s);

  /* ---------- toast ---------- */
  let toastT = 0;
  function toast(msg, ms){
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), ms || 2600);
  }

  /* ---------- アプリ内 confirm（native confirm 禁止。Enter=OK / Esc=CANCEL。開いている間はキーを capture で飲む） ---------- */
  let cfOpen = false;
  function modalConfirm(msg, okLabel){
    return new Promise(res => {
      const ov = $('#cf-modal');
      $('#cf-msg').textContent = msg;
      $('#cf-ok').textContent = okLabel || 'OK';
      cfOpen = true;
      const done = v => {
        ov.classList.remove('show');
        document.removeEventListener('keydown', onKey, true);
        cfOpen = false;
        res(v);
      };
      const onKey = e => {
        e.stopPropagation();
        if(e.key === 'Escape'){ e.preventDefault(); done(false); }
        else if(e.key === 'Enter'){ e.preventDefault(); done(true); }
      };
      $('#cf-ok').onclick = () => done(true);
      $('#cf-cancel').onclick = () => done(false);
      document.addEventListener('keydown', onKey, true);
      ov.classList.add('show');
      $('#cf-ok').focus();
    });
  }

  /* ---------- フローティングパネル（ヘッダで移動 / 下端で高さ / ▾ で最小化） ---------- */
  function makePanelDraggable(panel, head){
    let drag = false, sx = 0, sy = 0, ox = 0, oy = 0;
    head.addEventListener('pointerdown', e => {
      if(e.target.closest('button')) return;
      drag = true;
      const r = panel.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      panel.style.left = ox + 'px'; panel.style.top = oy + 'px'; panel.style.right = 'auto';
      head.setPointerCapture(e.pointerId); e.preventDefault();
    });
    head.addEventListener('pointermove', e => {
      if(!drag) return;
      const maxX = window.innerWidth - 60, maxY = window.innerHeight - 40;
      panel.style.left = Math.max(80 - panel.offsetWidth, Math.min(maxX, ox + e.clientX - sx)) + 'px';
      panel.style.top = Math.max(0, Math.min(maxY, oy + e.clientY - sy)) + 'px';
    });
    const end = () => { drag = false; };
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
  }
  function makePanelResizable(handle, body, snapSel){
    let on = false, y0 = 0, h0 = 0;
    handle.addEventListener('pointerdown', e => {
      on = true; y0 = e.clientY; h0 = body.getBoundingClientRect().height;
      handle.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation();
    });
    handle.addEventListener('pointermove', e => {
      if(!on) return;
      const top = body.getBoundingClientRect().top;
      const max = Math.max(80, window.innerHeight - top - 24);
      let h = h0 + (e.clientY - y0);
      if(snapSel){   // 項目の下端へスナップ（±14px）＝中途半端に1行だけ見える状態を作らない
        for(const s of body.querySelectorAll(snapSel)){
          const tg = s.getBoundingClientRect().bottom - top + 6;
          if(Math.abs(h - tg) < 14){ h = tg; break; }
        }
      }
      h = Math.min(max, Math.max(80, h));
      body.style.maxHeight = h + 'px'; body.style.height = h + 'px';
    });
    const end = () => { on = false; };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }
  function makeMinimizable(panel, btn){
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const mini = panel.classList.toggle('mini');
      btn.textContent = mini ? '▸' : '▾';
      btn.title = mini ? '展開' : '最小化';
    });
  }

  /* ---------- qd-* の組み立て（OBAN と同じ名前） ---------- */
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function qdSect(en, jp){ return '<div class="qd-sect"><span class="en">' + en + '</span><span class="jp">' + (jp || '') + '</span></div>'; }
  function qdRow(label, html, title){ return '<div class="qd-row"' + (title ? ' title="' + esc(title) + '"' : '') + '><span class="k">' + label + '</span>' + html + '</div>'; }
  function qdSeg(act, items, cur){
    return '<div class="qd-seg">' + items.map(it => {
      const v = Array.isArray(it) ? it[0] : it, lb = Array.isArray(it) ? it[1] : it;
      return '<button class="qd-sb' + (String(v) === String(cur) ? ' on' : '') + '" data-act="' + act + '" data-v="' + esc(v) + '">' + lb + '</button>';
    }).join('') + '</div>';
  }
  /* 数値：data-scr=key。値の読み書きは呼ぶ側の SCR[key] = {get, set, step, min, max, fmt, unit, done} */
  function qdNum(key, label, val, unit){
    return '<span class="qd-num" data-scr="' + key + '"><span class="k">' + (label || '') + '</span><span class="v">' + esc(val) + '</span><span class="u">' + (unit || '') + '</span></span>';
  }

  /* ---------- 数値スクラブ（左右ドラッグ／Wクリックで入力。ドラッグ中はテキストだけ・離したら全再描画） ---------- */
  function bindScrub(root, SCR){
    root.addEventListener('pointerdown', e => {
      const el = e.target.closest && e.target.closest('[data-scr]');
      if(!el || !root.contains(el) || el.querySelector('input')) return;
      const def = SCR[el.dataset.scr];
      if(!def) return;
      e.preventDefault();
      const x0 = e.clientX, v0 = def.get();
      let moved = false;
      el.setPointerCapture(e.pointerId);
      const vEl = el.querySelector('.v');
      const mv = ev => {
        const dx = ev.clientX - x0;
        if(!moved && Math.abs(dx) < 3) return;
        moved = true;
        const k = ev.shiftKey ? 10 : 1;
        let v = v0 + Math.round(dx / (def.px || 4)) * (def.step || 1) * k;
        v = Math.max(def.min == null ? -Infinity : def.min, Math.min(def.max == null ? Infinity : def.max, v));
        def.set(v, true);
        if(vEl) vEl.textContent = def.fmt ? def.fmt(def.get()) : def.get();
      };
      const up = () => {
        el.removeEventListener('pointermove', mv);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        if(moved && def.done) def.done();
      };
      el.addEventListener('pointermove', mv);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
    root.addEventListener('dblclick', e => {
      const el = e.target.closest && e.target.closest('[data-scr]');
      if(!el || !root.contains(el)) return;
      const def = SCR[el.dataset.scr];
      if(!def) return;
      const vEl = el.querySelector('.v');
      const inp = document.createElement('input');
      inp.value = def.edit ? def.edit(def.get()) : def.get();
      vEl.replaceWith(inp);
      inp.focus(); inp.select();
      let fin = false;
      const finish = ok => {
        if(fin) return; fin = true;
        if(ok){
          const raw = def.parse ? def.parse(inp.value) : parseFloat(inp.value);
          if(isFinite(raw)){
            const v = Math.max(def.min == null ? -Infinity : def.min, Math.min(def.max == null ? Infinity : def.max, raw));
            def.set(v, false);
            if(def.done) def.done();
          }
        }
        const s = document.createElement('span'); s.className = 'v';
        s.textContent = def.fmt ? def.fmt(def.get()) : def.get();
        if(inp.parentNode) inp.replaceWith(s);
      };
      inp.addEventListener('keydown', ev => {
        ev.stopPropagation();
        if(ev.key === 'Enter'){ ev.preventDefault(); finish(true); }
        else if(ev.key === 'Escape'){ ev.preventDefault(); finish(false); }
      });
      inp.addEventListener('blur', () => finish(true));
    });
  }

  /* ---------- CVC：canvas の HUD 色（CSS 変数を1回だけ拾う。リテラルの hex を JS に散らさない） ---------- */
  const CVC = { acc: '#C46BFF', acc2: '#9BF3FF', pt: '#5AE9FF', mark: '#FFC94F', danger: '#FF5A5A' };
  function syncCanvasColors(){
    try{
      const cs = getComputedStyle(document.documentElement);
      const g = n => cs.getPropertyValue(n).trim();
      CVC.acc = g('--acc') || CVC.acc; CVC.acc2 = g('--acc2') || CVC.acc2;
      CVC.pt = g('--acc-pt') || CVC.pt; CVC.mark = g('--mark') || CVC.mark; CVC.danger = g('--danger') || CVC.danger;
    }catch(e){}
  }

  const ui = LP.ui || (LP.ui = {});
  Object.assign(ui, {
    toast, modalConfirm,
    makePanelDraggable, makePanelResizable, makeMinimizable,
    esc, qdSect, qdRow, qdSeg, qdNum, bindScrub,
    CVC, syncCanvasColors,
  });
  Object.defineProperty(ui, 'cfOpen', { get: () => cfOpen, configurable: true });
})();
