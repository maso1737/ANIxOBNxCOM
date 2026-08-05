/* =====================================================================
 * DETERMINISM INJECT (single-html-verify)
 * ---------------------------------------------------------------------
 * 目的: 実行のたびに描画結果が変わる「非決定性」を排除する。
 *   - 乱数     : Math.random を SFC32 シード固定PRNGへ差し替え
 *   - DPR固定  : devicePixelRatio を 1.0 に固定（v2 3-3）
 *   - 仮想時間 : Date / performance.now を仮想クロックへ差し替え
 *   - rAF      : requestAnimationFrame を手動ステップ制御へ差し替え
 *   - 準備待ち : フォント / 画像デコード完了を待つ ensureRenderReady
 *
 * 【最重要】このファイルはアプリ本体のスクリプトより「先」に走らないと、
 *   ライブラリが Math.random / Date の参照を先に捕まえて無効化する。
 *   - CLI(Playwright)   : page.addInitScript({ path: 'harness/inject.js' }) で注入する
 *   - ブラウザ完結(file://): <head> の一番最初の <script> として貼る
 *
 * バッククォート・</script> 文字列を含めない（テンプレート注入互換のため）。
 * ===================================================================== */
(function () {
  'use strict';
  if (window.__DET__) return; // 二重注入ガード

  // アプリ側の自律rAFループを止めるフラグ（各ツールは !__TEST_MODE__ の時だけ自走する契約）
  window.__TEST_MODE__ = true;

  var SEED = 'motion_comic_deterministic_seed';

  /* ---- 1. 乱数シード固定（SFC32） -------------------------------- */
  function injectSeededRandom(seedString) {
    var h = 1779033703 ^ seedString.length;
    for (var i = 0; i < seedString.length; i++) {
      h = Math.imul(h ^ seedString.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    var seed = function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
    var a = seed(), b = seed(), c = seed(), d = seed();
    Math.random = function () {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      var t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
  }
  injectSeededRandom(SEED);

  /* ---- 1b. devicePixelRatio を 1.0 に固定（v2 3-3） --------------- */
  // 実機のDPR(2.0等)でbaselineとactualの解像度がズレると全画面差分になる。
  try {
    Object.defineProperty(window, 'devicePixelRatio', { get: function () { return 1.0; }, configurable: true });
  } catch (e) {}

  /* ---- 2. 仮想クロック（Date / performance.now） ----------------- */
  var vt = 0; // virtual time (ms)
  var OriginalDate = Date;
  var VDate = function (a1, a2, a3, a4, a5, a6, a7) {
    if (!(this instanceof VDate)) return new OriginalDate(vt).toString();
    switch (arguments.length) {
      case 0: return new OriginalDate(vt);
      case 1: return new OriginalDate(a1);
      default: return new OriginalDate(a1, a2, a3, a4, a5, a6, a7);
    }
  };
  VDate.prototype = OriginalDate.prototype;
  VDate.now = function () { return Math.floor(vt); };
  VDate.parse = OriginalDate.parse;
  VDate.UTC = OriginalDate.UTC;
  window.Date = VDate;

  if (window.performance) {
    try { window.performance.now = function () { return vt; }; } catch (e) {}
  }

  /* ---- 3. requestAnimationFrame の手動ステップ化 ----------------- */
  var rafCbs = new Map();
  var rafId = 0;
  window.requestAnimationFrame = function (cb) { var id = ++rafId; rafCbs.set(id, cb); return id; };
  window.cancelAnimationFrame = function (id) { rafCbs.delete(id); };

  function step(ms) {
    if (ms == null) ms = 16.666;
    vt += ms;
    var active = Array.from(rafCbs.entries());
    rafCbs.clear();
    for (var i = 0; i < active.length; i++) {
      try { active[i][1](vt); } catch (e) { /* keep stepping */ }
    }
    return vt;
  }

  /* ---- 4. 描画準備完了の同期（フォント / 画像デコード） ---------- */
  function ensureRenderReady() {
    var jobs = [];
    if (document.fonts && document.fonts.ready) jobs.push(document.fonts.ready);
    var imgs = Array.prototype.slice.call(document.querySelectorAll('img'));
    imgs.forEach(function (img) {
      if (img.complete) {
        jobs.push(img.decode ? img.decode().catch(function () {}) : Promise.resolve());
      } else {
        jobs.push(new Promise(function (res) {
          img.addEventListener('load', res, { once: true });
          img.addEventListener('error', res, { once: true });
        }));
      }
    });
    return Promise.all(jobs);
  }

  /* ---- 公開API --------------------------------------------------- */
  window.__DET__ = {
    version: 1,
    seed: SEED,
    step: step,                 // 仮想時間をmsだけ進め、その瞬間のrAFを消化
    now: function () { return vt; },
    setTime: function (ms) { vt = ms; },
    ensureRenderReady: ensureRenderReady
  };
})();
