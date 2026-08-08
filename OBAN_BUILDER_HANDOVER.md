# CLAUDE.md — OBAN_BUILDER

**OBAN BUILDER**（SPEC_01 P2、2026-07実装）。モーションコミック製造機。画像を置く（PLACE）→カメラを打つ（TAKE）→単一HTMLビューアを書き出す（EXPORT）の3ステップだけの単体アプリ。単一HTML・依存ゼロ・`file://` 直開きOK。

## ファイル

- `oban-builder.html` — 本体（エディタ）
- 書き出される `oban-viewer.html` — 自己完結ビューア（画像は同梱せず**同フォルダのファイル名参照**。画像フォルダに置いて配布する運用）

## 操作（触ってすぐわかる、が最優先）

| 操作 | 内容 |
|---|---|
| 画像をD&D | パネル追加（縦積みで初期配置）。複数OK |
| **1. PLACE**（--rouge） | パネルドラッグ=移動 / 空白ドラッグ=視点パン / ホイール=視点ズーム / 選択チップで SIZE±・DEPTHスライダー・DELETE |
| **2. TAKE**（--ice） | 構図を作って `C`=CAPTURE。KFカードで ▸GO / ↻UPD / ✕ / EASE / DWELL。`Space`=ループPREVIEW（触ると停止） |
| **3. EXPORT** | `oban-viewer.html` をダウンロード。ATTRACT MODE標準搭載（`?attract=1&hud=0`） |
| COPY/PASTE PROJ | プロジェクトJSONのクリップボード入出力（file://で拒否されたらprompt窓にフォールバック） |
| `Ctrl+Z` | 1段undo / `Esc` プレビュー停止・選択解除 / `1`/`2` モード切替 |

## V2-A 品質の土台（2026-07 実装済み / SPEC_05）

- **z-order分離**: `ord`（重なり）とdepth（視差）を独立管理。`[`/`]`キーとチップの◀BACK/FRONT▶で前後移動（ord正規化つき）。新規投入は常に最前
- **undo/redoスタック**: `commit()`=保存+履歴push（上限60）。スライダー系は`commitD()`で300ms合体。`Ctrl+Z`/`Ctrl+Shift+Z`/`Ctrl+Y`。CLEARもundo可能
- **UIホバー時ホイール**: `#bar/#cards/#chip`上ではビューをズームせずUIスクロールに委譲
- **ガイド（G / GUIDEボタン）**: 16:9枠+ACTION93%+TITLE90%+中央十字+三分割。状態はlocalStorage記憶。**書き出しには含まれない**
- **KFフォーカス**: カードクリック=選択（--iceハイライト、カメラは動かない）、`▸GO`or`↑↓`=選択+ジャンプ。キャンバス上は二重リング+dwell帯で「いま触っているKF」を常時表示
- プロジェクトは `version:2`（`migrate()`がV1を自動補完）。ビューアもordソート対応

## V2-B シーケンスとコマ（2026-07 実装済み / SPEC_05）

- **連番シーケンス**: ドロップ時に `prefix+数字3〜5桁+拡張子` でグループ化、**同prefix4枚以上→自動で1つのseqパネル**（3枚以下はバラ）。チップで MODE（loop=目パチ・なびき・粉塵 / once=ワンアクション / pingpong）・FPS 4-30・TRIGGER（always / **enter**=画面30%進入で再生開始、画面外でリセット→再入場で再演）
- **FRAME＝1段ネストコンポ**: `+FRAMEボタン` で追加。パネルを**フレームに重ねて離すと格納**（チップのEJECTで復帰）。**ダブルクリックで中に入って編集**（パンくず `ROOT ▸ FRAME 01`、他要素は減光、Escで復帰）。ネストは1段のみ（フレームinフレーム禁止）
- **quadマスク**: フレーム選択→`M`（またはチップMASK）で4隅ハンドル編集（斜めOK、Shift=軸ロック、範囲-0.5〜1.5）。多角形・円は非対応（仕様どおり）
- **コマ枠線（SPEC_09 P4・2026-07実装）**: `frames[].line={on,w}`（`migrate()`補完）。チップの`LINE`トグル＋太さスライダー(2-40)。ONで**quadの4点をそのままstroke**（黒・コンテンツ扱い＝書き出し対象）。太さはフレーム高1000px基準でスケール。ビューアにも同式を複製済み。OFF時は従来と完全不変
- **内部パララックス**: `PAR` スライダー（0..1）。カメラ移動に対しコマの窓の中で子パネルが `k=lerp(0.15,0.85,depth)` でずれる＝手前ほど動く
- **DEPTH統一（depthV2・2026-07）**: 全パネル共通で**「大=手前=上に描画=先にヒット」**。旧プロジェクトの子パネルは `1-depth`（大=奥）解釈だったため、`migrate()` が一度だけ `depth=1-depth` に反転（フラグ`PROJECT.depthV2`）。視差の見た目は不変で重なりだけ正しくなる。rootパネル（パン`lerp(0.7,1.2,depth)`/ズーム`1+(z-1)*lerp(0.55,1.25,depth)`）は元から大=手前で変更なし。また **PLACEモードの編集ビューはズーム均一**（`prect`で `zi=cam.z` 固定）＝DEPTHを変えてもサイズが変わらず、重なりと視差だけが変わる（FRAME子と同じ操作感）。マルチプレーンzi（手前ほど強くズーム）は TAKE編集・PREVIEW・書き出しビューアでのみ掛かる
- ヒット判定/並べ替え/削除はコンテキスト対応（フレーム内では兄弟内でord正規化、フレーム削除時は子をルートへ放出）
- ビューア完全同期: seq全フレームロード・quadクリップ・内部パララックスを書き出しに含む

