# CLAUDE.md — verify（VERIFY HARNESS / ANIMATOR）

Animation Paint の単一HTMLツールを**決定論的に**検証するハーネス。
「動くか」ではなく「**毎回まったく同じ絵になるか**」「**重くなっていないか**」を数値で判定する。

源泉仕様は [SPEC_08_VERIFY_HARNESS.md](../SPEC_08_VERIFY_HARNESS.md)。
`harness/` と `schema/` は正準実装 `LP_motion-graphics/VERIFY_HARNESS/` からの**コピー**
（スキル `single-html-verify` の配布物と同一）。**ここでは改造しない。**
挙動を変えたくなったら、まず正準側を直して SPEC_08 の version を上げ、その後コピーし直す。

現在の対象は **ANIMATOR / COMPOSER / OBAN BUILDER / ECONTE**（manga-plate は未。SPEC_09 v2 が
まだ出力そのものを変えている最中なので、承認しなおしが常態化する＝いま張っても得にならない）。

| ツール | config | 起動URL（鍵） | 撮るもの |
|---|---|---|---|
| ANIMATOR | `verify.animator.config.json` | `animator.html?ro=1` | 作画レイヤー合成（1024×576） |
| COMPOSER | `verify.composer.config.json` | `composer.html?harness=1` | コンポ合成（960×540） |
| OBAN BUILDER | `verify.oban.config.json` | `oban-builder.html?harness=1` | TAKE走行中のステージ（960×540） |
| ECONTE | `verify.econte.config.json` | `econte.html?harness=1` | TIMELINE出力 と GRIDセル（**1280×720**） |

> ⚠ **撮影キャンバスは 1280×720 を超えないこと。** runner はビューポート既定（1280×720）のまま
> `locator.screenshot()` する。`position:fixed` の要素はスクロールできないので、**大きくすると下が切れる**。
> econte で「出力の下にGRIDセル帯」を付けようとして踏んだ。**2つ撮りたいなら seek の t で撮り分ける**。

**animator だけ鍵が違うのは歴史的理由**。animator には元から別窓用の `?ro=1`（＝autosaveしない窓）が
あったのでそれを流用した。3つとも意味は同じ「**その窓は保存しない**」で、フィクスチャが現在の作業を
捨てても壊れないための安全装置。

## 走らせる

```bash
cd verify
npm install
npm run verify:animator
npm run verify:composer
npm run verify:oban
npm run verify:econte
```

- 初回は `baselines/` に正解画像を作るだけで必ず通る。**2回目以降が本番**（比較してPASS/FAIL）。
- 結果は `artifacts/summary.json`（数KB）。**Claudeにはこれだけ渡す**。画像を読ませない。
- 失敗コマは `artifacts/<label>_diff.png` と、summary.json の `unstableRegions`（崩れた矩形＋深刻度）を見る。

意図して見た目を変えたとき（＝baselineの承認・更新）:

```bash
UPDATE_BASELINE=1 node harness/runner.mjs verify.animator.config.json
```

PowerShell から実行する場合は `$env:UPDATE_BASELINE="1"; node harness/runner.mjs verify.animator.config.json`。
`npm run approve:animator` は Git Bash 用（PowerShell では環境変数の書式が違い動かない）。

### ⚠️ Chromium の実体について

`playwright` は **1.61.1 に固定**してある（`^` を付けない）。ブラウザ本体は
`AppData\Local\ms-playwright\chromium_headless_shell-1228` を使う。バージョンを上げると
別リビジョンのブラウザを要求して落ちるうえ、**baseline を撮ったブラウザと変わると差分が出る**。

未インストールで落ちる場合は `npx playwright install chromium` が要るが、
**これは Claude に実行させても反映されない**（AppDataリダイレクト。ルート CLAUDE.md 参照）。
**ユーザー自身のターミナルで実行すること。**

## 2パス構成（v2）

