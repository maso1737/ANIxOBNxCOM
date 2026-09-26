/* ============================================================
   LIVE PLATE — core/history.js（Undo / Redo）
   SPEC_21 §8-1：ステップごとのログ。P0 は SHEET＝BOOK ログだけ
   （DRAW のタイル Undo は P2、TAKE の KF ログは P3 でここに並べる）。
   ★ 操作の「後」に commit(label) を呼ぶ。スナップショットは model.clone＝Blob は参照のまま（軽い）。
   ★ Undo で戻せる操作は確認ダイアログを出さない（§2-4）。代わりにトーストで知らせる。
   ============================================================ */
var LP = window.LP || (window.LP = {});

(function(){
  'use strict';
  const MAX = 80;
  let stack = [], idx = -1, labels = [];

  function reset(){
    stack = [LP.model.clone(LP.book)];
    labels = ['open'];
    idx = 0;
  }
  function commit(label){
    stack.length = idx + 1; labels.length = idx + 1;
    stack.push(LP.model.clone(LP.book)); labels.push(label || '');
    if(stack.length > MAX){ stack.shift(); labels.shift(); }
    idx = stack.length - 1;
    LP.store.saveSoon();
  }
  function go(d){
    const j = idx + d;
    if(j < 0 || j >= stack.length) return null;
    const label = d < 0 ? labels[idx] : labels[j];
    idx = j;
    LP.book = LP.model.clone(stack[idx]);
    LP.store.saveSoon();
    return label || '操作';
  }
  function undo(){ return go(-1); }
  function redo(){ return go(1); }

  LP.hist = { reset, commit, undo, redo, get depth(){ return idx; } };
})();