## V2-C 演出と撮影（2026-07 実装済み / SPEC_05 §4 + SPEC_06 P2先行）

### FRAMEのIN演出・ドリフト・カバーワイプ（チップ2行目）
- `IN`（slide-l/r/t/b）: 紐づくKFの**直前travel区間**でコマが枠ごとスライドイン。`DRIFT`（push-in/pull-out）: **dwell区間**でゆっくり寄る/引く（AMT 0〜0.4）。`KF`は自動（最寄り）or明示。すべてPの純関数＝逆走可逆
- `WIPE`（invert/whiteout）: コマが**画面を100%覆った最小P**を400サンプルで事前計算（`computeWipeP()`、リサイズ/テイク変更で再計算）。invert=ステージ全体が明暗反転（TENSION CH05→06の型）、whiteout=覆った瞬間白→次の絵。ガイドON時はKFパス上に琥珀◇で発火点表示
- ビルダーでは**PREVIEW（Space）中のみ**発動。編集中はバッジ表示のみ

### SATSUEI FX（撮影処理 — satsuei-fx-kit準拠・SPEC_06 P2をcomposer P0より先行実装）
- 正準コアを `<script id="satsuei-core">` にマーカー付きで複製（**現時点の生きた正準**。skillのreferencesと同一内容。更新はブロックごと差し替え）
- `PROJECT.take.fx`（fxスキーマv1・全アプリ共通・COPY/PASTE PROJに自然に乗る）。`migrate()`が欠損補完
- **FXボタン/[F]キー**→琥珀色モーダル。UIは `FX_DEFS` から自動生成（**エフェクト追加でUI改修ゼロ**）: diffusion/para/grade/vignette/grain/glitch/mb/dof。変更はcommitD（undo対象）
- 適用tier: ビルダーPREVIEW=**draft**（velなし=mb素通し）/ 書き出しビューア=**rt**（カメラ速度velで方向ブラーmb近似）。編集中はFXなし（軽量優先）
- **絶対条件の遵守**: `enabled:false`はapply未呼び出し経路・WebGL不可は素通し（`gfx.available`）・ビューア`?fx=0`で強制OFF・コアにバッククォート/`</script>`文字列なし（検証スクリプトがチェック）
- ビューアはシーンを常時オフスクリーン`sc`に描き→FX→可視`cv`へ（fx OFF時も同経路のblitのみ＝ピクセル一致）

### COPY FOR COMPOSER（SPEC_06 P3 — TAKE→composer CAMERAトラック変換・2026-07実装済み）
- バーの `COPY FOR COMPOSER` ボタン→ice配色モーダル（FPS/尺秒/COMP W/H）→ PROJECT_v2互換JSONをクリップボードへ → composerの IMPORT JSON に貼る。**MVP=カメラだけ変換**（絵はcomposer側で別途IMPORT。全自動化はP3b検討）
- 実装: `buildComposerJSON()` / `toggleCvtModal()` / `copyForComposer()`。尺の既定値=`TT.total`（dwell/travel重み合計≒秒）
- 写像（SPEC_06 §8）: dwell=同値キー2枚ホールド、travel=終端キーに `ez`（linear→0/smooth→0.5/inout→1/in・outCubic→0.5）。P∈[0,1]→f=round(P*(fps*秒-1))。同一フレーム衝突は先勝ち＝travel終端のezを保持
- ズーム変換は選択式（モーダル ZOOM変換 セレクタ・既定=案A）:
  - **案A SCL（光学・構図優先）**: `X=x*Wc / Y=y*Hc / SCL=z`。構図とタイミング完全一致・視差なし
  - **案B Zドリー（視差優先）**: `Z=1000·(1−1/z) / X=x*Wc/z / Y=y*Hc/z`（パン相殺→dwell時の狙い構図は案Aと一致。実機検証: ズレ0.05px）。パネル側トラックにZを振ると多層視差が出る。ただしcomposerはtr.xをperspで拡大しないのでパネル間隔はズームで開かない＝近似
- `take.fx` はトップレベル `fx:` にそのまま同梱（スキーマ共通・無変換）
- composer側の受け（P3対応で追加）: ①カメラだけのJSONでもKF範囲から `totalFrames` が立つ ②既存トラックへの追加IMPORTでも `fx:` があれば `normalizeFx` で引き継ぐ。**composerに既にCAMERAがあると貼ったカメラは捨てられる**（カメラは1つまで＝既存優先）ので、先にCAMERAを消してから貼る
- **P3b（配置の流し込み・2026-07実装済み）**: JSONに `obanPanels:[{name,x,y,h,depth,ord}]`（ルートパネルのみ）を同梱。composerの `applyObanPlacements()` が**ファイル名一致**（拡張子無視・大文字化）でIMPORT済み画像トラックに位置/サイズ/Z/重ね順を流し込む（既存KFは上書き）。手順=①絵をIMPORT ②OBANでCOPY ③PASTE JSON。Z=depth写像でパン視差係数がOBAN pfと厳密一致・SCLはpersp補償。FRAME・子パネル・quadマスクは対象外

