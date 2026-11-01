/* ============================================================
   LIVE PLATE — mode/take.js（03 TAKE：カメラの窓を動かして KF を打つ。SPEC_21 §7-3 / §19）
   OBAN の手つき（窓・CAPTURE・チップ）で composer の式（render.js camAt）に打つ。
     窓の中をドラッグ＝パン／隅＝寄り引き／上の ●＝回転（Shift＝15°）／ホイール＝寄り引き（Alt＋ホイール＝表示のズーム）
     C＝CAPTURE（いまの窓を KF に）／Shift＋C＝選んでいる KF に上書き／←→＝前後の KF／Ctrl＋←→＝入れ替え／Delete＝KF を消す／P＝MONITOR
   ★ 窓を触ると、いつも**下書きの窓**（LP.state.camDraft）を動かす。KF は直接は動かさない（OBAN の VC と同じ）。
     下書きが無いときの窓＝カメラの画（camAt）。C で KF を足す／Shift＋C で選んでいる KF を上書き／Esc で捨てる
     （初版は「止めの中なら KF を直接」にしたが、KF が1つだと紙の全部が止めの中になり、2つ目の窓が作れなかった）
   ★ 下書きは作品ではない（BOOK に入らない）。紙が替わったら捨てる
   ============================================================ */
var LP = window.LP || (window.LP = {});

