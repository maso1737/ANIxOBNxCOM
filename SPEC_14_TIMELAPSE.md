# SPEC 14 — ANIMATOR TIMELAPSE（作画タイムラプス）

> **この仕様書単体で実装可能なように書いてある。** 行番号は変動するため**必ずシンボル名でgrep**。
> 実装前に読むもの: `animator.html` の `markFrameDirty()` / `pushHistory()` / `exportVideo`系（`pickVideoMime`・
> `showExportOv`・`gExportCancel`）/ `openDB()` / `AUTOSAVE_OFF`、`ANIMATOR_HANDOVER.md`（「autosaveの容量実測」節）。

## 0. 目的と大原則

- **目的**: 作画の過程を自動で記録し、「手で描いている」ことがそのまま伝わる映像を出す。SNS・講座・記録用
- **大原則**:
  - **撮り方は1系統、見せ方は再生時に選ぶ**（§3）。記録をやり直さずに複数の見せ方が出せるようにする
  - **既定ONで撮り忘れを無くす**。そのかわり**枚数上限のリングバッファ**で容量を頭打ちにする
  - **autosave を邪魔しない**。専用ストアに分け、`AUTOSAVE_OFF`（別窓）では記録しない
  - 撮影は**描画の邪魔をしない**こと。ストローク中は撮らない、エンコードは非同期

## 1. しないこと（v1スコープ）

- 画面録画（UI・ツールバー・カーソルの記録）。**キャンバスの絵だけ**を撮る
- 音声・BGM・ナレーション
- 編集機能（不要区間のカット、速度カーブ）。※区間トリムは P3 の任意項目
- COMPOSER / OBAN 側での再生。ANIMATOR 内で完結させる
- REF画像 / REF ANIMATOR の記録（他人の素材が混ざるため**常に除外**）
- **連番PNG(ZIP)書き出し**（2026-07-27 発注者判断で**不要**と確定。将来復活させるなら
  `exportZipPNG()` 骨格を流用すれば足りるが、**v1でもv2でも作らない**）

## 2. データモデル

IndexedDB `DB_NAME:'animator'` を **v5** に上げ、専用ストアを2つ追加する。

```js
STORE_TL_META: 'tl_meta',   // 単一レコード key='tl'
STORE_TL_SHOT: 'tl_shot',   // key = seq(number 単調増加)

TL_META = { version:1, startedAt, seqHead, seqTail, count, bytes,
            settings:{ on:true, intervalMs:2000, maxShots:1500, longEdge:1280, quality:0.72 } }

TL_SHOT = { seq, t,            // t = Date.now()（実時間の間隔を再現するため）
            frameId, frameIdx, // ★どのコマを撮ったか（§3の並べ替えに使う）
            w, h, blob }       // blob = image/webp（非対応なら image/jpeg）
```

- **専用ストアにする理由**: `frames`/`meta` と混ぜない。CLEAR が `clear()` 1回で済み、
  容量計算も `tl_meta.bytes` の加減算だけで完結する
- **リングバッファ**: `count > maxShots` になったら `seqTail` から古い順に `delete()`。
  削除ぶんを `bytes` から引く。**上限を超えても自動で止まらない**（撮り続けて古いものを捨てる）

## 3. ★記録対象と「見せ方」— ここが本仕様の肝

ANIMATOR は多コマなので、Procreate のような単一キャンバス前提がそのままは使えない。

**記録（撮り方）は1つだけ**: その瞬間に**表示中のコマ**を撮る。コマを移動すれば次のショットは別のコマになる。

**再生・書き出し時に並べ替えモードを選ぶ**（同じ記録データから両方出せる）:

| モード | 並び順 | 何が見えるか |
|---|---|---|
| **WORK（作業順）** | `seq` 昇順＝撮った順そのまま | 実際の作業の流れ。コマを行き来しながら中割りしていく様子が出る。**ただしコマ間で絵が飛ぶ** |
| **CELL（コマ別）** | `frameIdx` でグループ化 → 各群を `seq` 昇順 | コマ1が出来上がる→コマ2が出来上がる…と**線が増える過程が連続して見える**。「手描きだとわかる」目的にはこちらが強い |

> **なぜ両方要るか**: 中割り作業は コマ3→コマ1→コマ2→コマ1… と行き来するため、
> 作業順のまま再生すると絵がバタつき「何が起きているか分からない映像」になりやすい。
> かといって作業順にしか無い情報（行き来そのもの＝アニメ作画の実態）もある。
> **`frameIdx` を1フィールド持つだけで両方出せる**ので、記録側では判断しない。

