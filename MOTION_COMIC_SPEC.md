# MOTION_COMIC_SPEC — composer.html モーションコミック機能

COMPOSER v0.7 にモーションコミック制作機能を追加する仕様書。
**Phase 1〜3 は実装済み**（2026-07-05, 動作検証済み）。Phase 4〜5 が残タスク（Opusで実装可能な粒度に分解済み）。

## 思想（変えないこと）
- 機能を増やして創作の圧にしない。描くべきところ（コマ枠/トーン/スピード線/文字）は ANIMATOR で手描き。
- COMPOSER は「配置・カメラ・タイミング」だけ。撮影処理（モード/調整レイヤー/エフェクト/マスク/トラックマット）は **やらない**。最終仕上げは AE 想定。
- 書き出しは従来どおり 4K PNG連番 / 動画。AEへは連番で持ち込む。

━━━━━━━━━━━━━━━━━━━━━━━━━━

## ✅ Phase 1: 画像インポート（実装済み）

背景など静止画（PNG/JPEG/WebP）を1枚＝1トラックとして読み込む。

- 入口は既存と同じ2つ: `IMPORT` ボタン（`#file-input` accept拡張・multiple対応）と ビューポートD&D。両方 `importFiles(files)` に統一（JSON/画像/audio混在・複数同時OK）。
- `importImageFile(file)`: FileReader→dataURL→ **cells 1枚の擬似JSON**（`{format:'IMAGE_v1', type:'image', cells:[{kind:'draw',duration:1,image:dataURL}]}`）を作って `importJSON()` へ流すだけ。既存パイプライン（サムネ/保存/描画）がそのまま機能する。
- 1コマでも全編表示される（`drawOneTrack` が `totalFrames-1` でクランプするため）。
- 空コンポに画像を先に読むと、コンポ解像度は画像サイズになる（BG先行ワークフロー）。

## ✅ Phase 2: CAMERA トラック＋パララックス（実装済み）

`+ CAMERA` ボタン（topbar）でカメラトラックを追加（**1つまで**。`dedupeCameras()` が保証）。

### データ
- カメラは **普通のトラック**（`type:'camera'`）。`frames:[]` で絵を持たないだけ。
  → KFダイヤ・複数選択・コピペ・イーズ・マーキー・undo が **無改造で全部使える**（この設計が肝。専用stateを作らないこと）。
- `projectId:null` 固定 → LIVE連携に誤マッチしない。

### プロパティの意味（レイヤーと同じ ALL_PROPS を使う。AX/AY/OP はカメラでは非表示＝`updateKfUI` で隠す）
| prop | カメラでの意味 |
|---|---|
| X/Y | パン。**+X=カメラ右へ→絵は左へ**。レイヤーZ深度に応じ移動量が変わる＝パララックス |
| Z | ドリー。**+Z=前進**（近いレイヤーほど速く拡大＝奥行きのある寄り） |
| ROT | カメラ回転（絵は逆回転） |
| SCL | ズーム（パララックスなしの光学ズーム。奥行き感が欲しければZを使う） |

### 数式（`applyTrackChain` / `applyCamWrap`）
```
persp = PERSP_FOCAL / (PERSP_FOCAL + layer.z - cam.z)   // <1 なら非表示（カメラ面通過）
レイヤー位置 = comp中心 + (layer.x + layer.ax - cam.x*persp) * sx   // Yも同様
レイヤースケール = layer.s * persp
全体ラップ（drawFrameで1回）: 中心基準に rotate(-cam.rot), scale(cam.s)
```
- **後方互換**: カメラ無し（または◉OFF）なら従来の式と完全一致。旧プロジェクトの見た目は変わらない。
- カメラの ◉ トグル＝カメラON/OFF。**per-track PNG書き出しはカメラ焼き込み（見たまま）**。カメラ抜き素材が欲しいときは ◉ をOFFにして書き出す（AEでカメラを再現する場合はこちら）。
- SOLO/PNGボタンはカメラ行に出さない。タイムライン行は ice配色（`.tl-cam`）＋🎥。

