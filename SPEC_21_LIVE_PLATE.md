# SPEC_21 — LIVE PLATE（仮）「一本化シンプルタイプ」設計・仕様書

作成 2026-09-18。**新規アプリ**（既存5本は触らない）。
「そうしたかったんだったら、最初からこう作ればよかった」を、5本を作って分かったことだけで組み直した設計。
**実装者向け。着手前に §3（スコープ）と §13（発注者判断）を読み、判断が出ているものだけ進める。**

> 名前は仮。MANGA PLATE / DEPTH PLATE と並ぶ「PLATE 家」の3本目として **LIVE PLATE** と置いた
> （描いている場そのものが見せ物＝LIVE、画の単位＝PLATE）。決めるのは発注者（§13-2）。

---

## 0. 3行で

1. **作るのは「5本の機能を足したアプリ」ではなく「1つのデータ（BOOK）に4つの見方（SHEET / DRAW / TAKE / SHOW）」。**
   econte の核心「同期を作らない」を全パイプラインに広げる。これで連携（10ルート・3チャンネル・6形式）が**構造ごと消える**。
2. **画の単位はプレート、コマは線＋塗、時間はフレーム、カメラは透視、フレームは t の純関数。**
   SPEC_19 / SPEC_20 / COMPOSER / OBAN でそれぞれ決着した5つを、新しく作らず**そのまま土台**にする。
3. **見た目と手つきは新 OBAN 規約**（`--acc` 変数・3テーマ・44px ヘッダ・`.qd-*`・下部ドック・NOW 表示）。
   道具はレール6個以内、モードは Wクリック、Undo で戻せるものは聞かない。

---

## 1. いま何が起きているか（診断・2026-09-18 実測）

| 数えたもの | 実測 |
|---|---|
| アプリ本体 | 5本・**37,745 行**（animator 10,180 / econte 10,207 / composer 7,386 / oban 5,912 / manga-plate 4,060） |
| 連携ルート | **10本**（`link-map.html`）。うち econte は未接続（破線） |
| 連携チャンネル | **3本**（`tdr_live` / `tdr_exchange` / `refboard_live`）＋ `?open=` `?id=` ディープリンク |
| 保存形式 | **6種**（ANIMATOR_v1 / PROJECT_v2 / MANGA_BOOK_v2 / ECONTE_PROJECT_v1 zip / OBAN JSON / PALETTE_v1）＋ IndexedDB が4本別々 |
| 「同じもの」の二重実装 | タイムライン（composer / econte / animator の3系統）・カメラの式（composer 透視 / OBAN 撮影台＝**SPEC_12 が「ズレる」と証明済み**）・投げ縄（ラスタ2本＋ベクター1本）・変形（econte だけ）・確認ダイアログ・テーマ |
| 送る側に控える「戻り先」 | `BOOK.links[]`（manga-plate）／ `linkId`（items）／ `plateLayerOf`（OBAN）／ `projectId` 一致（composer）＝**4か所に同じ情報** |

矛盾の根は1つ：**「1作品」が5つのファイルに分かれている**。
分かれているから「送る／取り込む／自動更新／戻る」が要り、そのたびに id・矩形・倍率を控える。
econte が `cuts[]` 1本で BOARD / SHEET / TIMELINE の同期を消したのと同じことを、**作品全体でやる**のが本 SPEC。

---

## 2. 変えない軸（ここを崩すと5本目のアプリになるだけ）

### 2-1. 同期を作らない — データは `BOOK` 1つ

BOOK（§5）が唯一のデータ。SHEET / DRAW / TAKE / SHOW は同じ BOOK の別ビュー。
「送る」「取り込む」「LIVE」「戻り」は**存在しない**。コマの中の絵を描いたら、その瞬間から撮影にもビューアにも乗っている。

### 2-2. フレームは `t` の純関数 — `renderFrame(ctx, book, t, view)` 1本

OBAN の「フレームは P の純関数」（`camAt(P)` / `focusAt(P)`）を作品全体に広げる。
乱数を持たない（画ブレは econte 式＝コマ番号から決まる）。**同じ t は同じ画**。

これ1本で次が全部同じコードになる：ステージのプレビュー／タイムラインのスクラブ／MONITOR／
LIVE 再生／MP4 の非実時間書き出し／連番 PNG／HTML ビューア（関数を文字列で同梱）／決定論 VRT。
**「書き出しとプレビューが違う」バグが構造的に起きない。**

### 2-3. 紙が世界・カメラが出口

- **紙（SHEET）＝ manga-plate の用紙。** コマ割りも素材も絵もこの上に置く（印刷の出口はここから）
- **カメラ（TAKE）＝ 16:9 の窓。** 動画・HTML の出口は**カメラが紙を見た画**（econte の「枠列は bakeRect の内側」と OBAN の「大判の上をカメラが旅する」は同じもの）
- 作業解像度は紙の dpi に縛られない（§11-2）。600dpi の紙を 24fps で動かすのではなく、**カメラの出力解像度で描く**

### 2-4. 手軽さの規約（全モード共通）

| 規約 | 出どころ |
|---|---|
| トップバーは **4 ステップ**だけ。道具は**下部ドック**、詳細は浮きパネル1枚、入出力と連携は ⚙ の中 | 新 OBAN |
| レールの道具は **6個以内**。増やしたくなったら Wクリック／長押しでモードを持たせる | manga-plate v2-6・SPEC_17 |
| **キーの押し方は SPEC_17 の文法**（単押し／2連打／長押し／Shift／バネ）。ボタンとキーは同じ関数 | ANIMATOR 正準 |
| **Undo で戻せる操作は聞かない**。戻せないものだけダイアログ、撤去した分はトーストで知らせる | ROADMAP §5 |
| **ドラッグ中はテキストだけ・離したら全再描画**。`scrollIntoView` は使わない | 新 OBAN §4・§6 |
| 指はナビと UI、ペンは描く面だけ。2本指 UNDO / 3本指 REDO / 4本指 PREVIEW。5本指は割り当てない | SPEC_18 |
| 「いま何をするか」を画面の主役にする（`NOW` バッジ・モード色） | `_Research/OBAN_Desgin` |

---

## 3. 何を軸にして、何をどこまで（スコープ表）

**軸＝「紙の上で描いた絵が、そのまま動いて、そのまま出る」。** 軽くするために、軸から遠いものは持ち込まない。

### 3-1. 持ち込む（コア）

