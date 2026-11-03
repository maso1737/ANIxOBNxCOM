/* ============================================================
   LIVE PLATE — mode/take.js（03 TAKE：カメラを撮る。SPEC_21 §7-3 / §19）
   ステージ＝カメラの窓（書き出しと同じ式）。**窓の外も暗く見える**（隣のコマを残したままカメラを送る＝読む順番が見える）。
     左ドラッグ＝カメラを動かす（紙を掴んで引く向き）／ Shift＋ドラッグ＝回す
     ホイール＝寄る・引く（カーソルの下の紙が動かない）／ Shift＋ホイール＝回す ／ Alt＋ホイール＝表示の拡縮
     中・右ドラッグ＝表示を動かす
   「手持ちのカメラ」（hand）＝いじったけれどまだ KF にしていない窓。BOOK には入らない（Undo の外）。
     C＝KF にする（CAPTURE）／ Shift＋C＝選んでいる KF を今の窓で上書き ／ Esc＝手持ちを捨てて TAKE の窓に戻る
   KF の時間：take.auto の間は「止まり（dwell）と移動の重み」で紙の尺に配る（OBAN buildTake）＝紙の尺を変えるとついてくる。
     タイムラインの ◆ をドラッグした瞬間に auto を外す（以後は composer と同じ手で決める時刻）。
   ★ 式（kfAt / layoutTake / shakeAt）は core/time.js にだけ置く（ビューアに同梱される）。
   ============================================================ */
var LP = window.LP || (window.LP = {});

