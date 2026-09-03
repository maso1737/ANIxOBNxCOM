# CLAUDE.md — Animation Paint（ANI × OBN × COM）

ブラウザベースの日本アニメ作画特化エディタ群。**ANI**mator（作画）× **OB**a**N**（モーションコミック）× **COM**poser（合成/書き出し）の3ツール。単一HTMLで完結、IndexedDB自動保存、Chrome / iPad Safari 対応。

## ファイル構成（リポジトリ直下）

アプリ本体（単一HTML）:
- `animator.html` — メインの作画エディタ（実体。最重要）
- `oban-builder.html` — OBAN BUILDER **SPECIAL EDITION（新UI・既定）**。モーションコミック製造機（画像→PLACE→TAKE→単一HTMLビューア書き出し）。パイプライン上は animator と composer の間。
  UI リデザイン版（ゲーム風・操作明快）で、**描画エンジン（canvas / TAKE / DOF / 書き出し）は従来版と同一**。3テーマ切替あり。UI 規約は `OBAN_BUILDER_UI_HANDOVER.md`
- `oban-builder-classic.html` — 従来UI版（差し替え前の実体を温存）。**エンジンも `localStorage['oban-project']` も共通**なので、作業中のプロジェクトのまま行き来できる。
  相互リンク: 新UI = ⚙ SETTINGS ▸ FILE／連携 の `CLASSIC UI`（`#b-classic`）／ 従来版 = `#bar-right` の `NEW UI`（`#b-se`）
- `composer.html` — マルチトラック合成（カメラ/キーフレーム/書き出し）
- `manga-plate.html` — **MANGA PLATE v2。漫画ページ＆コマ割り**（ジャンプ規定B4 600dpi・多角形コマの縦/横/斜め分割・コマ内マスク・境界効果・ページ一覧・**左右見開き作業**・グレー→網点。SPEC_09 §v2 / §v2-6b）
- `econte.html` — ECONTE。プリプロ（紙ネーム写真→BOARD切り出し→SHEET絵コンテ→加筆。SPEC_10。パイプライン上は animator の前）
- `brush-lab.html` — **BRUSH LAB（TOOL MECHANICS LAB_05）。econte にブラシを増やす前の設計レビュー用ラボ**。
  PENCIL/MARKER/FLAT/AIR/GLOW/GRIT の6プリセット＋Procreate風パラメータ23個＋筆先PNGのドロップ。
  PAINT / SPLIT（**econte 現行の硬い丸ペンと並べて比較**）/ SHEET の3モード。
  **他の MECHANICS 系ラボと違って本体がここにあるのは、iPad の入口が GitHub Pages だから**
  （リポジトリ外への相対リンクは Pages で 404）。パラメータ表・実測表・**移植の契約**は
  [LP_motion-graphics/TOOL_MECHANICS/BRUSH_LAB/CLAUDE.md](../LP_motion-graphics/TOOL_MECHANICS/BRUSH_LAB/CLAUDE.md)。
  **econte へ焼き込む前に必ず読む4点**（① plan は1区間1回・draw は枚数ぶん ② 配る枠は `plan.bbox` で決める
  ③ `txTouch` にも `plan.bbox` を渡す ④ 線モードの濃度<1 は1本まとめて合成）。
  検証フック `window.__BLAB__`（`crossCheck()` / `bench()` / `ripple()` / `wiring()`）
- `index.html` — ランディングページ。**カード8枚**（01 ANIMATOR / 02 OBAN / 03 COMPOSER / 04 ECONTE / 05 MANGA PLATE / 06 INBETWEEN WARP LAB / 07 LINK MAP / 08 BRUSH LAB）
- `link-map.html` — **LINK MAP。アプリ間の連携マップ**（GLOSSテーマ・ノード5つと10ルート。
  矢印/ノードをクリックで手順が出て、やってみたらチェック→全部で CLEAR。進捗は `localStorage['linkmap_done_v1']`）。
  **中身は `GUIDE_MANGA_LINKS.md` と同じ情報＝連携を変えたら両方直す**
