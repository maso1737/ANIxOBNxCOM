# SPEC_08 — VERIFY HARNESS（単一HTML検証キット）  version: 2

DeepResearch ①〜⑥ を1本の運用に統合した、単一HTMLツール用の自動検証システムの源泉仕様。
実装の正準は `VERIFY_HARNESS/`、配布はスキル `single-html-verify`（`single-html-verify.skill`）。
**仕様を変えるときはまずこのファイルを改訂し、`version` を上げる。**

> **v2（2026-07・現行）**: 「2パス分離・WebGL決定論・エクスポート整合性」を統合。
> 前提環境 = Windows / RTX 4070 SUPER / 単一HTML / file:// / Three.js r170。下の §v2 が最新の確定内容。

## 何を解決するか

インタラクティブ教材・VJ素材は「動くか」より「滑らか・毎回同じ」が品質そのもの。
それを人手のスクショ比較でなく、**数値で・決定論的に・AIエージェントが読める形で**判定する。
ビルドステップ無し、依存は `playwright / pixelmatch / pngjs` の3つだけ。

## 4本の柱（研究の対応）

- **① 承認ベースVRT ＋ アニメ決定論** — Golden Image比較。差分は「バグ」でなく「変更の検出」、
  開発者が承認すると baseline を上書き。決定論は乱数シード固定・仮想クロック・rAF手動ステップ。
- **② WebGL / Three.js ＋ ヘッドレス描画** — ephemeralサーバで file:// のCORSを回避、実GPU(EGL/ANGLE)
  かSwiftShaderを起動フラグで切替。`renderer.info` を契約経由で採取。
- **③ 決定論 ＋ パフォーマンスバジェット** — Done定義に数値目標（TTFF・フレーム落ち・メモリ増加）。
  ※②とほぼ重複するため独立ドキュメント化はせず、**②のWebGL経路＋Canvas2D/DOM経路を共通予算で束ねた**。
- **④ 生成AI / API連携デモ検証** — 非決定レスポンスを録画再生で決定化、429/timeout/途中切断/壊れJSON
  を注入して堅牢性を確認（構想段階のため汎用レシピとして収録）。

## 1本化の要 — テスト契約API

各ツールHTMLが `window.__HARNESS__ = { version, kind, canvas, ready, seek, render, info }` を実装すれば、
runner はツールの中身を知らず同じ手順で検証できる。未実装のツールは対象外になるだけ（通常動作に影響なし）。
自走ループは `if(!window.__TEST_MODE__){…}` で囲む。詳細 `VERIFY_HARNESS/harness/contract.md`。

## Done定義（合否バジェット・初期値）

環境で基準を変える。数値は `verify.config.json` で上書き可。

| 指標 | 開発機(RTX 4070 SUPER) | CIフォールバック(SwiftShader) | 備考 |
|---|---|---|---|
| 画像不一致率 | 0%（同一機・同一GPU） | ≤ 0.15% | AAは `includeAA:false` で無視 |
| 平均FPS | ≥ 59.5 | ≥ 15.0 | traceでなくLoAFを一次情報に |
| フレーム落ち率 | ≤ 0.5% | ≤ 8.0% | 長フレーム(>50ms)を計上 |
| 最大ドローコール | ≤ 100 | ≤ 40 | WebGLのみ(`info()`) |
| 最大ポリゴン | ≤ 1,000,000 | ≤ 100,000 | WebGLのみ |
| 最大VRAM | ≤ 512MB | ≤ 128MB | WebGLは**推定値のみ** |
| 初回描画(TTFF) | ≤ 400ms | ≤ 1200ms | |

## 研究稿から実装時に直した点（重要）

1. **pixelmatch `includeAA` は `false`（既定）が正**。AAを無視したいのに `true` にすると逆に
   AA画素を差分計上して偽陽性が増える。runnerは `includeAA:false` 固定。
2. **`renderer.info.memory.total` はWebGLRendererに無い**。VRAMは常に推定値として扱う。
3. **traceのフレームイベント名(`FramePresented`等)はChrome版依存で壊れやすい**。
   バージョン非依存の `PerformanceObserver('long-animation-frame')` を一次情報にし、
   メモリ増加は `measureUserAgentSpecificMemory()`→`performance.memory` のbest-effort。
