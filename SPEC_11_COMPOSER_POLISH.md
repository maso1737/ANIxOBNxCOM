# SPEC_11: COMPOSER POLISH（座標ずれ修正・保全・トリム・グラフ編集）

対象: `composer.html`（単一HTML）。2026-07 の Phase 5/6 実装（influence/ミニグラフ/NULL/カメラ親/子Z/AE JSX）の続き。
発注者の優先順位: **P0 → P1/P1b →** それ以降は独立タスクとして任意の順。

## 0. 実装者（Opus）への共通規約 — 全フェーズ共通・必読

1. **二重実装の同期**: KF補間・親子チェーン・カメラ合成のロジックは
   ①本体（`getKfValue` / `applyTrackChain` / `getCamAt`、composer.html 前半）と
   ②WEB書き出しビューアテンプレ（同ファイル後半の `var DATA=` 以降にある同名 var 関数群）の**2箇所**にある。
   補間・描画系を変えたら**必ず両方**を同じロジックにすること。
2. **KFスキーマ**: `track.keyframes[prop] = [{f,v,ez, ei?,eo?}]`（ei/eo=influence% 0-100、任意）。
   **KFに新フィールドを足すときは以下の全経路に持ち回りを追加する**（ei/eo のときに通った経路）:
   - `renderKfDiamonds` 内 `putKeys`（kfVals/kfEz/kfInf と同様に収集・再付与）
   - 同 `groupSnap` 収集と `applyGroupDelta` の再配置
   - `copyKeyframes` / `pasteKeyframes`
   - 直列化4箇所: `buildTrackPayload` / `buildProjectPayload` / `webCollectTracks` / EXPORT WEB の camera 直列化
   - 復元: `parseTrackFromJSON`
   - ビューア側 `getKfValue`
   - undo は `cloneEditState` が `{...k}` の浅コピーなので自動で乗る
3. 変更後は `node tools/check.js`（ALL PASS 必須）＋ Browser 実機で検証し、
   ユーザー共通 CLAUDE.md の**動作チェック表**（`| パラメータ | 期待される変化 | 有効になる条件 | 結果 |`）を必ず付ける。
4. 確認ダイアログは native `confirm` 禁止（全廃方針）。必要なら app 風モーダルか flashLive+ボタン。
5. push は明示依頼時のみ。ドキュメント更新: 本SPECの進捗欄・COMPOSER_HANDOVER.md・（入出力が変わるフェーズは）PIPELINE.md。

---

## P0: タイムライン座標ずれ修正【バグ・最優先】

**症状**: タイムライン後半ほど、ミニグラフのキー点・グラフ内プレイヘッドが、上段のKFダイヤ/ルーラーより右にずれる。

**原因**: 座標規約の混在。
- ルーラー目盛（`drawRuler`）・プレイヘッド（`updatePlayhead`）・WAバンド（`updateWorkArea`）・KFダイヤ（`renderKfDiamonds`）・コマブロック（`buildTrackElement`）は全て **`f/total`**（フレーム左端基準）。
- `renderGraph` だけ **`f/(total-1)`** を使っている（カーブX・キー点X・プレイヘッドXの3箇所）。

**修正**:
1. 定数群の近く（`LABEL_W` 付近）に共通ヘルパを新設し、コメントで規約を明文化:
   ```js
   // タイムラインX座標規約: フレーム f の左端 = LABEL_W + (f/total)*描画幅。全UIでこれに統一
   const frameFrac = f => state.totalFrames ? f/state.totalFrames : 0;
   ```
2. `renderGraph` 内の `f/(total-1)` を全て `frameFrac(f)` に置換（カーブのループ、キー点、プレイヘッド線）。
3. 目視確認: 最終フレーム付近でKFを打ち、①ダイヤ ②グラフキー点 ③グラフのプレイヘッド線 ④ルーラーのプレイヘッド が縦1直線（±1px）に揃うこと。
4. それでもズレが残る環境（旧Safari等でスクロールバーが幅を食い、strip幅≠ルーラー幅になるケース）向けに、`#tl-tracks` へ `::-webkit-scrollbar{display:none;}` を追加して幅を揃える（`scrollbar-width:none` は指定済み）。

---

## P1: プロジェクト自動保存（IndexedDB）

