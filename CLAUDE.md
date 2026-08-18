# CLAUDE.md — Animation Paint（ANI × OBN × COM）

ブラウザベースの日本アニメ作画特化エディタ群。**ANI**mator（作画）× **OB**a**N**（モーションコミック）× **COM**poser（合成/書き出し）の3ツール。単一HTMLで完結、IndexedDB自動保存、Chrome / iPad Safari 対応。

## ファイル構成（リポジトリ直下）

アプリ本体（単一HTML）:
- `animator.html` — メインの作画エディタ（実体。最重要）
- `oban-builder.html` — OBAN BUILDER。モーションコミック製造機（画像→PLACE→TAKE→単一HTMLビューア書き出し）。パイプライン上は animator と composer の間
- `composer.html` — マルチトラック合成（カメラ/キーフレーム/書き出し）
- `manga-plate.html` — **MANGA PLATE v2。漫画ページ＆コマ割り**（ジャンプ規定B4 600dpi・多角形コマの縦/横/斜め分割・コマ内マスク・境界効果・ページ一覧・**左右見開き作業**・グレー→網点。SPEC_09 §v2 / §v2-6b）
- `econte.html` — ECONTE。プリプロ（紙ネーム写真→BOARD切り出し→SHEET絵コンテ→加筆。SPEC_10。パイプライン上は animator の前）
- `index.html` — ランディングページ（**OBAN 追加予定**）
- `inbetween_lab.html` / `inbetween_warp_lab.html` — 中割り実験ラボ
- `tools/check.js` — 依存ゼロのスモークチェック（構文/配線/ID重複/デッドコード）
- `verify/` — VERIFY HARNESS（決定論VRT＋パフォーマンス予算。SPEC_08）。
  **ANIMATOR / COMPOSER / OBAN BUILDER 実装済み**。詳細は [verify/CLAUDE.md](verify/CLAUDE.md)

ドキュメント（ハンドオーバー／仕様）:
- `ANIMATOR_HANDOVER.md` — animator 実装メモ／設計履歴（深掘りはこちら）
- `COMPOSER_HANDOVER.md` — composer 実装メモ
- `OBAN_BUILDER_HANDOVER.md` — OBAN BUILDER 実装メモ（旧 OBAN_BUILDER/CLAUDE.md）
- `ECONTE_HANDOVER.md` — econte 実装メモ（cuts[]共有ペイント・TIMELINE書き出しの注意点）
- `MOTION_COMIC_SPEC.md` / `EXPORT_WEB_SPEC.md` — モーションコミック／WEB書き出し仕様
- `PIPELINE.md` — 3ツールの入口/出口フォーマット表。**入出力を変えたら必ず更新**。新ルート探しはまずここ
- `SPEC_01_OBAN_TAKE_RIG.md` — 大判カメラTAKE化の元仕様（SPEC_01 P2 = OBAN BUILDER）
- `SPEC_05_OBAN_BUILDER_V2.md` — OBAN BUILDER V2 拡張仕様
- `SPEC_06_SATSUEI_KIT.md` — 撮影処理キット（fx共通スキーマ・composer/OBAN統合）
- `SPEC_07_ANIMATOR_OBAN_BRIDGE.md` — animator⇄OBAN 連番往復ブリッジ仕様
- `SPEC_09_MANGA_PLATE.md` — MANGA PLATE 仕様。**v1=パラメトリック素材（P0〜P4実装済）／§v2=ページ・コマ割りツール（2026-08-13 実装済）**。
  v2の要点: コマ＝多角形＋半平面クリップ分割（間隔は線の向きで lr/tb を補間）・`panelId` の有無だけで「コマ内マスク／枠の上」が決まる・
  **連携は `tdr_exchange`＋`tdr_live` に相乗りするだけで animator/composer/oban の改修ゼロ**・保存はIndexedDB（dataURLのため）
