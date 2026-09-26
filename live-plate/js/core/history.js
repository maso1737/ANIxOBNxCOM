/* ============================================================
   LIVE PLATE — core/history.js（Undo / Redo）
   **1本の時系列**に2種類の手を積む（SPEC_21 §8-1 の「ステップごとのログ」から変えた＝§17-2 #3）：
     book … BOOK のスナップショット（操作の「後」の姿。model.clone＝Blob は参照のまま＝軽い）
     px   … 02 DRAW の画素（econte の矩形タイル：変わった矩形の before / after だけ。core/cells.js の txEnd が積む）
   ★ 画素は BOOK のスナップショットの外にある。描いた絵の Blob は patchBlob で**全部のスナップショットへ**書き込む
     ＝ BOOK の Undo（紙の尺・層の移動…）が描いた絵を巻き戻さない。絵を戻すのは px の手だけ。
   ★ 操作の「後」に commit(label) を呼ぶ。Undo で戻せる操作は確認ダイアログを出さない（§2-4）。
   ★ 先頭（base）は必ず book。溢れたら2番目から捨て、捨てた手が book なら base をその姿へ進める。
   ============================================================ */
var LP = window.LP || (window.LP = {});

(function(){
  'use strict';
  const MAX = 80;
  const BYTE_MAX = 512 * 1024 * 1024;   // タイルの ImageData の合計（大きなバケツが続いても RAM を食い潰さない）
  let entries = [], idx = -1, bytes = 0, busy = Promise.resolve();

  function reset(){
    entries = [{ kind: 'book', snap: LP.model.clone(LP.book), label: 'open' }];
    idx = 0; bytes = 0;
  }
  function pxBytes(e){ let n = 0; for(const it of e.items) n += (it.before ? it.before.data.length : 0) + (it.after ? it.after.data.length : 0); return n; }
  function truncate(){
    for(let i = idx + 1; i < entries.length; i++) if(entries[i].kind === 'px') bytes -= pxBytes(entries[i]);
    entries.length = idx + 1;
  }
  function trim(){
    while(entries.length > 2 && (entries.length > MAX || bytes > BYTE_MAX)){
      const e = entries.splice(1, 1)[0];
      if(e.kind === 'book') entries[0].snap = e.snap;
      else bytes -= pxBytes(e);
      idx--;
    }
  }
  function commit(label){
    truncate();
    entries.push({ kind: 'book', snap: LP.model.clone(LP.book), label: label || '' });
    idx = entries.length - 1;
    trim();
    LP.store.saveSoon();
  }
  /* 02 DRAW の画素の手（cells.txEnd から） */
  function pushPx(label, items){
    truncate();
    const e = { kind: 'px', items, label: label || '描く' };
    entries.push(e);
    bytes += pxBytes(e);
    idx = entries.length - 1;
    trim();
  }
  function bookAt(i){
    for(let j = i; j >= 0; j--) if(entries[j].kind === 'book') return entries[j].snap;
    return entries[0].snap;
  }
  /* 戻す／進める。px は画素を貼るだけ（必要ならセルを起こしてから＝非同期）なので、連打しても順番どおりに */
  function go(d){
    const j = idx + d;
    if(j < 0 || j >= entries.length || (d < 0 && idx === 0)) return null;
    const e = d < 0 ? entries[idx] : entries[j];
    idx = d < 0 ? idx - 1 : j;
    if(e.kind === 'book'){
      LP.book = LP.model.clone(d < 0 ? bookAt(idx) : e.snap);
      LP.store.saveSoon();
    }else{
      const which = d < 0 ? 'before' : 'after';
      busy = busy.then(() => LP.cells.applyTiles(e.items, which)).catch(err => console.error(err));
    }
    return { label: e.label || '操作', kind: e.kind };
  }
  function undo(){ return go(-1); }
  function redo(){ return go(1); }
  /* 描いた絵の Blob を全部のスナップショットへ（BOOK の Undo が絵を巻き戻さないように） */
  function patchBlob(plateId, cellId, lane, blob){
    for(const e of entries){
      if(e.kind !== 'book') continue;
      const p = e.snap.plates[plateId];
      if(!p) continue;
      const c = p.cells.find(o => o.id === cellId);
      if(c) c[lane] = blob;
    }
  }

  LP.hist = { reset, commit, pushPx, undo, redo, patchBlob, get depth(){ return idx; }, get bytes(){ return bytes; } };
})();
