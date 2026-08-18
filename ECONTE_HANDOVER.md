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
- **`cut.camLead` / `cut.camTail`（2026-08-14 追加）** = 頭で A枠に止まるコマ数 ／ 尻で最終枠に
  止まるコマ数。**カット内の時間 = lead + Σdur + tail**。これで「PAN/T.U. の動き出しと
  止まりの位置」をTIMELINEの◆で動かせる（旧モデルは A が常に0f固定だった）
  - `camAt()` / `colorMixAt()` / `burnLabel()` は **必ず `f - camLead(cut)` を時間軸にする**。
    片方だけ直すと色だけ先に動く
  - `camStartFrame(cut,k)` は lead 込みの位置を返す（＝◆の表示位置とセル描画のフレーム）
- `cut.durF` は枠列カットでは **lead + Σcam[].dur + tail の導出値**。`recalcDur(cut)` 経由でしか
  変わらない。**`durF` に直接代入しないこと** — 尺を変えるなら `setCutSpan(i,total)`
  （枠列カットは **tail が差を吸う**。足りなければ最後の区間を詰める）。
  `setCutDur()` も `clipDragMove()` もここを通る＝枠列カットでも尺入力とクリップ右端ドラッグが効く
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
  - **`cut.cellCache`（2026-08-14）**: `evictLru()` が追い出す**直前**に GRIDセル用の 320×180 を
    焼いておく配列（枠ごと）。`ensureResident()` で常駐に戻った瞬間に捨てる＝
    **作るのが追い出す瞬間だけなので「無効化の管理」が要らない**（常に最新）。
    - これが無いと、GRIDは1画面に数十セル出るのに LRU_MAX=8 しかないため
      「白く抜ける→読み込む→別のが追い出される」で延々ちらつく（iPadで「絵が消えてまた戻る」）
    - **色は焼き込まない**（カラー層はLRU対象外＝常に手元にある）。焼き込むと非常駐カットに
      色を塗った瞬間セルが古い絵で止まる。`drawCell()` が控え→色の順に重ねる
    - `requestResident()` の完了時は **`inGrid()` なら `refreshGridCells()`**。
      `renderEditCanvas()` だけだとGRIDが描き直されずセルが白いまま残る
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
- **モード切替の入口は `setBoardTool()` 一本**（2026-08-14）。BOARD上端に横一杯で固定した
  `#board-topbar`（高さ34px・`has-clip` のとき top:26px）のボタンと、`V`/`C` ショートカットが
  ここを通る。`#board-tools`（浮きパネル）は選択中オブジェクトの設定だけを持つ形に整理した
- **`cut.lock`（2026-08-14）**: SHEET行の 🔒 で切替。`hitCutFrame()`/`hitCutHandle()` が
  **当たり判定ごと外す**（選択はできるが動かせない、では結局動くため）。
  BOARDでは破線＋🔒、TLクリップも破線、バー右端に「🔒 n」
- **ショートカットの単押し判定**: `onKey` の `SHORTCUT_ACTIONS` ディスパッチは
  **修飾キー付きを素通しする**。入れないと Ctrl+V（写真ペースト）が V=MOVE に食われる
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
  file:// 用に トップバー **⧉ REF**（旧 ⧉ CLIP）からの手動貼り付けを用意してある
- **貼れる形は4つ**（2026-08-14・`refItemsFromText()`）。ref-board 側の出口が1つではないので
  全部受ける: ①クリップJSON `{v:1,item}`（クリップ帯の ⧉）②ボード全体JSON `{v:1,items:[…]}`
  （📋 JSONをコピー / ⬇ JSON書き出し）③Markdown `- [title](url) #tag — memo`
  （📝 表示中を Markdown コピー）④生URL。
  **複数件なら `modalPick()` で1件選ばせる** — REFは「次に貼る写真1枚」に付くものなので
  配列で持たない（持つと「どれが付いたか」が分からなくなる）

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

■ トレース透かし＋元の絵の重ね順（V2-C / 2026-08-14）
- `cut.baseAlpha`（0..1）。**元の絵を描くのは `drawBaseLayer()` 一本だけ**。
  `compositeTo()` と `drawCamFrame()` の両方がこれを通る → EDIT/プレビュー/サムネ/書き出しの
  全部に効く。スライダーは EDITサイドとミニツールの両方
- **`cut.baseOver`** = 元の絵を加筆の上に重ねる（ANIMATORのREFと同じ扱い＝透かして参考にする）。
  既定 false＝従来どおり下敷き。合成順は
  `bg → base → 色 → draw`（下）／`bg → 色 → draw → base`（上）。**元の絵は1枚なので上下どちらか一方**
- ペイントは `drawC`/`colorC` にしか書かないので、**元の絵は描いても消しても壊れない**。
  唯一の破壊口は `CLEAR BASE` で、そこは `gBaseUndo`（1手・現在カット限定）で戻せる。
  **統合ログ(gLog)には積まない** — EDITのCtrl+Zが統合ログへ抜けると cut-add/photo-add まで
  遡ってしまい、2026-08-02 の事故と同じ経路になる
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

■ TIMELINE 座標規約（2026-08-14・composer-timeline-kit §0 準拠）
- **帯に何かを描く/掴ませるなら `frameFrac(f)` と `pxToFrame(px,幅)` を必ず通す。**
  ルーラー / クリップ / プレイヘッド / ◆キー / 区間バー / スクラブ / 尺ドラッグ / 波形 が全部これを見る。
  片方だけ `f/T` のままにすると、拡大したとき「掴んだ場所と違うコマが動く」
- `state.tlView = {start, span}`。**span=0 が「全体表示」**で、そのとき2関数は拡大前と
  同じ値を返す＝ズームを使わない移植先でも同じコードが動く
- Alt+ホイール=拡大縮小（`tlZoomAt`・カーソル下のコマを固定）／ホイール単独=拡大中の横スクロール／
  「全体」ラベル or 帯のダブルクリックでリセット。再生中は `tlFollowPlayhead()` が追いかける
- 帯の高さは `gUi.tlH`（localStorage）＋上端の `#tl-resize`。キー行は CSS変数 `--keyh`＝高さの40%
  （26〜72px）。**画面の55%で頭打ち**にしてある（低い画面で帯が全部食い潰さないよう）

■ TIMELINE のカメラキー行 `#tl-keys`（2026-08-14）
- ◆＝`camStartFrame(cut,k)` の位置 ／ 区間バー＝`cam[k].ease`（クリックで `openEaseMenu()`）
- **`layoutCamKeys()` は先頭で `innerHTML=''` する**。ドラッグ中に毎回呼ぶので、
  消さないとノードが積み上がる（実際に一度踏んだ）
- ◆ドラッグ（`camKeyDown/Move/Up`）は **durF を変えない**＝後ろのカットがずれない。
  隣だけを付け替える: 先頭◆→`lead`と`cam[0].dur`（B の位置は動かない＝AEと同じ感覚）／
  最終◆→`cam[n-2].dur`と`tail`／中間◆→前後の `dur` を等量トレード。
  ドラッグ開始時のスナップショット(`before`)から**毎回引き直す**（差分を積むと誤差が溜まる）
