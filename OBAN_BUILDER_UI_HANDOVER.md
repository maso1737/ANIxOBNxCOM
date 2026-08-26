# OBAN BUILDER — UI リデザイン 申し送り

対象ファイル: `oban-builder.html`（単一HTML・5,677行）
このセッションでやったのは **UI の見た目と操作の統一 + デッドコード削除** のみ。
描画エンジン（canvas / TAKE / DOF / 書き出し）のロジックには手を入れていない。

---

## 1. 配色・テーマ

- `body[data-theme]` で 3 テーマ切替。`THEMES = ['GLOSS','SPOTLIGHT','ROUGE']`（既定 GLOSS）。
- 選択は `localStorage['oban-theme']` に保存。`applyTheme(t, quiet)` が唯一の入口。
  切替 UI は ⚙ SETTINGS 内の `.set-theme`（`data-theme` 属性のボタン）。
- 色は必ず変数経由。ハードコードの hex を足さないこと。
  - `--acc` / `--accRGB` … 主アクセント
  - `--acc2` / `--acc2RGB` … 明るい方（数値・NOW 表示・ロゴのドット）
  - 派生: `--acc-border` / `--acc-hover-fill` / `--acc-hover-line` / `--acc-glow`
- **amber（`--amber:#FFC94F`）は廃止**。旧 FX＝アンバーの名残は全部消してある。
  唯一 canvas 内の DOF ピッカー中カーソル色に `'#FFC94F'` リテラルが残っている
  （`cx.fillStyle=dofPick?'#FFC94F':…`）。気になるならここも変数化してよい。
- GLOSS のときだけロゴのドットが `--acc2`（シアン）: `body[data-theme="GLOSS"] #bar .brand svg .pt`。

## 2. パネル構造（ここが今回の本体）

すべてのフローティングパネル／モーダルが同じ骨格になっている。**新しいパネルを足すときはこの形に合わせる。**

- ヘッダ **高さ 44px** 固定 + `backdrop-filter: blur()` + バッジ + `▾`（最小化）+ `✕`（閉じる）
- ヘッダをドラッグで移動 = `makePanelDraggable(panel, head)`
- 下端をドラッグで高さ調整 = `makePanelResizable(handle, body, '<行セレクタ>')`
- 最小化は `.mini` クラス（body / resize を隠す）
- 中身は共通クラス `.qd-*` で作る:
  - `qdSect(en, jp)` … セクション見出し
  - `qdRow(label, html, title, pos)` … 1行1項目
  - `qdSeg(act, items, cur)` … セグメント選択（`data-act` / `data-v`）
  - `qd-num` / `data-scr`・`data-kscr` … 左右ドラッグで数値変更
  - `.qd-sb` … 小ボタン、`.qd-note` … 補足文

登録済みパネル:

| id | 中身 |
|---|---|
| `#bar` | 上部バー（モード 01 PLACE / 02 TAKE / 03 EXPORT・詳細・⚙） |
| `#dock` | 下部コンソール。モードごとに中身が変わる（`renderDock()`） |
| `#qe` | DETAIL / QUICK EDIT。PLACE=選択オブジェクト、TAKE=選択KF |
| `#mon` | MONITOR（結果プレビュー窓） |
| `#fx-modal` | SATSUEI FX（撮影処理） |
| `#ap-modal` | ANIMATOR 連携 |
| `#set-ovl` | SETTINGS（テーマ・FILE/連携アクション） |

## 3. 削除したもの（復活させないこと）

旧 `#cards`「TAKE — CAMERA」パネルを完全撤去。機能は DETAIL と下部コンソールに一本化済み。

- DOM: `#cards` / `#cards-head` / `#cards-body` / `#cards-resize`
- CSS: `.edc*` `.edb*` `.dofstrip` `.dofpt` `.dof-pts` `.dof-h` `.dof-r` `.edc-grip` `.kfdrag*` `--amber`
- JS: `dofStripHTML()` `onDofStrip()` `dofSetLabel()` `renderDofPts()` `toggleCards()`、
  グリップ ⠿ の上下ドラッグ並べ替え、`#cards` への各種 addEventListener
- `renderCards()` は名前だけ残り、中身は **`renderDock()` + `renderKfDetail()` を呼ぶだけ**。
  既存の呼び出し箇所（`rebuild()` / `selectKf()` / undo など）が多いので関数名は維持した。

