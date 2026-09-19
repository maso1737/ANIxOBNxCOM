# SPEC_20 — ANIMATOR「線と塗りの2レーン」＋ REF レーン ＋ 変形（econte WARP 移植）

作成 2026-09-18。対象 `animator.html`（2026-09-15「参照まわりを1本化」までが起点）。
**実装者向け。着手前に `ANIMATOR_HANDOVER.md` の「レイヤー構成」「主要な state」「autosave の容量実測」と、
UI 規約 `OBAN_BUILDER_UI_HANDOVER.md` §1・§2・§4 を読むこと。**
発注者との合意 2026-09-18（本文 §1 の「決めごと」がその写し。§5 に仮置きの4点も確定として記録）。

---

## 0. いま何が起きているか（診断）

| # | いまの形 | 困りごと |
|---|---|---|
| S1 | コマの絵は `frames[].drawData`（RGBA 1枚）で、**線も塗りも同じバッファ**に焼かれている（`syncFrameFromCanvas` `animator.html:4391`） | AE 用に線と塗りを別素材で出せない。塗りが線を汚す・線が塗りを汚す。塗りの縁に線のアンチエイリアスの白い隙間が出る |
| S2 | REF は3種（参照 ANIMATOR＝ティック同期・PASTE 画像＝静止・FRAME＝描ける下絵）を**フローティング REF パネルの行**でしか見られない | 「どの参照がいつ出ているか」「尺がどこで尽きるか」が時間軸の上で見えない。表示間隔（コマ打ち）も時間オフセットも無い |
| S3 | 描いた絵の**選択→拡縮/回転/コピペ**が無い（HANDOVER「将来フェーズ・見送り中」） | econte には `箱+rot+warp` が実装済み（`floatLift` `econte.html:6104` / `floatCommit` `:6359`・実測 3ms 台）なのに animator に無い |

土台として使える既存の仕組みが3つある。**新しく作らず、これを伸ばす。**

- 描く先の切替は FRAME LAYER の EDIT が既にやっている：`activeDrawCtx()`（`:5598`）が `frameLayerCtx` か `drawCtx` を返すだけ。
- 参照は `color`・尺（`ticks.length`）・`x/y/scale`・`locked` を持ち、`renderRefLayer(tick)`（`:2756`）が1本で描いている。
- タイムラインの横軸は `tickToPx()`（`:4600`）で、ワークエリアの黄色帯もこれで置いている。REF の帯も同じ物差しで置ける。

---

## 1. 決めごと

### 1-1. データ：コマ ＝ `line` ＋ `fill`

```js
frame = {
  id, kind, duration, hidden,
  line: Uint8ClampedArray | null,   // 旧 drawData。W×H×4
  fill: Uint8ClampedArray | null,   // ★最初の塗りまで null（メモリを増やさない）
  thumbCanvas,                      // 合成サムネ（従来どおり1枚）
  history: [{ lane:'line'|'fill'|'both', line?, fill? }], histIdx,   // ★エントリにレーン印
  strokeCount, ...
}
state.lane  = 'line' | 'fill'                                  // いま描く先
state.lanes = { line:{visible:true, locked:false, opacity:1},
                fill:{visible:true, locked:false, opacity:1} } // レーン全体の属性（セルごとではない）
```

- **タイムラインは1本、レーンが2つ。** 線と塗りは必ず同じコマ打ちなので、独立した2本にしない（同期ズレの管理が増えるだけ）。
- `fill` は遅延確保。線の段階のコマは今と同じメモリ量。塗り済みのコマだけ生 9MB → 18MB（2048×1152）。
  IndexedDB は圧縮が効くので 0.42MB → 0.7MB 程度の見込み（HANDOVER「autosave の容量実測」の比で）。
- 旧プロジェクト（`drawData` のみ）は **丸ごと `line` に入れる。分離しない**（§5-1）。

### 1-2. 描画：2枚の canvas、描く先は `activeDrawCtx()` の分岐が1つ増えるだけ

`#canvas-wrap` のスタック（上から）：

```
guide-layer / draw-line（★新・旧 draw-layer を改名） / draw-fill（★新） / onion-next / onion-prev / refimg-layer / frame-layer / ref-layer / bg-layer
```

- 線は塗りの上。セルの見た目そのまま。**合成はブラウザのコンポジタが GPU でやる**ので、ストローク中の JS は今と同じ「1枚に描く」だけ。
  ストロークごとに自前で1枚へ合成し直す方式は**取らない**（重くなる唯一の分岐なので禁止）。
