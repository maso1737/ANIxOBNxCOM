/* ============================================================
   LIVE PLATE — core/render.js
   renderFrame(ctx, book, t, view) — フレームは t の純関数（SPEC_21 §2-2 / §6）。
   ステージ・SHEETS のサムネ・PLAY・書き出し・HTML ビューア・VRT が全部これ1本。
   ★ ビューアへ**文字列で同梱**される（T=time, G=geom, IT=items も同梱）。外の変数を参照しない。
     画像は view.img(cell, lane) で受け取る：drawable ／ null＝そのレーンは空 ／ false＝まだ読めていない。
   ★ 乱数を持たない。同じ t は同じ画。

   紙1枚の合成順（manga-plate renderPage と同じ骨格。§15-5）：
     地 → [コマに属する：層（配列順）→ 素材（段順）… それぞれコマの形で clip] → コマ枠線
        → [枠の上：層（配列順）→ 素材（段順）]
   重なりは「◆ITEMS の並び（配列）」だけで決まる。Z は視差だけ（manga-plate / OBAN と同じ。§15-5）。
   ============================================================ */
var LP = window.LP || (window.LP = {});
LP.lib = LP.lib || {};

LP.lib.render = function(T, G, IT){
  'use strict';
  const PERSP_FOCAL = 1000;       // composer PERSP_FOCAL と同じ
  const LANES = ['fill', 'line']; // 合成順：塗 → 線（§6-2）

  function camBase(book){
    const pw = book.paper.w, ph = book.paper.h;
    let w = pw, h = pw * 9 / 16;
    if(h > ph){ h = ph; w = ph * 16 / 9; }
    return { w: w, h: h };
  }
  /* 紙のカメラ＝TAKE の KF 補間（time.js kfAt）＋画ブレ。KF が無い紙＝既定（紙の中央・等倍）。
     ★ 画ブレは「出力のカメラ」にだけ足す。CAPTURE が拾う窓（編集のカメラ）は camRaw＝ブレなし */
  function camRaw(sheet, local){ return T.kfAt(sheet && sheet.take, local); }
  function camAt(book, sheet, local){
    const c = camRaw(sheet, local);
    const sh = T.shakeAt(sheet, local, camBase(book).w / Math.max(0.01, c.s), book.fps);
    if(sh){ c.x += sh.dx; c.y += sh.dy; }
    return c;
  }
  /* 紙の面（z=0）の点 ⇄ 出口の矩形 R の上の点（P.paper() と同じ式。ステージの手すり・CAPTURE の掴みで使う）
       screen = Rc + Rot(−rot)·(s·p·k)·(paper − pc − cam) */
  function camK(book, cam, R){ return (R.w / camBase(book).w) * (cam.s || 1) * (perspOf(0, cam.z) || 1); }
  function paperToCam(book, cam, R, px, py){
    const K = camK(book, cam, R), a = -(cam.rot || 0) * Math.PI / 180;
    const dx = (px - book.paper.w / 2 - cam.x) * K, dy = (py - book.paper.h / 2 - cam.y) * K;
    return { x: R.x + R.w / 2 + dx * Math.cos(a) - dy * Math.sin(a), y: R.y + R.h / 2 + dx * Math.sin(a) + dy * Math.cos(a) };
  }
  function camToPaper(book, cam, R, sx, sy){
    const K = camK(book, cam, R), a = (cam.rot || 0) * Math.PI / 180;
    const dx = (sx - R.x - R.w / 2) / K, dy = (sy - R.y - R.h / 2) / K;
    return { x: book.paper.w / 2 + cam.x + dx * Math.cos(a) - dy * Math.sin(a), y: book.paper.h / 2 + cam.y + dx * Math.sin(a) + dy * Math.cos(a) };
  }
  /* 重なり順＝配列順（奥→手前）。Z では並べ替えない */
  function layersInDrawOrder(sheet){ return sheet.layers.slice(); }
  /* LAYER.z は「正＝手前」。composer の z（正＝奥）とは符号が逆：depth = F − z − cam.z（§15-1 #2） */
  function perspOf(z, camz){
    const d = PERSP_FOCAL - (z || 0) - (camz || 0);
    return d < 1 ? 0 : PERSP_FOCAL / d;
  }
  function gray(v){ v = Math.max(0, Math.min(255, Math.round(v == null ? 255 : v))); return 'rgb(' + v + ',' + v + ',' + v + ')'; }
  /* コマ割りの設定。紙ごとの上書き（旧 MANGA_BOOK を読んだ紙＝ページの範囲）があればそれ */
  function frameOf(book, sheet){
    const f = Object.assign({ margin: 80, lr: 48, tb: 64, lw: 8, color: '#000000', bindRight: true }, book.frame || {}, (sheet && sheet.frame) || {});
    const m = f.margin;
    f.bas = f.bas || { x: m, y: m, w: book.paper.w - m * 2, h: book.paper.h - m * 2 };
    f.edge = f.edge || { x: 0, y: 0, w: book.paper.w, h: book.paper.h };
    return f;
  }
  function itemOn(it, local){
    return it.visible !== false && local >= (it.tIn || 0) && (it.tOut == null || local < it.tOut);
  }

  /* 境界効果（α の外側にフチ）：α を2リング×24方向にずらして敷き source-in で単色化（manga-plate edgeSprite） */
  const edgeCache = new Map();
  function edgeSprite(img, key, w, color){
    const k = key + '|' + img.width + 'x' + img.height + '|' + Math.round(w) + '|' + color;
    const hit = edgeCache.get(k);
    if(hit) return hit;
    const pad = Math.ceil(w) + 2;
    const c = document.createElement('canvas');
    c.width = img.width + pad * 2; c.height = img.height + pad * 2;
    const g = c.getContext('2d');
    for(const rr of [w, w * 0.55]) for(let i = 0; i < 24; i++){
      const a = i / 24 * Math.PI * 2;
      g.drawImage(img, pad + Math.cos(a) * rr, pad + Math.sin(a) * rr);
    }
    g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    const out = { canvas: c, pad: pad };
    if(edgeCache.size > 32) edgeCache.clear();
    edgeCache.set(k, out);
    return out;
  }

  /* 層の絵（いまの ctx 原点＝層の中心・単位＝紙 px）。戻り値＝読めていない画像の数 */
  function drawLayerCell(ctx, book, L, local, view, w, h, mid){
    const plate = book.plates[L.plateId];
    if(!plate) return 0;
    const ci = T.cellIndexAt(plate, L, local);
    if(ci < 0){ if(mid) mid(ctx); return 0; }
    const cell = plate.cells[ci];
    const ga = ctx.globalAlpha;
    let miss = 0;
    const ims = [];
    for(let i = 0; i < LANES.length; i++){
      const lane = LANES[i], ln = plate.lanes && plate.lanes[lane];
      if(view.pass && view.pass !== lane) continue;                          // SEQ PNG の 線／塗 だけの書き出し
      if(view.mode !== 'export' && ln && ln.visible === false) continue;   // レーンの表示は表示だけ（§6-2）
      const im = view.img(cell, lane);
      if(im === false){ miss++; continue; }
      if(im) ims.push([lane, im, ln]);
    }
    if(L.edge && L.edge.on && L.edge.w > 0){
      for(const [lane, im] of ims){
        const sx = w / im.width, sy = h / im.height;
        const e = edgeSprite(im, cell.id + lane, Math.max(1, L.edge.w / sx), L.edge.color || '#FFFFFF');
        ctx.drawImage(e.canvas, -w / 2 - e.pad * sx, -h / 2 - e.pad * sy, e.canvas.width * sx, e.canvas.height * sy);
      }
    }
    let midDone = !mid;
    for(const [lane, im, ln] of ims){
      if(!midDone && lane === 'line'){ midDone = true; mid(ctx); }   // 02 DRAW：オニオンは塗の上・線の下（SPEC_20 §1-2）
      if(view.mode !== 'export' && ln && ln.opacity != null) ctx.globalAlpha = ga * ln.opacity;
      ctx.drawImage(im, -w / 2, -h / 2, w, h);
      ctx.globalAlpha = ga;
    }
    if(!midDone) mid(ctx);
    return miss;
  }

  /* 紙1枚の合成。P＝座標の置き方（見方ごとに違う）
       P.paper()  … ctx を「紙の面（z=0）の紙座標」にする
       P.layer(L) … ctx を「層の中心・紙 px」にする（false＝カメラ面の向こう＝描かない）
       P.bg(col)  … 地を塗る */
  function compose(ctx, book, sheet, local, view, P, alpha, skipId){
    let miss = 0;
    const fr = frameOf(book, sheet);
    const panels = sheet.panels || [];
    const pmap = {};
    panels.forEach(k => { pmap[k.id] = k; });
    const bg = gray(sheet.bg);
    const env = { bg: bg, alpha: alpha };
    const pass = !!view.pass;   // 線／塗だけ（SEQ PNG）：地・枠線・仕上げ素材は出さない（透明の上にそのレーンだけ）
    if(!pass){ ctx.save(); ctx.globalAlpha = alpha; P.bg(bg); ctx.restore(); }
    const clipTo = id => {
      const k = pmap[id];
      if(!k) return;
      P.paper();
      G.pathPoly(ctx, G.dispPoly(k, fr));
      ctx.clip();
    };
    const layer = L => {
      if(L.id === skipId || !L.visible) return;
      ctx.save();
      if(L.panelId) clipTo(L.panelId);
      if(P.layer(L)){
        ctx.globalAlpha = alpha * Math.max(0, Math.min(1, L.opacity == null ? 1 : L.opacity));
        if(L.blend === 'multiply') ctx.globalCompositeOperation = 'multiply';
        miss += drawLayerCell(ctx, book, L, local, view, L.w, L.h);
      }
      ctx.restore();
    };
    const items = pass ? [] : IT.drawOrder(sheet.items || []).filter(it => itemOn(it, local));
    const item = it => {
      ctx.save();
      if(it.panelId) clipTo(it.panelId);
      P.paper();
      IT.drawItemComposited(ctx, it, env);
      ctx.restore();
    };
    // 1) コマに属するもの（コマの形で clip）
    sheet.layers.forEach(L => { if(L.panelId) layer(L); });
    items.forEach(it => { if(it.panelId) item(it); });
    // 2) コマ枠線
    if(panels.length && !pass){
      ctx.save(); P.paper();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = fr.color; ctx.lineWidth = fr.lw; ctx.lineJoin = 'miter';
      for(const k of panels){
        if(k.border === false) continue;
        G.pathPoly(ctx, G.dispPoly(k, fr)); ctx.stroke();
      }
      ctx.restore();
    }
    // 3) 枠の上（擬音・飛び出し）
    sheet.layers.forEach(L => { if(!L.panelId) layer(L); });
    items.forEach(it => { if(!it.panelId) item(it); });
    return miss;
  }

  /* 平らな紙（01 SHEET・02 DRAW の下敷き・サムネ）。M0＝紙座標の行列 */
  function flatPlacer(ctx, book, M0){
    return {
      paper(){ ctx.setTransform(M0); },
      layer(L){
        ctx.setTransform(M0);
        ctx.translate(L.x + L.w / 2, L.y + L.h / 2);
        if(L.rot) ctx.rotate(L.rot * Math.PI / 180);
        return true;
      },
      bg(col){ ctx.setTransform(M0); ctx.fillStyle = col; ctx.fillRect(0, 0, book.paper.w, book.paper.h); },
    };
  }

  /* カメラの窓（mode:'camera' / 'export'）。view.rect＝ctx 上の出口の矩形。
     composer の透視式：位置は「カメラのずれ×persp」だけ動き、大きさに persp が掛かる。
     ★ 大きさは persp / persp₀（カメラが止まっているときの persp）で割る＝**止まったカメラの画＝紙に置いた通り**。
       Z は視差にだけ効く（composer applyObanPlacements の「depth→Z ＋ 大きさの打ち消し」と同じ。SPEC_12 ②） */
  /* 繋ぎ（sheet.in）。紙の頭の in.dur コマだけ、前の紙が「続きの時間」（prev.dur + local）で後ろに居る。
       fade … color 無し＝前の紙からディゾルブ／color あり＝前半で色へ・後半で色から（白飛び・黒味。SPEC_23 R6 の最小）
       wipe … 新しい紙が dir（l/r/u/d）の側から窓を覆っていく（硬い縁・1種類だけ。§6-4「増やさない」）
     ★ ディゾルブだけは「紙1枚を合成し終えた絵」に α を掛けたい（層ごとに α を掛けると重なりが透ける）ので、作業用の canvas に1回描く */
  let scratch = null;
  function scratchOf(cv){
    if(!scratch) scratch = document.createElement('canvas');
    if(scratch.width !== cv.width || scratch.height !== cv.height){ scratch.width = cv.width; scratch.height = cv.height; }
    return scratch.getContext('2d');
  }
  function drawCamera(ctx, book, at, view){
    const sheet = at.sheet, local = at.local;
    const R = view.rect;
    // 塗る範囲：窓だけ（書き出し）／ステージ全面（03 TAKE の「窓の外も見える」表示。view.over・ctx は素の座標で呼ぶこと）
    const A = view.over ? { x: 0, y: 0, w: ctx.canvas.width, h: ctx.canvas.height } : R;
    const prev = at.i > 0 ? book.sheets[at.i - 1] : null;
    const tin = sheet.in || {};
    const tdur = prev && (tin.type === 'fade' || tin.type === 'wipe') ? Math.max(0, tin.dur | 0) : 0;
    ctx.save();
    ctx.beginPath(); ctx.rect(A.x, A.y, A.w, A.h); ctx.clip();
    let miss = 0;
    const cur = g => shot(g, book, sheet, local, view, A, view.cam || null);
    if(tdur > 0 && local < tdur){
      const u = (local + 1) / (tdur + 1);
      const back = g => shot(g, book, prev, prev.dur + local, view, A, null);
      if(tin.type === 'wipe'){
        miss += back(ctx);
        ctx.save();
        const d = tin.dir || 'l';
        ctx.beginPath();
        if(d === 'r') ctx.rect(R.x + R.w * (1 - u), A.y, A.x + A.w - (R.x + R.w * (1 - u)), A.h);
        else if(d === 'u') ctx.rect(A.x, A.y, A.w, R.y + R.h * u - A.y);
        else if(d === 'd') ctx.rect(A.x, R.y + R.h * (1 - u), A.w, A.y + A.h - (R.y + R.h * (1 - u)));
        else ctx.rect(A.x, A.y, R.x + R.w * u - A.x, A.h);
        ctx.clip();
        miss += cur(ctx);
        ctx.restore();
      }else if(tin.color){
        miss += u < 0.5 ? back(ctx) : cur(ctx);
        if(!view.pass){   // 線／塗だけの書き出し（SEQ PNG）には色を敷かない（透明の地のまま切り替わる）
          ctx.save();
          ctx.globalAlpha = u < 0.5 ? u * 2 : (1 - u) * 2;
          ctx.fillStyle = tin.color;
          ctx.fillRect(A.x, A.y, A.w, A.h);
          ctx.restore();
        }
      }else{
        miss += back(ctx);
        const g = scratchOf(ctx.canvas);
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, g.canvas.width, g.canvas.height);
        g.setTransform(ctx.getTransform());
        g.save(); g.beginPath(); g.rect(A.x, A.y, A.w, A.h); g.clip();
        g.imageSmoothingEnabled = true;
        if('imageSmoothingQuality' in g) g.imageSmoothingQuality = 'high';
        miss += cur(g);
        g.restore();
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = u;
        ctx.drawImage(g.canvas, 0, 0);
        ctx.restore();
      }
    }else{
      miss += cur(ctx);
    }
    ctx.restore();
    return miss;
  }
  /* 紙1枚をカメラで撮る（A＝塗る範囲・R＝出口の窓）。cam を渡せばそれ（03 TAKE の手持ちのカメラ）、無ければ TAKE の KF */
  function shot(ctx, book, sheet, local, view, A, camIn){
    const R = view.rect;
    const base = camBase(book);
    const cam = camIn || camAt(book, sheet, local);
    const k = R.w / base.w;
    const pcx = book.paper.w / 2, pcy = book.paper.h / 2;
    ctx.save();
    if(!view.pass){ ctx.fillStyle = gray(sheet.bg); ctx.fillRect(A.x, A.y, A.w, A.h); }
    ctx.translate(R.x + R.w / 2, R.y + R.h / 2);
    if(cam.rot) ctx.rotate(-cam.rot * Math.PI / 180);
    ctx.scale(cam.s || 1, cam.s || 1);
    const M0 = ctx.getTransform();
    const P = {
      paper(){
        const p = perspOf(0, cam.z) || 1;
        ctx.setTransform(M0);
        ctx.translate(-cam.x * p * k, -cam.y * p * k);
        ctx.scale(p * k, p * k);
        ctx.translate(-pcx, -pcy);
      },
      layer(L){
        const p = perspOf(L.z, cam.z);
        if(!p) return false;
        const p0 = perspOf(L.z, 0) || 1;
        ctx.setTransform(M0);
        ctx.translate((L.x + L.w / 2 - pcx - cam.x * p) * k, (L.y + L.h / 2 - pcy - cam.y * p) * k);
        if(L.rot) ctx.rotate(L.rot * Math.PI / 180);
        ctx.scale(p / p0 * k, p / p0 * k);
        return true;
      },
      bg(){},
    };
    const miss = compose(ctx, book, sheet, local, view, P, 1, null);
    ctx.restore();
    return miss;
  }

  /* view: { mode:'sheet'|'focus'|'camera'|'export', img, pass（'line'|'fill'＝そのレーンだけ・地なし）,
            under / mid（focus：参照・オニオンを描く手すり。原点＝プレート左上）,
            scale, ox, oy（sheet/focus：世界→ctx）, rect（camera/export：出口の矩形）,
            cam（camera：このカメラで撮る＝03 TAKE の手持ち。無ければ TAKE の KF＋画ブレ）,
            over（camera：窓の外まで撮る＝03・04 の表示。ctx は素の座標で呼ぶ）,
            guides, guideColor, layerId（focus）, baseAlpha（focus の紙の透かし）, px（ガイド線の太さ＝ctx px） } */
  function renderFrame(ctx, book, t, view){
    const at = T.sheetAt(book, t);
    if(!at) return { missing: 0, at: null };
    ctx.imageSmoothingEnabled = true;
    if('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
    const px = view.px || 1;

    if(view.mode === 'camera' || view.mode === 'export'){
      return { missing: drawCamera(ctx, book, at, view), at: at };
    }

    ctx.save();
    ctx.translate(view.ox || 0, view.oy || 0);
    ctx.scale(view.scale || 1, view.scale || 1);
    const s = view.scale || 1;
    let miss = 0;

    if(view.mode === 'focus'){
      const L = at.sheet.layers.find(l => l.id === view.layerId);
      const plate = L && book.plates[L.plateId];
      if(!L || !plate){ ctx.restore(); return { missing: 0, at: at }; }
      // 下敷き：紙を層の逆変換でプレート座標へ置いて baseAlpha で透かす（econte のトレース透かし）
      ctx.translate(plate.w / 2, plate.h / 2);
      ctx.scale(plate.w / L.w, plate.h / L.h);
      if(L.rot) ctx.rotate(-L.rot * Math.PI / 180);
      ctx.translate(-(L.x + L.w / 2), -(L.y + L.h / 2));
      const Mp = ctx.getTransform();
      miss += compose(ctx, book, at.sheet, at.local, view, flatPlacer(ctx, book, Mp), view.baseAlpha == null ? 0.3 : view.baseAlpha, L.id);
      // 層が属するコマの形をガイドで（はみ出しをそのまま描き足せる）
      const fr = frameOf(book, at.sheet);
      const k = L.panelId && (at.sheet.panels || []).find(o => o.id === L.panelId);
      ctx.setTransform(Mp);
      if(k && view.guides){
        ctx.save(); ctx.setLineDash([10 * px / s * L.w / plate.w, 8 * px / s * L.w / plate.w]);
        ctx.lineWidth = px / s * L.w / plate.w; ctx.strokeStyle = view.guideColor || 'rgba(90,233,255,.9)';
        G.pathPoly(ctx, G.dispPoly(k, fr)); ctx.stroke(); ctx.restore();
      }
      // 本体：プレート原寸
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.translate(view.ox || 0, view.oy || 0); ctx.scale(s, s);
      // 02 DRAW の手すり（参照・オニオン）。出力には出ない UI なので view で受け取る（原点＝プレートの左上・単位＝プレート px）
      if(view.under){ ctx.save(); view.under(ctx); ctx.restore(); }
      ctx.save();
      ctx.translate(plate.w / 2, plate.h / 2);
      const mid = view.mid ? c => { c.save(); c.translate(-plate.w / 2, -plate.h / 2); view.mid(c); c.restore(); } : null;
      miss += drawLayerCell(ctx, book, L, at.local, view, plate.w, plate.h, mid);
      ctx.restore();
      if(view.guides){
        ctx.lineWidth = px / s;
        ctx.strokeStyle = view.guideColor || 'rgba(90,233,255,.9)';
        ctx.strokeRect(0, 0, plate.w, plate.h);
      }
      ctx.restore();
      return { missing: miss, at: at };
    }

    // mode:'sheet' — 紙の全面
    const M0 = ctx.getTransform();
    miss += compose(ctx, book, at.sheet, at.local, view, flatPlacer(ctx, book, M0), ctx.globalAlpha, null);
    ctx.setTransform(M0);
    if(view.guides){
      ctx.lineWidth = px / s;
      ctx.strokeStyle = 'rgba(0,0,0,.35)';
      ctx.strokeRect(0, 0, book.paper.w, book.paper.h);
      const b = camBase(book);
      if(Math.abs(b.w - book.paper.w) > 1 || Math.abs(b.h - book.paper.h) > 1){
        ctx.setLineDash([8 * px / s, 6 * px / s]);
        ctx.strokeStyle = view.guideColor || 'rgba(90,233,255,.9)';
        ctx.strokeRect((book.paper.w - b.w) / 2, (book.paper.h - b.h) / 2, b.w, b.h);
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
    return { missing: miss, at: at };
  }

  return { PERSP_FOCAL, renderFrame, camBase, camAt, camRaw, paperToCam, camToPaper, layersInDrawOrder, perspOf, frameOf };
};
LP.render = LP.lib.render(LP.time, LP.geom, LP.items);