| | 何をするか | 何を見るか |
|---|---|---|
| **Pass1** 決定論VRT | `harness/inject.js` を本体より先に注入（乱数シード固定・仮想クロック・rAF手動ステップ・DPR=1）。`seek(t)→render()` を手動ステップしてスクショ→pixelmatch | 見た目の回帰。実測は取らない（仮想時間なので無意味） |
| **Pass2** 実クロックperf | injectを入れず別ブラウザで**自走**させ、LoAF とメモリを実測 | TTFF / 最長フレーム / RAM推定 |

## ANIMATOR 側の契約（animator.html 末尾）

```js
window.__HARNESS__ = { version:1, kind:'canvas2d', canvas:'#harness-shot', ready, seek, render, info }
```

覚えておくべき設計判断は4つ。

1. **`?ro=1` の窓でしか動かない。**
   `ready()` は現在のコマを全部捨てて決定論フィクスチャを組むため、本窓で誤って呼ばれると
   作業が消える。`AUTOSAVE_OFF`（＝`?ro=1`）でない窓では例外を投げて何もしない。
   config の `html` が `animator.html?ro=1` なのはこのため。**外さないこと。**

2. **撮るのは stage の見た目ではなく専用キャンバス `#harness-shot`。**
   bg → onion → draw → guide を**作業解像度そのまま(1:1)**で合成した1枚を撮る。
   ズーム・ウィンドウサイズ・UIの配置換えに左右されず、**線1本の差がそのまま差分**になる。
   （stageのCSS表示を撮ると縮小リサンプルで1px線の回帰が消える）

3. **フィクスチャは `H_FIX` で完全固定。**
   作業解像度 1024×576 / fps24 / コマ8枚（うち idx5 は空ブロック）/ duration `[2,2,3,2,4,2,2,3]`
   ＝全20ティック / ONION prev2・next1 / 解像度枠＋セーフフレームON / zoom 0.5固定。
   絵は `hDrawTestArt()` が決定論PRNGで描く。**animator の描画プリミティブをひと通り踏む**のが狙い:
   ブレゼンハム直線（`drawLine`）・可変ドット・筆圧の半径補間（`drawLineRadius`）・
   1px固定ドット（`drawDot`）・バケツ（`floodFill`）・オニオンのティント合成・ガイド描画。

4. **`seek(t)` は再生と同じ `frameAtTick()` を使う。**
   tick→表示コマの対応は再生ループと共有の1関数。**ここがズレると検証が嘘になる**ので、
   play() 側の実装を書き換えるときは harness も一緒に効くことを意識する。

`info()` は Canvas2D なので GPU VRAM ではなく **ImageData の実RAM量**を返す。
予算キー互換のため `vramBytesEstimate` という名前で返している（`budget.maxVramBytes` が効く）。
7コマ × 1024×576×4B ＝ 約16.5MB が現在の実測。

### 予算（ANIMATOR・2026-08-05 実測 → 約1.5〜2倍を上限に設定）

| 項目 | 実測 | 上限 | 何を捕まえるか |
|---|---|---|---|
| `maxTTFFms` | 266〜276ms | 800 | 起動〜初回描画。重い初期化の混入 |
| `maxLongestFrameMs` | 180〜185ms | 300 | 最長フレーム。**内訳は430KBのHTML/JS評価そのもの**（起動時1回） |
| `maxVramBytes` | 16.5MB | 24MB | コマのピクセルバッファ。バッファ二重持ちの検出 |
| `allowedPixelRatio` | 0.000% | 0.02% | 実測が完全にビット一致なので極小で締めている |

`allowedPixelRatio` を 0.02% まで下げてよい根拠 = 同一環境の連続実行で **6コマすべて 0.000%**。
負のコントロールも取ってある: `drawDot` の2px経路を `drawDotRadius` に差し替えると
6コマ中5コマが 0.14〜0.22% で FAIL する（＝ちゃんと歯が立っている）。

### 新しいコマ位置（seek）を足すとき（ANIMATOR）

