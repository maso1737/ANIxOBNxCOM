ECONTE（SPEC_10）の続き開発用ハンドオフ。単一HTML `econte.html`。

【概要】
紙のネーム/ラフ写真から絵コンテ・動画コンテまでを1本で行き来するプリプロツール。
設計の核心は「同期を作らない」：`cuts[]` を唯一のデータとし、BOARD/SHEET/TIMELINEは
同じ配列の別ビューにすぎない（詳細はSPEC_10_ECONTE.md参照。本ファイルは実装メモ専用）。

━━━━━━━━━━━━━━━━━━━━━━━━━━
■ データモデル（実体）
- `photos[]` の要素 = `{id,name,img,blob,x,y,w,h,rot,filter,ref}`（rot/filter/ref は V2-B で追加）
  - `x,y,w,h` は **BOARD上の見た目の外接矩形**。回転時は w/h も入れ替えるので当たり判定は素のまま
  - `ref` = REF BOARD の元リンク `{refId,url,svc,title,memo,tags[]}|null`。**cut側には持たせない**
- `cuts[]` = グローバル配列。要素 `{id,src,baseC,drawC,bg,durF,note,thumb}`。canvasは1280×720固定（`CONTE_W/H`, `FPS=24`）
  - `thumb` = 右パネル用サムネのdataURLキャッシュ（V2-A）。**絵が変わる処理では必ず `cut.thumb = null`**
    （strokeSeg / floodFill / doUndo / doRedo / clearDraw / clearBase / setCutBg / rebakeCut）。保存対象外
- `photos[]` = BOARD座標の写真配列（別データ・cutsとは独立）
- `state.view` = **'studio'|'edit'**（V2-Aで2値に統合。`backView` は廃止）
- `gFocusCut` = 現在カット＝`cutIndexAt(state.tl.frame).i` の導出値。**これを持ち回るのではなく毎回導出する**
- `gUi = {side:'left'|'right', sheet:bool}` = TOOLパネル左右＋右パネル開閉（localStorage `econte_ui_v1`）
- `state.tl` = TIMELINE専用状態 `{frame,playing,loop,lastTs,acc}`（cutsではなくビュー側の状態）
- 保存: IndexedDB `econte_db_v1`（store: photos/cuts/meta）。`scheduleSave()`でdebounce、
  ビットマップは`dirtyDraw`等のフラグが立ったカットのみ再エンコード

■ STUDIO（V2-A・1画面統合）
- レイアウト: `#studio-main`(flex) = `#studio-board`(40%) / `#studio-center`(プレビュー＋`#cur-box`) /
  `#studio-sheet`(22%・min200px・`≡`で開閉)、その下に全幅の `#tl-bottom`（TIMELINE帯）
- **フォーカス同期は `renderStudioSync(force)` 1本**。`renderTL()` の末尾から毎回呼ばれる。
  DOMの全再構築はせず、①`.focus` class の付け替え＋`scrollIntoView` ②`renderBoard()`（枠の色）
  ③中央の尺/TEXT欄の値、だけを触る。**①②はフォーカス index が変わったときだけ**
- **入力欄の書き換えは `document.activeElement` を見てスキップ**（再生中に入力が飛ぶのを防ぐ）
- カット数・並び・尺が変わる操作は `refreshStudio()`（右パネル再構築＋TL帯再レイアウト＋同期）、
  1カットの絵/尺だけなら `refreshRow(i)`（サムネ・尺・noteの軽量更新）を使い分ける
- `setCutDur(i,f)` が尺変更の唯一の入口（中央欄・右パネル欄・EDIT上部の3か所から呼ぶ）
- **Space はトランスポート（再生/停止）に取られたので、BOARDの強制パンは Alt / 中ボタン**
  （旧: Space長押し。`spaceHeld` は削除済み）

■ ビュー切替（`setView(v)`）
- `v!=='studio'` の瞬間に `pause()` を呼ぶ（再生の取り残し防止）
- EDITから戻る先は常に STUDIO（`#btn-edit-back` は固定ラベル）

