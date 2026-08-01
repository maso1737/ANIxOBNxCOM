# ANIMATOR プロジェクト引継ぎ書
_新チャット冒頭にこのファイルを貼り付けてください_

---

## ⚑ 次チャットへの申し送り（最新・優先）

### 作業環境
- 実ファイルは `animator.html`（リポジトリ直下）。`index.html` はランディング、`composer.html` は合成。
- **master ブランチで直接作業・push**（worktree 運用は不要）。
- 反映先 GitHub Pages: https://maso1737.github.io/animation-paint/
- 変更後は必ずチェック:
  ```
  node tools/check.js
  ```
  （3ファイルの構文 / JS→HTML id配線 / id重複 / 未参照関数を一括検査。問題があれば exit 1）

### 2026-07 リファクタ＆機能追加の要点
- **共通化ヘルパー**（重複統合。既存挙動は不変）:
  - animator: `bresenham()`（drawLine/drawLineRadius/eraseLine の共通歩行）/ `refreshFrameUI()`（strip/onion/stats/pos/dur/timetrack の6連更新）/ `fillCircleRows()`（円ドットを水平スパン塗り。πr²回→約2r回の呼び出し削減）
  - composer: `bindPropInputs()`（kf-/fx- プロパティ入力配線）/ `makeFloatDrag()`（フローティングパネルのドラッグ）/ `exportZipPNG()`（ZIP書き出し骨格）
- **描き味**: pointermove で `getCoalescedEvents()` 全点処理。筆圧カーブ `PRS` ウィジェット（LIN/SOFT/HARD、`animator_pcurve_v1`）
- **PROJECTS 保存箱**: DB v4 で `snap_meta`/`snap_data` ストア追加。トップバー PROJ →一覧/保存/開く/複製/削除＋ストレージ残量表示。`buildProjectJSON()` を EXPORT JSON と共用
- **オニオンスキン**: ティント結果を drawData 配列キーの WeakMap でキャッシュ（drawData は編集で新配列割当のため自動無効化）
- **動画書き出し**: ANIMATOR `VIDEO` / COMPOSER `EXPORT VIDEO`。MediaRecorder + captureStream 実時間レンダリング（Safari=MP4/Chrome=WebM 自動選択）。SEQ PNG / 4K PNG SEQUENCE はキャンセル可能に

### 未着手・次チャット候補

**次にやる（仕様確定済み・着手待ち）**
- **作画タイムラプス P2（WebM/MP4 書き出し）** → **`SPEC_14_TIMELAPSE.md`**。
  **P0（記録エンジン）と P1（アプリ内再生パネル）は 2026-08-01 実装済み**。
  残りは P2 だけ＝TIMELAPSEパネルに `EXPORT VIDEO` を足し、`tlList`（並べ替え済み配列）を
  既存 `exportVideo()` と同じ実時間レンダリングで `MediaRecorder` に流す。進捗は `showExportOv()`、
  ファイル名は `timelapse_<work|cell>_<yyyymmdd-hhmm>.webm`。
  **P2完了時に `PIPELINE.md` へ ANIMATOR の出口として「タイムラプス動画」を追記すること**（P1時点では出口が無いので保留中）。
  要点だけ再掲（詳細は必ずSPEC_14を読む）:
  - 記録は**表示中のコマを撮る1系統**。ショットに `frameIdx` を持たせ、**再生時に WORK(作業順) / CELL(コマ別) を切替**
  - 撮影条件は「**変化があったときだけ一定間隔**」（既定2秒）＋**描画中は撮らない**
  - フックは **`markFrameDirty()`**。`endStroke()` に付けると **FILL と投げ縄塗りが記録から抜ける**（要注意）
  - 既定ON＋**リングバッファ**（既定1500枚）。DB **v5** で `tl_meta`/`tl_shot` を追加
  - **`AUTOSAVE_OFF`（?ro=1 の別窓）では記録しない**
  - 出口は**アプリ内再生とWebM/MP4の2つで確定**。連番PNG(ZIP)は不要と確定済み
  - サイズ実測(1280×720/WebP q0.72): 通常作画10KB・描き込み多め22KB・密49KB・全面ベタ190KB / 枚