## ✅ Phase 3: 親子＝PARENT（実装済み）

AEのペアレント相当。インスペクター TRANSFORM 先頭の `PRNT` セレクト（`#kf-parent`）で親を選ぶ。

- 参照は `track.tid`（恒久ID。`newTid()` で生成、保存に含める。projectId は重複しうるので使わない）。
- 変換継承: 子の X/Y/ROT/SCL は親座標系で解釈（ctx変換スタックの合成、`applyTrackChain` 再帰）。
- ルール（シンプルさ優先で固定。変えない）:
  - **子のZは無効**（親の深度平面に乗る）。パララックスはroot（親なし）トラックのZだけが効く。
  - **OPは継承しない**（AE準拠）。
  - 循環は選択肢から子孫を除外（`isDescendantOf`）＋描画側の深度上限8で二重防止。
  - 親付きの子は位置/アンカーハンドル非表示（画面位置と一致しないため。数値/スクラブで編集）。
- 親を持つトラック名に ⛓ マーク。トラック削除時は `sanitizeParents()` で子の親参照を解除。
- 親の付け替え自体はKF不可（AEと同じ静的リンク）。undo対象（`cloneEditState` に parent 含む）。

## ✅ 保存形式（PROJECT_v2 拡張・後方互換）

各トラック要素に追加: `tid` / `type`('anim'|'image'|'camera') / `parent`(tid|null) / `visible`。
カメラは `cells:[]` で保存され `parseTrackFromJSON` が `type==='camera'` を特別扱い。
旧JSONは全フィールド省略可（tid自動生成/type='anim'/parent=null）。

**修正済みの既存バグ**: PROJECT_v2 のトラック要素に `format` フィールドが無いため、KF復元条件
`json.format==='PROJECT_v2' && json.composer` が偽になり **EXPORT PROJECT→IMPORT でキーフレーム全損**していた。
条件を `json.composer` の有無だけに変更済み。あわせて per-track `width/height` が `state.width` で潰されていたのも `t.width` 保存に修正。

━━━━━━━━━━━━━━━━━━━━━━━━━━

## ❌ Phase 4: ANIMATOR 漫画パレット（2026-07-27 **破棄**・実装しない）

> 当初案: FILL PALETTE に「MANGAプリセット」ボタンを追加し、`gPalette` を漫画用10色
> （主線/ホワイト/グレー4段/ベタ寄り/紙色/アタリ）へ**総入れ替え**する。

**破棄した理由**（発注者確認済み）:

1. **狙いが本実装に追い越された**。Phase 4 の本質は「グレー単色ベタでトーンを代用する」だったが、
   animator に **SCREEN TONE インク**（`TONE.tone1/tone2`＝dot10%/40%。下書/指示ボタンのWクリックで切替。
   パターンはキャンバス原点固定）と **LASSO FILL 投げ縄塗り**（`lassoFillPolygon()`。トーンインク選択中は
   網点のドット位置だけ着色）が入り、**本物の網点**で描けるようになった。グレー4〜5段はもう出番がない
2. **総入れ替えが破壊的**。`gPalette` を10色で上書きすると localStorage `animator_palette_v1` の
   アニメ彩色用48色が消える。得られるものに対してリスクが見合わない
3. **役割分担が済んでいる**。白黒の静的素材（枠・トーン・集中線）は `manga-plate.html` の担当。
   SPEC_09 §0 で「animator = 動く手描き素材・**改修ゼロ**」と明記済み
4. **実質の新色は2色だけ**。`#FFFFFF`/`#000000` は既に `PALETTE_48` のニュートラル8色に含まれる。
   残るのは `#F5F1E8`(紙色) と `#FF3355`(アタリ) のみ → **＋ボタンでスロット追加すれば足りる**

**代替**: 漫画用の色が欲しいときは、パレットJSON（⇩⇧で入出力・`format:'PALETTE_v1'`）を1本作って読み込む。
実装ゼロで同じ結果になる。