■ カメラ枠列 cam[]（V2-D1・SPEC_13 §5a/§5b）
- `cut.cam[i] = {k,x,y,w,h,dur,ease,key,keyUser}`。**dur = 次の枠までのコマ数**（最終枠には無い）
- `cut.durF` は枠列カットでは **Σcam[].dur の導出値**。`recalcDur(cut)` 経由でしか変わらない。
  **`durF` に直接代入しないこと**（`setCutDur()` は枠列カットを弾いてトーストを出す）
- `bakeRect = fit16_9(union(cam[]) × bakeExpand)`。枠を動かすたび `rebakeFromCam()` が
  再計算→再ベイクする。**定義上すべての枠が bakeRect の内側**（PAN先に画が無い事故が構造的に起きない）
- **bakeRect が動いたら `remapDraw()` が加筆(drawC)を新しいベイク空間へ載せ替える**。
  これが無いと枠を動かした瞬間に加筆と絵がズレる。リサンプルが入るので何度も動かすと甘くはなる
- 描画の入口は3つに分かれた。**混同すると静かに壊れる**:
  - `compositeTo(ctx, cut)` … ベイク空間そのまま（EDIT表示・floodFillの判定元・スポイト）
  - `drawCamFrame(ctx, cut, localF)` … 出力1280×720（STUDIOプレビュー・サムネ・動画書き出し）
  - `drawCamGuide(ctx, cut)` … EDIT表示にだけ枠を重ねる（表示専用。drawC は汚さない）
- **プレビューに直接描くときは `paintCoord()` を通す**（出力座標→ベイク空間へ戻す `camToBake`）。
  `toCanvasCoord()` を直に使うと枠列カットで描画位置がズレる
- ease は `easeT()`（LINEAR / EASE=smoothstep / HOLD=その枠で止まる＝タメ）
- `key` はカラースクリプト一覧（§5h・D3）に出す枠。既定は始点と終点だけ true。
  ユーザーが★を触ると `keyUser` が立ち、以後 `relabelCam()` の既定計算から守られる

■ 可変ベイク解像度と遅延デコード（V2-D2・SPEC_13 §5c/§5d/§5e）
- **`CONTE_W/CONTE_H` は出力解像度（本番枠）専用**。**キャンバス寸法として使わないこと**。
  カットのビットマップ寸法は `bakeSize(cut)` → `cut.bakeW/bakeH`
- 密度 = `CONTE_W / min(cam[].w)`（最寄り枠が等倍）→ `MAX_AREA = 3840×2160` でクランプ。
  クランプ率は `cut.bakeClamp`（「0.82x」表示・**保存対象**）。
  **FIXカット（枠1つ）は bakeExpand を掛けない**ので 1280×720 の等倍を保つ（掛けると画が2%縮む）
- **静かに壊れる場所**（実測で通した）: FILLの `visited` 配列と走査幅／undoの `getImageData`／
  `toCanvasCoord`。`toCanvasCoord` は **キャンバス自身の `el.width/height`** を見る形にしてある
  （editCv=ベイク寸法 / tlCv=出力1280×720 が自動で切り替わる）
- **遅延デコードLRU**: `loadAll()` はビットマップをデコードしない（Blobが正）。
  `ensureResident(cut)` で復号し、`LRU_MAX = 8` を超えたら `evictLru()` が追い出す。
  **`cut.baseC/drawC` を直接読まない** → `getBase()/getDraw()`（非常駐なら null を返し、
  裏で `requestResident()` が走って完了時に再描画する）
  - 保護対象（追い出さない）: EDIT中のカット / 選択中の枠のカット / プレイヘッド±1
  - `touchLru()` からも `scheduleEvict()` を呼ぶ。**ensureResident 経由だけだと
    新規作成やアクセスだけで溜まったぶんが掃かれない**（2026-08-02 に踏んだ）
  - 焼き付けは `encodeCut()`: drawC=PNG／baseC は `cut.baseOpaque` が真なら JPEG q0.85、
    偽なら PNG（透明部分が黒くなるため）
- **枠の編集は常駐カット前提**。`selectCutFrame()` が `ensureResident` を呼び、
  `rebakeFromCam()` は非常駐なら `withResident()` で読み込んでからやり直す
  （非常駐のまま焼き直すと加筆を失う）
