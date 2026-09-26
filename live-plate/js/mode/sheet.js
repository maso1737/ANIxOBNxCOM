/* ============================================================
   LIVE PLATE — mode/sheet.js（01 SHEET の道具。SPEC_21 §7-1）
   レール：SEL(V) DIV(D) EDIT(P) TEXT(T) TONE(N) 白(W/G)。Wクリック／2連打でモードを持つ（道具は増やさない）
     SEL  … 素材（層・仕上げ素材）を選んで動かす・角で拡縮 ／ Wクリック＝コマを選ぶ
     DIV  … 紙の上に線を引いてコマを割る（斜め）／ Wクリックで 縦・横。紙の外から引き始めると縦横が自動で決まる
     EDIT … 分割線の中央■＝平行移動・両端●＝回転（Shift＝15°）
     TEXT … クリックした所に文字（縦書き）／ Wクリックで 横書き
     TONE … クリックしたコマに 網 ／ Wクリックで 集中線 → 流線
     白   … 投げ縄でホワイト（ドラッグ＝フリーハンド／クリックで始める＝多角形。Enter・始点・Wクリックで閉じる）／ Wクリックで 消し
   正準：manga-plate.html（DIV / EDIT / 投げ縄）・SPEC_17 §2-3（囲い方は2通り）
   ============================================================ */
var LP = window.LP || (window.LP = {});