| 領域 | 持ち込むもの | 出どころ |
|---|---|---|
| 紙・コマ割り | 用紙プリセット・多角形コマ（`base ∩ cuts`）・分割線の移動/回転・断ち切り・見開き・読み順 | manga-plate v2 |
| 仕上げ素材 | トーン／集中線／流線／文字（縦書き・アンチック）／ホワイト／境界効果／乗算規則 | manga-plate v2 |
| 描く | ペン（AA なし・筆圧・カーブ・手ブレ補正・入り抜き）／消し／バケツ／投げ縄（塗り・消し・多角形）／トーンインク／パレット＋スポイト／オニオン／REF | animator |
| コマアニメ | セル＝**線＋塗の2レーン**・1本のタイムライン・コマ打ち・並べ替え・REF 帯（`offset`/`×N`） | SPEC_20 |
| 変形 | 投げ縄／矩形で持ち上げ → **箱+rot+warp** → 確定。COPY/PASTE | econte（SPEC_20 §1-7 の移植表） |
| 配置と奥行き | 層の位置・サイズ・**Z（奥⇄手前）**・のりしろ・コマ内マスク／枠の上 | OBAN PLACE ＋ manga-plate `panelId` 規則 |
| カメラ | KF（X/Y/Z/ROT/SCL）・キーごとのイーズ（`ei`/`eo`/`hold`）・CAPTURE・dwell/travel の自動配分・MONITOR・多点ピント | composer（式）＋ OBAN（手つき） |
| 撮影処理 | fx スキーマ v1 のチェーン（mb/dof/olm/diffusion/para/grade/vignette/grain/glitch）・セクション折り畳み | satsuei-fx-kit・OBAN §7-2 |
| 時間 | フレーム基準（24fps・秒+コマ表記）・ワークエリア・マーカー・トリム/オフセット・音 | composer・econte |
| 見せる | 全画面プレビュー／**LIVE**（再生しながら描く＋録画）／スクロール HTML ビューア | econte §9a・EXPORT_WEB・OBAN viewer |
| 出す | HTML（単一・埋め込み）／MP4（WebCodecs 非実時間）／WebM／連番 PNG（合体・線・塗）／ページ PNG（印刷）／BOOK zip | composer・econte・OBAN・manga-plate |
| 読む | α付き PNG・WebP・JPEG／連番（`^(.*?)(\d{3,5})\.` 同名グループ＝自動でセル列）／写真（HEIC・Ctrl+V）／**旧5形式** | composer `addFiles`・econte・§9-1 |
| 検証 | `window.__HARNESS__` 契約・`tools/check.js`・決定論 VRT | SPEC_08 |

### 3-2. あとから足せる形にしておく（任意モジュール・コアに混ぜない）

| 領域 | 方針 |
|---|---|
| BOARD（紙ネームの写真を並べて枠を切る＝econte の前工程） | **P5**。SHEET モードの左ペインに「写真棚」として入る。無くても回る |
| 音連動（BPM・キック・TAP） | **P4** の LIVE で `vj-audio-export-kit` を移植。ファイルは `js/opt/audio.js` に分離 |
| 作画タイムラプス（SPEC_14） | LIVE の録画で代替。要るなら `tl_shot` をそのまま移植 |
| AE JSX（カメラ＋ヌル） | composer の `exportAeJsx()` をそのまま。小さいので P3 に同梱してよい |
| REF BOARD の受け皿 | `refboard_live` の**受信だけ**残す（送り手は別ツールのまま） |
| DEPTH PLATE（2.5D） | **別アプリのまま**。出口が連番 PNG なので、こちらの `seq` 読み込みで受ける（下流改修ゼロの原則どおり） |

### 3-3. 持ち込まない（軽くするために切るもの）

| 切るもの | 理由 |
|---|---|
| `tdr_live` / `tdr_exchange` / `?open=` / `?id=` / `BOOK.links` / `linkId` / `plateLayerOf` / COPY FOR COMPOSER / `obanPanels` | 1 BOOK になれば**全部要らない**。旧ファイルの読み込み（§9-1）だけ残す |
| OBAN の撮影台マルチプレーン式（`lerp(0.7,1.2,depth)` / `planeZoom`） | composer の透視式と**二本立てにしない**。Z の UI は OBAN の「奥⇄手前」のまま、中身は透視（§6-3） |
| econte の 4 ボタン（STUDIO/EDIT/GRID/SINGLE）・`cam[].key` ★ | SPEC_19 で撤去が決まっている。GRID は「セル一覧」として DRAW に吸収 |
| OBAN classic UI・`#cards` | 新 OBAN で撤去済み |
| composer の SOLO / per-track PNG / `null` トラック | 層は紙の上にあるので「トラックの親子」は要らない。親子は**コマ（PANEL）への所属**で表す |
| ぱかぱか層の解像度落とし（`pkRes`） | 転送用の最適化だった。転送が無いので不要 |
| manga-plate の ANIMATOR 往復・のりしろ描き足し | 層はプレートを直接参照する。**はみ出しは FOCUS でそのまま描き足す** |
| animator の作業解像度ラベル／CANVAS SIZE 変更の Undo 履歴クリア | プレートの解像度は作成時に決まり、あとから変えない（§11-2） |

---

## 4. 画面（新 OBAN の骨格に econte の配置を載せる）

```
┌ #bar ─────────────────────────────────────────────────────────────────────┐
│ ◐ LIVE PLATE   01 SHEET › 02 DRAW › 03 TAKE › 04 SHOW   [NOW: 02 DRAW]   …  詳細 ⚙ ⛶ HOME │
├──────────┬────────────────────────────────────────────────────┬────────────┤
│ #side-l  │ #stage                                             │ #side-r    │
│ 素材棚    │   紙（SHEET）／FOCUS（プレート全面）／カメラ窓（TAKE）  │ SHEETS     │
│ (写真・   │                                                    │ 一覧・尺    │
│  取込済)  │                                     ┌ #mon 16:9 ┐ │ ◆Items     │
│ ≡で開閉  │                                     └───────────┘ │ ≡で開閉    │
├──────────┴────────────────────────────────────────────────────┴────────────┤
│ #timeline  ▸SHEET │ C1 ████ │ C2 ██ │ C3 ██████ │ …            ← 紙の列＝時間（econte）│
│            ▸TAKE  │   ◆    ◆      ◆        ◆                   ← カメラ KF（composer）│
│            ▸REF   │ ■ 参照 ×2 ───┤                             ← 帯（SPEC_20）        │
│            線 ●🔒 │[thumb][thumb][  thumb  ][ ]…                ← 選択プレートのセル    │
│            塗 ●🔒 │[ ▬ ][   ][   ▬   ][ ]…                                            │
├───────────────────────────────────────────────────────────────────────────┤
│ #dock   （モードごとの道具。OBAN の renderDock() と同じ作り）                       │
└───────────────────────────────────────────────────────────────────────────┘
   #qe（詳細・浮き）  #fx-modal  #set-ovl  #cf-modal  …… OBAN §2 の骨格そのまま
```

### 4-1. 4 ステップ（トップバー）

| # | ステップ | 主役の操作 | ステージに出るもの | ドックの中身 |
|---|---|---|---|---|
| **01 SHEET** | 割る・置く | コマ割り／層を置く／仕上げ素材／文字 | 紙（全面・トンボ・内枠） | `SEL DIV EDIT TEXT TONE 白` の6レール＋選択物の SIZE/Z/のりしろ |
| **02 DRAW** | 描く | 選択した層のプレートを **FOCUS** で描く（線/塗レーン・セル） | プレート全面（紙は薄く透かす＝econte のトレース透かし） | `PEN ERASE FILL SEL EYE REF` ＋ サイズ・色・レーン |
| **03 TAKE** | 撮る | カメラ KF・ピント・FX・紙の尺と繋ぎ | カメラ窓（16:9）＋紙は薄く | `CAPTURE ◎FOCUS FX 繋ぎ` ＋ dwell/ease/DOF 定規 |
| **04 SHOW** | 見せる・出す | 全画面プレビュー／LIVE／書き出し | 出力そのもの（UI は消える） | `▶ PLAY ● REC` ＋ 出口4つ |