- 被覆判定 `updateCoverage(cut)` は 48×27 グリッド。`cut.uncov`（⚠と赤ハッチ）と
  `cut.baseOpaque`（JPEG可否）を同時に決める。写真を動かしたら `invalidateCoverage()` を
  **操作の終わりにだけ**呼ぶ（renderBoard 毎に回すと重い）

■ BOARD（考える場）
- `bDown/bMove/bUp` がMOVE/CUTツール共用のポインタハンドラ。V2-Bで判定順が
  **①選択枠の角ハンドル → ②枠線/C#ラベル（写真より優先）→ ③写真 → ④パン** になった
- CUTツール: 矩形ドラッグ（16:9固定）→`createCutFromRect()`→`bakeCut(src)`で1280×720にベイクし新規カット追加
- `rebakeCut(i)`: 保持している`src`矩形から現在のBOARD内容を再ベイク（SHEETの⟳ボタン）
- **写真の描画は `drawPhoto(ctx,p)` 一本**（V2-B）。renderBoard と bakeCut の両方がこれを通るので、
  回転・モノクロ・輝度/コントラストが「見た目＝焼き上がり」で一致する。
  新しい写真の見た目パラメータを足すときは必ずここに入れること（片方だけに書くとズレる）
- **CUT枠の編集は `camCount/camRect/setCamRect` 経由**（V2-B）。V2-D1 で `cut.cam[]` に
  差し替わる想定で、枠1つ＝`cam[]`の1要素として書いてある。**`cut.src` を直接触らない**
- 枠を離した瞬間に `rebakeFromCam(cut)` で自動再ベイク（`dirtyBase`／`thumb=null`）

■ REF BOARD 連携（V2-B・SPEC_13 §2-1a）
- 送信側は `Tools/ref-board/ref-board.html`（**移動しない**・public repo の本リポジトリには入れない）
- `BroadcastChannel('refboard_live')` と `localStorage['refboard.clip.v1']` の**両方**を見る
  （前者は開いている間の即時反映、後者は後から econte を開いた場合の受け皿）
- `v!==1` / `ts` が24時間以上前 は無視。起動時に古いものは localStorage ごと捨てる
- 写真が増えたら**先頭1枚だけ**に ref を付け、`clip-used` を送り返す（ref-board 側が棚を消す実装済み）
- **同一オリジンでないと繋がらない**（ルートで `python -m http.server 8000`）。
  file:// 用に トップバー ⧉ CLIP からの JSON 手動貼り付けを用意してある

■ 統合Undoログ（V2-B・animator と同じ一元ログ）
- `gLog = [{type, undo(), redo()}]` / `gLogRedo`。STUDIO の Ctrl+Z/Y はこれ、EDIT内は従来の
  カット別スナップショット（`undoStack/redoStack`）。**この2本立てを崩さないこと**
- type: photo-add / photo-move / photo-del / photo-rot / photo-filter / cut-add / cut-rect / cut-del / paint
- paint は ImageData 2枚（≒7MB/件）を持つので `LOG_PAINT_MAX = 8` で別枠制限。
  **カット参照をクロージャに閉じ込める**ので、描いた後に別カットへ移動して Ctrl+Z しても正しいカットが戻る
- 新しい破壊的操作を足したら `pushLog()` を必ず1件積む（積み忘れると Ctrl+Z が1手飛ばす）

■ EDIT のズーム/パン・タッチ（V2-C）
- `state.editView = {x,y,z}` と `gEditFit`（fitスケール）。`applyEditView()` が
  **CSSの width/height と transform(translate) だけ**を書く。
  **`toCanvasCoord()` は getBoundingClientRect ベースなので触らなくていい**（実測で確認済み：
  fit / 3倍ズーム / パン後 のどれでも狙った座標にインクが落ちる）
- `editZoomAt(cx,cy,factor)` がカーソル/ピンチ中心固定のズーム（0.25〜12倍）。FITで {0,0,1} へ
- タッチは `editTouchDown/Move/Up`（1本指=パン・2本指=ピンチ）。ペン/マウスだけ `paintDown` へ
- **カット切替でズームは維持する**（連続トレース用）。リセットは FIT ボタン

