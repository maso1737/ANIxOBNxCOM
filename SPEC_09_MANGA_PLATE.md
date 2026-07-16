# SPEC 09 — MANGA PLATE（パラメトリック漫画素材ツール）【ドラフト】

> **この仕様書単体で実装可能なように書いてある。** 行番号は変動するため**必ずシンボル名でgrep**。
> 実装前に読むもの: `oban-builder.html`（`frames[]` / `quad` / `migrate` / `viewerHTML`）、
> `animator.html`（`gPalette` / MANGAプリセット=MOTION_COMIC_SPEC Phase 4）、`PIPELINE.md`、
> スキル `kinetic-stage-design-system` / `animator-ref-overlay`（REF下敷きの正準）。

## 0. 目的と大原則

- **目的**: コマ枠線・スクリーントーン・スピード線を**パラメータで後から調整できる**静的素材（＝板）として生成し、
  透過PNGで OBAN / COMPOSER に渡す。クリスタのトーン/集中線ツールの超軽量版
- **役割分担（変えないこと）**:
  - **animator** = 動く手描き素材（キャラ・目パチ・なびき・手描きオノマトペ）。改修ゼロ
  - **MANGA PLATE** = 静的なパラメトリック板（トーン・線・枠）。**手描き機能は持たない**
  - **OBAN / COMPOSER** = 枠マスク・コマ内外の重ね（飛び出し）・タイミング。素材の中身に関知しない
- **正はパラメータJSON**。ラスタ化は書き出し時のみ。単一HTML・依存ゼロ・`file://` 直開きOK・iPad Safari対応
- タッチは**鳥山明程度**: 大きめドットのトーン数種＋集中線/流線＋矩形枠。種類を増やして創作の圧にしない
- UI は KINETIC STAGE デザインシステム準拠。確認は modalConfirm（native confirm 禁止）

## 1. しないこと（v1スコープ）

- 手描き・ラスタレイヤー・ブラシ（animatorの領分）
- テキスト組版・オノマトペ生成（手描きが正。MOTION_COMIC_SPEC の思想どおり）
- グラデトーン・柄トーン・多角形/円マスク・アニメーション再生機能
- 撮影処理（fx）。トーンをシェーダでやる案は**将来メモ（§7）**へ退避

## 2. データモデル

```js
PLATE = { version:1, name, w:1920, h:1080, bg:'transparent'|'#F5F1E8',
  elems:[ ELEM, ... ] }   // 配列順=重ね順（後=前面）。localStorage('manga-plate') 自動保存

ELEM 共通: { id, type, name, visible:true, x, y, rot }   // 座標はPLATE px・中心基準
type別:
  'frame'  … { w, h, lw:8, color:'#000' }                          // 矩形枠線（塗りなし）
  'tone'   … { w, h, dot:12, gap:22, density:0.4, angle:45,        // 網点。dot=ドット径px
               color:'#000', shape:'dot'|'square' }                //   大ドット既定=モアレ耐性
  'focus'  … { r0:120, r1:900, count:90, lw:5, taper:0.9,          // 集中線。r0=白場半径
               jitter:0.35, seed:1, color:'#000' }                 //   jitter=長さ/角度ゆらぎ
  'stream' … { w, h, count:24, lw:4, taper:0.8, jitter:0.3,        // 流線（平行スピード線）
               seed:1, color:'#000' }                              //   rotで方向を決める
```

- **seed 決定論**: 同じseedなら同じ線。乱数は `mulberry32(seed)` 等の自前PRNG（`Math.random` 禁止 →
  `single-html-verify` の決定論契約に乗せる）
- REF下敷き: `ref:{ image:dataURL|null, opacity:0.4, x,y,scale }`。**書き出しに含めない**（animatorのREFと同じ思想）。
  実装は `animator-ref-overlay` スキルの canon を移植（ドラッグ移動/ホイール拡縮/原寸中央）

## 3. 画面と操作（触ってすぐわかる、が最優先）

- 左=キャンバス（`#stage`。パン=空白ドラッグ / ズーム=ホイール / 選択ELEMはハンドルで移動・回転・リサイズ）
- 右=ELEMリスト（並べ替え=重ね順、👁トグル、＋ボタンで type 選択追加、選択で下にパラメータスライダー群）
- パラメータ変更は**即時再描画**（プレビューは表示解像度、書き出し時のみフル解像度レンダ）
- `Ctrl+Z` undo（commit方式、スライダーは300ms合体 — OBANの `commitD` と同型）/ `Esc` 選択解除
- COPY/PASTE PLATE: PLATE JSON のクリップボード入出力（file://拒否時は prompt窓フォールバック — OBANと同じ）

## 4. 出口（ここが本体）

| 出力 | 内容 | 用途 |
|---|---|---|
| **PNG (elem別)** | 選択ELEM 1つ＝透過PNG 1枚 | OBANで「トーンはコマ内・集中線は飛び出し」と別配置 |
| **PNG (全体)** | 全ELEM合成の透過PNG | 1枚もの |
| **PNG ×N SEEDS** | focus/stream を seed+1,+2,… で N枚（既定3）連番書き出し `name_001.png…` | OBANにD&D→自動seqパネル→**loopで線がバタつく**演出（4枚以上で自動グループ化される点に注意→既定は4枚推奨） |
| **PLATE JSON** | パラメータそのもの | 再編集・受け渡しの正 |

