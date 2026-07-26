COMPOSER v0.7（単一HTML）の続き開発用ハンドオフ。

【2026-07 追加（SPEC_11 P0/P1/P1b）】
- 座標規約: フレームf左端= LABEL_W + frameFrac(f)*幅（frameFrac=f/total）。**total-1を分母にしない**。全UI（ルーラー/PH/WA/ダイヤ/ブロック/グラフ）統一
- 自動保存: IndexedDB `composer_autosave_v1`（cells=絵・import/LIVE時のみ ／ meta=cells抜きpayload・recordHistory毎debounce 2s）。起動時に復元バー（復元=置き換え/破棄/✕=温存）。LIVE自動ロードが先行してもバーは出す。⚙パネルにCLEARボタン。音声本体は対象外
- undo v2: cloneEditState={trackRefs(参照配列),perTrack(tidで深コピー),gmarkers,selectedTrack,workArea}。applyHistoryはtrackRefs差し替え→tid引き当てで書き戻し→rebuildAllTrackUI。**トラック削除/並び替え/◉/SOLOもundo対象**。適用時に再クローンするので履歴とstateの配列共有なし
- #kf-parent変更時のUI更新は refreshTrackChainMarks()（軽量。rebuildはしない）

【2026-07 追加（MOTION_COMIC_SPEC.md Phase 5/6）】
- influence%イーズ: KFに任意 `ei`/`eo`(0-100)。区間にどちらかあれば bezierEaseT（cubic-bezierタイミング）、無ければ従来ez smoothstep。INF IN/OUT欄（インスペクター）で適用/解除（空欄=解除）。直列化・コピペ・ドラッグ・undoすべて持ち回り（putKeys/groupSnap/copy/pasteにei,eo追加済み。**KF複製系を触るときは ei/eo の持ち回りを忘れない**）
- ミニグラフ: #tl-graph（∿ボタン/Gキー）。renderGraph()はupdatePlayhead()から毎回呼ばれる（非表示時は即return）。VAL/SPD切替=#tl-graph-mode
- NULLトラック: type:'null'（+ NULLボタン, addNullTrack）。frames空・描画されない親専用。projectId=null。アイコン◇
- カメラの親: PRNT行がカメラでも表示（選択肢はNULLトラックのみ）。getCamAt()が親チェーンを加算合成(x/y/z/rot加算, s乗算)。WEBビューアのcamAtも同ロジック（DATA.camera.parent）
- 子のZ有効化: applyTrackChain子分岐で persp=1000/(1000+z) をローカル適用（カメラZは掛けない）。**本体とWEBビューアテンプレの2箇所**を常に同期すること
- FX HUD: PRNT readonly行(#fx-parent-row) / カメラ選択中はAX/AY/OP行をprop-hiddenに
- undo⛓: refreshTrackChainMarks()（ラベルのみ更新）をapplyHistoryから呼ぶ
- AE JSX書き出し: exportAeJsx()（トップバーAE JSX、カメラありで有効）。親NULL合成込みKFをベイクし、AEでヌル+一節点カメラを生成する.jsxをダウンロード

【v0.7 MOTION COMIC — 詳細は MOTION_COMIC_SPEC.md】
- track.type: 'anim'|'image'|'camera'、track.tid（恒久ID）、track.parent（親のtid）
- 画像インポート: PNG/JPEG/WebP→cells1枚の擬似JSON（IMAGE_v1）→importJSON。importFiles()でJSON/画像/audio混在D&D
- CAMERA: 普通のトラック（frames空）として実装＝KF系UIを全部流用。1つまで(dedupeCameras)。projectId=null。◉=カメラON/OFF
  X/Y=パン(レイヤーZでパララックス) Z=ドリー ROT/SCL=全体ラップ(applyCamWrap)。カメラなし時は従来式と完全一致（後方互換）
- 親子: applyTrackChain再帰でctx変換合成。子のZ無効/OP非継承/循環はUI除外+深度8上限。親付き子はハンドル非表示
- バグ修正: PROJECT_v2再IMPORTでKF全損（トラック要素にformatが無く復元条件が偽）→ composerセクション有無だけで判定に変更。per-track width/heightも保存するよう修正

【概要】
ANIMATORの作画コマを複数トラックで重ね、トランスフォーム/キーフレームでカメラワーク・タイミングを付け、4K連番PNGで書き出す合成ツール。tDRスタイル（--acid:#36FF00 / --neon:#F9FF47 / モノスペース / 黒基調）。

━━━━━━━━━━━━━━━━━━━━━━━━━━
■ マルチトラック
- state.tracks[] = [{projectId,name,width,height,cellsRaw,cellInfos,frames,totalFrames,keyframes,markers,visible,solo}]
- tracks[0]=最背面(BG)、tracks[N-1]=最前面。drawFrame()が0→N-1で重ね描き
- UI表示はAE/PS準拠：上=前面、下=BG（rebuildAllTrackUIは i=N-1→0 で生成）
- 各トラックボタン：◉表示/非表示, S(SOLO), PNG(単体4K書出), ✕削除
  ※ ANM(ANIMATOR送信)ボタンは廃止（LIVE連携と二重で混乱するため）。sendTrackToAnimatorは未使用で残置
- ⠿ドラッグで並び替え、名前ダブルクリックでインライン編集
- width/height はトラック固有（解像度違いの基点ずれ対策。下記レンダリング参照）

■ インポート（IMPORT JSON に一本化、+TRACK廃止）
- importJSON(json)：空なら新規読込、既存があれば「追加」。複数回で2つ3つと重ねられる
- PROJECT_v2=loadJSON（全置換 or 追加）、PROJECT_v1/ANIMATOR_v1=単一トラック追加
- finishImport()が共通の後処理（totalFrames/workArea/UI再構築/announceLive）
- SPEC_06 P3受け（OBANの COPY FOR COMPOSER 用）: ①カメラだけのPROJECT_v2でもKF最終フレームから totalFrames を確保（parseTrackFromJSON）②追加IMPORTでも `fx:` があれば normalizeFx で state.fx を引き継ぐ。既存CAMERAがある状態で貼るとカメラは捨てられる（dedupeCameras=既存優先）
- SPEC_06 P3b受け: `obanPanels:` があれば applyObanPlacements() — 画像トラックへファイル名一致（拡張子無視）で x/y/z/s の単一KF流し込み＋重ね順再配置（depth昇順→ord昇順、マッチしたスロット内のみ）。既存KFは上書き。適用数は flashLive で表示
- ドラッグ&ドロップ対応（JSON / audio両対応）

■ レンダリング（drawOneTrack）
- sx=出力W/state.width, sy=出力H/state.height（コンポ→出力）
- トラック固有 trW/trH を使い drawW=trW*sx, drawH=trH*sy で「コンポ中央に原寸配置」（AE準拠）。解像度違いでも基点がずれない
- Z軸疑似3D：persp=PERSP_FOCAL(1000)/max(1,1000+Z)、eff=scale*persp で乗算（scaleと独立）。Z>0=奥、Z<0=手前。TU演出はZを0→負へ
- 透明背景なし＝bgBrightのグレーで塗りつぶし後に重ね描き

■ トランスフォーム / プロパティ（ALL_PROPS）
- 順序：x,y,z,s,ax,ay,rot,op（UI表示順=AX/AY→X/Y/Z→ROT→SCL→OP）
- PROP_STEP / PROP_MIN / PROP_MAX / propDefOf（s,op既定=1, 他=0）/ fmtProp / clampProp
- commitProp(prop,value,record)：現フレームにキーが無ければ作成＝「変化した瞬間に即キー」
- インスペクター(#kf-*)とFX HUD(#fx-*)は同じprop群。インスペクターのトランスフォームは常時表示、FX HUDのみP/S/A/R/T/Uの表示トグルに連動（applyPropVisibleは#fx-hudのみ対象）
- ◀▶ステッパ(.num-step, data-step/data-fxstep + data-dir)、Shift=×10
- 数値スクラブ：ラベル(.k)と入力欄自体をドラッグで変更。入力欄はクリック=編集 / ドラッグ=スクラブ（ドラッグ開始までcapture/preventDefaultしない）。Shift=×10, Ctrl=×0.1
- updateKfUI/updateFxHud は ALL_PROPS をループ（document.activeElement!==el のとき値上書き＝編集中は保持）

■ キーフレーム（線形補間＋イーズ）
- 構造：track.keyframes[prop] = [{f,v,ez}]（ezは0=リニア / 1=最大。smoothstepへ ez 量ブレンド）
- getKfValue：区間内 t を ez で smoothstep へブレンド。ez=Math.max(両端)
- 即キー：数値変更/スクラブ/ステッパ/ハンドルドラッグで現フレームにキー生成
- KFダイヤ（renderKfDiamonds）：data-track/data-f を持つ。形でイーズ表示
  - リニア=鋭い菱形(ネオン) / 最大=円(マゼンタ, .ez-max) / 中=角丸(水色, .ez-mid※インスペクターEASEボタンの0.5用)

■ KF選択モデル
- kfSel = [{t,f}]（トラックまたぎ）。kfSelHas/Set/Toggle/Clear, refreshKfSelClasses（.sel付与）
- ダイヤ：クリック=単一選択+seek / Shift+クリック=トグル / Ctrl(Cmd)+クリック・ダブルタップ=イーズ切替(cycleEase 0↔1)
- ドラッグ=移動（単一）。複数選択キーを掴むとグループ移動（groupSnap+2パスで衝突回避, 端でクランプ）。Shift+ドラッグ=複製。ドラッグ直後も選択維持→Del可
- マーキー選択：#tl-tracks上でドラッグ（サムネはpointer-events:none/draggable=false）。横=ダイヤ中心X / 縦=トラック行全体と交差で判定。Shiftで追加
- コピペ：copyKeyframes(選択優先, 未選択時はトラック全体, 最小フレーム基準の相対items) / pasteKeyframes(再生ヘッド基準で additive・同一/別トラック可)。Ctrl+C/V でも可
- 削除：Del/BackSpace = 選択分 or 再生ヘッド位置（deleteSelectedOrCurrentKf）
- イーズ一括：インスペクターのEASEボタン（クリック=中0.5 / Shift=最大1.0）。選択優先

■ マーカー（グローバル/ワークエリア）
- state.markers = [{frame,label}]（旧：トラック単位。現在はM=ルーラー上のグローバルマーカー）
- renderGlobalMarkers()：#tl-ruler-markers に配置。ドラッグ移動 / クリックseek / ダブルクリックでメモ(prompt) / Ctrl(Cmd)+クリックで削除(AE準拠)
- PROJECT_v2 top-level markers として保存/復元、undoスナップに gmarkers
- 旧 per-track markers(renderMarkers) は読込互換で残置

■ ビューポート（pan/zoom = ANIMATOR準拠）
- state.view={zoom,panX,panY,baseW,baseH}。applyView()が #viewport-inner に transform
- ホイール転がし=ズーム(カーソル基点 zoomViewportAt) / 中ボタンドラッグ=PAN / ダブルクリック=resetView(FIT)
- touch-action:none（液タブのペン途切れ対策）。ドラッグ移動量は screenToCanvasScale() でズーム補正
- 位置ハンドル(□)=X/Yオートキー、アンカーハンドル(×)=AX/AYオートキー（button!==0は無視＝中ボタンと競合しない）
- setupViewport末尾で必ず drawCurrentFrame()（canvas.width再設定でクリアされる→リサイズ直後の黒画面対策）

■ ガイド（解像度枠 / セーフフレーム）
- #guide-canvas（viewport-inner内, pointer-events:none）。renderGuides()が state.guides で描画。表示のみ・書き出し非合成
- 設定パネル(⚙)で ON/OFF・サイズ・セーフ%。lwはズーム補正

■ 設定パネル（フローティング, ANIMATOR準拠）
- ⚙ #btn-settings でトグル。ヘッダドラッグ移動、下端 #settings-resize でリサイズ（.set-sectの境目スナップ）
- CANVAS GUIDES + KEYBOARD SHORTCUTS（再割当UI）。※解像度変更はcomposerでは行わない

■ ショートカット（登録制＋再割当, localStorage:composer_keymap_v1）
- SHORTCUT_ACTIONS[].{id,label,def,prevent,run(e)}。gKeymapでキー→action。設定パネルで変更
- 既定：Space再生 / ←→コマ(Shift=10) / Home/End / B,N ワークエリア / M マーカー / i キー追加 / J,K 前後キーへ / Del キー削除 / F FIT / P/S/A/R/T/U HUD表示 / X FX HUD / , 設定
- Ctrl+Z/Shift+Z=undo/redo、Ctrl+C/V=KFコピペ、BackSpace=削除、Escape=メニュー/選択/HUD/設定を閉じる

■ タイムコード
- frameToTimecode(idx)=AE準拠 H:MM:SS:FF（1始まり, 末尾=コマ）。先頭=0:00:00:01
- 右下TIME=タイムコード。コーナーの「FRM/」クリックで コマ⇔タイムコード切替（state.timeMode）

■ タイムライン
- グリッド行 var(--tl-h) を #tl-resize の上端ドラッグで高さ変更
- トラック区切り線強調、ストリップ高はトラック高に追従、サムネ object-fit:cover（歪み防止）
- KFダイヤ拡大+黒フチ+ホバー点滅。最小トラック高46px（下回ればスクロール）
- ◀▶コマ送りボタンは廃止（ショートカットのみ）

■ ワークエリア / 再生 / オーディオ / 書き出し / Undo
- ワークエリア：B/N、ルーラーのハンドルドラッグ、再生ループ
- 4K PNG：EXPORT 4K PNG（全可視合成）/ 各トラックPNG。書き出しは drawFrame/drawOneTrack を OUT_W/OUT_H で
- AUDIO：♪ボタン/ドラッグ、波形、オフセット、ミュート（state外の const audio）
- Undo：cloneEditState（tracks.keyframes+markers, gmarkers, selectedTrack）, recordHistory（変更後記録）, 上限50

■ ライブ連携（BroadcastChannel 'tdr_live'）
- ANIMATOR保存(autosave)→project-update。COMPOSERは projectId一致トラックの「絵だけ」差し替え（KF/transform/表示状態は保持, liveUpdateTrackがwidth/heightも追従）
- announceLive()=composer-hello+requestSyncAll。setupLiveSync（起動+700ms遅延再通知+window focus時）と、loadJSON/finishImport完了時に呼ぶ＝LIVEボタンを押さなくても自動反映
- ANIMATOR側は gLiveActive が立つと autosave毎に broadcast。composer-hello / request-sync / animator-hello で立つ
- SPEC_07（トラックの往復ボタン `ANI` / `Re`）: `track.projectId` があるanim系トラックだけに表示（カメラ/画像トラックには出ない）
  - `ANI`=editInAnimator() → `animator.html?open=<projectId>` を別ウィンドウで開く。ANIMATOR側が別プロジェクトを開いていれば**確認モーダル**を出してから切替（無断上書きしない）。ポップアップブロック時はトースト
  - `Re`=reloadTrackFromAnimator() → request-sync を投げつつ EX_DB から取得し `onLiveProjectUpdate()` に流す＝**絵だけ差し替え**（KF/マーカー/tid/transform保持）。未登録なら「ANIMATORで LIVE を押してください」
  - CSS: `.tl-tbtn.anm`（rouge）を再利用。**SPEC_11 P4-2 で🔒が増えて7個になり、`.tl-tbtn`のpaddingを`2px 2px`・gapを`1px`に再調整（実測 134px→122px / ラベル幅128px）**（**ボタンを増やすときは要再計測**。計測は `document.querySelectorAll('.tl-track-btns')` の `scrollWidth` と `.tl-track-label` の `clientWidth-6` を比較）

━━━━━━━━━━━━━━━━━━━━━━━━━━
【SPEC_11 P2〜P4（2026-07-25）】
- **HOLD（P2）**: KFの任意 `hold:true`。**区間の左キーに付く**（そのキーから次のキーまで値固定・AE準拠）。`getKfValue` の区間ループで influence 判定より**前**に `if(arr[i].hold) return arr[i].v;`。**本体とビューアテンプレの2箇所**。ダイヤは `.ez-hold`（回転なし正方形・グレー）でイーズ形状より優先。トグルは `applyHold()`（インスペクタ `#btn-kf-hold`）。`cycleEase`(Ctrl+クリック)は従来どおり 0↔1 のみで hold には触れない
- **トリム / ずらし（P3b）**: `track.tIn`(既定0) / `tOut`(既定 null=末尾まで) / `tOffset`(既定0・負可)。
  - **規約: トラック内時間 = コンポ時間 − tOffset**。`tIn`/`tOut` は**コンポ時間基準**（tOffsetの影響を受けない）
  - 描画: `drawOneTrack` 冒頭でトリムガード → セル参照 `fi=floor(frameIdx-tOffset)`（範囲外は端のコマを保持＝消したいときはトリム）。`applyTrackChain`/`getCamAt` は**各トラックが自分の tOffset を引いて** KF評価（親は親自身の tOffset）
  - **KF編集の入口は必ず `curLocalFrame()`（＝currentFrame − 選択トラックのtOffset）を使う**。`state.currentFrame` を直接 setKf に渡すと tOffset 時にズレる
  - タイムライン表示は逆に `+tOffset`：コマブロックのleft / ダイヤ / マーカー / ミニグラフのキー点。ドラッグ換算も対で直す
  - UI: `.tl-trim-handle`（両端7px・z5）、範囲外は `.tl-frame-block.trimmed`。位置とグレーの更新は `refreshTrimUI(idx)`（DOM再構築なし）。**ストリップのAlt+ドラッグ=ずらし**（`#tl-tracks` のマーキー選択は altKey で早期return）
  - ショートカット: `SHORTCUT_ACTIONS` に `alt:true` 属性を追加（`Alt+[`/`Alt+]`）。keydown は `ctrl||meta||alt` 早期returnの**前**に alt:true のアクションだけ処理し、通常ループでは `if(a.alt) continue;`
- **ペアレント補正（P2b）**: `chainXformAt(track,frame)` が applyTrackChain と同じ式を ctx 無しで数値再現（2D相似 `{tx,ty,rot,s}`・camは含めない）。`setTrackParent(t,newTid,compensate)` が `L=P⁻¹·W` を分解して**全KFへ差分加算（sは乗算）**。**現フレームでのみ見た目一致**（親がKFを持つと他フレームは変わる＝原理的制約。ツールチップに明記）。`#kf-parent` は change で altKey が取れないので pointerdown/keydown で `gParentAlt` に記録（Alt=補正なし）
- **ミニグラフ編集（P2c）**: canvas描画なのでヒット判定は描画時に記録した矩形（`gGraphLegendHits` / `gGraphKeyHits`）で行う。凡例=click / キー点=pointerdown。**ドラッグ中は正規化(mn,rng)を凍結**しないとカーブが暴れる。SPDモードは `gGraphKeyHits` を積まない＝表示専用
- **トリムの見せ方**: 範囲外は `.tl-trim-veil.left/.right` の**オーバーレイ**で覆う（IN/OUT のフレーム位置ちょうどで切る）。コマブロックにクラスを付ける旧方式はコマ境界に吸着して境目が分かりにくかったため廃止。`pointer-events:none` / `z-index:2`（コマ=下、KFダイヤ=3、マーカー=4、トリムハンドル=5 の順）
- **レイヤーのずらしは常にトリムも連れて動く**（`[`/`]` の `trackToPlayhead` と、ストリップの **Alt+ドラッグ**の両方）。判定は「トリムが設定されているか」＝`(tIn||0)!==0 || tOut!=null` で、真なら **tIn と tOut の両方**を同じ delta で平行移動する（`if(t.tIn)` だけで見ると tIn がちょうど0を通過したときに置き去りになる）。
  - **ずらし中は tIn/tOut をクランプしない**。0で止めるとトリム長が潰れて戻せなくなるため、コンポ外（負や total超）をそのまま保持する。丸めるのは**表示側だけ**（`refreshTrimUI` の `clampF`）。`parseTrackFromJSON` も tIn を `Math.max(0,…)` しない（負の状態を保存/復元できる）
  - Alt+ドラッグは**ドラッグ開始時の tOffset/tIn/tOut を控えて毎回そこからの差分**で決める（累積更新だと端で丸めた分がずれて戻らない）
  - 一方 **トリムハンドル自身のドラッグと `Alt+[`/`Alt+]` は tIn/tOut だけを動かす**（レイヤーは不動）。ここは境界の直接操作なので [0,total] にクランプしてよい
- **`[` / `]` = レイヤーをインジケータへ**（`trackToPlayhead`）: Alt無し＝レイヤーの頭/尻をプレイヘッドへ／Alt付き＝トリム（`setTrackTrim`）。同じキーに Alt有無で2アクション載るので、`handleShortcutCapture` の重複解除は**同じ alt 枠の中だけ**で行う
- **トラック並び替えドラッグ**: pointer capture は使わず **window の pointermove/pointerup で追う**。captureすると①ラベルの dblclick 改名が死ぬ ②途中でcaptureが外れると pointerup を拾えずゴーストがカーソルに張り付く、の両方が起きる。`onEnd` は `pointerup` のときだけ `doTrackReorder` し、`finally` で必ず `dhCleanup()`
- **INSPECTORのドック**: 位置は `#inspector.dock-left/.dock-right` の**クラス**で決める。`dockInspector()` はフリードラッグの inline `left/right/top/transform` と**リサイズが付けた `maxHeight`／`#inspector-body` の `height` を全消し**してからクラスを付け直す（消し忘れると宙に浮いて「収まらない」）。`makeFloatDrag` 側は掴んだ時に `.floating` を付けて dock クラスを外す。ANIMATOR のパレット（`applyPaletteFloat` が `style.left/top/right` と `palette` の height/maxHeight をクリア）と同じ考え方
- **FXモーダル**: `#btn-fx` は `toggleSfxModal()`＝開閉トグル。開いている間はボタンに `.primary`。`closeSfxModal()`（✕/Esc）でも消灯させること
- **INSPECTOR は「選択トラックの編集」専用**（2026-07-25 整理）。PROJECT/OUTPUT/CURRENT FRAME セクションは廃止し、
  FPS・解像度＝トップバーとキャンバス四隅 / 出力仕様＝`#btn-export`(SEQ PNG) の title（`updateInspector` が毎回焼き直す）/
  尺＝設定パネルの COMP LENGTH / CELL＝キャンバス右下 `#meta-cell` に移した。**新しい情報をINSPECTORに足す前に、この4箇所のどれかに載らないか考えること**
- **コンポ尺は `state.compFrames`**（null=素材まかせ）。`recalcTotalFrames()` が `max(素材の自然長, compFrames)` を `state.totalFrames` に入れる。
  **`state.totalFrames` に直接代入しないこと**（5箇所あった代入は全部 `recalcTotalFrames()` へ集約済み）。設定パネルの FRAMES/DUR はどちらも `setCompFrames()` に入る（DURは×fps）。素材より短い値は自動で null に戻る
- **イーズ量(influence)はトランスポートバーのスライダー**（`#ease-in-range`/`#ease-in-num`/`#ease-out-*`）。0=解除、max=100。
  range の `input` は `applyInfluence(field,val,live=true)` で**履歴を積まない**、`change` で確定＝1ドラッグ1undo
- **PNG書き出しは Shift+クリック必須**（トラック行の `PNG` と トップバーの `SEQ PNG` の両方）。誤爆すると4K書き出しが走るため
- **ANI/Re は projectId が無いトラックでも表示して `disabled`**（行の項目が揃う方が見やすいという要望）。
  `buildProjectPayload` で画像/連番に**偽の projectId を振らない**こと（振ると往復後にANIMATOR連携できるように見えてしまう）
- **トラック複製/分割**: `cloneTrackObj()` は Image を共有して cellsRaw/cellInfos/frames を浅コピー、keyframes/markers だけ深コピー。
  `duplicateTrack`(Ctrl+D) / `splitTrackAtPlayhead`(Ctrl+Shift+D＝前半 tOut=現コマ・後半 tIn=現コマ)
- **Del/BackSpace は `deleteKfOrTrack()`**: キー（選択 or 現コマ）があればキー削除、無ければ**トラック削除**。undoで戻せる前提の設計
- **キーの順送りは3モード**（`KEY_MODES` = LINEAR / EASE / HOLD）。Ctrl+クリックもダブルクリックも `cycleEase()` → `getFrameKeyMode()` で現在値を読み `applyKeyModeToFrame()` で次へ。
  ダイヤ形状と1対1: 菱形(ネオン)=LINEAR / 円(マゼンタ)=EASE / **正方形(グレー)=HOLD**。
  送りでは `ei`/`eo`(influence) を**消す**（半端な状態が残ると形と実挙動が食い違うため）。influenceを使いたい場合はINF欄から入れ直す。
  旧 `getFrameEz`/`applyEaseToFrame` は廃止（`getFrameKeyMode`/`applyKeyModeToFrame` に統合）
- **タイムラインのサムネ**（2026-07-25 視認性調整）:
  - `img.tl-thumb` は `height:100%; width:auto; max-width:100%`＝**セル先頭に原寸比で1枚**。旧 `width:100%`+`cover` は長いセルほど横に引き伸ばして縦を切っていた（ANIMATOR由来の18コマセル等で「引き伸ばされて見える」原因）
  - サムネ生成canvasは**トラック本来のアスペクト**で作る（旧: 常に160×90へ押し込め＝4:3素材が潰れる）
  - `.tl-track-strip::after` が下23px（KFダイヤ+マーカーの帯）に暗いグラデを敷く＝**白いサムネの上でもキーが埋もれない**。コマ番号ラベルはこの帯の上に出す必要があるので `z-index:2`＋白文字+影
  - 選択中は**ストリップ自体**にも `outline`＋地色を出す（`.tl-track.selected .tl-track-strip`）。ラベル側だけだとサムネに覆われて選択が分からない
  - **トリムのハンドル/境界線は紫（--magenta `#B850FF`）**。ネオン黄(--neon)は白いサムネ地に完全に埋もれる。タイムライン上でサムネ（＝白地になり得る）に重なる要素に黄は使わないこと
- **ロック（P4-2）**: `lockedGuard(t)` が true を返したら呼び出し側は中断。現在の適用先は commitProp / addKfAtCurrent / clearAllKf / pasteKeyframes / removeTrack / applyEase(全体) / ダイヤ・マーカー・トリム・ずらしのドラッグ / アンカー・ビューポートドラッグ / dotトグル。**編集系を足したらここにも足す**
- **ドラフト再生（P4-3）**: `gDraftPlay` かつ `state.isPlaying` のときだけ半解像度オフスクリーンへ描いて拡大。`pause()` でフル解像度に戻す（FINAL PREVIEW と同じ流儀）
- **AE JSX（P4-4）**: カメラに加えて各トラックを平面/ヌルの3Dレイヤーで生成。solidは**composer px そのままのサイズ**で作り、スケールに `sx=comp.width/D.W` を掛けて合わせる（アンカー=`[w/2+ax, h/2+ay]`、Position=`comp中央+(x+ax)*sx`）。Z=`z*sx` でカメラのZoom設定と組み合わせると composer の `PERSP_FOCAL` 透視と一致する。**親付きレイヤーの子Zだけは AE のカメラ透視で解釈されるため厳密には一致しない**（Z=0の子は一致・JSX冒頭のコメントに明記）

━━━━━━━━━━━━━━━━━━━━━━━━━━
【コードの注意点】
- KF関数はkfsパラメータ明示。op=0は isNaN(v)?1:v で判定
- ALL_PROPS にprop追加時は #kf-*/#fx-*/#dot-*/#fx-dot-* のUIも要追加（updateKfUI/Fxがループ参照）
- KFダイヤのドラッグ中はrenderKfDiamondsを呼ばない（pointer capture喪失）。pointerup後に再描画
- data-track属性でDOM→state.tracks[idx]対応
- rebuildAllTrackUI()で全再構築（#tl-audio-row退避→再追加）。renderKfDiamonds/renderMarkers/renderGlobalMarkersはDOM追加後
- drawOneTrack(ctx,w,h,frame,track,hasSolo) 第6引数hasSolo必須。**frame は常にコンポ時間**（トラック内時間への換算は関数内で `-tOffset`）
- **`.tl-tbtn` を添字で引かないこと**（SPEC_11 P4-2で🔒が2番目に入り、旧 `querySelectorAll('.tl-tbtn')[1]`＝SOLO想定が🔒を掴んでいた）。`toggleTrackSolo` は `.tl-tbtn.solo`、`toggleTrackLock` は `.tl-tbtn.lock` でクラス指定。ボタンを増やすときは既存の添字参照が無いか grep すること
- 確認ダイアログ(confirm)は全廃方針
- CAMERAは常に state.tracks 末尾＝タイムライン最上段に固定（`pinCameraTop()`、rebuildAllTrackUI冒頭で強制）。合成順は getCamAt が別管理なので配列位置は表示専用。camera はドラッグ並び替え不可
- カメラの親(NULL)は行内 `.tl-parent-sel`（削除ボタン左）とインスペクタ #kf-parent の両方から設定可。両者は `refreshTrackChainMarks` で同期
- undo対象のトラック編集データ(cloneEditState/applyHistory の perTrack)は keyframes/markers/parent/visible/solo/**name**/**tIn**/**tOut**/**tOffset**/**locked**。トラック行の新プロパティを undo させたいときはこの2箇所に追加
- ビュー: `F`=FIT(resetView)、500ms以内に2回目=100%(`zoomActual100`=width/baseW倍)。両方 `fitAction()` 経由。zoom=1 はビューにフィット(baseW)であって実寸ではない点に注意
- 全画面: `#btn-fullscreen`(HOME右)。`fullscreenchange`→`setupViewport()`で再フィット。iPhone非対応時はボタン自動非表示
- INSPECTOR: 左右ドック(`dockInspector`/localStorage 'composer_insp_side')。`Tab`=左右入替(`toggleInspectorSide`)、ヘッダ⇄で再ドック。フローティングは makeFloatDrag（left/top上書き）なので再ドックで解除
- 矢印↑↓=トラック選択送り(`selectTrackStep`。↑=前面/state末尾方向、Shift=端)。SHORTCUT_ACTIONS の run は e を受け取れる（Shift分岐可）
- Ctrl(⌘)+↑↓=トラック上下移動(`moveTrack`。Shift=端)。keydownで `ctrl||meta||alt` 早期returnの前に割り込み処理（SHORTCUT_ACTIONS はCtrl系を受けないため）。CAMERA不動・pinCameraTop維持・recordHistoryでundo可
- INSPECTORヘッダのボタン群は `.insp-head-btns` に入れる（makeFloatDragのskipが `.insp-head-btns` 全体を除外＝クリックがドラッグ開始で潰れない）

【未実装 / 将来候補】
- FRAME参照画像（複数ANIMATOR参照）
- 調整レイヤー的なエフェクト
- タイムリマップ（frames/cellInfos構造に踏み込む大工事＝別SPEC。SPEC_11 P4-5で対象外と明記）

【変更後チェック】
node -e "const fs=require('fs');const h=fs.readFileSync('composer.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(s=>s.length>200).join('\n;\n');new Function(m);console.log('OK')"
