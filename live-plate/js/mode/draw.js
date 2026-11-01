/* ============================================================
   LIVE PLATE — mode/draw.js（02 DRAW の道具。SPEC_21 §7-2）
   レール：PEN(P) ERASE(E) FILL(G) SEL(A) EYE(Alt) REF(R)。押し方は SPEC_17（単押し／2連打／長押し／Shift／バネ）。
     PEN   … 線レーン＝インクの色／塗レーン＝塗りの色（塗り残しの補修）。2回＝筆圧 ON/OFF
     ERASE … 透明にする。2回＝このセルを全消去（線＋塗で1手）
     FILL  … 押すと塗レーンへ移る。バケツ（壁＝線レーンの α≥128・1px 潜る）⇄ 投げ縄塗り（2回）。
             長押し／Shift＝投げ縄消し（いまのレーンのまま）
     SEL   … 投げ縄／Shift＝矩形で持ち上げて変形（mode/draw-sel.js）。2回＝WARP
     EYE   … 見えている色を拾う（Alt＋クリックはどの道具からでも）
     REF   … 参照（同じ BOOK の他のプレート）をドックで選ぶ・タイムラインの REF 行で offset / ×N
   描く先＝選んだ層のプレートの「いまのセル」（cellIndexAt）。画素は core/cells.js の編集バッファ、Undo は矩形タイル。
   正準：animator.html（pressureRadius・筆圧の均しと入りのテーパー・Shift 連結・FILL のレーン規則）
   §18（2026-10-31）：
     ブラシ（B で次）… PEN＝AA なしの丸ペン（いままで）／MARKER・FLAT・AIR・GLOW＝econte の暫定4種（core/brush.js）。消しゴムはいつも丸ペン
     トーンインク   … 色の横の T1・T2＝網点で描く・塗る（レーンごと。ペンは丸ペンで網・バケツ／投げ縄はドットの位置だけ）
     パレット       … mode/draw-pal.js（明度11＋カスタム枠・スポイトで選んだ枠を上書き・JSON）
     GRID（X）      … mode/draw-grid.js（いまのプレートのセル一覧）
   ★ 指（pointerType:'touch'）は描かない＝ナビ（SPEC_18「指はナビ・ペンは描く」）
   ============================================================ */
var LP = window.LP || (window.LP = {});

