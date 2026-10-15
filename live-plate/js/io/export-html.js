/* ============================================================
   LIVE PLATE — io/export-html.js（HTML ビューア書き出し。SPEC_21 §9-2 の最小版＝P0）
   骨格は composer buildViewerHTML：VIEWER_DATA（画像は dataURL・ユニーク化）＋ 描画関数を**文字列で同梱**。
   ★ 同梱するのは LP.lib.time / LP.lib.render そのもの（Function#toString）。
     ＝ステージで見ている画とビューアの画が**同じコード**。ロジックを書き写さない。
   ★ 画像は必ず埋め込み（OBAN の「同フォルダ参照」はやめた＝別 PC でそのまま開ける）。>200MB は確認。
   P1 からコマ（切り抜き・枠線・断ち切り）・仕上げ素材・文字（縦書き・アンチック体）も同じ関数で出る。
   まだ入れていないもの：字幕・クリック FX・DOF・ATTRACT・マウス微パララックス（カメラが来る P3 で）
   ============================================================ */
var LP = window.LP || (window.LP = {});
LP.io = LP.io || {};

(function(){
  'use strict';
  const PREF_LS = 'liveplate_export_v1';
  // kind＝ドックで選んでいる出口（html／seq）。seq＝SEQ PNG（io/export-seq.js）。seqMode＝合体／線／塗／線+塗、seqTo＝zip／フォルダ
  const ex = { kind: 'html', res: 1920, q: 'webp80', ppf: 20, seqMode: 'comp', seqTo: 'zip', busy: false, abort: false, msg: '', p: 0 };
  const PREF_KEYS = ['kind', 'res', 'q', 'ppf', 'seqMode', 'seqTo'];
  try{ const o = JSON.parse(localStorage.getItem(PREF_LS) || '{}'); PREF_KEYS.forEach(k => { if(o[k] != null) ex[k] = o[k]; }); }catch(e){}

  function exportState(){ return ex; }
  function saveExportPrefs(){ try{ if(!LP.HARNESS_ON){ const o = {}; PREF_KEYS.forEach(k => { o[k] = ex[k]; }); localStorage.setItem(PREF_LS, JSON.stringify(o)); } }catch(e){} }

  /* 書き出しに乗るプレート（層から参照されているものだけ） */
  function usedPlates(book){
    const m = new Map();
    for(const s of book.sheets) for(const l of s.layers){
      const p = book.plates[l.plateId];
      if(p) m.set(p.id, p);
    }
    return [...m.values()];
  }
  function blobsOf(plates){
    const set = new Set();
    plates.forEach(p => p.cells.forEach(c => { if(c.line) set.add(c.line); if(c.fill) set.add(c.fill); }));
    return [...set];
  }
  function fmtMB(b){ return b >= 1048576 ? (b / 1048576).toFixed(b >= 10485760 ? 0 : 1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function estimateHtml(opt){
    const raw = blobsOf(usedPlates(LP.book)).reduce((a, b) => a + b.size, 0) * 4 / 3 + 30000;
    return opt.q === 'orig' ? '約 ' + fmtMB(raw) : fmtMB(raw) + ' 以下（原画換算）';
  }

  function readDataURL(blob){ return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); }); }
  /* 1枚を書き出し用に：原画はそのまま／WebP は必要な大きさまで縮めて再エンコード */
  async function encode(blob, scale, q){
    if(q === 'orig') return readDataURL(blob);
    const bmp = await createImageBitmap(blob);
    const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, 0, 0, w, h);
    bmp.close && bmp.close();
    const url = c.toDataURL('image/webp', q === 'webp95' ? 0.95 : 0.8);
    // WebP を作れないブラウザは PNG が返る（それでも開ける）
    return url;
  }

  async function exportHtml(){
    if(ex.busy){ ex.abort = true; return; }
    await LP.cells.flush();                    // 02 DRAW で描いた絵を Blob へ
    const book = LP.book;
    const plates = usedPlates(book);
    if(!plates.length && !book.sheets.some(s => (s.items || []).length || (s.panels || []).length)){ LP.ui.toast('書き出す絵がありません（紙に層・コマ・仕上げ素材を置いてください）'); return; }
    const raw = blobsOf(plates).reduce((a, b) => a + b.size, 0) * 4 / 3;
    if(ex.q === 'orig' && raw > 200 * 1048576){
      const ok = await LP.ui.modalConfirm('書き出すと約 ' + fmtMB(raw) + ' になります。\nブラウザで開くのに時間がかかります。続けますか？\n（画質を WEBP にすると小さくなります）', '書き出す');
      if(!ok) return;
    }
    LP.app.stop();
    ex.busy = true; ex.abort = false; ex.msg = '準備中…'; ex.p = 0;
    LP.state.exporting = true;
    LP.dock.render();
    const out = LP.app.outSize(ex.res);
    const base = LP.render.camBase(book);
    try{
      // 必要な解像度：その素材を使う層のうち一番大きく出るもの（カメラ等倍・persp 1）
      const need = new Map();
      for(const s of book.sheets) for(const l of s.layers){
        const p = book.plates[l.plateId];
        if(!p) continue;
        const px = l.w * out.w / base.w;
        need.set(p.id, Math.max(need.get(p.id) || 0, px / p.w));
      }
      const images = [], index = new Map();
      const all = [];
      plates.forEach(p => p.cells.forEach(c => ['line', 'fill'].forEach(ln => { if(c[ln]) all.push({ p, blob: c[ln] }); })));
      let done = 0;
      for(const it of all){
        if(ex.abort) throw new Error('abort');
        if(!index.has(it.blob)){
          const sc = Math.min(1, Math.max(0.05, (need.get(it.p.id) || 1) * 1.02));
          index.set(it.blob, images.length);
          images.push(await encode(it.blob, sc, ex.q));
        }
        done++;
        ex.msg = '画像を埋め込み中… ' + done + ' / ' + all.length; ex.p = done / all.length * 0.95;
        if(done % 4 === 0 || done === all.length) LP.dock.progress(ex.msg, ex.p);
      }
      const data = {
        ver: 1, name: book.name, fps: book.fps,
        paper: { w: book.paper.w, h: book.paper.h },
        frame: book.frame,
        out: out, ppf: ex.ppf,
        sheets: book.sheets.map(s => ({
          id: s.id, name: s.name, dur: s.dur, bg: s.bg, in: s.in,
          frame: s.frame || null,
          panels: (s.panels || []).map(k => ({ id: k.id, poly: k.poly, base: k.base, cuts: k.cuts, border: k.border, bleed: k.bleed })),
          items: (s.items || []).filter(it => it.visible !== false && !(it.type === 'text' && !String(it.text || '').trim())),
          layers: s.layers.filter(l => book.plates[l.plateId]).map(l => ({
            id: l.id, plateId: l.plateId, panelId: l.panelId || null, edge: l.edge && l.edge.on ? l.edge : null,
            x: l.x, y: l.y, w: l.w, h: l.h, rot: l.rot || 0, z: l.z || 0,
            opacity: l.opacity, blend: l.blend, tIn: l.tIn || 0, tOut: l.tOut == null ? null : l.tOut,
            tOffset: l.tOffset || 0, step: l.step || 1, visible: l.visible !== false,
          })),
        })),
        plates: {},
        images: images,
      };
      plates.forEach(p => {
        data.plates[p.id] = { id: p.id, w: p.w, h: p.h, loop: p.loop,
          cells: p.cells.map(c => ({ id: c.id, dur: c.dur, line: c.line ? index.get(c.line) : -1, fill: c.fill ? index.get(c.fill) : -1 })) };
      });
      ex.msg = 'HTML を組み立て中…'; LP.dock.progress(ex.msg, 0.97);
      const core = 'var LPT=(' + LP.lib.time.toString() + ')();\nvar LPG=(' + LP.lib.geom.toString() + ')();\nvar LPI=(' + LP.lib.items.toString() + ')();\nvar LPR=(' + LP.lib.render.toString() + ')(LPT,LPG,LPI);';
      const html = LP.viewer.build(data, core);
      const blob = new Blob([html], { type: 'text/html' });
      const d = new Date(), pad = n => String(n).padStart(2, '0');
      const fname = (book.name || 'liveplate').replace(/[\\/:*?"<>|\s]+/g, '_') + '_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes()) + '.html';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = fname;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      LP.ui.toast('HTML を書き出しました — ' + fname + '（' + fmtMB(blob.size) + '・画像 ' + images.length + '枚）', 5000);
    }catch(e){
      if(e && e.message === 'abort') LP.ui.toast('書き出しを中断しました');
      else { console.error(e); LP.ui.toast('書き出しに失敗しました：' + (e && e.message || e)); }
    }finally{
      ex.busy = false; ex.abort = false;
      LP.state.exporting = false;
      LP.dock.render();
    }
  }

  Object.assign(LP.io, { exportState, saveExportPrefs, estimateHtml, exportHtml, fmtMB });
})();
