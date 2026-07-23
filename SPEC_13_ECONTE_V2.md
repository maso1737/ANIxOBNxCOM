# SPEC_13 — ECONTE V2「STUDIO」（1画面統合＋BOARD強化＋のりしろカメラ＋MP4）

対象: `econte.html`（SPEC_10 P0+P1 実装済みの上に載せるV2）。
実装前に必読: `ECONTE_HANDOVER.md`（cuts[]共有ペイントの前提・undoスタックの落とし穴・
strip で setPointerCapture を使ってはいけない理由が書いてある）。
変更後チェック: `node tools/check.js`（6ファイル一括・econte含む）。

## 0. 結論（何をするか）

ユーザーのラフスケッチどおり、BOARD / SHEET / TIMELINE の3ビューを**1画面「STUDIO」に統合**する。
SHEETは右側の「レイヤー一覧風」縦パネルになり、プレイヘッド位置のカットとフォーカス枠が連動する。
これは可能で、設計上も自然：**cuts[] が唯一のデータなので、3ビューが1ビューに減るだけ**。
同期処理は今までどおり一切書かない（描き込み先・尺・番号は全部同じ配列を見る）。

ビュー構成は `STUDIO | EDIT` の2つになる（board/sheet/tl の個別ビューは廃止）。
EDITへの遷移（サムネ/クリップのダブルクリック・✎）と復帰はそのまま。

```
┌─────────────────────────────────────────────┐
│ IMPORT   ...              [✓焼込] EXPORT   … SAVED │ ← トップバー
├───────────────┬───────────────┬─────────────┤
│               │  （映像プレビュー）   │ C1 [thumb] 内容 2+00 ▲▼│
│   BOARD       │   1280×720 fit       │ C2 [thumb] 内容 1+12 ▲▼│ ← SHEETパネル
│  （スキャン写真＋  │──────────────│ C3 [thumb] 内容 …     │   (縦スクロール)
│   CUT枠たち）    │ C1  2+00             │   …                  │
│  MOVE/CUT/FIT │ [TEXT 内容・セリフ]    │        [＋空コマ追加]  │
├───────────────┴───────────────┴─────────────┤
│ ▶ [C1     |C2  |C3        ]  ←タイムライン帯（横断・従来のstrip） │
└─────────────────────────────────────────────┘
```

- 左（BOARD）: 幅 ~40%（A4比くらいの面積）。従来のBOARD機能＋§2の強化
- 中央: プレビュー（現行 #tl-cv 相当）＋その下に「C# / 尺 / TEXT(内容・セリフ)」＝**現在カットの編集欄**
- 右（SHEETパネル）: 幅 ~22%・最小200px。行 = `C# | サムネ | 内容(2行省略) | 尺 | ▲▼✕⟳`
- 下: タイムライン帯（全幅横断）。クリップ右端ドラッグ尺変更・スクラブは現行実装のまま
- **フルスクリーンボタン**（トップバー右）: `document.documentElement.requestFullscreen()` トグル

最小成立幅の目安: 1180px（iPad横）。右パネルは折りたたみボタン（≡）で隠せるようにする。

## 1. STUDIO のフォーカス同期（V2-A の核）

- 「現在カット」= `cutIndexAt(state.tl.frame).i`。この1つの導出値に全UIが従う:
  - 右パネル該当行に `.focus` 枠（--ice系）＋ `scrollIntoView({block:'nearest'})`
  - 中央下の C#ラベル / 尺input / TEXTtextarea が現在カットの `durF` / `note` を編集
  - BOARD上の該当CUT枠もハイライト色を変える
- 右パネル行クリック = `seek(cutStartFrame(i))`（カット頭へ）。サムネ/行のダブルクリック = EDIT
- 実装: `renderStudioSync()` を1つ作り、`seek()` / `renderTL()` の末尾から呼ぶ
  （毎フレームDOM全再構築はしない。フォーカス class の付け替えとテキスト欄の値だけ）。
  再生中の textarea 書き換えはフォーカス中(document.activeElement)ならスキップ
- 旧 `setView('board'|'sheet'|'tl')` の呼び出し箇所はすべて `setView('studio')` に整理。
  `renderSheet()` は右パネル用 `renderSheetPanel()` に改名・簡略化（行テンプレは流用可）

## 2. BOARD 強化（V2-B）

1. **Ctrl+V ペースト**（PC）: `window.addEventListener('paste')` → `clipboardData.items` から
   `image/*` を取り出し `addPhotoFromImage()`（ビュー中央へ）。STUDIO表示中のみ・入力欄フォーカス中は無視