**中規模フェーズ**
- **ANIMATOR↔COMPOSER 複数窓LIVE管理**：複数ANIMATORを別窓で同時開きのとき、どれがCOMPOSERとLIVE連携するかの帰属管理。
  **2026-07-27 判断: 当面は現状維持**（`tdr_live` は projectId 一致で全窓ブロードキャスト。
  上の「→ANM 保留」により そもそも2窓運用を推奨していないので実害が出ていない）。
  将来案として検討したのは次の3つ:
  1. **現状維持**（projectId一致なら全窓が送る）＝採用中
  2. **アクティブ窓のみ送信**：最後にフォーカスされたANIMATORだけがLIVE更新を送る。誤爆は防げるが
     「裏の窓で直したのに反映されない」が新しい混乱になりうる
  3. **COMPOSER側でトラックごとに送信元を明示**：`tdr_live` のメッセージに窓ID（起動時に採番した
     `winId`）を載せ、COMPOSERのトラック行に「どの窓と同期中か」を表示＋プルダウンで選ばせる。
     いちばん正直で誤解が無いが、**送信側（animator）・受信側（composer）・保存形式の3点セット改修**が要る。
     採用するなら「→ANM 代替動線」を解決した後（2窓運用が安全になってから）が順当。

**将来フェーズ（大規模）**
- **線のコピペ＆選択移動/回転/スケール**（Ctrl矩形・Alt投げ縄）：大規模・見送り中。
- **ドックマネージャ（UI配置）**：設計コストが大きい。今はフローティング/リサイズで代替。

**✅ 2026-08-01 完了（その2）**
- **作画タイムラプス P1（アプリ内再生）**：SPEC_14 の P1。**撮った記録をその場で見られる状態**まで。
  - **TIMELAPSE パネル**（`#tl-panel`・フローティング＋ヘッダドラッグ＋下端リサイズグリップ）。
    開き方は **`TL` ボタンのWクリック** と **設定パネル → TIMELAPSE → 「TIMELAPSE パネルを開く」**
  - **PLAYBACK**：プレビュー / 再生・停止 / スクラブ / FPS 6・12・24・60 /
    **並べ替え `WORK`（撮った順）⇄ `CELL`（コマ別）** ＋ それぞれ何が見えるかの1行説明 /
    情報 `N枚 · 作業 約M分ぶん · XXMB / 再生 X秒（Nfps）`
  - **RECORDING**：記録ON/OFF（トップバー `TL` と連動）・記録間隔 1/2/5秒・上限 500/1500/3000/6000枚・
    記録解像度 720p/1080p・現在の使用量と最悪見積りの併記・**CLEAR**（`modalConfirm`）
  - **並べ替えは `tlSortList()` の比較関数1つ**（CELL=`(frameIdx, seq)` / WORK=`(seq)`）。記録側は不変
  - デコードは遅延＋LRUキャッシュ（240枚）＋再生中10枚先読み。前の絵を残すのでチラつかない
  - **レターボックス**：基準は先頭ショットの縦横比。解像度を途中で変えても引き伸ばさない
  - 上限枚数を下げるとその場で `tlTrim()`。CLEAR は記録だけ消し **frames/meta は無傷**（実測確認済み）
  - 別窓（`?ro=1`）は**見るだけ**（再生可・記録トグル/設定/CLEARは `disabled`＋半透明）
  - ESC は**再生中ならまず停止**、そうでなければ従来どおりフレーム選択解除
  - ⚠️ 再生の駆動は `requestAnimationFrame`。**ブラウザ非表示時は進まない**（見ていないので許容）