■ 指/ペン と マルチタップ（V2-C）
- `paintDown()` は `pointerType === 'touch'` で即 return。**描くのはペンとマウスだけ**
  （STUDIOプレビューは指では何も起きない＝パン先が無いため）
- 2本指タップ=UNDO / 3本指タップ=REDO。`tapDown/tapMove/tapUp` を **window の capture 段**に張って
  いるので、各キャンバスの preventDefault やポインタキャプチャに邪魔されない
- 判定は「全部の指が250ms以内に上がる & 移動<12px」。成立したら `cancelGestures()` で
  直前のピンチ/パンを打ち切る。undo先は `undoActive()`（EDIT=カット別スタック / STUDIO=統合ログ）

■ トレース透かし（V2-C）
- `cut.baseAlpha`（0..1）。`compositeTo()` の **baseC を描くときだけ** globalAlpha を落とす
  → EDIT/プレビュー/サムネ/書き出しの全部に効く。スライダーは EDITサイドとミニツールの両方
- 対象カットは `activeCutIndex()`（EDIT中=curCut / STUDIO=gFocusCut）。
  フォーカスが変わったら `syncBaseAlphaUI()` が両方のスライダーを更新する

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

■ カラースクリプト層（V2-E2・SPEC_13 §9b）
- `cut.colorC`（512×288・**ベイク空間**）／`colorBlend`／`colorAlpha`／`colorBlob`／`dirtyColor`。
  **LRUに乗せない**（`getColor()` が必要時に作り、`evictLru()` は触らない）。
  `loadAll()` では **colorBlob を即デコードして常駐させる**（一覧で待たせないため）
- 合成順は 下地 → baseC → **colorC** → drawC。`drawColorLayer()` が1か所で面倒を見る
  （`compositeTo` と `drawCamFrame` の両方から呼ばれる）
- **描く先は `state.paintTarget`（'draw' | 'color'）**。`paintCanvas(cut)` が返すキャンバスに全部書く。
  `paintSnap/applySnap` はターゲット種別をスナップショットに持つので、
  線画と色でundoが混ざらない。**新しい描画処理を足すときは `getDraw()` 直呼びではなく `paintCanvas()`**
- 座標は `toBakeCoord()`（画面→ベイク空間）→ `paintCoord()`（→ターゲット縮尺）の2段。
  GRIDセルは `cv.dataset.ci/ck` を見て `camToBake` に流す。**スポイトは `toBakeCoord` の方を使う**
- EDITのモードは `gEditMode`。**GRIDが主戦場**（トップバーの EDIT は GRID を開く）。
  `openEdit()` は `setEditMode('single', true)` で単票を強制する＝✎/ダブルクリック専用の入口

■ GRIDの作り（V2-E2b・参考画像＝TS3カラースクリプト準拠）
- **DOM構成**: `#grid-wrap` > `.gr`（行） > `.gr-cells`（セル列）＋`.gr-pal`（行カラー帯canvas）。
  行を明示的に組むのは**行ごとのカラー帯**を出すため（CSS gridのauto-fillだと行境界が取れない）
- **拡縮は `gGridZoom`**（セル幅 = `GC_BASE(200) × zoom`）。列数は幅から自動計算するので
  ズームすると列数が変わる＝スクロールは縦だけ。**CSS transform は使わない**（ボケるため）
- **`updateCellRes()` が可視セルだけ表示サイズ相当の解像度で描き直す**（160px刻み・上限1280）。
  非可視は320pxに戻す。**これを外すと拡大でボケるか、全セル高解像度でメモリが飛ぶ**
- カラー帯は `extractPalette()`（32×18に縮小→4bit量子化ヒストグラム→上位6色→明度順）。
  **導出値なので保存しない**。`drawRowPalette()` が行単位で描く
- 尺バーは `cellFrames()`。**枠列の最終枠は 0 を返す**（到着状態なので尺を持たない）
- セルは `touch-action:none`（ペンで描くため）なので、**指のスクロール/ピンチは自前**
  （`gridTouchDown/Move/Up`）。ペンは `paintDown` に通る