2. **HEIC読み込み**（PC）: accept に `.heic,.heif` 追加。まず `createImageBitmap(file)` を試し
   （iPad/新Safariはネイティブで通る）、失敗したら **heic2any をCDNから遅延ロード**して
   JPEG Blobへ変換（単一HTML方針の例外はCDNのみ＝JSZipと同じ扱い）
3. **写真の回転**: `photo.rot`（0/90/180/270）。選択中写真パネルに ↺90° ボタン。
   `renderBoard()` と `bakeCut()` の drawImage を「中心回転」で描く共通ヘルパ
   `drawPhoto(ctx, p)` に一本化（90/270時は当たり判定のw/h入替に注意）
4. **モノクロ化・輝度**（最低限）: `photo.filter = {gray:false, bright:1.0, contrast:1.0}`。
   選択中写真パネルに GRAYトグル＋明るさ/コントラストの2スライダー（0.5〜2.0）。
   実装は `ctx.filter = 'grayscale(1) brightness(x) contrast(y)'` を drawPhoto 内で設定
   （renderBoard/bakeCut両方に効く＝再ベイクで絵コンテにも反映）
5. **CUT枠の編集**: MOVEツールで既存CUT枠をクリック選択（枠線とC#ラベルを当たり判定。
   写真より優先）。選択枠は 内側ドラッグ=移動 / 角ハンドル=リサイズ（16:9固定）/ Delete=削除。
   離した時に `rebakeCut(i)` 相当を自動実行（`dirtyBase`）
6. **BOARD統合Undo**: animator と同じ「一元ログ」方式。`gLog = [{type, undo(), redo()}]`。
   type: photo-add / photo-move / photo-del / photo-rot / photo-filter / cut-add / cut-rect /
   cut-del / **paint**（プレビュー描画=既存drawCスナップショット）。
   STUDIO の Ctrl+Z/Y はこのログを叩く（EDIT内は従来どおりカット内drawC undoのまま）。
   ※既存の「TIMELINEペイント直後のCtrl+Z」も paint エントリとしてこのログに乗せ替える

## 3. EDIT / ペイント改善（V2-C）

1. **トレース透かし**: `cut.baseAlpha`（0..1・既定1.0）。`compositeTo()` で
   `ctx.globalAlpha = cut.baseAlpha` を baseC 描画時だけ適用（＝サムネ/プレビュー/書き出し全部に効く）。
   EDITサイドとSTUDIOミニツールに「BASE %」スライダー。0.2〜0.4がトレース用の想定
2. **TOOLパネル左右入替**: 設定 `gUi = {side:'left'|'right'}`（localStorage `econte_ui_v1`）。
   `#edit-main` の flex-direction: row-reverse 切替＋ミニツールの left/right 切替
3. **パレット挙動変更**: `selectPalSlot()` から `setETool('fill')` を削除
   （**色を選んでもツールは変わらない**。animator正準からの意図的な逸脱として
   コメントを残すこと。スキル animator-color-palette の canon と差分が出る点）
4. パレットJSON入出力（⇩⇧）は実装済み。STUDIOミニツールにも同じ4ボタンを出す
5. **EDITズーム/パン**: `state.editView = {x,y,z}`。ピンチ=拡縮＋パン、1本指タッチ=パン、
   ホイール=カーソル中心ズーム、FITボタン=リセット。
   実装は editCv の CSS transform（width/height style変更）でよい —
   `toCanvasCoord()` は getBoundingClientRect ベースなので**変更不要**（重要）

## 4. iPad 対応（V2-Cに含める）

1. **ダブルタップ検出**: iPadはネイティブ dblclick が飛ばないことがある。
   共通ヘルパ `bindDoubleTap(el, fn)`（pointerup 2回が350ms以内・24px以内）を作り、
   タイムラインクリップ・右パネル行・サムネに `dblclick` と併用で張る
2. **2本指タップ=UNDO / 3本指タップ=REDO**: pointerdown中のtouch数を追跡し、
   全部が250ms以内に上がって移動<12pxならタップと判定。EDIT/STUDIO両方で有効。
   誤爆防止: タップ判定が出たら直前のピンチ/描画開始をキャンセル
3. **指=操作・ペン=描画**（animatorと同じ操作感）: `paintDown()` の冒頭で
   `e.pointerType === 'touch'` は描画に入らず パン/ピンチ経路へ回す。
   ペン(pointerType 'pen')とマウスだけが描く。※現行実装は指でも描いてしまうので変更

## 5. のりしろ＋カメラプリセット＋書き出し（V2-D・データ移行あり）

### 5a. 1.2x のりしろベイク
- 新定数 `OS = 1.2` / `OS_W=1536, OS_H=864`。baseC/drawC を **1536×864** に変更。
  「本番フレーム」は中央 1280×720（`CONTE_W/H` は据え置き）
- `bakeCut(src)` は src矩形を1.2倍に広げた範囲をベイク（BOARDのCUT枠表示は本番枠＋
  外側にのりしろ枠を薄く表示）