(function(){
  'use strict';
  const PREF_LS = 'liveplate_draw_v1';
  const P_EMA_A = 0.25, TAPER_PX = 12;
  const ONION = { prev: '#FF4F6A', next: '#3FD0FF' };
  const LANE_JP = { line: '線', fill: '塗' };
  const REF_COLORS = ['#FF4FA8', '#5AE9FF', '#FFC94F', '#7CFF8A'];
  const D = {
    tool: 'pen', lane: 'line', penSize: 6, eraseSize: 30, pressure: true, pressureErase: false,
    ink: '#000000', paint: '#F2C9B0', fillMode: 'bucket', fillErase: false, under: 1,
    onion: true, onionFill: false, selAA: false, selBoth: false, selWarp: false, refOpen: false,
    // §18：ブラシ（PEN 以外の太さはブラシごと）・トーンインク（0＝無し／1＝T1／2＝T2。レーンごと）・GRID のセル幅
    brush: 'pen', bSize: { marker: 34, flat: 40, air: 120, glow: 100 },
    inkTone: 0, paintTone: 0, tone1: { pitch: 8, cov: 0.06 }, tone2: { pitch: 4, cov: 0.40 }, gridW: 200,
  };
  try{
    const o = JSON.parse(localStorage.getItem(PREF_LS) || '{}');
    for(const k in D){
      if(o[k] === undefined || typeof o[k] !== typeof D[k]) continue;
      D[k] = (D[k] && typeof D[k] === 'object') ? Object.assign({}, D[k], o[k]) : o[k];   // 入れ子は既定に重ねる（足したキーが消えない）
    }
  }catch(e){}
  if(!LP.brush.LIST.some(b => b.id === D.brush)) D.brush = 'pen';
  // 一時的なモード（EYE・投げ縄消し・REF の棚）は覚えない。LP.state.draw は app.js がこれを指す
  if(D.tool === 'eye') D.tool = 'pen';
  D.fillErase = false; D.refOpen = false;
  function savePrefs(){ try{ if(!LP.HARNESS_ON) localStorage.setItem(PREF_LS, JSON.stringify(D)); }catch(e){} }

  let stroke = null, lasso = null, hoverPt = null, lastEnd = null, prevTool = 'pen', pSm = null, arc = 0, lastPress = 0.5;

  /* ---------- ブラシ・トーン（§18） ---------- */
  /* いまの道具の太さ（消しゴム＝丸ペン・PEN＝penSize・他のブラシ＝bSize[id]） */
  function sizeOf(tool){
    if((tool || D.tool) === 'erase') return D.eraseSize;
    return D.brush === 'pen' || toneOf(D.lane) ? D.penSize : (D.bSize[D.brush] || LP.brush.get(D.brush).size);
  }
  function setSize(v){
    v = Math.max(1, Math.min(300, Math.round(v)));
    if(D.tool === 'erase') D.eraseSize = v;
    else if(D.brush === 'pen' || toneOf(D.lane)) D.penSize = v;
    else D.bSize[D.brush] = v;
  }
  /* そのレーンのトーン（網点のタイル）。無ければ null。網点の色＝そのレーンの色 */
  function toneOf(lane){
    const k = lane === 'fill' ? D.paintTone : D.inkTone;
    if(!k) return null;
    const s = D['tone' + k];
    return LP.paint.tone(s.pitch, s.cov, lane === 'fill' ? D.paint : D.ink);
  }
  function setTone(k){
    if(LP.state.step !== 'draw') return;
    const key = D.lane === 'fill' ? 'paintTone' : 'inkTone';
    D[key] = D[key] === k ? 0 : k;
    savePrefs(); refreshUI();
    LP.ui.toast(D[key] ? 'トーンインク T' + k + '（' + LANE_JP[D.lane] + 'レーン）：ペン・バケツ・投げ縄が網点に（ペンは丸ペン）' : LANE_JP[D.lane] + 'レーン：ベタに戻しました');
  }
  function setBrush(id){
    if(!LP.brush.LIST.some(b => b.id === id)) return;
    D.brush = id;
    if(LP.state.step === 'draw' && D.tool !== 'pen') setTool('pen', true);
    savePrefs(); refreshUI();
    const B = LP.brush.get(id);
    LP.ui.toast('ブラシ ' + B.name + '：' + B.jp + (toneOf(D.lane) ? '（いまはトーンなので丸ペンで描きます）' : ''));
  }
  function nextBrush(){
    if(LP.state.step !== 'draw') return;
    const L = LP.brush.LIST, i = L.findIndex(b => b.id === D.brush);
    setBrush(L[(i + 1) % L.length].id);
  }
  /* 筆圧ちょうど 0 は「読み取れなかった」＝直前の値を保つ（SPEC_19 §7）。マウスは見ない＝いつも 1 */
  function brushPress(e){
    if(e.pointerType === 'mouse') return 1;
    const p = e.pressure;
    if(typeof p === 'number' && p > 0){ lastPress = p; return p; }
    return lastPress;
  }
  /* 1区間：plan 1回 → txTouch(plan.bbox) → draw 1回（線モードの濃度<1 は1本まとめて合成）。BRUSH LAB の契約4点 */
  function brushSeg(s, a, b, e){
    const env = { color: s.lane === 'fill' ? D.paint : D.ink, size: s.size, press: brushPress(e) };
    const pl = LP.brush.plan(s.S, a, b, s.B, env);
    if(pl.bbox[2] < pl.bbox[0]) return;
    LP.cells.txTouch(s.b, s.lane, pl.bbox[0], pl.bbox[1], pl.bbox[2], pl.bbox[3]);
    if(pl.mode === 'line' && s.B.opacity < 0.999) LP.brush.drawWhole(s.ctx, pl, s.S, LP.cells.txSnap(s.b, s.lane));
    else LP.brush.draw(s.ctx, pl);
  }

  /* ---------- 描く先 ---------- */
  function target(){
    const L = LP.app.selLayer();
    if(!L) return null;
    const plate = LP.book.plates[L.plateId], at = LP.app.curAt();
    if(!plate || !at) return null;
    const ci = LP.time.cellIndexAt(plate, L, at.local);
    return { L, plate, at, ci, cell: ci >= 0 ? plate.cells[ci] : null };
  }
  function laneLocked(plate, lane){ return !!(plate.lanes && plate.lanes[lane] && plate.lanes[lane].locked); }
  /* いまのセルのバッファを用意（無ければ作り始めて、できたら描き直す） */
  function sync(){
    if(LP.state.step !== 'draw') return;
    const tg = target();
    if(!tg || !tg.cell) return;
    if(!LP.cells.get(tg.cell.id)) LP.cells.open(tg.plate, tg.cell).then(() => { LP.stage.renderQ(); }).catch(e => console.error(e));
  }
  function protectedCells(){
    const s = new Set(), tg = target();
    if(tg && tg.cell) s.add(tg.cell.id);
    if(LP.drawSel && LP.drawSel.floatCell()) s.add(LP.drawSel.floatCell());
    return s;
  }

  /* ---------- 筆圧 → 半径（animator pressureRadius・ema+） ---------- */
  function smoothP(p){
    if(p == null) return p;
    const raw = Math.max(0, Math.min(1, p));
    if(pSm === null){ pSm = raw; return raw; }
    pSm += (raw - pSm) * P_EMA_A;
    return pSm;
  }
  function radius(e, erase){
    const size = erase ? D.eraseSize : D.penSize;
    const on = erase ? D.pressureErase : D.pressure;
    if(!on || e.pointerType === 'mouse') return size <= 1 ? 0.5 : size / 2;
    // ★ 筆圧ちょうど 0 を 0.5 に化かさない（SPEC_18 §2-4：1ストローク1363点中37点が 0 だった）
    const p = Math.max(0.02, Math.min(1, e.pressure == null ? 0.5 : smoothP(e.pressure)));
    return Math.max(0.35, size / 2 * p * Math.min(1, arc / TAPER_PX));
  }
  function laneCtx(b, lane){ return LP.cells.laneCanvas(b, lane, true).getContext('2d'); }

  /* ---------- ポインタ（stage.js から。wp＝プレート px） ---------- */
  function down(e, sp, wp, H){
    const tg = target();
    if(!tg) return null;
    if(LP.state.playing) LP.app.stop();
    if(e.altKey || D.tool === 'eye'){ eyedrop(wp, tg); return { kind: 'none' }; }
    if(D.tool === 'sel') return LP.drawSel.down(e, sp, wp, tg, H);
    if(lasso && lasso.poly){ polyClick(sp, wp); return { kind: 'none' }; }
    if(!tg.cell){ LP.ui.toast('このコマではこの層のセルが出ていません（詳細の「出る・消える」の外）'); return { kind: 'none' }; }
    const b = LP.cells.get(tg.cell.id);
    if(!b){ sync(); LP.ui.toast('セルを読み込み中です…もう一度'); return { kind: 'none' }; }
    if(D.tool === 'fill'){
      if(D.fillErase || D.fillMode === 'lasso'){
        const lane = D.fillErase ? D.lane : 'fill';
        if(laneLocked(tg.plate, lane)){ LP.ui.toast('🔒 ' + LANE_JP[lane] + 'レーンはロック中'); return { kind: 'none' }; }
        lasso = { b, lane, erase: D.fillErase, pts: [wp], scr: [sp], moved: false, poly: false, hover: null };
        return { kind: 'lasso' };
      }
      bucket(b, wp, tg);
      return { kind: 'none' };
    }
    const erase = D.tool === 'erase', lane = D.lane;
    if(laneLocked(tg.plate, lane)){ LP.ui.toast('🔒 ' + LANE_JP[lane] + 'レーンはロック中'); return { kind: 'none' }; }
    pSm = null; arc = 0;
    const tone = erase ? null : toneOf(lane);
    if(!erase && !tone && D.brush !== 'pen'){
      // ブラシ（MARKER / FLAT / AIR / GLOW）：座標は小数のまま・手ブレ補正はブラシごと
      const B = LP.brush.get(D.brush);
      LP.cells.txBegin();
      const ctx = laneCtx(b, lane);
      const s = { kind: 'stroke', brush: true, B, S: LP.brush.begin(), b, lane, ctx, size: sizeOf('pen'), sm: { x: wp.x, y: wp.y }, raw: { x: wp.x, y: wp.y }, n: 0 };
      lastPress = e.pressure > 0 ? e.pressure : 0.5;
      const from = e.shiftKey && lastEnd && lastEnd.cellId === b.cellId && lastEnd.lane === lane ? { x: lastEnd.x, y: lastEnd.y } : s.sm;
      brushSeg(s, from, s.sm, e);
      stroke = s;
      LP.stage.renderQ();
      return stroke;
    }
    const x = Math.round(wp.x), y = Math.round(wp.y);
    const r = radius(e, erase);
    LP.cells.txBegin();
    const pad = Math.max(r, sizeOf()) + 2;
    LP.cells.txTouch(b, lane, x - pad, y - pad, x + pad, y + pad);
    const ctx = laneCtx(b, lane);
    ctx.fillStyle = tone ? tone.pattern : (lane === 'fill' ? D.paint : D.ink);   // トーン＝網点のパターン（プレートの原点に固定）
    // Shift＋クリック＝直前のストロークの終点から直線（animator の連結）
    if(e.shiftKey && lastEnd && lastEnd.cellId === b.cellId && lastEnd.lane === lane){
      LP.cells.txTouch(b, lane, Math.min(lastEnd.x, x) - pad, Math.min(lastEnd.y, y) - pad, Math.max(lastEnd.x, x) + pad, Math.max(lastEnd.y, y) + pad);
      const rr = sizeOf() / 2;
      LP.paint.line(ctx, Math.round(lastEnd.x), Math.round(lastEnd.y), x, y, rr, rr, erase);
    }else{
      LP.paint.dot(ctx, x, y, r, erase);
    }
    stroke = { kind: 'stroke', b, lane, erase, ctx, x, y, r, n: 0 };
    LP.stage.renderQ();
    return stroke;
  }
  function move(e, sp, wp, d, H){
    hoverPt = wp;
    if(d.kind === 'sel'){ LP.drawSel.move(e, sp, wp, d, H); return; }
    if(d.kind === 'lasso' && lasso){
      if(!lasso.moved && Math.hypot(sp.x - lasso.scr[0].x, sp.y - lasso.scr[0].y) > 6) lasso.moved = true;
      const q = lasso.pts[lasso.pts.length - 1];
      if(Math.hypot(wp.x - q.x, wp.y - q.y) > 3 / H.scale){ lasso.pts.push(wp); lasso.scr.push(sp); }
      LP.stage.renderOv();
      return;
    }
    if(d.kind !== 'stroke' || !stroke) return;
    const evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
    const list = evs.length ? evs : [e];
    if(stroke.brush){
      const s = stroke, k = Math.max(0, Math.min(0.95, s.B.smooth || 0));
      for(const ev of list){
        const p = H.evWorld(ev);
        s.raw = p;
        const nx = s.sm.x + (p.x - s.sm.x) * (1 - k), ny = s.sm.y + (p.y - s.sm.y) * (1 - k);
        if(Math.hypot(nx - s.sm.x, ny - s.sm.y) < 0.35) continue;
        const a = s.sm;
        s.sm = { x: nx, y: ny };
        brushSeg(s, a, s.sm, ev);
        s.n++;
      }
      s.lastEv = e;
      LP.stage.renderQ();
      LP.stage.renderOv();
      return;
    }
    const s = stroke, pad0 = sizeOf() + 2;
    for(const ev of list){
      const p = H.evWorld(ev);
      const x = Math.round(p.x), y = Math.round(p.y);
      if(x === s.x && y === s.y) continue;
      arc += Math.hypot(x - s.x, y - s.y);
      const r = radius(ev, s.erase);
      LP.cells.txTouch(s.b, s.lane, Math.min(s.x, x) - pad0, Math.min(s.y, y) - pad0, Math.max(s.x, x) + pad0, Math.max(s.y, y) + pad0);
      LP.paint.line(s.ctx, s.x, s.y, x, y, s.r, r, s.erase);
      s.x = x; s.y = y; s.r = r; s.n++;
    }
    LP.stage.renderQ();
    LP.stage.renderOv();
  }
  function up(e, sp, wp, d){
    if(d.kind === 'sel'){ LP.drawSel.up(e, sp, wp, d); return; }
    if(d.kind === 'lasso' && lasso){
      if(!lasso.moved){ lasso.poly = true; LP.ui.toast('多角形の投げ縄：クリックで頂点／Enter・始点・Wクリックで閉じる／Esc で取消'); LP.stage.renderOv(); return; }
      lassoFinish();
      return;
    }
    if(d.kind !== 'stroke' || !stroke) return;
    const s = stroke;
    stroke = null;
    if(s.brush){
      // 手ブレ補正で遅れていた最後の区間を足す（離した所まで届かせる）
      if(Math.hypot(s.raw.x - s.sm.x, s.raw.y - s.sm.y) >= 0.35) brushSeg(s, s.sm, s.raw, s.lastEv || e);
      lastEnd = { cellId: s.b.cellId, lane: s.lane, x: s.raw.x, y: s.raw.y };
      LP.cells.txEnd(s.B.name + '（' + LANE_JP[s.lane] + '）');
      afterPixels();
      return;
    }
    lastEnd = { cellId: s.b.cellId, lane: s.lane, x: s.x, y: s.y };
    LP.cells.txEnd(s.erase ? '消しゴム' : 'ペン（' + LANE_JP[s.lane] + '）');
    afterPixels();
  }
  function hover(sp, wp){
    hoverPt = wp;
    if(lasso && lasso.poly) lasso.hover = wp;
    LP.stage.renderOv();
    if(D.tool === 'sel') return LP.drawSel.cursor(wp);
    return D.tool === 'eye' ? 'copy' : 'crosshair';
  }
  function leave(){ hoverPt = null; LP.stage.renderOv(); }

  /* ---------- 塗り ---------- */
  function bucket(b, wp, tg){
    if(laneLocked(tg.plate, 'fill')){ LP.ui.toast('🔒 塗レーンはロック中'); return; }
    LP.cells.txBegin();
    LP.cells.txTouch(b, 'fill', wp.x, wp.y, wp.x + 1, wp.y + 1);   // 控え（紙1枚）を取るだけ。Undo の矩形は塗った範囲
    const r = LP.paint.floodFill(laneCtx(b, 'fill'), b.line ? b.line.getContext('2d') : null, wp.x, wp.y, D.paint, { under: D.under, tone: toneOf('fill') });
    if(!r){ LP.cells.txAbort(); LP.ui.toast('ここは塗れません（線の上／もう同じ色）'); return; }
    LP.cells.txTouch(b, 'fill', r.x0, r.y0, r.x1, r.y1);
    LP.cells.txEnd(toneOf('fill') ? '塗り（網点）' : '塗り');
    afterPixels();
  }
  function polyClick(sp, wp){
    const f = lasso.scr[0];
    if(lasso.pts.length >= 3 && Math.hypot(sp.x - f.x, sp.y - f.y) < 14){ lassoFinish(); return; }
    lasso.pts.push(wp); lasso.scr.push(sp);
    LP.stage.renderOv();
  }
  function lassoFinish(){
    const L = lasso;
    lasso = null;
    LP.stage.renderOv();
    if(!L || L.pts.length < 3){ LP.ui.toast('囲いが小さすぎます'); return; }
    const b = L.b;
    const bb = LP.paint.bboxOf(L.pts, b.w, b.h);
    LP.cells.txBegin();
    LP.cells.txTouch(b, L.lane, bb.x0, bb.y0, bb.x1 + 1, bb.y1 + 1);
    const r = LP.paint.lassoFill(laneCtx(b, L.lane), L.pts, D.paint, L.erase, L.erase ? null : toneOf('fill'));
    if(!r){ LP.cells.txAbort(); return; }
    LP.cells.txEnd(L.erase ? '投げ縄消し（' + LANE_JP[L.lane] + '）' : '投げ縄塗り');
    afterPixels();
  }

  /* ---------- スポイト：線 → 塗 → 下の紙（renderFrame で 1px を描いて拾う） ---------- */
  function eyedrop(wp, tg){
    let hex = null;
    const x = Math.floor(wp.x), y = Math.floor(wp.y);
    const b = tg.cell && LP.cells.get(tg.cell.id);
    if(b && x >= 0 && y >= 0 && x < b.w && y < b.h){
      for(const lane of ['line', 'fill']){
        if(!b[lane]) continue;
        const d = b[lane].getContext('2d').getImageData(x, y, 1, 1).data;
        if(d[3] > 8){ hex = LP.paint.rgbToHex(d[0], d[1], d[2]); break; }
      }
    }
    if(!hex){
      const L = tg.L, p = tg.plate, a = (L.rot || 0) * Math.PI / 180;
      const lx = (wp.x - p.w / 2) * L.w / p.w, ly = (wp.y - p.h / 2) * L.h / p.h;
      const px = L.x + L.w / 2 + lx * Math.cos(a) - ly * Math.sin(a), py = L.y + L.h / 2 + lx * Math.sin(a) + ly * Math.cos(a);
      const c = document.createElement('canvas'); c.width = 1; c.height = 1;
      const g = c.getContext('2d');
      LP.render.renderFrame(g, LP.book, LP.state.t, { mode: 'sheet', img: LP.cache.img, scale: 1, ox: -Math.floor(px), oy: -Math.floor(py) });
      const d = g.getImageData(0, 0, 1, 1).data;
      if(d[3] > 8) hex = LP.paint.rgbToHex(d[0], d[1], d[2]);
    }
    if(!hex){ LP.ui.toast('色がありません（透明）'); return; }
    setColor(hex);
    const note = LP.drawPal.take(hex);
    LP.dock.render();
    LP.ui.toast('スポイト ' + hex + ' → ' + (D.lane === 'fill' ? '塗りの色' : 'インク') + note);
    if(D.tool === 'eye') setTool(prevTool || 'pen');
  }
  /* いまのレーンの色（トーン中は網点の色も同じ）。palette＝パレットの枠から（枠は書き換えない） */
  function setColor(hex){
    if(D.lane === 'fill') D.paint = hex; else D.ink = hex;
    savePrefs();
    LP.dock.render();
    LP.stage.renderOv();
  }
  /* ドックの色ピッカー：色を替えて、選んでいる枠にも入れる（明度チップなら枠を足す） */
  function pickColor(hex){
    setColor(hex);
    const note = LP.drawPal.take(hex, true);
    LP.dock.render();
    if(note) LP.ui.toast(hex + note);
  }

  /* ---------- 道具・レーン ---------- */
  const TOOLS = ['pen', 'erase', 'fill', 'sel', 'eye'];
  function setTool(t, quiet){
    if(TOOLS.indexOf(t) < 0) return;
    if(LP.state.step !== 'draw'){ LP.ui.toast('02 DRAW の道具です（2 で入る）'); return; }
    if(t !== 'sel' && LP.drawSel) LP.drawSel.settle();
    cancelLasso();
    if(LP.drawGrid && LP.drawGrid.on) LP.drawGrid.close();   // 道具を持つ＝描く（FOCUS）へ
    if(t === 'eye' && D.tool !== 'eye') prevTool = D.tool;   // EYE は拾ったら元の道具へ戻る
    const from = D.tool;
    D.tool = t;
    if(t === 'fill' && !D.fillErase && D.lane !== 'fill'){ D.lane = 'fill'; if(!quiet) LP.ui.toast('FILL：塗レーンへ（線が壁・' + D.under + 'px 潜る）'); }
    if((t === 'pen' || t === 'erase') && (from === 'fill' || from === 'sel') && D.lane === 'fill'){ D.lane = 'line'; }
    savePrefs();
    refreshUI();
  }
  function toggleMode(t){
    if(LP.state.step !== 'draw') return;
    if(t === 'pen'){ D.pressure = !D.pressure; setTool('pen', true); LP.ui.toast('ペンの筆圧 ' + (D.pressure ? 'ON' : 'OFF')); }
    else if(t === 'erase'){ setTool('erase', true); clearCell(); }
    else if(t === 'fill'){ D.fillErase = false; D.fillMode = D.fillMode === 'lasso' ? 'bucket' : 'lasso'; setTool('fill', true); LP.ui.toast('FILL：' + (D.fillMode === 'lasso' ? '投げ縄塗り（囲った中を塗る）' : 'バケツ（線が壁）')); }
    else if(t === 'sel'){ setTool('sel', true); LP.drawSel.toggleWarp(); }
    savePrefs(); refreshUI();
  }
  /* 長押し／Shift＋G：投げ縄消し（いまのレーンのまま） */
  function fillEraseToggle(force){
    if(LP.state.step !== 'draw') return;
    D.fillErase = force == null ? !D.fillErase : !!force;
    setTool('fill', true);
    LP.ui.toast(D.fillErase ? '投げ縄消し（' + LANE_JP[D.lane] + 'レーン）：囲った中を透明に' : 'FILL：' + (D.fillMode === 'lasso' ? '投げ縄塗り' : 'バケツ'));
    savePrefs(); refreshUI();
  }
  function setLane(l){
    if(l !== 'line' && l !== 'fill') return;
    if(LP.drawSel) LP.drawSel.settle();
    cancelLasso();
    D.lane = l;
    if(D.tool === 'fill' && l === 'line' && !D.fillErase){ D.tool = 'pen'; LP.ui.toast('線レーン：FILL は塗レーンだけ（ペンに持ち替え）'); }
    savePrefs(); refreshUI();
  }
  function toggleLane(){ setLane(D.lane === 'line' ? 'fill' : 'line'); LP.ui.toast(LANE_JP[D.lane] + 'レーン'); }
  function toggleOnion(){ D.onion = !D.onion; savePrefs(); LP.stage.renderQ(); LP.dock.render(); LP.ui.toast('オニオン ' + (D.onion ? 'ON（前＝赤・後＝青）' : 'OFF')); }
  function toggleRef(){ if(LP.state.step !== 'draw') return; D.refOpen = !D.refOpen; savePrefs(); LP.dock.render(); }
  function refreshUI(){ LP.dock.render(); LP.app.crumb(); LP.app.hud(); LP.timeline.renderCells(); LP.stage.renderQ(); }
  function clearCell(){
    const tg = target(), b = tg && tg.cell && LP.cells.get(tg.cell.id);
    if(!b){ LP.ui.toast('このコマに消すセルがありません'); return; }
    const lanes = ['line', 'fill'].filter(l => b[l] && !laneLocked(tg.plate, l));
    if(!lanes.length) return;
    LP.cells.txBegin();
    lanes.forEach(l => { LP.cells.txTouchAll(b, l); b[l].getContext('2d').clearRect(0, 0, b.w, b.h); });
    LP.cells.txEnd('セルを全消去');
    afterPixels();
    LP.ui.toast('このセルを全消去（' + lanes.map(l => LANE_JP[l]).join('＋') + '・Ctrl+Z で戻せます）');
  }
  function cancelLasso(){ if(!lasso) return false; lasso = null; LP.stage.renderOv(); return true; }
  function cancel(){
    if(LP.drawSel && LP.drawSel.cancel()) return true;
    if(cancelLasso()){ LP.ui.toast('投げ縄 取消'); return true; }
    return false;
  }
  function enter(){
    if(LP.drawGrid && LP.drawGrid.on){ LP.drawGrid.close(); return true; }
    if(lasso && lasso.poly){ lassoFinish(); return true; }
    return !!(LP.drawSel && LP.drawSel.commit());
  }
  function dbl(e, sp, wp){ if(lasso && lasso.poly){ lassoFinish(); return; } if(D.tool === 'sel') LP.drawSel.dbl(e, sp, wp); }
  /* Ctrl+Z の前：浮いている形は取り消し、描いている途中は何もしない */
  function beforeUndo(){
    if(stroke) return true;
    if(LP.drawSel && LP.drawSel.cancel()) return true;
    return false;
  }
  function afterPixels(){ LP.stage.renderQ(); LP.timeline.renderCells(); if(LP.drawGrid && LP.drawGrid.on) LP.drawGrid.render(); }

  /* ---------- セル（タイムラインの 線／塗 行・ドックの CELL） ---------- */
  function findLocal(plate, L, ci, from){
    const sh = LP.app.curAt().sheet;
    for(let k = 0; k < sh.dur; k++){
      const f = (from + k) % sh.dur;
      if(LP.time.cellIndexAt(plate, L, f) === ci) return f;
    }
    return -1;
  }
  function seekCell(ci){
    const tg = target();
    if(!tg) return false;
    const f = findLocal(tg.plate, tg.L, ci, tg.at.local);
    if(f < 0){ LP.ui.toast('セル ' + (ci + 1) + ' はこの紙の尺の中に出ていません（紙の尺・コマ打ちを確かめて）'); return false; }
    LP.app.stop();
    LP.app.seek(tg.at.start + f);
    return true;
  }
  function cellAdd(dup){
    const tg = target();
    if(!tg){ LP.ui.toast('層を選んでください'); return; }
    if(LP.drawSel) LP.drawSel.settle();
    const i = tg.ci < 0 ? tg.plate.cells.length - 1 : tg.ci, src = tg.plate.cells[i];
    const nc = LP.model.newCell(null, dup && src ? src.dur : 1);
    if(dup && src){ nc.line = src.line; nc.fill = src.fill; LP.cells.copyInto(tg.plate, src, nc); }
    else LP.cells.adopt(tg.plate, nc, null, null);
    tg.plate.cells.splice(i + 1, 0, nc);
    LP.app.commit(dup ? 'セルを複製' : 'セルを足す');
    seekCell(i + 1);
    LP.ui.toast((dup ? 'セルを複製' : '空のセルを足しました') + '（' + (i + 2) + ' / ' + tg.plate.cells.length + '）');
  }
  function cellDelete(){
    const tg = target();
    if(!tg || tg.ci < 0) return;
    if(tg.plate.cells.length <= 1){ LP.ui.toast('最後の1枚は消せません（E を2回で全消去）'); return; }
    if(LP.drawSel) LP.drawSel.settle();
    tg.plate.cells.splice(tg.ci, 1);
    LP.app.commit('セルを消す');
    LP.ui.toast('セル ' + (tg.ci + 1) + ' を消しました（Ctrl+Z で戻せます）');
  }
  function cellStep(d){
    const tg = target();
    if(!tg || tg.ci < 0) return;
    const n = tg.plate.cells.length;
    seekCell(((tg.ci + d) % n + n) % n);
  }
  /* SHEET／DRAW の「＋ 描く層」：カメラ出力の大きさの空プレート（§11-2）を紙いっぱい（選んだコマがあればそのコマ） */
  function newDrawLayer(){
    const book = LP.book, sh = LP.app.curSheet();
    if(!sh) return;
    const o = LP.app.outSize();
    const n = Object.values(book.plates).filter(p => p.src === 'draw').length + 1;
    const p = LP.model.newPlate('描く ' + n, o.w, o.h, 'draw');
    const c = LP.model.newCell(null, 1);
    p.cells.push(c);
    book.plates[p.id] = p;
    LP.cells.adopt(p, c, null, null);
    const L = LP.model.newLayer(p, LP.model.fitRect(book, p.w, p.h));
    const k = LP.app.selPanel() || (LP.app.selLayer() && LP.model.panelById(sh, LP.app.selLayer().panelId));
    if(k){ L.panelId = k.id; LP.panels.fitLayerToPanel(sh, L, k); }
    sh.layers.push(L);
    LP.app.select('layer', L.id, true);
    LP.app.commit('描く層を足す');
    LP.app.setStep('draw');
    LP.ui.toast(p.name + '（' + p.w + '×' + p.h + '）を ' + (k ? 'コマ ' + (sh.panels.indexOf(k) + 1) : '紙いっぱい') + ' に置きました — P でペン');
  }

  /* ---------- 参照（REF：同じ BOOK の他のプレート） ---------- */
  function refAdd(pid){
    const tg = target();
    if(!tg || !LP.book.plates[pid] || pid === tg.plate.id) return;
    const refs = tg.plate.refs || (tg.plate.refs = []);
    refs.push({ id: LP.model.uid('r'), plateId: pid, offset: 0, step: 1, opacity: 0.4, visible: true, color: REF_COLORS[refs.length % REF_COLORS.length] });
    LP.app.commit('参照を足す');
    LP.ui.toast('参照：' + LP.book.plates[pid].name + '（タイムラインの REF 行で ずらす・×N）');
  }
  function refOf(id){ const tg = target(); return tg && (tg.plate.refs || []).find(r => r.id === id); }
  function refDel(id){
    const tg = target();
    if(!tg) return;
    tg.plate.refs = (tg.plate.refs || []).filter(r => r.id !== id);
    LP.app.commit('参照を外す');
  }
  function refPos(r, plate, rp){
    const s = Math.min(plate.w / rp.w, plate.h / rp.h);
    return { x: (plate.w - rp.w * s) / 2, y: (plate.h - rp.h * s) / 2, w: rp.w * s, h: rp.h * s };
  }
  /* renderFrame（focus）の手すり：参照＝プレートの下・オニオン＝塗の上・線の下 */
  function under(ctx){
    const tg = target();
    if(!tg) return;
    for(const r of tg.plate.refs || []){
      if(r.visible === false) continue;
      const rp = LP.book.plates[r.plateId];
      if(!rp) continue;
      const ci = LP.time.cellIndexAt(rp, { tOffset: r.offset || 0, step: r.step || 1, clip: true }, tg.at.local);
      if(ci < 0) continue;
      const q = refPos(r, tg.plate, rp);
      ctx.globalAlpha = r.opacity == null ? 0.4 : r.opacity;
      for(const lane of ['fill', 'line']){
        const im = LP.cache.img(rp.cells[ci], lane);
        if(im) ctx.drawImage(im, q.x, q.y, q.w, q.h);
      }
    }
    ctx.globalAlpha = 1;
  }
  const tintCache = new Map();
  function tint(im, key, ver, color){
    let e = tintCache.get(key);
    if(e && e.src === im && e.ver === ver) return e.c;
    const c = e && e.c.width === im.width && e.c.height === im.height ? e.c : document.createElement('canvas');
    c.width = im.width; c.height = im.height;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
    g.drawImage(im, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    if(tintCache.size > 8) tintCache.clear();
    tintCache.set(key, { src: im, ver, c });
    return c;
  }
  function mid(ctx){
    if(!D.onion || LP.state.playing) return;
    const tg = target();
    if(!tg || tg.ci < 0) return;
    for(const [k, col] of [[tg.ci - 1, ONION.prev], [tg.ci + 1, ONION.next]]){
      if(k < 0 || k >= tg.plate.cells.length) continue;
      const cell = tg.plate.cells[k];
      for(const lane of D.onionFill ? ['fill', 'line'] : ['line']){
        const im = LP.cache.img(cell, lane);
        if(!im) continue;
        const b = LP.cells.get(cell.id);
        ctx.globalAlpha = 0.32;
        ctx.drawImage(tint(im, cell.id + lane + col, b ? b.ver[lane] : -1, col), 0, 0, tg.plate.w, tg.plate.h);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- オーバーレイ（#cv-ov：筆の輪・投げ縄・浮いた形） ---------- */
  function overlay(ctx, H){
    const d = H.dpr, C = LP.ui.CVC;
    const P = (x, y) => { const s = H.toScreen(x, y); return { x: s.x * d, y: s.y * d }; };
    if(LP.drawSel) LP.drawSel.overlay(ctx, H);
    if(lasso && lasso.pts.length){
      const pv = lasso.pts.concat(lasso.poly && lasso.hover ? [lasso.hover] : []);
      ctx.save(); ctx.beginPath();
      pv.forEach((q, i) => { const s = P(q.x, q.y); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); });
      if(pv.length > 2){ ctx.fillStyle = lasso.erase ? 'rgba(255,79,168,.18)' : 'rgba(90,233,255,.16)'; ctx.fill(); }
      ctx.strokeStyle = C.mark; ctx.lineWidth = 1.5 * d; ctx.setLineDash([8 * d, 6 * d]); ctx.stroke();
      if(lasso.poly){ ctx.setLineDash([]); ctx.fillStyle = C.acc; lasso.pts.forEach((q, i) => { const s = P(q.x, q.y); ctx.beginPath(); ctx.arc(s.x, s.y, (i ? 3.5 : 6) * d, 0, Math.PI * 2); ctx.fill(); }); }
      ctx.restore();
    }
    if(hoverPt && (D.tool === 'pen' || D.tool === 'erase') && !lasso){
      const size = sizeOf();
      const s = P(hoverPt.x, hoverPt.y), r = Math.max(1.5 * d, size / 2 * H.scale * d);
      ctx.save();
      ctx.lineWidth = d;
      ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.beginPath(); ctx.arc(s.x, s.y, r + d, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = D.tool === 'erase' ? C.acc : (D.lane === 'fill' ? C.mark : C.pt);
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }
  function hudText(){
    const tg = target();
    if(!tg) return 'PLATE';
    const lane = D.lane === 'fill' ? '<span class="ln fill">塗 FILL</span>' : '<span class="ln line">線 LINE</span>';
    return lane + ' CELL <b>' + (tg.ci < 0 ? '—' : (tg.ci + 1) + '/' + tg.plate.cells.length) + '</b> ·';
  }

  LP.drawTools = {
    D, LANE_JP, TOOLS, sizeOf, setSize, toneOf, setTone, setBrush, nextBrush, pickColor, target, sync, protectedCells, down, move, up, hover, leave, dbl, overlay, under, mid,
    setTool, toggleMode, fillEraseToggle, setLane, toggleLane, toggleOnion, toggleRef, setColor, savePrefs, clearCell,
    cancel, enter, beforeUndo, afterPixels, seekCell, cellAdd, cellDelete, cellStep, newDrawLayer,
    refAdd, refDel, refOf, hudText, get busy(){ return !!stroke; },
  };
})();