- `SPEC_10_ECONTE.md` — プリプロツール仕様（cuts[]単一データ・BOARD/SHEET/TIMELINE設計。P0+P1実装済み、P2=animator連携/カラースクリプト）
- `SPEC_13_ECONTE_V2.md` — ECONTE V2「STUDIO」仕様（1画面統合・BOARD強化・**大判カメラ枠列＋可変ベイク**・MP4書き出し・カラースクリプト・iPad操作。**V2-A〜D3・E1・E2(a〜d) 実装済み（2026-08-09）／残りは E3 フォトバッシュのみ**）。※§5は2026-07に差し替え済み（旧「のりしろ1.2x固定＋カメラプリセット」は廃止）。**画面の役割（STUDIO=プレビュー+コラージュ／EDIT=単票+カラースクリプト一覧）は §9 で確定済み。着手前に §9 を読む**
- `SPEC_15_ECONTE_V3.md` — **ECONTE V3「ペイントの一本化」。P1＋P3-1 実装済み（2026-08-18）／P3-2〜P3-4 は SPEC_16 §5-B として実装済み／残りは P2（フォトバッシュ）だけ**。
  ⚠ **P1 の `cut.plateC`（カット1枚）・`plateScale`・`plateSize` は SPEC_16 V4 で撤去済み**。以下は経緯として読むこと。
  P1=カラー層を「枠ごと・出力枠512×288」から**カット1枚・ベイク空間（`cut.plateC`）**へ一本化（line と同じ扱い＝T.U./PANに追従。`colorMixAt`/`drawColorFrame`/`drawColorPlate`/`frameAtBake`/`plateStrokeSeg` は削除済み。**座標は必ず `plateScale(cut)` を通す**——`PLATE_MAX` で頭打ちしたカットは 0.4 ではない）／
  P3-1=濃・描画モードは全体設定 `gPaint`（`UI_LS`＋ZIP `meta.paint`）——**P1で色から per-slot 値が消えるので同時にやるしかない**／
  **未着手**: P2=軽いフォトバッシュ（**`cut.layers[]` は不採用**・浮いた選択方式）／P3-2=描く先を画面で切り替えない／P3-3=ブラシ上限を1つに／P3-4=ラベル。
  戻り先タグ `econte-v2-g3`。**P1 の設計レビューは実物で先に見られる** → `LP_motion-graphics/TOOL_MECHANICS/SPACES_LAB/spaces-lab.html`
  （実装済み 2026-08-18・port 8141）。色の置き場所を「レンズ前 ⇄ セル上」で切り替えて、**寄りながら色が変わる／色が寄る**を同じ動きで見比べられる。
  `plateSize()`（P1-2 の寸法規則）もラボ側で先に動いていて、**B枠にちょうど512px当たる**ことを数値で確認済み。
  ラボは `calcBakeSize` / `strokeScaleFor` / `drawCamFrame` を econte から転載しているので、
  **P1 でこれらを変えたらラボ側も直す**（`SPACES_LAB/CLAUDE.md` の転載表を見る）