- `inbetween_lab.html` / `inbetween_warp_lab.html` — 中割り実験ラボ
- `tools/check.js` — 依存ゼロのスモークチェック（構文/配線/ID重複/デッドコード）。**対象は `FILES` 配列。HTMLを足したらここにも足す**（brush-lab.html 追加済み）
- `verify/` — VERIFY HARNESS（決定論VRT＋パフォーマンス予算。SPEC_08）。
  **ANIMATOR / COMPOSER / OBAN BUILDER 実装済み**。詳細は [verify/CLAUDE.md](verify/CLAUDE.md)

ドキュメント（ハンドオーバー／仕様）:
**まず読む3枚:**
- **`ROADMAP.md`** — これからやること1枚（残タスク・抜け・プログラム的な注意点）。**新しい作業はまずここ**
- **`DOC_NOTES.md`** — 下の各ドキュメントの詳細メモ。**その SPEC に着手する前に該当項目を読む**
  （「★ ◯◯を変えたら △△ も直すこと」という**二重管理の申し送りがそこにしか無い**ものがある）
- **`PIPELINE.md`** — 入口/出口フォーマット表。**入出力を変えたら必ず更新**。新ルート探しはここから

実装メモ（深掘りはこちら）:
`ANIMATOR_HANDOVER.md` / `COMPOSER_HANDOVER.md` / `OBAN_BUILDER_HANDOVER.md` /
`OBAN_BUILDER_UI_HANDOVER.md`（新UIの規約） / `ECONTE_HANDOVER.md`

**`DEPTH_PLATE_HANDOVER.md` — 4本目の道具「見えがかり特化2.5D」の構想（2026-09-04・実装前）。**
モーションコミックの「一瞬3D化」を作る。概念設計は固まり、**次は試作ラボ5本のうち LAB A か LAB D から**。
調査9本（`_Research/DEPTH_PLATE/`）の要点はこの1枚に写してあるので、**原文は開かなくてよい**。

手順書（人間向け・ボタン名で追える）:
`GUIDE_MANGA_LINKS.md` … ANIMATOR⇄MANGA PLATE⇄OBAN/COMPOSER。**連携ボタンの表記を変えたら更新**
`link-map.html` … 上の内容を絵にしたもの（5アプリ・10ルート。ECONTE だけ未接続＝破線）。**同じく表記変更で更新**

仕様（SPEC）— 状態は 2026-09-02 時点:

| SPEC | 対象 | 状態 |
|---|---|---|
| `SPEC_01_OBAN_TAKE_RIG` | 大判カメラのTAKE編集（OBANの元仕様） | 実装済（P2 = OBAN BUILDER） |
| `SPEC_05_OBAN_BUILDER_V2` | OBAN BUILDER V2 拡張 | 実装済 |
| `SPEC_06_SATSUEI_KIT` | 撮影処理キット（fx共通スキーマ） | 実装済。正準はスキル `satsuei-fx-kit` |
| `SPEC_07_ANIMATOR_OBAN_BRIDGE` | animator⇄OBAN 連番往復 | 実装済（animator は改修ゼロが大原則） |
| `SPEC_08_VERIFY_HARNESS` | 決定論VRT＋perf予算 | animator / composer / oban 実装済。**econte・manga-plate は未** |
| `SPEC_09_MANGA_PLATE` | 漫画ページ＆コマ割り（v1=素材／v2=ページ） | **進行中**（最新 §v2-15・2026-09-02） |
| `SPEC_10_ECONTE` | econte 原設計（`cuts[]` 単一データ） | P0+P1 実装済／**P2 は要判定**（後発が引き取った可能性） |
| `SPEC_11_COMPOSER_POLISH` | COMPOSER 磨き込み | **P0〜P7 完了・残なし**。イーズは他ツールの正準 |
| `SPEC_12_PARALLAX_TAKE_BRIDGE` | 連携ズレ解説機 | **P0/P1/P2 未着手**。実装先は `LP_motion-graphics/PARALLAX_LAB/` |
| `SPEC_13_ECONTE_V2` | STUDIO 1画面統合 | 完了。**§9（画面の役割）は現役——着手前に読む** |
| `SPEC_14_TIMELAPSE` | 作画タイムラプス | **P0〜P2 完了・残なし** |
| `SPEC_15_ECONTE_V3` | ペイントの一本化 | 完了。**P1 の一部は SPEC_16 で撤去済＝経緯として読む** |
| `SPEC_16_ECONTE_V4` | 枠ごとの画（`cut.fr[k]`） | **残り §5-D（iPad）だけ** |
| `SPEC_17_INPUT_GRAMMAR` | 操作文法の統一（キーの押し方） | animator / econte / manga-plate 済／**OBAN 未** |
| `SPEC_18_IPAD_GRAMMAR` | iPad 操作文法（実機測定値） | P0・P1(composer) 済／**P2 スキル化・P3 横展開 未** |
| `MOTION_COMIC_SPEC` | composer モーションコミック | Phase 1〜3 済／**Phase 4〜5 要判定** |
| `EXPORT_WEB_SPEC` | スクロールビューアHTML書き出し | 実装済 |
| `申し送り_MANGA_PLATE_to_OBAN_TEXT.md` | 読み文字の往復 | P0〜P2 済。残っている選択肢だけ書いてある |