- `activeDrawCtx()` ＝ `frameLayer.editMode ? frameLayerCtx : (state.lane === 'fill' ? fillCtx : lineCtx)`。
  `floodFill` `lassoFillPolygon` `pushHistory` `syncFrameFromCanvas` `loadFrameToCanvas` は**この1関数経由に揃える**（§2-2 の表）。
- レーンの `visible` / `opacity` は canvas の CSS（`display` / `opacity`）で効かせる。FRAME LAYER の `applyFrameLayerStyle()`（`:2524`）と同じ作法。

**道具 × レーンの規則**（「効かない＝バグ？」を作らない）

| 道具 | 線レーン | 塗レーン |
|---|---|---|
| PEN | `inkColor` | **`fillColor` で描く**（塗り残しの補修用。§5-2） |
| ERASE | ○ | ○ |
| FILL / 投げ縄塗り（FILL 長押し） | **押した瞬間に塗レーンへ移る**（トースト「塗レーンへ」）。線レーン上の FILL ボタンには小さく「塗」バッジ | ○ |
| SEL（変形・§1-7） | 現在レーン（HUD の「線+塗」で両方） | 同左 |
| 🔒 ロック中 | 選べるが描けない。ストローク開始で「🔒 線レーンはロック中」トースト。FILL の自動移動先がロック中でも移動はする（描けない理由はトーストで出る） | 同左 |

- **オニオンスキンは線レーンだけ**（§5-3）。`drawOnionSide()`（`:5159`）が拾うのを `f.line` にする。`onionTint` のキャッシュキーも `line` 配列へ。
  設定パネルに「オニオンに塗りを含める」（既定 OFF）。
- サムネ・タイムラプス（`tlComposeShot` `:7795`）・VIDEO は合成（`fill` の上に `line`・レーン不透明度は**掛けない**＝出力は常に 100%）。

### 1-3. 塗りが線を参照する（ここが分離の最大の実利）

`floodFill()`（`:3919`）は今「自分のバッファの色の連続」で広がる。塗レーンでは次に変える。

- **壁 ＝ 線レーンの α ≥ `FILL_WALL_A`（既定 128）**。塗レーンの既存色は従来どおり「領域」（同色の連続）。
- 広げた結果を **`FILL_UNDER_PX`（既定 1・設定 0〜3）だけ膨らませて**から塗る。線が上に載るので膨らみは見えず、
  線のアンチエイリアスの縁に出ていた白い隙間が消える。AE で線と塗りを別に重ねても同じ結果になる（塗りが線の下まで届いている）。
- 投げ縄塗りは膨らませない（多角形の縁は線ではないので）。
- トーン（`isToneInk` `:2162`）は塗レーンの塗り。従来どおり網点位置だけ着色。
- 隙間閉じ（線が途切れていても漏れない）は**このSPECではやらない**。要るなら別SPEC。

### 1-4. タイムライン：レーン付きストリップ

```
       ┌──────────────────────────── time-track（既存のルーラー / ワークエリア / カーソル）
 ▸REF 2│ ■C12_rough ×2 ─────────┤   ▪PASTE 1 ══════════   ▪下絵 ══════════      ← §1-5 の帯
 線 ●🔒 100│[thumb][thumb][ thumb  ][空][thumb]…                                   ← 従来サムネ（合成）
 塗 ●🔒 100│[ ▬  ][    ][   ▬    ][  ][ ▬  ]…                                     ← 細い帯 14px
```

- **レーン見出しは左端の固定列**（`#lane-head`）。行ごとに `名前 ● 🔒 100`。
  `●`＝表示、`🔒`＝ロック、数字＝不透明度で**左右ドラッグの数値**（OBAN の `qd-num` / `data-scr` と同じ手つき）。
  ドラッグ中は数字のテキストだけ差し替え、離したら `updateStripUI()`（OBAN §4「ドラッグ中はテキストだけ・離したら全再描画」）。
- **セル**：既存 `.fc` の中を上下に割る。上＝従来の `.fc-thumb`（合成サムネ）、下＝`.fc-fill`（14px の帯。`f.fill` があれば `--acc2` の 60%、無ければ枠線だけ）。
  空ブロック `.fc-empty` は割らない。