`verify.animator.config.json` の `seeks[]` に `{label, timeMs}` を足す。
`timeMs → tick` は `floor(t / (1000/24))`。現在の duration 配列だとティック境界は
`0,2,4,7,9,13,15,17,20`（コマ 0〜7）。`a05_empty`(583ms→tick13) は**空ブロックが
直前の絵を出す**経路を踏むために置いてある。消さないこと。

## COMPOSER 側の契約（composer.html 末尾）

```js
window.__HARNESS__ = { version:1, kind:'canvas2d', canvas:'#harness-shot', ready, seek, render, info }
```

ANIMATOR と同じ形だが、フィクスチャの作り方が違う。

1. **`?harness=1` の窓でしか動かない。** `HARNESS_ON` が鍵で、同じ鍵で
   `scheduleAutosave()` / `saveAutosaveCells()` / `checkAutosaveRestore()` も止めている。
   **検証窓は `composer_autosave_v1` を一度も開かない**（実測確認済み）。

2. **素材はその場で生成して、実際の IMPORT 経路に流す。**
   `chMakeCell()` が決定論PRNGで PNG data URL を作り、`chBuildPayload()` が PROJECT_v2 を組んで
   `loadJSON()` に渡す。＝ `parseTrackFromJSON` の読み込み側も一緒に検証される。
   画像デコードの完了は `ready()` が `img.decode()` で待つ（待たないと空フレームが撮れてしまう）。

3. **トラック構成が検証範囲そのもの**（`CH_FIX`: 960×540 / 24fps / 48コマ）:

   | トラック | 型 | 何を踏むか |
   |---|---|---|
   | BG | image | Z=+240（奥）。カメラパンの視差が小さい側 |
   | CHAR | anim | **別解像度 480×270**（基点ずれ検出）・8セル×6コマ・**idx5 は空セル**・イーズ3種（`ez` / `ei`-`eo`ベジェ / `hold`） |
   | NULL | null | 親チェーン（FGの親） |
   | FG | image | Z=−150（手前）・**親あり**・アルファ合成 |
   | CAMERA | camera | パン/ドリー/回転/ズーム → 深度別パララックス＋Zソート |

4. **`render()` は `drawFrame()` を直接コンポ解像度1:1で叩く**（`drawCurrentFrame()` ではない）。
   FXチェーン（SATSUEI）・ドラフト再生・FINAL PREVIEW の分岐を通さない素の合成を撮るため。
   **＝現状 FX は検証対象外**。掛けたくなったら `?harness=1&fx=1` のような分岐で
   別ラベルの config を足すのが素直（WebGL経路なので baseline は環境依存が強くなる）。

### 予算（COMPOSER・2026-08-05 実測）

| 項目 | 実測 | 上限 | 何を捕まえるか |
|---|---|---|---|
| `maxTTFFms` | 384〜391ms | 800 | 起動＋素材生成＋IMPORT＋デコード |
| `maxLongestFrameMs` | 145〜152ms | 300 | 最長フレーム（起動時のスクリプト評価が主） |
| `maxVramBytes` | 7.78MB | 12MB | 素材画像のRAM。BG/FG各2.07MB＋CHAR7枚×0.52MB |
| `allowedPixelRatio` | 0.000% | 0.02% | ANIMATOR と同じ理由で極小 |

負のコントロール: `getKfValue` のイーズ量を 5% 変える（`*ez` → `*ez*0.95`）と
6コマ中4コマが 0.035〜0.227% で FAIL する。**キーフレーム上のコマ（f0 / f24）は
イーズの影響を受けないので 0% のままなのが正常** — 全コマが落ちる想定をしないこと。

### 新しいコマ位置（seek）を足すとき（COMPOSER）

`timeMs → frame` は `floor(t*24/1000)`。誤差を避けるため `frame*1000/24` がちょうど整数になる
値を選ぶ（0 / 375 / 750 / 1000 / 1250 …）。`c05_f30_empty` は CHAR の空セル区間（frames 30〜35）、
`c04_f24_hold` は `hold` キーの区間、`c06_f44_fade` は `op` フェード区間を踏むために置いてある。