- キー `1` `2` `3` `4` で切替（OBAN と同じ）。**ステップは順路であって関門ではない**。どこからでも行き来できる
- `NOW` バッジ＝いまのステップ。ステップの色は**変えない**（テーマ1色で通す。OBAN が amber を廃止した判断と同じ）
- 01 と 02 の往復が一番多い。**層を Wクリック／Wタップ＝02 DRAW の FOCUS へ**、**Esc＝01 へ戻る**（SPEC_19 §1-3 の FOCUS と同じ手つき）

### 4-2. 左右のペインは「棚」と「一覧」だけ

- `#side-l` 素材棚：取り込んだ画像・連番・写真（BOARD の写真＝P5）。**ドラッグで紙に置く**と層になる
- `#side-r` SHEETS：紙の一覧（サムネ・尺・⚠）。manga-plate の PAGES と econte の SHEET パネルを1つに。
  行の下に ◆Items（選択中の紙のコマ欄＝manga-plate v2-9 の並び）
- どちらも `≡` で畳める。iPad 縦では既定で畳む

### 4-3. タイムラインは1本・行は4種

composer の骨格（ルーラー・ワークエリア・マーカー・スナップ・Shift 複数選択・トリム）に、econte の「紙＝クリップ」と SPEC_20 の「レーン」を載せる。

| 行 | 中身 | 掴むと |
|---|---|---|
| SHEET | 紙が順に並ぶ（幅＝尺）。繋ぎ（cut/fade/wipe）は境界の小さな記号 | 右端ドラッグ＝尺、上下ドラッグ＝並べ替え、境界タップ＝繋ぎ |
| TAKE | 選択中の紙のカメラ KF ◆（形は composer 合わせ：菱形/角丸/丸/灰四角） | ドラッグ＝時刻、Wクリック＝緩急、`C`＝いまの窓で CAPTURE |
| REF | 参照の帯（SPEC_20 §1-5） | 横ドラッグ＝`offset`、右端＝`×N` |
| 線 / 塗 | 選択中の層のプレートのセル（SPEC_20 §1-4） | タップ＝コマ選択＋レーン切替、右端＝コマ打ち |

**行を増やさない。** 層ごとのトラックは作らない（層は紙の上の「◆Items」で選ぶ。composer のトラック一覧は要らなくなる）。
層の `tIn/tOut/tOffset` は詳細パネルの数値（必要なときだけ）。

---

## 5. データモデル（`BOOK` 1つ）

```js
BOOK = {
  ver: 1, name,
  paper: { preset:'B4_600'|'B4_350'|'B5_600'|'SCREEN'|'SCREEN_TALL', w, h, dpi },  // §5-1
  fps: 24,
  out:  { mode:'x1'|'x2'|'long3840'|'custom', long, bleed },   // composer SPEC_11 P7 と同じ
  sheets: [ SHEET ],            // ★ 順序＝時間軸。econte の cuts[] と同じ「唯一のデータ」
  plates: { [id]: PLATE },      // 画の実体プール。層は id で参照（コピーは参照の複製）
  fx: FX_v1,                    // 全体の撮影処理。sheet.fx があれば上書き
  audio: { blob, offset } | null,
  markers: [ { f, label } ],
  ui: { theme, keymap, palette, ... }   // 保存はするが作品ではない（localStorage 相当）
}

SHEET = {                        // 1枚の紙 ＝ 1ページ ＝ 1カット（時間の単位）
  id, name,
  dur,                           // コマ数。take があれば導出（§6-4）。無ければ手入力（既定 48）
  in: { type:'cut'|'fade'|'wipe', dur:0 },   // 前の紙からの繋ぎ（OBAN cover wipe の縮約）
  panels: [ PANEL ],             // manga-plate v2 のまま（base ∩ cuts → poly は毎回導出）。0個＝全面1コマ
  items:  [ ITEM ],              // tone/focus/stream/text/white（manga-plate v2 のまま。layerId で層に所属）
  layers: [ LAYER ],             // 奥→手前順
  take:   TAKE | null,
  fx:     FX_v1 | null,
  shake:  { a0, a1, freq } | null,   // econte §5-C5（乱数を持たない画ブレ）
  bg: 255
}

LAYER = {                        // 「紙の上に置かれた1枚のプレート」＝ OBAN panel ＋ composer track
  id, name, plateId,
  panelId: null | id,            // ★ あり＝コマの中（poly で clip）／なし＝枠の上（manga-plate の1本ルール）
  x, y, w, h, rot,               // 紙座標（プレートの外接矩形）
  z: 0,                          // 奥行き px。0＝紙の面。負＝奥、正＝手前。UI は OBAN の「奥⇄手前」定規（§6-3）
  pad: 1.15,                     // のりしろ（コマの poly より外まで描ける／見える範囲）
  opacity: 1, blend:'normal'|'multiply',
  tIn: 0, tOut: null, tOffset: 0, step: 1,   // 時間（composer トリム／SPEC_20 REF の ×N）
  visible: true, locked: false
}

PLATE = {                        // 画の実体 ＝ ANIMATOR プロジェクト1本（SPEC_20 §1-1）
  id, name, w, h,                // 作業解像度（§11-2。作成後は変えない）
  cells: [ { id, dur, line: Blob|null, fill: Blob|null } ],   // 1枚＝静止画。fill は最初の塗りまで null
  loop: true,
  src: 'draw' | 'import' | 'seq',   // 由来（取り込んだ α PNG／連番は src で分かる。再取込の手がかり）
  refs: [ { plateId|blob, color, offset, step, x, y, scale, opacity, locked } ],  // SPEC_20 §1-5
  lanes: { line:{visible,locked,opacity}, fill:{...} }
}

TAKE = {                         // カメラ（1枚の紙に1本）
  kf: [ { f, x, y, z, rot, s, ei, eo, hold, dwell, focus } ],   // f＝紙内フレーム（composer 正準）
  auto: true,                    // ★ true の間は dwell/travel から f を自動配分（OBAN buildTake）。f を手で動かした瞬間 false
  dof: { on, pts:[{kf, f}], range, maxBlur, pull },             // OBAN §DOF 多点そのまま
  texts: [ ... ]                 // 読み文字の表示窓（OBAN V2-D `texts[].kf`）は ITEM.text 側に持つ（§7-1）
}
```

### 5-1. 用紙プリセット

| preset | 寸法 | 用途 |
|---|---|---|
| `B4_600` / `B4_350` / `B5_600` | manga-plate と同じ mm×dpi | 印刷の出口があるとき |
| **`SCREEN`**（新・既定） | 3840×2160（16:9・FIX） | モーションコミック主導。1枚＝1画面 |
| `SCREEN_TALL` | 3840×6480（縦3画面） | 縦スクロール。カメラが下へ旅する |