- ロック中のカットの◆は掴めない（`cut.lock`）
- イーズは `EASES` ＋ `EASE_INFO`（短縮名と色）。**カーブエディタは作らない**方針で、
  現場語のプリセットを並べる: LINEAR / EASE / IN(送り出し) / OUT(引き) /
  Q.PAN(クイックパン) / FAIRING(フェアリング) / HOLD(タメ)。
  足すときは `easeT()` の switch と `EASES` と `EASE_INFO` の3点セット

■ 音（TIMELINE最下部バー・2026-08-14）
- `gAudio {name,blob,url,el,dur}` / `gAudioOffset`(コマ) / `gAudioMuted` / `gAudioPeaks`(1コマ1点)
- **Blobが正**。IndexedDB の `meta` ストアに `{k:'audio'}` として同居する。
  `idbClearPut('meta',…)` は store を空にするので、**meta を書くところ全部に音のレコードを含める**
  （マイグレーション側の書き戻しを落として一度消しかけた）
- 波形はルーラー(`#tl-ruler-cv`)の背景。`frameFrac` を通すので拡大しても絵と合う
- `syncAudio()` が唯一の同期口。play/pause/seek/ループ折り返しから呼ぶ。
  **`gExporting` で止めないこと** — 実時間録画は「鳴っている音」をそのまま録るため
- **配線は `ensureAudioGraph()` の1本**（`el → src ┬→ gain → 出力 ／ └→ recDest → 録画`）。
  **`el.muted` は使わない**。使うと「作業中は消したい」だけのつもりが書き出しからも音が消える。
  ミュートは gain（モニター）だけに効かせ、録音は gain より手前の recDest から取る。
  `createMediaElementSource` は同じ要素に2回作れないので、音を差し替えるときは
  `clearAudio()` が `gAudioNodes = null` にして**ノードごと作り直す**

■ EXPORT VIDEO の音（2026-08-14）
- **WebCodecs経路（本命・非実時間）**: `renderAudioForExport(T)` が
  **タイムラインと同じ長さ・同じ位置の1本**に焼き直す。ずらし／頭切れ／尻の無音は
  `OfflineAudioContext(ch, T/FPS*sr, sr)` に `start(遅らせ, 内側の頭出し)` するだけで片づく
  （自前でサンプルをずらすと符号の扱いをどこかで必ず間違える）。
  そのあと `AudioEncoder('mp4a.40.2')` → `muxer.addAudioChunk`。
  `fastStart:'in-memory'` なので **映像を全部入れた後にまとめて音を足してよい**
  - AudioData は `f32-planar`＝**ch0を全部並べてからch1**（インターリーブではない）
  - AACは最大2ch想定なので `min(2, src.numberOfChannels)` に落とす
  - `canEncodeAac()` は **映像とは別に**見る。ダメでも映像だけ出す（書き出しごと落とさない）
- **MediaRecorder経路（実時間フォールバック）**: `recDest.stream` の音声トラックを
  `tlCv.captureStream()` に `addTrack` するだけ。ずらしは `syncAudio` が面倒を見ている
- **ミュートしても書き出しには入る**（実測で確認済み）

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
  再割当UIは未実装（P2以降・現状はlocalStorage手書き編集のみ）。
  **⚙一覧に「再割当できる」と書かないこと**（animatorと違いUIが無いため）
- **2026-08-13: SHEETパネルの開閉ボタン（`≡`）を廃止し、`sheet`アクション（既定`S`）に置き換えた。**
  トップバーを空けるため。`SHORTCUT_ACTIONS`に載せたので⚙一覧へ自動掲載され、将来の再割当UIにもそのまま乗る。
  ショートカット判定は`state.view==='studio'`ブロック内＝**EDITでは反応しない**（SHEETはSTUDIO専用のため意図どおり）。
  ボタンが無くなり「閉じたら戻し方が分からない」事故が起きうるので、**閉じたときだけ**`toggleSheetPanel()`が
  「Sで開きます」とtoastを出す。開閉状態は`gUi.sheet`でlocalStorage保存＝**閉じたままリロードしても`S`で復帰できる**

■ カラースクリプト層（V2-E2 / E2c・SPEC_13 §9b）
- **`cut.colors[k]`＝枠ごとに1枚**（`{c, blob, blend, alpha, dirty}`）。
  `c` は 512×288 で **出力枠(1280×720)の空間**。アクセサは `colorSlots()/colorSlot()/getColorAt()`
  - **ベイク空間で持ってはいけない**: T.U.のB枠はA枠の内側なので、A/Bが必ず同じ色になる
    （2026-08-02 に作り直した）。出力枠空間なら独立するうえ、座標変換もブラシ倍率補正も要らない
  - `cam[]` を splice したら **`colors` も同じ位置で splice する**。`snapshotCam()` は両方を持つ
  - **LRUに乗せない**（小さいので常駐。`loadAll()` で即デコード）
- 合成順は 下地 → baseC → **色** → drawC。入口は2つ:
  - `drawColorFrame(ctx, cut, f, W, H)` … 出力枠へ。区間の始点/終点を
    **通常合成でクロスフェードしてからブレンドを1回だけ**掛ける（2回重ねると中間が濁る）
  - `drawColorPlate(ctx, cut, W, H)` … ベイク空間へ。各枠の色をその枠の位置に置く（SINGLE表示・FILL判定元）
- 色を編集するのは **GRIDだけ**。`state.curFrame` が編集中の枠index
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
- **セルの複数選択**は `gSelCells`（"i:k" の配列）。キャプションクリックで選択、Ctrl=追加/解除、
  Shift=範囲。`eachSelSlot()` が「選択中（無ければ現在セル）」へ一括適用する入口で、
  濃・描画モードはここを通す。`moveSelCuts(d)` が選択カットのまとめ移動
- **コマまたぎ塗りの直後は、またいだセルを全部選択状態にする**（2026-08-14・`gridStrokeUp` 末尾）。
  濃/描画モードは `eachSelSlot` 経由の一括適用なので、これが無いと
  「5コマまたいで塗ったのに濃を動かすと1コマしか変わらない」になる
- **ブラシ幅は出力1280px基準**。`gStrokeK = strokeScaleFor(cut, targetW, frame)` を
  ストローク開始時（コマまたぎ塗りは**セルごと**）に決め、`strokeSegOn` が
  `state.brush * gStrokeK` を lineWidth にする。
  これが無いと T.U. した枠のセルだけ4倍太く見える（枠がベイクの一部しか使わないため）。
  上限は `brushMax()`（線画64 / 色300）
- **Undoの行き先は3つ。混ぜてはいけない（2026-08-02 にユーザーのカットが消えた）**:
  - EDIT SINGLE → `undoStack/redoStack`（カット別スナップショット）
  - **EDIT GRID → `gColorLog/gColorRedo`（カラーの塗りだけ）**
  - STUDIO → `gLog/gLogRedo`（統合ログ: photo-* / cut-* / paint）
  事故の内容: GRIDのCtrl+Zが統合ログを叩いていたため、連打すると `cut-add`/`photo-add` まで
  遡ってカットと写真が消え、そのまま自動保存された。**paint は `pushPaintLog()` を通すこと**
- Undoの分岐は `useCutStack()`＝「EDITのSINGLEだけカット別スタック」／`inGrid()` でカラーログ。
  GRIDは1ストロークで複数カットに書けるので統合ログ側。
  **`state.view === 'edit'` で分岐していた箇所を全部これに置き換えてある**（戻すと
  コマまたぎ塗りがUndoできなくなる）。モード切替時は `undoStack/redoStack` を捨てる