(function(){
  'use strict';
  const HANDLE = 9, KNOB = 26, MON_LS = 'liveplate_monitor_v1';   // LP.state の camDraft / kfSel / monitor は app.js
  let wheelT = 0, lastSheet = null;

  function cur(){
    const at = LP.app.curAt();
    if(!at) return null;
    if(lastSheet !== at.sheet.id){ lastSheet = at.sheet.id; LP.state.camDraft = null; }
    return at;
  }
  function selKf(at){
    at = at || cur();
    if(!at || !LP.state.kfSel) return null;
    return LP.take.kfs(at.sheet).find(k => k.id === LP.state.kfSel) || null;
  }
  /* いまの窓（下書きがあればそれ） */
  function livePose(at){
    at = at || cur();
    if(!at) return LP.take.pose({});
    return LP.state.camDraft && !LP.state.playing ? LP.take.pose(LP.state.camDraft) : LP.render.camAt(LP.book, at.sheet, at.local);   // 再生中はカメラの画
  }
  /* 動かす相手＝下書きの窓（無ければ、いまの窓から作る） */
  function editTarget(at, make){
    at = at || cur();
    if(!at) return null;
    if(LP.state.camDraft) return { draft: true, o: LP.state.camDraft };
    if(!make) return null;
    LP.state.camDraft = livePose(at);
    return { draft: true, o: LP.state.camDraft };
  }
  function label(at){
    at = at || cur();
    if(!at) return '';
    const s = selKf(at), n = s ? at.sheet.take.kf.indexOf(s) + 1 : 0;
    if(LP.state.camDraft) return '下書きの窓 — C で KF を足す' + (s ? '／Shift＋C で KF ' + n + ' に上書き' : '') + '／Esc で捨てる';
    return LP.take.kfs(at.sheet).length ? 'カメラの画（KF ' + LP.take.kfs(at.sheet).length + '）— 窓を触ると下書き' : 'KF なし＝紙全面 — 窓を動かして C で最初の KF';
  }

  /* ---------- ポインタ（stage.js から。wp＝紙座標） ---------- */
  function hit(sp, H){
    const at = cur();
    if(!at) return null;
    const win = LP.take.windowOf(LP.book, livePose(at)), cs = LP.take.corners(win).map(p => H.toScreen(p.x, p.y));
    const top = { x: (cs[0].x + cs[1].x) / 2, y: (cs[0].y + cs[1].y) / 2 }, ctr = H.toScreen(win.cx, win.cy);
    const ux = top.x - ctr.x, uy = top.y - ctr.y, ul = Math.hypot(ux, uy) || 1;
    const knob = { x: top.x + ux / ul * KNOB, y: top.y + uy / ul * KNOB };
    if(Math.hypot(sp.x - knob.x, sp.y - knob.y) <= HANDLE + 2) return { part: 'rot', win, ctr };
    for(const c of cs) if(Math.hypot(sp.x - c.x, sp.y - c.y) <= HANDLE + 2) return { part: 'scale', win, ctr };
    const l = LP.take.toLocal(win, H.toWorld(sp.x, sp.y));
    if(Math.abs(l.x) <= win.w / 2 && Math.abs(l.y) <= win.h / 2) return { part: 'move', win, ctr };
    return null;
  }
  function down(e, sp, wp, H){
    if(LP.state.step !== 'take') return null;
    const h = hit(sp, H);
    if(!h) return null;
    LP.app.stop();
    const at = cur(), tg = editTarget(at, true);
    const p0 = LP.take.pose(tg.o);
    return { kind: 'cam', part: h.part, tg, p0, w0: wp, ctr: h.ctr, a0: Math.atan2(sp.y - h.ctr.y, sp.x - h.ctr.x), d0: Math.hypot(sp.x - h.ctr.x, sp.y - h.ctr.y) || 1, moved: false };
  }
  function move(e, sp, wp, d){
    const o = d.tg.o;
    d.moved = true;
    if(d.part === 'move'){ o.x = d.p0.x + (wp.x - d.w0.x); o.y = d.p0.y + (wp.y - d.w0.y); }
    else if(d.part === 'scale'){ const dd = Math.hypot(sp.x - d.ctr.x, sp.y - d.ctr.y) || 1; o.s = d.p0.s * d.d0 / dd; }
    else if(d.part === 'rot'){
      let r = d.p0.rot + (Math.atan2(sp.y - d.ctr.y, sp.x - d.ctr.x) - d.a0) * 180 / Math.PI;
      if(e.shiftKey) r = Math.round(r / 15) * 15;
      o.rot = r;
    }
    LP.take.clampPose(o);
    LP.stage.renderQ();
    LP.dock.liveTake && LP.dock.liveTake();
  }
  function up(e, sp, wp, d){
    LP.stage.renderQ();
    if(d.moved){ LP.dock.render(); LP.app.hud(); LP.app.crumb(); }
  }
  /* KF を書き換えた後：auto なら f が動くので、その KF の頭へ付いていく */
  function afterKfEdit(k, lab){
    const at = cur();
    LP.state.kfSel = k.id;
    LP.take.rebuild(LP.book, at.sheet);
    LP.app.commit(lab + '（KF ' + (at.sheet.take.kf.indexOf(k) + 1) + '）');
    const a2 = cur();
    if(a2) LP.app.seek(a2.start + k.f);
  }
  function hover(sp, wp, H){
    if(LP.state.step !== 'take') return '';
    const h = hit(sp, H);
    return !h ? '' : h.part === 'move' ? 'move' : h.part === 'scale' ? 'nwse-resize' : 'grab';
  }
  /* ホイール＝寄り引き（窓の中心で）。KF を直接いじるときは止まってから Undo 1手 */
  function wheel(e){
    if(LP.state.step !== 'take') return false;
    const at = cur(), tg = editTarget(at, true);
    if(!tg) return false;
    LP.app.stop();
    tg.o.s = (tg.o.s || 1) * Math.exp(-e.deltaY * 0.0015);
    LP.take.clampPose(tg.o);
    LP.stage.renderQ();
    LP.dock.liveTake && LP.dock.liveTake();
    clearTimeout(wheelT);
    wheelT = setTimeout(() => { LP.dock.render(); LP.app.crumb(); }, 350);
    return true;
  }

  /* ---------- KF の操作 ---------- */
  function capture(){
    if(LP.state.step !== 'take'){ LP.ui.toast('03 TAKE の操作です（3 で入る）'); return; }
    const at = cur();
    if(!at) return;
    LP.app.stop();
    const p = livePose(at), k = LP.take.capture(LP.book, at.sheet, at.local, p, LP.state.kfSel);
    LP.state.camDraft = null;
    LP.state.kfSel = k.id;
    const n = at.sheet.take.kf.indexOf(k) + 1, N = at.sheet.take.kf.length;
    LP.app.commit('CAPTURE（KF ' + n + '）');
    LP.app.seek(at.start + k.f);
    LP.ui.toast('CAPTURE：KF ' + n + ' / ' + N + (at.sheet.take.auto ? '（AUTO：止めと移動をこの紙の尺に配分）' : '（' + k.f + ' コマ目）'));
  }
  /* Shift＋C／↻：下書きの窓を選んでいる KF に上書き */
  function overwrite(){
    if(LP.state.step !== 'take') return;
    const at = cur(), s = selKf(at);
    if(!s){ LP.ui.toast('上書きする KF を選んでから（←→・チップ・◆）'); return; }
    if(!LP.state.camDraft){ LP.ui.toast('窓を動かしてから（いまの窓＝KF と同じ）'); return; }
    Object.assign(s, LP.take.clampPose(LP.take.pose(LP.state.camDraft)));
    LP.state.camDraft = null;
    afterKfEdit(s, '窓を上書き');
    LP.ui.toast('KF ' + (at.sheet.take.kf.indexOf(s) + 1) + ' を いまの窓に上書きしました');
  }
  function select(id, quiet){
    const at = cur();
    const k = at && LP.take.kfs(at.sheet).find(o => o.id === id);
    if(!k) return;
    LP.state.kfSel = id;
    LP.state.camDraft = null;
    LP.app.stop();
    LP.app.seek(at.start + k.f);
    LP.dock.render(); LP.stage.renderQ();
    if(!quiet) LP.timeline.renderTake();
  }
  function step(dir){
    const at = cur();
    if(!at) return;
    const kf = LP.take.kfs(at.sheet);
    if(!kf.length){ LP.ui.toast('この紙に KF はまだありません（C で CAPTURE）'); return; }
    const s = selKf(at);
    let i = s ? kf.indexOf(s) + dir : -1;
    if(!s){
      // 選んでいなければ、いまのフレームから見て前／次
      if(dir > 0){ i = kf.findIndex(k => k.f > at.local); if(i < 0) i = kf.length - 1; }
      else { for(let j = kf.length - 1; j >= 0; j--) if(kf[j].f < at.local){ i = j; break; } if(i < 0) i = 0; }
    }
    select(kf[Math.max(0, Math.min(kf.length - 1, i))].id);
  }
  function swap(dir){
    const at = cur(), s = selKf(at);
    if(!s){ LP.ui.toast('KF を選んでから（←→）'); return; }
    if(!LP.take.swap(LP.book, at.sheet, s.id, dir)) return;
    LP.app.commit('KF の入れ替え');
    const k = at.sheet.take.kf.find(o => o.id === s.id) || s;
    LP.app.seek(at.start + k.f);
  }
  function del(id){
    const at = cur();
    id = id || LP.state.kfSel;
    if(!at || !id) return false;
    const n = LP.take.kfs(at.sheet).findIndex(k => k.id === id) + 1;
    if(!LP.take.remove(LP.book, at.sheet, id)) return false;
    if(LP.state.kfSel === id) LP.state.kfSel = null;
    LP.app.commit('KF を消す');
    LP.ui.toast('KF ' + n + ' を消しました（Ctrl+Z で戻せます）');
    return true;
  }
  function setAuto(on){
    const at = cur();
    if(!at || !at.sheet.take) return;
    at.sheet.take.auto = !!on;
    LP.take.rebuild(LP.book, at.sheet);
    LP.app.commit(on ? 'カメラの時間 AUTO' : 'カメラの時間 手動');
    LP.ui.toast(on ? 'AUTO：止め（重み）と移動の距離で、この紙の尺に配分し直しました' : '手動：◆ を動かして時刻を置く（composer と同じ）');
  }
  function setEase(id, ease){
    const at = cur(), k = at && LP.take.kfs(at.sheet).find(o => o.id === id);
    if(!k) return;
    k.ease = ease;
    LP.app.commit('KF の動き方');
  }
  /* 下書きの窓を紙全面に */
  function resetWindow(){
    const tg = editTarget(null, true);
    if(!tg) return;
    Object.assign(tg.o, { x: 0, y: 0, z: 0, rot: 0, s: 1 });
    LP.stage.renderQ(); LP.dock.render(); LP.app.hud(); LP.app.crumb();
  }
  function cancel(){
    if(LP.state.step !== 'take' || !LP.state.camDraft) return false;
    LP.state.camDraft = null;
    LP.stage.renderQ(); LP.dock.render(); LP.app.hud();
    LP.ui.toast('下書きの窓を捨てました');
    return true;
  }
  function toggleMonitor(){
    LP.state.monitor = !LP.state.monitor;
    try{ if(!LP.HARNESS_ON) localStorage.setItem(MON_LS, LP.state.monitor ? '1' : '0'); }catch(e){}
    LP.stage.renderQ(); LP.dock.render();
  }

  /* ---------- 重ね描き（ステージの ctx・画面 px＝dpr 倍） ---------- */
  function overlay(ctx, H){
    const at = cur();
    if(!at) return;
    const d = H.dpr, C = LP.ui.CVC;
    const S = p => { const s = H.toScreen(p.x, p.y); return { x: s.x * d, y: s.y * d }; };
    const path = cs => { ctx.beginPath(); cs.forEach((p, i) => { const s = S(p); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); }); ctx.closePath(); };
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // KF の窓（細い破線・番号）
    const kf = LP.take.kfs(at.sheet), sel = selKf(at);
    ctx.font = '600 ' + (11 * d) + 'px "Saira Condensed", sans-serif';
    ctx.textBaseline = 'top';
    kf.forEach((k, i) => {
      const cs = LP.take.corners(LP.take.windowOf(LP.book, k));
      ctx.setLineDash([5 * d, 5 * d]); ctx.lineWidth = d;
      ctx.strokeStyle = k === sel ? C.mark : 'rgba(232,236,242,.35)';
      path(cs); ctx.stroke();
      const s0 = S(cs[0]);
      ctx.setLineDash([]);
      ctx.fillStyle = k === sel ? C.mark : 'rgba(232,236,242,.55)';
      ctx.fillText('KF ' + (i + 1), s0.x + 4 * d, s0.y + 3 * d);
    });
    // いまの窓
    const win = LP.take.windowOf(LP.book, livePose(at)), cs = LP.take.corners(win);
    const draft = !!LP.state.camDraft, ki = LP.take.indexAt(at.sheet, at.local), onKf = !draft && ki >= 0;
    const col = draft ? C.mark : C.pt;
    ctx.setLineDash(draft ? [10 * d, 6 * d] : []);
    ctx.lineWidth = 2 * d; ctx.strokeStyle = col;
    path(cs); ctx.stroke();
    ctx.setLineDash([]);
    if(LP.state.step === 'take' && !LP.state.playing){
      ctx.fillStyle = col;
      cs.forEach(p => { const s = S(p); ctx.fillRect(s.x - 4 * d, s.y - 4 * d, 8 * d, 8 * d); });
      const a = S({ x: (cs[0].x + cs[1].x) / 2, y: (cs[0].y + cs[1].y) / 2 }), c = S({ x: win.cx, y: win.cy });
      const ux = a.x - c.x, uy = a.y - c.y, ul = Math.hypot(ux, uy) || 1, kx = a.x + ux / ul * KNOB * d, ky = a.y + uy / ul * KNOB * d;
      ctx.lineWidth = d; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(kx, ky); ctx.stroke();
      ctx.beginPath(); ctx.arc(kx, ky, 6 * d, 0, Math.PI * 2); ctx.fill();
      // 札（窓の左下の外）
      const bl = S(cs[3]);
      const txt = draft ? 'DRAFT — C で KF' : onKf ? 'KF ' + (ki + 1) : kf.length ? '移動中' : 'CAMERA';
      ctx.font = '700 ' + (12 * d) + 'px "Saira Condensed", sans-serif';
      const tw = ctx.measureText(txt).width;
      ctx.fillStyle = 'rgba(8,9,12,.82)'; ctx.fillRect(bl.x, bl.y + 4 * d, tw + 12 * d, 18 * d);
      ctx.fillStyle = col; ctx.fillText(txt, bl.x + 6 * d, bl.y + 7 * d);
    }
    ctx.restore();
  }
  function hudText(){
    const at = cur();
    if(!at) return 'CAMERA';
    const p = livePose(at);
    return 'CAMERA ×<b>' + (+p.s).toFixed(2) + '</b> ' + Math.round(p.rot) + '° Z' + Math.round(p.z) + ' ·';
  }

  LP.takeTools = { livePose, editTarget, selKf, label, down, move, up, hover, wheel, capture, overwrite, select, step, swap, del, setAuto, setEase, resetWindow, cancel, toggleMonitor, overlay, hudText, afterKfEdit };
})();
