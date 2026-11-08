# SPEC_24 — ECONTE CROP（写真取り込み × 可変枠クロップ × 一括書き出し）

起草 2026-11-05（Claude）。元メモ `_from_GPT_20261103/econte-photo-crop-extension-memo-2026-11-04.md`。
**状態：実装済み（2026-11-05）。** 決めたこと・設計から変えたこと・動作チェック表は §7。残りは iPad 実機とフォルダ書き出しの実機確認。

## 1. 形（決めたこと）

- econte に **3つ目の画面 CROP**（`state.view='crop'`・トップバー GRID の右に `CROP`・キー `3`・BOARD 上部に `✂ CROP` ＝選択中の写真で開く）。
  STUDIO / GRID には手を入れない（重くしない）。cuts[]（16:9 の映像カット）とは**別データ**。
- データは写真ごとの `p.crop = {x,y,w,h, own, off}`（**向き補正後の写真に対する 0..1**）だけ。ピクセルは書き出すときに1枚ずつ。
  - `own`＝個別に直した／`off`＝外した（書き出さない・矩形は残す）
- 全体設定 `gCrop = {base:{x,y,w,h}|null, aspect:'free'|'1:1'|'4:3'|'3:2'|'16:9'|'a'(√2)|'custom', custom:'5:4', portrait, order:[photoId], name:{mode:'num'|'src', prefix:'rough_', start:1, digits:4, fmt:'png'|'jpg', q:0.92}, send:'seq'|'still', layout:'single'|'table'}`。
  保存は IDB `meta` の `main` レコードに `crop`（**saveAll と loadAll の migrated 分岐の両方**で書く。meta は clear→put）。PROJ ZIP は `meta.photos[].crop`＋`meta.crop`。
- 基準枠：最初に描いた枠が基準になり、全写真へ当てる（own=false）。以後1枚を直すと own=true。
  `◎ 基準にする`（今の枠を基準に→own でない全部が追従）／`⇉ 全部に当てる`（own も上書き・確認あり）／`↺ 基準に戻す`／`✕ 外す`。
  基準を写真に当てる式：中心と幅の割合を保ち、比があれば高さを `w*W/(A*H)` で決めて写真内にクランプ。
- 比：画面全体で1つ（変えたら全枠の中心と幅を保って比だけ合わせる）。FREE は各枠の形のまま。
- 回転（rotatePhoto）時は枠も回す：+90 → `{x:1-y-h, y:x, w:h, h:w}`／−90 → `{x:y, y:1-x-w, w:h, h:w}`。
- Undo：CROP の操作は gLog に `type:'crop'`（全枠＋基準のスナップショットで戻す）。

## 2. 画面

- 1枚：左＝枠エディタ canvas（角ドラッグ＝拡縮・比固定／中ドラッグ＝移動／外ドラッグ＝描き直し／ホイール＝中心で拡縮・枠外を暗く・own のときは基準を破線で重ねる・出力 px を表示）。右＝名前・書き出し・送る＋一覧（サムネ・`#03`・`元の名前 → 出力名`・W×H・基準/個別/外す・⇩・▲▼）。
- 表：カラースクリプト風の全幅グリッド（番号＋出力名・D&D で並べ替え・Wクリックで1枚へ）。`Q` で行き来。
- キー（CROP 中だけ）：←/→ 前後・Shift+矢印 少し動かす・+/− 拡縮・R 基準に戻す・Delete 外す・Q 1枚⇄表。

## 3. 書き出し

- 元解像度のまま（`p.img` から回転＋GRAY を掛けて矩形だけ切る）。PNG 既定／JPG。
- 名前：`prefix + 連番(start, digits)` か `元の名前`（重複は `_2`）。
- ⇩ この1枚（downloadBlob）／⇩ フォルダへ（showDirectoryPicker・**同名があれば「上書き／飛ばす／やめる」を先に聞く**・失敗しても続けて最後に一覧）／⇩ ZIP（loadJSZip・STORE）。
- サイズが揃っていないときは一覧に印（連番で送るときの注意）。

## 4. 直送（OBAN / LIVE PLATE）

- 共有 IDB **`tdr_crop_push`**（store `push`, keyPath `id`＝`'oban'|'liveplate'`。1宛先1件・上書き）に `{v:1, ts, from:'ECONTE', mode, files:[{name,type,blob,w,h}]}`。
  `tdr_exchange` は使わない（他アプリが getAll で PROJECT_v1 と思って読む）。