**✅ 2026-08-01 完了（その1）**
- **作画タイムラプス P0（記録エンジン）**：SPEC_14 の P0。**既定ONで自動的に撮れている状態**まで。
  - **DB v5**：`tl_meta`（単一レコード key='tl'）/ `tl_shot`（key=`seq` 連番）を追加。既存ストアは不変。
    あわせて `openDB()` に `onblocked` ログと `db.onversionchange → close()` を追加
    （別窓運用で旧バージョンのタブがアップグレードを止めるのを避けるため）
  - **フックは `markFrameDirty()` の中の `tlDirty = true` の1行だけ**（`endStroke` ではない＝FILL/投げ縄も拾う）
  - `setInterval(tlTick, 500)` で軽くポーリングし、**①間隔2秒経過 ②`tlDirty` ③`drawing`/`lassoing` が false**
    の3条件が揃ったときだけ1枚撮る。`rAF` は裏タブで止まるので使わない
  - 合成は `tlComposeShot()`：**bg / frame(下絵) / onion×2 / draw のみ**。guide と REF は入れない
    （下絵の不透明度・移動 transform、オニオンの 0.35 は表示と同じ値で焼いてある）
  - 1280長辺 / WebP q0.72（未対応環境は起動時判定で JPEG フォールバック）。
    エンコード中は `tlBusy` で次をスキップ＝描画を待たせない
  - **リングバッファ**：`count > maxShots`（既定1500）で `seqTail` から古い順に削除し `bytes` を減算
  - トップバー **`TL ●/○`**（`LIVE` の隣）。ON/OFF は localStorage `animator_tl_on_v1`。
    **別窓（`?ro=1`）は `TL －` でクリック無効・タイマーも張らない・`tl_meta` も書かない**
  - 起動直後は `tlDirty=false` に落とす＝**開いただけ・読み込んだだけでは撮らない**
  - 実機検証済み（記録/放置で増えない/ストローク中に撮らない/リングバッファ/`?ro=1`/REF・guide除外/
    frameIdx追従/frames・meta無傷）。詳細は SPEC_14 の P0 実装メモ

**✅ 2026-07-27 完了**
- **→ANM 代替動線（option 2 = 別窓は autosave OFF）**：PROJ 保存箱の各行に **`別窓`** ボタンを追加。
  `animator.html?snap=<snapId>&ro=1` を `window.open`（窓名 `tdr_anim_<snapId>`＝再クリックで同じ窓を使い回し）。
  - `AUTOSAVE_OFF = URLSearchParams(location.search).get('ro')==='1'` を**スクリプト冒頭のconstで確定**
  - `scheduleSave()` / `flushSave()` / `saveRefs()` が `AUTOSAVE_OFF` で早期return
    ＝**frames/meta/refs のどれも書かない**（この3つが本窓と共用の単一レコードだから）
  - `setSaveState()` は常に `AUTOSAVE OFF`（琥珀色 `.save-state.manual`）を表示。title に代替手段を明記
  - 起動時 `?snap=<id>` → `snapGetData()` → `applyProjectJSON()`。`?id=`（exchange）と排他
  - **LIVEも自動送信されない**（送信は `flushSave` 末尾の `broadcastProjectDebounced()` 経由のため）。
    別窓から送りたいときは LIVE ボタンを手で押す＝`broadcastProjectNow()` は直接呼ばれるので動く
  - 残すときは PROJ の ＋保存（スナップショット＝別キーなので衝突しない）か EXPORT JSON
  - **option 1（autosave を projectIdキーに分離・DB v5）は見送り**。理由は下の「autosaveの容量実測」参照
- **OBAN: CLEAR/50MB確認の modalConfirm 化**（native confirm 廃止。`#cf-modal`。詳細は OBAN_BUILDER_HANDOVER）
- **`+ FROM SAVED` の使いにくさ解消**：候補を **PROJECTS保存箱（`snap_meta`）＋共有DB（`tdr_exchange`）の両方**から
  集めるようにし、名前・日時・コマ数・解像度つきのスクロールリストで選べるようにした（旧: 共有DBのみ＝
  「→ COMPOSER を一度も押していないと常に空」・ラベルはprojectId先頭10文字・**先頭6件で打ち切り**）。
  `showModal({list})` を追加（`#modal-list`）。空のときは理由と次の一手を書いたメッセージを出す。
  ※ index.html 側へのANIMATOR一覧掲出は**やらない**（発注者判断。animator内で完結させる）。