**合成するレイヤー**（記録時にオフスクリーンで合成）:

| レイヤー | 記録する | 備考 |
|---|---|---|
| `bg` | ✅ | `bgBright` 反映。紙の明るさ |
| `frame`（下絵） | ✅ | 表示ONのときだけ。トレース元が見えると手描き感が出る |
| `onion`×2 | ✅ | **表示ONのときだけ**。前後コマが透けている＝アニメ作画だと一目で分かる |
| `draw` | ✅ | 本体 |
| `guide` | ❌ | 解像度枠・セーフフレーム・ミラー軸は書き出し非合成の規律どおり |
| REF画像 / REF ANIMATOR | ❌ | §1のとおり常に除外 |

## 4. 撮るタイミング

**「変化があったときだけ、一定間隔」**。3条件すべてを満たしたときに1枚撮る。

1. **間隔**: 前回撮影から `intervalMs`（既定 2000ms）以上経過
2. **変化あり**: 前回撮影以降に `tlDirty` が立っている
3. **描画中でない**: `drawing === false` かつ `lassoing === false`（ストローク途中の中途半端な画を撮らない）

- **`tlDirty` の立て方**: `markFrameDirty()` の中で `tlDirty = true` にする。
  ここは `pushHistory()`（＝ペン/消し/FILL/投げ縄すべての確定点）と、貼り付け・解像度変更・コマ操作が
  必ず通る**単一の合流点**なので、フックはここ1か所でよい（`endStroke` に直接ぶら下げないこと。
  FILL と投げ縄は `endStroke` を通らない）
- **駆動**: `setInterval(tlTick, 500)` の軽いポーリング。条件を満たしたときだけ合成＋エンコード。
  `requestAnimationFrame` は使わない（裏タブで止まってしまうと記録が歯抜けになる）
- **エンコードは非同期**（`toBlob`）。エンコード中は次の撮影をスキップし、描画を待たせない
- **`AUTOSAVE_OFF`（`?ro=1` の別窓）では記録しない**。参照用の窓の絵が本窓の記録に混ざるのを防ぐ

## 5. 保存サイズ（実測・2026-07-27）

1280×720 / WebP q0.72 でエンコードした実測値。

| 絵の密度 | 1枚 | 1500枚（既定上限）で |
|---|---|---|
| 線が中央に集まる通常の作画（25ストローク相当） | **10KB** | 15MB |
| 描き込み多め（60ストローク相当） | **22KB** | 33MB |
| 密（160ストローク相当） | **49KB** | 74MB |
| 画面全面にトーン・ベタ（最悪） | **約190KB** | 285MB |

参考: 同条件の PNG は 623KB、JPEG q0.8 は 277KB。**WebP が明確に最小**なので既定にする。

- **既定 `maxShots:1500`** ＝ 2秒間隔で「実際に描いている時間」50分ぶん。通常の作画なら **15〜35MB**
- 設定で `500 / 1500 / 3000 / 6000` を選べる。6000枚×最悪190KB ≈ 1.1GB になるので、
  **設定UIに「現在の使用量」と「この上限での最悪見積り」を併記する**（クォータは実測5.2GB）
- autosave 実測（`ANIMATOR_HANDOVER.md`「autosaveの容量実測」）は 0.42〜0.64MB/コマ・3秒カットで約46MB。
  **タイムラプスの方が容量の主役になる**ので、上限UIはこちらに付ける

## 6. 画面と操作

### トップバー
- **`TL ●` / `TL ○`** トグル（`LIVE` ボタンの隣）。記録ON/OFF。既定ON。localStorage `animator_tl_on_v1`
- クリックで即時反映。OFF中も既存の記録は消さない

### TIMELAPSE パネル（`TL` ボタンをWクリック、または設定パネル内から）
- **再生**: プレビュー領域＋トランスポート（再生/停止・スクラブ・fps 6/12/24/60）
- **並べ替え**: `WORK（作業順）` / `CELL（コマ別）` のトグル（§3）
- **情報**: `N枚 · 約M分ぶん · XXMB`
- **設定**: 記録間隔（1/2/5秒）・上限枚数（500/1500/3000/6000）・記録解像度（720p/1080p）
- **CLEAR**: 記録を全消し（`modalConfirm` 必須・native confirm 禁止）
- **EXPORT VIDEO**: §7

### 規律
- 確認ダイアログは `modalConfirm` / `modalAlert`（native confirm 禁止）
- パネルはフローティング＋ドラッグ移動＋リサイズグリップ（REF/PROJパネルと同じ作法）
- ESC の優先順位は KINETIC STAGE デザインシステム準拠