- `SPEC_16_ECONTE_V4.md` — **ECONTE V4「枠ごとの画」。§1〜§3＋§5-B＋E1＋§5-C(C1〜C4,C7〜C9) 実装済み（2026-08-18）**。
  画は **枠（`cam[k]`）ごとに1枚**（`cut.fr[k] = {line 1280×720, plate 512×288, rect}`。`cam[]` と1対1・`ensureFr()` を必ず通す）。
  写真（`baseC`）だけ全枠で共有。パッチは **紙（ベイク空間）の上に `camBakeRect(cut,k)` の位置で置く**ので
  T.U./PAN に追従する（V3-P1 の土台のまま＝旧V2のフェードには戻らない）。描画の入口は **`drawPatchStack()` 1本**。
  **§2a は (b)＋入れ子（T.U./T.B.）のときだけ下を隠す**＝`patchHides()`（PANは重ねるだけ）。
  **GRIDのセル／SHEETサムネ／C.SCRIPT は `drawCellFrame()`＝自分の枠のパッチだけ**（§3-3）。
  その帰結で「Aセルには描けるが TIMELINE では B が総取りする」領域ができるので、**Aセルに破線で出す**（`drawTakeoverGuide`）。
  ブラシ補正（旧 `strokeScaleFor`）は**消えた**——パッチが出力等倍なので `brush` px がそのまま出力px＝GRIDでまたいでも同じ太さ。
  保存は IndexedDB `cut.fr[]` ／ ZIP **`ver:4`**（`cuts/<id>.f<k>.line.png` / `.plate.png`）。ver3・ver2 は読み込み時に変換。
  **E1**: ペイントUndoは**変更した矩形だけ**（`txBegin`/`txTouch`/`txEnd`）＝12手 → **80手**。EDIT の Undo は1本化（`gColorLog`）。
  **§5-B**: 描く先/ブラシ上限は画面移動で変えない・**econte だけ FILL 廃止で常時投げ縄**（スキルは触らない意図的逸脱）・
  ペンはスライダー等を掴まない・パレット縦3行・CUTSは目アイコンのみ。
  **残り: §5-C の C5（画ブレ）/ C6（イーズAE準拠）/ C10（読み戻し）と §5-D（iPad）**
- `SPEC_11_COMPOSER_POLISH.md` — COMPOSER磨き込み仕様（**P0〜P7 すべて実装済み**。残タスクなし。P7=出力解像度のアスペクト保持／のりしろ1.2／Zソート／フォルダ書き出し／タイムライン時間軸ズーム）
- `SPEC_14_TIMELAPSE.md` — ANIMATOR 作画タイムラプス仕様（自動記録・専用ストア tl_shot・リングバッファ・**WORK/CELL 2通りの見せ方**・WebM書き出し。**P0〜P2 すべて実装済み。残タスクなし**（P3=区間トリム等は任意・将来））
- `SPEC_12_PARALLAX_TAKE_BRIDGE.md` — PARALLAX_LAB×OBAN/COMPOSER **連携ズレ解説機**仕様（TAKE JSONを貼ると同一カメラワークを ①OBAN撮影台／②COMPOSER Zドリー／③COMPOSER SCL で並べて再生。「なぜそのまま繋ぐとズレるか」を見て触って理解する道具）。**実装先は `LP_motion-graphics/PARALLAX_LAB/`**、本リポジトリ側は `planeZoom`/`pf`/`buildComposerJSON` を変えたらSPECの数値表を更新する義務のみ。P0/P1/P2未着手。**2026-08-15 に `planeZoom` 新式・COPY FOR COMPOSER 実装済みを反映して全面改訂**（§1にズレの実測表・§9に数値テストスクリプト）

スキル（`.claude/skills/` — このフォルダ配下で作業するときだけ有効）:
`animator-color-palette`（FILLパレット＋Altスポイト） / `animator-ref-overlay`（参照画像＋FRAME下絵） /
`composer-timeline-kit`（ショートカット登録・座標規約・WA・マーカー・KFコピペ） /
`floating-panel-kit`（パネル移動・▾最小化・項目スナップ・高さフィット・前面制御） /
`animator-brush-ops`（右ドラッグでサイズ・PEN/FILL/ERASEのWクリック・FILL長押しで投げ縄・Altスポイト・TAB）。
いずれも animator/composer の実装が正準。**最終照合 2026-08-10**（実コードと突き合わせ済み）。
実装を大きく変えたら、対応するスキルの references も同じコミットで直すこと。

> ⚠ **`.claude/` は `.gitignore` 済み＝スキルは git に乗らない。**
> 2台目PCへは手動コピーが要る（`_Claude/SKILL/` に配布パッケージを置く運用）。

GitHub: https://github.com/maso1737/animation-paint
Pages: https://maso1737.github.io/animation-paint/

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
| `oban-builder` | EXPORT JSON / IMPORT JSON | `#bar-right` の中 |
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