## OBAN BUILDER 側の契約（oban-builder.html 末尾）

```js
window.__HARNESS__ = { version:1, kind:'canvas2d', canvas:'#harness-shot', ready, seek, render, info }
```

OBAN固有の事情が3つある。

1. **canvas がウィンドウそのもの。**
   OBANは `VW/VH/DPR`＝`innerWidth/innerHeight/devicePixelRatio` でステージを作るので、
   **ウィンドウ幅が変わると絵が変わる**。フィクスチャで `VW=960 / VH=540 / DPR=1` と
   `cv.width/height` を直接固定してから撮る。ここを固定しないとVRTが成立しない。

2. **PREVIEW相当の状態で撮る（`mode='take'` ＋ `PV.on=true`）。**
   IN演出・ドリフト・ワイプ・字幕は **P が非null のときだけ**動くので、出力と同じ経路を通すために
   この2つを立てる。あわせて `cleanView=true` でグリッド／ガイド／TAKE軌道を消す。

   > **2026-08-14 変更**: `prect()` の PLACE/TAKE 分岐は廃止。両モードとも
   > `planeZoom(z,eff) = z * (1+max(0,z-1)*0.22)^(2*eff-1)` を使う（引き z≤1 は全プレーン同倍率 ／
   > 寄り z>1 で手前ほど大きい）。旧式 `1+(z-1)*lerp(0.55,1.25,depth)` は **z<1 で手前が奥より小さくなり
   > 前後が逆に見えた**ため差し替えた。この変更で **baseline を全6コマ更新済み**
   > （更新後の再実行で 6/6 = 0.000%）。負のコントロールの記述（下）はパララックス係数 `pf` 側の話なので有効。

3. **`?harness=1`（`HARNESS_ON`）の窓でしか動かない。** 同じ鍵で `save()` と `load()` を
   封鎖しているので、検証窓は localStorage の `oban-project` を**読みも書きもしない**。
   （実データを入れた窓で確認済み: harness窓で fixture を組んでも保存値は `USER_WORK` のまま）

### フィクスチャの構成（`OB_FIX` / `obBuildProject`）

| 要素 | 何を踏むか |
|---|---|
| BG (depth 0.12) | パンのパララックス係数 `pf=lerp(0.7,1.2,depth)` の浅い側 |
| MID / MID2 | 通常パネル。MID2 は **KF3→KF4 の長いトラベルの経路上**に置いてある |
| SEQ (連番) | `seqIdx`/`panelImg` の連番送り（`mode:'loop'`・`trigger:'always'`＝**tSの純関数**） |
| FRAME | **台形quadマスク**・内部パララックス(`par`)・IN演出 `slide-l`・drift `push-in`・枠線・**whiteoutワイプ** |
| FRAME の子 ×2 | `childRect()` の深度差（フレーム内パララックス） |
| テキスト ×2 | ルート縦書き＋**KF窓つき**フレーム内テキスト（`kfWinAlpha`） |
| TAKE KF ×4 | dwell/travel の区間割り・ease 3種（smooth/inout/outCubic） |

`trigger:'enter'` の連番は使わないこと。`p._t0` に**初回可視時刻を焼き込む**＝tの純関数でなくなり、
seek の順番で結果が変わる（契約違反）。

### 区間の地図（この構成での実測値）

```
dwell0 0〜0.1199 / travel 〜0.2612 / dwell1 〜0.3570 / travel 〜0.5083
dwell2 〜0.6522 / travel 〜0.8921 / dwell3 〜1.0        wipeP = 0.4425
```

`seek(t)` は **1周＝`OB_FIX.cycleMs`(4000ms) 固定**で P に写す（アプリのPREVIEW速度は `TT.total`
依存だが、VRTに要るのは「同じtなら同じP」だけ）。so `timeMs/4000` がそのまま P。

### 予算（OBAN・2026-08-05 実測）

