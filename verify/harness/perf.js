/* =====================================================================
 * PERF COLLECTOR (single-html-verify)
 * ---------------------------------------------------------------------
 * ページ内に注入し、WebGL / Canvas2D / DOM のどれでも同じ形の
 * パフォーマンス指標を集める。runner から window.__PERF__ を叩く。
 *
 * - WebGL   : window.__HARNESS__.info() があれば drawCalls/triangles/… を採る
 *             （Three.js renderer.info を info() から返す契約。VRAMは常に「推定値」）
 * - 共通    : long-animation-frame(LoAF) を PerformanceObserver で数える
 *             （trace の FramePresented 等はChrome版で名前が変わるため、
 *               バージョン非依存のLoAFを一次情報にする）
 * - メモリ  : measureUserAgentSpecificMemory()（要 cross-origin isolation）を
 *             best-effort。無ければ performance.memory.usedJSHeapSize
 *             （精度は --enable-precise-memory-info 起動時のみ担保）
 * ===================================================================== */
(function () {
  'use strict';
  if (window.__PERF__) return;

  var t0 = (window.performance && performance.now) ? performance.now() : 0;
  var firstFrameAt = null;
  var loaf = [];   // long animation frame durations (ms)

  try {
    if (typeof PerformanceObserver !== 'undefined') {
      var po = new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (e) { loaf.push(e.duration); });
      });
      // long-animation-frame が使えない環境では longtask にフォールバック
      try { po.observe({ type: 'long-animation-frame', buffered: true }); }
      catch (e) { try { po.observe({ type: 'longtask', buffered: true }); } catch (e2) {} }
    }
  } catch (e) {}

  function markFirstFrame() {
    if (firstFrameAt == null) {
      firstFrameAt = (window.performance && performance.now) ? performance.now() : 0;
    }
  }

  function rendererInfo() {
    try {
      if (window.__HARNESS__ && typeof window.__HARNESS__.info === 'function') {
        return window.__HARNESS__.info() || null;
      }
    } catch (e) {}
    return null;
  }

  function heapBytes() {
    try {
      if (window.performance && performance.memory && performance.memory.usedJSHeapSize) {
        return performance.memory.usedJSHeapSize;
      }
    } catch (e) {}
    return null;
  }

  function measureMemory() {
    // 非同期。cross-origin isolated なページでのみ有効。
    try {
      if (window.performance && typeof performance.measureUserAgentSpecificMemory === 'function') {
        return performance.measureUserAgentSpecificMemory()
          .then(function (r) { return r && r.bytes; })
          .catch(function () { return heapBytes(); });
      }
    } catch (e) {}
    return Promise.resolve(heapBytes());
  }

  function snapshot() {
    var info = rendererInfo();
    return measureMemory().then(function (memBytes) {
      var loafSorted = loaf.slice().sort(function (a, b) { return b - a; });
      return {
        timeToFirstFrameMs: firstFrameAt != null ? Math.round(firstFrameAt - t0) : null,
        longAnimationFrames: loaf.length,
        longestFrameMs: loafSorted.length ? Math.round(loafSorted[0]) : 0,
        totalBlockingMs: Math.round(loaf.reduce(function (s, d) { return s + Math.max(0, d - 50); }, 0)),
        jsHeapBytes: heapBytes(),
        measuredMemoryBytes: memBytes || null,
        renderer: info // {drawCalls, triangles, textures, geometries, vramBytesEstimate} or null
      };
    });
  }

  window.__PERF__ = {
    version: 1,
    markFirstFrame: markFirstFrame,
    snapshot: snapshot
  };
})();