- **レーンをタップ ＝ そのコマを選ぶ ＋ `state.lane` がそのレーンになる。** 現在レーン側は `--acc` で縁取り、反対側は 60% に落とす。
  Shift 複数選択・ドラッグ並べ替え・コマ打ちハンドルは**上下どちらを掴んでも従来どおり**（レーンは「どこに描くか」だけを変える）。
- **HUD**：`#stage-info` に `LINE` / `FILL` を大きく出す（レーン色）。カーソルの色もレーン色。
- **キー**：`SHORTCUT_ACTIONS` に「レーン切替」を登録（既定キーは実装時に空きから採り、`gKeymap` で再割当可）。
- 塗レーンを「帯ではなくサムネ」にしたい場合は設定パネルのトグル（既定 OFF。iPad の縦を食わないため）。

### 1-5. REF レーン：参照ごとの「帯」

`time-track` と `frame-strip` の間に `#ref-lane` を1行。**サムネは持たない。帯の div だけ。**
横スクロールは `#time-track-inner` と同じ `translateX` で追従させる。

| 参照 | 帯 | 長さ | 操作 |
|---|---|---|---|
| 参照 ANIMATOR（`refAnimators[]`） | `r.color` の帯・名前・`×N` | `tickToPx(offset)` 〜 `tickToPx(offset + ticks.length × step)` | タップ＝選択（`refSel`）／横ドラッグ＝`offset`／右端の `×N` をタップ＝`step`（`fc-dur` と同じ変更UI） |
| PASTE 画像（`refImages[]`） | ice の細い帯（4px） | 全長 | タップ＝選択 |
| FRAME 下絵 | 白の細い帯（4px） | 全長 | タップ＝選択 |
| 1コマだけの参照（MANGA PLATE のコマ枠など） | 細い帯 | 全長（静止画扱い。既存規則） | タップ＝選択 |

新設フィールド：`r.offset`（tick・既定 0）、`r.step`（≥1・既定 1）。保存は `saveRefs()`（`:2906`）に同梱。

- `renderRefLayer(t)` と `animTickImg(r)`（`:3395`）は**同じ式**で添字を出す：`k = floor((t - r.offset) / r.step)`、`k < 0` または `k ≥ ticks.length` は非表示。
  静止画（`ticks.length === 1`）は両方無視して全ティック。**2つの関数の規則を揃える**のは HANDOVER で踏んだ落とし穴（`refCenterSel` が黙る）。
- `effectiveTotalTicks()`（`:4576`）は `offset + ticks.length × step` の最大を見る。
- `▸REF n` で折り畳み（`localStorage['animator_reflane_v1']`）。参照 0 件なら自動で畳む＝使っていないとき高さを食わない。
- 帯の色：参照 ANIMATOR の `REF_COLORS` は「どの参照か」を示す**役割固定色**なので据え置き（OBAN §7-1 と同じ理屈）。選択枠だけ `--acc`。

### 1-6. フローティング REF パネルは「何を・どう」、レーンは「いつ・どれが」

同じ `refSel` を共有する2つの見え方。**パネルの機能は減らさない**：
+ PASTE / + JSON・SEQ / + SAVED / 行ごとの ● VIS・🔒・濃度・✕ / MOVE / 中央 / FRAME の EDIT・CLR・濃度。
レーンで帯をタップするとパネルの行がハイライトし、パネルの行をタップすると帯が縁取られる。
**変形（§1-7）はパネルに入れない**（「参照を変形するのか絵を変形するのか」が毎回曖昧になる）。

### 1-7. 変形：econte の `箱+rot+warp` を道具側に移植

econte の `gFloat`（`floatLift` `:6104` → 箱ハンドル → `floatCommit` `:6359`、`flPaint` `:6085`、`toggleSelWarp` `:6470`、`gSelClip` `:6401`）をそのまま持ってくる。
形の持ち方は econte と同じ **`箱(x,y,w,h) + rot + warp{u,v}`（箱ローカルの正規化座標）**。ECONTE_HANDOVER の変形表 #1〜#8 が根拠。

animator 向けに変えるのは次だけ：

