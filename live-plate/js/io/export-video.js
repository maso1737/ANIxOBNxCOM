/* ============================================================
   LIVE PLATE — io/export-video.js（VIDEO：MP4／WebM。SPEC_21 §7-4 ② / §19）
   カメラの出力（renderFrame mode:'export'＝HTML ビューア・SEQ PNG・VRT と同じ関数）を1コマずつ WebCodecs で圧縮する。
     MP4  … H.264（avc1）＋ mp4-muxer（econte と同じ CDN・同じ版）
     WebM … VP9 ＋ webm-muxer（同じ作者の対の muxer）
   ★ **非実時間**：1コマ描く → 画像のデコード待ち → 圧縮。タブが裏でも進む・遅いマシンでもコマが落ちない（econte D3）
   ★ muxer は押したときにだけ CDN から読む（file:// でも開ける。オフラインなら書き出しだけ失敗してトースト）
   ★ 音は入れない（BOOK の音は P4）。同じボタンをもう一度押すと中断（econte §5-E）
   ============================================================ */
var LP = window.LP || (window.LP = {});
LP.io = LP.io || {};

(function(){
  'use strict';
  const MUX = {
    mp4:  { url: 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.5/build/mp4-muxer.js', name: 'Mp4Muxer', type: 'video/mp4', ext: 'mp4' },
    webm: { url: 'https://cdn.jsdelivr.net/npm/webm-muxer@5.1.4/build/webm-muxer.js', name: 'WebMMuxer', type: 'video/webm', ext: 'webm' },
  };
  const loading = {};
  function loadMuxer(kind){
    const m = MUX[kind];
    if(window[m.name]) return Promise.resolve(window[m.name]);
    if(loading[kind]) return loading[kind];
    loading[kind] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = m.url;
      s.onload = () => window[m.name] ? res(window[m.name]) : rej(new Error(m.name + ' が見つかりません'));
      s.onerror = () => { loading[kind] = null; rej(new Error('muxer を読み込めませんでした（ネットに繋がっていますか）')); };
      document.head.appendChild(s);
    });
    return loading[kind];
  }
  /* 大きさに合う H.264 のレベル（1280×720＝3.1 / 1920×1080＝4.0 / 3840×2160＝5.1）。High が駄目なら Baseline も試す */
  function codecsFor(kind, w, h){
    if(kind === 'webm') return ['vp09.00.40.08', 'vp09.00.31.08', 'vp8'];
    const a = w * h;
    const lv = a <= 1280 * 720 ? '1f' : a <= 2048 * 1088 ? '28' : '33';
    return ['avc1.6400' + lv, 'avc1.4d00' + lv, 'avc1.4200' + lv];
  }
  async function pickConfig(kind, w, h, fps, bitrate){
    if(!window.VideoEncoder || !window.VideoFrame) return null;
    for(const codec of codecsFor(kind, w, h)){
      const cfg = { codec, width: w, height: h, bitrate, framerate: fps };
      if(kind === 'mp4') cfg.avc = { format: 'avc' };
      try{
        const r = await VideoEncoder.isConfigSupported(cfg);
        if(r && r.supported) return cfg;
      }catch(e){}
    }
    return null;
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  /* 1コマを描く（読めていない画像があれば読めるまで待つ＝欠けた画を書かない。export-seq.js の frame と同じ） */
  async function frame(g, book, t, rect){
    for(let k = 0; k < 400; k++){
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = '#000'; g.fillRect(0, 0, rect.w, rect.h);
      const r = LP.render.renderFrame(g, book, t, { mode: 'export', img: LP.cache.img, rect });
      if(!r.missing) return;
      await wait(25);
    }
    throw new Error('画像を読めませんでした（t=' + t + '）');
  }

  async function exportVideo(){
    const ex = LP.io.exportState();
    if(ex.busy){ ex.abort = true; return; }
    await LP.cells.flush();
    const book = LP.book, T = LP.time.totalFrames(book), fps = book.fps;
    if(!T){ LP.ui.toast('書き出すコマがありません'); return; }
    const kind = ex.vid === 'webm' ? 'webm' : 'mp4', M = MUX[kind];
    const out = LP.app.outSize(ex.res);
    const w = out.w - out.w % 2, h = out.h - out.h % 2;   // H.264 は偶数
    const cfg = await pickConfig(kind, w, h, fps, Math.round((ex.vbr || 16) * 1e6));
    if(!cfg){ LP.ui.toast('このブラウザは ' + kind.toUpperCase() + ' の書き出し（WebCodecs ' + (kind === 'mp4' ? 'H.264' : 'VP9') + '）に未対応です' + (kind === 'mp4' ? '。WebM か SEQ PNG を試してください' : '')); return; }
    LP.app.stop();
    ex.busy = true; ex.abort = false; ex.p = 0; ex.msg = 'muxer を読み込み中…';
    LP.state.exporting = true;
    LP.dock.render();
    let enc = null;
    try{
      const Mx = await loadMuxer(kind);
      const target = new Mx.ArrayBufferTarget();
      const muxer = kind === 'mp4'
        ? new Mx.Muxer({ target, video: { codec: 'avc', width: w, height: h, frameRate: fps }, fastStart: 'in-memory' })
        : new Mx.Muxer({ target, video: { codec: cfg.codec.startsWith('vp8') ? 'V_VP8' : 'V_VP9', width: w, height: h, frameRate: fps } });
      let encErr = null;
      enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => { encErr = e; } });
      enc.configure(cfg);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d');
      const rect = { x: 0, y: 0, w, h };
      const us = 1e6 / fps;
      for(let t = 0; t < T; t++){
        if(ex.abort) throw new Error('abort');
        if(encErr) throw encErr;
        await frame(g, book, t, rect);
        const vf = new VideoFrame(c, { timestamp: Math.round(t * us), duration: Math.round(us) });
        enc.encode(vf, { keyFrame: t % (fps * 2) === 0 });
        vf.close();
        while(enc.encodeQueueSize > 8) await wait(4);   // 圧縮が追いつくまで待つ（メモリを溜めない）
        ex.msg = 'VIDEO ' + kind.toUpperCase() + ' … ' + (t + 1) + ' / ' + T; ex.p = (t + 1) / T * 0.97;
        if(t % 6 === 0 || t === T - 1){ LP.dock.progress(ex.msg, ex.p); await wait(0); }
      }
      await enc.flush();
      if(encErr) throw encErr;
      enc.close(); enc = null;
      muxer.finalize();
      const blob = new Blob([target.buffer], { type: M.type });
      const d = new Date(), p2 = x => String(x).padStart(2, '0');
      const fname = (book.name || 'liveplate').replace(/[\\/:*?"<>|\s]+/g, '_') + '_' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '_' + p2(d.getHours()) + p2(d.getMinutes()) + '.' + M.ext;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = fname;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      LP.io.lastVideo = { blob, name: fname, codec: cfg.codec, w, h, frames: T };   // 検証用（ハーネス・テストが読む）
      LP.ui.toast('VIDEO を書き出しました — ' + fname + '（' + w + '×' + h + '・' + T + 'コマ・' + LP.io.fmtMB(blob.size) + '）', 5000);
    }catch(e){
      if(e && e.message === 'abort') LP.ui.toast('書き出しを中断しました');
      else { console.error(e); LP.ui.toast('書き出しに失敗しました：' + (e && e.message || e)); }
    }finally{
      if(enc){ try{ enc.close(); }catch(err){} }
      ex.busy = false; ex.abort = false;
      LP.state.exporting = false;
      LP.dock.render();
    }
  }

  Object.assign(LP.io, { exportVideo });
})();
