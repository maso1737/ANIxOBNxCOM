/* ============================================================
   LIVE PLATE — io/export-seq.js（SEQ PNG：連番 PNG の4択。SPEC_21 §7-4 ③ / SPEC_20 §1-8）
   カメラの出力（renderFrame mode:'export'＝HTML ビューア・VRT と同じ関数）を1コマ1枚で書く。
     合体   … frames/  地・層・コマ・仕上げ素材 全部（見えている画）
     線     … line/    全部の層の線レーンだけ・透明の地（コマの切り抜き・Z・カメラは同じ）
     塗     … fill/    全部の層の塗レーンだけ・透明の地
     線+塗  … line/ と fill/ の2フォルダ（AE で線と塗りを別に重ねる）
   ★ 空のコマも透明1枚を書く（番号の欠けを作らない＝animator §7-7 と同じ）。ファイル名は frame_00000.png（通しフレーム）
   ★ 保存先：ZIP（無圧縮 store・依存ゼロ）／フォルダへ1枚ずつ（showDirectoryPicker がある環境だけ。RAM を食わない）
   ★ 同じボタンをもう一度押すと中断（econte §5-E）
   ============================================================ */
var LP = window.LP || (window.LP = {});
LP.io = LP.io || {};

(function(){
  'use strict';
  const MODES = { comp: [['frames', null]], line: [['line', 'line']], fill: [['fill', 'fill']], both: [['line', 'line'], ['fill', 'fill']] };
  const MODE_JP = { comp: '合体', line: '線', fill: '塗', both: '線+塗' };

  function toBlob(c){ return new Promise(res => c.toBlob(res, 'image/png')); }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  function canFolder(){ return typeof window.showDirectoryPicker === 'function'; }

  /* 1コマを描く。画像のデコード待ち（missing）があれば読めるまで待ってから描き直す（決定論：欠けた画を書かない） */
  async function frame(g, book, t, rect, pass){
    for(let k = 0; k < 400; k++){
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, rect.w, rect.h);
      const r = LP.render.renderFrame(g, book, t, { mode: 'export', img: LP.cache.img, rect, pass });
      if(!r.missing) return;
      await wait(25);
    }
    throw new Error('画像を読めませんでした（t=' + t + '）');
  }

  async function exportSeq(){
    const ex = LP.io.exportState();
    if(ex.busy){ ex.abort = true; return; }
    await LP.cells.flush();
    const book = LP.book, T = LP.time.totalFrames(book);
    if(!T){ LP.ui.toast('書き出すコマがありません'); return; }
    const out = LP.app.outSize(ex.res), passes = MODES[ex.seqMode] || MODES.comp;
    let dir = null;
    if(ex.seqTo === 'folder' && canFolder()){
      try{ dir = await window.showDirectoryPicker({ mode: 'readwrite' }); }catch(e){ return; }   // 選ぶのをやめた
    }else if(T * passes.length > 600){
      const ok = await LP.ui.modalConfirm('PNG ' + (T * passes.length) + ' 枚を ZIP にまとめます（' + out.w + '×' + out.h + '）。\nメモリを多く使います。続けますか？' + (canFolder() ? '\n（保存先を「フォルダ」にすると1枚ずつ書くので軽くなります）' : ''), '書き出す');
      if(!ok) return;
    }
    LP.app.stop();
    ex.busy = true; ex.abort = false; ex.p = 0; ex.msg = '準備中…';
    LP.state.exporting = true;
    LP.dock.render();
    const c = document.createElement('canvas'); c.width = out.w; c.height = out.h;
    const g = c.getContext('2d');
    const rect = { x: 0, y: 0, w: out.w, h: out.h };
    const entries = [], subs = {};
    const pad = n => String(n).padStart(5, '0');
    let n = 0, bytes = 0;
    try{
      for(let t = 0; t < T; t++){
        for(const [folder, pass] of passes){
          if(ex.abort) throw new Error('abort');
          await frame(g, book, t, rect, pass);
          const blob = await toBlob(c);
          const name = 'frame_' + pad(t) + '.png';
          if(dir){
            if(!subs[folder]) subs[folder] = await dir.getDirectoryHandle(folder, { create: true });
            const fh = await subs[folder].getFileHandle(name, { create: true });
            const w = await fh.createWritable();
            await w.write(blob); await w.close();
          }else{
            entries.push({ name: folder + '/' + name, data: new Uint8Array(await blob.arrayBuffer()) });
          }
          bytes += blob.size; n++;
        }
        ex.msg = 'SEQ PNG ' + MODE_JP[ex.seqMode] + ' … ' + (t + 1) + ' / ' + T; ex.p = (t + 1) / T * (dir ? 1 : 0.95);
        if(t % 3 === 0 || t === T - 1) LP.dock.progress(ex.msg, ex.p);
      }
      if(dir){
        LP.ui.toast('SEQ PNG（' + MODE_JP[ex.seqMode] + '）を ' + n + ' 枚フォルダへ書きました — ' + LP.io.fmtMB(bytes), 5000);
      }else{
        LP.dock.progress('ZIP にまとめています…', 0.97);
        const zip = LP.io.zipStore(entries);
        const d = new Date(), p2 = x => String(x).padStart(2, '0');
        const fname = 'liveplate-seq-' + (book.name || 'book').replace(/[\\/:*?"<>|\s]+/g, '_') + '-' + ex.seqMode + '-' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' + p2(d.getHours()) + p2(d.getMinutes()) + '.zip';
        const a = document.createElement('a');
        a.href = URL.createObjectURL(zip); a.download = fname;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 60000);
        LP.ui.toast('SEQ PNG を書き出しました — ' + fname + '（' + n + ' 枚・' + LP.io.fmtMB(zip.size) + '）', 5000);
      }
    }catch(e){
      if(e && e.message === 'abort') LP.ui.toast('書き出しを中断しました' + (dir ? '（書いた ' + n + ' 枚はフォルダに残っています）' : ''));
      else { console.error(e); LP.ui.toast('書き出しに失敗しました：' + (e && e.message || e)); }
    }finally{
      ex.busy = false; ex.abort = false;
      LP.state.exporting = false;
      LP.dock.render();
    }
  }
  function estimateSeq(ex){
    const T = LP.time.totalFrames(LP.book), k = (MODES[ex.seqMode] || MODES.comp).length;
    return (T * k) + ' 枚';
  }

  Object.assign(LP.io, { exportSeq, estimateSeq, canFolder, SEQ_MODE_JP: MODE_JP });
})();