| 項目 | econte | animator |
|---|---|---|
| 入口 | SEL ツール | **`SEL` ツールボタンを新設**。ドラッグ＝投げ縄、Shift+ドラッグ＝矩形。**SEL の Wクリック＝WARP on/off**（econte と同じ手つき・SPEC_16 §5-B3） |
| 持ち上げ元 | `line` / `base` | **現在レーン**。HUD の「線+塗」トグルで両レーンを同じ変形で動かす（セルの一部をまるごと動かすとき） |
| 貼り方 | `imageSmoothingEnabled = true` | **`state.selAA`（既定 false）**＝ニアレスト。回転でギザギザになるのが「アンチ無しのまま」。HUD で AA on/off |
| PASTE の置き場 | 貼り先の紙の中央 | **同じ座標**（コマは全部同じ寸法なので。中割りの流用は同位置が欲しい） |
| Undo | 持ち上げ〜確定で1手 | 同じ。`history` のエントリは `lane:'both'` で `line`/`fill` 両方を持つ |
| 描画中の扱い | 持ち上げ中は描けない | 同じ。持ち上げ中だけ `#float-layer`（新設・`draw-line` の上）に描き、確定で焼いて消す |
| コピー | `gSelClip`（見えている形を焼いてから控える） | 同じ。別コマの**同じレーン**へ貼れる。「線+塗」で取ったものは両レーンに貼る |

HUD（持ち上げ中だけ出る小パネル）は OBAN の骨格（§1-9）：`AA` / `線+塗` / `WARP` / `COPY` / `PASTE` / `✓ 確定` / `✕ 取消`。
Esc の優先順位：**変形の取消 ＞ 投げ縄の取消 ＞ TL 再生の停止 ＞ フレーム選択解除**（既存の順の先頭に2つ足す）。

### 1-8. 書き出し・連携

| 出口 | 変更 |
|---|---|
| **SEQ PNG**（`exportSequencePNG` `:7207`） | 押すと4択モーダル（OBAN の `qdSeg`）：**合体 / 線 / 塗 / 線+塗（別フォルダ）**。前回の選択を `localStorage['animator_seq_mode_v1']`。ZIP は `frames/`（合体・従来）または `line/` ＋ `fill/`。ファイル名は従来の `frame_00000.png` |
| **PNG**（単枚・`exportPNG` `:7162`） | 合体のまま。Shift＝BG透過も従来どおり |
| **VIDEO** | 合体のまま |
| **EXPORT JSON**（ファイル・`buildProjectJSON` `:6781`） | `cells[].image` は合体（従来）。**`cells[].layers = { line: dataURL, fill: dataURL \| null }` を追加**。`applyProjectJSON`（`:6850`）は `layers` があれば分離して戻し、無ければ `image` → `line` |
| **PROJ 保存箱（スナップショット）** | EXPORT JSON と同じ形（`layers` 込み） |
| **→ COMPOSER / LIVE / 共有DB `tdr_exchange`**（`broadcastProjectNow` `:7120`） | **合体 1枚のみ。`layers` は載せない**（3倍に膨らむのを避ける）。COMPOSER / OBAN / MANGA PLATE は**改修ゼロ**（SPEC_07 の大原則を守る） |

`buildProjectJSON()` にフラグ `{ forExchange:true }` を足し、共有DB／LIVE 向けだけ `layers` を落とす。
`PIPELINE.md` の animator の出口に「SEQ PNG の4択」と「EXPORT JSON `layers`」を追記すること。

### 1-9. UI 規約 ＝ 新 OBAN（`OBAN_BUILDER_UI_HANDOVER.md`）

発注者指定 2026-09-18。**このSPECで新設する UI はすべて OBAN の骨格と語彙で作る。**

- **色は変数経由。hex を足さない。** `:root` に `--acc` / `--accRGB` / `--acc2` / `--acc2RGB` と派生（`--acc-border` / `--acc-hover-fill` / `--acc-hover-line` / `--acc-glow`）を追加。
  既存の `--acid`（`animator.html:23`）は **`--acid: var(--acc)` のエイリアス**にする＝既存 UI も自動で追従し、ハードコードは増えない。
- **3テーマ** `THEMES = ['GLOSS','SPOTLIGHT','ROUGE']`・`body[data-theme]`・`localStorage['animator-theme']`・`applyTheme(t, quiet)` が唯一の入口。
  切替は ⚙ 設定パネルの `.set-theme`。**animator の既定は ROUGE**（＝現行の桃と同じ見え方。既存ユーザーの目を変えない）。