- **コマまたぎ塗り**（`gridStrokeStart/Move/Up`）: ペン/消しゴム×カラー層のときだけこの経路。
  `cellAtPoint()` で今どのセルの上かを毎回引き直し、`strokeSegOn(cut, colorC, a, b)` で
  そのカットに直接書く。**セル外（隙間）では `last=null` にして線を渡らせない**。
  FILL/スポイトは従来どおりセル単位（`paintDown`）
- **ブラシ幅は出力1280px基準**。`gStrokeK = strokeScaleFor(cut, targetW, frame)` を
  ストローク開始時（コマまたぎ塗りは**セルごと**）に決め、`strokeSegOn` が
  `state.brush * gStrokeK` を lineWidth にする。
  これが無いと T.U. した枠のセルだけ4倍太く見える（枠がベイクの一部しか使わないため）。
  上限は `brushMax()`（線画64 / 色300）
- **Undoの分岐は `useCutStack()`＝「EDITのSINGLEだけカット別スタック」**。
  GRIDは1ストロークで複数カットに書けるので統合ログ側。
  **`state.view === 'edit'` で分岐していた箇所を全部これに置き換えてある**（戻すと
  コマまたぎ塗りがUndoできなくなる）。モード切替時は `undoStack/redoStack` を捨てる

■ V2-E1 の小物
- **HSVピッカー**: `gHsv{H,S,V}` は表示用の派生値で、**正は `state.fillColor`(hex)**。
  `updateSwatch()` の末尾で `syncHsvFromColor()` が走る。スライダー操作中は `gHsvDriving` を立てて
  この逆流を止める（立てないと hex→hsv の丸めでスライダーが跳ねる）。
  無彩色(S=0)では色相が定まらないので、直前の H を保つ
- **SHEET行ドラッグ**: `#sp-drop`（挿入線）は `#sheet-list` の子なので、
  **`renderSheetPanel()` は innerHTML='' せず `.sp-row` だけ消す**。
  行の取得も `spRows()`（`.children` だと挿入線が混ざる）。
  6pxのしきい値で click と区別し、ドラッグ直後は `gRowDragged` で click を1回だけ捨てる。
  ここも **setPointerCapture を使わない**（ダブルタップが死ぬ）
- **ショートカット一覧**: `HELP_GROUPS`。TRANSPORT の行は `SHORTCUT_ACTIONS`＋`gKeymap` から自動生成
  （キーマップを足したら勝手に載る）。開いている間はキー入力を素通りさせない
- **プロジェクトZIP**: `exportProject()/importProject()`。**baseC は入れない**（派生物）。
  読み込み後に各カットで `rebakeFromCam()` して焼き直す。JSZip はCDNから遅延ロード

■ FILLパレット
- `animator-color-palette`スキルの正準を移植。localStorageキーは`econte_palette_v1`（他ツールと衝突しない専用キー）
- **V2-Aで正準から意図的に逸脱**: `selectPalSlot()` は `setETool('fill')` を呼ばない（＝色を選んでもツールは変わらない）。
  `＋`（スロット追加）も同様。スキルの canon と差分が出る点なのでコード側にもコメントを残してある
- ミニツール側にも同じ4ボタン（＋ − ⇩ ⇧）がある。ハンドラは `wire()` 内の `palAdd/palDel/palSave/palLoad` を共有

■ iPad ダブルタップ（V2-A・SPEC_13 §4-1）
- `bindDoubleTap(el, fn)` = pointerup 2回が 350ms以内・24px以内。右パネル行とTLクリップに `dblclick` と併用で張る
- **`pointerType === 'mouse'` は即return**（ネイティブdblclickに任せる＝二重発火防止）。
  新しくダブルクリック起動の操作を足すときはこの2本立てを守ること

━━━━━━━━━━━━━━━━━━━━━━━━━━
【既知の落とし穴】
- EDIT/TIMELINEで新しいポインタ操作を足すときは、必ず`cv`引数を通す設計を維持すること
  （`editCv`決め打りに戻すとTIMELINEプレビューでのペイントが壊れる）
- TIMELINE⇔EDITを行き来する処理でundo/redoスタックをクリアし忘れると、
  別カットのスナップショットを誤って適用してしまう