**紙の px は「世界の座標」であって作業解像度ではない**（§11-2）。B4_600 でも重くならない。

### 5-2. 旧形式 → BOOK の対応（読み込みだけ。書き戻さない）

| 旧 | 変換 |
|---|---|
| ANIMATOR_v1 JSON（`cells[].image` / `layers`） | PLATE 1本（`layers` があれば line/fill に分離、無ければ line）。紙 `SCREEN` 1枚に層1つ |
| PROJECT_v2（composer） | 紙 1枚。各 track → LAYER（`x,y,s,rot,z` の KF は**先頭キーの値で静止配置**、カメラ track → TAKE）。★ 層の KF アニメは持ち込まない（§3-3）。要る作品は composer で仕上げる |
| MANGA_BOOK_v2 | pages → sheets（panels / items そのまま）。`img` item → LAYER＋PLATE(1セル) |
| ECONTE_PROJECT_v1 zip | cut → SHEET（`cam[]` → TAKE の kf、`dur` → `f`）。`pl[]`/`fr[]` の line/plate → PLATE(1セル・line=線・fill=色) |
| OBAN JSON | panels → LAYER（`depth` → `z`＝§6-3 の写像）、frames → PANEL（quad → poly）、take → TAKE（dwell 保持・`auto:true`）、texts → ITEM.text |

`tdr_exchange` の PROJECT_v1 も同じ関数で読める（ANIMATOR_v1 と同形）。**旧アプリが開いていれば「取り込む」だけはできる**（送りは無い）。

---

## 6. 描画＝1本の純関数

### 6-1. 署名

```js
renderFrame(ctx, book, t, view)
  // t   : 作品全体のフレーム（0 起点・整数）。sheetAt(t) → { sheet, local }
  // view: { mode:'sheet'|'focus'|'camera'|'export', scale, ox, oy, guides, lane, dpr }
```

- `mode:'sheet'`  … 紙の全面＋ガイド（01 SHEET。カメラは枠だけ）
- `mode:'focus'`  … 1プレート全面（02 DRAW。紙は `baseAlpha` で透かす）
- `mode:'camera'` … カメラ窓（03 TAKE のステージ・MONITOR・04 SHOW・書き出し全部）
- `guides` は表示だけ。書き出しでは false（animator の guide-layer と同じ扱い）

### 6-2. 合成順（紙1枚）

```
bg → [層 z 昇順:  (panel clip →) plate(fill → line) with pad ] → items(乗算: tone/focus/stream/frame) → items(文字/白) → 枠線 → fx チェーン
```

- manga-plate の `ITEM_BAND`（画像 0 / 網・線 1 乗算 / 文字・白 2）をそのまま。**白は乗算から外す**（manga-plate §v2-6c の罠）
- 層の `panelId` があれば `dispPoly()` で `clip()`。のりしろ `pad` は clip の**外側まで描いてよい範囲**（動かしても欠けない）
- プレートのセルは `cellAt(plate, local - tOffset, step)`＝ SPEC_20 の `k = floor((t - offset)/step)` と**同じ式を1か所**に置く
- レーンの `opacity` は表示だけ。`mode:'export'` では掛けない（SPEC_20 §1-2）

### 6-3. カメラ（composer の透視式・1本）

```
persp(layer) = F / (F + layer.z - cam.z)        F = 1000（composer PERSP_FOCAL）
pos = comp中心 + (layer.xy - cam.xy · persp) · cam.s,  scale = layer.s · persp,  rot = -cam.rot
```

- **OBAN の「奥⇄手前」定規は UI だけ残す。** 定規の値 `d`(0..1) と `z` の写像は SPEC_12 の COPY FOR COMPOSER と同じ（パン視差係数が OBAN と一致する式）。**式は1本**なので SPEC_12 の「ズレ」は起きない
- `persp < 0`（カメラ面通過）は非表示。AE JSX はこの式で出る（composer `exportAeJsx()`）
- DOF は OBAN 多点（`dof.pts`）：ピント＝`z`。ボケ量は `|layer.z - focusZ(t)| / range → maxBlur`。文字は巻き込まない（OBAN の判断）

### 6-4. 時間

- 作品 t ＝ `Σ sheet.dur` の通し。`sheetAt(t)` で紙と紙内フレーム `local` を引く（econte `cutIndexAt`）
- `sheet.dur`：TAKE があり `auto:true` なら `buildTake()`（dwell/travel 重み配分・travel 下限 0.25）が **f を書く**。無ければ `dur` は手入力
- スクロール HTML：`scrollY / pxPerFrame → t`（EXPORT_WEB）。OBAN の `P` は `t / total` に等しい。**両ビューアの式が同じになる**
- 繋ぎ `sheet.in`：`fade` は前の紙を `in.dur` だけ重ねて α、`wipe` は OBAN cover wipe の1種類だけ（増やさない）

---

## 7. 各ステップの仕様

### 7-1. 01 SHEET（割る・置く）

manga-plate v2 の操作系をそのまま。差分だけ書く。

| 項目 | 仕様 |
|---|---|
| レール | `SEL`(V) `DIV`(D) `EDIT`(P) `TEXT`(T) `TONE`(N) `WHITE`(W/G)。Wクリックのモードは manga-plate §v2-6/6c のまま |
| 層を置く | 素材棚からドラッグ／`＋層`（空プレート。既定はカメラ出力解像度）。**落とした位置のコマに所属**（`panelId`）。コマ外＝枠の上 |
| 層の選択 | SEL 単押しでコマ、Wクリックで層（manga-plate と同じ）。選ぶとドックに `SIZE / Z / のりしろ / 乗算 / 🔒 / ◉` |
| Z 定規 | OBAN の DEPTH 定規（`data-dk="depth"`）。ドラッグ中は数字だけ、離したら再描画 |
| 文字 | ITEM.text（縦書き・アンチック）。**表示窓は TAKE の KF に紐づけず、`tIn/tOut` で持つ**（OBAN `texts[].kf` の「KF 番号追従 `remapKfRefs`」が要らなくなる） |
| ぱかぱか | ITEM の `pk` は廃止。**流線を層にして PLATE の cells を n枚**にすれば同じ（描いた流線が動く。データが1種類減る） |
| 印刷 | ページ PNG（生グレー／網点／カラー・WEB1200/800/原寸）は manga-plate の出口そのまま（04 SHOW の出口4つの1つ） |

### 7-2. 02 DRAW（描く＝FOCUS）

animator の作画面に SPEC_20 を載せたもの。SPEC_19 の FOCUS（1プレート全面）がステージ。