■ ブラシまわりの手癖（V2-E2d・正準は animator / スキル `animator-brush-ops`）
- **EYEツールは無い**。`paintDown` 冒頭の `e.altKey` でスポイト。色帯クリックでも拾える
- `onDoubleActivate`（350ms/28px）… PEN=筆圧トグル / ERASE=今の描く先をCLEAR
  - **ERASE WクリックはANIMATORにも既にある**（`animator.html` L5798。ただし helper を使わず
    click の時刻差380msを自前で測る書き方＝`onDoubleActivate(` の grep では見つからない）。
    2026-08-10 にこれを見落として animator に二重実装しかけた。**要素側でも grep すること**
- `onDoubleActivate` … **FILL=透明消し（`state.fillErase`）**。バケツ・投げ縄の両方に効く
  （RGBA全部0で書く）。**erase判定に `state.etool === 'eraser'` を使わないこと**——
  投げ縄/バケツはFILLツールでしか起動しないので永遠にfalseになる（2026-08-09 に踏んだ）
- `onLongPress`（500ms/12px）… FILL=バケツ⇔投げ縄（ラベルも FILL⇔LASSO に変わる）
- `bindSizeDrag` … 右ドラッグでブラシサイズ。**`contextmenu` の preventDefault が必須**、
  move/up は window。上限が大きい色ターゲットでは1段の幅を `brushMax()/64` 倍する
- 筆圧は `pressFactor(e)` を都度更新して `state.brush * gStrokeK * gStrokePress`。
  **ペン軸のときだけ**効かせる（指で細ると事故る）
- 投げ縄は `lassoFillPolygon()`（スキャンライン）。頂点は塗る先の座標、プレビュー用に
  表示座標も別に持つ。プレビューは「下地を描き直して破線」で、**描画レイヤーには描かない**
- **CLEAR系は `pushUndo()` を直呼びしない**。`beginPaintUndo()/endPaintUndo()` を通すこと
  （場面ごとにUndoの行き先が違うため。2026-08-02 に GRID で戻せない不具合を出した）
- Tab = TOOLパネル左右入替

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

■ V2-G「iPad指運用＋UI整理」（2026-08-15）
- **役割の分担を固定した**: iPad は **指＝選択と操作／ペン＝枠置きとペイント**。
  指で描ける場所は無い（`paintDown` の touch return に加え、**`gridPaintDown` も touch を
  選択だけで返す**）。GRIDで「セルを選ぼうとしただけで色が乗る」のは
  `gridStrokeStart` が pointerType を見ていなかったため
- **指の長押し＝スポイト**（`bindTouchEyedrop` 500ms/12px）。拾い元は
  **`eyedropView()`＝表示されているキャンバスの画素**なので、非常駐カットでも効く。
  `eyedropAt()` もレイヤーから拾えないときはここへ落ちる（Altクリックが空振りしない）
- **SHEET行は長押ししてから掴む**（`ROW_HOLD_MS=350`）。それ以前に指が動いたら
  `gRowDrag` を捨てて一覧のスクロールに譲る。掴んだ後は `#sheet-list` の
  **非passive `touchmove` で preventDefault**（`touch-action` は途中で変えても効かないため）
- **当たり判定を広げた**: `.tl-key::before{inset:-9px}` ／ `.tl-clip-h` 12→20px ／
  `.splitter::before`・`#tl-resize::before` で外側±5〜6px。
  さらに **`clipEdgeAt()`** で「カット境目の近くはスクラブより尺ドラッグを優先」
  （＝境目を掴もうとしてインジケータが飛ぶのを止める）。
  尺ドラッグの move/up は **window に一本化**（帯から始めた場合もハンドルから始めた場合も同じ経路）
- **`body.ui-big`**（SETTINGSの「大きいUI」・`gUi.uiBig`）。初回だけ `pointer:coarse` で決める。
  **id付きセレクタで書かれている所（`#board-topbar .btn` / `#tl-minitools .etool` 等）は
  ui-big 側も id で上書きしないと効かない**。バーの高さは `--bartop` 1か所で
  `#bar` と `.view{top}` を揃える（伸ばして top を直し忘れると本文がバーに潜る）
- **`ctx.filter` 非対応（iPad Safari 16以前）の代役**: `CTX_FILTER_OK` を1回だけ判定し、
  無ければ `filteredSource()` がピクセル処理で焼く（CSSと同じ順 grayscale→brightness→contrast、
  式は `y = x*b*c + 127.5*(1-c)`）。**ドラッグ中は 1400px・ベイク時は 4096px** の2段
  （12MPを毎フレーム回すと確実に固まる）。`drawPhoto(ctx,p,hiRes)` の第3引数がその切替で、
  `bakeCut` だけ true を渡す。**見た目＝焼き上がりの一致は drawPhoto 一本を通すことで保つ**
- BOARDのCUT枠: **枠線の下に暗い線を1段太く敷き、C# は黒い台紙の上に置く**
  （白い紙の上で黄色が飛ぶため。枠自体は黒くしない）

■ V2-G のUI整理（重複を落とした・2026-08-15）
- **撤去**: BOARDの `FIT` ボタン（→ `F` キー）／`#cutframe-panel`（CUT 枠列パネル）ごと／
  `#board-hint` と `.mini-note`（→ SETTINGS の BOARD 章）／EDITの `◀ STUDIO`（→ 最上部の STUDIO）／
  `⇄ TOOL` と `⇄`（→ Tab のみ）／ミニツールの HSB・パレット・パレット4ボタン（→ Altスポイト/長押し）／
  音バーの `⇧ 音を読み込み`（→ 見出し **AUDIO 自体がボタン**）／`#help-note`
- **移した**: `C#` と `＋枠` → BOARD上端のモードバー（`#cutsel-box`）／
  `★`（`cam[k].key`）→ **SHEET行**（`.cam-stars`・枠が2つ以上のカットだけ）／
  `余`(bakeExpand) → SETTINGSのヘッダ（選択枠が無いと `.off`）／
  枠ごとのコマ数とイーズ → TIMELINE（◆ドラッグ・区間バークリック。もともとそこにある）
- **`renderCamList()` は名前を据え置いたまま中身を差し替えた**（呼び出し元と `__ECONTE__` の
  export がそのまま生きる）。いまは「topbarのC#表示＋SETTINGSの余スライダー」の同期だけ
- `refreshRow(i)` は★の枚数が変わったときだけ行を作り直す（毎回作り直すとスクラブが重い）
- **SINGLE でも 濃/描画モードを触れるようにした**。以前は GRID 限定で灰色になっていて
  「バグか仕様か」が分からなかった。対象は `state.curFrame` の枠で、`.pnl-t` に「（対象: A 枠）」と出す。
  **色を"描く"のは従来どおり GRID だけ**（座標空間が別なので）。
  SINGLEへ移るとき `gSelCells` は捨てる（見えていないコマに濃が効かないように）

■ FRAME / TIME は2か所ある（2026-08-15・**意味が違うので混ぜないこと**）
- **中央（内容・セリフの上）= そのカット単体の尺**。`尺(秒+コマ)` / `FRAME(コマ数)` /
  `TIME(H:MM:SS:FF)` は同じものの別表記で、**どれを打ち換えても `setCutDur()` に入る**