- `renderStudioSync()` の中から `renderTL()` を呼んではいけない（`renderTL` の末尾から呼ばれているので無限再帰）
- 絵を変える処理で `cut.thumb = null` を忘れると、右パネルのサムネだけ古いまま静かにズレる
- **検証時の注意**: 合成 `PointerEvent` では `setPointerCapture` が NotFoundError を投げるため、
  `bDown`/クリップ尺ハンドル/スプリッタが途中で止まる。自動検証では一時的に no-op に差し替えること（実機は無関係）
- **`node tools/check.js` を編集のたびに回す**。2026-08-02 に `addPhotoFromImage(img,name,blob,at)` の
  引数 `at` と同名の `let at` を関数内に足して SyntaxError（＝スクリプト全体が実行されず画面は
  HTMLだけ表示・コンソールも静か）を出した。check.js は `new Function` で必ず捕まえる
- HEIC は保存blobを**必ずJPEGに落とす**（`decodeHeic`）。HEICのまま `photos[].blob` に入れると
  リロード時の `blobToImage` が失敗して写真が消える
- **`window.__ECONTE__` の export リストに存在しない識別子を残すと ReferenceError で
  スクリプト全体が死ぬ**（画面はHTMLだけ出てコンソールも静か）。関数を改名したら export も直すこと。
  check.js はこれを検出できない（`$('#id')` と関数宣言しか見ていない）。2026-08-02 に
  `drawSnap` → `paintSnap` の改名で踏んだ
- `.etool` は**ツールボタンと描く先ボタンの2種類**ある。セレクタは必ず
  `.etool[data-tool]` / `.etool[data-target]` と絞る（`.etool` 全部を触ると相手を壊す）
- **キー処理で `tagName === 'INPUT'` を一律 return にしない**。`range` スライダーは
  フォーカスが残るので、ブラシを触った直後に **Ctrl+Z が無反応**になる（2026-08-02 に踏んだ）。
  判定は `isTextEntry()`（textarea と文字系 input だけ）。range/select は矢印だけ本人に渡す
- Undo/Redo は **`Ctrl+Z` / `Ctrl+Shift+Z`（`Ctrl+Y` も可）＝ ANIMATOR と同じ割り当て**

━━━━━━━━━━━━━━━━━━━━━━━━━━
【V2-D（大判カメラ枠列）に着手する人へ・先読み必須】

SPEC_13 §5 が 2026-07 に差し替わっている（旧「1.2xのりしろ固定＋カメラプリセット」→
**「カメラ枠列 `cam[]` ＋ ベイク範囲＝枠の和集合」**）。理由と全体像は SPEC_13 §5 冒頭。
実装前に現行コードで効いてくる前提だけここに残す:

- **`CONTE_W/CONTE_H` はキャンバス寸法として20箇所ほどに直書きされている**
  （`bakeCut` L801 / `compositeTo` L851 / `cutThumb` L858 / `toCanvasCoord` L1007 /
  undoの`getImageData` L1012,1020,1030 / FILLの走査と`visited` L1057-1084 /
  `eyedropAt` L1136 / `clearDraw` L1219 / EDIT・TLのfit計算 L958,1245,1254）。
  V2-D2 でここを `cut.bakeW/bakeH` に置き換える。**FILLの`visited`サイズとundoの
  `getImageData`を取りこぼすと、症状が出ないまま静かに壊れる**（別カットの寸法で読む）
- `blankCanvas()`（L427）が `CONTE_W/H` 決め打ちなので、引数でサイズを取る形に一般化する
- `bakeCut(src)`（L801）の `s = CONTE_W / src.w` が「密度」を決めている唯一の箇所。
  V2-D2 ではここが `CONTE_W / min(cam[].w)` ＋ `MAX_AREA` クランプになる
- `createCutFromRect()` / `rebakeCut()` は `src` 前提。`cam[0]` 吸収後もこの2関数が
  ベイクの入口であり続けるので、`bakeRect` 再計算 → `dirtyBase` の経路はここに集約する
