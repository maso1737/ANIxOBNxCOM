/* ============================================================
   LIVE PLATE — core/take.js（03 TAKE のカメラ：KF の配分と窓の幾何。SPEC_21 §7-3 / §19）
   ★ 補間（f・d を読んで pose を出す）は render.js の camAt（ビューアにも同梱）。ここはアプリ専用：
     ・auto の間は OBAN buildTake の配分（止め＝dwell の重み・移動＝距離の重み 0.25〜2.2）で各 KF の f と d を**書く**
     ・窓 ⇄ pose：窓の中心＝紙の中央＋(x, y)、大きさ＝camBase ÷ (s × persp₀)、向き＝rot（z＝0 の紙の面で）
   ★ KF の並び＝時間の順（f の昇順）。auto でも手動でも崩さない。
   ============================================================ */
var LP = window.LP || (window.LP = {});

(function(){
  'use strict';
  const S_MIN = 0.2, S_MAX = 20, Z_MIN = -3000, Z_MAX = 800;
  const clamp = (v, a, z) => v < a ? a : (v > z ? z : v);

  function ensure(sheet){ return sheet.take || (sheet.take = { kf: [], auto: true }); }
  function kfs(sheet){ return (sheet && sheet.take && sheet.take.kf) || []; }
  function newKf(p){ return { id: LP.model.uid('k'), f: 0, d: 0, x: p.x || 0, y: p.y || 0, z: p.z || 0, rot: p.rot || 0, s: p.s || 1, dwell: 1, ease: 'ease' }; }
  function pose(k){ return { x: k.x || 0, y: k.y || 0, z: k.z || 0, rot: k.rot || 0, s: k.s || 1 }; }
  function clampPose(p){
    p.s = clamp(+p.s || 1, S_MIN, S_MAX);
    p.z = clamp(+p.z || 0, Z_MIN, Z_MAX);
    p.rot = ((+p.rot || 0) % 360 + 540) % 360 - 180;
    return p;
  }

  /* 移動の重み（OBAN：画面幅で測った距離＋寄りの差。0.25〜2.2） */
  function travelW(book, A, B){
    const b = LP.render.camBase(book);
    const dist = Math.hypot((B.x || 0) - (A.x || 0), (B.y || 0) - (A.y || 0)) / b.w;
    const zoom = Math.abs(Math.log((B.s || 1) / (A.s || 1)));
    const rot = Math.abs((B.rot || 0) - (A.rot || 0)) / 90;
    const dol = Math.abs((B.z || 0) - (A.z || 0)) / 1000;
    return clamp(dist + zoom + rot + dol, 0.25, 2.2);
  }
  /* f と d を書き直す。auto＝配分／手動＝並べ直して紙の尺に収めるだけ */
  function rebuild(book, sheet){
    const tk = sheet.take;
    if(!tk || !tk.kf.length) return;
    const kf = tk.kf, span = Math.max(0, sheet.dur - 1);
    if(tk.auto){
      const segs = [];
      kf.forEach((k, i) => {
        segs.push({ k, w: Math.max(0.05, k.dwell == null ? 1 : k.dwell), dwell: true });
        if(i < kf.length - 1) segs.push({ w: travelW(book, k, kf[i + 1]) });
      });
      const tot = segs.reduce((a, x) => a + x.w, 0);
      let acc = 0;
      segs.forEach(sg => {
        const p0 = acc / tot; acc += sg.w; const p1 = acc / tot;
        if(sg.dwell){ sg.k.f = Math.round(p0 * span); sg.k.d = Math.max(0, Math.round(p1 * span) - sg.k.f); }
      });
      return;
    }
    kf.sort((a, b) => a.f - b.f);
    kf.forEach(k => { k.f = clamp(Math.round(k.f), 0, span); k.d = clamp(Math.round(k.d || 0), 0, span - k.f); });
  }
  function rebuildAll(book){ book.sheets.forEach(s => { if(s.take) rebuild(book, s); }); }

  /* ---------- 窓（紙の面 z=0 での足あと） ---------- */
  function windowOf(book, p){
    const b = LP.render.camBase(book), p0 = LP.render.perspOf(0, p.z) || 1, k = 1 / ((p.s || 1) * p0);
    return { cx: book.paper.w / 2 + (p.x || 0), cy: book.paper.h / 2 + (p.y || 0), w: b.w * k, h: b.h * k, rot: p.rot || 0 };
  }
  /* 窓の4隅（紙座標・左上から時計回り） */
  function corners(win){
    const a = win.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), hw = win.w / 2, hh = win.h / 2;
    return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => ({ x: win.cx + x * c - y * s, y: win.cy + x * s + y * c }));
  }
  /* 紙の点 → 窓のローカル（中心原点・回転を戻す） */
  function toLocal(win, pt){
    const a = -win.rot * Math.PI / 180, dx = pt.x - win.cx, dy = pt.y - win.cy;
    return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
  }

  /* ---------- KF の操作（BOOK を書き換える。commit は呼ぶ側） ---------- */
  function indexAt(sheet, local){ const kf = kfs(sheet); return kf.findIndex(k => local >= k.f && local <= k.f + (k.d || 0)); }
  /* いまの窓を KF に。auto＝選んでいる KF の後ろ（無ければ最後）／手動＝いまのフレーム（同じ f があれば上書き） */
  function capture(book, sheet, local, p, afterId){
    const tk = ensure(sheet), k = newKf(clampPose(Object.assign({}, p)));
    if(tk.auto){
      let i = afterId ? tk.kf.findIndex(o => o.id === afterId) : -1;
      if(i < 0) i = tk.kf.length - 1;
      tk.kf.splice(i + 1, 0, k);
    }else{
      const same = tk.kf.find(o => o.f === local);
      if(same){ Object.assign(same, pose(k)); rebuild(book, sheet); return same; }
      k.f = local;
      tk.kf.push(k);
    }
    rebuild(book, sheet);
    return k;
  }
  function remove(book, sheet, id){
    const tk = sheet.take;
    if(!tk) return false;
    const i = tk.kf.findIndex(k => k.id === id);
    if(i < 0) return false;
    tk.kf.splice(i, 1);
    if(!tk.kf.length) sheet.take = null;
    else rebuild(book, sheet);
    return true;
  }
  /* 隣と入れ替え（auto のときだけ意味がある＝手動は f の順そのもの） */
  function swap(book, sheet, id, dir){
    const tk = sheet.take;
    if(!tk) return false;
    const i = tk.kf.findIndex(k => k.id === id), j = i + dir;
    if(i < 0 || j < 0 || j >= tk.kf.length) return false;
    if(!tk.auto){ const a = tk.kf[i], b = tk.kf[j]; const pa = pose(a); Object.assign(a, pose(b)); Object.assign(b, pa); [a.ease, b.ease] = [b.ease, a.ease]; return true; }
    [tk.kf[i], tk.kf[j]] = [tk.kf[j], tk.kf[i]];
    rebuild(book, sheet);
    return true;
  }
  /* ◆ を手で動かす：auto を外して f を置く（前の KF の止めの後〜次の KF の前） */
  function moveF(book, sheet, id, f){
    const tk = sheet.take;
    if(!tk) return;
    tk.auto = false;
    const i = tk.kf.findIndex(k => k.id === id);
    if(i < 0) return;
    const k = tk.kf[i], prev = tk.kf[i - 1], next = tk.kf[i + 1];
    const lo = prev ? prev.f + (prev.d || 0) + 1 : 0;
    const hi = (next ? next.f - 1 : sheet.dur - 1) - (k.d || 0);
    k.f = clamp(Math.round(f), lo, Math.max(lo, hi));
  }

  LP.take = { S_MIN, S_MAX, Z_MIN, Z_MAX, ensure, kfs, pose, clampPose, travelW, rebuild, rebuildAll, windowOf, corners, toLocal, indexAt, capture, remove, swap, moveF };
})();