- **TIMELINE のトランスポート = 全体の通し位置**。打ち込むとインジケータが飛ぶ（`seek`）。
  並びは中央と同じ `FRAME … / TIME …` にしてある（ぱっと見で対応が取れるように）
- 変換関数も **2種類あるので取り違えないこと**:
  - 位置 → `frameToTimecode` / `parseTimecodeToFrame`（COMPOSER と同じ規約で **先頭コマ=01**）
  - 尺   → `durToTimecode` / `parseDurTimecode`（**+1 しない**。48コマ = 0:00:02:00）
- 入力は `bindTcEdit(sel, cur, parse, apply)`。**`apply` が行き先**（seek か setCutDur）。
  Enter確定 / Esc取消 / blurで確定 は COMPOSER と同じ
- **焼き込みにも TIME を出す**（`burnLabel()` の末尾）。入る文字が伸びたので
  「画面内」モードの黒帯は `measureText` で実測して敷く

■ マーカー（2026-08-15・composer-timeline-kit §4 準拠）
- **`gMarkers = [{f, label}]`**（COMPOSER の `state.markers=[{frame,label}]` と同じ形）。
  **音と同じ meta レコード**（`{k:'audio'}`）に同居させるので、meta を書くところは全部セットで書く
- 手触りも COMPOSER に揃える: `M`＝打つ/消す（`markerNear()` が画面上8px ぶんを「同じ位置」とみなす）／
  `,` `.`＝前後へ／**ドラッグ＝移動**／**Ctrl+クリック＝削除**／**Wクリック＝メモ**
  （COMPOSER は native prompt だが、ECONTE は `modalPrompt` に揃える）
- 見た目も `.tl-gmarker` 準拠の **縦線＋ラベル**（`data-label` を `::after` で出す。既定は `M1`,`M2`…）
- DOMは `#tl-marks`（ルーラーの上・`pointer-events:none`＋マーカーだけ auto）。
  **pointerdown は stopPropagation**（帯のスクラブに取られないため）。`layoutTL()` から張り直す

■ 音の「ずらし」スクラブ（2026-08-15）
- `#audio-offset-scrub` を左右ドラッグ。**1コマ＝`pxPerFrame()`** にしてあるので
  波形を見ながら合わせられる（数値入力は AE の測定値を打つ用に残す）
- ドラッグ中は `setAudioOffset(f, true)` で保存を抑え、離した時に1回だけ `scheduleSave()`

■ V2-G2（2026-08-15・追いブラッシュアップ）
- **画面の行き来はキーで**（`SHORTCUT_ACTIONS` に `global:true` を追加した）。
  `global` 印のものは **STUDIO / EDIT の両方**で効く＝`onKey` の studio 限定ブロックの
  **手前**に専用のディスパッチを1つ置いてある。印の無いものは従来どおり STUDIO だけ
  - `1`=STUDIO ／ `2`=EDIT(GRID) ／ `3`=SINGLE ／ `4`=GRID ／ **`X`=STUDIO ⇄ GRID 入替**
  - 入口は `enterEdit(mode)` / `gotoEditMode(m)` / `swapStudioGrid()` の3本。
    トップバーの EDIT ボタンも `enterEdit('grid')` を通る（分岐を二重に書かない）
- **◆が掴めない問題を直した**。`tail=0` の A→B では **B（カット尻）と次のカットの頭が同じコマ**に来る。
  さらに `.tl-key` は 45°回転していたので、回転要素に当たり判定を持たせると
  **外接矩形が巨大化して隣の◆を食う**（11px の◆が実質41px四方を占めていた）。
  - `.tl-key` を **回転しない当たり箱（24×15）＋ `::after` の回転した◆** の2層に作り直した
  - `layoutCamKeys()` の `placeKey()` が、近すぎる◆を **段違い**に置く（xは正しい位置のまま）。
    帯の両端に来た◆は数px内側へ寄せる（半分見切れて掴めないのを防ぐ）。
    **どちらも表示だけの調整**。`camKeyMove` は掴んだ位置からの相対差分なので影響しない
- **SINGLE でも色が塗れる**ようにした（`.etool[data-target="color"]` のグレーアウト廃止）。
  色は「出力枠の空間」なので、ベイク面である editCv から塗るときだけ
  **`bakeToColorCoord()` で枠に切り戻す**（`sampleCompositeColor` と同じ換算の書き下し）。
  ブラシ幅は `gridStrokeTo` と同じく **常に `COLOR_W/CONTE_W`**（枠の寄りに依らない）
  - どの枠を塗るかは `#color-frame-pick` の A/B チップ（`renderColorFramePick`）。GRIDでは出さない
  - **線画/色のボタンは2つのまま**。色だけ 乗算・濃 を持ち CLEAR も別なので統合しない
  - `renderColorFramePick` は `dataset.keys` でDOM再構築を省くが、**隠すときに鍵も捨てる**こと
    （中身だけ消して鍵を残すと、次に出したとき空のまま出る。実際に踏んだ）
- GRID の表示コントロール（`− % ＋ FIT 色帯 行間 列間`）は **EDIT上部バーへ引き上げた**
  （旧 `#grid-hud` は撤去。画の上に何も浮かせない）。`#view-edit.grid` の有無で
  `#view-ctl-single` / `#view-ctl-grid` を差し替える。`#edit-top` も `#bar` と同じく横スクロール
- BOARD の MOVE / CUT は **紫**（上部メニューの STUDIO/EDIT＝ピンクと役割が違うため）。
  2つは濃さで区別する（MOVE=濃い / CUT=明るい）
- トップバーの並び: `… ⇧PROJ ⇩PROJ EXPORT VIDEO ⇩C.SCRIPT ⚙ ⛶ HOME`（出すものを固めた）
- **`setPointerCapture` は全部 try/catch で包んだ**。合成 PointerEvent では必ず投げるので、
  包まないと自動検証でハンドラが途中で死ぬ（ECONTEの検証で毎回踏んでいた）

■ 画面まわり（2026-08-15）
- **`@` でカーソル下のペインを最大化**（AEの `~`）。`gPointer` に最後のカーソル位置を持ち、
  `paneAtPointer()` で BOARD/プレビュー/SHEET/TIMELINE帯 のどれかを選ぶ。
  実装は `.pane-hide` / `.pane-max` の付け外しだけ（`:has()` に頼らない）。
  **TIMELINE帯を最大化したときは `#studio-main` を隠す**（帯は studio-main の外にあるため）
- **中央下「内容・セリフ」欄の高さ**は `#split-cur`（`.hsplit`）＋ `gUi.curH`。
  `#cur-note{height:var(--curh)}`
- **ミニツールは横1行・既定は隠し**（`gUi.tools`）。`applyUi()` が `#tl-minitools.hidden` と
  `#btn-tl-tools` の表示を両方持つ
- **SETTINGSはスクロールを出さない**。`#help-body` を CSS columns に流し、
  はみ出したぶんだけ `--hs` で全体を縮める（`fitHelpBody()`・面積で効くので √ で寄せる）。
  **`toggleHelp` は先に `.on` を付けてから `renderHelp()`**（隠れたままだと clientWidth=0 で測れない）