- **`cuts[]` の canvas は現状すべて常時メモリ常駐**。大判では 1カット66MB になるため、
  V2-D2 で `getBase()/getDraw()` 経由のLRU（既定8カット）に変えるまで大判を作らせてはいけない。
  `cutThumb()` が呼ばれる度にフル合成しているのも同時に直す（`cut.thumb` キャッシュ化）
- V2-D1（枠列＋`drawCamFrame`）と V2-D2（可変解像度＋LRU）は**必ず分けて入れる**。
  D1 はベイク1280×720のままでも動く（解像度が足りないだけ）ので、カメラワークの
  操作感を先にユーザー確認できる

【フェーズ状況】
- P0（BOARD+SHEET+EDIT+IndexedDB保存）: 実装済み
- P1（TIMELINE・動画書き出し）: 実装済み（2026-07）
- P2（animator連携`tdr_live`参加・カラースクリプト一覧PNG）: 未着手
  ※カラースクリプトの仕様は SPEC_13 §5h で確定（**枠単位**で並べる。カット単位ではない）
- P3（manga-plate FRAME接続・OBANコマ送り）: 構想のみ
- **V2-A（SPEC_13）: 実装済み（2026-08-02）** — STUDIO統合／フォーカス同期／フルスクリーン／
  パレット挙動変更／TOOL左右入替／iPadダブルタップ。サムネキャッシュ（§5d の一部）を先取り。
  ミニツールのパレット4ボタン（§3-4）も同時に入れた
- **V2-B: 実装済み（2026-08-02）** — Ctrl+Vペースト／HEIC／写真の回転・モノクロ輝度／CUT枠編集／
  統合Undoログ／REF BOARD連携 `photo.ref`。ペイン境界のスプリッタ（AE風の幅変更）も同時に追加
- **V2-C: 実装済み（2026-08-02）** — `cut.baseAlpha` トレース透かし／EDITズーム・パン／
  指=操作・ペン=描画／2本指UNDO・3本指REDO
- **V2-D1: 実装済み（2026-08-02）** — `cut.cam[]`／`bakeRect` 自動算出／枠列編集UI／
  `drawCamFrame()`／meta.ver 1→2 マイグレーション
- **V2-D2: 実装済み（2026-08-02）** — 可変ベイク解像度（`bakeW/bakeH`・MAX_AREAクランプ）／
  遅延デコードLRU（8カット常駐）／素材はみ出し警告
- **V2-E1: 実装済み（2026-08-02）** — HSVピッカー／SHEET行ドラッグ並べ替え（▲▼撤去・Ctrl+↑↓）／
  SETTINGSショートカット一覧（⚙ / `?`）／プロジェクトZIP入出力
- **V2-E2: 実装済み（2026-08-02）** — EDITの`GRID`モード＋`cut.colorC`＋描画モード5種
- **V2-E2b: 実装済み（2026-08-02）** — GRIDの作り直し（黒背景／ホイール拡縮／可視セル解像度追従／
  行カラー帯／尺バー／装飾最小）。**GRIDが主戦場・SINGLEは詰め用**という主従もここで確定
- 未着手（この順）: **V2-D3 → V2-E3**。
  画面の役割は **SPEC_13 §9 で確定済み（着手前に必読）**。
  **D3の一覧PNGは GRID をそのまま大きく描くだけ**（`colorCells()`／`cellSub()` が既にある）
  - **E2** カラースクリプト編集: EDITに `GRID` モード＋`cut.colorC`（512×288・**LRU対象外で常駐**）
    ＋ブレンド（既定=乗算）。合成順は bg→baseC→layers→**colorC**→drawC
  - **D3** 出口: INFO帯＋MP4＋一覧PNG。**E2 のGRIDがそのまま一覧PNGになる**ので E2 を先にやる
  - **E3** コラージュ: `cut.layers[]`（最大5・原本Blob＋アフィン変形＋投げ縄マスク＋ブレンド）
    ＋ブラシチップ（**.abrパーサは作らない**・内蔵数種＋透過PNG読み込み）
- **既存データの互換は当面考えなくてよい**（2026-08-02 ユーザー確認・テスト段階のため）

【変更後チェック】
node tools/check.js（6ファイル一括。econte.html含む）