- **新設パネル**（変形 HUD・SEQ 4択モーダル・REF 帯の `×N` 変更）は OBAN の骨格：ヘッダ 44px・`▾`/`✕` 28×28（`pointer:coarse` で 34×34）・
  `makePanelDraggable(panel, head)` / `makePanelResizable(handle, body, sel)`・中身は `.qd-*`（`qdSect` / `qdRow` / `qdSeg` / `qd-num` / `.qd-sb` / `.qd-note`）。
  `#ref-panel` など**既存パネルの骨格は触らない**（P5 任意）。
- **canvas 内の色は `CVC` 橋**（`syncCanvasColors()` を `applyTheme()` の中でだけ呼ぶ）。レーン色・選択枠・HUD の LINE/FILL は `CVC` に並べる。`REF_COLORS` は役割固定色として据え置き。
- **「ドラッグ中はテキストだけ・離したら全再描画」**：レーン不透明度のスクラブ、REF 帯の `offset` ドラッグ、`×N`。
- `scrollIntoView` は使わない。

---

## 2. 実装の当たり

### 2-1. データ・移行（`CFG.DB_VERSION` 5 → 6・`animator.html:2018`）

- `STORE_FRAMES` の値：`{drawData, duration, width, height, savedAt}` → `{line, fill, duration, width, height, savedAt}`。
  **読むときは `drawData` があって `line` が無ければ `line` として扱う**（`loadProject` `:7564`）。書くときは常に新形式（`flushSave` `:7415`・差分保存は従来どおり）。
- `onupgradeneeded` でストアは増やさない（既存レコードはそのまま。読み側の読み替えだけで足りる）。
- `saveRefs()` の各参照に `offset` / `step` を追加。無ければ 0 / 1。
- `frameClipboard`（`:3099`）・`pushTimelineHistory()`（`:4221`）のスナップショットは `drawData` → `line` ＋ `fill`（参照同一性の比較は両方見る）。
- `resampleDrawData` / `recanvasDrawData`（`:3666` / `:3680`・CANVAS SIZE 変更）は `line` と `fill` の両方に掛ける。

### 2-2. 描画（関数の読み替え表）

| 関数 | いま | これから |
|---|---|---|
| `activeDrawCtx()` `:5598` | `editMode ? frameLayerCtx : drawCtx` | `editMode ? frameLayerCtx : (lane==='fill' ? fillCtx : lineCtx)` |
| `floodFill()` `:3919` | 自分のバッファで色の連続 | 塗レーン：壁＝線 α、領域＝塗の色。結果を `FILL_UNDER_PX` 膨張。線レーンでは呼ばれない（道具が塗レーンへ移る） |
| `syncFrameFromCanvas()` `:4391` | `drawCtx` → `drawData` | `lineCtx` → `line`、`fillCtx` → `fill`（**触ったレーンだけ** `getImageData`。もう片方は据え置き） |
| `loadFrameToCanvas()` `:4403` | `drawData` → `drawCtx` | `line` → `lineCtx`、`fill` → `fillCtx`（null なら clear） |
| `pushHistory()` `:4141` | `snapshot()` 1枚 | エントリに `lane` を付け、そのレーンの ImageData だけ積む。`stepUndo/Redo` は `lane` を見て戻す先を選ぶ |
| `regenThumb()` `:3700` | `drawData` | `fill` の上に `line` を描く |
| `frameToPNGDataURL()` `:6758` | `drawData` | 引数 `lane:'both'\|'line'\|'fill'`。既定 `both` |
| `drawOnionSide()` `:5159` / `onionTint()` `:5207` | `drawData` | `line`（設定で `both`） |
| `tlComposeShot()` `:7795` | draw 1枚 | `fill` → `line` の順 |
| `markFrameDirty()` `:7720` | — | 変更なし（レーンに関係なくコマ単位で dirty） |

### 2-3. タイムライン

- `buildStrip()`（`:4631`）：`.fc` の中に `.fc-thumb`（既存）と `.fc-fill`（新）を作る。`data-lane` を持たせ、`pointerdown` で `state.lane` を更新してから既存の選択処理へ流す。
- `updateStripUI()`（`:5015`）：`.fc-fill` の「あり/なし」と現在レーンの縁取りを更新。
- `#lane-head`：`#strip-area` の左に固定列。`#time-track-inner` の `left:28px` は見出し列の幅に合わせて広げる（帯とセルの原点を揃える）。
- `#ref-lane`：`updateTimeTrack()`（`:5058`）の中で帯を作り直す（呼ばれる頻度は既に低い。ストローク中には走らない）。

### 2-4. 変形の移植元（econte）