- **全消去**（`wipeAll()`・SETTINGSのCLOSE隣）。2段確認。ZIPが唯一の保険なので
  **`exportProject()` に音とマーカーも入れた**（入れないと全消去で戻せないものが残る）

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
- ~~検証時の注意: 合成 `PointerEvent` では `setPointerCapture` が NotFoundError を投げる~~
  → **2026-08-15 に全箇所 try/catch で包んだので、そのまま合成イベントで検証できる**。
  新しく `setPointerCapture` を書くときも必ず包むこと（包み忘れると自動検証だけ静かに壊れる）
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
- **V2-E2c: 実装済み（2026-08-02）** — カラー層を**枠ごと・出力枠空間**へ作り直し（A/B独立）／
  セル複数選択→濃・描画モードの一括変更／選択カットの一括並べ替え／Undoの場面別分離／
  ✎をキャプション行へ／行間トグル／↑↓でカット選択
- **V2-E2d: 実装済み（2026-08-02）** — ANIMATOR準拠のブラシ操作（右ドラッグでサイズ／
  PEN Wクリックで筆圧／ERASE WクリックでCLEAR／FILL長押しで投げ縄塗り／EYE撤去＋Altスポイト／
  色帯スポイト／Tabで左右入替）。スキル `animator-brush-ops` に正準を書き出し済み
- **V2-D3: 実装済み（2026-08-09）** — 焼き込み3モード（OFF/画面内/INFO帯）／MP4書き出し／
  カラースクリプト一覧PNG
  - **出力1フレームは `renderOutputFrame(ctx, ca)` 一本**。プレビュー・MP4・録画が全部ここを通る＝WYSIWYG。
    焼き込みを足すときはここだけ触る
  - MP4は `WebCodecs(avc1.42001f) + mp4-muxer(CDN)` の**非実時間**。
    `canWebCodecs()` が false のときだけ `exportRecord()`（従来のMediaRecorder実時間録画）へ落ちる。
    **非実時間経路はタブが非表示でも焼ける**（rAFを使わないため）
  - 一覧PNGは `exportColorScript()`。GRIDの部品（`colorCells/cellFrames/cellSub/extractPalette`）を
    そのまま大きく描くだけ。**プリント体裁は作らない**（1枚の長いPNG）
- **V2-F: 実装済み（2026-08-14・ブラッシュアップ依頼）** — 元の絵のレイヤー扱い（`baseOver`＋
  CLEAR BASE の戻し）／GRIDのまたぎ塗り一括＋非常駐セルの控え（白抜け解消）／
  BOARD上端の固定モードバー＋`V`/`C`／`cut.lock`（SHEETの🔒）／
  TIMELINE 座標規約＋Alt+ホイール拡大＋高さ可変＋◆キー編集（`camLead`/`camTail`）＋イーズ7種／
  最下部の音バー（読み込み・ずらし・波形・24fps）／`+ IMPORT` 表記／`⧉ REF` の寛容パーサ
- **V2-F2: 実装済み（2026-08-14）** — **EXPORT VIDEO に音を載せた**（WebCodecs=AAC／
  MediaRecorder=recDestのトラック追加）。ミュートは gain に移してモニター専用にした
- **V2-G: 実装済み（2026-08-15・ブラッシュアップ依頼）** — iPad の指運用（GRID指=選択専用／
  指の長押しスポイト／SHEET行の長押し並べ替え／当たり判定拡大＋境目優先／大きいUI）／
  `ctx.filter` 非対応環境での GRAY・明・コの代役／BOARD枠の黒台紙＋暗い縁／
  UI整理（FIT・枠列パネル・◀STUDIO・⇄・ミニツールのHSB/パレット・音読込ボタンを撤去、
  ★はSHEETへ、余はSETTINGSへ）／尺のコマ数入力＋FRAME/TIME＋焼き込みTIME／
  マーカー（M）／ずらしスクラブ／`@`でペイン最大化／内容欄の高さスプリッタ／
  SETTINGS1画面化＋全消去／PROJ ZIP に音とマーカーを同梱
- **V2-G2: 実装済み（2026-08-15・追いブラッシュアップ）** — 画面切替のショートカット
  （`1`/`2`/`3`/`4` と **`X`＝STUDIO ⇄ GRID 入替**・`global` 印で EDIT でも効く）／
  ◆の当たり判定作り直し（回転を外した当たり箱＋段違い配置。tail=0 の B が掴めなかった）／
  SINGLEでも色を塗れるように（`bakeToColorCoord` ＋ A/B チップ）／
  GRIDの表示コントロールを上部バーへ（`#grid-hud` 撤去）／MOVE・CUT を紫に／
  トップバーの並び（⇩PROJ → EXPORT VIDEO → ⇩C.SCRIPT）／
  中央=カット尺・TIMELINE=通し位置 の FRAME/TIME 2系統／
  マーカーを `{f,label}` にして ドラッグ移動・Ctrl+クリック削除・Wクリックでメモ／
  `setPointerCapture` を全部 try/catch
- **V2-G3: 実装済み（2026-08-17・追いブラッシュアップ）** — 下記の18点。
  設計上いちばん効いているのは **「A/Bチップの撤去」と「添字ズレの一括修正」** の2つ。

  | | 変えたこと | 要点（次に触る人向け） |
  |---|---|---|
  | 1 | **SINGLEの色は「塗った場所」で枠が決まる** | `frameAtBake()` が `cam[]` を**後ろから**探す＝`drawColorPlate` の重ね順と一致する（＝見えている色の持ち主）。T.U.（B⊂A）でも PAN でもこの1本の規則で足りる。A/Bチップ (`#color-frame-pick` / `renderColorFramePick`) は撤去 |
  | 2 | 枠をまたぐ1ストローク | `gPlateMode` 中は**座標をベイク空間で持ち回る**。`plateStrokeSeg()` が区間ごとに行き先の枠を決め、**またいだ区間だけ両方の層に引く**（継ぎ目で切れない）。GRIDの「コマまたぎ塗り」の枠版 |
  | 3 | 色のUndoは枠ぶんまとめて | `paintSnap()` が `state.paintTarget==='color'` のとき `{all:[ImageData…]}` を返す。1ストロークがA/B両方に乗るので、片方だけ撮ると戻せない |
  | 4 | CLEAR DRAW / COLOR ボタン撤去 | ERASE のWクリックと同義だったため。**SINGLEの色は見えている枠ぶん全部**消す（`clearDraw()` の `wide` 分岐）。CLEAR BASE は残す |
  | 5 | 線画/色 → `line` / `color` 表記 | |
  | 6 | BASE → **REF**、TOOLの上へ | `REF DOWN` / `REF UP`（ANIMATOR の語彙）。色は BOARD の MOVE / CUT 16:9 と同じ紫（`#ref-over-pick`）＝「まずどう参照するか」を先に決める並び |
  | 7 | 削除の確認ダイアログ撤去 | `deleteCut` / `deleteSelPhoto` / `clearBase`。**Undoできる操作は聞かない**。戻せない `wipeAll` / `importProject` の確認は残す |
  | 8 | 写真の操作をモードバーへ | `#board-tools` / `#photo-panel` を撤去し `#photosel-box`（% の右）へ。**明/コントラストのスライダーは撤去**（写真アプリ側でやる運用）。GRAY は残す |
  | 9 | CUT追加はシートで選んだカットの次へ | `newCutSlot()`（`gSelRows` が1件ならそれ、無ければ `gFocusCut` の次）＋ `insertCut()`。追加後は `focusCutInSheet()` でシートが追従 |
  | 10 | ⚠ は尺の右へ | `rowLabel()` から抜いて `rowFlags()` ＋ `.sp-flags` に。`.sp-no` を `min-width` 固定にしたので、`A→B` が付いた行でも**尺の欄が上下でそろう** |
  | 11 | CUT枠の表示ON/OFF (H) | `state.showCuts`。OFF中は `renderBoard` も `hitCutFrame`/`hitCutHandle` も止める＝**見えないものは掴めない** |
  | 12 | 中央の ✎EDIT 撤去 | SHEET行Wクリック / TLクリップWクリック / 上部EDIT で入れる |
  | 13 | MOVEで枠選択中は写真がズレない | `bDown` の `guard`。枠を選んでいるあいだ写真に触っても `mode:'idle'`＝**選択が切り替わるだけ**。もう一度触ればふつうに動く |
  | 14 | HISTORY パネル撤去 | 2本指=UNDO / 3本指=REDO ＋ Ctrl+Z で足りる |
  | 15 | 指の長押しスポイトを**滑らせて選べる**ように | `bindTouchEyedrop` に `live` を追加（PROCREATE風）。滑っているあいだは `takeColor(hex, true)` で**パレットに書かない**（毎moveで localStorage を叩かないため）。指を離したとき確定 |
  | 16 | Wタップの窓を広げた | `onDoubleActivate` = `DTAP_MS 550 / 48px`（ツール用）。**`bindDoubleTap` は 350/24 のまま**（行き先が「EDITを開く」なので誤爆の被害が大きい）。この非対称は意図的 |
  | 17 | BASE(REF)の既定を50% | `DEFAULT_BASE_ALPHA`。「元絵の上ではペイントが効かない」と勘違いしないため。**GRIDのセル / SHEETの行を複数選べば一括で上げ下げ**（`eachBaseCut()`） |
  | 18 | 複数選択の手つきを統一 | 指=**1本を置いたまま次をタップ**（GRIDのセル＝`hasHeldFinger()` / SHEETの行＝`rowDragDown` の分岐）。ペン・マウスは Ctrl / Shift+クリック。SHEETは複数選択中に尺を打つと**全部そろう**（`setCutDurMaybeBatch`） |