| 項目 | 仕様 |
|---|---|
| 入口 | 層を Wクリック／Wタップ／✎、または `2`。**プレートの原寸が画面いっぱい**。紙は `baseAlpha` で透かす（コマ枠・隣の層が見える＝はみ出しをそのまま描き足せる） |
| レール | `PEN`(P) `ERASE`(E) `FILL`(G) `SEL`(A) `EYE`(Alt) `REF`(R)。押し方は SPEC_17 §2-2（ANIMATOR 正準） |
| レーン | `線/塗` トグル（タイムラインの行タップでも切替）。道具×レーン規則は SPEC_20 §1-2 の表そのまま |
| 塗り | 壁＝線レーン α≥128、`FILL_UNDER_PX` 1px 潜り（SPEC_20 §1-3） |
| セル | タイムラインの 線/塗 行。追加・コマ打ち・並べ替え・オニオン（線だけ・設定で塗も） |
| 変形 | `SEL`：ドラッグ＝投げ縄／Shift＝矩形／Wクリック＝WARP。`箱+rot+warp`・AA 既定 off・`線+塗`・COPY/PASTE（SPEC_20 §1-7） |
| ブラシ | animator の `pressureRadius`（**`pressure===0` を 0.5 に化かさない**）＋筆圧カーブ＋`penSmooth`＋入り抜き `drawLineRadius(r0→r1)`。BRUSH LAB の契約4点（plan は区間1回・`plan.bbox`・`txTouch` に bbox・濃度<1 は1本合成） |
| Undo | **econte の矩形タイル Undo**（`txBegin/txTouch/txEnd`・80手）を採る（animator の全面スナップショットは 12手で止まる）。エントリに `lane` |
| REF | フローティング REF パネル（animator-ref-overlay）＋ REF 帯。**参照＝他のプレート**を選べる（同じ BOOK 内なので ANIMATOR 参照の `+ FROM SAVED` は要らない） |
| セル一覧 | `GRID`（econte 統一解像度シェルフ・SPEC_19 §1-2）を **REF パネルの隣のタブ**で。C.SCRIPT 一覧 PNG もここから |
| 戻る | Esc（優先順位：変形取消 ＞ 投げ縄取消 ＞ 再生停止 ＞ FOCUS を出る）。戻り先の層を選択状態に |

### 7-3. 03 TAKE（撮る）

OBAN の手つき（CAPTURE・チップ・MONITOR・定規）で、composer の式に打つ。

| 項目 | 仕様 |
|---|---|
| ステージ | カメラ窓（16:9）が主役。窓の外の紙は暗く（OBAN と同じ）。ホイール＝視点ズーム／中ボタン＝パン／`Alt+ホイール`＝表示ズーム／`,` `.` `0` |
| CAPTURE | `C`：いまの窓を KF に。挿入位置は選択 KF の後。`←`/`→` で KF 選択、`Ctrl+←/→` で入れ替え（OBAN） |
| dwell / ease | KF チップの `dwell` 数値スクラブ・`ease` セグメント（LINEAR/EASE/HOLD）。詳細で `ei`/`eo` 0〜100（composer） |
| 時間 | `take.auto` の間は dwell/travel から f を配分。タイムラインの ◆ を動かした瞬間 `auto:false`（以後は composer と同じ手動）。`auto` に戻すボタンをチップに |
| ピント | `◎ FOCUS`：定規（`data-dk="focus"`）で `z` を置く／画面から取る（層をタップ）。多点 `dof.pts`。ピン送り `pull` |
| FX | `F`：`#fx-modal`（セクション折り畳み・OFF は畳む）。紙ごとの上書き `sheet.fx` は詳細の `この紙だけ` トグル |
| 繋ぎ | 紙の境界の記号をタップ→ `cut / fade / wipe` と `dur` |
| 画ブレ | econte の `∿`（`shake={a0,a1,freq}`・コマ番号から決まる） |
| MONITOR | `P`：結果窓（`renderFrame` の `mode:'camera'` を小さく）。TAKE 中は常時でよい |
| プレビュー | `Space`：紙の頭から再生（ループ）。4本指タップも同じ |

### 7-4. 04 SHOW（見せる・出す）

| 項目 | 仕様 |
|---|---|
| PLAY | UI を全部消して全画面（`cleanview`）。`Space` 再生／`←→` コマ／`J`/`K` 紙の頭／`Esc` で戻る |
| **LIVE** | `● REC` で録画開始（WebM・実時間・`vj-audio-export-kit` の録画部）。**再生中もペンで描ける**（econte §9a「再生しながら描く」＝ `renderFrame` の `mode:'camera'` 上の座標を `paintCoord()` で紙→プレートへ戻す）。描いた線はその瞬間のプレートのセルに入る＝**描画の過程が作品になる**。`1`〜`9` で紙へジャンプ（VJ のキュー） |
| LIVE の音（P4） | mp3 読み込み・帯域解析・キック検出・BPM／TAP。セルの `step` を BPM に吸着、キックで FX の `amount` をパルス。**録画には音も同梱** |
| 出口 | ① **HTML**（§9-2）② **VIDEO** MP4（WebCodecs 非実時間・econte）／WebM ③ **SEQ PNG** 合体・線・塗・線+塗（SPEC_20 §1-8。ZIP か「フォルダへ1枚ずつ」）④ **PAGE PNG**（印刷・manga-plate）。おまけ：AE JSX・BOOK zip |
| 進捗 | 既存の EXPORT OVERLAY。**同じボタンをもう一度押すと中断**（econte §5-E） |

---

## 8. 操作文法

### 8-1. キー（SPEC_17 の文法・`SHORTCUT_ACTIONS` 登録制・`gKeymap` で再割当）

| キー | 単押し | 2連打 | 長押し | Shift+ | バネ | 効くステップ |
|---|---|---|---|---|---|---|
| `1` `2` `3` `4` | ステップ切替 | — | — | — | — | 全 |
| `V` | SEL（コマ） | コマ ⇔ 層 | — | — | — | 01 |
| `D` | DIV | — | — | — | ✓ | 01 |
| `P` | EDIT（01）／PEN（02） | —／筆圧 ON/OFF | — | — | ✓ | 01・02 |
| `T` | TEXT | 縦 ⇔ 横 | — | — | — | 01 |
| `G` / `W` | WHITE（01）／FILL（02） | —／投げ縄 ⇔ バケツ | 投げ縄消し | 同左へ直行 | ✓ | 01・02 |
| `E` | ERASE | このセルを全消去 | — | — | ✓ | 02 |
| `A` | SEL（変形） | WARP ON/OFF | — | — | — | 02 |
| `L` | 線 ⇔ 塗 レーン | — | — | — | — | 02 |
| `C` | CAPTURE | — | — | — | — | 03 |
| `F` | FX パネル | — | — | — | — | 03 |
| `Space` | 再生／停止 | — | — | — | — | 全 |
| `←` `→` | ±1コマ（Shift=10）／03 では KF 選択 | — | — | — | — | 全 |
| `J` `K` | 前後の紙の頭 | — | — | — | — | 全 |
| `U` | 詳細 開閉 | — | — | — | — | 全 |
| `Ctrl+Z / Y` | Undo / Redo（ステップごとのログ：SHEET＝BOOK ログ／DRAW＝タイル Undo／TAKE＝KF ログ） | | | | | 全 |
| `Esc` | 変形取消 ＞ 投げ縄取消 ＞ モーダル ＞ 再生停止 ＞ FOCUS を出る ＞ 選択解除 | | | | | 全 |