## 7. 出口

| 出力 | 内容 | 状態 |
|---|---|---|
| **アプリ内再生** | パネル内で早送り再生。並べ替え2モード | **v1で実装**（発注者選択） |
| **WebM / MP4** | 既存の `pickVideoMime()` + `MediaRecorder` + `captureStream` を流用 | **v1で実装**（発注者選択） |
| ~~連番PNG（ZIP）~~ | — | **作らない**（§1・発注者判断で不要と確定） |

**出口はこの2つで確定。** 増やさないこと。

- 書き出しは**実時間レンダリング**（既存 EXPORT VIDEO と同じ）。1500枚@24fps ≒ 62秒かかる。
  事前に `modalConfirm` で「約N秒かかります」と出す（既存の文言と揃える）
- 書き出し中は `showExportOv()` の進捗＋キャンセル（`gExportCancel`）に乗せる
- ファイル名: `timelapse_<work|cell>_<yyyymmdd-hhmm>.webm`

## 8. 実装フェーズ

### P0 — 記録エンジン（これ単体で「撮れている」が完成）✅ 2026-08-01 実装済み
DB v5 マイグレーション（`tl_meta`/`tl_shot` 追加・既存データ不変）・`tlDirty` フック・
`tlTick()` 撮影ループ・オフスクリーン合成・WebPエンコード・リングバッファ・
トップバー `TL` トグル・`AUTOSAVE_OFF` ガード。
**受け入れ**: しばらく描いて `tl_shot` に枚数が増え、上限を超えると古いものから消える。描き味は不変。

**実装メモ（P1/P2 が読む前提）**:
- シンボル: `tlMeta` / `tlDirty` / `tlLastShotAt` / `tlBusy` / `tlTimer` / `tlMimeType` / `tlCv` `tlCtx`、
  関数 `tlDetectMime` `tlAvailable` `tlEnabled` `tlGetMeta` `tlPutMeta` `tlComposeShot` `tlTrim`
  `tlShoot` `tlTick` `updateTLUI` `tlInit`。**`tlHistory`/`tlHistIdx`/`TL_HIST_MAX` は
  「タイムライン履歴」で完全に別物**。grep するとき混ざるので注意
- `tlDirty` は `markFrameDirty()` の中で立てる（`endStroke` ではない＝FILL/投げ縄も拾う）
- 起動時 `tlInit()` の末尾で `tlDirty=false` / `tlLastShotAt=Date.now()` に落とす。
  読込・復元中の `markFrameDirty` を編集とみなさないため（**開いただけでは撮らない**）
- `tlShoot()` は**合成した直後**に `tlDirty=false` にする（エンコード中に入った編集は次の1枚で拾う）
- 記録ON/OFFの正は localStorage `animator_tl_on_v1`。`tlMeta.settings.on` は起動時にそれで上書きされる
- 別窓（`?ro=1`）はボタンが **`TL －`**（クリック無効・`setInterval` も張らない・`tl_meta` も書かない）
- DB v5 化にあわせて `openDB()` に `onblocked` ログと `db.onversionchange → close()` を追加
  （旧バージョンで開きっぱなしのタブがアップグレードを止めるのを避ける）
- P1 が使うキー: `tl_shot` は `seq` キーの連番、`getAllKeys()`/`openCursor` で昇順に取れる。
  `frameIdx` は撮影時の `state.currentFrame`（実測で確認済み）

### P1 — アプリ内再生 ✅ 2026-08-01 実装済み
TIMELAPSEパネル・プレビュー・トランスポート・**WORK/CELL 並べ替え**・情報表示・設定・CLEAR。

**実装メモ**:
- 開き方は **`TL` ボタンのWクリック**（`dblclick`。click 2回＝記録トグルが往復するので実質無害）
  と **設定パネル → TIMELAPSE → 「TIMELAPSE パネルを開く」**（`#tl-open-settings`）の2つ
- シンボル: `tlList`（表示順に並べ替えたショット配列）/ `tlOrder` `tlFps` `tlIdx` `tlPlaying`
  `tlBmp`（seq→ImageBitmap のLRU・上限 `TL_BMP_MAX=240`）、
  関数 `tlPanelIsOpen` `tlSortList` `tlLoadList` `tlListAppend` `tlBmpGet` `tlDrawAt` `tlSeek`
  `tlSyncTransport` `tlPlayStart/Step/Stop` `tlRenderInfo` `tlApplyPanelUI` `tlPanelToggle`
  `tlSettingChanged` `tlClearAll`