- **V2-G3で直したバグ（2026-08-17）**
  - **「絵が消えて ⟳ を押しても無反応」** — `ensureResident()` が途中で1回でも例外を出すと
    `cut.loading` に**解決しない Promise が残り続け**、以後 `requestResident` が毎回そこで
    引き返していた。`try/finally` で必ず `cut.loading = null` に戻す。`evictLru()` も
    個別に try で包んだ（ここが投げても常駐化は成功扱いにする）
  - **「シートで消したカットがGRIDに残る／別のにズレる」** — `deleteCut` が `cuts.splice` の後に
    **添字を詰めていなかった**。`shiftCutRefs()` を通して `state.curCut` を追従させ、
    添字で持っている選択（`gSelCells` / `gSelRows`）と `undoStack` は捨てる。
    `gLru` からも消したカットのidを抜く。`moveCutTo` も同じ扱いにした。
    削除・並べ替えの後は GRID を張り直す
  - **iPadでダウンロードが無反応** — `downloadBlob()` に一本化。
    ① `a` を必ず一度 DOM に入れる ② `revokeObjectURL` を**60秒後**にする
    （click直後に revoke すると保存が始まる前にURLが死ぬ）③ download 属性が効かなければ新規タブ。
    PROJ ZIP / MP4 / WebM / C.SCRIPT / パレットJSON の**5か所すべて**がここを通る
  - **C.SCRIPT の形が画面と違う** — 列数を `gridColsNow()`（画面の列数・上限8）にし、
    **行間・列間・色帯のON/OFFをそのまま反映**。色帯は GRID と同じ「行に1本」にした
    （以前はセルごとに敷いていて形が違った）

- **V3-P1: 実装済み（2026-08-18・SPEC_15 P1＋P3-1）** — **カラー層をカット1枚に一本化**。
  「SINGLEでLineに描いたペイントはT.U.に追従するのに、colorに描いたペイントはフェードで変わる」
  という観察が出発点。原因は同期漏れではなく **色だけレンズの前（出力枠にベタ置き）に居た**こと。

  | | 変えたこと | 要点（次に触る人向け） |
  |---|---|---|
  | 1 | `cut.colors[]`（枠ごと・出力枠512×288）→ **`cut.plateC`（カット1枚・ベイク空間）** | `PLATE_K = 512/1280 = 0.4`／長辺 `PLATE_MAX 1024` で頭打ち。**LRUには載せない**のは旧実装と同じ（上限があるので常駐で持てる） |
  | 2 | 倍率は必ず **`plateScale(cut)`** を通す | `PLATE_MAX` で頭打ちしたカットは 0.4 ではない（実測 0.392）。生の `PLATE_K` で座標を作ると寄ったカットだけズレる |
  | 3 | `camSrcRect(cut,f)` を新設 | base / 色 / line の3層が**同じ切り出し矩形**を共有する＝ズレようがない。`drawCamFrame` と `drawCell`（非常駐の控え）が使う |
  | 4 | `drawPlateLayer(ctx,cut,src,dw,dh)` | `drawBaseLayer` と同じ形。**濃と描画モードはここで1回だけ**掛かる |
  | 5 | **`remapPlate`** を `rebakeFromCam` に追加 | 旧実装は出力枠固定だったので不要だった。色も紙の上に来た以上、`remapDraw` と同じ載せ替えが要る（**入れ忘れると枠を動かしただけで色がズレる**） |
  | 6 | ブラシが line と同じ物差しに | `gStrokeK = strokeScaleFor(...)` 一本。GRIDのセルは `camStartFrame(cut,cell.k)` を渡す＝**A枠で描いてもB枠で描いても画面上6px** |
  | 7 | 濃・描画モードを **全体設定 `gPaint`** へ（P3-1） | `UI_LS` ＋ PROJECT ZIP `meta.paint`。`eachSelSlot` は削除。パネル見出しに「全体設定」と明記 |
  | 8 | 移行 | `plate` が無く `colors[]` がある記録は**1回だけ**変換。旧 `drawColorPlate()` が SINGLE に出していた絵そのもの（k昇順で重ねる＝後の枠が上）。per-slot の濃は**最頻値**を全体設定に採用し、件数をトーストで出す |
  | 9 | PROJECT ZIP `ver:3` | `cuts/<id>.plate.png` ＋ `meta.paint`。`ver:2` 以前も同じ変換を通して読める |
  | 10 | 消えたもの | `colorMixAt` / `drawColorFrame` / `drawColorPlate` / `bakeToColorCoord` / `frameAtBake` / `plateStrokeSeg` / `gPlateMode` / `strokeCoord` / `eachSelSlot` / `paintSnap` の `{all:[…]}` 分岐 / `clearDraw` の `wide` 分岐 |

  **失ったもの（実装前にユーザー合意済み）**: T.U./PAN の途中で色が変わる演出（A枠=暖色→B枠=寒色）。
  必要ならカットを2つに割る。GRIDで T.U.カットの A/Bセルは「同じ絵の広い版と寄った版」になる。