---

## プロジェクト概要
ブラウザベース・日本アニメ作画特化アニメーションエディタ。
単一HTMLファイル（`animator.html`）、IndexedDB自動保存、Chrome/iPad Safari対応。
COMPOSERと BroadcastChannel でリアルタイム連携。

---

## ファイル構成
- **`animator.html`** — メインの作画エディタ（約265KB）
- **`composer.html`** — マルチトラック合成（カメラ/KF/書き出し）
- **`index.html`** — ランディングページ
- **`CLAUDE.md`** — Claude Code 向けの開発メモ（短縮版）
- 保存場所: `C:\Users\so173\Documents\Claude\Projects\Animation_Paint\`
- GitHub: https://github.com/maso1737/animation-paint

---

## 技術スタック
- Canvas 2D（内部解像度可変・上限≒4K面積。各コマは `drawData` Uint8ClampedArray W×H×4）
- アンチエイリアスOFF、ブレゼンハム直線、自前ピクセル描画
- Pointer Events API（Apple Pencil / マウス / タッチ 統合）
- IndexedDB自動保存（差分・debounce 800ms）
- BroadcastChannel `tdr_live` によるリアルタイム連携

---

## レイヤー構成（`#canvas-wrap` 内、上から）

| canvas ID | 用途 | 書き出し |
|---|---|---|
| `bg-layer` | 背景（明度スライダー） | ○ |
| `ref-layer` | REF ANIMATOR（コマ同期） | ✕ |
| `refimg-layer` | REF IMAGE（原寸・複数・移動可） | ✕ |
| `frame-layer` | FRAME LAYER（描ける下絵・移動可） | ✕ |
| `onion-prev/next` | オニオンスキン | ✕ |
| `draw-layer` | 描画レイヤー | ○ |
| `guide-layer` | 解像度枠/セーフ（表示のみ） | ✕ |

---

## 実装済み機能（最新）

### キャンバス・描画
- ペン 1px / 2px / 20px、アンチエイリアスOFF（円ドットは `fillCircleRows()` の水平スパン塗りで高速）
- 筆圧ペン（PEN ダブルクリック/ダブルタップで黄バッジ ON/OFF）＋ 筆圧カーブ `PRS`（LIN/SOFT/HARD）
- Apple Pencil 高レート入力対応（`getCoalescedEvents()` 全点処理）
- インクカラー 3色（主線黒・下書き水色・指示オレンジ。下書/指示はスポイトで色上書き可 `animator_ink_v1`）
- **スクリーントーン**：下書/指示ボタンの Wクリックで T10(dot10%)/T40(dot40%) トーンインクにトグル。ペン/筆圧ペン/FILL 対応。網点は `TONE_PITCH=16` の45°格子で **キャンバス原点固定**（塗り足してもズレない）。トーン色もスポイトで変更可（`buildTone()` でパターン再生成）。FILL は `floodFill()` 内で visited 配列＋`toneOn()` 判定。モード/色は `animator_ink_v1` に保存。トーンインク選択中は FILL もトーンで塗る（パレット色は無視）
- 消しゴム（サイズ独立記憶）
- 塗りつぶし（スキャンラインフラッドフィル。FILL ダブルクリックで透明消しゴムモード）
- ブラシ補正 STAB（OFF/AVG=指数移動平均/PULL=レイジーマウス、`animator_stab_v1`）
- 背景明度縦スライダー
- ピンチズーム＋パン / FLIP（表示反転） / MIRROR（左右対称・軸ドラッグ・ダブルクリックで垂直⇄水平）
- **CANVAS SIZE 可変**：左上ラベルクリック→設定パネル。上限≒4K面積。既存の絵は中央フィット保持。

### FILL PALETTE（カスタム可）
- 初期48色。スロット選択→スポイト(Alt+クリック)で上書きカスタム。
- ＋/−でスロット追加/削除（最低1色）。⇩/⇧でJSON書き出し/読込。
- localStorage `animator_palette_v1` に保存（ブラウザ全体共通）。

