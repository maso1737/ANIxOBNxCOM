# テスト契約API（`window.__HARNESS__`）

1つのハーネスで全ツール（Canvas2D / WebGL / DOM / スクロール）を回すための最小の共通面。
**各ツールHTMLがこれを実装していれば、runner はツールの中身を知らずに検証できる。**
実装しないツールは検証対象から外れるだけで、通常動作には一切影響しない。

## 契約

```js
window.__HARNESS__ = {
  version: 1,
  kind: 'canvas2d',          // 'canvas2d' | 'webgl' | 'dom' | 'scroll'
  canvas: '#stage',          // スクショ対象セレクタ。省略時はページ全体
  ready() { return Promise; },// アセット/フォント読込・初期化完了で解決
  seek(t) { /* ... */ },      // 状態を時刻 t(ms) に決定的にセット（スクロール系は仮想スクロール量でも可・要記述）
  render() { /* ... */ },     // 現在状態を1回だけ同期描画（次フレームを待たない）
  info() { return { /* ... */ }; } // 任意。無ければ null 扱い
};
```

### 各メンバの規約

- **`kind`** — 予算プロファイルの選択に使う（webgl はドローコール/三角形/VRAM、それ以外はLoAF中心）。
- **`canvas`** — WebGL/Canvas は描画先要素を指定。DOM/スクロール系は省略しページ全体を撮る。
- **`ready()`** — `Promise` を返す。内部で `window.__DET__.ensureRenderReady()` を必ず待つこと。
- **`seek(t)`** — **時刻→状態が純関数**であること（同じ t なら必ず同じ状態）。ここが決定論の要。
  `Date.now()`/`performance.now()` は注入済み仮想クロックを指すので、そのまま使ってよい。
- **`render()`** — `seek` で作った状態を即描画。WebGLは末尾で `gl.finish()`（連番の取りこぼし防止）。
- **`info()`** — WebGLは Three.js の値を返す:
  ```js
  info() {
    const m = renderer.info.memory, r = renderer.info.render;
    return {
      drawCalls: r.calls, triangles: r.triangles,
      textures: m.textures, geometries: m.geometries,
      // WebGLRenderer は VRAM実バイトを持たない → 常に推定値
      vramBytesEstimate: m.geometries*100*1024 + m.textures*2048*2048*4
    };
  }
  ```

## 自律ループとの両立

各ツールは通常の自走ループを **`if (!window.__TEST_MODE__) { ...requestAnimationFrame... }`** で囲む。
注入時に `__TEST_MODE__=true` になるので、テスト時は自走せず runner の `seek/render` だけで進む。

## 最小テンプレート（Canvas2D）

```js
window.__HARNESS__ = {
  version: 1, kind: 'canvas2d', canvas: '#stage',
  ready: () => window.__DET__ ? window.__DET__.ensureRenderReady() : Promise.resolve(),
  seek(t) { state = computeStateAt(t); },   // t→状態は純関数
  render() { draw(ctx, state); },
  info: () => null
};
if (!window.__TEST_MODE__) requestAnimationFrame(loop);
```

## WebGL / Three.js r170 テンプレート（v2 3-2）

決定論の底上げのため、レンダラは **`antialias:false` / `preserveDrawingBuffer:true`** で生成し、
色空間は **sRGB に統一**する（baselineも同じ）。`ready()` で GLTF/Texture ロード・`initTexture`・
`compileAsync`（frustumバイパス）まで待ってからでないと、初回描画でシェーダコンパイルのスタールが混入する。

```js
// renderer生成側（ツール本体）:
// renderer = new THREE.WebGLRenderer({ antialias:false, preserveDrawingBuffer:true });
// THREE.ColorManagement.enabled = true; renderer.outputColorSpace = THREE.SRGBColorSpace;

window.__HARNESS__ = {
  version: 1, kind: 'webgl', canvas: '#stage',
  ready: async () => {
    if (window.__DET__) await window.__DET__.ensureRenderReady();       // フォント/画像
    await new Promise((res) => {                                        // GLTF/Texture等
      const prev = THREE.DefaultLoadingManager.onLoad;
      THREE.DefaultLoadingManager.onLoad = () => { prev && prev(); res(); };
      if (window.__ASSETS_DONE__) res();   // ロード物が無いツールは即解決
    });
    scene.traverse((o) => { if (o.isMesh && o.material.map && renderer.initTexture) renderer.initTexture(o.material.map); });
    const saved = [];
    scene.traverse((o) => { if (o.isMesh) { saved.push([o, o.visible, o.frustumCulled]); o.visible = true; o.frustumCulled = false; } });
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera); // 全マテリアル事前コンパイル
    saved.forEach(([o, v, f]) => { o.visible = v; o.frustumCulled = f; });
    // ★ compileAsync中に outputColorSpace / toneMapping を書き換えない（同期再compileが走る）
  },
  seek(t) { state = computeStateAt(t); },
  render() { renderer.render(scene, camera); renderer.getContext().finish(); }, // gl.finish()で連番取りこぼし防止
  info() { const r = renderer.info.render, m = renderer.info.memory;
    return { drawCalls: r.calls, triangles: r.triangles, textures: m.textures, geometries: m.geometries }; }
};
```

## 色空間・透過の落とし穴（v2 3-5）

- **色空間はsRGBに統一**。書き出しRTやrendererの `outputColorSpace` が NoColorSpace/Linear のままだと
  暗く沈む。baseline も同一色空間で撮ること。二重ガンマ補正も禁物。
- **透過PNGを `readPixels` から作る場合、premultiplied を straight に逆乗算してからエンコード**
  （エッジの黒フリンジ対策）。`canvas.toBlob` 経由ならブラウザが処理するので不要。実装は
  `references/export-verify.mjs` の `unpremultiply`。

## 2パス実行での注意（v2 3-1）

- **Pass1（決定論VRT）** は inject 注入で `__TEST_MODE__=true`。DPRは1.0固定。ツールは自走せず
  runner の `seek/render` だけで進む。
- **Pass2（実perf）** は inject を注入しない＝実クロック。ツールは `!__TEST_MODE__` で自走するので、
  自走ループを必ず `if(!window.__TEST_MODE__){…}` で囲んでおくこと（これが無いとPass2で回らない）。
- **GLバックエンドの鉄則**: baselineとactualは必ず同一バックエンド。可搬にするなら
  `HARNESS_GL=swiftshader` で baseline生成・比較の両方を揃える。
