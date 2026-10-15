# CLAUDE.md — LIVE PLATE（`live-plate/`）

SPEC_21 の一本化アプリ。**1つの BOOK に 4つの見方（01 SHEET / 02 DRAW / 03 TAKE / 04 SHOW）**。
仕様は [../SPEC_21_LIVE_PLATE.md](../SPEC_21_LIVE_PLATE.md)、決めたこと・仕様から変えたことは同 **§15（P0）・§16（P1）・§17（P2）**。

**状態（2026-09-26）: P0 骨格＋ P1 SHEET（コマ割り・仕上げ素材・文字）＋ BOOK zip ＋ P2 DRAW 実装済み。**
P2＝ペン／消し／バケツ（線が壁・1px 潜る）／投げ縄／スポイト・線／塗レーン・セル（足す・複製・長さ）・オニオン・REF・SEL 変形（WARP・COPY/PASTE）・
タイル Undo・SEQ PNG 4択・旧 ANIMATOR_v1 の読み込み。SHEET は「選んでいる物を優先して掴む・重なりの1つ下」と右ペイン2列（SHEETS｜◆ITEMS）。
次は P3 TAKE（カメラ・MP4）。P2 の残り（セル一覧 GRID・iPad）は SPEC_21 §17-4。

## 開き方

- `index.html` を **file:// で直接開いて動く**（古典スクリプト・相対パスのみ・CDN はフォントだけ）
- ローカルサーバ：`Projects/.claude/launch.json` の **`live-plate`（port 8148・ANIxOBNxCOM 直下を配信）** →
  `http://localhost:8148/live-plate/index.html`
- ⚠ python http.server はキャッシュ指示を出さないので、**JS を直したのに古いまま動く**ことがある。
  Claude のブラウザで確かめるときは、ページ上で全 script/css を `fetch(src,{cache:'reload'})` してから `location.reload()`。
- 検証窓：`index.html?harness=1`（IndexedDB を読まない・書かない。`__HARNESS__` がフィクスチャを組む）

## ファイル（1ファイル 2,000 行が上限の目安。超えたら分ける）