(function(){
  'use strict';
  const A = () => LP.app;
  const T = () => LP.time;
  let hand = null;          // 手持ちのカメラ { x, y, z, rot, s } | null
  let flash = 0;            // CAPTURE した窓を一瞬光らせる（見せもの）

  function curSheet(){ return A().curSheet(); }
  function base(){ return LP.render.camBase(LP.book); }
  function takeOf(sh){ return sh && sh.take && sh.take.kf ? sh.take : null; }
  function kfs(sh){ const tk = takeOf(sh || curSheet()); return tk ? tk.kf : []; }
  function selKf(){ const id = LP.state.selKf; return id ? kfs().find(k => k.id === id) || null : null; }

  /* いま編集しているカメラ（手持ちがあればそれ・無ければ TAKE の窓＝ブレなし） */
  function cam(){
    if(hand) return hand;
    const at = A().curAt();
    return at ? LP.render.camRaw(at.sheet, at.local) : T().camOf(null);
  }
  function getHand(){ return hand; }
  function grab(){ if(!hand) hand = Object.assign({}, cam()); return hand; }
  function dropHand(){ if(!hand) return false; hand = null; LP.stage.renderQ(); A().hud(); return true; }

  /* AUTO の紙は KF の f / hold を書き直す（紙の尺・並び・dwell が変わったら必ず通す。commit が呼ぶ） */
  function relayout(sh){
    const tk = takeOf(sh);
    if(!tk) return;
    if(tk.auto) T().layoutTake(tk, sh.dur, base());
    else tk.kf.sort((a, b) => a.f - b.f);
  }
  function relayoutAll(){ if(LP.book) LP.book.sheets.forEach(relayout); }

  function seekKf(k){
    const at = A().curAt();
    if(!at || !k) return;
    A().seek(at.start + Math.min(at.sheet.dur - 1, k.f));
  }
  function select(id, go){
    LP.state.selKf = id || null;
    hand = null;
    const k = selKf();
    if(go && k) seekKf(k);
    LP.timeline.renderTake();
    if(!LP.state.exporting) LP.dock.render();
    LP.stage.renderQ();
    A().hud();
  }

  /* C：いまの窓を KF に。AUTO＝選んでいる KF の次（無ければ再生位置より前の最後の KF の次）に挿入して配り直す。
     手動＝再生位置の時刻に打つ（同じ時刻に KF があれば上書き＝composer setKf） */
  function capture(){
    const at = A().curAt();
    if(!at) return;
    A().stop();
    const sh = at.sheet;
    if(!sh.take) sh.take = LP.model.newTake();
    const tk = sh.take, c = cam();
    let k, label;
    if(!tk.auto && (k = tk.kf.find(o => o.f === at.local))){
      Object.assign(k, LP.model.newKf(c, at.local), { id: k.id, hold: k.hold, ei: k.ei, eo: k.eo, dwell: k.dwell });
      label = 'KF を上書き';
    }else{
      k = LP.model.newKf(c, at.local);
      if(tk.auto){
        const s = selKf();
        let i = s ? tk.kf.indexOf(s) + 1 : 0;
        if(!s) tk.kf.forEach((o, j) => { if(o.f <= at.local) i = j + 1; });
        tk.kf.splice(i, 0, k);
      }else{
        tk.kf.push(k);
      }
      label = 'CAPTURE';
    }
    hand = null;
    LP.state.selKf = k.id;
    flash = performance.now();
    A().commit(label);
    seekKf(k);
    const n = tk.kf.indexOf(k) + 1;
    LP.ui.toast('◆ ' + label + ' — KF ' + n + ' / ' + tk.kf.length + (tk.auto ? '（AUTO：紙の尺に配りました）' : '（' + T().fmtDur(k.f, LP.book.fps) + '）'));
    pulse();
  }
  /* Shift＋C：選んでいる KF を今の窓で上書き（時刻・緩急・dwell はそのまま） */
  function update(){
    const k = selKf();
    if(!k){ capture(); return; }
    const c = cam();
    ['x', 'y', 'z', 'rot', 's'].forEach(p => { k[p] = LP.model.newKf(c, 0)[p]; });
    hand = null;
    flash = performance.now();
    A().commit('KF を上書き');
    seekKf(k);
    LP.ui.toast('◆ KF ' + (kfs().indexOf(k) + 1) + ' を今の窓で上書きしました');
    pulse();
  }
  function deleteSel(){
    const sh = curSheet(), k = selKf();
    if(!sh || !k) return false;
    sh.take.kf.splice(sh.take.kf.indexOf(k), 1);
    LP.state.selKf = null;
    A().commit('KF を消す');
    LP.ui.toast('KF を消しました（Ctrl+Z で戻せます）');
    return true;
  }
  function clearTake(){
    const sh = curSheet();
    if(!sh || !kfs(sh).length) return;
    sh.take = null;
    LP.state.selKf = null; hand = null;
    A().commit('カメラを外す');
    LP.ui.toast(sh.name + ' のカメラを外しました（既定の窓＝紙全面・Ctrl+Z で戻せます）');
  }
  /* ←→：KF を順に選んで頭出し */
  function step(d){
    const list = kfs();
    if(!list.length){ A().stop(); A().seek(LP.state.t + d); return; }
    A().stop();
    const at = A().curAt(), s = selKf();
    let i = s ? list.indexOf(s) : -1;
    if(i < 0){
      i = d > 0 ? list.findIndex(k => k.f > at.local) : list.length - 1 - [...list].reverse().findIndex(k => k.f < at.local);
      if(i < 0 || i >= list.length) i = d > 0 ? list.length - 1 : 0;
    }else i = Math.max(0, Math.min(list.length - 1, i + d));
    select(list[i].id, true);
  }
  function setAuto(on){
    const sh = curSheet();
    if(!sh) return;
    if(!sh.take) sh.take = LP.model.newTake();
    sh.take.auto = !!on;
    A().commit(on ? 'AUTO（dwell で配る）' : 'AUTO を外す');
    LP.ui.toast(on ? 'AUTO：KF を dwell と移動の重みで紙の尺に配り直しました' : 'AUTO を外しました（KF の時刻はタイムラインの ◆ で決める）');
  }
  /* タイムラインの ◆ ドラッグ：紙の中の時刻を直接決める＝AUTO は外れる。commit は離したとき（呼ぶ側） */
  function moveKf(id, f){
    const sh = curSheet(), tk = takeOf(sh);
    const k = tk && tk.kf.find(o => o.id === id);
    if(!k) return false;
    let wasAuto = false;
    if(tk.auto){ tk.auto = false; wasAuto = true; }
    k.f = Math.max(0, Math.min(sh.dur - 1, Math.round(f)));
    return wasAuto;
  }
  function setEase(k, ei, eo){ if(!k) return; k.ei = ei; k.eo = eo; }
  function resetHand(){
    hand = Object.assign({}, T().camOf(null));
    LP.stage.renderQ(); A().hud(); if(!LP.state.exporting) LP.dock.render();
    LP.ui.toast('手持ちのカメラを既定の窓（紙全面）に。C で KF にします');
  }
  function cancel(){
    if(drag){ hand = drag.h0; drag = null; LP.stage.renderQ(); return true; }
    if(dropHand()){ if(!LP.state.exporting) LP.dock.render(); LP.ui.toast('手持ちのカメラを捨てて TAKE の窓に戻しました'); return true; }
    return false;
  }

  /* ---------- ステージ（stage.js から） ---------- */
  let drag = null, pulseT = 0;
  function pulse(){
    cancelAnimationFrame(pulseT);
    const go = () => { LP.stage.renderQ(); if(performance.now() - flash < 600) pulseT = requestAnimationFrame(go); };
    pulseT = requestAnimationFrame(go);
  }
  function down(e, sp, R){
    if(LP.state.playing) A().stop();
    const h = grab();
    drag = { kind: 'cam', x0: sp.x, y0: sp.y, h0: Object.assign({}, h), rot: e.shiftKey, R,
      a0: Math.atan2(sp.y - (R.y + R.h / 2), sp.x - (R.x + R.w / 2)), moved: false };
    return drag;
  }
  function move(e, sp){
    if(!drag) return;
    const d = drag, h = hand, R = d.R;
    if(!d.moved && Math.hypot(sp.x - d.x0, sp.y - d.y0) < 2) return;
    d.moved = true;
    if(d.rot){
      const a = Math.atan2(sp.y - (R.y + R.h / 2), sp.x - (R.x + R.w / 2));
      let r = d.h0.rot - (a - d.a0) * 180 / Math.PI;
      if(e.altKey) r = Math.round(r / 15) * 15;
      h.rot = r;
    }else{
      // 掴んだ紙の点がポインタについてくる＝カメラはその逆へ
      const p0 = LP.render.camToPaper(LP.book, d.h0, R, d.x0, d.y0);
      const p1 = LP.render.camToPaper(LP.book, d.h0, R, sp.x, sp.y);
      h.x = d.h0.x - (p1.x - p0.x);
      h.y = d.h0.y - (p1.y - p0.y);
    }
    LP.stage.renderQ();
    liveDock();
  }
  function up(){
    if(!drag) return;
    const d = drag; drag = null;
    if(!d.moved && sameAsTake()) hand = null;   // 触っただけ＝手持ちにしない
    A().hud();
    if(!LP.state.exporting) LP.dock.render();
  }
  function sameAsTake(){
    if(!hand) return true;
    const at = A().curAt(), c = at ? LP.render.camRaw(at.sheet, at.local) : T().camOf(null);
    return ['x', 'y', 'z', 'rot', 's'].every(p => Math.abs((hand[p] || 0) - (c[p] || 0)) < 1e-6);
  }
  /* ホイール：寄る・引く（カーソルの下の紙の点を止めたまま）。Shift＝回す */
  function wheel(e, sp, R){
    if(LP.state.playing) A().stop();
    const h = grab();
    if(e.shiftKey){
      h.rot = (h.rot || 0) + (e.deltaY > 0 ? 1 : -1) * (e.altKey ? 0.25 : 1);
    }else{
      const p = LP.render.camToPaper(LP.book, h, R, sp.x, sp.y);
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      h.s = Math.max(0.1, Math.min(20, (h.s || 1) * f));
      const q = LP.render.camToPaper(LP.book, h, R, sp.x, sp.y);
      h.x += p.x - q.x; h.y += p.y - q.y;
    }
    LP.stage.renderQ();
    A().hud();
    liveDock();
  }
  /* ドックの手持ちの数値を、作り直さずに文字だけ差し替える */
  function liveDock(){
    const c = cam();
    const set = (id, v) => { const el = document.querySelector('[data-scr="' + id + '"] .v'); if(el) el.textContent = v; };
    set('cx', Math.round(c.x)); set('cy', Math.round(c.y)); set('cz', Math.round(c.z)); set('crot', (+c.rot).toFixed(1)); set('cs', Math.round(c.s * 100));
    const st = document.getElementById('dk-hand');
    if(st){ st.textContent = hand ? '● 手持ち（C で KF ・ Esc で戻す）' : 'TAKE の窓'; st.classList.toggle('on', !!hand); }
  }

  /* 窓の外の手すり：KF ごとの窓（紙の上の四角）と、それをつなぐ道筋＝読む順番。番号つき。
     いま写っている窓（R）は stage が描く。ctx は素の座標（device px） */
  function gateQuad(c, R){
    const P = LP.render.camToPaper, b = LP.book;
    return [[R.x, R.y], [R.x + R.w, R.y], [R.x + R.w, R.y + R.h], [R.x, R.y + R.h]].map(q => P(b, c, R, q[0], q[1]));
  }
  function overlay(ctx, R, dpr){
    if(!LP.state.takeGuides) return;
    const sh = curSheet(), list = kfs(sh), C = LP.ui.CVC, now = cam();
    const toS = p => LP.render.paperToCam(LP.book, now, R, p.x, p.y);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // 紙の縁（窓の外が紙の外かどうか）
    const pq = [[0, 0], [LP.book.paper.w, 0], [LP.book.paper.w, LP.book.paper.h], [0, LP.book.paper.h]].map(q => toS({ x: q[0], y: q[1] }));
    ctx.setLineDash([4 * dpr, 4 * dpr]); ctx.lineWidth = dpr; ctx.strokeStyle = 'rgba(232,236,242,.28)';
    ctx.beginPath(); pq.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath(); ctx.stroke();
    ctx.setLineDash([]);
    if(list.length){
      const sel = selKf();
      const centers = list.map(k => toS({ x: LP.book.paper.w / 2 + (k.x || 0), y: LP.book.paper.h / 2 + (k.y || 0) }));
      // 道筋
      ctx.lineWidth = 1.5 * dpr; ctx.strokeStyle = 'rgba(' + hexRGB(C.pt) + ',.55)';
      ctx.setLineDash([6 * dpr, 5 * dpr]);
      ctx.beginPath(); centers.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
      ctx.setLineDash([]);
      list.forEach((k, i) => {
        const q = gateQuad(T().camOf(k), R).map(toS);
        const on = sel && sel.id === k.id;
        ctx.lineWidth = (on ? 2 : 1) * dpr;
        ctx.strokeStyle = on ? C.acc2 : 'rgba(' + hexRGB(C.pt) + ',.6)';
        ctx.beginPath(); q.forEach((p, j) => j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.stroke();
        // 番号（窓の左上）
        const lab = String(i + 1);
        ctx.font = '700 ' + Math.round(12 * dpr) + 'px Saira, sans-serif';
        const tw = ctx.measureText(lab).width + 8 * dpr;
        ctx.fillStyle = on ? C.acc2 : 'rgba(' + hexRGB(C.pt) + ',.85)';
        ctx.fillRect(q[0].x, q[0].y, tw, 16 * dpr);
        ctx.fillStyle = '#0B0D12';
        ctx.fillText(lab, q[0].x + 4 * dpr, q[0].y + 12 * dpr);
        // 中心の点
        ctx.beginPath(); ctx.arc(centers[i].x, centers[i].y, (on ? 4 : 3) * dpr, 0, Math.PI * 2); ctx.fill();
      });
    }
    // CAPTURE した瞬間に窓を光らせる
    const fl = 1 - (performance.now() - flash) / 600;
    if(fl > 0){
      ctx.lineWidth = (2 + fl * 6) * dpr; ctx.strokeStyle = 'rgba(' + hexRGB(C.acc2) + ',' + (fl * 0.9).toFixed(3) + ')';
      ctx.strokeRect(R.x, R.y, R.w, R.h);
    }
    ctx.restore();
  }
  function hexRGB(h){
    h = String(h || '').replace('#', '');
    if(h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return isFinite(n) ? ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) : '90,233,255';
  }
  function hudText(){
    const sh = curSheet(), list = kfs(sh), k = selKf(), tk = takeOf(sh);
    const c = cam();
    const st = hand ? '● 手持ち' : list.length ? (tk.auto ? 'AUTO' : 'MANUAL') : '既定の窓';
    return 'CAMERA ' + st + (k ? '　KF ' + (list.indexOf(k) + 1) + '/' + list.length : list.length ? '　KF ' + list.length : '') + '　×' + (c.s || 1).toFixed(2);
  }
  function hint(){
    const list = kfs();
    if(hand) return '手持ちのカメラ：C＝KF にする／Shift＋C＝選んだ KF を上書き／Esc＝戻す';
    if(!list.length) return 'ドラッグ＝カメラを動かす・ホイール＝寄る／引く・Shift＝回す → C で KF（2つ打つとカメラが動く）';
    return '←→＝KF を選ぶ・C＝KF を足す・タイムラインの ◆ をドラッグ＝時刻（AUTO が外れる）・H＝窓の手すり';
  }

  /* ---------- 数値（ドック）。SCR は詳細パネルと共有の表 ---------- */
  function scr(){
    const H = p => ({ get: () => { const c = cam(); return p === 's' ? Math.round(c.s * 100) : p === 'rot' ? +(+c.rot).toFixed(1) : Math.round(c[p]); },
      set: v => { const h = grab(); h[p] = p === 's' ? Math.max(10, v) / 100 : v; LP.stage.renderQ(); liveDock(); },
      fmt: v => p === 'rot' ? (+v).toFixed(1) : v,
      px: p === 's' ? 2 : p === 'rot' ? 6 : 2, step: p === 'rot' ? 0.5 : p === 's' ? 1 : 4,
      done: () => { A().hud(); if(!LP.state.exporting) LP.dock.render(); } });
    const K = (get, set, min, max, px, step) => ({ get: () => { const k = selKf(); return k ? get(k) : 0; },
      set: v => { const k = selKf(); if(k){ set(k, Math.max(min, Math.min(max, v))); relayout(curSheet()); LP.stage.renderQ(); } },
      min, max, px, step, done: () => A().commit('KF の値') });
    const sheetVal = (get, set, min, max, px, step, label) => ({ get: () => { const s = curSheet(); return s ? get(s) : 0; },
      set: v => { const s = curSheet(); if(s){ set(s, Math.max(min, Math.min(max, v))); LP.stage.renderQ(); } }, min, max, px, step, done: () => A().commit(label) });
    Object.assign(LP.detail.SCR, {
      cx: H('x'), cy: H('y'), cz: H('z'), crot: H('rot'), cs: H('s'),
      kdwell: Object.assign(K(k => +(k.dwell == null ? 1 : k.dwell).toFixed(2), (k, v) => { k.dwell = +v.toFixed(2); }, 0.05, 20, 4, 0.05), { fmt: v => (+v).toFixed(2) }),
      khold: K(k => k.hold || 0, (k, v) => { k.hold = Math.round(v); }, 0, 9999, 6, 1),
      kei: K(k => k.ei || 0, (k, v) => { k.ei = Math.round(v); }, 0, 100, 2, 1),
      keo: K(k => k.eo || 0, (k, v) => { k.eo = Math.round(v); }, 0, 100, 2, 1),
      tdur: sheetVal(s => s.in.dur | 0, (s, v) => { s.in.dur = Math.round(v); if(s.in.type === 'cut' && v > 0) s.in.type = 'fade'; }, 0, 240, 6, 1, '繋ぎの長さ'),
      sa0: sheetVal(s => s.shake ? s.shake.a0 | 0 : 0, (s, v) => { s.shake = Object.assign({ a0: 0, a1: 0, freq: T().SHAKE_FREQ_DEF }, s.shake || {}, { a0: Math.round(v) }); }, 0, 100, 2, 1, '画ブレ'),
      sa1: sheetVal(s => s.shake ? s.shake.a1 | 0 : 0, (s, v) => { s.shake = Object.assign({ a0: 0, a1: 0, freq: T().SHAKE_FREQ_DEF }, s.shake || {}, { a1: Math.round(v) }); }, 0, 100, 2, 1, '画ブレ'),
      sfreq: sheetVal(s => s.shake ? s.shake.freq || T().SHAKE_FREQ_DEF : T().SHAKE_FREQ_DEF, (s, v) => { s.shake = Object.assign({ a0: 0, a1: 0 }, s.shake || {}, { freq: Math.round(v) }); }, 1, 24, 8, 1, '画ブレの速さ'),
    });
  }

  function init(){ scr(); }

  LP.takeTools = {
    init, cam, getHand, dropHand, resetHand, relayout, relayoutAll,
    capture, update, deleteSel, clearTake, step, select, setAuto, moveKf, setEase, selKf, kfs, cancel,
    down, move, up, wheel, overlay, hudText, hint, liveDock,
    get dragging(){ return !!drag; },
  };
})();
