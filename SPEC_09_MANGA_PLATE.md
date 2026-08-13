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

---

# v2 — PAGE / PANEL COMPOSER（2026-08-13 実装済み）

> v1 は「板（素材）を作る」ツールだった。v2 は **原稿用紙とコマ割りが主役**になり、v1 の
> tone/focus/stream は「コマに割り当てる仕上げアイテム」として残っている（描画コードは無改造）。

## v2-1. 用紙（ジャンプ規定・600dpi B4）

`PAPER_PRESETS` / `paperOf()`。mm を dpi で px 化して保持する。

| プリセット | 裁ち落とし | 仕上がり | 内枠 |
|---|---|---|---|
| `B4_600`（既定・モノクロ） | 230×320mm = **5433×7559px** | 220×310mm = 5197×7323px | 180×270mm = 4252×6378px |
| `B4_350`（カラー） | 同 mm・350dpi | 〃 | 〃 |
| `B5_600`（同人誌） | 192×267mm | 182×257mm | 150×220mm |

用紙を切り替えると全ページのコマ・素材が dpi 比で拡縮される（確認モーダルあり）。
トンボ／仕上がり／内枠は `guide` 表示のみで**書き出しに入らない**。

## v2-2. コマ＝多角形。分割は半平面クリップ

- `PAGE.panels[] = {id, poly:[{x,y}...], border, bleed, from}`。初期値は**内枠いっぱいの1枚**
- `splitPanels(pg, targets, px,py, dx,dy)` … 直線で `clipHalf()`（Sutherland–Hodgman）を2回かけ、
  **コマ間隔の半分ずつ内側へオフセット**して2枚にする。斜めも同じ式で通る
- **間隔は線の向きで補間**: `gap = gut.lr*|nx| + gut.tb*|ny|`
  （縦線＝左右の間隔60 ／ 横線＝上下の間隔180 ／ 斜めはその中間）。クリスタ既定値と一致
- 対象は **コマ選択中＝そのコマだけ／未選択＝線が横切る全コマ**（モード切替UIを増やさないための規約）
- `sortPanels()` が読み順（右綴じ＝上から、同じ帯なら右が先）に並べ替える。コマ番号表示がこの順
- `dispPoly()` … `bleed` ONのコマは、**内枠に接している辺だけ**用紙の端まで伸ばす（ブチ抜き）
- `mergePanel()` … 同じ `from` を持つ兄弟、無ければ隣接コマと結合（＝分割を戻す）

## v2-3. 素材とマスク

`PAGE.items[]` は `img / tone / focus / stream / frame` の共通配列。`panelId` が要（かなめ）:

- **`panelId` あり** … そのコマのポリゴンで `clip()` してから描く → **枠の下**（はみ出しがカットされる）
- **`panelId` なし** … 枠線より**上**に描く → 擬音・飛び出し

この1本のルールだけで「コマ内の絵」と「上に乗せる擬音」が分かれる（フラグを増やさない）。

- **境界効果**: `edgeSprite()` がアルファを2リング×24方向にずらして描き `source-in` で単色化 → 本体の下に敷く。
  キャッシュキーは呼び出し側が渡す（網点化後は canvas で `.src` が無いため **tag 引数が必須**）
- 画像は `MATSRC{srcId→dataURL}` に持ち、**undo履歴には積まない**（`snapshot()` は BOOK のみ）
- 保存は **IndexedDB `manga_plate/book/'current'`**（dataURL が localStorage に乗らないため）。
  v1 の `localStorage['manga-plate']` は初回起動時に1ページ目の items へ引き継ぐ

## v2-4. 連携（受け側の改修ゼロ）

**既存の共通配管にそのまま乗る**のが設計の要。新しい語彙を作っていない。

| 方向 | 手段 | 受け側 |
|---|---|---|
| → ANIMATOR REF | `exPut()` で `tdr_exchange` に `PROJECT_v1`（1セル＝コマ画像）＋ `tdr_live` の `project-update` | ANIMATOR `REF ▸ ＋FROM SAVED`（`exGetAll()` を読む既存経路） |
| ← ANIMATOR 取込 | `exGetAll()` から選んで画像素材化 | — |
| ← 自動更新（往来） | `tdr_live` の `project-update` を購読し、`item.linkId === projectId` の素材を差し替え | — |
| → COMPOSER | `exPut()` 後 `composer.html?id=<pid>` | COMPOSER 既存の `?id=` ディープリンク |
| → OBAN | `exPut()` ＋ `project-update` | OBAN `＋FROM ANIMATOR`（`apCandidates()` が EX_DB と `gApSeen` を併せて見る） |

- 起動時に `composer-hello` を投げて ANIMATOR 側の `gLiveActive` を立てる（composer/OBAN と同じ作法）
- `BOOK.links[projectId] = {pageId, panelId, box, scale, ox, oy, w, h}` を送信時に記録し、
  戻りは `placeLinked()` が `scale = 1/lk.scale` でコマにピタリ収める（**送った矩形にピクセル一致で戻る**）
- 送信解像度が縦長コマと合っていないと画素が無駄になるため、`updateLinkNote()` が**使用率%**を出し、
  55%未満なら `コマ比` を促す（`fitLinkToPanel()` = 長辺2048でコマ比に合わせる）

## v2-5. モアレ対策（グレー→網点）

`tonizeImage(img, it)` … **画像1枚ごと**の変換で、ページ全体は舐めない（作業解像度が小さいので速い）。

1. 画素を輝度で3分割 — `l<0.10`＝線画は**原画のまま**残す／`0.10≦l≦0.94`＝中間調を網点対象／`l>0.94`＝白
2. 中間調の被覆率からセルごとにドット半径を決めて 45° 格子で打つ（セル＝`dpi/lpi/scale`）
3. `destination-in` で中間調マスク外へはみ出さないようにし、線画を上から戻す

**線画とトーンが同じ絵に混ざっていても線が潰れない**のがこの3分割の狙い。
既定 50線（Gemini 資料の「WEBは50線が最も安全」に合わせた）。書き出しの階調は
**生グレー（既定・モアレ皆無）／網点化／カラー**の3択。`網点プレビュー` で画面でも確認できる。

## v2-6. まだ無いもの（意図的）

- 制御点の**移動**（v2は選択＋頂点表示のみ。ユーザー確認済みのスコープ）
- 手描き・ラスタブラシ（ANIMATOR の領分。v1 の大原則を維持）
- テキスト組版（擬音は手描き＝MOTION_COMIC_SPEC の思想どおり）
- ZIP一括書き出し（依存ゼロを保つため `<a download>` の連続で代替）

## 9. 決定事項（2026-07-16 実装済み）

1. ファイル名: `manga-plate.html`（確定・実装済み。P0〜P3 一括実装）
2. `tone` は「ドット径(dot)＋間隔(gap)」指定＋%プリセットチップ（10/20/40/60%・被覆率readout付き）で実装
3. P4（OBAN枠線）は先行実装済み: `frames[].line={on,w}`・チップLINEトグル・ビューア同期・migrate補完
4. 実装メモ: focus の飛び出し配置用に、キャラ側は elemBounds=r1×2 でヒット判定。undo は snapshot方式(上限60)。
   REF画像は localStorage に保存しない（セッション限り・プレースホルダなしで単純に消える）
