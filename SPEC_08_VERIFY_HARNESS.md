# SPEC_08 — VERIFY HARNESS（単一HTML検証キット）

DeepResearch ①〜④ を1本の運用に統合した、単一HTMLツール用の自動検証システムの源泉仕様。
実装の正準は `VERIFY_HARNESS/`、配布はスキル `single-html-verify`（`single-html-verify.skill`）。
**仕様を変えるときはまずこのファイルを改訂し、`version` を上げる。**

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
  harness/inject.js       決定論注入（先に注入）
  harness/perf.js         WebGL/Canvas2D共通のperf収集
  harness/contract.md     window.__HARNESS__ 契約
  harness/runner.mjs      統合ランナー（サーバ＋VRT＋予算＋JSON）
  harness/api-mock.mjs    ④ 録画再生＋劣化系注入（汎用）
  schema/result.schema.json  統合結果スキーマ(draft-07)
  examples/               契約実装済みの動くCanvas2D＋config
```

## ロードマップ

- **v1（実装済 2026-07）**: 契約API・決定論・統合runner・VRT・Canvas2D/WebGL予算・統合スキーマ・
  APIモックレシピ・動くサンプル。純JS（決定論/pixelmatch/bbox/スキーマ）は自己テスト通過。
- **未（実機依存）**: Playwright e2eの実走（`npx playwright install chromium` 後）。既存ツール
  （SCROLL_*_LP / OBAN_BUILDER / Camera Map Fx 等）への契約埋め込みは各ツール着手時に。
- **将来**: ④の実API面が決まったら極小プロキシ＋実ストリーミング検証を具体化。