- **並べ替えは `tlSortList()` の比較関数1つ**。CELL は `(frameIdx, seq)`、WORK は `(seq)`。
  記録側は何も変えない＝同じ記録から2通り出る（§3のとおり）
- **デコードは遅延**。`tlBmpGet(i)` はキャッシュにあれば同期で返し、無ければ `createImageBitmap` を
  走らせて済んだら描き直す。再生中は `TL_PREFETCH=10` 枚先読み。前の絵を残すのでチラつかない
- **レターボックス**：基準は先頭ショット（最小 `seq`）の縦横比 `tlAspect`。プレビューcanvasは幅480固定で
  高さをアスペクトから決め、各ショットは contain で中央に描く（解像度が混在しても引き伸ばさない）
- 記録中にパネルを開いたままでも古びないよう、`tlShoot()` から `tlListAppend(shot)` で1枚足す
- 上限枚数を下げたときは `tlSettingChanged()` がその場で `tlTrim()` する
- 別窓（`?ro=1`）は**見るだけ**（再生はできる）。記録トグル・3つのselect・CLEAR は `disabled`＋半透明にして、
  「効かないのか壊れているのか」で悩ませない
- ESC は **再生中ならまず停止**、そうでなければ従来どおりフレーム選択解除
- **再生の駆動は `requestAnimationFrame`**。ブラウザ非表示時は止まる（見ていないので許容）

### P2 で足すもの（このパネルに載せる）
`EXPORT VIDEO` ボタンを RECORDING セクションの上あたりに追加し、`tlList`（＝並べ替え済み）を
そのまま実時間で `tlDrawAt` 相当に流して `MediaRecorder` に載せる。進捗は `showExportOv()`。
ファイル名は `timelapse_<work|cell>_<yyyymmdd-hhmm>.webm`。

### P2 — 動画書き出し
WebM/MP4。既存 EXPORT VIDEO のパイプラインを流用。進捗＋キャンセル。

### P3（任意・将来）
区間トリム（不要な冒頭・末尾を捨てる）/「コマ完成時だけ1枚」の間引きモード。
※連番PNG(ZIP)は**やらない**（§1）。

## 9. リスクと判断メモ

- **描き味への影響**: エンコードは `toBlob` の非同期で、2秒に1回・多くても50ms程度。
  ただし**大きいキャンバス（4K）＋短い間隔（1秒）は重くなりうる**ので、
  P0の実装時に「エンコード中は次をスキップ」を必ず入れる。実測してから既定値を最終決定する
- **裏タブ問題**: `setInterval` は裏タブで間引かれる（1秒未満に丸められる）。
  記録が歯抜けになるだけで壊れはしないので許容。`rAF` は完全に止まるため使わない
- **コマ削除との整合**: 記録済みショットが指す `frameId` のコマが後で削除されることがある。
  **ショット側は消さない**（過去の記録として正しい）。CELLモードの並べ替えは
  `frameIdx` の昇順グループとして扱い、消えたコマは「その時点のインデックス」のまま並べる
- **解像度変更との整合**: 作業解像度を途中で変えると `w/h` が混在する。
  再生・書き出しは**先頭ショットの縦横比**に合わせてレターボックス合成する（引き伸ばさない）
- **WebP非対応環境**: `toBlob` が `image/webp` を返さない場合は `image/jpeg` にフォールバック。
  判定は起動時に1回（1×1キャンバスで `toDataURL('image/webp')` の先頭が `data:image/webp` か）

## 10. 受け入れ基準

- [ ] 既定ONで、描き始めると自動的に記録が増える（`TL ●` 表示）
- [ ] 2秒経っても**描いていなければ増えない**（放置で容量を食わない）
- [ ] ストロークの途中で撮られた中途半端な画が混ざらない
- [ ] 上限枚数を超えると古い順に消え、**枚数と使用量が頭打ちになる**
- [ ] `?ro=1` の別窓では記録されない（本窓の記録に混ざらない）
- [ ] WORK / CELL を切り替えると同じ記録から2通りの映像が出る
- [ ] オニオンON/OFF・下絵ON/OFFが記録に反映され、REFは**絶対に写らない**
- [ ] WebM/MP4 が書き出せ、途中キャンセルできる
- [ ] CLEAR で記録だけが消え、**作画データ（frames/meta）は無傷**
- [ ] 記録ON状態で通常の作画をして、描き味・保存・LIVE連携が従来と変わらない
- [ ] `node tools/check.js` ALL PASS
- [ ] `PIPELINE.md` に ANIMATOR の出口として「タイムラプス動画」を追記