(function(){
  'use strict';
  const HANDLE = 9;
  const LASSO_DRAG_PX = 6, LASSO_CLOSE_PX = 14;
  const S = () => LP.state;
  const G = () => LP.geom;
  let hoverObj = null, div = null, lasso = null, cycleT = 0;
  const CYCLE_MS = 320;   // 選んでいる物の上で動かさずに離す → この間に次の押下／Wクリックが来なければ「1つ下」へ

  const sheet = () => LP.app.curSheet();
  const fr = () => LP.render.frameOf(LP.book, sheet());
  const local = () => { const a = LP.app.curAt(); return a ? a.local : 0; };

  /* ---------- 当たり判定 ---------- */
  function corners(L){
    const cx = L.x + L.w / 2, cy = L.y + L.h / 2, a = (L.rot || 0) * Math.PI / 180;
    const c = Math.cos(a), s = Math.sin(a);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
      const lx = u * L.w / 2, ly = v * L.h / 2;
      return { x: cx + lx * c - ly * s, y: cy + lx * s + ly * c };
    });
  }
  function toLocal(cx, cy, rot, p){
    const a = -(rot || 0) * Math.PI / 180, dx = p.x - cx, dy = p.y - cy;
    return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
  }
  function hitLayer(L, p){ const q = toLocal(L.x + L.w / 2, L.y + L.h / 2, L.rot, p); return Math.abs(q.x) <= L.w / 2 && Math.abs(q.y) <= L.h / 2; }
  function hitItem(it, p){ const b = LP.items.itemBounds(it), q = toLocal(it.x, it.y, it.rot, p); return Math.abs(q.x) <= b.w / 2 && Math.abs(q.y) <= b.h / 2; }
  function insidePanel(o, p){
    if(!o.panelId) return true;
    const k = LP.model.panelById(sheet(), o.panelId);
    return !k || G().pointInPoly(G().dispPoly(k, fr()), p.x, p.y);
  }
  /* その点にあるもの全部を、上に見えている順に（描く順の逆）：枠の上の素材 → 枠の上の層 → コマの素材 → コマの層 */
  function hitAll(p){
    const sh = sheet();
    if(!sh) return [];
    const lt = local(), out = [];
    const items = LP.items.drawOrder(sh.items || []).filter(it => it.visible !== false && !it.locked && lt >= (it.tIn || 0) && (it.tOut == null || lt < it.tOut));
    const layers = sh.layers.filter(L => L.visible && !L.locked);
    for(const free of [true, false]){
      for(let i = items.length - 1; i >= 0; i--){ const it = items[i]; if(!it.panelId === free && insidePanel(it, p) && hitItem(it, p)) out.push({ kind: 'item', o: it }); }
      for(let i = layers.length - 1; i >= 0; i--){ const L = layers[i]; if(!L.panelId === free && insidePanel(L, p) && hitLayer(L, p)) out.push({ kind: 'layer', o: L }); }
    }
    return out;
  }
  function isSel(h){ const st = S(); return (h.kind === 'layer' && st.selLayer === h.o.id) || (h.kind === 'item' && st.selItem === h.o.id); }
  /* 掴む物：**選んでいる物がその点にあれば、上に別の物が重なっていてもそれ**（◆ITEMS で下の物を選んで掴める）。無ければいちばん上 */
  function hitArt(p){
    const hs = hitAll(p);
    return hs.find(isSel) || hs[0] || null;
  }
  /* 重なりの「1つ下」を選ぶ（Alt＋クリック／選んでいる物の上でもう一度クリック） */
  function selectBelow(p){
    const hs = hitAll(p);
    if(hs.length < 2) return false;
    const i = hs.findIndex(isSel);
    const n = hs[(i + 1) % hs.length];
    LP.app.select(n.kind, n.o.id);
    LP.ui.toast((i + 1 >= hs.length ? 'いちばん上' : '下') + '：' + (n.o.name || '') + '（' + ((i + 1) % hs.length + 1) + ' / ' + hs.length + '・もう一度クリックでさらに下）');
    return true;
  }
  function hitHandle(L, sp, H){
    const cs = corners(L).map(c => H.toScreen(c.x, c.y));
    for(let i = 0; i < 4; i++) if(Math.abs(cs[i].x - sp.x) <= HANDLE && Math.abs(cs[i].y - sp.y) <= HANDLE) return i;
    return -1;
  }
  function cutAt(p, H){
    const sh = sheet(), tol = 14 / H.scale;
    let best = null, bd = tol;
    for(const cu of G().cutsOf(sh.panels || [])){
      const sg = G().cutSegment(cu);
      const t = (p.x - cu.ax) * sg.dx + (p.y - cu.ay) * sg.dy;
      if(t < sg.t0 - tol || t > sg.t1 + tol) continue;
      const d = Math.abs((p.x - cu.ax) * cu.nx + (p.y - cu.ay) * cu.ny);
      if(d < bd){
        bd = d;
        const f = (t - sg.t0) / Math.max(1, sg.t1 - sg.t0);
        best = { cut: cu, seg: sg, grab: f < 0.25 ? 'r0' : (f > 0.75 ? 'r1' : 'move') };
      }
    }
    return best;
  }

  /* ---------- 置く ---------- */
  function countOf(type){ return (sheet().items || []).filter(o => o.type === type).length + 1; }
  function panelBox(k){
    if(!k) return { x: 0, y: 0, w: LP.book.paper.w, h: LP.book.paper.h };
    const b = G().polyBounds(G().dispPoly(k, fr()));
    return { x: b.x, y: b.y, w: b.w, h: b.h };
  }
  function placeTone(p){
    const sh = sheet(), kind = S().toneKind;
    const k = LP.panels.panelAt(sh, p.x, p.y);
    const it = LP.model.newItem(kind, panelBox(k), countOf(kind));
    if(kind === 'focus'){ it.x = Math.round(p.x); it.y = Math.round(p.y); }
    it.panelId = k ? k.id : null;
    sh.items.push(it);
    LP.app.select('item', it.id, true);
    LP.app.commit(LP.model.ITEM_NAMES[kind] + 'を置く');
    LP.ui.toast(LP.model.ITEM_NAMES[kind] + 'を置きました' + (k ? '（コマ ' + (sh.panels.indexOf(k) + 1) + '）' : '') + ' — 濃さ・本数は 詳細（U）で');
  }
  function placeText(p){
    const sh = sheet();
    const k = LP.panels.panelAt(sh, p.x, p.y);
    const it = LP.model.newItem('text', { x: p.x, y: p.y, w: 0, h: 0 }, countOf('text'));
    it.vertical = S().textVert;
    it.panelId = k ? k.id : null;
    sh.items.push(it);                       // 打つまでは履歴に積まない（空のまま離れたら消える）
    LP.app.select('item', it.id);
    LP.detail.toggle(true);
    LP.detail.focusText();
  }
  function lassoFinish(){
    if(!lasso) return;
    const L = lasso; lasso = null;
    const pts = L.pts;
    if(pts.length > 2 && G().polyArea(pts) > 40 * 40){
      const b = G().polyBounds(pts), sh = sheet();
      const it = LP.model.newItem('white', { x: b.cx, y: b.cy, w: 0, h: 0 }, countOf('white'));
      it.x = Math.round(b.cx); it.y = Math.round(b.cy);
      it.erase = !!L.erase;
      if(L.erase) it.name = '消し ' + countOf('white');
      it.poly = pts.map(q => ({ x: +(q.x - b.cx).toFixed(1), y: +(q.y - b.cy).toFixed(1) }));
      it.panelId = L.panelId;
      sh.items.push(it);
      LP.app.select('item', it.id, true);
      LP.app.commit(L.erase ? '消し' : 'ホワイト');
      LP.ui.toast(L.erase ? '囲った中を紙の地の色で消しました' : 'ホワイトをかぶせました（詳細で色・不透明度）');
    }else{
      LP.ui.toast('囲いが小さすぎます（3点以上・ある程度の広さ）');
      LP.stage.renderQ();
    }
  }
  function lassoCancel(){ if(!lasso) return false; const poly = lasso.poly; lasso = null; LP.stage.renderQ(); if(poly) LP.ui.toast('投げ縄 取消'); return true; }

  /* ---------- 分割線 ---------- */
  function divLine(d){
    if(d.mode === 'v') return { x0: d.x0, y0: d.y0, dx: 0, dy: 1 };
    if(d.mode === 'h') return { x0: d.x0, y0: d.y0, dx: 1, dy: 0 };
    let dx = d.x1 - d.x0, dy = d.y1 - d.y0;
    if(Math.hypot(dx, dy) < 1) return null;
    if(d.shift){ const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12), L = Math.hypot(dx, dy); dx = Math.cos(a) * L; dy = Math.sin(a) * L; }
    return { x0: d.x0, y0: d.y0, dx, dy };
  }

  /* ---------- ポインタ（stage.js から） ---------- */
  function down(e, sp, wp, H){
    const st = S(), sh = sheet();
    if(!sh) return null;
    clearTimeout(cycleT);
    if(lasso && lasso.poly){ polyClick(sp, wp); return { kind: 'none' }; }
    const tool = st.tool;
    if(tool === 'div'){
      const P = LP.book.paper;
      const outX = wp.x < 0 || wp.x > P.w, outY = wp.y < 0 || wp.y > P.h;
      const mode = outY && !outX ? 'h' : (outX && !outY ? 'v' : st.divMode);   // 定規のメタファ：外から引く＝縦横
      div = { x0: wp.x, y0: wp.y, x1: wp.x, y1: wp.y, mode, shift: e.shiftKey };
      LP.stage.renderQ();
      return { kind: 'div' };
    }
    if(tool === 'edit'){
      const h = cutAt(wp, H);
      if(h){ st.selCut = h.cut.id; LP.stage.renderQ(); return { kind: 'cut', cid: h.cut.id, grab: h.grab, seg: h.seg, moved: false }; }
      st.selCut = null;
      const k = LP.panels.panelAt(sh, wp.x, wp.y);
      if(k){ LP.app.select('panel', k.id); return { kind: 'none' }; }
      return null;
    }
    if(tool === 'text'){
      const hit = hitArt(wp);
      if(hit && hit.kind === 'item' && hit.o.type === 'text'){
        LP.app.select('item', hit.o.id);
        return { kind: 'item', o: hit.o, wx: wp.x, wy: wp.y, x0: hit.o.x, y0: hit.o.y, moved: false };
      }
      placeText(wp);
      return { kind: 'none' };
    }
    if(tool === 'tone'){ placeTone(wp); return { kind: 'none' }; }
    if(tool === 'white'){
      const k = LP.panels.panelAt(sh, wp.x, wp.y);
      lasso = { pts: [{ x: wp.x, y: wp.y }], scr: [sp], panelId: k ? k.id : null, erase: st.whiteErase, poly: false, moved: false, hover: null };
      return { kind: 'lasso' };
    }
    // SEL
    if(st.selMode === 'panel'){
      const k = LP.panels.panelAt(sh, wp.x, wp.y);
      if(k){ LP.app.select('panel', k.id); return { kind: 'none' }; }
      return null;
    }
    const L = LP.app.selLayer();
    if(L && !L.locked){
      const hi = hitHandle(L, sp, H);
      if(hi >= 0){
        const cs = corners(L);
        const cx = L.x + L.w / 2, cy = L.y + L.h / 2;
        return { kind: 'scale', L, a: toLocal(cx, cy, L.rot, cs[(hi + 2) % 4]), c0: toLocal(cx, cy, L.rot, cs[hi]), orig: { x: L.x, y: L.y, w: L.w, h: L.h }, moved: false };
      }
    }
    if(e.altKey && selectBelow(wp)) return { kind: 'none' };
    const hit = hitArt(wp);
    if(!hit) return null;
    const was = isSel(hit);
    if(hit.kind === 'layer'){
      if(!L || L.id !== hit.o.id) LP.app.select('layer', hit.o.id);
      return { kind: 'move', L: hit.o, wx: wp.x, wy: wp.y, x0: hit.o.x, y0: hit.o.y, moved: false, was, wp };
    }
    if(!was) LP.app.select('item', hit.o.id);
    return { kind: 'item', o: hit.o, wx: wp.x, wy: wp.y, x0: hit.o.x, y0: hit.o.y, moved: false, was, wp };
  }

  function move(e, sp, wp, d, H){
    if(d.kind === 'div' && div){
      div.x1 = wp.x; div.y1 = wp.y; div.shift = e.shiftKey;
      if(div.mode !== 'f'){ div.x0 = wp.x; div.y0 = wp.y; }
      LP.stage.renderQ(); return;
    }
    if(d.kind === 'lasso' && lasso){
      if(!lasso.moved && Math.hypot(sp.x - lasso.scr[0].x, sp.y - lasso.scr[0].y) > LASSO_DRAG_PX) lasso.moved = true;
      const q = lasso.pts[lasso.pts.length - 1];
      if(Math.hypot(wp.x - q.x, wp.y - q.y) > 4 / H.scale){ lasso.pts.push({ x: wp.x, y: wp.y }); lasso.scr.push(sp); }
      LP.stage.renderQ(); return;
    }
    if(d.kind === 'cut'){
      const sh = sheet(), cu = G().cutsOf(sh.panels).find(c => c.id === d.cid);
      if(!cu) return;
      if(d.grab === 'move'){
        const dd = (wp.x - cu.ax) * cu.nx + (wp.y - cu.ay) * cu.ny;
        LP.panels.moveCut(sh, cu.id, cu.nx, cu.ny, cu.ax + cu.nx * dd, cu.ay + cu.ny * dd);
      }else{
        const s = d.seg, px = d.grab === 'r0' ? s.x1 : s.x0, py = d.grab === 'r0' ? s.y1 : s.y0;
        let dx = wp.x - px, dy = wp.y - py;
        if(Math.hypot(dx, dy) < 1) return;
        if(e.shiftKey){ const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12), L = Math.hypot(dx, dy); dx = Math.cos(a) * L; dy = Math.sin(a) * L; }
        const L = Math.hypot(dx, dy);
        LP.panels.moveCut(sh, cu.id, -dy / L, dx / L, px, py);
      }
      d.moved = true;
      LP.stage.renderQ(); return;
    }
    if(d.kind === 'move' || d.kind === 'item'){
      const dx = wp.x - d.wx, dy = wp.y - d.wy;
      if(!d.moved && Math.hypot(dx * H.scale, dy * H.scale) < 3) return;
      d.moved = true;
      const o = d.kind === 'move' ? d.L : d.o;
      if(o.locked) return;
      o.x = Math.round(d.x0 + dx); o.y = Math.round(d.y0 + dy);
      LP.stage.renderQ(); LP.app.liveDetail(); return;
    }
    if(d.kind === 'scale'){
      d.moved = true;
      const L = d.L, o = d.orig;
      const p = toLocal(o.x + o.w / 2, o.y + o.h / 2, L.rot, wp), a = d.a, c0 = d.c0;
      let nw, nh, ncx, ncy;
      if(e.shiftKey){
        nw = Math.max(8, Math.abs(p.x - a.x)); nh = Math.max(8, Math.abs(p.y - a.y));
        ncx = a.x + Math.sign(c0.x - a.x) * nw / 2; ncy = a.y + Math.sign(c0.y - a.y) * nh / 2;
      }else{
        const dx = c0.x - a.x, dy = c0.y - a.y;
        let s = ((p.x - a.x) * dx + (p.y - a.y) * dy) / Math.max(1e-6, dx * dx + dy * dy);
        s = Math.max(8 / Math.max(o.w, o.h), s);
        nw = o.w * s; nh = o.h * s;
        ncx = a.x + dx * s / 2; ncy = a.y + dy * s / 2;
      }
      const ang = (L.rot || 0) * Math.PI / 180, c = Math.cos(ang), sn = Math.sin(ang);
      const cx0 = o.x + o.w / 2, cy0 = o.y + o.h / 2;
      L.w = Math.round(nw); L.h = Math.round(nh);
      L.x = Math.round(cx0 + ncx * c - ncy * sn - L.w / 2); L.y = Math.round(cy0 + ncx * sn + ncy * c - L.h / 2);
      LP.stage.renderQ(); LP.app.liveDetail();
    }
  }

  function up(e, sp, wp, d){
    if(d.kind === 'div' && div){
      const line = divLine(div); div = null;
      if(!line){ LP.ui.toast('線を引くようにドラッグしてください（紙の外から引くと縦・横）'); LP.stage.renderQ(); return; }
      const sh = sheet(), st = S();
      const n = LP.panels.divide(sh, line.x0, line.y0, line.dx, line.dy, st.selPanel);
      if(n){ LP.app.select(null, null, true); LP.app.commit('コマを割る'); LP.ui.toast('コマを ' + n + ' か所で割りました（' + sh.panels.length + ' コマ）'); }
      else { LP.stage.renderQ(); LP.ui.toast(st.selPanel ? '選んだコマに線が当たっていません' : 'コマに当たっていません（線がコマを横切るように）'); }
      return;
    }
    if(d.kind === 'lasso' && lasso){
      if(!lasso.moved){ lasso.poly = true; LP.ui.toast('多角形の投げ縄：クリックで頂点／Enter・始点・Wクリックで閉じる／Esc で取消'); LP.stage.renderQ(); return; }
      lassoFinish(); return;
    }
    if(d.kind === 'cut'){ if(d.moved){ LP.panels.sort(sheet()); LP.app.commit('分割線'); } return; }   // 線を動かすと読み順が変わることがある
    if(d.kind === 'move' || d.kind === 'item'){
      if(d.moved){ LP.app.commit(d.kind === 'move' ? '層を移動' : '素材を移動'); return; }
      // 選んでいた物をもう一度クリック（動かさない）＝重なりの1つ下へ。Wクリック（→ 02 DRAW）なら取り消す
      if(d.was && S().tool === 'sel'){ const p = d.wp; cycleT = setTimeout(() => selectBelow(p), CYCLE_MS); }
      return;
    }
    if(d.kind === 'scale'){ if(d.moved) LP.app.commit('層の大きさ'); }
  }
  function polyClick(sp, wp){
    const f = lasso.scr[0];
    if(lasso.pts.length >= 3 && Math.hypot(sp.x - f.x, sp.y - f.y) < LASSO_CLOSE_PX){ lassoFinish(); return; }
    const q = lasso.pts[lasso.pts.length - 1];
    if(q && Math.hypot(wp.x - q.x, wp.y - q.y) < 1) return;
    lasso.pts.push({ x: wp.x, y: wp.y }); lasso.scr.push(sp);
    LP.stage.renderQ();
  }
  function tapEmpty(){ if(S().tool !== 'white') LP.app.select(null); }
  function dbl(e, sp, wp){
    clearTimeout(cycleT);
    if(lasso && lasso.poly){ lassoFinish(); return; }
    if(S().tool !== 'sel' && S().tool !== 'text') return;
    const hit = hitArt(wp);
    if(!hit) return;
    if(hit.kind === 'layer'){ LP.app.select('layer', hit.o.id); LP.app.setStep('draw'); }   // hitArt＝選んでいる物が優先（下の層も Wクリックで開ける）
    else if(hit.o.type === 'text'){ LP.app.select('item', hit.o.id); LP.detail.toggle(true); LP.detail.focusText(); }
  }
  function hover(sp, wp, H, e){
    if(!sp){ const had = !!hoverObj; hoverObj = null; return had; }
    const tool = S().tool;
    if(lasso && lasso.poly){ lasso.hover = wp; LP.stage.renderQ(); return 'crosshair'; }
    if(tool === 'div' || tool === 'white') return 'crosshair';
    if(tool === 'tone') return 'copy';
    if(tool === 'text') return 'text';
    if(tool === 'edit'){ const h = cutAt(wp, H); return h ? (h.grab === 'move' ? 'move' : 'alias') : ''; }
    if(S().selMode === 'panel') return 'pointer';
    const L = LP.app.selLayer();
    if(L && !L.locked && hitHandle(L, sp, H) >= 0) return 'nwse-resize';
    if(e && e.pointerType !== 'mouse') return '';
    const hit = hitArt(wp);
    const key = hit && !isSel(hit) ? hit.kind + hit.o.id : null;
    if(key !== (hoverObj && hoverObj.key)){ hoverObj = key ? { key, hit } : null; LP.stage.renderQ(); }
    return hit ? 'move' : '';
  }
  function cancel(){
    if(lassoCancel()) return true;
    if(div){ div = null; LP.stage.renderQ(); return true; }
    return false;
  }
  function enter(){ if(lasso && lasso.poly){ lassoFinish(); return true; } return false; }

  /* ---------- オーバーレイ（renderFrame の上に描く UI） ---------- */
  function overlay(ctx, H){
    const sh = sheet();
    if(!sh) return;
    const C = LP.ui.CVC, d = H.dpr, st = S();
    const P = (x, y) => { const s = H.toScreen(x, y); return { x: s.x * d, y: s.y * d }; };
    const poly = (pts, col, w, dash, alpha) => {
      if(!pts || pts.length < 2) return;
      ctx.save();
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      ctx.beginPath();
      pts.forEach((q, i) => { const s = P(q.x, q.y); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); });
      ctx.closePath(); ctx.lineWidth = w * d; ctx.strokeStyle = col;
      if(dash) ctx.setLineDash(dash.map(v => v * d));
      ctx.stroke(); ctx.restore();
    };
    const f = fr();
    // コマ番号（読み順）
    (sh.panels || []).forEach((k, i) => {
      const b = G().polyBounds(G().dispPoly(k, f));
      const s = P(b.x + b.w, b.y);
      const r = 10 * d;
      ctx.save();
      ctx.fillStyle = st.selPanel === k.id ? C.acc : 'rgba(10,12,16,.72)';
      ctx.beginPath(); ctx.arc(s.x - r - 4 * d, s.y + r + 4 * d, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = (11 * d) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), s.x - r - 4 * d, s.y + r + 4 * d + 0.5 * d);
      ctx.restore();
    });
    const sp = LP.model.panelById(sh, st.selPanel);
    if(sp) poly(G().dispPoly(sp, f), C.acc, 2, [10, 7]);
    // なぞり中（ホバー）
    if(hoverObj && st.tool === 'sel'){
      const h = hoverObj.hit;
      const same = (h.kind === 'layer' && st.selLayer === h.o.id) || (h.kind === 'item' && st.selItem === h.o.id);
      if(!same){
        if(h.kind === 'layer') poly(corners(h.o), C.acc2, 1, null, 0.6);
        else poly(itemCorners(h.o), C.acc2, 1, null, 0.6);
      }
    }
    // 選んだ層：枠＋角
    const L = LP.app.selLayer();
    if(L){
      const cs = corners(L);
      poly(cs, C.acc, 1.5);
      if(!L.locked){
        ctx.save(); ctx.fillStyle = '#fff'; ctx.strokeStyle = C.acc; ctx.lineWidth = d;
        cs.forEach(c => { const s = P(c.x, c.y); ctx.fillRect(s.x - HANDLE / 2 * d, s.y - HANDLE / 2 * d, HANDLE * d, HANDLE * d); ctx.strokeRect(s.x - HANDLE / 2 * d, s.y - HANDLE / 2 * d, HANDLE * d, HANDLE * d); });
        ctx.restore();
      }
    }
    // 選んだ素材
    const it = LP.app.selItem();
    if(it) poly(itemCorners(it), C.pt, 1.5, [6, 5]);
    // 分割線（EDIT）
    if(st.tool === 'edit'){
      for(const cu of G().cutsOf(sh.panels || [])){
        const s = G().cutSegment(cu), on = st.selCut === cu.id;
        const a = P(s.x0, s.y0), b = P(s.x1, s.y1), m = P((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2);
        ctx.save();
        ctx.strokeStyle = on ? C.acc : C.pt; ctx.fillStyle = on ? C.acc : C.pt; ctx.lineWidth = (on ? 2.5 : 1.5) * d;
        ctx.globalAlpha = on ? 1 : 0.8;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.globalAlpha = 1;
        const r = 6 * d;
        ctx.beginPath(); ctx.arc(a.x, a.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(m.x - r, m.y - r, r * 2, r * 2);
        ctx.restore();
      }
    }
    // 分割のプレビュー（無限に伸ばした点線）
    if(div){
      const line = divLine(div);
      if(line){
        const L2 = Math.hypot(LP.book.paper.w, LP.book.paper.h) * 2, n = Math.hypot(line.dx, line.dy) || 1;
        const a = P(line.x0 - line.dx / n * L2, line.y0 - line.dy / n * L2), b = P(line.x0 + line.dx / n * L2, line.y0 + line.dy / n * L2);
        ctx.save(); ctx.strokeStyle = C.pt; ctx.lineWidth = 2 * d; ctx.setLineDash([12 * d, 8 * d]);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.restore();
      }
    }
    // 投げ縄
    if(lasso && lasso.pts.length){
      const pv = lasso.pts.concat(lasso.poly && lasso.hover ? [lasso.hover] : []);
      ctx.save();
      ctx.beginPath();
      pv.forEach((q, i) => { const s = P(q.x, q.y); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); });
      if(pv.length > 2){ ctx.fillStyle = lasso.erase ? 'rgba(255,79,168,.22)' : 'rgba(255,255,255,.45)'; ctx.fill(); }
      ctx.strokeStyle = C.mark; ctx.lineWidth = 1.5 * d; ctx.setLineDash([8 * d, 6 * d]); ctx.stroke();
      ctx.setLineDash([]);
      if(lasso.poly){
        ctx.fillStyle = C.acc;
        lasso.pts.forEach((q, i) => { const s = P(q.x, q.y); ctx.beginPath(); ctx.arc(s.x, s.y, (i ? 3.5 : 6) * d, 0, Math.PI * 2); ctx.fill(); });
      }
      ctx.restore();
    }
  }
  function itemCorners(it){
    const b = LP.items.itemBounds(it), a = (it.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => ({ x: it.x + u * b.w / 2 * c - v * b.h / 2 * s, y: it.y + u * b.w / 2 * s + v * b.h / 2 * c }));
  }

  /* ---------- 道具の切り替え（レール・キー） ---------- */
  const TOOLS = ['sel', 'div', 'edit', 'text', 'tone', 'white'];
  function setTool(t){
    if(TOOLS.indexOf(t) < 0) return;
    if(LP.state.step !== 'sheet'){ LP.ui.toast('01 SHEET の道具です（1 で戻る）'); return; }
    cancel();
    S().tool = t;
    if(t !== 'edit') S().selCut = null;
    LP.dock.render(); LP.app.crumb(); LP.stage.renderQ();
  }
  /* Wクリック／2連打：その道具のモード */
  function toggleMode(t){
    const st = S();
    if(t === 'sel'){ st.selMode = st.selMode === 'panel' ? 'art' : 'panel'; LP.ui.toast(st.selMode === 'panel' ? 'SEL：コマを選ぶ' : 'SEL：素材（層・仕上げ）を選ぶ'); }
    else if(t === 'div'){ st.divMode = { f: 'v', v: 'h', h: 'f' }[st.divMode] || 'f'; LP.ui.toast('DIV：' + { f: '斜め（ドラッグの向き）', v: '縦線', h: '横線' }[st.divMode]); }
    else if(t === 'text'){ st.textVert = !st.textVert; LP.ui.toast('TEXT：' + (st.textVert ? '縦書き' : '横書き')); }
    else if(t === 'tone'){ st.toneKind = { tone: 'focus', focus: 'stream', stream: 'tone' }[st.toneKind] || 'tone'; LP.ui.toast('TONE：' + LP.model.ITEM_NAMES[st.toneKind]); }
    else if(t === 'white'){ st.whiteErase = !st.whiteErase; LP.ui.toast('白：' + (st.whiteErase ? '消し（紙の地の色で塗る）' : 'ホワイト')); }
    st.tool = t;
    LP.dock.render(); LP.app.crumb(); LP.stage.renderQ();
  }

  LP.sheetTools = { down, move, up, dbl, hover, tapEmpty, overlay, cancel, enter, setTool, toggleMode, TOOLS };
})();