### REF パネル（`topbar REF` ボタン）
- **パネル開閉＝キャンバス上の全参照表示マスター ON/OFF**（閉じると全参照非表示＋EDIT OFF）
- **パネル最上部の共通行**：MOVE ボタン / 中央ボタン / 選択状況表示
  - MOVE モード中：画像はキャンバスでクリック→最前面化＋ドラッグ移動、ホイールで拡縮
  - ANIMATOR/FRAMEはリスト/見出しクリックで選択してからMOVEでドラッグ
  - 中央ボタン：選択中参照を原寸(1:1)中央に戻す

- **FRAME LAYER**（描ける下絵）：
  - EDIT ON で描画対象が frame-layer に切り替わる
  - 見出しクリックで MOVE 選択 → ドラッグ移動・ホイール拡縮（描いた内容ごと移動）
  - CSS transform で移動（描画バッファは保持。描画時は `toFrameLocal()` で逆変換）

- **REF IMAGE**（複数）：
  - LOAD で複数選択読込・原寸中央・カスケード配置。× IMG で選択/最後の1枚を削除。不透明度スライダー。
  - meta に `refImages[]`（src/x/y/scale/opacity）で保存・復元

- **REF ANIMATORS**（JSON連番）：
  - `+ JSON FILE` で追加（複数選択可）
  - `+ FROM SAVED`：同ブラウザ内で → COMPOSER 等経由で送信した `tdr_exchange` DB の一覧から追加（→「FROM SAVED について」参照）
  - リスト項目クリックで選択（重なりでも選べる）→ MOVE でドラッグ移動・ホイール拡縮
  - VIS で表示ON/OFF。× で削除。→ANM ボタンは削除済み（誤タップ防止。別ANIMATORはIMPORT JSONで開く）
  - 手元より長いJSONは再生・スクラブでREF全尺まで追従（`effectiveTotalTicks()`でタイムライン延長）
  - transform（x/y/scale）を refs DB に保存・復元

### 設定パネル（⚙ ボタン / `,` キー / 左上ラベルクリック）
- **CANVAS SIZE**：W×H 入力 + プリセット。変更時は確認ダイアログ→中央フィット。
- **CANVAS GUIDES**：解像度枠 ON/OFF+px 入力 / セーフフレーム ON/OFF+% 入力（guide-layer に描画のみ）
- **KEYBOARD SHORTCUTS**：全アクションをキー再割当（localStorage `animator_keymap_v1`）。RESET DEFAULTS。
- 下端ドラッグ＋段スナップで高さ調整（ビューポート超過しない）
- REFパネル・パレット（フローティング時）も同様のリサイズグリップ

### 作画タイムラプス（topbar `TL ●/○` ボタン・SPEC_14 P0）
- 既定ONで、**表示中のコマ**を「変化があったときだけ2秒間隔」で自動撮影（描画中は撮らない）
- 合成は bg / 下絵 / オニオン / 描画レイヤーのみ。**guide と REF は絶対に入らない**
- 1280長辺 WebP。DB v5 の `tl_shot`（key=`seq`）に貯め、1500枚を超えると古い順に捨てる
- ショットは `frameIdx` を持つので、**WORK（作業順）/ CELL（コマ別）** の2通りに並べ替えて再生できる
- **`TL` のWクリック**（または設定パネル内）で TIMELAPSE パネル＝再生・並べ替え・設定・CLEAR
- 別窓（`?ro=1`）は `TL －` で記録しない（再生は可）。**動画書き出しは P2 で未実装**

### PROJECTS 保存箱（topbar PROJ ボタン）
- 現在の作業を PROJECT_v1 JSON のスナップショットとして IndexedDB に保存（自動保存とは別枠）
- 一覧（名前/日時/コマ数/解像度/サイズ）から 開く（確認あり・置換）/ 複製 / 削除
- DB v4: `snap_meta`（一覧用軽量メタ）と `snap_data`（本体）の2ストア分離＝一覧表示が軽い
- パネル下部に `navigator.storage.estimate()` のストレージ使用量表示（90%超で赤）