- 通知：`localStorage['tdr_crop_inbox_v1:<id>'] = {v:1,ts,n,mode}`（storage イベント）＋ `BroadcastChannel('tdr_crop')` `{type:'crop-push',target,ts}`。1.5 秒で `crop-ack` が来なければ「開くと受け取ります。新しいタブで開く？」。
- 受け側（`ts` が `tdr_crop_seen_v1:<id>` より新しければ取り込み→レコード削除→ack→`linkLog`）：
  - OBAN：既存 `addFiles(files)`（seq は一度に＝連番4枚以上でシーケンス／still は1枚ずつ呼ぶ）。⚠ `oban-builder.html` には TAB LINK STEP2 の未コミット差分があるので、末尾に独立ブロックで足す。
  - LIVE PLATE：`js/io/import.js` の init に受け箱を足し `LP.io.importFiles(files,'shelf')`（still は1枚ずつ）。
- 連番で送るときは名前モードに関係なく番号名にする。LINK MAP に ECONTE→OBAN（上を回る弧）と LIVE PLATE ノード＋ECONTE→LIVE PLATE を追加、ログキー `ec-ob` / `ec-lp`。GUIDE_MANGA_LINKS.md・PIPELINE.md も同時に直す。

## 5. BOARD 側の小改造

- 取り込み（D&D・▶ IMPORT・CROP への D&D）を**グリッド整列**に（1枚幅 1400・cols=ceil(√n)・既存の写真/枠と重なるなら全体の下へ）。設定 `gUi.importLay='grid'|'stack'`（重ねる＝同じ画角を比べたいとき）。2枚以上なら取り込み後に boardFit。
  `addPhotoFromImage` に置き場所の引数を足す（ペースト等の従来経路はそのまま）。
- `@`（既存 togglePaneMax）で BOARD を最大化したら boardFit も呼ぶ＝AE の @ と同じ「全体が見える」。
- 切り出し枠を BOARD に薄く表示（H で CUT 枠と一緒に消える・操作はしない）。
- 重さ：`drawPhoto(ctx,p)`（hiRes でないときだけ）を 256/1024px のプロキシから描く（idle で順に作る）。ベイクと書き出しは従来どおり原寸。VRT は cut 出力しか撮らないので影響なし。

## 6. 実装の注意（読んで分かったこと）

- `p.img` は HTMLImageElement か ImageBitmap（HEIC）＝寸法は `naturalWidth || width`。
- onKey：global アクションの直後に `if(state.view==='crop'){ cropKey(e); return; }`（ペイントキーに落とさない）。
- `tools/check.js` は未参照関数・id 配線を見る＝足した関数は必ずどこかから呼ぶ。
- v1 対象外：台形・パース補正、絵の範囲の自動検出。

## 7. 実装の記録（2026-11-05）

### 7-1. 置き場所

- econte.html：CSS（`#view-crop` ほか）・HTML（`#view-crop`／トップバー `CROP`／BOARD の `✂ CROP` と `⊞ 格子｜⧉ 重ねる`）・
  JS は `init()` の直前に1かたまり（`defaultCrop` 〜 `syncImportLay`）。既存へのつなぎは
  `setView`・`SHORTCUT_ACTIONS`（`viewCrop`＝3）・`onKey`（global の直後に `cropKey`）・`relayout`・`saveAll`／`loadAll`（migrated 分岐も）・PROJ ZIP・`rotatePhoto`（`cropRotate`）・
  `togglePaneMax`（BOARD のとき `boardFit`）・`renderBoard`（枠を薄く）・`drawPhoto`（縮小版）・`addPhotoFromImage`（`pos`）・`importFiles`（格子・追加した写真を返す）・HELP。
- oban-builder.html：`setupCropInbox` / `cropInboxCheck`（`linkLog` の直後）・起動は `setupApLive()` の隣。
- live-plate/js/io/import.js：`setupCropInbox` / `cropInboxCheck`（`init()` の先頭で起動）。
- link-map.html：ノード `lp`（LIVE PLATE）・ルート `ec-ob`（上を回る弧）／`ec-lp`・ログ `ec-ob`／`ec-lp`。

### 7-2. 設計から変えた・決めたこと

1. **基準 `gCrop.base` に `ar`（基準を描いた写真の W/H）を持たせた。** FREE のとき基準を別の写真へ当てると、
   基準の「画素の形」（`(w/h)·ar`）を保つ。比を変えたときに基準自体も合わせ直せる。
2. **並び `gCrop.order` は取り込んだ順で書き込む。** 並びに無い写真は `cropList()` が後ろへ足してその場で保存する。
   書き込まないと、読み直したとき IndexedDB の戻り順（id 順）で入れ替わった（実測）。
3. **Undo のスナップショットに比・縦・並びも入れた**（全枠＋基準だけだと、比の変更を戻したとき枠だけ戻って比の欄が残る）。
   戻したら比の欄も `cropSyncControls` で戻す（実測でずれた）。