`FL_WARP_N` `econte.html:5880`（4×4 固定）／`flLocalWarp` `:5982`／`flPaint` `:6085`／`floatLift` `:6104`／`floatCommit` `:6359`／`gSelClip` `:6401`／`toggleSelWarp` `:6470`。
`flPaint` の `imageSmoothingEnabled` を `state.selAA` にする以外は**数式を変えない**（三角形の 0.45px 膨らませ・反対側の隅をワールドで固定、はそのまま）。
持ち上げ元の紙は `floatSourcePaper()` の読み替え：現在レーンの canvas（`線+塗` なら2枚を同じ `gFloat` で持つ）。

### 2-5. 重さの見積り（守るべき数字）

| 場面 | 見込み | 根拠 |
|---|---|---|
| ストローク中 | **今と同じ** | 描く先が1枚なのは変わらない。合成はコンポジタ |
| コマ切替 | `putImageData` が最大2回（塗りが無ければ1回） | `loadFrameToCanvas` |
| 塗り済み 72 コマの RAM | +9MB × 塗り済み枚数 | `fill` は遅延確保 |
| IndexedDB | 1コマ 0.42MB → 0.7MB 前後 | HANDOVER 実測の比 |
| REF レーン | div 数 = 参照数 | サムネ無し |
| 変形プレビュー | 3.1〜3.4ms／確定 ≤173ms 1回 | ECONTE_HANDOVER #8 |

---

## 3. フェーズ

| P | 内容 | 完了の条件 |
|---|---|---|
| **P0** | データ（§1-1）・2枚 canvas（§1-2）・道具×レーン規則・塗りの壁判定と潜り（§1-3）・DB v6 と読み替え（§2-1）・§2-2 の表。UI は**トップバーに `線/塗` トグル1つだけ** | 旧プロジェクトが線レーンに入って1pxも変わらない／塗レーンで FILL すると線の下に 1px 潜る／Ctrl+Z がレーンを跨がない／`verify:animator` 0.000% |
| **P1** | タイムラインのレーン化（§1-4）・HUD・キー・テーマ変数と3テーマ（§1-9） | 見出し列の ● 🔒 数字が効く／レーンをタップで描く先が変わる／既定 ROUGE で今と同じ見え方 |
| **P2** | REF レーン（§1-5）・`offset` / `step`・折り畳み | 帯の位置と `renderRefLayer` の表示が一致／中央ボタンが t≥1 でも効く（`animTickImg` 同規則） |
| **P3** | 書き出し 4択・EXPORT JSON `layers`・`forExchange`（§1-8）・`PIPELINE.md` 更新 | 線 ZIP と塗 ZIP を AE で重ねて合体 ZIP と一致／COMPOSER に届く JSON のサイズが今と同じ |
| **P4** | 変形（§1-7）：SEL ツール・投げ縄/矩形・箱+rot+warp・AA off・線+塗・COPY/PASTE | econte と同じ操作で動く／AA off で回転後も線が 2値のまま／Undo 1手 |
| P5（任意） | 既存パネル（`#ref-panel` `#settings-panel` `#tl-panel` `#proj-panel`）を OBAN 骨格へ | 発注者判断。このSPECの必須ではない |

**P0 → P1 の間に1度見せる**（レーン付きストリップの見た目・塗レーンの帯の高さは実機で決める）。
P2 / P4 は互いに独立。P3 は P0 だけに依存。

---

## 4. 動作チェック表（完成報告に必ず付ける・⚠️未確認 のまま完了と言わない）