### 書き出し
- **EXPORT 4K**: 現在コマをPNG（Shift+クリックでBG透明）
- **SEQ PNG**: 全コマをBG透過連番PNGでZIP（キャンセル可）
- **VIDEO**: ワークエリアを動画書き出し。MediaRecorder + captureStream の実時間レンダリング
  （Safari=MP4/H.264, Chrome=WebM を `pickVideoMime()` で自動選択。キャンセル可）
- **EXPORT JSON**: PROJECT_v1（`buildProjectJSON()` はスナップショットと共用）

### タイムライン
- `kind: 'draw' | 'empty'` の2種セル。duration 1〜120。末尾タップで追加。
- セル並び替えドラッグ / 複数選択(Shift) / コピペ / 移動 / 削除
- Alt+ホイール / iPad ペンスクラブでセル基準幅伸縮

### ワークエリア（時間ルーラー上の黄色帯）
- 左右ハンドルドラッグで範囲指定（実タイムライン内に収まる）
- **Wキー**：選択フレームがあればその範囲にFIT、なければ全範囲
- **帯スライド（移動）**：中ボタンドラッグ（マウス）またはタッチ。左クリック/ペンはタイムライン操作に委ねる
- REFが手元より長いとき全範囲再生でREF末尾まで延長（ただし帯/ハンドルは実タイムライン内）
- time-track の空き領域ダブルクリック → 全範囲

### LIVE 連携（BroadcastChannel `tdr_live`）
- ANIMATORの autosave 完了 → COMPOSERへ `project-update` をブロードキャスト
- COMPOSERが受信 → `projectId` 一致トラックの絵だけ差し替え（KF/transform/マーカー保持）
- `→ COMPOSER` ボタン：別ウィンドウで COMPOSER を起動し LIVE も有効化。再クリックで前面化。
- topbar の `LIVE ○/●` で接続状態を表示。手動クリックで強制再送可。
- 同一ブラウザ・同一オリジンのタブ間のみ。

### 書き出し
- **EXPORT**：作業解像度そのまま PNG（BG白固定 or Shift で透過）
- **SEQ PNG**：全コマを作業解像度 BG透過の連番 PNG で ZIP 一括書き出し（JSZip CDN）
- **EXPORT JSON**：COMPOSER連携用プロジェクトJSON（cells に PNG data URL を埋め込み）
- **IMPORT JSON**：別プロジェクトを読み込んで現在のプロジェクトを置換

### Undo / Redo
- グローバルログ `gUndo[] / gRedo[]`（canvas / timeline / framelayer の3系統を時系列統合）
- キャンバスUndoは各コマ独立（50ステップ）。コマをまたぐ統合Undoはしない（仕様）
- タイムライン履歴 `tlHistory[]`（20ステップ・idベースマージで絵を温存）

### ショートカット（デフォルト・⚙で変更可）
| キー | アクション |
|---|---|
| B / E / G | ペン / 消し / 塗り |
| 1 / 2 / 3 | サイズ 1px / 2px / 20px |
| O | オニオンスキン |
| N / D | 新規 / 複製フレーム |
| S | SPLIT（スクラブ位置で分割） |
| W | ワークエリア=選択FRAME範囲 / 全範囲 |
| Space | 再生 / 停止 |
| ← / → | コマ移動 |
| Del / BS | フレーム削除 |
| F | FIT |
| M | MIRROR |
| X | FLIP |
| R | REFパネル開閉 |
| , | 設定パネル開閉 |
| Tab | ツールバー左右入替 |
| Alt+クリック | スポイト（選択スロット上書き） |
| Ctrl+Z / Y | Undo / Redo |
| 指2本タップ / 指3本タップ | Undo / Redo |

---

## 主要な state フィールド