- **同じキーがステップで意味を変えるのは `P` と `G` だけ**（どちらも「そのステップの筆」）。それ以外は増やさない
- `Alt+クリック`＝スポイト（全ステップ・投げ縄は「クリックで始めると多角形」なので衝突しない）
- `TAB`＝レールの左右入替（animator）

### 8-2. iPad（SPEC_18・composer が正準）

| 項目 | 仕様 |
|---|---|
| 指とペン | 指＝ナビ・UI、ペン＝描く面（`touch-action:none` はステージだけ・格下げ禁止） |
| 多指 | 2本 UNDO／3本 REDO／4本 PREVIEW。5本は割り当てない |
| ピンチ | 2本指ピンチ＝ズーム＋パン（manga-plate の `PINCH_SETTLE=80ms`＋`PINCH_SLOP=16px`） |
| 数値欄 | **div スクラブ（Wタップで input を動的生成）**のみ。素の `input[type=number]` を置かない |
| タイムライン | ⠿ ハンドルで並べ替え・トリムは指でも掴める・「1つ押さえたまま次々タップ」で複数選択（composer P1c/P1d） |
| メタ | `apple-mobile-web-app-capable` / `black-translucent` / `viewport-fit=cover` / `--safe-t` `--safe-b` / ⛶ は `canFS` で消す / `<link rel="manifest">` は張らない |
| 判定 | `pointermove` で `!e.buttons` の早期 return を書かない（pointerId で固定） |

---

## 9. 入出力

### 9-1. 読む

| 入口 | 何になるか |
|---|---|
| α付き PNG / WebP / JPEG（D&D・IMPORT・Ctrl+V） | PLATE（1セル・`src:'import'`）＋ LAYER。落とした位置のコマに所属 |
| 連番（`^(.*?)(\d{3,5})\.(png\|webp\|jpe?g)$` 同名4枚以上） | PLATE（cells n枚・`dur:1`・`src:'seq'`）。DEPTH PLATE の連番もここ |
| 写真（HEIC 含む） | 素材棚へ（P5 で BOARD の紙） |
| 音（mp3/wav/m4a/aac） | `book.audio` |
| 旧5形式（§5-2） | BOOK に変換して**新しい紙として追加**（既存の紙は消さない＝IMPORT は追加合成。composer と同じ） |
| BOOK zip | 置き換え（確認あり＝戻せない） |

### 9-2. HTML ビューア（EXPORT_WEB を正準に OBAN の機能を足す）

- 骨格＝ composer `buildViewerHTML()`：`VIEWER_DATA`（画像は WebP/PNG dataURL・ユニーク化・`frameMap`）＋ `renderFrame` を**文字列で同梱**（ロジック改変禁止）
- 足すもの（OBAN viewer から）：縦書きテキスト／EN 字幕 `?sub=0`／クリック FX／DOF／`?fx=0`／ATTRACT（自動走行）／繋ぎ
- スクロール→t（`pxPerFrame`）・マウス微パララックス・チャプター（マーカー）・タッチはネイティブスクロール
- **画像は必ず埋め込み**（OBAN の「同フォルダ参照」はやめる。別 PC で開けないため）。>200MB で確認
- 設定モーダルは `qdRow`/`qdSeg`：感度・パララックス・画質・チャプター・推定サイズ。書き出し後に実サイズをトースト

### 9-3. 保存

- IndexedDB `live_plate_db_v1`：`book`（JSON・Blob 抜き）／`plates`（`{id, cellId, lane, blob}` 行単位＝差分保存）／`assets`（写真・音）
- 差分・debounce（animator）。**Blob が正・ビットマップは遅延デコード LRU**（econte `ensureResident` / `LRU_MAX=8` / `cellCache`）
- `HARNESS_ON` のときは書かない

---

## 10. 良いとこどり表（どこから何を持ってくるか）

**新しく書く前に、この表の関数を探す。** 数式と落とし穴はそのまま、`state` と DOM だけ焼き直す。

| 部品 | 移植元 | 持ってくる関数・約束 | 変えるところ |
|---|---|---|---|
| テーマ・パネル骨格 | `oban-builder.html` | `:root --acc*`／3テーマ `applyTheme`／`makePanelDraggable` `makePanelResizable`／`qdSect qdRow qdSeg` `qd-num data-scr`／`#cf-modal`（Enter=OK・capture でキーを飲む・z 120）／`CVC`＋`syncCanvasColors()`／`renderDock()`／44px ヘッダ `▾ ✕` 28→34 | 既定テーマは **ROUGE**（animator/econte 系の目に合わせる。§13-4） |
| コマ割り | `manga-plate.html` | `rebuildPanel clipHalf splitPanels applyCut mergePanel sortPanels dispPoly gapFor outToPaper`／`spreadSlots worldW evPt`／`PAPER_PRESETS paperOf` | `SCREEN` プリセット追加 |
| 仕上げ素材 | `manga-plate.html` | tone/focus/stream の描画・`tonizeImage`（3分割）・`edgeSprite`・`ITEM_BAND`・`INK_MULTIPLY`・縦書き（`document.fonts.load`）・`pruneEmptyText`・芯くずし `core` | `pk` 廃止（§7-1） |
| ペン・塗り | `animator.html` | `fillCircleRows`／`pressureRadius`（0 を化かさない）／`applyPressureCurve`／`penSmooth`／`drawLineRadius`／`floodFill`／`lassoFillPolygon`／`buildTone` `toneOn`／`gPalette`＋Alt スポイト／`getCoalescedEvents`／`KEY_GESTURES`／`stageToast`／モードバッジ 6px | `activeDrawCtx()` にレーン分岐（SPEC_20 §2-2） |
| 矩形タイル Undo | `econte.html` | `txBegin txTouch txEnd txAbort`（`pad = max(r0,r1)`） | エントリに `lane` |
| 変形 | `econte.html` | `FL_WARP_N flLocalWarp flPaint floatLift floatCommit gSelClip toggleSelWarp`（SPEC_20 §2-4） | `imageSmoothingEnabled = state.selAA` のみ |
| REF | `animator.html` | `renderRefLayer` `animTickImg`（**添字の式を1か所に**）・`saveRefs`・REF パネル | 参照先に「他のプレート」 |
| セル一覧 | `econte.html`（SPEC_19） | シェルフ詰め（スカイライン・読み順固定）・`updateCellRes`（面積上限）・`extractPalette` 帯・`exportColorScript` | セル＝プレート |
| タイムライン | `composer.html`（`composer-timeline-kit`） | ルーラー・WA・マーカー・`bezierEaseT`・`getKfValue getTransform`・スナップ `freezeSnapCands`・KF コピペ・トリム `tIn tOut tOffset`・`makeNumField`・`gTap`・⠿ | トラック一覧は無し（§4-3） |
| 紙のクリップ | `econte.html` | `cutIndexAt`／`setCutDur setCutSpan recalcDur`／クリップ右端ドラッグ／上下ドラッグ並べ替え／`renderStudioSync` | cut → sheet |
| カメラの式 | `composer.html` | `PERSP_FOCAL applyCamWrap applyTrackChain drawOneTrack`（`MOTION_COMIC_SPEC` Phase 2）・`exportAeJsx` | 親子なし・カメラ1本 |
| CAPTURE・チップ・定規 | `oban-builder.html` | `buildTake`（dwell/travel）・`camAt`・`focusAt`・`dof.pts`・`pull`・`dkDrag`・`data-dk` 定規・MONITOR `monRender`・VS/VOX/VOY・`Alt+ホイール` | `f` を書く（§6-4）・式は composer |
| FX | スキル `satsuei-fx-kit`・OBAN | fx スキーマ v1・`FX_DEFS+FRAG+switch+default` の4点セット・`FX_SECTS`／`.fx-g .fold`／`FX_FOLD_SEEN` | — |
| 画ブレ | `econte.html` | `shake={a0,a1,freq}`（乱数なし） | — |
| HTML ビューア | `composer.html` `oban-builder.html` | `buildViewerHTML`／`VIEWER_DATA`・ユニーク化・`frameMap`／OBAN viewer の縦書き・字幕・クリック FX・DOF・ATTRACT・`?fx=0`・`</script>` は `S` 変数 | 埋め込み一本化 |
| 動画 | `econte.html` `composer.html` | WebCodecs 非実時間 MP4（econte）／WebM 実時間・連番 ZIP／`showDirectoryPicker` フォルダ書き出し・`out` 解像度＋のりしろ（composer） | — |
| 録画・音 | スキル `vj-audio-export-kit` | mp3 読み込み・帯域・キック・BPM・TAP・WebM 録画 | P4 |
| 読み込み | `composer.html` `econte.html` | `importFiles`（混在 OK）・連番集約 `addFiles`・HEIC `createImageBitmap→heic2any`・Ctrl+V | 旧5形式の変換（§5-2） |
| 保存 | `animator.html` `econte.html` | 差分 debounce／`ensureResident evictLru requestResident cellCache`／`encodeCut`（不透明なら JPEG） | 行＝セル×レーン |
| iPad | `composer.html`（SPEC_18 P1） | メタ4点／`makeNumField`／`.tl-drag-handle{touch-action:none}`＋`dhPid`／`gTap` 2・3・4本／ピンチ猶予（manga-plate） | — |
| 検証 | `verify/`・`tools/check.js` | `window.__HARNESS__` 契約（`api.step()`・決定論）・VRT | check.js を複数ファイル対応（§11-1） |