スキル（`.claude/skills/` — このフォルダ配下で作業するときだけ有効）:
`animator-color-palette`（FILLパレット＋Altスポイト） / `animator-ref-overlay`（参照画像＋FRAME下絵） /
`composer-timeline-kit`（ショートカット登録・座標規約・WA・マーカー・KFコピペ） /
`floating-panel-kit`（パネル移動・▾最小化・項目スナップ・高さフィット・前面制御） /
`animator-brush-ops`（右ドラッグでサイズ・PEN/FILL/ERASEのWクリック・FILL長押しで投げ縄・Altスポイト・TAB）。
いずれも animator/composer の実装が正準。**最終照合 2026-08-10**（実コードと突き合わせ済み）。
実装を大きく変えたら、対応するスキルの references も同じコミットで直すこと。

> ⚠ **`.claude/` は `.gitignore` 済み＝スキルは git に乗らない。**
> 2台目PCへは手動コピーが要る（`_Claude/SKILL/` に配布パッケージを置く運用）。

GitHub: https://github.com/maso1737/ANIxOBNxCOM
Pages: https://maso1737.github.io/ANIxOBNxCOM/

## 残タスク・予定タスク一覧（Claude Artifact）

https://claude.ai/code/artifact/a57e3c0b-064f-4e1b-97d2-a158602ab07b

各SPEC/HANDOVERを横断した「まだ終わっていないもの」の棚卸しページ。
**新チャットでこのページを更新するときは、必ず上のURLを Artifact ツールの `url` に渡すこと**
（渡さずに新規publishすると別URLが発行され、ここのリンクが古くなる）。

## トップバー右端の並び（3ツール共通・2026-08-13）

**プロジェクト入出力は必ず ⚙ の左隣**。ツールを渡り歩いても同じ場所にあるようにする。

```
… [プロジェクト入出力] [⚙ 設定] [⛶ 全画面] [HOME]      ← HOME は常に一番右
```

| ツール | 入出力ボタン | 備考 |
|---|---|---|
| `manga-plate` | EXPORT JSON / IMPORT JSON | 880px以下は `⇩JSON`/`⇧JSON` に短縮（iPad縦でHOMEまで届くこと） |
| `oban-builder`（新UI） | ⇧ EXPORT JSON / ⇩ IMPORT JSON | **⚙ SETTINGS ▸ FILE／連携** の中（バーには置かない） |
| `oban-builder-classic` | EXPORT JSON / IMPORT JSON | `#bar-right` の中 |
| `econte` | ⇩ PROJ / ⇧ PROJ | **ZIP**なので表記は PROJ のまま（形式が違うものを同じ名前にしない） |

`animator` / `composer` は入出力の性格が違う（ANIMATOR_v1・PROJECT_v2・連番・動画）ので**この並びには揃えない**。