- 書き出し倍率 `SCALE ×1/×2`（§6 モアレ対策）。ファイル名は `name_elem.png` / `name_full.png`
- ダウンロードは `<a download>` 方式（OBANの `viewerHTML` ダウンロードと同型）

## 5. 実装フェーズ

### P0 — 骨格＋frame＋PNG書き出し
単一HTML雛形（KINETIC STAGE準拠）・PLATE/ELEMモデル・localStorage自動保存・ELEMリスト・
`frame` エレメント・キャンバス操作・PNG(elem別/全体)。**この時点で「枠線をパラメトリックに引いて出す」が完成**

### P1 — tone
網点レンダラ（オフスクリーンにドット格子→angle回転→ELEM矩形でクリップ）。density はドット径×格子比で近似。
プリセットチップ: 10% / 20% / 40% / 60%（MANGAパレットのグレー4段と対応する濃度）

### P2 — focus / stream
seed決定論の線群レンダラ。taper=先細り（線幅を根元→先端で補間）。プリセットチップ: 集中線(標準/密) / 流線(標準/太)

### P3 — REF下敷き＋COPY/PASTE PLATE＋×N SEEDS書き出し

### P4 — OBAN FRAME 枠線（**oban-builder.html 側の小改修**）
- `frames[]` に `line:{on:false, w:8}` を追加（`migrate()` が欠損補完）。ONなら **quad の4点をそのままstroke**
  （マスクと枠線が絶対にズレない、が狙い。色は黒固定）
- チップに `LINE` トグル＋太さ。`viewerHTML()` にも同じ描画を複製（ビルダー/ビューア完全同期の規律どおり）
- 手描きラフ枠が欲しいコマは、MANGA PLATE か animator の枠PNGを最前面 ord のパネルで上書き（機能追加不要）

### P5（任意・将来）— COPY FOR COMPOSER
elem別PNGを dataURL 埋め込みの IMAGE_v1 疑似JSONとしてクリップボードへ（composer `importImageFile` の経路に乗せる）。
v1では PNG 書き出し→D&D で十分なので急がない

## 6. リスクと判断メモ

- **モアレ**: トーンを作業解像度で焼いた後に COMPOSER/OBAN のカメラで拡縮すると干渉縞。対策は
  ①既定を大ドット（dot≥10px）にする ②`SCALE ×2` で焼いて配置側で縮小 ③気になる場合は最終解像度で焼き直し。
  仕様としては①＋②で十分（鳥山タッチの大ドットは元々モアレに強い）
- **白黒前提**: color は既定 `#000`。MANGAパレット（MOTION_COMIC_SPEC Phase 4 の10色）とホワイト `#FFF` だけ
  パレットチップで出す。フルカラーピッカーは置かない（圧にしない）
- **focus の中心**: コマの中心と一致させたいケースが多い → PLATE の w/h を OBAN のコマ比に合わせて作る運用。
  自動連携（quadを読んで中心を合わせる等）は**やらない**（ツール間の結合を増やさない）
- **check.js**: 対象4ファイル→5ファイルに `manga-plate.html` を追加。`PIPELINE.md` の表に入口/出口を追記。
  ランディング `index.html` への追加は OBAN 追記と同時でよい

## 7. 将来メモ（v1ではやらない）

- トーンを satsuei-fx のハーフトーンシェーダにする案（最後まで無劣化調整できるが、fxはツール横断の
  グローバルチェーンでありELEM単位の適用に合わない。必要になったら SPEC_06 側で検討）
- tdr_live 参加（PLATE更新→OBAN自動反映）。静的素材は再D&Dで足りるため見送り
- グラデトーン・カケアミ・ベタフラッシュ

## 8. 受け入れ基準

- [ ] `frame`/`tone`/`focus`/`stream` を各1つ置き、パラメータをスライダーで変えると即時反映される
- [ ] elem別PNGが透過で書き出され、OBANにD&Dしてコマ内（FRAME子）/コマ外（ルート）に配置できる
- [ ] `focus` の ×4 SEEDS 書き出し→OBANで自動seq化→loopで線がバタつく
- [ ] 同じ PLATE JSON を PASTE すると**ピクセル一致**で再現される（seed決定論）
- [ ] リロード後に localStorage から完全復元（REF画像は除く。プレースホルダ表示）
- [ ] OBAN: FRAME の LINE ON で quad に沿った枠線が出て、ビューア書き出しでも同一に見える。OFF時は従来と完全不変
- [ ] `node tools/check.js` ALL PASS（manga-plate.html 追加後）
- [ ] `PIPELINE.md` 更新（MANGA PLATE の行を追加、OBAN の入口に「MANGA PLATE PNG」を追記）

## 9. 決定事項（2026-07-16 実装済み）

1. ファイル名: `manga-plate.html`（確定・実装済み。P0〜P3 一括実装）
2. `tone` は「ドット径(dot)＋間隔(gap)」指定＋%プリセットチップ（10/20/40/60%・被覆率readout付き）で実装
3. P4（OBAN枠線）は先行実装済み: `frames[].line={on,w}`・チップLINEトグル・ビューア同期・migrate補完
4. 実装メモ: focus の飛び出し配置用に、キャラ側は elemBounds=r1×2 でヒット判定。undo は snapshot方式(上限60)。
   REF画像は localStorage に保存しない（セッション限り・プレースホルダなしで単純に消える）