同等の操作は下部コンソールの FOCUS 側にある: DOF 定規（`data-dk="dof"`）／
「画面から取る」（`data-dk="dofpick"`）／点チップ／`data-dk="ease"` `"dwell"`。

## 4. DETAIL ⇄ 下部コンソールの同期

一方向だったものを双方向にした。**新しい項目を足すときは両方向を必ず張ること。**

- DETAIL の EASE 変更 → `renderKfDetail()` + `renderDock()`
- DETAIL の DWELL ドラッグ → ドラッグ中は `#dk-dwellv` のテキストだけ差し替え、
  離したら `renderKfDetail()` + `renderDock()`（`dkDrag` の第3引数）
- PLACE の画像サイズ（`h` / `tsize`）→ `QD_SCR` の `dock:1` と ± ボタンで `renderDock()`

理由: ドラッグ中に `renderDock()` を毎フレーム走らせると DOM を作り直して掴みが切れる。
**「ドラッグ中はテキストだけ・離したら全再描画」** がこのファイルの約束。

## 5. キーボード

- `1` / `2` / `3` … PLACE / TAKE / EXPORT
- `Space` … プレビュー再生・停止、`C` … CAPTURE（TAKE）
- **`Ctrl(⌘)+←` / `→` … 選択KFの順番入れ替え**（旧 `Ctrl+↑↓` から変更。
  ショートカット一覧・tooltip・コメントも全部更新済み）
- **`←` / `→` … KF選択の移動**（KFが横一列の SHOTS ストリップになったので横矢印が主。
  `↑` / `↓` も同じ動作の別名として残してある）
- `U` … DETAIL 開閉（**両モード共通に統一**。旧 TAKE の `U`=`toggleCards` は削除）
- `,` `.` `0` … 表示倍率／原寸中央、`Ctrl+Z` / `Ctrl+Shift+Z` `Ctrl+Y` … undo/redo
- `Ctrl+D` 複製、`M` マスク、`P` MONITOR、`T` CLICK FX、`F` FX パネル
- `Esc` の優先順位: モーダル > ピント取り消し > 選択解除

## 6. 触るときの注意

- インライン `<style>` 1枚 + インライン `<script>` 1枚の単一HTML。外部依存はフォント（Google Fonts）のみ。
- `scrollIntoView` は使わない方針（過去にレイアウトが崩れたため、旧カードの自動スクロールも削除済み）。
- 保存は `PROJECT` を localStorage へ。`commit()`=履歴に積む / `commitD()`=300ms デバウンス。
  スライダー系は必ず `commitD()`。
- undo は `restoreState()` → `renderCards()` / `renderChip()` / `syncFxBtn()`。
  新しい UI 状態を足したら、ここでの復元も忘れずに。
- `HARNESS_ON` が立っているときは localStorage に書かない（自動検証用）。

## 7. 未着手・気になる点 → **対応済み（2026-08-26）**

3件とも取り込み側で片付けた。以下は「何をどう決めたか」の記録。

### 7-1. amber リテラル → `--mark`

canvas は CSS 変数を直接読めないので、**テーマ変更時に実際の色を1回だけ拾う橋**を足した。

- `:root` に `--mark:#FFC94F`（テーマ不変の器側。`--acc*` の並びではない）
- JS 側は `const CVC={mark:…}` ＋ `syncCanvasColors()`。呼ぶのは `applyTheme()` の中だけ
- `#FFC94F` リテラルは **4箇所**あった（handoff が挙げた1箇所だけではない）:
  ワイプ発火点◇の線と文字 ／ 選択KFのピント旗 ／ ピック中のキャレット。全部 `CVC.mark` へ

**`--acc` / `--acc2` に寄せなかった理由**: canvas HUD は ice(`#5AE9FF`)＝KF・点、
桃(`#FF4FA8`)＝選択、白＝キャレット、という**固定の意味の色**で出来ている。
ここに `--acc2` を入れると GLOSS/SPOTLIGHT では ice と、ROUGE では選択の桃と近くなって
「どれが今見るべき点か」が読めなくなる。**役割で1色**を独立させ、変数経由という規約だけ満たした。
canvas に新しい色を足すときも、リテラルではなく `CVC` に並べること。

### 7-2. FX パネルのセクション分け

**縦に伸びていた原因は項目数そのものではなく、OFF の項目も全パラメータを開いていたこと**だった。
2段構えにした。