```js
const state = {
  tool, penSize, eraseSize, inkColor, fillColor,
  pressurePen, fillErase,
  bgBright, zoom, fitMode, panX, panY,
  frames,              // [{id, kind, duration, hidden, drawData, thumbCanvas, history, histIdx, ...}]
  currentFrame, fps, playing, loop, onionOn, smoothing,
  cellBaseW, cellStretchPerTick,
  workStart, workEnd,  // ワークエリア (tick単位, exclusive)
  flipped, mirrorOn, mirrorAxis, mirrorAxisX, mirrorAxisY,
  timeUnit,            // 'frames' | 'seconds'
  toolbarSwapped, paletteFloat, paletteFloatPos,
  selectedFrameIds,    // Set<frameId>
  frameLayer: { visible, opacity, editMode, x, y, scale },
  refAnimators: [{ id, name, projectId, visible, opacity, color, ticks, totalTicks, fps, source, x, y, scale }],
  refImages:    [{ id, img, src, x, y, scale, opacity, visible }],
  refMoveMode, refSel, // refSel: {type:'img'|'anim'|'frame', id?}
  refMasterShow,       // REFパネル連動マスター表示
  guides: { resOn, resW, resH, safeOn, safeA, safeB },
  projectId,           // BroadcastChannel連携用ID
  composerData,        // COMPOSERのKF等を保持してEXPORT時に乗せる
};
// グローバルUndo
const gUndo = [], gRedo = [];
// タイムライン履歴
const tlHistory = []; let tlHistIdx = -1;
// パレット（localStorage）
let gPalette = [...]; let gPalSlot = N;
// キーマップ（localStorage）
let gKeymap = {};
```

---

## アーキテクチャ上の注意点

- **タッチ**：全タッチは `#stage` の pointerdown/move/up で一元管理（`touchPtrs: Map`）。drawCanvas は pen/mouse のみ。
- **FRAMEレイヤー移動**：`applyFrameLayerTransform()` で CSS transform。描画時は `toFrameLocal(x,y)` で逆変換してバッファ座標へ。
- **REF IMAGE 最前面化**：`bringImageFront(id)` が `state.refImages` 末尾へ splice → `renderRefImg` が後に描画。
- **CANVAS SIZE 変更**：`setCanvasSize()` → `setupCanvas()` → 全フレームの `drawData` を `resampleDrawData()` で中央フィット（nearest）再サンプル。Undo履歴はリセット。
- **ショートカット**：`SHORTCUT_ACTIONS` 配列にアクション登録 → `gKeymap`(localStorage) で照合。`handleShortcutCapture()` がキャプチャモード中は全 keydown を横取り。
- **LIVE 連携**：`flushSave` 完了後 `broadcastProjectDebounced()` が `gLiveActive` なら送信。`gComposerWin` で別窓への参照を保持（再クリックで前面化）。
- **削除＝空ブロック変換**：drawフレーム→empty（タイムライン尺維持）。emptyの削除は完全splice。
- **effectiveTotalTicks()**：手元 totalTicks と表示中REFの最長の大きい方。再生・スクラブ・ルーラーがREF尺まで延長する根拠。

---

## 投げ縄塗り（LASSO FILL）について
FILLツールには2方式があり `state.fillMode`（`'flood'`|`'lasso'`）で切替。**FILLボタン長押し(500ms)** でトグル（`onLongPress`）。lasso時はラベルが `LASSO`・左上に紫バッジ(`.lasso-on::before`)・カーソル crosshair。
- **狙い**: ブラシで網点(トーン)を1点ずつ塗ると重いので、囲って一括塗りに逃がして軽量化。
- **実体**: `lassoFillPolygon(pts)` がスキャンライン(偶奇規則)で多角形内を塗る。色/トーン/透明消しの規則は `floodFill` と完全共通（`currentFillHex` / `isToneInk`+`toneOn` / `state.fillErase`）。**ドット塗りは下書/指示のWクリックでトーン選択中に自動的に網点で塗られる**（切替UIは従来のまま）。
- **操作経路**: `drawCanvas` の pointerdown で `fillMode==='lasso'` なら `lassoBegin/Move/End`。輪郭プレビューは `guideCtx`（ガイド層）に破線描画→離すと `renderGuides()` で消去。Undoは塗り確定時に1手 push。FRAMEレイヤー編集中は頂点を `toFrameLocal()` 経由で写像。
- **入力**: pen/mouse は `drawCanvas` 経由（＝iPadは Apple Pencil で囲う）。指はパン維持（従来設計どおり）。ミラーは floodFill 同様に非適用。

