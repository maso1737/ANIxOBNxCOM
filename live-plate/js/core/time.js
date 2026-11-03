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

  /* ---------- カメラ（TAKE。SPEC_21 §5 / §6-4 / §19） ----------
     kf = { id, f, hold, x, y, z, rot, s, ei, eo, dwell }
       f    … 紙の中のフレーム（カメラがこの KF に着く時刻）
       hold … 着いてから止まっているコマ数（0＝着いたらすぐ次へ）
       x,y  … カメラの中心＝紙の中央からのずれ（紙 px）。z＝ドリー（px・正＝前へ）。rot＝度。s＝ズーム（1＝基準の窓）
       ei/eo… composer の influence（0〜100）。eo＝この KF から出る側・ei＝この KF に入る側
       dwell… AUTO のときの「止まり」の重み（OBAN buildTake の dwell）
     ★ 式は composer getKfValue / bezierEaseT と同じ（AE 風 cubic-bezier(eo,0,1-ei,1)）。hold だけ「コマ数」に読み替えた */
  const CAM0 = { x: 0, y: 0, z: 0, rot: 0, s: 1 };
  const CAM_KEYS = ['x', 'y', 'z', 'rot', 's'];
  function bezierEaseT(t, x1, x2){
    if(t <= 0) return 0;
    if(t >= 1) return 1;
    let u = t;
    for(let i = 0; i < 8; i++){
      const iu = 1 - u;
      const x = 3 * iu * iu * u * x1 + 3 * iu * u * u * x2 + u * u * u;
      const dx = 3 * iu * iu * x1 + 6 * iu * u * (x2 - x1) + 3 * u * u * (1 - x2);
      if(Math.abs(x - t) < 1e-5) break;
      if(dx > 1e-6) u -= (x - t) / dx;
      else break;
      u = Math.max(0, Math.min(1, u));
    }
    return u * u * (3 - 2 * u);
  }
  function camOf(k){
    const o = {};
    for(let i = 0; i < CAM_KEYS.length; i++){ const p = CAM_KEYS[i]; o[p] = k && k[p] != null ? +k[p] : CAM0[p]; }
    return o;
  }
  /* 紙の中のフレーム local → カメラ（KF が無い＝既定の窓） */
  function kfAt(take, local){
    const kf = take && take.kf;
    if(!kf || !kf.length) return camOf(null);
    if(kf.length === 1 || local <= kf[0].f) return camOf(kf[0]);
    const last = kf[kf.length - 1];
    if(local >= last.f) return camOf(last);
    for(let i = 0; i < kf.length - 1; i++){
      const A = kf[i], B = kf[i + 1];
      if(local < B.f){
        const h = Math.max(0, A.hold || 0), f0 = A.f + h;
        if(local <= f0 || B.f <= f0) return camOf(A);
        let t = (local - f0) / (B.f - f0);
        t = bezierEaseT(t, (A.eo || 0) / 100, 1 - (B.ei || 0) / 100);
        const a = camOf(A), b = camOf(B), o = {};
        for(let j = 0; j < CAM_KEYS.length; j++){ const p = CAM_KEYS[j]; o[p] = a[p] + (b[p] - a[p]) * t; }
        return o;
      }
    }
    return camOf(last);
  }
  /* AUTO：KF の並び＝順番だけ決めて、紙の尺 dur を「止まり（dwell）」と「移動（距離から）」の重みで配る（OBAN buildTake）。
     kf[].f / kf[].hold を**書く**。base＝カメラの基準の窓（紙 px） */
  function travelW(A, B, base){
    const a = camOf(A), b = camOf(B);
    const d = Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, base.w) * 2
      + Math.abs(b.s - a.s) / Math.max(0.05, Math.max(a.s, b.s)) * 1.5
      + Math.abs(b.rot - a.rot) / 45 + Math.abs(b.z - a.z) / 400;
    return Math.max(0.25, Math.min(2.2, d));
  }
  function layoutTake(take, dur, base){
    const kf = take && take.kf;
    if(!kf || !kf.length) return;
    const segs = [];
    for(let i = 0; i < kf.length; i++){
      segs.push(Math.max(0.05, kf[i].dwell == null ? 1 : +kf[i].dwell));
      if(i < kf.length - 1) segs.push(travelW(kf[i], kf[i + 1], base));
    }
    let W = 0;
    for(let i = 0; i < segs.length; i++) W += segs[i];
    let acc = 0;
    const edge = [0];
    for(let i = 0; i < segs.length; i++){ acc += segs[i]; edge.push(Math.round(acc / W * dur)); }
    for(let i = 0; i < kf.length; i++){
      kf[i].f = edge[i * 2];
      kf[i].hold = Math.max(0, edge[i * 2 + 1] - edge[i * 2] - (i === kf.length - 1 ? 1 : 0));
    }
  }

  /* 画ブレ（econte SPEC_16 §5-C5 の式そのまま）。sheet.shake = { a0, a1, freq }
     a0/a1＝頭／尻の強さ 0〜100（直線で変わる）・freq＝1秒あたりの揺れ。揺れ幅＝**いま写っている窓の幅**の割合（寄っても画面上の揺れは同じ）。
     値はコマ番号と紙の id から決まる（乱数なし）＝何度再生しても書き出しても同じ揺れ */
  const SHAKE_MAX = 0.045, SHAKE_FREQ_DEF = 8;
  function shakeOf(sheet){
    const s = sheet && sheet.shake;
    if(!s) return null;
    const a0 = Math.max(0, Math.min(100, s.a0 | 0)), a1 = Math.max(0, Math.min(100, s.a1 | 0));
    if(!a0 && !a1) return null;
    return { a0, a1, freq: Math.max(1, Math.min(24, s.freq || SHAKE_FREQ_DEF)) };
  }
  function shSeed(id){
    id = String(id || '');
    let h = 2166136261;
    for(let i = 0; i < id.length; i++){ h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) % 100000;
  }
  function shHash(n){ const v = Math.sin(n * 12.9898) * 43758.5453123; return v - Math.floor(v); }
  function shNoise(x, seed){
    const i = Math.floor(x), f = x - i;
    const a = shHash(i + seed), b = shHash(i + 1 + seed);
    const u = f * f * (3 - 2 * f);
    return (a + (b - a) * u) * 2 - 1;
  }
  function shNoise2(x, seed){ return shNoise(x, seed) * 0.75 + shNoise(x * 2.17, seed + 31) * 0.25; }
  /* 戻り値＝カメラのずれ（紙 px）。winW＝いま写っている窓の幅（紙 px） */
  function shakeAt(sheet, local, winW, fps){
    const s = shakeOf(sheet);
    if(!s) return null;
    const t = Math.max(0, Math.min(1, local / Math.max(1, sheet.dur - 1)));
    const amp = s.a0 + (s.a1 - s.a0) * t;
    if(amp <= 0.01) return null;
    const k = amp / 100 * SHAKE_MAX * Math.max(1, winW);
    const ph = local / (fps || 24) * s.freq, seed = shSeed(sheet.id);
    return { dx: k * shNoise2(ph, seed), dy: k * shNoise2(ph, seed + 977) * 0.8 };
  }

  return { totalFrames, sheetStart, sheetAt, plateLen, cellIndexAt, fmtDur,
    CAM0, CAM_KEYS, bezierEaseT, camOf, kfAt, layoutTake, travelW, shakeOf, shakeAt, SHAKE_FREQ_DEF };
};
LP.time = LP.lib.time();