**目的**: COMPOSER は現状メモリのみ（IDBはLIVE連携の読取だけ）。リロード/クラッシュで全損するのを防ぐ。

**設計 — 「絵」と「編集」を分離保存**（毎回全量JSONを書くと画像dataURLで重いため）:
- DB: `composer_autosave_v1`、objectStore 2つ:
  - `cells`: key=`tid`、value=`{tid, cells:serializeTrackCells(t), width, height, projectId, name, type}` — **トラック追加/絵の差し替え時のみ**書く（import完了時・`onLiveProjectUpdate` 後）。
  - `meta`: key=`'current'`、value=`buildProjectPayload()` から各トラックの `cells` を抜いて `cellsRef:tid` に置き換えたもの＋`savedAt`。**recordHistory のたび debounce 2s** で書く。
- 保存トリガ: `recordHistory()` 末尾から `scheduleAutosave()`（debounce）。絵の保存は `finishImport()` と `onLiveProjectUpdate()` 末尾から。
- 復元: 起動時に `meta.current` があれば、タイトルバー下に app 風バー（またはモーダル）で
  「前回の作業（savedAtを表示）を復元しますか？ [復元] [破棄]」→ 復元= meta の各トラックに `cells` ストアから絵を合流させて `importJSON`（PROJECT_v2 経路をそのまま使う）。破棄= 両ストアをクリア。
- 設定パネル（⚙）に「AUTOSAVE CLEAR」ボタンを追加。
- 対象外と明記するもの: 音声データ本体（audio.buffer。オフセット等の数値は meta に含めてよいが、ファイルは再読込してもらう）。
- 失敗時（容量超過等）は `try/catch` で握って `flashLive('AUTOSAVE FAILED (容量)')`。アプリ動作は継続。

**受け入れ基準**: 2画像+CAMERA+NULL+親子+KF(ez/ei/eo込み)+fx+WA+マーカーを作成→リロード→[復元]→ `buildProjectPayload()` が復元前と一致（tid含む）。

---

## P1b: トラック操作の undo 対応

**現状の欠陥**: `cloneEditState` は KF/マーカー/parent をインデックス対応で書き戻すだけ。**トラック削除・並び替え・追加は undo 不可**（削除はワンクリックで復元手段なし）。表示◉/SOLO も対象外。

**設計 — スナップショットに「トラック参照の順序配列」を持たせる**:
```js
function cloneEditState(){
  return {
    trackRefs: state.tracks.slice(),          // トラックオブジェクトへの参照（絵は共有なので軽い）
    perTrack: state.tracks.map(t=>({          // 深コピーが要る編集データ
      tid: t.tid,
      keyframes: ALL_PROPS.reduce((o,p)=>({...o,[p]:t.keyframes[p].map(k=>({...k}))}),{}),
      markers: t.markers.map(m=>({...m})),
      parent: t.parent||null, visible: t.visible!==false, solo: !!t.solo,
    })),
    gmarkers: state.markers.map(m=>({...m})),
    selectedTrack: state.selectedTrack,
    workArea: state.workArea?{...state.workArea}:null,
  };
}
```
`applyHistory(snap)`:
1. `state.tracks = snap.trackRefs.slice();` — これだけで追加/削除/並び替えが戻る（削除されたトラックも参照が生きているので絵ごと復活）。
2. `snap.perTrack` を tid で引き当てて keyframes/markers/parent/visible/solo を書き戻す。
3. `state.totalFrames` を再計算、`sanitizeParents()`、workArea 復元。
4. **`rebuildAllTrackUI()` を呼んで全再構築**（従来の「ラベルだけ更新」より重いが、トラック構成が変わりうるため必須。undo/redo はショートカット/ボタン起点でKFドラッグ中には発火しないので pointer capture 問題は起きない。`refreshTrackChainMarks` は rebuild に吸収されるが関数は残す）。
5. 従来どおり `drawCurrentFrame(); updateKfUI(); updateUndoButtons(); updateExportButtons();`

**注意**: `recordHistory` を呼んでいる既存箇所はそのままで全操作が対象になるが、**`removeTrack`/`doTrackReorder`/`toggleTrackVis`/`toggleTrackSolo` が `recordHistory()` を呼んでいるか確認し、無ければ追加**。

**受け入れ基準**: ①トラック削除→undo→絵・KF・親ごと復活 ②並び替え→undo ③◉/SOLO→undo ④従来のKF undo が退行しない ⑤削除→undo→redo→再削除 が安定。