4. **ホイール・Shift+矢印・+／− の連打は 400ms 止まってから1手**（`cropCommitSoon`）。
5. **寸法が揃っていない注意**は「全部に当てる」では直らないことがある（縦の写真は同じ枠でも画素数が違う）ので、
   一覧の「寸」の印を見直すように書いた。
6. **縮小版**は BOARD の表示だけ（`drawPhoto` の `hiRes=false`・フィルタが無いか `ctx.filter` が使えるとき）。
   CROP の枠エディタと一覧は `proxyNow` で同期的に作る（初めて開いた1回だけ待つ）。ベイク・書き出しは原寸。
7. **直送の受け側は `ts` を `tdr_crop_seen_v1:<id>` に覚える**＋取り込んだらレコードを消す。読み直しても二重に入らない（実測）。
8. OBAN は画像そのものを保存しない（従来どおり）＝閉じて開き直したら再ドロップ。LINK MAP の説明に書いた。

### 7-3. 動作チェック表（2026-11-05・内蔵ブラウザ・127.0.0.1:8179）

テスト用の写真は、画素の色が位置を表す画像（R＝x・G＝y）をページ内で作り、本来の取り込み口（▶ IMPORT のファイル入力）から入れた。

| 項目 | 期待される変化 | 有効になる条件 | 結果 |
|---|---|---|---|
| 2枚以上の取り込み | 格子（cols=ceil(√n)・1枚幅 1400・間 120）に並び、全体表示 | `⊞ 格子`（既定） | ✅確認済（4枚＝2×2・重なりなし） |
| `⧉ 重ねる` | 従来どおりずらして重ねる | 切替ボタン | ✅確認済（2枚が 46px ずつずれて重なる・ボタンの表示が「⧉ 重ねる」に） |
| キー 3／トップバー CROP／✂ CROP | CROP が開く（✂ は選んだ写真で） | — | ✅確認済（キー 3・✂ は選んだ写真 #06 で開き、あとから入れた写真にも基準が当たっていた） |
| 最初の枠 | 基準になり全写真に当たる（縦の写真は同じ形で中央） | 基準がまだ無い | ✅確認済（801×601 ×3・縦 601×451） |
| 角ドラッグ | その写真だけ個別・基準を破線で重ねる | 基準がある | ✅確認済（998×750・個別） |
| 比 16:9／縦 | 全枠が中心と幅を保って比だけ合う | FREE 以外（縦は FREE で押せない） | ✅確認済（全部 1.776〜1.779／縦 0.563） |
| Ctrl+Z／Ctrl+Y | 比・枠・並びが戻る／進む | — | ✅確認済（比の欄のずれを直したあと） |
| R／Delete | 基準に戻す／外す（一覧・名前から抜ける） | — | ✅確認済 |
| ▲▼／表の D&D／Wクリック | 並べ替え・1枚へ | — | ✅確認済（D&D は自動操作で HTML5 の D&D が出ないので、D&D イベントを直接送って確認） |
| 写真の回転 | 枠も回り、切り出す絵の中身は同じ | — | ✅確認済（四隅の色が回った位置へ・Undo で元通り） |
| ⇩ ZIP | 元解像度・名前＝頭＋連番・外した写真は入らない | — | ✅確認済（左上の画素が元写真の該当位置と一致） |
| ⇩ この1枚・JPG・元の名前 | `IMG_A.jpg`（image/jpeg） | 形式 JPG・元の名前 | ✅確認済 |
| ⇩ フォルダへ | 同名があれば先に聞く・失敗しても続けて最後に一覧 | showDirectoryPicker がある | ⚠️未確認（フォルダ選択は自動操作できない） |
| ▶ OBAN（連番・開いている） | その場で1つのシーケンス（4枚）・ack | 同じオリジン | ✅確認済（`rough_*.png` n=4） |
| ▶ LIVE PLATE（1枚ずつ・閉じている） | 「開くと受け取ります」→ 開くと棚へ4素材・読み直しても二重にならない | 同上 | ✅確認済 |
| 保存・読み直し | 枠・基準・比・並びが残る | — | ✅確認済 |
| PROJ ZIP | `meta.crop` と `photos[].crop` が入る | — | ✅確認済 |
| BOARD の枠表示・縮小版・@ | 薄い破線（外した写真は出ない）・1024px の縮小版で描く・@ で全体表示 | H で CUT 枠と一緒に消える | ✅確認済 |
| VRT | econte 15コマ・LIVE PLATE 11コマ・OBAN 6コマ 0.000% | — | ✅確認済 |
| iPad（指） | 枠のドラッグ・ピンチ | — | ⚠️未確認（実機なし） |