---

## 11. ファイル構成と軽さ

### 11-1. 「1フォルダ・ビルド無し・複数ファイル」

単一 HTML（5本合計 2.1MB・37k行）を1本にすると **Claude が全文を読めない・差分編集の的が大きすぎる**（`token-economy` の原則に反する）。
一方でビルド（Vite）は「開けば動く」を壊す。中間を取る：

```
live-plate/
  index.html          ← DOM と <script src> の列だけ（~600行）
  css/theme.css       ← :root / 3テーマ / 器（OBAN §1 をそのまま）
  css/app.css         ← レイアウト・パネル・ドック・タイムライン
  js/core/model.js    ← BOOK/SHEET/LAYER/PLATE/TAKE・migrate・旧形式変換
  js/core/render.js   ← renderFrame（純関数）・カメラ式・合成順
  js/core/time.js     ← sheetAt・buildTake・cellAt・イーズ
  js/core/history.js  ← ステップ別 Undo（BOOK ログ／タイル Undo／KF ログ）
  js/core/store.js    ← IndexedDB・LRU・差分保存
  js/ui/theme.js  panel.js  dock.js  toast.js  modal.js  numfield.js
  js/input/grammar.js（SPEC_17）  ipad.js（SPEC_18）  keymap.js
  js/mode/sheet.js  draw.js  take.js  show.js
  js/fx/satsuei.js
  js/io/import.js  export-html.js  export-video.js  export-png.js
  js/opt/audio.js（P4）  board.js（P5）
  js/harness.js
  viewer/template.js  ← ビューアの雛形（文字列）
```

- **`<script src>` は type 無しの古典スクリプト**（ES module にしない）。`file://` 直開きでも動き、グローバル1つ（`LP`）に名前空間を切る。
  Aurora VJ と同じ「HTML＋`js/`＋相対パス＝フォルダごと動かす限り壊れない」構成
- `tools/check.js` に **`FILES` の要素が「HTML＋その `<script src>` 列」を1単位として検査するモード**を足す（P0 の仕事）。
  id 配線・未参照関数はファイル横断で見る
- **1ファイル 2,000 行を上限**の目安に。超えたら分ける（読める単位を守る）
- 外部依存：Google Fonts・JSZip（CDN）のみ。three.js は持ち込まない（DEPTH PLATE は別）

### 11-2. 解像度と重さの方針（数字で守る）

| 何を | 方針 | 根拠 |
|---|---|---|
| 紙 | mm×dpi の**座標系**として持つだけ。紙全面のビットマップは作らない | manga-plate は 5433×7559 を「画像1枚ごと」に処理して速い（§v2-5） |
| プレートの作業解像度 | 作成時に決める：**既定＝カメラ出力（`out.long` 基準・1920×1080）**、印刷向けはコマの px。`MAX_AREA = 3840×2160` でクランプ。**作成後は変えない** | animator の可変解像度は Undo 履歴を捨てる操作になっていた |
| セル1枚の RAM | 2048×1152 で 9MB、塗り込みで 18MB（`fill` は遅延確保） | ANIMATOR_HANDOVER 実測 |
| IndexedDB 1セル | 0.42〜0.7MB（圧縮） | 同上 |
| 常駐 | `LRU_MAX = 8` プレート。保護＝FOCUS 中・選択中・プレイヘッド±1 の紙 | econte |
| プレビュー | `renderFrame` は dirty のときだけ。ドラッグ中は `renderQ()`（rAF 間引き）。実測目標：**iPad で 24fps・PC で 60fps** | manga-plate（スライダー 40 発→render 1 回） |
| 書き出し | 非実時間（WebCodecs）。タブを前面にしなくてよい | econte D3 |
| 変形プレビュー | 3.1〜3.4ms／確定 ≤173ms | ECONTE_HANDOVER #8 |
| ビューア | 画像ユニーク化＋WebP 0.8。>200MB で確認 | EXPORT_WEB |

---

## 12. フェーズ（縦に薄く切る＝毎フェーズ「作品が出る」）