---

## P2: ホールド（ステップ）補間

**目的**: 「次のキーまで値を固定」。カメラのピタ止め、3コマ打ち的タイミング用。

- スキーマ: キーに任意 `hold:true`。**区間の左キーに付く**（AE準拠: そのキーから次のキーまで値固定）。
- 補間: `getKfValue` の区間ループ内・influence判定より**前**に
  `if(arr[i].hold) return arr[i].v;`
  ビューア側 `getKfValue` にも同じ1行。
- UI:
  - インスペクター EASE ボタンの下に `◻ HOLD (選択KFトグル)` ボタン（`applyEase` と同型の `applyHold(toggle)`：選択KF、無ければ現フレームのキー）。
  - ダイヤ表示: hold キーは**正方形（回転なし）・グレー**。`renderKfDiamonds` の ez 形状判定に `hold` を追加（クラス `.ez-hold{transform:translate(-50%,-50%);border-radius:0;background:#8892a0;}` — rotate(45deg) を外す）。
  - `cycleEase`（Ctrl+クリック/ダブルタップ）は従来どおり 0↔1 のみ。hold はボタン専用（誤爆防止）。
- **共通規約 §0-2 の全経路に `hold` を追加**（putKeys/groupSnap/copy/paste/直列化4箇所/parse/viewer）。
- PIPELINE.md の PROJECT_v2 欄に `hold` 追記。

**受け入れ基準**: x 0→100 の2キーで左キーにHOLD → 中間フレームは0のまま、次キーで100にジャンプ。WEB書き出しでも同挙動。undo/コピペ/複製で hold が保持される。

---

## P2b: ペアレント時のジャンプ補正

**目的**: PRNT を付けた/外した瞬間に子が画面上で飛ぶのを防ぐ（AEの挙動）。

- 対象: `$('#kf-parent')` の change ハンドラ。カメラの親付け（加算合成）は対象外（挙動が単純なので現状維持）。
- 方式: **現フレームで見た目一致**を保証（全フレーム一致は親のKFが時変なので原理的に不可。ツールチップにその旨明記）。
  1. 変更前の子のワールド2D相似変換 `W`（tx,ty,rot,scale）を、現フレームの親チェーン合成から計算
     （`applyTrackChain` と同じ式を Canvas ctx を使わず数値で再現する小関数 `chainXformAt(track, frame)` を新設。root式には cam を含めない＝カメラは表示側の話なので補正対象外）。
  2. 新親の `P` を同様に計算し、新ローカル `L = P⁻¹·W` を分解（2D相似: tx,ty,rot,s）。
  3. 子の現在値（現フレームの x,y,rot,s 評価値）との**差分**を、子の該当プロパティの**全KFへ加算**（sは乗算）。KFが無いプロパティは現フレームに1キー作成して差分適用。ax/ay は触らない。
  4. `recordHistory()`（P1b 実装後なら parent 変更ごと undo 可能）。
- 補正なしで付けたい場合: **Alt を押しながら選択**で従来挙動（ハンドラで `event.altKey` は取れないため、`sel` に `pointerdown` で altKey を記録しておく実装で可。難しければ設定パネルにトグルでも可）。

**受け入れ基準**: 子にKFを打った状態で親を付ける→現フレームの見た目が不変（±1px）。外す→同様。undo で親と補正が両方戻る。

---

## P2c: ミニグラフの編集対応

前提: P0 完了後。

1. **プロパティフィルタ**: 凡例文字（renderGraph が左に描く X/Y/Z…）をクリックでそのプロパティのみ表示、再クリックで全表示。canvas 描画なのでヒット判定は「凡例の描画位置を配列 `gGraphLegendHits=[{p,x,y,w,h}]` に記録 → `#tl-graph-canvas` の click で判定」。状態は `gGraphSolo=null|'x'|…`。
2. **キー点ドラッグ**（VALモードのみ。SPDは表示専用と明記）:
   - `pointerdown` で全表示中プロパティのキー点から半径7px以内を探す（`gGraphSolo` 中はそのプロパティのみ）。
   - 横ドラッグ: `newF=Math.round(逆写像)`。既存キーと衝突したら**移動しない**（クランプ）。`putKeys` 相当ではなく単一プロパティなので `k.f` を直接変更→sort。
   - 縦ドラッグ: 正規化の逆写像で値へ（`renderGraph` の min/max/rng をドラッグ開始時に固定して使う。ドラッグ中に再正規化するとカーブが暴れるため）。`clampProp` を通す。
   - `pointerup` で `recordHistory(); renderKfDiamonds(選択トラック); drawCurrentFrame();`
   - Shift+縦ドラッグ=×10 精密（既存スクラブと同じ流儀で、こちらは×0.1 の意）。