## V2-D テキストと反応（2026-07 実装済み / SPEC_05 §5）

### 縦書きテキスト（読み文字）
- **`+ TEXT [T]`ボタン / `T`キー**→クリック位置に `#text-ed`（contenteditable・`writing-mode:vertical-rl`）でその場縦書き入力→確定（余白クリック/Ctrl+Enter）でcanvas描画データ化。Enter=次の列 / Esc=取消。DOM不可環境はprompt()フォールバック（改行は「/」）
- **描画**: `drawVText()` — 1文字ずつ縦積みfillText（bold・和文スタック）。長音「ー」等は `VT_ROT` 集合で90°回転。色は白/黒トグルのみ＋4方向シャドウのにじみ縁取り（size24でほぼ1px・比例拡大）。**ルートテキストは pf=1 / zi=cam.z の深度なしオーバーレイ扱い**（`textAnchor()`。アンカー=1列目の右上、列は右→左）
- **PLACE操作**: パネル同様に選択/ドラッグ/削除。**ヒット判定は常に最前**（`hitAt()`先頭）。`[`/`]`は対象外（常に最前グループ）。ダブルクリック or チップ`EDIT`で再編集。チップ= COL(白黒)/SIZE±/KF(常時 or #n)/EDIT/EJECT/DELETE
- **FRAME格納可**: パネル同様ドラッグ格納（`size=size/f.h` でローカル化・内部パララックスなし=フレーム固定）。EJECT/フレーム削除時の放出も対応。ctxFrame内で新規作成するとそのフレームに直接入る
- **KF紐づけ**: `kf:null`=常時表示 / KF指定=そのKFのdwell窓でフェードイン/アウト（`kfWinAlpha()`・最終KFは開いたら閉じない）。ビルダー編集中は常時表示、PREVIEW/ビューアで窓が効く

### EN字幕トラック
- TAKEカードに **SUB入力欄**（KFごとに1本・空で削除）→ `texts[]` に `{type:'sub',str,kf}`。KF削除時はsubも削除・後続kf参照は番号詰め（v-textは常時に戻す）
- 表示: 画面下部中央 mono 11px・dwell窓フェード（`drawSubs()`）。ビルダーPREVIEWとビューアで同表示。ビューアは **`?sub=0`** で非表示・右下 `SUB ON/OFF` 小ボタン（subがある時のみ表示・`hud=0`では非表示）。**字幕は撮影FXの外**（UIレイヤー・v-textはFXの内側=コンテンツ）

### ビューアのクリックFX
- `PROJECT.clickFx`: `'invert'`（既定・0.18秒 filter:invert フラッシュ）/`'white'`（ホワイトパルス）/`'none'`。**fxスキーマv1とは別のトップレベルフィールド**（COPY FOR COMPOSERには乗らない）
- ビューア: pointerdownで発火（SUBボタンは除外・ATTRACT解除と共存・連打はキュー1つ）。invertはワイプ反転と**XOR合成**（重なっても破綻しない）— 実装は `applyWipeVisual()` に統合
- ビルダー: FXモーダル末尾の **CLICK FX**（SATSUEIコア無しでも表示）で選択+TESTボタンでその場発火

### データモデル追加
```js
PROJECT.texts=[{id,type:'v'|'sub',str,x,y,size:24,col:'#fff'|'#000',parent:null|frameId,kf:null|kfIndex}]
PROJECT.clickFx='invert'|'white'|'none'
```
- `migrate()`が欠損補完（x/y/sizeは非数値・非有限も0/24に矯正）。ビューアへは texts+clickFx をPROJに同梱
- **注意（テンプレート内エスケープ）**: ビューアテンプレートはテンプレートリテラルなので、ビューア側コードの文字列 `'\n'` は **`'\\n'`** と書くこと（実改行に展開されて構文エラーになる）。バッククォート禁止は従来どおり
- **注意（エディタのフォーカス）**: `openTextEditor()` の blur確定リスナは **`setTimeout(...,0)` で1tick遅らせて張る**＋開くクリックで **`e.preventDefault()`**。これが無いと、クリックの既定フォーカス移動で開いた瞬間に blur→空確定で閉じ、**「Tを押しても何も起きない」ように見える**（2026-07に実機で発生・修正済み）。合成イベントのテストは既定動作が無いためこの不具合を素通しするので、**実クリックで検証すること**

## SPEC_07 ANIMATOR⇄OBANブリッジ（2026-07 実装済み / B0〜B3）

- **狙い**: animatorの連番をPNG書き出しなしでseqパネル化し、animator保存が自動反映される（composerと同格の連携）。OBANは既存プロトコルに「もう1つのcomposer」として参加＝**新メッセージ型なし・送信は `composer-hello`/`request-sync` のみ**
- **データモデル**: `PANEL.seq={src:'ap',apId,n,fps:24,mode,trigger,apName,apAt}`。従来のファイル連番は`src`なし（完全不変）。ピクセルは保存しない（絵は常にanimatorが正）
- **ランタイム**: `AP={apId:{frameRefs,w,h,name,at}}`（保存しない）＋`IMGCACHE['ap:'+apId+'#'+cellIdx]`。`apIngest(payload)` がタイムシート展開（duration展開、**empty/hidden=透明フレーム=-1**。composerの`parseTrackFromJSON`と同解釈）。再同期時はデコード完了まで旧絵を維持（チラつき防止）
- **B0 コールド**: バー`+ FROM ANIMATOR`（rougeモーダル）→ EX_DB(`tdr_exchange`) getAll＋live受信キャッシュ`gApSeen`をマージして一覧→選択で`pushPanel`。起動時`apRestore()`がEX_DBから自動復元、無ければ点線プレースホルダ＋トースト
- **B1 ホット**: `setupApLive()`。`project-update`受信でapId一致パネルに`apIngest`→絵だけ差し替え（x/y/h/depth/ord/mode/trigger/fpsは保持）→`● SYNCED`トースト。同期はundo履歴に積まない（save()のみ）
- **B2 ベイク**: EXPORT時に`apBakeData()`がap-seqをdataURL同梱（`APB={apId:{cells:[webp0.85],refs:[]}}`、重複セルは1回だけ・webp不可はPNG）。>50MBで確認ダイアログ。ビューアはAPBから`Image`生成（フォルダ参照しない）＝別PC/別ブラウザで再生可
- **B3 逆方向**: チップの`EDIT IN ANIMATOR`→`animator.html?open=<apId>`。animator側（唯一の改修・init末尾）: autosaveが同一PJならLIVE自動ON＋即ブロードキャスト、違えばEX_DBから**確認モーダルつき**で読込（無断上書きしない）。`RELOAD`ボタン=EX_DB再取得＋request-sync
- チップ表示: `AP:<name> ●SYNC <時刻>`（未同期は`○未同期`）。ESCカスケードは APモーダル→コンバータ→FX→… の順
- 制限: EX_DBはanimatorの`→ COMPOSER`押下時のみ書かれ、24hで自動掃除される。コールド復元に無くてもANIMATORを開いてLIVEを押せば`request-sync`で埋まる。同一ブラウザ限定（既知の制限どおり）

## データモデル

```js
PROJECT={version:2,name,
  panels:[{id,name,x,y,h,depth,ord,ar,parent:null|frameId,
    seq:null|{pre,pad,start,n,ext,fps,mode,trigger}         // ファイル連番
       |{src:'ap',apId,n,fps,mode,trigger,apName,apAt}}],   // SPEC_07: ANIMATOR連番（参照のみ）
  frames:[{id,name,x,y,h,depth,ord,ar,quad:[4×{x,y}],par}],  // 子はフレームローカル座標(中心原点・フレーム高=1)
  texts:[{id,type:'v'|'sub',str,x,y,size,col,parent,kf}],    // V2-D: 縦書き/EN字幕
  clickFx:'invert',                                          // V2-D: ビューアのクリック反応
  dof:{on,a,b,kf,range,maxBlur,bounce},                      // DOF/ピン送り（ピント位置=コマのDEPTH）
  take:{version:1,name,kf:[{x,y,z,dwell,ease}]}}       // SPEC_01のTAKE(単一シーン版)
```

- タイムテーブルは `buildTake()`（dwell/travel重み自動配分、travel下限0.25）— `LP_Model_CR` のP0実装と同型（ワイプ無し版）
- **マルチプレーン**: パン係数 `lerp(0.7,1.2,depth)`、ズーム係数 `1+(z-1)*lerp(0.55,1.25,depth)`。ビューアも同式
- `localStorage('oban-project')` に自動保存。**画像はファイル名だけ**保存されるので、再起動後は同じ画像を再ドロップすると復元（名前一致で紐づけ）

## 検証

Node構文チェック＋DOMスタブスモーク済み。ビューアはテンプレートから実生成→構文チェック→スクロール往復＋ATTRACT自動走行スモーク済み。**ビューアテンプレート内に生バッククォートを置かない**（検証スクリプトがチェックしている。`</script>` は `S` 変数経由）。

### VERIFY HARNESS（決定論VRT・2026-08-05 実装）

`oban-builder.html` 末尾に `window.__HARNESS__` 契約を実装済み。TAKE走行の6点を撮って
前回の承認済み画像と比較する（SPEC_08 / `verify/CLAUDE.md`）。

配置・カメラ・パララックス・ワイプまわり（`prect` / `childRect` / `camAt` / `buildTake` /
`applyFxRect` / `frameFxAt` / `computeWipeP` / `applyWipeVisual` / `renderWorld` / `seqIdx`）を
触ったら実行すること:

```
cd verify && npm run verify:oban
```

覚えておくこと4点:

- **`?harness=1`（`HARNESS_ON`）の窓でしか動かない。** 同じ鍵で `save()`/`load()` を封鎖してあり、
  検証窓は localStorage の `oban-project` を**読みも書きもしない**（実データ入りの窓で確認済み）。
- **ステージ＝ウィンドウなので、フィクスチャで `VW=960 / VH=540 / DPR=1` と `cv.width/height` を固定**
  してから撮る。OBANはウィンドウ幅で絵が変わる唯一のツールなので、ここが他の2つと違う。
- **`mode='take'` ＋ `PV.on=true` で撮る。** PLACE編集ビューは `prect()` が `zi=cam.z` の均一ズームに
  分岐して**出力と別物**になるため。`cleanView=true` でグリッド／ガイド／TAKE軌道は消す。
- **連番パネルは `trigger:'always'` を使う。** `'enter'` は `p._t0` に初回可視時刻を焼き込むので
  「同じ t なら同じ絵」でなくなり、seek の順番で結果が変わる。

## 制限（v1スコープ / SPEC_01 §5どおり）

- 音・テキスト組版・モバイルなし（連番はV2-Bのファイルseq＋SPEC_07のANIMATOR直結で対応済み）
- ~~CLEARはnative confirm~~ → **2026-07-27 modalConfirm化済み**。`modalConfirm(msg)`（`#cf-modal`）を追加し、
  CLEAR とEXPORTの「ベイク50MB超」確認の2箇所を置き換え。Enter=OK / Esc=CANCEL、開いている間は
  keydown を capture で飲んで背後のショートカット（`1`/`2`/`C` 等）を発火させない
- ビューアはビルダーのコード複製（共有ライブラリ化しない方針どおり）。テンプレートを変えたら両方のスモークを回すこと

## UI刷新とDOFピン送り（2026-08-06 実装済み）

### TAKE：KFの並べ替えと挿入CAPTURE
- KFカード左の **`⠿` グリップを上下ドラッグ**で並べ替え。ドロップ位置は青線（`kfdrop-before/after`）で表示。**`Ctrl+↑↓`** でも入れ替え
- **`C`（CAPTURE）は選択KFの「次」に挿入**（未選択・末尾選択なら従来どおり末尾に追加）
- **KF番号への参照は全部追従する**（`remapKfRefs(fn)` に一本化）。参照元は `texts[].kf`（縦書きの表示窓／EN字幕）・`frames[].fx.kf`（IN演出/ドリフト）・`dof.kf`（ピン送り）。
  削除時は該当参照を解除し、**字幕はKFと運命共同体なので一緒に消す**。並べ替え/挿入/削除の3経路すべてがこの関数を通る
- ドラッグは `setPointerCapture` に加えて **window にも pointermove/pointerup を張る**（捕捉が効かない環境で掴んだままにならないように）

### QUICK EDIT（旧・画面下チップの置き換え）
- COMPOSERの QUICK TRANSFORM と同じ作法の**左下フローティング**（`#qe`）。ヘッダで移動・下端で高さ調整・**`U` で開閉**・✕で閉じる
- **縦1行1項目**（`.qe-row` = ラベル / コントロール / 数値）。**全行に `title=` でホバー解説**を付けてある＝「何が変わるのか」をユーザーに推測させない
- セクション見出しで意味ごとに分割。FRAMEは **配置 / コマの窓 / 登場の演出** の3つに整理（旧チップは横1列に10項目以上が並んで伸び切っていた）
- 選択し直すと開き直す（`qeOpen=true`）＝旧チップの手触りを保つ。閉じたままにしたい時は選択後に `U`
- 実装メモ: `const chip=$('#qe-body')` として**旧チップのイベント委譲・`#chip-*` idをそのまま流用**している。`data-act` の語彙は不変なので、追加項目は `renderChip()` に `qeRow()` を足すだけ

### DOF（被写界深度）とピン送り
- **OBANのDOFは元々“未配線”だった**（`FX_DEFS.dof` は `tier:'layer'` で、OBANの `apply` に `case 'dof'` が無い＝スライダーが出るのに効かない）。
  → **レイヤー型はFXモーダルの自動生成リストから除外**し、OBAN専用のDOFを別建てで実装
- `PROJECT.dof={on,a,b,kf,range,maxBlur,bounce}`。**ピント位置＝コマのDEPTH**（0=奥 / 1=手前）。`migrate()` が補完（非数値・非有限も矯正）
- **ピン送り**: `focusAt(P)` — 紐づけKFへ向かう**travel区間でA→B**、着地後の**dwell頭35%でBOUNCE**（`sin(2πu)·(1-u)` の減衰振動＝行き過ぎて戻る一往復）。**Pの純関数＝逆スクロールでも可逆**
- **ボケの実体**は Canvas2D の `ctx.filter='blur(Npx)'`（`CAN_FILTER` で機能検出。非対応ブラウザは素通し＝ボケないだけ）。太さは**画面高1000px基準**（枠線と同じ作法）
- 適用単位: ルートパネルは自分の `depth` / **FRAMEは窓ごと**（子は frame の depth・枠線も同じボケ量）。**読み文字はボケに巻き込まない**（`cx.filter='none'` を挟む＝セリフは常に読める）
- FXモーダルの **DOFセクション**: ON / FOCUS A・B（**コマを選んで SET でそのDEPTHを取り込む**）/ **A⇔B確認スライダー**（編集ビュー用・`dofPrev`・保存しない）/ 送るKF / ピントの幅 / ボケの強さ / BOUNCE
- ビューアにも同式を複製（`PROJ.dof`）。**AEのようなキー打ちはしない**割り切り（発注者の要望どおり）

### animator/composerとのUI統一・バー整理
- フローティングの閉じるを**`✕`（title="閉じる (Esc)"）に統一**（旧 `✕ [Esc]` 表記をやめた）
- **FXボタンは撮影FXかDOFがONの間は点灯**（`.btn.fx.on`）。`syncFxBtn()` を起動時・FX有効切替・DOF切替・undo後に呼ぶ
- **GUIDEボタンは廃止**（`G` キーとSETTINGSの一覧に集約）。**その位置にCLEAR**を移動
- 表記を **`▶ ANIMATOR`** / **`COMPOSER ▶`**（矢印＝パイプラインの向き）。モーダル見出しも同じ表記に
- **バー下の使い方解説（`#hint`）は廃止し、SETTINGSの「使い方」表に移設**（ショートカット表の上）。重複していた項目はショートカット表側に一本化
- パネル幅に下限を持たせた（`clamp()`）。狭い窓で `34vw` まで縮むと右端の数値が切れていた

### 注意
- **ビューアテンプレート内の `'\n'` は `'\\n'` と書く**（テンプレートリテラルで実改行に展開され構文エラーになる）。バッククォート禁止も従来どおり
- 検証は `node tools/check.js` ＋ ビューア実生成スモーク（構文／スクロール往復／DOFのぼかし値が変化しているか／S=字幕トグル）

## 操作性ブラッシュアップ（2026-08-06 第2弾）

発注者フィードバック「UIを行き来する手間・誤爆・いまどこにいるか分からない」への対応。

### DOFの操作を 2.TAKE パネルへ集約（PLACE⇄TAKE の往復をなくす）
- **ピン送りはカメラの仕事**なので、よく触る操作をKFカードと同じパネルに置いた。FXモーダル側には
  「一度決めたらあまり触らない」**ピントの幅 / ボケの強さ / BOUNCE** だけを残し、相互に誘導文を出す
- TAKEパネル上部の **DOFストリップ**（`dofStripHTML()`）: ON / FOCUS A・B / A⇔B確認 / 現在の送り先の説明
- **FOCUS A・B は「画面から取る」ピッカー**（`dofPick='a'|'b'`）。押す→キャンバスのコマをクリック→そのコマのDEPTHが入る。
  **TAKEモードのまま使える**（`hitAt()` はモードを問わず引ける）。Escで取消・`body.dofpick` で crosshair
- **送るKFはプルダウンをやめ、KFカードの `◎ ピン送り` トグル**に変更（`dof.kf===i`）。同じKFを再度押すと解除＝
  「KF選択」と「ピン送りの行き先」が同じ画面の同じ並びで完結する

### KFカードのレイアウト（誤爆の解消）
- **`▸ GO` は単独行で全幅**（いちばん押すので大きく）。2行目に `↻ UPD` / `◎ ピン送り` / …右端に `✕`
- 以前は横1列に詰めていたため、**パネルが狭いと GO が数十pxまで潰れ、✕ が GO の真下へ回り込んで押し間違えた**。
  `#cards` にも幅の下限（`clamp(266px,30vw,300px)`）を入れて崩れを止めた
- `✕` は既定でグレー、ホバーで初めて rouge（`.edb.del`）

### 「いまどこか」を分かるように
- **選択したKFのピボットがピンクになり、0.6秒かけて広がるリングが出る**（`kfFlash`）。`selectKf()` と GO で発火
- **プレビュー中は再生位置のKFカードが光って自動スクロール**（`kfNow` / `kfIndexAtP(P)` / `markKfNow()`）。
  毎フレーム走るのでクラス付け替えだけ・変化時のみ実行。キャンバス側のピボットも同時にピンクになる
- `kfIndexAtP()`: dwell区間ならそのKF / travel区間なら**行き先のKF**

### プレビューの操作
- **停止するとその場の構図で止まる**（`stopPreview()` が `camAt(PV.p)` を `VC` に引き継ぐ）。
  以前は元の作業アングルへ戻ってしまい、気になった場所を探し直す必要があった
- **プレビュー中の `▸ GO` は再生位置をそのKFへ飛ばす**（`goKf()`。停止中は従来どおり構図へ移動）

### その他
- **触ったフローティングパネルが前面に来る**（`bringToFront()`。`#cards`/`#qe`/`#fx-modal` の pointerdown を capture で拾う）
- **SETTINGS を econte.html と同じ中央オーバーレイ＋グリッド一覧に**（`#set-ovl`/`#set-box`/`SET_GROUPS`）。
  スクロールせず全部見える（1400×900で3列・実測 532px）。フォント/サイズも econte 準拠（キーは mono 10px・説明は jp 11px）。
  ドラッグ/リサイズは廃止（オーバーレイなので不要）・外側クリックで閉じる

### 検証メモ
- Browser pane の `computer` クリックは**スクリーンショットのスケールが1:1でないと座標がずれる**（ビューポートとスクリーンショットの
  サイズを一致させると1:1になる）。座標クリックが効かないときはアプリのバグと決めつけず、まずスケールを疑う

## 上部バーぶんの視差合わせ（CVOFF・2026-08-06）

**症状**: 16:9セーフフレームが「少し上に寄って見える」。実測（760×900）で枠の上の余白160px / 下236px。

**原因**: キャンバスはビューポート全面（＝書き出しビューアと同じ寸法）だが、**上部バー（76px・2段に折り返す）が上端を覆う**ため、
実際に見えている範囲の中心がキャンバス中心より バー高/2 = 38px 下にある。ガイドも構図も正しく中央に描かれているが、
見える範囲に対しては上に寄る。

**対処**: `CVOFF`（=バー高/2）だけ **CSSの `transform: translateY()` でキャンバスごと下げる**。
- **描画式（`prect` / `drawGuides` / `computeWipeP` / `visFrac`）は一切変えない** ので、構図とガイドの関係＝**書き出し結果は不変**。
  ズレるのは画面上の位置だけ
- **VERIFY HARNESS のベースラインも不変**（`obShotCtx.drawImage(cv,0,0)` はキャンバスのビットマップを写すので CSS transform の影響を受けない）
- 代わりに**ポインタ座標は `evY(e)=e.clientY-CVOFF` でキャンバス内座標へ直す**。対象は
  ①DOFピッカー ②マスク四隅の掴み ③通常のヒット判定 ④ダブルクリック ⑤マスクのドラッグ ⑥フレームへの格納判定 の6か所。
  移動量（ドラッグのdelta）は定数オフセットの影響を受けないので触らない
- テキストエディタは DOM＝画面座標なので `editTextAt` で `+CVOFF` して戻す
- `updateCvOff()` は `onResize()`（バーの折り返しが変わる）と `toggleCleanView()`（バーが消える＝オフセット0）で呼ぶ
- 結果: 760×900 で枠の上下余白が **198px / 198px** に一致

**QUICK EDIT の位置**: `bottom:16px` の下端基準をやめ、他のパネルと同じ **上基準**に変更
（中身が短くても常に画面下辺に貼り付いて見えるため）。`#qe-body{flex:0 1 auto;min-height:0}` で、
長いときだけ中身がスクロールする。※上端の値は 2026-08-08 に `top:var(--bartop)` へ変更（後述）。

## 表示ズーム・パネル操作・DOFの可視化・iPad（2026-08-08 実装済み）

発注者フィードバック「フローティングUIがフレームに被って全体が見えない」「DOFのA/Bが何にどれだけ
効いているか分からない」「iPadでキーボードが無い」への対応。

### 表示ズーム VS（AEの表示倍率相当・`,` / `.` / `0`）

- **キャンバスごと CSS `transform: scale()` で縮める**。`prect`/`drawGuides`/`computeWipeP`/書き出しは
  **一切触らない**ので構図も出力も不変。**VERIFY HARNESS のベースラインも不変**（0.000% で確認済み）。
  CVOFF と同じ「見え方だけ動かす」やり方の拡張
- 段は `VS_STEPS=[1,0.8,0.66,0.5,0.4,0.33,0.25]`。`,`=縮小 / `.`=拡大 / `0`=原寸（`<` `>` も同じ）。
  `localStorage('oban-viewscale')` に保存（**検証窓 `?harness=1` では読まない＝常に原寸**）
- **CVOFF は VS 連動で計算し直す**：縮小するとキャンバス上端が下がってバーに隠れなくなるので、
  `CVOFF = max(0, barH - (VH-VH*VS)/2)/2`。VS=1 なら従来どおり `barH/2`
- **ポインタ変換の一本化**：`evX/evY`（画面→キャンバス内）・`scrX/scrY`（キャンバス内→画面）。
  **ドラッグの移動量も evX/evY の差分で取る**（`drag.px/py` に evX/evY を入れる）ので、
  縮小中でも指の動きと絵の動きが 1:1（実測 dx 60.01/dy -40.00 vs 期待 60/-40）
- テキストエディタは DOM＝画面座標なので `openTextEditor` 内で `scrX/scrY` に通し、フォントも `*VS`
  （`editTextAt` は**キャンバス内座標のまま**渡す。旧実装の `+CVOFF` は廃止）
- **`visBottomPx()`**: 画面の下辺に当たるキャンバス内y。CVOFF で下がったぶんキャンバスの底は画面外に
  出るので、**画面に出すUI（DOF定規・PREVIEW表記）はこの値を基準に描く**。これを忘れると下が切れる

### フローティングパネル（cards / QUICK EDIT / FX 共通）

- **`▾` で最小化**（`.mini` クラス。ヘッダだけ残る）。COMPOSER の INSPECTOR ▾ と同じ作法。
  ボタンのラベルは `▾ ⇄ ▸` で入れ替わる
- **下端リサイズが項目の切れ目にスナップ**（`makePanelResizable(handle, body, snapSel)`。±14px）。
  snapSel は cards=`.dofstrip,.edc-title,.edc` / QE=`.qe-row,.qe-sect` / FX=`.fx-master,.fx-ent`
- **QUICK EDIT は中身の高さぴったりに畳む**（`fitQe()`）＝ **DELETE の直下でパネルが終わる**。
  FRAME を選んで項目が増えても同じ（実測 コマ=187px / FRAME=435px、いずれも scrollHeight と一致）。
  手で高さを変えると `qeUserH=true` で尊重し、**選び直すとフィットに戻る**
  - **注意**: `position:fixed` は `offsetParent` が常に null。可視判定は `getClientRects().length` で行う
  - TAKEモード中は `#qe` が display:none で測れないので、`setMode('place')` で `fitQe(true)` を呼ぶ
- **`--bartop`**: パネルの上端を `top:var(--bartop,88px)` にして、`updateCvOff()` が
  「バーの実高さ+12」を入れる。**窓が狭くてバーが2〜3段に折り返しても潜り込まない**
- **`bringToFront(p,force)`** に force を追加。`toggleFxModal(true)` は必ず `force` で前面へ出し、
  `.mini` も解除する ＝ **TAKEパネルの「詳細…」を押せば、FXが既に開いていて下敷きでも必ず前に出る**

### DOF：何がどれだけ効いているかを見せる

**ピン送りは1本だけ**（A→B・KFひとつ）という仕様は変えていない。分からなかったのは「効き」なので、
状態を3か所に出した：

- **奥行き定規 `drawDofRuler()`**（画面下・編集ビューのみ・書き出さない）: 0..1 の軸に
  **各コマのDEPTH目盛り**（ボケているものは薄く／選択中はピンク＋名前）・**A/Bの旗**・
  **いまのピント（白い縦線＋PIN値）**・**合焦帯（±range）**を重ねる。ピッカー待機中は行き先を大きく表示
- **コマの上のバッジ `drawDofBadge()`**: `D0.60  A:9.1  B:10.9` ＝ そのコマが
  **Aのとき／Bのときのボケ量（CSS px。`IN`＝合焦）**。数字は `cv.height/DPR` 基準なので DPR で倍にならない
- **QUICK EDIT の「ピント」行**: `A くっきり ／ B 10.9px`（DOFがONのときだけ出る）
- ストリップの文言を **「A 今の画 / B 次の画」** に変更し、それぞれの下に
  **`→ そのピント位置にいるコマ名`**（`dofNearest()`）を出す
- **「画面から取る」を押した瞬間に `dofPrev` をその側へ寄せる**（A→0 / B→1）。
  取り込んだ直後も同じ側で表示＋**取ったコマを `sel` にする**ので、定規とバッジが同時に変わって
  「効いた」のが目で分かる。トーストも「いま A の見え方です」と言う
- 「見え方」行に **A / B のワンクリック切替ボタン**を追加（スライダーの両端に配置）
- `dofBlurFor(depth,P,H)` は `dofBlurAtFocus(depth,focus,H)` に分離（UIが任意のピント位置で引けるように）

### 素材の複製（`Ctrl+D`）

- `duplicateSel()`。コマは**名前を変えない**＝`IMGCACHE` を引くキーが同じなので絵をそのまま共有する。
  FRAME は `nextName()` で `FRAME 01 copy` を付け、**子パネル・フレーム内テキストごと丸ごと複製**
  （quad は deep copy）。テキストも可。ルートは +0.05 / フレーム内は +0.06 ずらして最前へ
- 複製したものが `sel` になり、TAKE中なら PLACE に切り替わる

### iPad

- **指の本数でショートカット**（`gTap`・econte の実装と同型・capture段で拾う）:
  **2本=UNDO / 3本=CAPTURE（TAKEへ自動切替）/ 4本=PREVIEW 再生・停止**。
  判定は「全部離れた瞬間」＋最大本数＋260ms以内＋12px以上動いていない。
  **2本目が触れた時点で `drag=null`** にするので、指を置いただけで視点やコマが動かない
  - ※ econte は 3本指=REDO だが、**OBANは発注者要望で 3本指=CAPTURE**。語彙が違う点に注意
- `canvas#cv{touch-action:none}` を追加（ブラウザ側のピンチ/スクロールに取られない）
- **全画面が戻る件**: Safari の Fullscreen API はタブ切替・分割ビュー・回転などで解除される。
  恒久的に消したいなら **共有 ▸ ホーム画面に追加**。そのために
  `apple-mobile-web-app-capable` / `mobile-web-app-capable` / `status-bar-style` / `apple-mobile-web-app-title`
  と `viewport-fit=cover, user-scalable=no` を head に追加した（通常のSafari表示には影響しない）

### 検証（2026-08-08）

`node tools/check.js` ALL PASS ／ `npm run verify:oban` **6点すべて 0.000%**（表示ズームはCSSのみ＝
ベースライン不変）／ ビューアをBlobで実生成してiframe起動＝エラーなし・`focusAt`/`dofBlurFor` 生存。
実クリック・実ドラッグで座標系（VS=0.5 と VS=1）、リサイズのスナップ、複製、最小化、詳細…の前面化を確認。
**マルチタッチだけは合成 PointerEvent での確認（実機iPad未確認）。**