## autosave の容量実測（2026-07-27・2048×1152）

option 1（projectIdキー分離）を検討するにあたって実測した数字。**判断の根拠なので消さないこと。**

| 項目 | 実測値 |
|---|---|
| 生データ 1コマ | 9.0MB（W×H×4 の Uint8ClampedArray） |
| 実際にDBに載る 1コマ・線画中心 | **0.42MB**（IndexedDBが圧縮＝約1/21） |
| 実際にDBに載る 1コマ・**トーン全面＋ベタ15%** | **0.64MB**（約1/14） |
| 1コマだけ書き込み（差分保存） | 30ms |
| 9コマ一括書き込み | 110ms（≒12ms/コマ） |
| ブラウザのクォータ | 5.2GB |

**結論**:
- **速度はプロジェクト数と無関係**。`flushSave()` は `pendingSaveFrames` の差分のみ書き、
  `loadProject()` は `meta.frameOrder` を元に `fs.get(id)` の**ピンポイント取得**（全件走査していない）。
  キーに projectId を足しても書き込み量・取得回数は変わらない
- **容量も当初の想定ほど怖くない**。「トーンのベタ塗り多用＝生9MB/コマ」という初期見積りは
  **圧縮を勘定に入れていない誤りで、実測は0.64MB**。3秒(72コマ)のトーン多用カットでも **≒46MB/本**、
  クォータ5.2GBに対して100本以上入る。**手動削除UIは当面不要**
- したがって option 1 の重さは実行速度ではなく **DB v5マイグレーション＋掃除導線の設計コスト**。
  そこが本体なので、まず option 2（別窓 autosave OFF）で2窓運用を開通させる方針を採った

## FROM SAVED について（2026-07-27 改修済み）
`+ FROM SAVED` は、**同じブラウザ内に残っているプロジェクト**から参照（REF）を追加する機能。候補は2系統:
- **保存箱**: PROJECTS パネル（topbar PROJ）で保存したスナップショット（`snap_meta`/`snap_data`）
- **共有DB**: → COMPOSER 等を経由して `tdr_exchange` に入ったレコード（自分自身の projectId は除外）

一覧は `showModal({list})` のスクロールリストで、`名前` ＋ `出所 · 日時 · コマ数 · 解像度` を表示。全件出す（件数上限なし）。
候補ゼロのときは「PROJ で保存するか → COMPOSER を一度押す」と次の一手を書いたメッセージを出す。
- 旧仕様の問題（解消済み）: 共有DBのみが対象で**→ COMPOSERを押すまで常に空**・ラベルがprojectId先頭10文字・**先頭6件で打ち切り**
- index ページへのANIMATOR一覧掲出は**やらない**方針に決定（animator内で完結させる）

---

## 既知の制限・注意点
- ライブ連携は同一ブラウザ・同一オリジンのタブ間のみ（異なるPCは対象外）
- キャンバス拡大はメモリ×コマ数で増加（8Kは多コマ不可。上限は4K面積）
- FRAMEレイヤーを移動した状態でのフラッドフィルは `toFrameLocal()` 経由（移動+スケールが大きいと描画位置が微妙にズレる可能性あり）
- タイムラインUNDO後 IndexedDB に即時反映されるが、大量undo時はDBと一時的に乖離する可能性あり
- Apple Pencilの描き始めに若干の反応遅延あり（許容範囲とのこと・将来改善候補）

---

## 開発スタイル
- 単一HTMLで完結。外部依存は CDN（JSZip 等）のみ。
- 変更は Edit（差分）で最小限に。全書き換えは避ける。
- 構文チェック（`new Function`）→ Pages か `file://` で実機確認。
- push は明示依頼時のみ。大きい・不可逆な変更は先に方針を確認。