- EDIT/プレビューはのりしろ込みで表示し、本番枠線をガイド表示（枠外は10%暗く）。
  のりしろにも描ける（PANで見えてくる部分の描き足し）
- **マイグレーション**: 起動時 meta.ver < 2 のカットは 1280×720 を 1536×864 の中央に
  コピーして載せ替え（のりしろは透明のまま）。一方向・自動・トースト告知

### 5b. カメラプリセット（cut.cam）
```
cut.cam = { preset:'FIX'|'PAN_L'|'PAN_R'|'PAN_U'|'PAN_D'|'TU'|'TB', amount:0..1 }  // 既定 FIX
```
- 再生/書き出し時、カットの経過率 t(0..1) で 1280×720 の切り取り窓を OS キャンバス内で
  線形移動/ズームして描く（`drawCamFrame(ctx, cut, t)` を compositeTo から分離して新設）:
  - PAN_*: 窓を のりしろ幅×amount ぶん平行移動（L=左→右 という「画面の流れ」で命名を統一）
  - TU: 1.0 → 1/(1+0.2×amount) へ縮小（寄り）／ TB: 逆（引き）
- UI: 中央プレビュー下に `CAM [FIX|PAN←|PAN→|PAN↑|PAN↓|T.U.|T.B.] 強さ─────`。
  プレビュー再生にそのまま効く（＝動画コンテがプロっぽくなる本命機能）

### 5c. 焼き込み3モード＋INFO帯
- `焼き込み: OFF / 画面内 / INFO帯` の3択（現行チェックボックスを置換）
- **INFO帯**: 出力1280×720のうち、絵を 1/1.2（1066×600）に縮めて中央配置し、
  余白の帯に `C# ／ 尺 ／ note先頭行` を描く（画に一切重ならない・プロの絵コンテ動画風）。
  プレビューも同じ描画関数を通す（WYSIWYG維持）

### 5d. MP4書き出し（AE読み込み可・iPad再生可）
- 優先順: **WebCodecs(H.264 avc1.42) + mp4-muxer(CDN)** → `MediaRecorder('video/mp4')` →
  現行 `MediaRecorder(webm)`。機能検出で自動フォールバック、ボタン表示に形式を出す
- WebCodecs経路は**非実時間**（フレームを直接エンコード）なので、
  現行の「実時間・タブ前面のまま待つ」制約が消える。2分コンテでも数秒〜十数秒
- ファイル名 `econte_<ts>.mp4`。フレームは 5b/5c を通した最終合成

## 6. フェーズ分割（この順で実装）

| フェーズ | 内容 | 規模 |
|---|---|---|
| **V2-A** | STUDIO統合レイアウト＋フォーカス同期＋フルスクリーン＋パレット挙動変更＋TOOL左右入替＋iPadダブルタップ | 大（ただし既存部品の再配置が主） |
| **V2-B** | BOARD強化（ペースト/HEIC/回転/モノクロ輝度/CUT枠編集/統合Undoログ） | 中 |
| **V2-C** | baseAlphaトレース透かし＋EDITピンチズーム＋指=操作・ペン=描画＋2本指UNDO | 中 |
| **V2-D** | 1.2xのりしろ（データ移行）＋カメラプリセット＋INFO帯＋MP4書き出し | 大（唯一データ形式が変わる） |

- 各フェーズ完了ごとに `node tools/check.js` ＋ 実機param-check表（ユーザー共通CLAUDE.mdの鉄則）
- V2-D はデータ移行を含むため**最後**。着手前にIndexedDBの構造変更をユーザーに一言確認

## 7. 変更されるSPEC_10の記述（実装時にSPEC_10へ追記すること）

- 3ビュー（BOARD/SHEET/TIMELINE）→ STUDIO+EDIT の2ビューへ
- パレット「色選択で塗りツールへ切替」→ 切替しない（本アプリ独自仕様）
- キャンバスサイズ 1280×720 → 1536×864（本番枠1280×720）… V2-D以降
- 書き出し WebM実時間 → MP4非実時間（フォールバックあり）… V2-D以降

## 8. 既知の罠（実装者向け・再掲）

- `#tl-strip` 系のポインタ処理に **setPointerCapture を使わない**（dblclickが死ぬ。HANDOVER参照）
- ペイント系は必ず `paintDown(e, cv)` / `renderPaintViews()` 経由（cv決め打ち禁止）
- カット切替時に undoStack/redoStack をクリア（カットまたぎundo破損防止）
- ツール/色/ブラシのUIは EDITサイド と STUDIOミニツール の**両方**を更新する
- 新規idを足したら check.js が配線を実検査する（`$('#id')` 形式で書くこと）
