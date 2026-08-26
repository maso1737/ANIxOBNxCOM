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
- `↑` / `↓` … KF 選択の移動
- **`Ctrl(⌘)+←` / `→` … 選択KFの順番入れ替え**（旧 `Ctrl+↑↓` から変更。
  ショートカット一覧・tooltip・コメントも全部更新済み）
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

## 7. 未着手・気になる点

- canvas 内 DOF ピッカーカーソルの `#FFC94F` リテラル（上記 1）。
- FX パネルの項目数が多いのでセクション分けをもう一段整理できそう。
- 44px ヘッダの `✕` と `▾` が狭い画面で近い。モバイル想定なら要調整（現状デスクトップ前提）。

---

## 8. リポジトリ取り込み時の追記（2026-08-26）

handoff をこのリポジトリへ落とした際の差分。上の本文は Claude Design 側セッションの記録で、
以下は取り込み側で足した分。

### 8-1. ファイルの並び

| ファイル | 中身 |
|---|---|
| `oban-builder.html` | **本ドキュメントの新UI版（既定）**。`index.html` の OBAN カードはここを指す |
| `oban-builder-classic.html` | 差し替え前の従来UI版を温存したもの |

**エンジンも `localStorage['oban-project']` も共通**なので、作業中のプロジェクトを持ったまま
両者を行き来できる。相互リンク:

- 新UI → 従来版: ⚙ SETTINGS ▸ FILE／連携 の `CLASSIC UI`（`#b-classic`）
- 従来版 → 新UI: `#bar-right` の `NEW UI`（`#b-se`）

`oban-theme`（テーマ）は新UI専用キー。従来版は読まないので、行き来してもテーマは保持される。

### 8-2. §3 の削除に伴う取りこぼしを1件修正

旧 `#cards` 撤去で **DOF のピント点を「外す」口が消えていた**（`dofRemovePoint()` が
呼ばれない孤児関数になっていた。`dofset` の tooltip も「TAKEパネルの ✕」という
既に無いものを案内していた）。下部コンソール TAKE の FOCUS 行に移設した:

- `data-dk="dofdel"` … 選択KFに点があるときだけ出る `✕ 点を外す`（`dofset` の隣）
- `dofset` の tooltip を「外すときは隣の『点を外す』」に修正

### 8-3. `tools/check.js` の残 2 件は誤検出

`#qd-tsize` / `#qd-h` は `qdNum()` が `id="qd-${act}"` でテンプレート生成するため、
静的HTMLには文字列として現れない。実機で生成を確認済み（実害なし）。
チェッカを直すなら「動的 id 生成」への対応が要る。