4. **決定論モックはアプリ本体より先に注入**。CLIは `addInitScript`、file://は先頭`<script>`。
5. **APIキーは file:// に置けない**。実API時は ephemeralサーバを極小プロキシに拡張、既定は録画再生。

## ファイルマップ

```
VERIFY_HARNESS/
  harness/inject.js        決定論注入（先に注入・DPR=1固定含む）
  harness/perf.js          WebGL/Canvas2D共通のperf収集（Pass2）
  harness/contract.md      window.__HARNESS__ 契約（Canvas2D/WebGL/色空間/2パス注記）
  harness/runner.mjs       2パス統合ランナー（Pass1=VRT / Pass2=perf）
  harness/api-mock.mjs     録画再生＋劣化系注入（汎用）
  harness/export-verify.mjs 連番PNG検証（framemd5＋連続性＋逆乗算）  ← v2新規
  harness/context-loss.md  コンテキストロスト手動復旧の参照            ← v2新規
  schema/result.schema.json 統合結果スキーマ(draft-07)
  examples/                契約実装済みの動くCanvas2D＋config
```

## §v2 — 確定版の統合内容（2026-07）

対象環境 Windows/RTX4070S/単一HTML/file:///Three.js r170 で採否を判定済み。

**採用して実装**:
- **2パス分離**（runner）— Pass1=決定論VRT（inject有・perf取らない）、Pass2=実クロックperf
  （inject無・別ブラウザ・LoAF＋renderer.infoピーク実測）。①「仮想時間とperfの矛盾」を根本解決。
- **DPR=1固定**（inject.js）— 実機DPRズレによる全画面差分を防ぐ。
- **Three.js版 ready()**（contract.md）— GLTF/Texture待ち＋`initTexture`＋`compileAsync`(frustumバイパス)。
  レンダラは `antialias:false / preserveDrawingBuffer:true / outputColorSpace=sRGB`。
- **framemd5＋mpdecimate**（export-verify.mjs）— 連番PNGの内容/順序/欠け/重複を機械検証。goldenは数KB。
- **色空間統一＋straight alpha逆乗算**（export-verify.mjs / contract.md）— 透過PNGの黒フリンジ対策。
- **GLバックエンド**: SwiftShaderを可搬デフォルトに維持、実GPU確認は`--use-gl=angle`。
  **鉄則: baselineとactualは必ず同一バックエンド**。
- **コンテキストロスト**: 手動 dispose＋再生成（context-loss.md）。テストは`WEBGL_lose_context`で誘発。

**条件付き**: BlazeDiff（`@blazediff/core-wasm` ~32KB, 4Kでpixelmatch比 約5倍）は
ブラウザ完結(A)で高速化したい時だけBase64インライン。SSIM/知覚差分は「怪しいフレームだけ」二段構え。

**不採用**（この環境に過剰/不適）: Mesa llvmpipe（Linux/CI専用）、r183 RenderPipeline移行（実質WebGPU化）、
OTel/Tesults MCP/マルチエージェント（単一開発者に過剰）。

## Done定義（v2適用後）

DPR=1固定 / runner2パス分離＋summaryマージ / WebGLは`antialias:false`+`preserveDrawingBuffer`+sRGB /
`ready()`がGLTF・compileAsyncを待つ / baseline・actualが同一GLバックエンド /
PNG書き出しにframemd5 golden＋連続性チェック / 透過がstraight alpha / 変更後は`node --check`＋exampleで通し。

## ロードマップ

- **v1（実装済）**: 契約API・決定論・統合runner・VRT・予算・スキーマ・APIモック・動くサンプル。
- **v2（実装済 2026-07）**: 上記§v2 一式。純JS（決定論/pixelmatch/bbox/スキーマ/framemd5解析/逆乗算）は
  自己テスト通過。ブラウザ無し環境では @napi-rs/canvas で2パス合否フローを再現確認済み。
- **未（実機依存）**: Playwright e2e実走（`npx playwright install chromium` 後）。既存ツール
  （SCROLL_*_LP / OBAN_BUILDER / Camera Map Fx 等）への契約埋め込みは各ツール着手時に。
- **将来**: ④実API面が決まれば極小プロキシ＋実ストリーミング検証を具体化。