| 項目 | 実測 | 上限 | 何を捕まえるか |
|---|---|---|---|
| `maxTTFFms` | 226〜232ms | 600 | 起動＋素材生成＋TAKE構築＋`computeWipeP`(400サンプル) |
| `maxLongestFrameMs` | 158〜163ms | 300 | 最長フレーム（起動時のスクリプト評価が主） |
| `maxVramBytes` | 4.23MB | 6MB | 素材画像のRAM（9枚） |
| `allowedPixelRatio` | 0.000% | 0.02% | 他2ツールと同じ |

負のコントロール: パララックス係数を `lerp(0.7,1.2,...)` → `lerp(0.7,1.18,...)` に変えると
6コマ中4コマが 0.875〜7.4% で FAIL する。**残り2コマが0%なのは正常**:
`o01_p000` はカメラが原点（`cam.x*pf=0` で係数が効かない）、`o03_p045_wipe` は画面の約87%が
白に飛んでいて幾何の差が出ない。**この2枚はワイプと初期状態の番人**であって、レイアウトの番人ではない。

## ECONTE 側の契約（econte.html 末尾）

```js
window.__HARNESS__ = { version:1, kind:'canvas2d', canvas:'#harness-shot', ready, seek, render, info }
```

econte 固有の事情が4つある。

1. **`?harness=1`（`HARNESS_ON`）の窓でしか動かない。** 同じ鍵で `scheduleSave()` と `saveAll()` を
   封鎖しているので、検証窓は `econte_db_v1` を**読みはしても一切書かない**。
   （実測確認済み: 本物のDBに目印を置いてから harness窓でフィクスチャを組み `saveAll()` を直接叩いても、
   `cuts` は空のまま・目印も無傷・`eh*` の id は1つも入らない）

2. **素材に写真を使わない。** 紙（ベイク空間 1280×720）に決定論の絵を `ehMakePaper()` で描いて
   `baseC` に直接持たせ、`res:true` で常駐扱いにする（`getBase`/`needLine` が
   `requestResident` の非同期へ落ちない）。＝ここで見るのは**枠・パッチ・合成**の回帰だけ。
   写真の読み込み経路は対象外。

3. **撮る面が2つある。`seek(t)` の t で撮り分ける**（契約は「t→状態」なので合法）。

   | t | ehMode | 何を撮るか |
   |---|---|---|
   | `< 10000` | `out` | `renderOutputFrame` → `drawCamFrame`。**プレビュー・録画・書き出しと同じ関数** |
   | `>= 10000` | `cells` | `drawCellFrame` を 640×360 で 2×2。**GRID セル＝自分の枠のパッチだけ** |

   ★ **この2つを両方撮るのが econte 版の肝。** SPEC_16 §3-3 で
   「GRIDセルは自分の枠しか描かない／合成した本当の画は TIMELINE に出る」と**意図的に分けてある**ので、
   片方だけ見ていても T.U./PAN の食い違いに気づけない。

4. **フィクスチャ（`ehBuildFixture`）はカット5本 / 全56コマ / 24fps。**

   | | 構成 | 何を踏むか |
   |---|---|---|
   | C1 | FIX（枠1つ・12コマ） | いちばん素直な経路。line と plate（0.4倍解像度）の両方 |
   | C2 | **T.U**（A=全景 → B=寄り・lead4/move12/tail4） | **入れ子＝`patchHides` が効く。A にも B にも塗ってある**（発注者報告の本体） |
   | C3 | **PAN**（A→B が並ぶ・10コマ） | 入れ子でない＝隠さず重なる。枠の境目で線が切れないこと |
   | C4 | 投げ縄（8コマ） | `lassoFillPolygon`＝`strokeSeg` とは別経路（スキャンライン）＋消し（`destination-out`） |
   | C5 | 空カット（6コマ） | 紙も加筆も無い＝bg だけ出る経路 |

   絵は **`ehStroke()` が econte 自身の `strokeSeg()` を呼んで**引く（ブラシ幅・色・ツール・
   塗り先・**枠をまたぐ区間の二重描画**がそのまま回帰対象になる）。

