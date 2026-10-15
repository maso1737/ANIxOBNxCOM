/* ============================================================
   LIVE PLATE — ui/stage.js（ステージ：表示・視点・ポインタの入口）
   描くのは全部 LP.render.renderFrame。ここは「どの見方で・どこに」を決めるだけ。
     01 SHEET … 紙の全面（mode:'sheet'）＋ 道具のオーバーレイ（js/mode/sheet.js）
     02 DRAW  … 選んだ層のプレート全面（mode:'focus'。紙は透かし）
     03 TAKE / 04 SHOW … カメラの窓（mode:'camera'）。窓の外の紙は暗く
     SHOW の PLAY（cleanview）… 窓を画面いっぱい
   ★ 全ポインタ処理は #stage で一元化（animator の約束）。01 SHEET の中身は LP.sheetTools に渡す。
   ============================================================ */
var LP = window.LP || (window.LP = {});

(function(){
  'use strict';
  const $ = s => document.querySelector(s);
  let cv, ctx, ov, octx, stageEl, W = 0, H = 0, dpr = 1;
  // 視点：paper＝紙座標（SHEET / TAKE / SHOW）、plate＝プレート座標（DRAW）
  const views = {
    paper: { s: 0.2, ox: 0, oy: 0, fit: true },
    plate: { s: 0.2, ox: 0, oy: 0, fit: true, key: '' },
  };
  let rq = 0, rqo = 0, drag = null;

  function init(){
    stageEl = $('#stage'); cv = $('#cv'); ctx = cv.getContext('2d');
    ov = $('#cv-ov'); octx = ov.getContext('2d');
    new ResizeObserver(resize).observe(stageEl);
    resize();
    stageEl.addEventListener('pointerdown', onDown);
    stageEl.addEventListener('pointermove', onMove);
    stageEl.addEventListener('pointerup', onUp);
    stageEl.addEventListener('pointercancel', onUp);
    stageEl.addEventListener('pointerleave', () => {
      if(drag) return;
      if(LP.state.step === 'draw') LP.drawTools.leave();
      else if(LP.sheetTools.hover(null)) renderQ();
    });
    stageEl.addEventListener('dblclick', onDbl);
    stageEl.addEventListener('wheel', onWheel, { passive: false });
    stageEl.addEventListener('contextmenu', e => e.preventDefault());
  }
  function resize(){
    const r = stageEl.getBoundingClientRect();
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ov.width = cv.width; ov.height = cv.height;
    if(!LP.book) return;   // 起動中（BOOK を読み込む前）
    if(views.paper.fit) fitView('paper');
    if(views.plate.fit) fitView('plate');
    render();
  }

  function viewKey(){ return LP.state.step === 'draw' ? 'plate' : 'paper'; }
  function worldSize(k){
    if(k === 'plate'){
      const L = LP.app.selLayer(), p = L && LP.book.plates[L.plateId];
      return p ? { w: p.w, h: p.h } : { w: LP.book.paper.w, h: LP.book.paper.h };
    }
    return { w: LP.book.paper.w, h: LP.book.paper.h };
  }
  function fitView(k){
    k = k || viewKey();
    const v = views[k], ws = worldSize(k);
    const m = LP.state.clean ? 0 : 28;
    v.s = Math.max(0.01, Math.min((W - m * 2) / ws.w, (H - m * 2) / ws.h));
    v.ox = (W - ws.w * v.s) / 2; v.oy = (H - ws.h * v.s) / 2;
    v.fit = true;
  }
  function zoomAt(k, f, sx, sy){
    const v = views[k];
    const ns = Math.max(0.01, Math.min(8, v.s * f));
    v.ox = sx - (sx - v.ox) * ns / v.s;
    v.oy = sy - (sy - v.oy) * ns / v.s;
    v.s = ns; v.fit = false;
    renderQ(); LP.app.hud();
  }
  function zoomBy(f){ zoomAt(viewKey(), f, W / 2, H / 2); }
  function fit(){ fitView(); renderQ(); LP.app.hud(); }
  function zoomPct(){ return Math.round(views[viewKey()].s * 100); }

  function toWorld(sx, sy){ const v = views[viewKey()]; return { x: (sx - v.ox) / v.s, y: (sy - v.oy) / v.s }; }
  function toScreen(wx, wy){ const v = views[viewKey()]; return { x: v.ox + wx * v.s, y: v.oy + wy * v.s }; }
  function evPt(e){ const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  /* 画面上の点 → 紙座標（DROP で使う。DRAW 中でも紙座標で返す） */
  function clientToPaper(cx, cy){
    const r = cv.getBoundingClientRect(), v = views.paper;
    return { x: (cx - r.left - v.ox) / v.s, y: (cy - r.top - v.oy) / v.s };
  }

  /* ---------- 描画 ---------- */
  function renderQ(){ if(!rq) rq = requestAnimationFrame(() => { rq = 0; render(); }); }
  /* 02 DRAW の手すり（筆の輪・投げ縄・浮いた形）は #cv-ov に別に描く＝なぞるたびに紙を描き直さない */
  function renderOv(){ if(!rqo) rqo = requestAnimationFrame(() => { rqo = 0; drawOv(); }); }
  function drawOv(){
    if(!octx) return;
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, ov.width, ov.height);
    if(LP.state.step === 'draw' && !LP.state.clean && LP.app.selLayer()) LP.drawTools.overlay(octx, helpers);
  }
  function render(){
    if(!ctx || !LP.book) return;
    const st = LP.state, C = LP.ui.CVC;
    const k = viewKey();
    const vkey = k === 'plate' ? ((LP.app.selLayer() || {}).plateId || '') : '';
    if(k === 'plate' && views.plate.key !== vkey){ views.plate.key = vkey; fitView('plate'); }
    else if(views[k].fit) fitView(k);
    const v = views[k];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const img = LP.cache.img;
    const T = LP.state.t;
    let res;
    const msg = $('#stage-msg');
    let showMsg = false;
    const sheetView = extra => Object.assign({ mode: 'sheet', img, scale: v.s * dpr, ox: v.ox * dpr, oy: v.oy * dpr }, extra || {});

    if(st.clean){
      // SHOW の PLAY：カメラの窓を画面いっぱい（黒で余白）
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
      const b = LP.render.camBase(LP.book);
      const s = Math.min(cv.width / b.w, cv.height / b.h);
      const rw = b.w * s, rh = b.h * s;
      res = LP.render.renderFrame(ctx, LP.book, T, { mode: 'camera', img, rect: { x: (cv.width - rw) / 2, y: (cv.height - rh) / 2, w: rw, h: rh } });
    }else if(st.step === 'draw'){
      const L = LP.app.selLayer();
      if(L){
        res = LP.render.renderFrame(ctx, LP.book, T, { mode: 'focus', img, layerId: L.id, baseAlpha: 0.28,
          scale: v.s * dpr, ox: v.ox * dpr, oy: v.oy * dpr, guides: true, guideColor: C.pt, px: dpr,
          under: LP.drawTools.under, mid: LP.drawTools.mid });
      }else{
        ctx.globalAlpha = 0.3;
        res = LP.render.renderFrame(ctx, LP.book, T, sheetView());
        ctx.globalAlpha = 1;
        showMsg = 'draw';
      }
    }else if(st.step === 'take' || st.step === 'show'){
      // 窓の外の紙は暗く（OBAN と同じ）。窓の中はカメラの画＝書き出しと同じ式
      ctx.globalAlpha = 0.25;
      LP.render.renderFrame(ctx, LP.book, T, sheetView());
      ctx.globalAlpha = 1;
      const b = LP.render.camBase(LP.book);
      const p0 = { x: (LP.book.paper.w - b.w) / 2, y: (LP.book.paper.h - b.h) / 2 };
      const r = { x: (v.ox + p0.x * v.s) * dpr, y: (v.oy + p0.y * v.s) * dpr, w: b.w * v.s * dpr, h: b.h * v.s * dpr };
      res = LP.render.renderFrame(ctx, LP.book, T, { mode: 'camera', img, rect: r });
      ctx.lineWidth = dpr; ctx.strokeStyle = C.pt;
      ctx.strokeRect(r.x - 0.5 * dpr, r.y - 0.5 * dpr, r.w + dpr, r.h + dpr);
      drawGateTicks(r);
    }else{
      res = LP.render.renderFrame(ctx, LP.book, T, sheetView({ guides: true, guideColor: C.pt, px: dpr }));
      LP.sheetTools.overlay(ctx, helpers);
      const sh = LP.app.curSheet();
      if(sh && !sh.layers.length && !(sh.items || []).length && !(sh.panels || []).length) showMsg = 'empty';
    }
    drawOv();
    if(msg){
      msg.classList.toggle('show', !!showMsg);
      msg.classList.toggle('dark', showMsg === 'draw');
      if(showMsg === 'draw') msg.innerHTML = '<div class="big">NO LAYER</div><div class="rule"></div><div class="sm">描く層を選んでください<br><b>01 SHEET</b> で層を <b>Wクリック</b>（または右の ◆ITEMS で選ぶ）</div>';
      else if(showMsg === 'empty') msg.innerHTML = '<div class="big">DROP IMAGES</div><div class="rule"></div><div class="sm">ここ（紙）に落とす＝<b>この紙に層として置く</b><br>下のタイムラインに落とす＝<b>1枚ずつ新しい紙にする</b>／左の棚＝<b>しまうだけ</b><br>コマを割るなら <b>DIV（D）</b> で紙の上に線を引く</div>';
    }
    return res;
  }
  function drawGateTicks(r){
    const C = LP.ui.CVC, L = 12 * dpr, m = 5 * dpr;
    ctx.strokeStyle = C.acc; ctx.lineWidth = dpr;
    ctx.beginPath();
    [[r.x + m, r.y + m, 1, 1], [r.x + r.w - m, r.y + m, -1, 1], [r.x + r.w - m, r.y + r.h - m, -1, -1], [r.x + m, r.y + r.h - m, 1, -1]].forEach(([x, y, sx, sy]) => {
      ctx.moveTo(x + L * sx, y); ctx.lineTo(x, y); ctx.lineTo(x, y + L * sy);
    });
    ctx.stroke();
  }

  /* 道具（mode/sheet.js）に渡す手すり */
  const helpers = {
    toWorld, toScreen,
    evWorld(ev){ const p = evPt(ev); return toWorld(p.x, p.y); },
    view(){ return views[viewKey()]; },
    get dpr(){ return dpr; },
    get scale(){ return views[viewKey()].s; },
    get el(){ return stageEl; },
  };

  /* ---------- ポインタ ---------- */
  function startPan(e, sp, tap){
    const v = views[viewKey()];
    drag = { kind: 'pan', sx: sp.x, sy: sp.y, ox: v.ox, oy: v.oy, moved: false, tap: !!tap };
    stageEl.classList.add('pan');
  }
  function onDown(e){
    if(LP.state.clean) return;
    const sp = evPt(e);
    try{ stageEl.setPointerCapture(e.pointerId); }catch(err){}
    if(e.button === 1 || e.button === 2){ e.preventDefault(); startPan(e, sp); return; }
    if(e.button !== 0) return;
    if(LP.state.step === 'draw'){
      // 指はナビ（SPEC_18）。ペンとマウスで描く
      const d = e.pointerType === 'touch' ? null : LP.drawTools.down(e, sp, toWorld(sp.x, sp.y), helpers);
      if(d) drag = d; else startPan(e, sp, true);
      return;
    }
    if(LP.state.step !== 'sheet'){ startPan(e, sp, true); return; }
    if(LP.state.playing) LP.app.stop();
    const d = LP.sheetTools.down(e, sp, toWorld(sp.x, sp.y), helpers);
    if(d) drag = d;
    else startPan(e, sp, true);   // 何も掴まなかった＝紙を動かす（動かさずに離したら選択解除）
  }
  function onMove(e){
    const sp = evPt(e);
    if(!drag){
      if(LP.state.step === 'draw' && e.pointerType !== 'touch'){ stageEl.style.cursor = LP.drawTools.hover(sp, toWorld(sp.x, sp.y), helpers, e) || ''; return; }
      if(LP.state.step === 'sheet'){
        const cur = LP.sheetTools.hover(sp, toWorld(sp.x, sp.y), helpers, e);
        stageEl.style.cursor = cur || '';
      }
      return;
    }
    if(drag.kind === 'pan'){
      const dx = sp.x - drag.sx, dy = sp.y - drag.sy;
      if(!drag.moved && Math.hypot(dx, dy) < 3) return;
      drag.moved = true;
      const v = views[viewKey()];
      v.ox = drag.ox + dx; v.oy = drag.oy + dy; v.fit = false;
      renderQ();
      return;
    }
    if(LP.state.step === 'draw'){ LP.drawTools.move(e, sp, toWorld(sp.x, sp.y), drag, helpers); return; }
    LP.sheetTools.move(e, sp, toWorld(sp.x, sp.y), drag, helpers);
  }
  function onUp(e){
    if(!drag) return;
    const d = drag; drag = null;
    stageEl.classList.remove('pan');
    try{ stageEl.releasePointerCapture(e.pointerId); }catch(err){}
    const sp = evPt(e), wp = toWorld(sp.x, sp.y);
    if(d.kind === 'pan'){
      if(!d.moved && d.tap && e.type === 'pointerup' && LP.state.step === 'sheet') LP.sheetTools.tapEmpty(sp, wp);
      LP.app.hud();
      return;
    }
    if(LP.state.step === 'draw'){ LP.drawTools.up(e, sp, wp, d, helpers); return; }
    LP.sheetTools.up(e, sp, wp, d, helpers);
  }
  function onDbl(e){
    if(LP.state.clean) return;
    const sp = evPt(e);
    if(LP.state.step === 'draw'){ LP.drawTools.dbl(e, sp, toWorld(sp.x, sp.y)); return; }
    if(LP.state.step !== 'sheet') return;
    LP.sheetTools.dbl(e, sp, toWorld(sp.x, sp.y), helpers);
  }
  function onWheel(e){
    if(LP.state.clean) return;
    e.preventDefault();
    const sp = evPt(e);
    const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    zoomAt(viewKey(), f, sp.x, sp.y);
  }

  LP.stage = { init, render, renderQ, renderOv, fit, zoomBy, zoomPct, clientToPaper };
})();