**将来やるなら Phase 4 ではなく**「名前付きパレットを複数保持して切り替える」への一般化。
作品ごとの色指定にも効くが、これは別タスク（中規模）扱い。

## ✅ Phase 5: ポリッシュ（2026-07 実装・完了）

1. ✅ **FX HUD に PRNT 表示**: `#fx-parent-row`（readonly。編集はインスペクターのみ）。
2. ✅ **カメラ選択中の FX HUD**: AX/AY/OP 行を隠す（`updateFxHud` にインスペクターと同じ分岐）。
3. ✅ **undo後の⛓表示更新**: `refreshTrackChainMarks()`（ラベルの⛓だけ差し替え。DOM再構築なし＝KFドラッグ安全）を `applyHistory` から呼ぶ。
4. ✅ **AEカメラ書き出し**: トップバー `AE JSX`（`exportAeJsx()`。CAMERAトラックがあるとき有効）。親NULLチェーン合成込みのカメラKFを「ヌル＋一節点カメラ生成 .jsx」で書き出し。x/y/z→ヌルPosition（コンポ解像度スケール）/ rot→ヌルZ回転 / s→カメラZoom乗算 / 焦点1000px=Zoom基準。ez/influenceは easeInEaseOut influence% へ近似。
5. ✅ **ドキュメント**: index.html のランディングに OBAN カード（`02` / desc「モーションコミック / PLACE→TAKE→書き出し」）が入り達成済み（2026-07-27 確認）。

## ✅ Phase 6: グラフ/ヌル/カメラ親（2026-07 実装）

- **influence% イーズ**: キーに任意フィールド `ei`（入る側）/`eo`（出る側）0〜100。設定された区間は cubic-bezier(eo/100,0,1-ei/100,1) タイミング（`bezierEaseT`）。未設定区間は従来の ez smoothstep（後方互換）。インスペクターの `INF IN/OUT` 欄で選択KF（無ければ現フレームのキー）に適用、空欄で解除。コピペ/ドラッグ/複製/undo/PROJECT保存/WEB書き出しすべて持ち回り。
- **ミニグラフ**: タイムライン下 `#tl-graph`（トランスポートの∿ボタン / G キー）。選択トラックのKFプロパティを色分け折れ線＋キー点＋プレイヘッド。左上ラベルクリックで VAL（値）⇔ SPD（|Δv|速度）切替。
- **NULLトラック**: `+ NULL`（type:'null'、描画されない親専用。アイコン◇）。PROJECT_v2 に type:'null' で保存/復元。
- **カメラの親**: カメラの PRNT に NULLトラックのみ選択可。合成は加算（x/y/z/rot加算・s乗算、`getCamAt`）＝OBAN由来のカメラKFをNULL側キーで丸ごと調整できる。WEB書き出しビューアも同ロジック（camera.parent を保存）。
- **子トラックのZ有効化**: 親付き子の Z は「親の深度平面上のローカル透視スケール」（persp=1000/(1000+z)。カメラドリーは親側で消化済みのため子には掛けない）。

## テストチェックリスト（変更時に回す）
1. `node tools/check.js` → ALL PASS
2. 旧プロジェクトJSON（カメラなし）読み込み → 見た目が従来と同一（後方互換）
3. PNG 2枚 D&D → 2トラック追加、BGに Z=500、+CAMERA、X にKF → 手前が大きく動く（パララックス）
4. FG の PRNT=BG → BG移動/回転/拡縮に FG が追従、FGのスケールに親persp が乗る
5. EXPORT PROJECT → IMPORT → カメラKF・parent・Z が復元される（KF全損バグの再発確認）
6. カメラ◉OFF → 素の配置に戻る／per-track PNG がカメラ抜きになる
7. LIVE連携: ANIMATOR保存 → 該当トラックの絵だけ差し替わり、カメラ/親/KFは無傷