- **V3-P1 の後始末: ペイントの重さ（2026-08-18・ユーザー報告→実測して修正）**
  「ペイント反応鈍く、絵がとれて抜けてしまいがち」の原因は**座標ではなく描き直しのコスト**だった
  （座標は GRID / SINGLE とも実測でズレ 0.3% 未満＝正確。**遅れて追いつく絵をズレと見ていた**）。

  **原理**: キャンバスは「書き換えた層を丸ごと描き写す」たびに GPU へ上げ直す。
  `ctx2d()` が付けている `willReadFrequently:true` は**CPU側に常駐させる**指定なので、
  書き換え → 描き写しのたびに全画素の転送が起きる。plate は 512×288 → 最大1024×577 に
  **4倍**になったので、そのぶん転送も重くなった（1move 0.10ms → 1.65ms＝**16倍**）。

  | 経路（22カット・T.U.あり・ベイク2611px） | 旧 v2-g3 | P1直後 | 修正後 |
  |---|---|---|---|
  | GRID 色 | 0.10ms/move | 1.65ms | **0.017ms** |
  | GRID 線 | 19.9ms/move | 19.9ms | 間引きで**1フレーム1回**に制限 |
  | SINGLE 色 | 0.13ms | 0.55ms | 同上 |
  | SINGLE 線 | 2.77ms | 2.81ms | 同上 |

  実測（1秒ぶん・8ms間隔でペン入力）: **GRID線の JS占有率 75.2% → 0.4%**、
  取りこぼさず処理できた move 数 19 → 42。

  **入れた対策（次に触る人はこの3つを崩さないこと）**
  1. `previewSegOnCell()` — 引いている最中は **plate を描き写さず、いま引いた1区間だけセルに重ねる**。
     ペンを離した `gridStrokeUp` で `drawCell` し直すので**残骸は残らない**（実測で完全一致）。
     消しゴムは重ねて表現できないので描き直し側に回す
  2. `renderPaintViewsSoon()` / `drawCellSoon()` — 描き直しは **rAFで1フレーム1回**に間引く。
     ペンは120〜240Hzで来るが画面は60Hzなので、**見えない描き直しのぶんだけペンが遅れていた**。
     引き終わり（`paintUp`）で必ず同期の `renderPaintViews()` を通すので最終結果は変わらない。
     `lassoPreview` は「描き直してから輪郭を重ねる」順序に依存するので**同期のまま**
  3. ストローク中の兄弟セル（同じカットの A/B）と色帯は `gridStrokeUp` でまとめて追いつかせる
  - **やって戻したこと**: plate を `willReadFrequently` なしで作る案は、
    1本目こそ 0.30ms と速いが Chrome が `getImageData` を検知して結局CPU側へ移すため
    2本目から元に戻り、pen-up が 23ms → 183ms に悪化した。**採用しない**

- **V3-A: 溜まっていたバグ4件（2026-08-18）**

  | | 症状 | 原因と直し方 |
  |---|---|---|
  | 1 | **GRIDで CLEAR BASE を使うと戻せない** | GRIDのUndoは**色専用ログ**に繋いである（統合ログに繋ぐと連打でカットまで消える。2026-08-02の事故）。CLEAR BASE は専用スロット `gBaseUndo` なので、色ログしか見ないGRIDでは永久に届かなかった。`undoActive()` で **色ログが空のときだけ `undoClearBase()` を先に見る**ようにした |
  | 2 | **GRIDの複数選択が Ctrl/Shift で効かない** | Ctrl/Shift を**キャプション行でしか受けていなかった**（画の上で押すと単独選択に戻して塗り始める）。セル全体で受けるようにし、Alt（スポイト）とは分けた。ついでに「**いま居るセルをもう一度押しても選択が入らない**」（`state.curCut` が変わるときしか `setSelCells` を呼んでいなかった）も直した。すでに複数選んでいてその中を押したときは選択を保つ |
  | 3 | **スクラブで詰めると◆が2行目に落ちる（改行）** | 2026-08-15 に「B（カット尻）と次のA（カット頭）が同じコマで完全に重なる」対策として**段違い**にしたが、詰めるたびに行が増えて画面が跳ねる。**カット尻の◆を「そのカットの最後のコマ」に置く**ことで、そもそも同じコマに来なくした（**次のカットの頭は動かさない**）。横へ px でずらす案も通ったが、フレーム単位で逃がすほうが嘘がない。`camKeyMove` は掴んだ位置からの相対差分なので、表示のズレは操作に影響しない |
  | 4 | **尺のドラッグが2コマで止まる**（数値入力なら1コマ可） | `clipDragMove` の `clamp(…, 2, …)` が 2 だった。**1** に。入口によって下限が違うのは仕様に見えないので揃えた |

- **V4「枠ごとの画」: 実装済み（2026-08-18・SPEC_16 §1〜§3 ＋ §5-B ＋ E1 ＋ §5-C の軽い分）**

  V3-P1 の「カット1枚」が実使用で **A枠に描いた線が B枠のセルにも出る**（＝大小ペイントが同時に入る）に
  当たった件の解決。**画は枠（`cam[k]`）ごとに1枚**にした。写真（REF）だけが全枠で共有される。

  | | 変えたこと | 要点（次に触る人向け） |
  |---|---|---|
  | 1 | `cut.drawC` / `cut.plateC`（カット1枚）→ **`cut.fr[k]`**（枠ごと） | `{line 1280×720, plate 512×288, lineBlob, plateBlob, dirty*, rect}`。**`cam[]` と1対1**。長さ合わせは `ensureFr()` を必ず通す |
  | 2 | パッチは **紙（ベイク空間）の上に `cam[k]` の位置で置く** | `camBakeRect(cut,k)` が置き場所。切り出しは base と同じ `camSrcRect` なので**ズレようがない**。V3-P1 の土台がそのまま生きる＝**旧V2のフェードには戻らない** |
  | 3 | 描画の入口は **`drawPatchStack()` 1本** | `only>=0` で1枠だけ（GRIDのセル）。**`hide` が立つ枠は先に `clearRect`** するので、下地の写真まで抜かないよう控えキャンバスを経由する |
  | 4 | **★§2a の判定 = (b)、ただし入れ子のときだけ** | `patchHides()` ＝「前の枠と包含関係にあるか」だけで機械的に決まる。T.U./T.B.＝入れ子は下を隠す（B のセルが完全にきれいになる）／PAN＝並ぶは (a) に落として継ぎ目を出さない |
  | 5 | **GRIDのセルは自分の枠のパッチだけ**（§3-3） | `drawCellFrame()`。SHEETのサムネと C.SCRIPT の一覧PNGも同じ関数を通す＝**シートに出る画とセルの画が一致** |
  | 6 | ブラシの物差しが消えた | パッチが出力等倍なので `patchK()` は line=1 / plate=0.4 の定数だけ。旧 `strokeScaleFor` は削除。**GRIDでまたいで塗っても同じ太さ**（依頼の核） |
  | 7 | ストロークの行き先 | SINGLE/STUDIO は **ベイク座標 → `frameAtBake()`**（後ろから探す＝重ね順と一致）。区間が枠をまたいだら**両方のパッチに引く**。GRIDは**セル＝パッチが相似**なので変換1回で済む |
  | 8 | 枠を動かしたら絵も追従 | `fr[k].rect` に「貼り付いている紙の矩形」を持ち、`rebakeFromCam` → `syncPatchRects()` が載せ替える。旧 `remapDraw`/`remapPlate` の役目。**cam の増減は `snapshotCam` が fr の並びごと控える**（cam だけ戻すと1つズレる） |
  | 9 | 枠を足したら「いま見えていたもの」で埋める | `seedPatch()`。空で挿すと A に描いてあった絵が B のセルから消えて見える |
  | 10 | 保存形式 | IndexedDB: `cut.fr[] = {line, plate, rect}` ／ ZIP `ver:4`: `cuts/<id>.f<k>.line.png` `.plate.png`。**ver3 は枠の矩形で切り出して配る**（`splitBakeToPatches`）／**ver2 の `colors[]` は plate パッチへ1対1**（`migrateColorsToPatches`）＝V3で一度潰した形が元に戻る |
  | 11 | メモリ | T.U.3倍のカットで `3840×2160 一枚 → 1280×720 × 2枚` ＝ **約1/3**（実測: ベイク1813×1020 のカットで line が 1280×720×2） |
  | 12 | 消えたもの | `drawC`/`plateC`/`plateSize`/`plateScale`/`getPlate`/`resizePlate`/`remapPlate`/`remapDraw`/`drawPlateLayer`/`getDraw`/`strokeScaleFor`/`strokeSegOn`/`floodFill`/`paintCanvas`/`paintSnap`/`applySnap`/`useCutStack`/`doUndo`/`doRedo`/`undoStack`/`renderGridTouched`/`cellColorCoord`/`state.fillMode` |

  **★ 残っている判断（実装では §3-3 を優先した）**
  §2a(b) を採ると、**A のセルの「B が総取りする領域」に描いた絵は TIMELINE では出ない**
  （B のパッチで置き換わるため）。GRIDのセルは §3-3 どおり自分の枠だけを出すので、
  A セルには描けて見える。この食い違いを黙って放置しないために、
  **A のセルにその領域を破線＋枠名で出す**（`drawTakeoverGuide`。画には焼かない）。
  合成側を GRID に合わせる（Aセルにも B のパッチを貼る）ことも1行で切り替えられるが、
  そうすると **A セルに描いた瞬間その場で消える**ので採らなかった。

