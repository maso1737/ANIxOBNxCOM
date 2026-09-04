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

## ANIxOBNxCOM への適用（2026-08-05）

本リポジトリ側の実装は `verify/`。**ANIMATOR / COMPOSER / OBAN BUILDER が契約を実装済み**で、
Playwright e2e が実機で通っている（3本とも Pass1 6コマすべて 0.000% ／ Pass2 予算内）。
運用・設計判断・予算の実測値は [verify/CLAUDE.md](verify/CLAUDE.md) が生きたドキュメント。

要点だけ:

- `harness/` `schema/` は正準 `LP_motion-graphics/VERIFY_HARNESS/` からの**無改造コピー**。
- **撮影対象は画面の見た目ではなく、作業/コンポ解像度そのまま(1:1)で合成した `#harness-shot`。**
  ビューのズームやウィンドウサイズに左右されず、1pxの差がそのまま差分になる。両ツール共通の型。
- **「保存しない窓」でのみ動く**安全装置つき（フィクスチャが現在の作業を捨てるため）。
  ANIMATOR=`?ro=1`（既存の別窓フラグを流用）／ COMPOSER=`?harness=1`（新設・autosave3経路を封鎖）。
- ANIMATOR: 決定論フィクスチャ（`H_FIX` / `hDrawTestArt`）で**描画プリミティブを踏む**。
  `frameAtTick()` を再生ループから切り出して `seek()` と共有（tick→コマの定義をひとつに）。
- COMPOSER: 生成した PNG data URL を `loadJSON()`（PROJECT_v2）に流し、**IMPORT経路ごと**検証。
  トラック構成 BG/CHAR/NULL/FG/CAMERA で Z・親・別解像度・空セル・イーズ3種・パララックスを踏む。
  `drawFrame()` を直接叩くため **FXチェーン（SATSUEI）は現状カバー外**。
- OBAN BUILDER: ステージ＝ウィンドウなので `VW/VH/DPR` と `cv` サイズをフィクスチャで固定してから撮る。
  TAKE走行の6点で 台形quadマスク・内部パララックス・IN演出・drift・連番送り・whiteoutワイプ・
  KF窓テキストを踏む。**PLACE編集ビューではなく `mode='take'`＋`PV.on` の出力側**を撮ること。
- ECONTE（2026-09-03 実装）: **撮る面が2つある**（TIMELINE出力＝`drawCamFrame` ／ GRIDセル＝`drawCellFrame`）。
  契約に面を選ぶ引数は無いので、**`seek(t)` の t で撮り分ける**（`t>=10000` でセル側）。t→状態の写像は
  こちらの自由なので契約違反ではない。フィクスチャは FIX / **T.U** / **PAN** / 投げ縄 / 空 の5カット。
  ★ **フィクスチャを「アプリの関数で組み立てて同じ関数で描く」と対称性で穴が空く。**
  econte は塗りも描画も `camBakeRect` を通るため、それをずらす負のコントロールが**自己相殺して素通り**した。
  座標マッピングを通らない絵（`ehPatchMarks`）を混ぜて初めて 8/9 が落ちるようになった。
  **他ツールへ広げるときも、必ず片側だけを通る素材を混ぜること。**
- 撮影キャンバスは **1280×720 を超えない**こと（runner はビューポート既定のまま `locator.screenshot()`
  するので、`position:fixed` の要素は下が切れる）。

## ロードマップ

- **v1（実装済）**: 契約API・決定論・統合runner・VRT・予算・スキーマ・APIモック・動くサンプル。
- **v2（実装済 2026-07）**: 上記§v2 一式。純JS（決定論/pixelmatch/bbox/スキーマ/framemd5解析/逆乗算）は
  自己テスト通過。ブラウザ無し環境では @napi-rs/canvas で2パス合否フローを再現確認済み。
- **Playwright e2e実走（実機確認済 2026-08-05 / econte 2026-09-03）**: ANIMATOR / COMPOSER / OBAN BUILDER / ECONTE で2パス通し。
  chromium は `chromium_headless_shell-1228`（playwright 1.61.1 固定）。
- **未**: manga-plate（**保留で確定**＝SPEC_09 v2 が出力を変えている最中）、COMPOSER の FXチェーン（SATSUEI）検証、
  OBAN 書き出しビューア（`viewerHTML`）の検証。LP側の既存ツール（SCROLL_*_LP / Camera Map Fx 等）も同様。
- **将来**: ④実API面が決まれば極小プロキシ＋実ストリーミング検証を具体化。