| P | 内容 | 完了の条件（これが出たら次へ） |
|---|---|---|
| **P0 骨格** | `index.html`＋`css/`＋`js/core/*`＋`js/ui/*`。BOOK・`renderFrame`・store・テーマ・4ステップの殻・素材棚・**α PNG／連番の取り込み**・SHEET 行のタイムライン・**HTML 書き出し（最小）**・`check.js` 複数ファイル対応・`__HARNESS__` | 画像を落とす → 紙に並ぶ → スクラブで動く → HTML が出て別 PC で開く（＝いまの OBAN 3-A が新アプリで出来る） |
| **P1 SHEET** | コマ割り・断ち切り・見開き・仕上げ素材・文字・層の所属と Z・のりしろ・ページ PNG | manga-plate のページが再現できる。旧 MANGA_BOOK_v2 が読める |
| **P2 DRAW** | FOCUS・線/塗レーン・セル行・オニオン・REF・タイル Undo・変形・セル一覧・SEQ PNG 4択 | 旧 ANIMATOR_v1 が読めて 1px も変わらない（VRT）。塗りが線の下に 1px 潜る |
| **P3 TAKE** | CAPTURE・dwell/ease・`auto`・KF ◆・多点 DOF・FX・繋ぎ・画ブレ・MONITOR・MP4/WebM・AE JSX | 旧 OBAN JSON / PROJECT_v2 / ECONTE zip が読める。ビューアと MP4 が同じ画 |
| **P4 SHOW / LIVE** | 全画面・LIVE（再生中に描く・録画・紙ジャンプ）・音連動 | 5分の演目を録画して WebM が出る。描いた線がセルに残っている |
| P5 BOARD | 写真棚・CUT 枠で紙を切る（econte 前工程） | 紙ネーム写真 → 紙列 → HTML まで1本 |

- **P0 と P1 の間で1度見せる**（骨格の見た目・ドックの高さ・iPad 縦）。以降は各 P の頭で前 P を実機で触ってから
- P2 と P3 は独立（同時進行可）。P4 は P2・P3 の後。P5 は任意
- 各 P の完了報告には §12-1 の型で**動作チェック表**を付ける（⚠️未確認 のまま完了と言わない）

### 12-1. 動作チェック表（P0 の例。各 P で同じ型を作る）

| パラメータ／操作 | 期待される変化 | 有効になる条件 | 結果 |
|---|---|---|---|
| α PNG を D&D | 落とした位置に層。`plates` に1本 | 常時 | ⚠️ |
| 連番4枚以上を D&D | 1層・cells n枚。スクラブでコマが替わる | 同名グループ | ⚠️ |
| SHEET 行の右端ドラッグ | `dur` が変わり総尺が更新 | 常時 | ⚠️ |
| `1`〜`4` | ステップ切替・`NOW` 移動・ドックの中身が替わる | 常時 | ⚠️ |
| テーマ 3種 | `--acc` 系が全 UI に効く。既定 ROUGE | ⚙ | ⚠️ |
| HTML 書き出し | 別 PC の `file://` で開き、スクロールで同じ画 | 常時 | ⚠️ |
| リロード | BOOK が IndexedDB から戻る（Blob 遅延デコード） | 常時 | ⚠️ |
| iPad 縦 | 左右ペインが畳まれ、ステージが触れる。⛶ が消える | `pointer:coarse` | ⚠️ |
| `node tools/check.js` | 複数ファイルで構文・配線・重複・未参照 | 常時 | ⚠️ |

---

## 13. 発注者に決めてもらうこと（推奨つき・決まったものだけ進める）

| # | 決めること | 推奨 | 理由 |
|---|---|---|---|
| 1 | **SPEC_19 / SPEC_20 を旧アプリで実装するか、新アプリに直接載せるか** | **新アプリに直接**（旧5本は現状で凍結・使い続ける） | 同じ設計を2回焼くことになる。SPEC_20 P0（データ）と SPEC_19 §1-1（プレート）は本 SPEC の土台そのものなので、こちらで1回で済む。旧アプリの不具合修正は続けてよい。**→ 2026-09-23 発注者の答え：推奨とは逆で「新アプリの前に旧 animator をこのまま極める」。SPEC_20 は P0〜P4 とも旧 animator に実装済み。新アプリで DRAW を作るときは SPEC_20 §7 の実装メモ（履歴の base、`refTickIndex`、`flBakeNearest`、浮いている間は吸い上げない）を移植元にする** |
| 2 | 名前 | **LIVE PLATE** | PLATE 家（MANGA / DEPTH）に並ぶ。「描く場が見せ物」を1語で言える |
| 3 | 既定の用紙 | **`SCREEN`（3840×2160）** | モーションコミック主導。印刷が要る作品だけ B4 |
| 4 | 既定テーマ | **ROUGE** | animator / econte を触ってきた目に合う。OBAN の GLOSS はテーマで選べる（※SPEC_20 §1-9 は 2026-09-19 に「animator の現行デザインのまま・テーマ機構は入れない」へ変わった＝旧アプリ側の判断で、本 SPEC の新アプリには波及しない） |
| 5 | ファイル構成 | **複数ファイル・ビルド無し**（§11-1） | 単一 HTML 2MB は Claude が読めない＝仕様の意味が無くなる |
| 6 | P0 の iPad | **PC 優先・iPad はメタと畳みだけ**。多指・スクラブは P2 で | 骨格を先に固める。SPEC_18 の資産があるので後から載る |
| 7 | 置き場所 | `ANIxOBNxCOM/live-plate/`（このリポジトリ・Pages で iPad から開ける） | index.html の本編カードを 5→6 枚に |

---

## 14. 関連

- `SPEC_19_ECONTE_V5.md` §1-1（プレート）／§1-2（統一解像度セル）／§1-3（FOCUS）— **そのまま本 SPEC の DRAW**
- `SPEC_20_ANIMATOR_LINE_FILL.md` §1〜§2（線＋塗・REF 帯・変形・書き出し 4択）— **そのまま本 SPEC の DRAW／SEQ PNG**。
  **P0 は 2026-09-23 に旧 animator へ実装済み**（§7 に履歴の仕組みと実測）。UI 規約は §1-9 で「現行デザイン」へ変わったので、新アプリの規約は本 SPEC 側で決める
- `OBAN_BUILDER_UI_HANDOVER.md` §1 §2 §4 §7 — UI 規約の正準
- `SPEC_17_INPUT_GRAMMAR.md` ／ `SPEC_18_IPAD_GRAMMAR.md` — 操作文法
- `SPEC_06_SATSUEI_KIT.md` §2 — fx スキーマ v1
- `SPEC_09_MANGA_PLATE.md` §v2-1〜v2-6d — 紙・コマ・素材
- `SPEC_11_COMPOSER_POLISH.md` ／ `MOTION_COMIC_SPEC.md` Phase 2・6 — 時間・カメラ式・イーズ
- `EXPORT_WEB_SPEC.md` ／ `OBAN_BUILDER_HANDOVER.md`（ビューア・DOF・TAKE） — 出口
- `SPEC_12_PARALLAX_TAKE_BRIDGE.md` — OBAN と composer のカメラ式が「ズレる」実測（本 SPEC が式を1本にする根拠）
- `SPEC_08_VERIFY_HARNESS.md` ／ `verify/CLAUDE.md` — 検証
- `ROADMAP.md` §5 — 確認ダイアログの正準
- `_Research/OBAN_Desgin/` — NOW 表示・ゲーム UI の考え方（見た目ではなく「いまやること」を主役に）
- スキル `satsuei-fx-kit` / `composer-timeline-kit` / `animator-brush-ops` / `animator-ref-overlay` / `animator-color-palette` / `floating-panel-kit` / `vj-audio-export-kit` / `single-html-verify` / `token-economy`
