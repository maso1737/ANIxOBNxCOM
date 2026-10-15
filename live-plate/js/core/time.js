/* ============================================================
   LIVE PLATE — core/time.js（時間。SPEC_21 §6-4）
   ★ この工場関数は HTML ビューアに**文字列のまま同梱**される（export-html.js が
     LP.lib.time.toString() を埋め込む）。外の変数（LP・DOM・Blob）を一切参照しないこと。
     ここで書いた式が、ステージ・タイムライン・書き出し・ビューアの全部で同じになる。
   ============================================================ */
var LP = window.LP || (window.LP = {});
LP.lib = LP.lib || {};

LP.lib.time = function(){
  'use strict';

  function totalFrames(book){
    let a = 0;
    for(let i = 0; i < book.sheets.length; i++) a += book.sheets[i].dur;
    return a;
  }
  function sheetStart(book, idx){
    let a = 0;
    for(let i = 0; i < idx && i < book.sheets.length; i++) a += book.sheets[i].dur;
    return a;
  }
  /* 作品 t → { i, sheet, local, start }（econte cutIndexAt と同じ。範囲外は端に寄せる） */
  function sheetAt(book, t){
    const n = book.sheets.length;
    if(!n) return null;
    let acc = 0;
    const tt = Math.max(0, Math.floor(t));
    for(let i = 0; i < n; i++){
      const d = book.sheets[i].dur;
      if(tt < acc + d) return { i: i, sheet: book.sheets[i], local: tt - acc, start: acc };
      acc += d;
    }
    const last = book.sheets[n - 1];
    return { i: n - 1, sheet: last, local: last.dur - 1, start: acc - last.dur };
  }

  function plateLen(plate){
    let a = 0;
    for(let i = 0; i < plate.cells.length; i++) a += Math.max(1, plate.cells[i].dur | 0);
    return a;
  }
  /* 層の紙内フレーム local → プレートのセル番号（-1＝何も出さない）。
     layer は { tIn, tOut, tOffset, step, clip } を持つもの（LAYER そのもの／REF の参照）。
     ★ SPEC_20 の k = floor((t - offset) / step) を**ここ1か所だけ**に置く
       （animator で renderRefLayer と animTickImg の式がずれて「中央ボタンが黙った」再発防止） */
  function cellIndexAt(plate, layer, local){
    if(!plate || !plate.cells.length) return -1;
    if(local < (layer.tIn || 0)) return -1;
    if(layer.tOut != null && local >= layer.tOut) return -1;
    const step = Math.max(1, layer.step | 0 || 1);
    const n = plateLen(plate);
    let k = Math.floor((local - (layer.tOffset || 0)) / step);
    if(layer.clip && (k < 0 || k >= n)) return -1;   // 参照（REF）：尽きたら出さない（SPEC_20 §1-5。ループしない）
    if(plate.loop) k = ((k % n) + n) % n;
    else k = Math.max(0, Math.min(n - 1, k));
    for(let i = 0; i < plate.cells.length; i++){
      k -= Math.max(1, plate.cells[i].dur | 0);
      if(k < 0) return i;
    }
    return plate.cells.length - 1;
  }

  /* 表記：秒+コマ（econte fmtDur と同じ。48f @24 → "2+00"） */
  function fmtDur(f, fps){
    f = Math.max(0, Math.round(f));
    return Math.floor(f / fps) + '+' + String(f % fps).padStart(2, '0');
  }

  return { totalFrames, sheetStart, sheetAt, plateLen, cellIndexAt, fmtDur };
};
LP.time = LP.lib.time();