### ★ `ehPatchMarks()` が要る理由 —— 負のコントロールが自己相殺した話（2026-09-03）

最初、パッチの中身を `ehStroke()` だけで作っていた。この状態で
**`camBakeRect` の x を +2px ずらす負のコントロールを当てても、9コマ中8コマが 0.000% のまま通ってしまった。**

原因は対称性だった。`strokeSeg` → `strokePatchSegBake` → **`bakeToPatch()` も `camBakeRect` を使う**。
フィクスチャは毎回その場で塗り直すので、

> 2px ずれた所に塗って、2px ずれた所に出す ＝ **打ち消し合って差分が出ない**

実運用では絵は先にパッチへ焼けていて**出す側だけ**が変わるので、これは
**ハーネスだけが嘘をつく**状態（＝置き場所の回帰を丸ごと見逃す）。

そこで `ehPatchMarks()` で、**座標マッピングを一切通さない絵**（枠の縁・四隅の目印・逆対角線を
パッチのピクセル空間へ直接）を全カットの全枠に入れてある。**この関数を消すと検証の芯が抜ける。**

> 一般化: **フィクスチャを「アプリの関数で組み立てて、同じ関数で描く」と対称性で穴が空く。**
> 他ツールへ広げるときも、必ず片側だけを通る素材を混ぜること。

### 予算（ECONTE・2026-09-03 実測）

| 項目 | 実測 | 上限 | 何を捕まえるか |
|---|---|---|---|
| `maxTTFFms` | 199〜207ms | 800 | 起動＋紙4枚の生成＋フィクスチャのペイント |
| `maxLongestFrameMs` | 177〜184ms | 300 | 最長フレーム（起動時のスクリプト評価が主） |
| `maxVramBytes` | 39.2MB | 64MB | 紙4枚（各3.7MB）＋パッチ10枚（line 3.7MB / plate 0.59MB） |
| `allowedPixelRatio` | 0.000% | 0.02% | 他3ツールと同じ |

### 負のコントロール（2種・実測）

| 壊し方 | 結果 | 通ったコマの説明 |
|---|---|---|
| `camBakeRect` の x を **+2px** | **8/9 FAIL**（0.549〜1.518%） | `e07_c5_empty` だけ 0%。**パッチが1枚も無いカット**なので正しい |
| ブラシ幅を **5% 細く** | **7/9 FAIL**（0.139〜1.330%） | `e06_c4_lasso` 0.006%（中身は投げ縄＝筆を通らない）／`e07` 0%。**どちらも正しい** |

＝ 置き場所（合成側）と 筆（ペイント側）が**別々に**見張られていることの確認。

### 新しいコマ位置（seek）を足すとき（ECONTE）

`timeMs → frame` は `floor(t/(1000/24))`。**ちょうど境界に乗せない**（`frame*41.667` より
2〜4ms 大きい値を選ぶ）。カットの割り当ては通しフレームで
`C1=0〜11 / C2=12〜31 / C3=32〜41 / C4=42〜49 / C5=50〜55`。
GRIDセルを撮りたいときは **その値に 10000 を足す**。

## 他のツールへ広げるとき

1. 対象HTMLの末尾に `window.__HARNESS__` を実装
   （**素材を自前で描くなら animator.html、素材を読み込ませるなら composer.html** が手本）。
2. **保存しない鍵**を用意して `ready()` の入口で弾く。既存の別窓フラグがあれば流用、無ければ新設。
3. 自走ループは `if(!window.__TEST_MODE__){…}` の側でだけ回す（Pass2用）。
4. `verify.<tool>.config.json` を足して `package.json` に script を1行。
5. 初回実行で baseline を作り、**2回目が0%で通ることまで確認**してからコミットする。
6. できれば**負のコントロール**（わざと1箇所壊して FAIL するか）まで見てからコミットする。
   通ることの確認だけでは「何も検証していないハーネス」でも緑になる。