| パラメータ / 操作 | 期待される変化 | 有効になる条件 | 結果 |
|---|---|---|---|
| `線/塗` トグル・レーンのタップ | HUD が LINE/FILL に変わり、描いた線がそのレーンの canvas に乗る | 常時 | ⚠️ |
| 線レーンで FILL を持つ | 塗レーンへ自動で移りトースト | 常時 | ⚠️ |
| 塗レーンで PEN | `fillColor` で描ける | 塗レーン | ⚠️ |
| 塗レーンで FILL | 線 α≥128 を壁にして広がり、1px 膨らむ | 塗レーン・`FILL_UNDER_PX` | ⚠️ |
| `FILL_UNDER_PX` 0〜3（設定） | 潜る幅が変わる（0 で従来どおり隙間が出る） | 塗レーン | ⚠️ |
| レーン ● | その canvas が消える／戻る | 常時 | ⚠️ |
| レーン 🔒 | 描けずトースト。選択・表示・濃度は触れる | 常時 | ⚠️ |
| レーン不透明度（左右ドラッグ） | canvas の opacity。書き出しには乗らない | 常時 | ⚠️ |
| Ctrl+Z / Y | 触ったレーンだけ戻る | 常時 | ⚠️ |
| オニオン | 線だけ（設定 ON で塗も） | ONION ON | ⚠️ |
| REF 帯の横ドラッグ | `offset` が変わり canvas の参照がずれる | 参照 ANIMATOR・🔒 OFF | ⚠️ |
| REF 帯の `×N` | 1枚の表示が N ティックに伸びる | 参照 ANIMATOR | ⚠️ |
| REF 帯タップ ⇄ パネル行タップ | 双方ハイライト・中央ボタンの対象が変わる | 常時 | ⚠️ |
| `▸REF` | 折り畳み。0件で自動的に畳む | 常時 | ⚠️ |
| SEQ PNG 4択 | ZIP のフォルダ構成が変わる。線+塗を AE で重ねて合体と一致 | 常時 | ⚠️ |
| EXPORT JSON → IMPORT JSON | 線と塗が分離したまま戻る | `layers` あり | ⚠️ |
| → COMPOSER / LIVE | 合体 1枚・JSON サイズが今と同じ | 常時 | ⚠️ |
| 旧プロジェクトの読込 | 線レーンに入り 1px も変わらない（VRT） | `drawData` のみ | ⚠️ |
| SEL ドラッグ / Shift+ドラッグ | 投げ縄 / 矩形で持ち上がる | SEL | ⚠️ |
| SEL Wクリック | WARP 格子 on/off・形は残る | 持ち上げ中 | ⚠️ |
| HUD `AA` | off でギザギザのまま、on で滑らか | 持ち上げ中 | ⚠️ |
| HUD `線+塗` | 両レーンが同じ変形で動く | 持ち上げ中 | ⚠️ |
| COPY → 別コマで PASTE | 同じ座標に浮いて置ける | SEL | ⚠️ |
| Esc | 変形取消 ＞ 投げ縄取消 ＞ TL 停止 ＞ 選択解除 | 常時 | ⚠️ |
| テーマ 3種 | `--acc` 系が変わり既存 UI も追従。既定 ROUGE | ⚙ | ⚠️ |
| iPad（`pointer:coarse`） | 見出し列の的 34px・帯のドラッグがペン/指で効く | iPad | ⚠️ |
| `tools/check.js` / `npm run verify:animator` | 構文・配線・VRT 0.000% | 常時 | ⚠️ |

---

## 5. 仮置きを確定として記録（2026-09-18・発注者「その方向でOK」）

1. **旧プロジェクトは丸ごと線レーン。**分離しない。「色で分ける」移行ツールは作らない（要るなら別SPEC）。
2. **塗レーンの PEN は `fillColor`。**塗り残しの補修用。線レーンの PEN は `inkColor` のまま。
3. **オニオンは線レーンだけ。**設定で塗を含められる（既定 OFF）。
4. **REF の表示間隔は `×N`（step）と `offset` の2つ。**それ以上のリタイム（伸縮カーブ）は持たない。
5. **UI は新 OBAN の規約**（§1-9）。既定テーマ ROUGE で現行の見え方を保つ。

---

## 6. 関連

- `ANIMATOR_HANDOVER.md` — レイヤー構成／主要 state／autosave 容量実測／「線のコピペ＆選択移動/回転/スケール（見送り中）」→ **本SPECの P4 で引き取る**
- `ECONTE_HANDOVER.md` — 変形表 #1〜#8（`箱+rot+warp` の根拠と実測）
- `SPEC_15_ECONTE_V3.md` §P2-7 — 変形の元仕様
- `SPEC_16_ECONTE_V4.md` §5-B3 — SEL Wクリックの手つき
- `OBAN_BUILDER_UI_HANDOVER.md` — UI 規約（§1 配色 / §2 パネル骨格 / §4 ドラッグ中の約束 / §7-1 CVC 橋）
- `SPEC_07_ANIMATOR_OBAN_BRIDGE.md` — 下流は改修ゼロの大原則（§1-8 で守る）
- `PIPELINE.md` — P3 で更新
- スキル `animator-ref-overlay` / `animator-brush-ops` / `floating-panel-kit` — 実装を変えたら references も同じコミットで直す