3. グラフ高さ: 既存 74px 固定でよい（リサイズは将来）。

**受け入れ基準**: キー点を右に3コマ動かす→ダイヤも移動・絵も追従。縦に動かす→インスペクター値が変わる。SPDモードでドラッグしても何も起きない。undo可。

---

## P3: PNG連番書き出しのワークエリア準拠

**現状**: VIDEO / EXPORT WEB は workArea 準拠だが、`EXPORT 4K PNG`（`exportPNG` → `exportZipPNG(state.totalFrames,…)`）と各トラックPNG（`exportTrackPNG` → `track.totalFrames`）は**常に全範囲**。

- `webRange()` を流用して `{start,end,len}` を取り、`exportZipPNG(len, zipName, (ctx,i)=>drawAt(ctx, start+i))` に変更（全体・per-track・FX final 経路すべて）。
- **ファイル名は絶対フレーム番号**（`String(start+i+1).padStart(5,'0')`）。AE等に読み込んだときタイムラインと一致させるため。現在の連番生成部を確認して合わせる。
- WAが全範囲のときは従来と同一出力（後方互換）。

**受け入れ基準**: WA=10..20 で EXPORT → 10枚、ファイル名 00011〜00020。WA未設定→従来どおり全コマ。

---

## P3b: トラックの IN/OUT トリムと時間オフセット（AEの `[` `]` 相当）

> 発注者の懸念「重いのでは」への回答: 重くない。描画は `drawOneTrack` 冒頭の減算1回＋範囲チェックのみで、
> コマデータ・KF構造の変更も不要。OP 0/100 のキー運用よりKFが汚れず、サムネのグレーアウトで視認性も出る。

### P3b-1: IN/OUT トリム（先行実装）

- スキーマ: `track.tIn`（既定0）/ `track.tOut`（既定 `Infinity` 扱い。保存時は `null`=無し）。**コンポ時間基準**。
- 描画: `drawOneTrack`（本体・ビューア両方）の冒頭付近に
  `if(frameIdx < (track.tIn||0) || frameIdx >= (track.tOut ?? Infinity)) return;`
  （camera/null トラックには適用しない。type チェックの後に置く）
- タイムラインUI:
  - 範囲外の `.tl-frame-block` に class `trimmed` を付与（`buildTrackElement` のブロック生成時と、トリム変更時に該当トラックだけ再判定）。
    CSS: `.tl-frame-block.trimmed{filter:grayscale(1) brightness(.6);opacity:.35;}` ← **発注者要望の「範囲外グレーアウト」**
  - ストリップ左右端のドラッグハンドル `.tl-trim-handle`（幅7px、`position:absolute;top:0;bottom:0;cursor:ew-resize;z-index:5;pointer-events:all;`、左=tIn位置・右=tOut位置に配置）。ドラッグで `Math.round` スナップ、`tIn<tOut` をクランプ。pointer capture は KFダイヤと同じ流儀（ドラッグ中は再構築禁止、up で recordHistory）。
  - トリム未設定トラックはハンドルをストリップ両端に薄く表示（hover で発光）。
- ショートカット（`SHORTCUT_ACTIONS` 追加・AE準拠）:
  - `Alt+[`: 選択トラックの `tIn=現フレーム` ／ `Alt+]`: `tOut=現フレーム+1`
  - 登録は `def:'Alt+['` 形式が gKeymap で扱えるか確認し、扱えなければ `def:'['`/`']'` に Alt 判定を run 内で（`e.altKey` で分岐: Altなし=何もしない）。
- 直列化: PROJECT_v2 トラックに `tIn/tOut`（無指定は省略）。`parseTrackFromJSON` で復元。`webCollectTracks` は **frameMap 生成時に範囲外を -1 にする**（ビューア側は既存の -1 スキップに乗るので描画変更不要だが、P3b-1 の drawOneTrack ガードも入れて二重に安全）。undo: P1b の perTrack スナップに `tIn/tOut` を追加。
- 書き出し: drawFrame 経由（PNG/VIDEO）は drawOneTrack ガードで自動反映。
- PIPELINE.md 追記。