## 変更後に必ず行うチェック
```
node tools/check.js
```
6ファイル（animator / oban-builder / composer / index / manga-plate / econte）すべての 構文 / JS→HTML の id 配線 / id 重複 / 未参照関数 を一括検査（問題があれば exit 1）。※type属性の無い `<script>` のみJS扱い（`type="application/json"` 等のデータブロックは除外）。実機確認は Pages か `file://` で。

**描画・合成まわりを触ったら、続けて見た目の回帰検査も走らせる**（SPEC_08）:
```
cd verify && npm run verify:animator
cd verify && npm run verify:composer
cd verify && npm run verify:oban
```
コマ送り6点を作業解像度そのままで撮って前回の承認済み画像と比較する（PASS=0%）。
意図した変更で差分が出たら `UPDATE_BASELINE=1 node harness/runner.mjs verify.<tool>.config.json` で承認。
`artifacts/summary.json` だけ読めば合否と崩れた位置が分かる。詳細は [verify/CLAUDE.md](verify/CLAUDE.md)。

## デプロイ
- `animator.html` / `composer.html` を直接編集 → 構文チェック → **明示依頼があったときのみ** master に commit & push。
- コミットメッセージ末尾に:
  `Co-Authored-By: Claude <noreply@anthropic.com>`

## 開発スタイル
- 単一HTMLで完結。外部依存は CDN（JSZip 等）のみ。
- 変更は Edit（差分）で最小限に。全書き換えは避ける。
- 短いプロンプト＋即実行。push は依頼時のみ。
- 大きい/不可逆な変更（キャンバスのピクセルパイプライン等）や性能トレードオフがある場合は、先に方針を確認。

## アーキテクチャ要点
- **解像度**: `CFG.WORK_W/WORK_H` は**可変**（左上ラベル/設定パネルで変更。上限≒4K面積 `CFG.MAX_AREA`）。各コマは `drawData`(Uint8ClampedArray, W×H×4)。書き出しは作業解像度そのまま。
- **レイヤー**(canvas, すべて WORK サイズ): bg / ref / frame / onion×2 / draw / guide。`setupCanvas()` で一括リサイズ、`applyZoom()` で表示スケール＋`renderGuides()`。
- **state**: ツール/ズーム/frames/再生/guides など一元管理。タイムライン履歴は `tlHistory`、Undoは `gUndo/gRedo` の一元ログ。
- **保存**: IndexedDB（差分・debounce）。meta に workW/workH・guides・ワークエリア等。**DB v5**（v5で作画タイムラプス用の `tl_meta`/`tl_shot` を追加。作画データ側のストアは不変）。
- **ショートカット**: `SHORTCUT_ACTIONS` 登録制＋`gKeymap`(localStorage)。設定パネル⚙で再割当。
- **FILL PALETTE**: `gPalette`(localStorage `animator_palette_v1`)。スロット選択中にスポイトで上書き、＋/−/JSON入出力。
- **ライブ連携**: `BroadcastChannel('tdr_live')`。ANIMATOR保存→COMPOSERへ project-update。COMPOSERは projectId一致トラックの絵だけ差し替え（KF/transform保持）。`→ COMPOSER` は別ウィンドウで開く。**OBAN も同じチャンネル・同じ語彙に参加**（animator から見ればもう1つの composer。詳細は SPEC_07）。
- **ガイド**: 解像度枠/セーフフレームは `guide-layer` に表示のみ（書き出し非合成）。
- **座標/入力**: 全ポインタ処理は `#stage` で一元化。`toCanvasCoord()` が flip/mirror 換算。

## 既知の制限
- ライブ連携は同一ブラウザ・同一オリジンのタブ間のみ。
- キャンバス拡大はメモリ×コマ数で増える（8Kは多コマ不可。上限4K面積）。

## 整理メモ（2026-07 統合時）
- 旧 `LP_motion-graphics/` から本フォルダへ統合。`oban-builder.html` は元 `OBAN_BUILDER/` から**ルート直下へフラット化**したため、SPEC_06/07 中の `OBAN_BUILDER/oban-builder.html` という記述は本フォルダでは `oban-builder.html` に読み替える。
- LP 個別プロジェクト（SCROLL_*_LP 等）や AP 非関連の SPEC_02/03/04 は `_済/` に退避済み。