- `FX_SECTS` で CHAIN を役割別に3つへ割り、`qdSect()` の見出しを挟む
  （`BLUR & LINE` / `COLOR` / `FINISH`）。**実行順 `fxp.chain` は触っていない**——
  見出しを挟むだけ。keys に無い t は末尾の「その他」に出るので、足しても迷子にならない
- エフェクト1個ぶんを `.fx-g > .fx-hd + .fx-bd` に分け、`.fold` で `.fx-bd` を隠す。
  各ヘッダの `▾` で開閉。**OFF のものは既定で畳む**（既定を当てるのは `FX_FOLD_SEEN` で
  セッション1回だけ＝OFF のまま開いておいた項目を開き直すたびに畳まない）
- OFF→ON にしたら畳んだままにしない（押したのに何も出ない、を作らない）
- 畳み状態は `FX_FOLD`（Set・セッション限り）。**`PROJECT` には入れない**＝保存形式は不変

実測: パネル内容の高さ 2084px → **1528px（−27%）**。

新しいエフェクトを足すときの手順は §「FX_DEFS+FRAG+switch+default の4点セット」に
**`FX_SECTS` の keys へ足す**が1つ増える（忘れても「その他」に出るだけで壊れない）。

### 7-3. 44px ヘッダの `▾` / `✕`

素の文字に `padding:0 2px` だったので、実寸 15px 程度の的が 9px 間隔で並んでいた。

- 5パネル（`#qe` `#mon` `#fx-modal` `#ap-modal` `#set-ovl`）ぶんを**1つのルールでまとめて上書き**。
  28×28 の inline-flex 正方形＋hover で面が出る。ヘッダは 44px のままなので収まる
- `@media (max-width:900px),(pointer:coarse)` で 34×34（指の的の下限）
- 実測: 全パネルで 28×28 / 間隔 13px、狭い窓では 34×34 / 15px

**新しいパネルを足したら、このセレクタ列にも足すこと**（§2 の骨格に1行増えたと思えばいい）。

---

## 9. §3 の削除に伴う取りこぼし、もう1件 → **削除済み（2026-08-26）**

`drawDofRuler()` / `dofRulerHit()` は先頭が

```js
if(mode==='take'||mode==='place'||mode==='export')return;
```

で、`mode` は `'place' | 'take' | 'export'` しか取らない＝**本体が一度も実行されていなかった**。
canvas 上の DOF 定規は下部コンソールの FOCUS / DEPTH へ完全移設済みで、
キャンバス版を復活させる予定は無い（保険ではなく消し忘れ）と確認が取れたので削除した。

落としたもの（計 **87行**）:

| 場所 | 落としたもの |
|---|---|
| 関数 | `drawDofRuler()` 本体＋説明コメント |
| 関数 | `dofRulerHit()` 本体＋説明コメント |
| 描画ループ | `drawDofRuler();` の呼び出し |
| canvas `pointerdown` | `dofRulerHit()` を引く分岐まるごと（`drag={type:'dofpin'}` を作る唯一の場所） |
| `pointermove` | `if(drag.type==='dofpin'){…}` 分岐（掴む口が消えて到達不能になるため） |

`drag.type==='dofpin'` は上記 pointerdown でしか立たず、`pointerup` は型を見ない汎用処理なので
**この2箇所以外に後始末は要らない**。`visBottomPx()` / `focusAt()` / `setDofPin()` /
`dofSetPoint()` は他からも使うので残している。

**削除後の確認（実機）**

| 対象 | 結果 |
|---|---|
| FOCUS 定規のドラッグ | ▼ が追従（10%→25%→50%→90%→62%）・`#dk-pinv` の数字も同期 |
| ピント値の書き戻し | 選択KFの点が 0.30 → 0.75 → 0.62 と一緒に動く（write-through） |
| 離したあと | `renderDock()` で SHOTS カードの表示値も 0.75 に更新 |
| DEPTH 定規のドラッグ | `sel.depth` 0.5 → 0.2 → 0.55 → 0.85・`dot sel` / `stem` / `car` が全部 85% |
| `dkDepthActive` | pointerup で false に戻る（掴みっぱなしにならない） |
| 画面から取る／点を置く／点を外す／Esc取消 | すべて従来どおり |
| 描画ループ | 生存（2秒で rAF 121回）・console エラー 0件 |