### P3b-2: 時間オフセット（ずらし。P3b-1 の後）

- スキーマ: `track.tOffset`（既定0、整数、負可）。**絵とKFの両方**をコンポ時間上で後ろ（正）へずらす（AEでレイヤーバーを掴んで動かす挙動）。
- 実装点（「トラック内時間 = コンポ時間 − tOffset」で統一）:
  - `drawOneTrack`（本体・ビューア）: セル参照 `fi` の計算を `frameIdx-track.tOffset` 基準に。トランスフォームは `applyTrackChain` に渡す frame を `frameIdx-track.tOffset` に（**親は親自身の tOffset で評価**するため、applyTrackChain 内で毎トラック `frameIdx-各track.tOffset` を使う形に変える）。
  - `getCamAt` のカメラ/NULL 評価も同様（camera に tOffset UI は出さないが、データ上は統一）。
  - タイムライン表示: `.tl-frame-block` の left に `+tOffset/total*100%`、`renderKfDiamonds`/`renderMarkers` の位置とドラッグ換算に `+tOffset`、トリムハンドル位置も同様。
  - ストリップ本体の横ドラッグで tOffset 変更（`.tl-track-strip` の空き部分 pointerdown。KFダイヤ・マーカー・トリムハンドルが優先されるよう z-index/ヒット順に注意。既存のマーキー選択（#tl-tracks 上のドラッグ）と競合するため、**Alt+ドラッグ=ずらし** とする）。
  - 直列化/undo/PIPELINE: P3b-1 と同様に `tOffset` を追加。
- **注意**: ここは触る箇所が多い。P3b-1 とは別コミットにし、動作チェック表を独立に作ること。

**受け入れ基準（3b共通）**: トリム外は絵が出ない＆サムネがグレー／`Alt+[` で現フレームからIN／PROJECT往復・WEB書き出し・undo で保持／オフセット後もKFダイヤと絵とプレビューが一致して動く。

---

## P4: 小物（各1〜2時間・独立）

1. **OPパンチ ショートカット**（発注者案。トリム実装後もフリッカー演出用に有用）:
   `O`=現フレームに op=1 → 次フレームに op=0 の2キー、`Shift+O`=逆（0→1）。既存 `commitProp`+`setKf` で実装。
2. **トラックロック 🔒**: `track.locked`。ロック中は selectTrack 可・編集系（commitProp/setKf/ダイヤドラッグ/削除）を flashLive で拒否。ボタンは `.tl-tbtn`（**幅128px制限に注意 — HANDOVER「ボタンを増やすときは要再計測」**）。
3. **1/2解像度ドラフト再生**: 再生中のみ `drawFrame` を半解像度オフスクリーンに描いて拡大表示（`state.isPlaying` で分岐）。設定パネルにトグル。
4. **AE JSX にトラックも書き出し**: `exportAeJsx` を拡張し、各トラックを平面レイヤー（またはヌル）としてPosition/Scale/Rotation/OpacityのKF付きで生成。Z→AEのZ位置（`persp` 換算はAE側カメラに任せる）。
5. **タイムリマップ**: 大工事（frames/cellInfos 構造に踏み込む）。**別SPECを起こすこと。本SPECではやらない。**

---

## 進捗

- [x] P0 座標ずれ修正（2026-07-19。frameFrac統一・グラフのtotal-1バグ修正・scrollbar非表示CSS）
- [x] P1 自動保存（2026-07-19。cells/meta分離・復元バーはLIVE先行ロードより優先＝置き換えセマンティクス・✕=温存で閉じる・⚙にCLEAR）
- [x] P1b トラックundo（2026-07-19。trackRefs+perTrack(tid引き当て)方式。削除/並び替え/◉/SOLO/WAがundo対象に。applyHistoryはrebuildAllTrackUI）
- [ ] P2 ホールド補間
- [ ] P2b ペアレント補正
- [ ] P2c グラフ編集
- [ ] P3 PNG WA準拠
- [ ] P3b-1 IN/OUTトリム
- [ ] P3b-2 時間オフセット
- [ ] P4 小物
