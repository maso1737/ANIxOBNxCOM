ECONTE（SPEC_10）の続き開発用ハンドオフ。単一HTML `econte.html`。

【概要】
紙のネーム/ラフ写真から絵コンテ・動画コンテまでを1本で行き来するプリプロツール。
設計の核心は「同期を作らない」：`cuts[]` を唯一のデータとし、BOARD/SHEET/TIMELINEは
同じ配列の別ビューにすぎない（詳細はSPEC_10_ECONTE.md参照。本ファイルは実装メモ専用）。

━━━━━━━━━━━━━━━━━━━━━━━━━━
■ データモデル（実体）
- `cuts[]` = グローバル配列。要素 `{id,src,baseC,drawC,bg,durF,note}`。canvasは1280×720固定（`CONTE_W/H`, `FPS=24`）
- `photos[]` = BOARD座標の写真配列（別データ・cutsとは独立）
- `state.view` = 'board'|'sheet'|'edit'|'tl'。`state.backView` = EDITから戻る先（'sheet'|'tl'。ダブルクリック元を記憶）
- `state.tl` = TIMELINE専用状態 `{frame,playing,loop,lastTs,acc}`（cutsではなくビュー側の状態）
- 保存: IndexedDB `econte_db_v1`（store: photos/cuts/meta）。`scheduleSave()`でdebounce、
  ビットマップは`dirtyDraw`等のフラグが立ったカットのみ再エンコード

■ ビュー切替（`setView(v)`）
- `v==='tl'`以外に切り替わる瞬間 `pause()` を呼ぶ（TIMELINE再生中の取り残し防止）
- トップバーのハイライトは実ビューでなく`barHi`（EDIT中は`backView`を見て元ビューを光らせる）

■ BOARD（考える場）
- `bDown/bMove/bUp` がMOVE/CUTツール共用のポインタハンドラ
- CUTツール: 矩形ドラッグ（16:9固定）→`createCutFromRect()`→`bakeCut(src)`で1280×720にベイクし新規カット追加
- `rebakeCut(i)`: 保持している`src`矩形から現在のBOARD内容を再ベイク（SHEETの⟳ボタン）

■ EDIT / TIMELINE 共用ペイント（重要な設計）
- `paintDown(e,cv)` / `paintMove(e)` / `paintUp()` が EDITキャンバス(`editCv`)とTIMELINEプレビュー(`tlCv`)の**両方**で共有される
  （旧`eDown/eMove/eUp`から一般化。`cv`引数を取るようになった）
- `toCanvasCoord(clientX,clientY,cv)` / `eyedropAt(clientX,clientY,cv)` も同様に`cv`引数化済み
- TIMELINEでペイントする際は`tlPaintDown(e)`が先に`state.curCut`をプレイヘッド位置のカットへ切替え
  （**切替時にundoStack/redoStackを空にする**。undo履歴はカット単位のスナップショットのため、
  カットをまたいだままundoすると壊れる。新規に描画系の関数を足すときはこの前提を崩さないこと）
- 再描画は`renderPaintViews()`経由（`state.view`を見てEDIT側かTIMELINE側かを自動判定）。
  ペイント処理を追加/変更するときは`renderEditCanvas()`直呼びでなくこちらを使う

■ TIMELINE（P1・composer-timeline-kit準拠）
- **ミニツールバー**(`#tl-minitools`): プレビュー左上のfloating。PEN/ERASE/FILL/EYE・ブラシ・色パレット。
  EDITサイドバーと状態を共有する：`setETool`は`.etool`全部（EDIT側＋ミニ）を横断でハイライト、
  `renderPalette`は`['#palette','#tl-palette']`両方に描画、`updateSwatch`/`setBrush`も両対応。
  → **新しいツール/色/ブラシUIを足すときは必ず両コンテナ・両ビュー分を更新する**（片方だけだと状態がズレる）。
  HIDE/✎TOOLSで開閉。B/E/G/I/[/]ショートカットはEDITとTIMELINE両方で有効
- `totalFrames()` / `cutIndexAt(f)` がフレーム↔カット変換の中心。`cutIndexAt`は範囲外を末尾カットにクランプ
- **クリップのダブルクリック=EDITへ**。この dblclick を殺さないため、`#tl-strip`のスクラブ(seek)は
  **`setPointerCapture`を使わない**（キャプチャを取るとターゲットがstripに固定されネイティブdblclickが
  発火しなくなる＝以前のバグ）。追従はwindowの`pointermove`/`pointerup`＋`gScrub`フラグで拾う。
  尺ハンドル(`.tl-clip-h`)上のpointerdownはスクラブ開始しない（gClipDrag経路へ）
- クリップ右端ドラッグ = 尺変更。ドラッグ中は`liveClipWidths()`でDOMだけ軽量更新し、
  離した瞬間に`layoutTL()`で正式再レイアウト（＝ラバーバンド防止のため）。**`cuts[i].durF`を直接書き換えるので
  SHEET側は次回描画時に自動で反映される（同期処理は無い）**
- 再生ループは`tick(ts)`（rAFベース、composerと同型のフレーム蓄積方式）
- **EXPORT VIDEO**: `tlCv.captureStream(FPS)` + `MediaRecorder`で実時間録画（`pickMime()`がvp9→vp8→webm→mp4の順でフォールバック）。
  焼き込み(C#/尺)はプレビューに直接`drawBurnin()`で描いてからキャプチャするのでWYSIWYG。
  書き出し中のSpaceキーは`togglePlay()`経由で`cancelExport()`に分岐（`gExporting`フラグ）。
  **非表示タブではrAFが止まり録画も止まる**ので、書き出し中はタブを前面のままにする必要がある（UIに明記済み）
- ショートカットは`SHORTCUT_ACTIONS`登録制＋`gKeymap`(`econte_keymap_v1`)。composer/OBANと同じレジストリパターン。
  再割当UIは未実装（P2以降・現状はlocalStorage手書き編集のみ）

■ FILLパレット
- `animator-color-palette`スキルの正準を移植。localStorageキーは`econte_palette_v1`（他ツールと衝突しない専用キー）

━━━━━━━━━━━━━━━━━━━━━━━━━━
【既知の落とし穴】
- EDIT/TIMELINEで新しいポインタ操作を足すときは、必ず`cv`引数を通す設計を維持すること
  （`editCv`決め打りに戻すとTIMELINEプレビューでのペイントが壊れる）
- TIMELINE⇔EDITを行き来する処理でundo/redoスタックをクリアし忘れると、
  別カットのスナップショットを誤って適用してしまう

【フェーズ状況】
- P0（BOARD+SHEET+EDIT+IndexedDB保存）: 実装済み
- P1（TIMELINE・動画書き出し）: 実装済み（2026-07）
- P2（animator連携`tdr_live`参加・カラースクリプト一覧PNG）: 未着手
- P3（manga-plate FRAME接続・OBANコマ送り）: 構想のみ

【変更後チェック】
node tools/check.js（6ファイル一括。econte.html含む）
