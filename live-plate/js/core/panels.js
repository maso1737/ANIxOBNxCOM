/* ============================================================
   LIVE PLATE — core/panels.js（コマ割りの編集。正準は manga-plate.html splitPanels / applyCut / mergePanel）
   ★ ここはアプリ専用（ビューアには入らない）。形の計算は geom.js、描き方は render.js。
   ★ SHEET の panels が 0 個＝「全面1コマ」（§5）。最初に分割するとき内枠のコマを1枚作り、
     その紙の層・素材を全部そのコマに入れてから切る（manga-plate の「親コマの中身は子へ」と同じ規則）。
   ★ 分割・併合で親コマが消えるときは、中身は**中心が入る方の子へ**（迷子にしない）。
   ============================================================ */
var LP = window.LP || (window.LP = {});

(function(){
  'use strict';
  const G = () => LP.geom;
  const MIN_AREA = 60 * 60;          // これ未満の面積は「切れていない」（紙 px）
  const F = 1000;

  function frame(sheet){ return LP.render.frameOf(LP.book, sheet); }
  function gapFor(fr, nx, ny){ return fr.lr * Math.abs(nx) + fr.tb * Math.abs(ny); }
  function newPanel(base, cuts, border, bleed){
    return { id: LP.model.uid('k'), base: base.map(q => ({ x: q.x, y: q.y })), cuts: cuts || [],
      poly: base.map(q => ({ x: q.x, y: q.y })), border: border !== false, bleed: !!bleed };
  }
  function centerOf(o){ return o.plateId ? { x: o.x + o.w / 2, y: o.y + o.h / 2 } : { x: o.x, y: o.y }; }
  /* o（層 or 素材）の外接矩形が、コマの外接矩形 kb の 90% 以上を覆っているか */
  function covers(o, kb){
    let w, h, rot, cx, cy;
    if(o.plateId){ w = o.w; h = o.h; rot = o.rot; cx = o.x + o.w / 2; cy = o.y + o.h / 2; }
    else { const b = LP.items.itemBounds(o); w = b.w; h = b.h; rot = o.rot; cx = o.x; cy = o.y; }
    const a = (rot || 0) * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
    const bw = w * c + h * s, bh = w * s + h * c;
    const ix = Math.max(0, Math.min(cx + bw / 2, kb.x + kb.w) - Math.max(cx - bw / 2, kb.x));
    const iy = Math.max(0, Math.min(cy + bh / 2, kb.y + kb.h) - Math.max(cy - bh / 2, kb.y));
    return ix * iy >= kb.w * kb.h * 0.9;
  }
  function members(sheet){ return sheet.layers.concat(sheet.items || []); }

  function panelAt(sheet, x, y){
    const fr = frame(sheet), ps = sheet.panels || [];
    for(let i = ps.length - 1; i >= 0; i--) if(G().pointInPoly(G().dispPoly(ps[i], fr), x, y)) return ps[i];
    return null;
  }
  function sort(sheet){
    const fr = frame(sheet);
    if(!sheet.manualOrder) G().sortPanels(sheet.panels, fr.edge.h, fr.bindRight);
  }
  function snapshot(sheet){ return JSON.stringify({ p: sheet.panels, m: members(sheet).map(o => o.panelId || null) }); }
  function restore(sheet, s){
    const o = JSON.parse(s);
    sheet.panels = o.p;
    members(sheet).forEach((m, i) => { m.panelId = o.m[i]; });
  }

  /* 分割：点 P を通り方向 D の直線で切る。target があればそのコマだけ、無ければ線が横切る全コマ。
     1か所も切れなければ何も変えずに 0 を返す */
  function divide(sheet, px, py, dx, dy, targetId){
    const snap = snapshot(sheet);
    const fr = frame(sheet);
    if(!sheet.panels.length){
      const k = newPanel(G().rectPoly(fr.bas));
      sheet.panels.push(k);
      members(sheet).forEach(o => { if(!o.panelId) o.panelId = k.id; });
    }
    const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const nx = -dy, ny = dx, gap = gapFor(fr, nx, ny), cid = LP.model.uid('c');
    const targets = targetId ? sheet.panels.filter(k => k.id === targetId) : sheet.panels.slice();
    let n = 0;
    for(const k of targets){
      const mk = side => {
        const nk = newPanel(k.base, (k.cuts || []).map(c => Object.assign({}, c)).concat([{ id: cid, nx, ny, ax: px, ay: py, gap, side }]), k.border, k.bleed);
        return G().rebuildPanel(nk) ? nk : null;
      };
      const A = mk(1), B = mk(-1);
      if(!A || !B) continue;
      if(G().polyArea(A.poly) < MIN_AREA || G().polyArea(B.poly) < MIN_AREA) continue;
      const i = sheet.panels.indexOf(k);
      sheet.panels.splice(i, 1, A, B);
      /* 割っても見えている絵は消さない：親コマを覆っている層・素材（背景・網など）は両方の子に残す（コピー）。
         それ以外は中心が入る方の子へ（manga-plate の規則） */
      const kb = G().polyBounds(k.poly);
      members(sheet).slice().forEach(o => {
        if(o.panelId !== k.id) return;
        if(o.type !== 'text' && covers(o, kb)){
          o.panelId = A.id;
          const c = LP.model.clone(o);
          c.id = LP.model.uid(o.plateId ? 'l' : 'i'); c.panelId = B.id;
          const arr = o.plateId ? sheet.layers : sheet.items;
          arr.splice(arr.indexOf(o) + 1, 0, c);
          return;
        }
        const c = centerOf(o);
        o.panelId = G().pointInPoly(A.poly, c.x, c.y) ? A.id : (G().pointInPoly(B.poly, c.x, c.y) ? B.id : A.id);
      });
      n++;
    }
    if(!n){ restore(sheet, snap); return 0; }
    sort(sheet);
    return n;
  }

  /* 分割線を動かす／回す。全コマが成立するときだけ確定（破綻したら元に戻して false） */
  function moveCut(sheet, cid, nx, ny, ax, ay){
    const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
    const snap = JSON.stringify(sheet.panels);
    const gap = gapFor(frame(sheet), nx, ny);
    sheet.panels.forEach(k => (k.cuts || []).forEach(c => { if(c.id === cid){ c.nx = nx; c.ny = ny; c.ax = ax; c.ay = ay; c.gap = gap; } }));
    let ok = sheet.panels.every(k => G().rebuildPanel(k));
    if(ok) ok = sheet.panels.every(k => G().polyArea(k.poly) >= MIN_AREA);
    if(!ok) sheet.panels = JSON.parse(snap);
    return ok;
  }

  /* 分割を戻す：最後の1本だけ side が違う相手（兄弟）を見つけ、その線を取り除く＝分割の正確な逆 */
  function merge(sheet, k){
    const kc = k.cuts || [];
    if(!kc.length) return null;
    let mate = null;
    for(const o of sheet.panels){
      if(o === k) continue;
      const oc = o.cuts || [];
      if(oc.length !== kc.length) continue;
      let diff = -1, bad = false;
      for(let i = 0; i < kc.length; i++){
        if(kc[i].id !== oc[i].id){ bad = true; break; }
        if(kc[i].side !== oc[i].side){ if(diff >= 0){ bad = true; break; } diff = i; }
      }
      if(bad || diff !== kc.length - 1) continue;
      mate = o; break;
    }
    if(!mate) return null;
    const nk = newPanel(k.base, kc.slice(0, -1).map(c => Object.assign({}, c)), k.border || mate.border, k.bleed || mate.bleed);
    if(!G().rebuildPanel(nk)) return null;
    const ids = [k.id, mate.id];
    members(sheet).forEach(o => { if(ids.indexOf(o.panelId) >= 0) o.panelId = nk.id; });
    // 割ったときに両方へコピーした背景などは、戻すと同じものが2枚重なる → 1枚にする
    const sig = o => { const c = Object.assign({}, o); delete c.id; delete c.name; return JSON.stringify(c); };
    const seen = new Set();
    const keep = o => { if(o.panelId !== nk.id) return true; const s = sig(o); if(seen.has(s)) return false; seen.add(s); return true; };
    sheet.layers = sheet.layers.filter(keep);
    sheet.items = (sheet.items || []).filter(keep);
    const at = Math.min(sheet.panels.indexOf(k), sheet.panels.indexOf(mate));
    sheet.panels = sheet.panels.filter(o => o !== k && o !== mate);
    sheet.panels.splice(Math.max(0, at), 0, nk);
    sort(sheet);
    return nk;
  }
  /* コマ割りを全部やめる＝全面1コマに戻す（中身はみんな「枠の上」＝ふつうの紙へ） */
  function clearAll(sheet){
    sheet.panels = [];
    members(sheet).forEach(o => { o.panelId = null; });
  }
  /* 余白を変えたら、内枠から作ったコマの base を新しい内枠へ（紙ごとの上書きがある紙は触らない） */
  function reframe(book, oldBas){
    const near = (a, b) => Math.abs(a - b) < 1;
    const same = (base, r) => base.length === 4 && G().rectPoly(r).every((q, i) => near(q.x, base[i].x) && near(q.y, base[i].y));
    book.sheets.forEach(sh => {
      if(sh.frame || !sh.panels.length) return;
      const nb = LP.render.frameOf(book, sh).bas;
      const snap = JSON.stringify(sh.panels);
      let ok = true;
      sh.panels.forEach(k => {
        if(!same(k.base, oldBas)) return;
        k.base = G().rectPoly(nb);
        if(!G().rebuildPanel(k)) ok = false;
      });
      if(!ok) sh.panels = JSON.parse(snap);
    });
  }
  /* 線の太さ・間隔を変えたら gap を引き直す */
  function regap(book){
    book.sheets.forEach(sh => {
      const fr = LP.render.frameOf(book, sh);
      const snap = JSON.stringify(sh.panels);
      sh.panels.forEach(k => (k.cuts || []).forEach(c => { c.gap = gapFor(fr, c.nx, c.ny); }));
      if(!sh.panels.every(k => G().rebuildPanel(k))) sh.panels = JSON.parse(snap);
    });
  }
  /* 層をコマに合わせる：コマの外接矩形 × のりしろ を覆う（縦横比は保つ） */
  function fitLayerToPanel(sheet, L, k){
    const p = LP.book.plates[L.plateId];
    const b = G().polyBounds(G().dispPoly(k, frame(sheet)));
    const pw = p ? p.w : L.w, ph = p ? p.h : L.h;
    const s = Math.max(b.w / pw, b.h / ph) * (L.pad || 1.15);
    L.w = Math.round(pw * s); L.h = Math.round(ph * s);
    L.x = Math.round(b.cx - L.w / 2); L.y = Math.round(b.cy - L.h / 2); L.rot = 0;
  }
  /* 奥⇄手前の定規 d(0..1) ⇄ z。OBAN のパン係数 pf=lerp(0.7,1.2,d) と一致する写像（SPEC_12 Zof の符号違い）
     d=0.6 が紙の面（z=0）。0＝奥（z≒−429）／1＝手前（z≒+167） */
  function zFromD(d){ const pf = 0.7 + 0.5 * Math.max(0, Math.min(1, d)); return F * (1 - 1 / pf); }
  function dFromZ(z){ const pf = 1 / (1 - (z || 0) / F); return Math.max(0, Math.min(1, (pf - 0.7) / 0.5)); }

  LP.panels = { panelAt, sort, divide, moveCut, merge, clearAll, reframe, regap, fitLayerToPanel, zFromD, dFromZ, gapFor };
})();
