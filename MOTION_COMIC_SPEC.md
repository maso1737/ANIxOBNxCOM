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

## ⬜ Phase 4: ANIMATOR 漫画パレット（Opusタスク）

コマ枠・トーン・スピード線・文字は ANIMATOR で手描きする、そのための色だけ用意する。

- **やること**: animator.html の FILL PALETTE に「MANGAプリセット」ボタンを1つ追加。押すと `gPalette` を漫画用セットに置き換える（確認は modalConfirm、native confirm 禁止）。
  - セット内容（10スロット）: `#000000`(主線) / `#FFFFFF`(ホワイト) / `#EBEBEB`(トーン10%) / `#D4D4D4`(20%) / `#ABABAB`(40%) / `#808080`(60%) / `#555555`(80%) / `#2B2B2B`(ベタ寄り) / `#F5F1E8`(紙色) / `#FF3355`(アタリ用・非印刷想定)
- **実装場所**: `gPalette` / localStorage `animator_palette_v1` / パレットUI構築関数（スキル `animator-color-palette` の canon 参照）。JSON入出力は既存のまま使える。
- **やらないこと**: トーンブラシ・網点生成・図形ツール。グレー塗り＋手描きで表現する。

## ⬜ Phase 5: ポリッシュ（Opusタスク・各項目独立）

1. **FX HUD に PRNT 表示**: `#fx-hud` にも親名の readonly 表示行（編集はインスペクターのみ）。
2. **カメラ選択中の FX HUD**: AX/AY/OP 行を隠す（インスペクターと同じ条件。`updateFxHud` に `updateKfUI` と同様の分岐を追加）。
3. **undo後の⛓表示更新**: `applyHistory` で parent が変わっても行ラベルの⛓が更新されない → `applyHistory` 末尾で `rebuildAllTrackUI()`…はKFドラッグ中の再構築に注意（HANDOVER「コードの注意点」参照）。安全策はラベルだけ更新する小関数。
4. **AEカメラ書き出し（将来・要相談）**: カメラKFを AE の `.jsx`（ヌル＋カメラ生成スクリプト）で書き出し。パララックスをAE側で組み直したい場合のみ必要。今はカメラOFF書き出しで代替可。
5. **ドキュメント**: index.html のランディング説明に「MOTION COMIC」追記。

## テストチェックリスト（変更時に回す）
1. `node tools/check.js` → ALL PASS
2. 旧プロジェクトJSON（カメラなし）読み込み → 見た目が従来と同一（後方互換）
3. PNG 2枚 D&D → 2トラック追加、BGに Z=500、+CAMERA、X にKF → 手前が大きく動く（パララックス）
4. FG の PRNT=BG → BG移動/回転/拡縮に FG が追従、FGのスケールに親persp が乗る
5. EXPORT PROJECT → IMPORT → カメラKF・parent・Z が復元される（KF全損バグの再発確認）
6. カメラ◉OFF → 素の配置に戻る／per-track PNG がカメラ抜きになる
7. LIVE連携: ANIMATOR保存 → 該当トラックの絵だけ差し替わり、カメラ/親/KFは無傷