| ファイル | 役割 | 触るときの約束 |
|---|---|---|
| `index.html` | DOM と script タグ（src）の列だけ | **読み込み順に意味がある**（core（time→geom→items→render→panels…）→ ui → mode → input → io → viewer → app → harness）。コメントに山かっこ付きの script を書かない（check.js がタグとして拾う） |
| `css/theme.css` | :root の色（**SPOTLIGHT のみ**）・ボタン・`.step`・`.fpanel`・`.qd-*`・toast・confirm | 色は変数経由。canvas の色は `LP.ui.CVC`（widgets.js） |
| `css/app.css` | グリッド配置・ペイン・ステージ・タイムライン・ドック・設定 | ドックはステージに**重ねない**（OBAN との違い） |
| `js/core/model.js` | BOOK / SHEET / LAYER / PLATE の工場・`clone`（Blob は参照のまま）・`migrate`・置く大きさ | |
| `js/core/time.js` | `LP.lib.time`：`sheetAt` `cellIndexAt` `fmtDur` … | ★ **ビューアに文字列で同梱される**。外（LP・DOM・Blob）を参照しない |
| `js/core/geom.js` | `LP.lib.geom`：コマの幾何（`clipHalf` `rebuildPanel` `dispPoly`＝断ち切り `sortPanels` `cutsOf`…） | ★ ビューアに同梱。manga-plate §v2-2 の式そのまま |
| `js/core/items.js` | `LP.lib.items`：仕上げ素材の描画（網・集中線・流線・枠・文字・ホワイト・ブラシ）・段（ITEM_BAND）・乗算 | ★ ビューアに同梱。網は画面上の間隔 < 3px なら平らな塗り |
| `js/core/render.js` | `LP.lib.render`：**`renderFrame(ctx, book, t, view)`** 1本。合成順＝地 →〔コマの層→素材〕→枠線→〔枠の上〕 | ★ 同上。画像は `view.img(cell, lane)` だけで受け取る。重なり＝配列順（Z は視差だけ・止まった画は `persp/persp₀` で打ち消す） |
| `js/core/panels.js` | コマ割りの編集（`divide` `moveCut` `merge` `clearAll` `reframe` `regap`）・コマに合わせる・Z⇄定規 d | アプリ専用。**割っても見えている絵は消さない**（覆う層は両方の子へコピー／戻すと1枚に） |
| `js/core/history.js` | Undo／Redo は**1本の時系列**：book（BOOK のスナップショット）と px（02 DRAW の矩形タイル）を同じ列に 80手 | 操作の**後**に `LP.app.commit(label)`。描いた絵の Blob は `patchBlob` で**全スナップショットへ**＝BOOK の Undo が絵を巻き戻さない |
| `js/core/paint.js` | `LP.paint`：AA なしの画素の道具（`fillCircleRows` `bresenham` `line` `floodFill`（壁＝線 α≥128・潜り）`lassoFill` `polyMask`） | animator の式そのまま。state を読まない（canvas と色は引数） |
| `js/core/cells.js` | 02 DRAW の**編集バッファ**（セル×レーンのプレート原寸 canvas・LRU 16）・Blob への書き戻し（`flush`）・矩形タイル Undo（`txBegin/txTouch/txEnd/txAbort`） | `LP.cache.img` はバッファを先に見る＝描いた瞬間の絵が全部の見方に乗る。**保存・書き出し・BOOK zip の前に `flush()`**。塗レーンは最初に塗るまで作らない |
| `js/core/store.js` | IndexedDB `live_plate_db_v1`（book / blobs / assets）＋ ビットマップ常駐（LRU・1GB） | `HARNESS_ON` では読まない・書かない。持ち出しは BOOK zip（book-zip.js）。`save` は先に `cells.flush` |
| `js/ui/widgets.js` | toast / modalConfirm / パネル移動・リサイズ・▾ / qd-* / 数値スクラブ / CVC | |
| `js/ui/stage.js` | ステージの見方・視点（紙座標／プレート座標）・パン／ズーム。01 SHEET のポインタは `LP.sheetTools`、02 DRAW は `LP.drawTools` へ渡す。02 の手すり（筆の輪・投げ縄・浮いた形）は `#cv-ov` に別に描く | 全ポインタは `#stage` で一元化。**02 DRAW で指（touch）は描かない＝移動** |
| `js/mode/sheet.js` | 01 SHEET の道具：SEL（素材／コマ）・DIV・EDIT・TEXT・TONE・白（投げ縄）とオーバーレイ（コマ番号・分割線・投げ縄） | Wクリック／2連打＝モード（`toggleMode`）。レールの Wクリックは自前で数える。**掴むのは選んでいる物が優先**（`hitArt`）・選んでいる物の上でもう一度クリック／Alt＋クリック＝重なりの1つ下 |
| `js/mode/draw.js` | 02 DRAW の道具：PEN・ERASE・FILL（バケツ／投げ縄／投げ縄消し）・EYE・レーン・セル（足す・複製・消す・長さ）・オニオン（`view.mid`）・REF（`view.under`）・＋ 描く層 | 描く先＝選んだ層の「いまのセル」（`cellIndexAt`）。道具×レーンは SPEC_20 §1-2。prefs は `liveplate_draw_v1`（一時モードは覚えない） |
| `js/mode/draw-sel.js` | 02 DRAW の SEL：持ち上げて変形（箱+rot+warp・AA OFF は `flBakeNearest`・COPY/PASTE） | animator gFloat の移植。持ち上げ〜確定で Undo 1手／取消は `txAbort`。他の操作へ移る前に `settle()` |
| `js/ui/timeline.js` | ルーラー・SHEET 行（尺ドラッグ）・REF 行（参照の帯）・線／塗の行（セル・右端＝長さ）・レーン見出し（◉🔒）・プレイヘッド | ドラッグ中は DOM を作り直さない |
| `js/ui/sides.js` | 素材棚（タイルを紙／タイムラインへドラッグ）・右は**2列 SHEETS｜◆ITEMS（列ごとに ≡ で畳む）** | 行の Wクリックは自前で数える（`lastTap`）。描いた絵が Blob になったら `refreshPlate` |
| `js/ui/detail.js` | 詳細パネル（U）と **SCR（数値の定義）**。層／素材（種類ごとの DEFS）／コマ／紙＋コマ割りの設定 | ドックの SIZE / OPACITY も同じ SCR。文字を打っている間は作り直さない |
| `js/ui/dock.js` | ステップごとのドック | 未実装フェーズの道具は `later:'P1'` などで**押せない札付き**で並べる |
| `js/ui/settings.js` | ⚙：BOOK（名前・⇩ BOOK 保存・⇧ BOOK 開く・NEW BOOK）・キー一覧と再割当 | |
| `js/input/keymap.js` | `SHORTCUT_ACTIONS` ＋ `gKeymap`（`liveplate_keymap_v1`）。`step` スコープ（01／02 で同じキー）・SPEC_17 の押し方（`dbl` `hold` `shift` `spring`） | **実在する操作だけ**登録。id は改名しない |
| `js/io/import.js` | 画像・連番の取り込み（D&D・ファイル選択・Ctrl+V）。落とした場所で行き先が決まる | 取り込みは順番待ち（`queue`） |
| `js/io/book-zip.js` | BOOK zip（保存・開く）と依存ゼロの zip 読み書き | 開く＝置き換え（確認あり） |
| `js/io/import-legacy.js` | `openAny`（zip／JSON を見分ける）・旧 MANGA_BOOK_v2 → 新しい紙・**旧 ANIMATOR_v1（PROJECT_v1）→ プレート＋新しい紙** | 他の旧形式（PROJECT_v2 / ECONTE / OBAN）は P3 |
| `js/io/export-html.js` | HTML ビューア書き出し・出口の設定（`exportState`：html／seq） | 描画コードは `LP.lib.*.toString()` で同梱（time / geom / items / render。書き写さない） |
| `js/io/export-seq.js` | SEQ PNG（合体 frames/・線 line/・塗 fill/・線+塗）を ZIP／フォルダへ | `renderFrame` の `view.pass`（そのレーンだけ・透明の地）。欠けた画は書かない（デコード待ち） |
| `viewer/template.js` | ビューアの雛形（スクロール → t・チャプター・ローダ） | 合成の式を書かない |
| `js/app.js` | 状態（`LP.state`）・ステップ・再生・BOOK の操作・起動 | いまの紙＝プレイヘッドの紙 |
| `js/harness.js` | `window.__HARNESS__`（SPEC_08） | フィクスチャは canvas に直接描く（アプリの関数で組まない） |

## 変えない約束（SPEC_21 §2 の実装側の言い方）

1. **BOOK が唯一のデータ。** `LP.state` は「いまどこを見ているか」だけ。送る／取り込む／同期は作らない。
2. **描画は `renderFrame` 1本。** ステージ・SHEETS のサムネ・PLAY・HTML ビューア・VRT が全部これを通る。
   新しい見え方を足すときは `view.mode` を足すか、既存モードの上に UI を重ねる（合成を別に書かない）。
3. **セル番号の式は `time.js` の `cellIndexAt` 1か所。** タイムラインの線の行もこれで並べている。
4. **Undo で戻せる操作は聞かない**（トースト）。戻せないのは NEW BOOK と ⇧ BOOK 開く（置き換え）だけ＝ modalConfirm。

## 検証

- `node tools/check.js`（リポジトリ直下）— live-plate は **HTML＋src 列を1単位**で検査（1本ずつの構文・つないだ構文・配線・重複・未参照関数）
- `cd verify && npm run verify:liveplate` — 決定論 VRT 8コマ（960×540。C4＝コマ割りの紙）。契約と負のコントロールは [../verify/CLAUDE.md](../verify/CLAUDE.md)