- **E1: GRIDの Ctrl+Z が12回で止まる — 直した（2026-08-18）**
  原因は `COLOR_LOG_MAX = 12` そのもので、**1件がパッチ丸ごと2枚（最大4.7MB）**だったため浅くしか持てなかった。
  ペイントを**トランザクション方式**にして、引いている間に触ったパッチの控えを1枚だけ取り、
  離すときに **実際に変わった矩形だけ**を before/after で持つようにした（`txBegin`/`txTouch`/`txEnd`）。
  ふつうのストロークで数十KB。**上限は 12 → 80 手**（実測で40手連続 Undo を確認）。
  ついでに **EDIT の Undo を1本化**した（旧: SINGLE=カット別スナップショット / GRID=色専用ログ）。
  行き先は **EDIT＝`gColorLog` / STUDIO＝`gLog`** の2つだけ。統合ログに混ぜない原則（2026-08-02 の事故）は不変。

- **§5-B 手癖・操作（2026-08-18）**
  - **B1** `setEditMode` / `setView` から `setPaintTarget` を撤去＝**描く先は画面移動で変わらない**。
    ブラシ上限は `BRUSH_MAX = 300` の1つ（line/color で上限が変わると切替時に太さが黙って丸められた）
  - **B2** **econte だけ FILL（バケツ）を廃止**。初めから投げ縄で、長押しが「塗り ⇄ 透明消し」の2状態のみ。
    Wクリック切替は無し。**これは `animator-brush-ops` スキル（正準＝ANIMATOR）からの意図的な逸脱**。
    ラフとスピード優先の道具なので、迷う状態を1つ減らす。**スキル側は触っていない**
  - **B3** ボタンは常時 `lasso-on`、透明消しのときだけ `fe-on`＋表記 `LASSO` / `L-DEL`
  - **B4** ペンは描く専用。**スライダー・ペイン幅・帯の高さ・音のずらし**は指/マウスだけ（`penUiBlocked`）。
    **枠の微調整とキー操作は例外**（§5-B4 の但し書きどおり）。BOARD の写真/枠操作は塞いでいない
  - **B5** パレットは**縦3行**ぶんだけ出してスクロール（`PAL_ROWS`/`fitPaletteRows`。幅で1セルの大きさが
    変わるので、パネルが開いた時と resize で測り直す）
  - **B6** CUT枠の表示は**目のアイコンだけ**。OFF は斜線を重ねて出す

- **§5-C（軽い分・2026-08-18）**: C1 中央プレビューのホイール拡縮＋ホイール押下ドラッグ移動（Wクリックで戻す。
  `state.tlView2`）／C2 SINGLE も同じ手つきで移動／C3 GRIDの余白も手のひら（`bindMiddlePan` 1本で3か所）／
  C4 REFリンクは「開く／差し替える／外す」を聞く／C7 `Ctrl+Shift+↑↓` で最上位・最下位へ／
  C8 ERASE Wクリックは選択コマ全消し・BG も複数選択で同期・投げ縄は**選択に関係なくまたいで塗る**／
  C9 MOVE の選択枠をグレーに
- **§5-C の未着手**: C5 画ブレ ／ C6 イーズを AE 準拠＋区間で選ぶ ／ C10 書き出した C.SCRIPT / 動画の読み戻し。
  **§5-D（iPad）は仕様どおり PC を仕上げてから**

- **次にやることは `SPEC_16_ECONTE_V4.md` の残り** ＝ §5-C の C5（画ブレ）/ C6（イーズ AE 準拠・区間で選ぶ）/
  C10（書き出した C.SCRIPT・動画の読み戻し）と、§5-D（iPad。PC を仕上げてから）。
- **V3 の未着手は P2（フォトバッシュ）だけ**。P3-2〜P3-4 は SPEC_16 §5-B として V4 と同じ回で実装済み
- **旧 V2-E3 の `cut.layers[]` は不採用**（SPEC_15 P2）。フォトバッシュは「浮いた選択」方式で作る
  - `cut.layers[]`（最大5・原本Blob＋アフィン変形＋投げ縄マスク＋ブレンド）
    ＋ブラシチップ（**.abrパーサは作らない**・内蔵数種＋透過PNG読み込み）
  - 着手前に **SPEC_13 §9（画面の役割）を必読**。E3 は **SINGLE 専用**で、
    GRID（＝主戦場）には出さない。GRID に重い変形UIを持ち込むとセル数ぶん効く
  - 合成順は bg → baseC → **layers** → 色 → drawC。`compositeTo()` に1段挟む形になる
  - **LRUの扱いを先に決めること**。原本Blobを5枚持つとカット1つの常駐コストが跳ねるので、
    `layers` を LRU 対象にするか（色と違って大きい）を D2 の設計に合わせて判断する
- **既存データの互換は当面考えなくてよい**（2026-08-02 ユーザー確認・テスト段階のため）
- **ユーザーからの持ち越し依頼**: 「いつも使うのは数種なのでこのブラシみたいにしたい」と
  ブラシチップの具体指定が**後から来る**。E3 の実装時に先回りで作り込まず、指定を待つこと

【変更後チェック】
node tools/check.js（6ファイル一括。econte.html含む）
