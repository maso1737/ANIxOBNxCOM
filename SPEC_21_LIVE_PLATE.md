# SPEC_21 — LIVE PLATE「一本化シンプルタイプ」設計・仕様書

作成 2026-09-18。**新規アプリ**（既存5本は触らない）。
「そうしたかったんだったら、最初からこう作ればよかった」を、5本を作って分かったことだけで組み直した設計。
**実装者向け。着手前に §3（スコープ）を読むこと。§13（発注者判断）は2026-09-24に全7件確定済み。**
**P0（骨格）と P1（SHEET＋BOOK zip）は 2026-09-24、P2（DRAW）は 2026-09-26 に `live-plate/` へ実装済み。決めたこと・変えたこと・動作チェック表は §15（P0）・§16（P1）・§17（P2）。**

> MANGA PLATE / DEPTH PLATE と並ぶ「PLATE 家」の3本目として **LIVE PLATE** と置いた
> （描いている場そのものが見せ物＝LIVE、画の単位＝PLATE）。名前は2026-09-24に確定（§13-2）。

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

## 13. 発注者に決めてもらうこと（2026-09-24 全7件確定。以下は確定内容の記録のみ・実装は別ターン）

| # | 決めること | 推奨（起草時） | 理由 | 確定（2026-09-24） |
|---|---|---|---|---|
| 1 | **SPEC_19 / SPEC_20 を旧アプリで実装するか、新アプリに直接載せるか** | **新アプリに直接**（旧5本は現状で凍結・使い続ける） | 同じ設計を2回焼くことになる。SPEC_20 P0（データ）と SPEC_19 §1-1（プレート）は本 SPEC の土台そのものなので、こちらで1回で済む。旧アプリの不具合修正は続けてよい。**→ 2026-09-23 発注者の答え：推奨とは逆で「新アプリの前に旧 animator をこのまま極める」。SPEC_20 は P0〜P4 とも旧 animator に実装済み。新アプリで DRAW を作るときは SPEC_20 §7 の実装メモ（履歴の base、`refTickIndex`、`flBakeNearest`、浮いている間は吸い上げない）を移植元にする** | **旧5本は使い続ける。直感的で手に馴染む理想のアプリへ向けて、旧アプリ（SPEC_19/20）はこのまま極め続ける。新アプリ（LIVE PLATE）と並行させ、両アプリで見つかった良いところは互いに反映しながら進化させる**（手間は増える前提で合意）。SPEC_19/20は現時点で予定フェーズ実装済み（SPEC_19 P0〜P3・SPEC_20 P0〜P4+§8） |
| 2 | 名前 | **LIVE PLATE** | PLATE 家（MANGA / DEPTH）に並ぶ。「描く場が見せ物」を1語で言える | **LIVE PLATE で確定**（「描く場が見せ物」に合意） |
| 3 | 既定の用紙 | **`SCREEN`（3840×2160）** | モーションコミック主導。印刷が要る作品だけ B4 | **`SCREEN`（3840×2160）で確定**。印刷は現状想定しない（シンプルにモーションコミック主導のみでよい） |
| 4 | 既定テーマ | **ROUGE** | animator / econte を触ってきた目に合う。OBAN の GLOSS はテーマで選べる（※SPEC_20 §1-9 は 2026-09-19 に「animator の現行デザインのまま・テーマ機構は入れない」へ変わった＝旧アプリ側の判断で、本 SPEC の新アプリには波及しない） | **SPOTLIGHT で確定**（推奨のROUGEではない）。**他テーマは当面実装しない**（ボタンを減らす方針。テーマ切替が要るとなったら改めて依頼） |
| 5 | ファイル構成 | **複数ファイル・ビルド無し**（§11-1） | 単一 HTML 2MB は Claude が読めない＝仕様の意味が無くなる | **複数ファイル・ビルド無しで確定**。個々のファイルは今までどおり素の html でよい |
| 6 | P0 の iPad | **PC 優先・iPad はメタと畳みだけ**。多指・スクラブは P2 で | 骨格を先に固める。SPEC_18 の資産があるので後から載る | **PC専念で確定**。iPad Pro 13 でも使うのは本仕様のうちだが、iPad側の操作はまだ随時発見・調整が入っている最中（SPEC_19/20の旧アプリ側）なので、そちらの知見が固まってから LIVE PLATE の iPad 仕様を統一する |
| 7 | 置き場所 | `ANIxOBNxCOM/live-plate/`（このリポジトリ・Pages で iPad から開ける） | index.html の本編カードを 5→6 枚に | **`ANIxOBNxCOM/live-plate/` で確定** |

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

---

## 15. P0 実装メモ（2026-09-24）

置き場所 `live-plate/`。ファイルごとの役割と約束は [live-plate/CLAUDE.md](live-plate/CLAUDE.md)。
**範囲は §12 の P0 だけ**（§12「P0 と P1 の間で1度見せる」に従った）。P1 以降の道具はドックに**押せない札付き**で場所だけ出してある。

### 15-1. 仕様に書いていなかった／食い違っていたので、推奨で決めたこと

| # | 項目 | 決めたこと | 理由 |
|---|---|---|---|
| 1 | テーマ | **SPOTLIGHT のみ・切替機構なし**。§10 の「既定 ROUGE」・§12-1 の「テーマ 3種」は §13-4 で上書き | 発注者確定（§13-4）。足すときは `css/theme.css` の :root を `body[data-theme]` で上書きするだけ |
| 2 | **LAYER.z の向き** | §5 の「正＝手前」を採る。§6-3 の式は composer の「正＝奥」なので符号を返して **depth = F − z − cam.z**（`render.js perspOf`） | §5 と §6-3 が逆向きだった。P1 の Z 定規・P3 の AE JSX（z を反転して渡す）もこの向きで |
| 3 | 取り込んだ絵の大きさ | **「カメラ出力の 1px ＝ 絵の 1px」**で置く（1920×1080 の絵＝SCREEN の紙いっぱい）。紙より大きければ収める。詳細・ドックの 100%＝この大きさ | animator 既定 2048×1152 も紙いっぱいになる。紙の px（3840）を原寸にすると 1920 の絵が 1/4 に見える |
| 4 | 落とした先で行き先 | 紙（ステージ）＝層（落とした点が中心）／**タイムライン＝1素材1枚の新しい紙**（紙いっぱい・落とした所に差し込む）／棚＝しまうだけ。Ctrl+V＝いまの紙に層 | 「落とす → 紙に並ぶ」を1手で。取り込み中に次を落としても捨てない（順番待ち） |
| 5 | 素材棚 | **棚＝`BOOK.plates` そのもの**（未使用の素材も残る）。タイルを紙へ＝層、タイムラインへ＝新しい紙。✕＝素材と使っている層を消す（Undo 可） | §4-2。HTML には層が使っている素材だけ入る |
| 6 | 連番の紙の尺 | ループが切れ目で終わる長さ（12コマ未満なら周回を足す：8枚→16コマ）。1枚絵の紙は 48コマ | 途中で切れるループを作らない |
| 7 | いまの紙 | **プレイヘッドのいる紙**。紙を選ぶ＝その頭へ移動（econte と同じ）。層の選択はいまの紙の中だけ有効 | 選択の同期を作らない |
| 8 | 常駐 | econte の「プレート8枚」ではなく**セル単位のバイト予算 1GB**（LRU・`store.js`） | 連番プレートはセルが数百枚になるので枚数で数えられない。iPad を載せるときに下げる |
| 9 | 出口 | **PAGE PNG はドックから外した**（§13-3 印刷は想定しない）。VIDEO(P3)・SEQ PNG(P2)・REC(P4) は札付きで場所だけ | ボタンを減らす方針（§13-4） |
| 10 | HTML ビューア | `time.js` / `render.js` を **Function#toString で同梱**（書き写しゼロ）。画質 WEBP80（既定）/ WEBP95 / 原画・解像度 1280/1920/3840・感度 10/20/40 px/コマ。WebP は「その素材が一番大きく出る層」の大きさまで縮めて埋め込む。チャプター＝紙の頭 | P0 に入れていない：縦書き・字幕・クリック FX・DOF・ATTRACT・マウス微パララックス（カメラが入る P3 で） |
| 11 | キー | **実在する操作だけ**登録：`1`〜`4` / Space / ←→（Shift=10）/ J K / Home / Del・⌫ / `[` `]`（前後）/ U / `,` `.` `0`。⚙ で再割当（`liveplate_keymap_v1`） | §8-1 の道具キー（V D P T G W E A L C F）はそのフェーズで1行ずつ足す。`[` `]` は §8-1 に無い追加（OBAN の前後と同じ） |
| 12 | Undo | BOOK のスナップショット 80手（Blob は参照のまま） | §8-1 の SHEET＝BOOK ログ。DRAW のタイル Undo（P2）・TAKE の KF ログ（P3）は別ログで足す |
| 13 | ファイル分割 | 18本（最大 stage.js ≒ 330 行）。§11-1 の案から `toast/modal/numfield/theme/panel` は `ui/widgets.js` 1本にまとめ、`mode/*.js` は P0 では作っていない（ステップ差は stage / dock の分岐で足りた） | 1ファイル 2,000 行の上限に遠い。P1〜P3 で膨らむ所から分ける |
| 14 | 保存の持ち出し | **BOOK zip は未実装**。作品はこのブラウザの IndexedDB にしか無い（HTML は書き出せる） | §12 の P0 の範囲外。**P1 の頭で足すのを推奨**（ブラウザのデータを消すと作品も消えるため） |

### 15-2. 実測

- **ビューアとステージが同じ画か**：原画で書き出した HTML と、ステージの `renderFrame` を 5フレーム×48点で比較 →
  **236/240 点が完全一致**、残り4点は α の縁で最大 9/255（ImageBitmap と img のデコード経路の差）。
  WEBP80 だと縁で最大 49/255（圧縮による差＝式の差ではない）
- **VRT**（`verify:liveplate`・960×540・6コマ）：2回目 6/6 = 0.000%。TTFF 525〜573ms／最長フレーム 191〜224ms
- **負のコントロール**：セル番号の式を1コマずらす → 連番の紙の3コマだけ FAIL（0.83%。1セルの紙は 0% が正しい）／
  カメラの置き場所を紙 2px ずらす → 6/6 FAIL（0.024〜0.234%）
- 書き出しサイズ：紙3枚・画像10枚（1920 背景＋600 角＋連番 8枚 640×360）で WEBP80 = 82KB／原画 = 2.9MB

### 15-3. 動作チェック表（P0）

| パラメータ／操作 | 期待される変化 | 有効になる条件 | 結果 |
|---|---|---|---|
| α PNG を紙に D&D | 落とした点を中心に層。`plates` に1本・棚にタイル | 01〜04 どこでも（DRAW 中は紙の中央） | ✅ 確認済（1920×1080 → 紙いっぱい 3840×2160 / 600 角 → 1200 角） |
| 連番4枚以上をタイムラインに D&D | 1素材（cells n枚・番号順）＝新しい紙。落とした位置に差し込み | 名前＋3〜5桁の番号が同じ4枚以上 | ✅ 確認済（逆順に渡しても番号順・8枚→紙1枚） |
| 棚のタイル → 紙／タイムライン | 層になる／新しい紙になる | タイルを 6px 以上ドラッグ | ✅ 確認済（実マウス） |
| Ctrl+V（画像） | いまの紙の中央に層 | 入力欄の外 | ✅ 確認済 |
| 取り込み中に次を落とす | 捨てずに順番に入る | 常時 | ❌→修正済（初版は「読み込み中」で捨てていた） |
| SHEET 行の右端ドラッグ | 尺が変わり総尺・後ろの紙の位置が追従 | 常時 | ✅ 確認済（12→9 コマ、Ctrl+Z / Ctrl+Y で往復） |
| ルーラー／クリップのドラッグ | スクラブ（ステージ・時刻表示が追従） | 常時 | ✅ 確認済 |
| 詳細：コマ打ち 1〜4 | セルが N フレームずつ進む。線の行も同じ並びに | 連番の層を選択中（1枚絵では出ない） | ✅ 確認済（2 → 1,1,2,2,…） |
| 詳細：ずらし・ループ | 開始セルがずれる／OFF で最後のセルで止まる | 同上（ループは素材ごと） | ✅ 確認済（5枚・ループ OFF → `123455…`、ずらし −2（Wクリック入力）→ `3455…`） |
| 紙の上でクリック／ドラッグ／角 | 選択／移動／縦横比を保って拡縮（Shift＝縦横別） | 01 SHEET・ロックしていない層 | ✅ 確認済（実マウス。角の対角が動かない） |
| Wクリック（紙の層・◆ITEMS） | 02 DRAW でプレート原寸・紙は透かし | 層がある | ✅ 確認済 |
| ドック SIZE / OPACITY（左右ドラッグ・Wクリック入力） | 大きさ（中心固定）／不透明度 | 層を選択中 | ✅ 確認済（OPACITY 100→73） |
| 手前へ／奥へ・◉・🔒・複製・削除 | 並び・表示・ロック・同じ素材の層がもう1枚・消す | 層を選択中 | ✅ 確認済（すべて Ctrl+Z で戻る） |
| SHEETS：上下ドラッグ／Wクリック／✕ | 並べ替え／名前を変える／消す | 常時 | ✅ 確認済 |
| `1`〜`4` | ステップ切替・NOW 移動・ドックが替わる | 入力欄の外 | ✅ 確認済 |
| `J` `K` / ←→ / Home | 紙の頭／1コマ（Shift=10）／先頭 | 常時 | ✅ 確認済（J：紙の途中なら頭、頭なら前の紙） |
| `,` `.` `0` / ホイール / 右・中ドラッグ | ステージの拡縮／全体／移動 | 常時（PLAY 中は無効） | ✅ 確認済 |
| Ctrl+ホイール（タイムライン）/ FIT | 時間の拡縮／全体が入る幅（頭へ戻る） | 常時 | ❌→修正済（FIT で横スクロールが残っていた） |
| 03 TAKE | カメラの窓（書き出しと同じ式）・窓の外は暗く | 常時 | ✅ 確認済（P0 は既定カメラ＝紙全面） |
| 04 SHOW ▶ PLAY | UI が消えて全画面で頭から再生・Esc で戻る | 常時 | ✅ 確認済 |
| HTML 書き出し（解像度・画質・感度） | 単一 HTML（画像はすべて埋め込み）。スクロールで同じ画 | 層が1枚以上 | ✅ 確認済（ステージと数値比較＋**2026-09-24 発注者が別 PC で開けたことを確認**） |
| リロード | BOOK が IndexedDB から戻る（Blob・サムネ込み） | 同じブラウザ | ✅ 確認済（素材を消して Undo した後も欠けなし） |
| ⚙ キー再割当 | 押したキーに替わり保存。同じキーは奪う。既定に戻せる | 設定を開いている | ✅ 確認済 |
| ⚙ NEW BOOK | 確認（Esc＝取消 / Enter＝実行）→ 空の BOOK | 設定を開いている | ✅ 確認済 |
| ≡（ペイン） | 細い帯に畳む／帯を押すと開く・状態を覚える | 常時 | ✅ 確認済 |
| iPad 縦 | — | — | ⚠️ 対象外（§13-6：P0 は PC 専念。メタタグだけ入れてある） |
| `node tools/check.js` | 複数ファイルで構文・配線・重複・未参照関数 | 常時 | ✅ 確認済（負のコントロール：死に関数と存在しない id を足すと 2件 NG） |

### 15-4. 次（P1 の頭で）

1. **実機で触ってもらう**（骨格の見た目・ドックの高さ・落とす場所の3択は伝わるか）。§12 の約束
2. BOOK zip（保存の持ち出し）を足す（15-1 #14）
3. P1 SHEET：manga-plate v2 のコマ割り（`rebuildPanel clipHalf splitPanels …`）・層の所属（`panelId` → `renderFrame` で clip）・Z 定規・のりしろ。
   `render.js` の合成順 §6-2 の「panel clip」と「items」の2か所に差し込む

---

## 16. P1 実装メモ（2026-09-24）— SHEET（コマ割り・仕上げ素材）＋ BOOK zip

**§13-3（印刷は想定しない）に合わせて P1 から外したもの：ページ PNG・見開き・網点化（グレー→網点）。** それ以外の §12 P1 は入っている。

### 16-1. BOOK zip（P0 の宿題 §15-1 #14）

| 項目 | 決めたこと |
|---|---|
| 形式 | zip の中に `liveplate.json`（`{format:'LIVE_PLATE_BOOK', ver:1, book}`。画像の所は zip 内のパス）＋ `cells/<cellId>.<lane>.<png\|jpg\|webp>` ＋ `thumbs/<plateId>.png` |
| zip の実装 | **依存ゼロの自前**（書く＝無圧縮 store・UTF-8 名／読む＝store と deflate。deflate は `DecompressionStream`）。画像はもともと圧縮済みなので store で十分。CDN 無しのオフラインでも動く |
| 入口 | ⚙ BOOK：`⇩ BOOK 保存`／`⇧ BOOK 開く`／名前欄。zip か JSON を**どこに落としても**「開く」 |
| 開く | **置き換え**（§9-1。戻せないので確認）。旧 MANGA_BOOK_v2 の JSON は「紙として足す」 |
| ファイル名 | `liveplate-<名前>-<日時>.zip`。`.gitignore` に `liveplate-*.zip` を追加（公開リポジトリに作品を置かない） |

### 16-2. 仕様に書いていなかった／食い違っていたので、推奨で決めたこと

| # | 項目 | 決めたこと | 理由 |
|---|---|---|---|
| 1 | **割っても見えている絵は消さない** | 分割のとき、親コマの外接矩形の 90% 以上を覆う層・素材（背景・網など）は**両方の子にコピー**。それ以外は中心が入る方の子へ（manga-plate の規則）。**分割を戻す**ときは同じもの2枚を1枚にまとめる | manga-plate の「中心の入る方だけ」だと、全面の背景を置いてから割ると他のコマが真っ白になった（実機で踏んだ） |
| 2 | 0個＝全面1コマ | 最初の DIV で内枠のコマを1枚作り、その紙の層・素材を全部そのコマに入れてから切る | §5 の「0個＝全面1コマ」を文字どおりに |
| 3 | **重なり順** | **◆ITEMS の並び（配列）だけで決まる。Z は並びを変えない**（視差だけ） | §6-2 は「z 昇順」だが、それだと 手前へ／奥へ と Z の2つが同じ見た目を奪い合う。manga-plate（奥行きは転送用のタグ）・OBAN と同じにした |
| 4 | **合成順** | 地 →〔コマの層 → コマの素材（段順）… コマの形で切り抜き〕→ 枠線 →〔枠の上の層 → 素材〕 | §6-2 は枠線を文字の後に置いていたが、manga-plate の renderPage（枠の上＝擬音・飛び出しが枠線の上）に合わせた |
| 5 | **Z の写像と止まったカメラ** | 奥⇄手前の定規 d（0..1）→ z は OBAN のパン係数 `pf=lerp(0.7,1.2,d)` と一致する写像（**d=0.6 が紙の面**）。カメラの大きさは `persp/persp₀` で割る＝**止まったカメラの画＝紙に置いた通り**、Z はカメラが動いたときの視差にだけ効く（composer applyObanPlacements の打ち消しと同じ） | 実測：Z を 0→手前0.91 にしても止まった画の差 **0px**、カメラを 300 ずらすと **10,732px** 差（視差） |
| 6 | 素材の所属 | 仕上げ素材は `panelId` でコマに属す（manga-plate のまま）。§5 の `layerId` は使っていない | 視差で層と一緒に動かしたくなったら P3 で足す |
| 7 | 文字の表示窓 | `tIn/tOut`（紙の中のコマ番号）を全部の素材に持たせた（§7-1） | TAKE の KF に紐づけない |
| 8 | SEL | 既定は「素材」（層と仕上げ素材をクリック）。**Wクリック（V を2回）で「コマ」**。§7-1 は単押し＝コマだったが、P0 から「クリック＝絵を選ぶ」で使っていたので既定を素材に | ◆ITEMS のコマ欄の見出しを押してもコマを選べる |
| 9 | DIV の向き | 既定は斜め（ドラッグの向き）。W クリックで 縦 → 横。**紙の外から引き始めると 上下の外＝横線／左右の外＝縦線**（manga-plate・クリスタの定規） | |
| 10 | TONE レール | 1つのレールで 網 → 集中線 → 流線（W クリック／N を2回）。クリックしたコマの外接矩形に置く（集中線はクリックした点が中心） | レール6個以内（§2-4） |
| 11 | 白 | 投げ縄（ドラッグ＝フリーハンド／クリックで始める＝多角形・Enter／始点／W クリックで閉じる・Esc で取消）。W クリックで「消し」（紙の地の色で塗る） | SPEC_17 §2-3 |
| 12 | キー | V D P T N W（G は W の別名）＋ 2連打＝モード（320ms・ANIMATOR と同値）。長押し・バネは PEN が来る P2 で | |
| 13 | 網の縮小表示 | 画面上のドット間隔が **3px 未満**なら同じ濃さの平らな塗りで出す（モアレを出さない・軽い）。書き出しの解像度ではドットを打つ | 網1枚（紙全面・約3.7万ドット）の描画は 書き出し 9ms・ステージ 14ms（実測） |
| 14 | コマ割りの設定 | BOOK 共通（`book.frame`：余白 80・縦線の間隔 48・横線の間隔 64・枠線 8・右綴じ）。旧 MANGA_BOOK を読んだ紙だけ `sheet.frame`（ページの範囲）を持つ | SCREEN の紙で揃う方が作品が崩れない |
| 15 | 旧 MANGA_BOOK_v2 | ページを SCREEN の紙の中に**縦横比を保って収めて**新しい紙として足す（B4 なら 29%）。断ち切りは「ページの端」まで。奥行きタグ 奥/中/前 → d 0.35/0.6/0.85。ぱかぱか（pk）・網点化は持ち込まない | 用紙は SCREEN 固定（§13-3） |
| 16 | ◆ITEMS | コマ欄（上＝枠の上 → コマ n … 1）。欄の中は 素材 → 層。層の行を別の欄へ落とす＝そのコマへ移す | manga-plate v2-9 |

### 16-3. 実測

- **ビューアとステージ**：コマ・網・集中線・文字・ホワイト・フチ・旧 MANGA_BOOK の紙が入った BOOK を原画で書き出し、1920×1080 の**全画素**を4コマ比べて **差 0**
- **VRT**：C4（コマ割りの紙）を足して 8 コマ。P0 の6コマは render.js を書き直した後も **0.000%**（P0 の出力は1pxも変わっていない）。負のコントロール＝コマの切り抜き（clip）を外す → **C4 の2コマだけ 10.5% で FAIL**、他は 0%
- **BOOK zip**：保存 → 読み戻しで JSON が完全一致・画像のバイトも一致。書いた zip は Python の `zipfile.testzip()` で CRC エラー無し。Python で作った deflate の zip も読める
- 最長フレーム（検証窓の起動）244〜290ms（1回だけ 368ms）→ 予算を 300 → **400ms** に（起動のスクリプト 24 本＋フィクスチャの組み立て）

### 16-4. 動作チェック表（P1）

| パラメータ／操作 | 期待される変化 | 有効になる条件 | 結果 |
|---|---|---|---|
| ⇩ BOOK 保存 → ⇧ BOOK 開く | zip で丸ごと往復（置き換え・確認あり） | ⚙ を開く／zip を落とす | ✅ 確認済（JSON・画像バイト一致・Python で CRC 検査） |
| DIV（D）でドラッグ | 線でコマが割れる。背景は全コマに残る | 01 SHEET | ❌→修正済（初版は背景が1コマにしか残らなかった）→ ✅ |
| DIV：紙の外から引く／Wクリック | 左右の外＝縦線・上下の外＝横線／斜 → 縦 → 横 | 01 SHEET | ✅ 確認済 |
| EDIT（P）■／● | 分割線の平行移動／回転（Shift＝15°） | 分割線がある | ❌→修正済（線を動かした後にコマ番号が読み順からずれた → 離したときに振り直す）→ ✅ |
| コマを選ぶ（SEL を W クリック） | コマ選択・枠線・断ち切り・分割を戻す | 01 SHEET | ✅ 確認済（断ち切り＝上下の辺だけ紙の端まで・斜辺は角度のまま） |
| 分割を戻す | 2コマ→1コマ。コピーした背景は1枚に | 兄弟のコマがある | ✅ 確認済 |
| TONE（N）・N を2回 | クリックしたコマに 網／集中線／流線 | 01 SHEET | ✅ 確認済（網は乗算） |
| TEXT（T） | クリックした所に文字 → 詳細の欄に打つ・T を2回で横書き | 01 SHEET | ❌→修正済（入力欄にフォーカスが入らなかった）→ ✅ |
| 白（W / G） | 投げ縄でホワイト・多角形は Enter で閉じる・W を2回で消し | 01 SHEET | ✅ 確認済 |
| 層を落とす位置 | 落としたコマに入る（コマの外＝枠の上） | コマ割りあり | ✅ 確認済 |
| 所属チップ・◆ITEMS で別の欄へ | コマを移る／枠の上へ | 詳細 or ◆ITEMS | ✅ 確認済 |
| Z 定規（奥⇄手前） | 止まった画は変わらない・カメラが動くと視差 | 層を選択中（視差が見えるのは P3） | ✅ 条件付き（数値で確認。カメラを動かす UI は P3） |
| のりしろ・コマに合わせる | コマの外接矩形 × のりしろ を覆う | 層がコマに属している | ✅ 確認済 |
| 境界効果（フチ） | α の外側に白／黒のフチ | 層を選択中 | ✅ 確認済（VRT C4 に入っている） |
| 余白・間隔・枠線の太さ | 全部の紙のコマが作り直される | 何も選んでいない時の詳細 | ✅ 確認済（余白 80→200 で内枠のコマが追従） |
| 素材の Delete・複製・前へ／後ろへ・色 | それぞれ反映・Ctrl+Z で戻る | 素材を選択中 | ✅ 確認済（Delete＋Undo・色） |
| 旧 MANGA_BOOK_v2 を落とす | 新しい紙として足す（コマ・素材・画像） | JSON | ✅ 確認済（manga-plate で作ったページを読み、同じ形で出る） |
| HTML 書き出し | コマ・素材・文字もステージと同じ画 | 04 SHOW | ✅ 確認済（全画素差 0） |
| 網の縮小表示 | 細かすぎるときは平らな灰色（モアレ無し） | 画面上のドット間隔 < 3px | ✅ 確認済 |
| iPad | — | — | ⚠️ 対象外（§13-6） |

### 16-5. 次

- P2 DRAW（ペン・線／塗レーン・タイル Undo・変形・SEQ PNG）と P3 TAKE（CAPTURE・dwell・ピント・FX・MP4）は独立。どちらからでも
- 旧 ANIMATOR_v1（P2）／ PROJECT_v2・ECONTE zip・OBAN JSON（P3）の読み込みはそのフェーズで

---

## 17. P2 実装メモ（2026-09-26）— DRAW（ペン・線／塗レーン・セル・オニオン・REF・変形・SEQ PNG）＋ SHEET の手直し

### 17-0. 着手前に発注者から出た SHEET の気になり（P1 を触って）

| # | 気になったこと | 対応 |
|---|---|---|
| 1 | **下にある素材が選択しづらい。◆ITEMS で選んでいても上の素材を掴んでしまう** | **選んでいる物がその点にあれば、上に別の物が重なっていてもそれを掴む**（`sheet.js hitArt`＝`hitAll` の中で選択中を優先）。加えて **選んでいる物の上でもう一度クリック（動かさない）＝重なりの1つ下へ**（320ms 待って Wクリックでないと分かってから）・**Alt＋クリック＝すぐ1つ下**。トーストに「下：名前（2 / 3）」。ホバーの縁取りは選択中のものには出さない |
| 2 | **◆ITEMS がスクロール大変で狭い**（SHEETS と ITEMS を左右の列に・各非表示） | 右ペインを **2列（SHEETS 176px｜◆ITEMS 236px）** にした。**列ごとに ≡ で畳める**（畳むと 30px の帯・帯を押すと開く・`liveplate_pane_s` / `liveplate_pane_i` に覚える）。◆ITEMS は縦いっぱいを使う（旧：SHEETS の下で最大 42%）。行も詰めた（サムネ 60／44px）。詳細パネルの初期位置は2列の左に追従 |
| 3 | 詳細パネルが **WACOM 液晶のペンや指だと移動が引っかかる** | **記録だけ（発注者指示：iPad のときに一緒に）**。見立て：`.fp-head` に `touch-action:none` が無く、ペン／指のドラッグをブラウザがスクロール・ジェスチャに取って `pointercancel` になる。直すときは `.fp-head{touch-action:none}` ＋ `makePanelDraggable` の `pointermove` を pointerId で固定（SPEC_18 §8-2「判定」）。§17-4 の iPad 行へ |

### 17-1. 仕様に書いていなかった／食い違っていたので、推奨で決めたこと

| # | 項目 | 決めたこと | 理由 |
|---|---|---|---|
| 1 | **描いている絵の置き場** | 02 DRAW で開いたセルは**レーンごとにプレート原寸の canvas（編集バッファ・`core/cells.js`）**を持つ。`LP.cache.img(cell, lane)` はバッファがあればそれを返す＝ステージ・サムネ・カメラ・書き出しが**描いた瞬間の絵**を見る。Blob（BOOK の正）は描き終えて 700ms 後か、保存・HTML／SEQ・BOOK zip の直前に作る（`cells.flush`）。バッファは LRU 16（Blob にしていないものは捨てない） | `renderFrame` は `view.img` しか知らない＝描画経路を増やさずに「描いた絵がそのまま撮影にもビューアにも乗る」（§2-1） |
| 2 | 塗レーンの確保 | **最初に塗るまで作らない**（SPEC_20 の遅延確保）。線だけのセルは1枚分のメモリ | SPEC_20 §1-1 |
| 3 | **Undo は1本の時系列**（§8-1 の「ステップごとのログ」から変えた） | BOOK のスナップショット（book）と矩形タイル（px）を**同じ列に積む**。描いた絵の Blob は `hist.patchBlob` で**全部のスナップショットへ**書き込む＝紙の尺・層の移動を Undo しても描いた絵は巻き戻らない（絵を戻すのは px の手だけ）。80手／タイル合計 512MB で古い方から捨てる（base は捨てず、捨てた手が book なら base をその姿へ進める） | ステップを行き来したときに「どのログが戻るのか」で迷わない。DRAW でセルを足した手とストロークの手が同じ Ctrl+Z で順に戻る |
| 4 | タイル Undo | econte の `txBegin / txTouch / txEnd / txAbort`（触る前に紙を1枚控え、離したら**変わった矩形だけ** before/after）。バケツは**塗った範囲だけ**（`floodFill` が矩形を返す） | 全面を積むとバケツ1回 16MB（1920×1080×2）になる |
| 5 | 描く先 | **選んだ層のプレートの「いまのセル」**（`cellIndexAt`＝ステージ・タイムラインと同じ式）。層の出る／消えるの外で描こうとしたらトースト | 式は1か所（§6-2） |
| 6 | ＋ 描く層 | 01 SHEET のドック（ADD）と 02 DRAW の NO LAYER に。**カメラ出力の大きさ（1920×1080）の空プレート**を紙いっぱい（コマを選んでいればそのコマに合わせる）→ 02 DRAW へ。棚では DRAW 札 | §11-2 既定＝カメラ出力。置き方は P0 §15-1 #3 の「出力 1px ＝ 絵 1px」 |
| 7 | 道具×レーン | SPEC_20 §1-2 の表＋§8 #1 #3 のまま：FILL を押すと塗レーンへ／投げ縄消しはいまのレーン／PEN・ERASE は FILL・SEL から戻ると線レーン／塗レーンの PEN＝塗りの色（補修）。線レーンで FILL に切り替えるとペンへ持ち替え（トースト） | animator 実装が正準 |
| 8 | 筆圧 | ema+（均し 0.25・入り 12px を弧長でテーパー・**筆圧 0 を 0.5 に化かさない**）。**マウスは筆圧を見ない**（常に SIZE どおり）。筆圧はペンと消しゴムで別々（§8 #2） | animator の実機測定（SPEC_18 §2-4） |
| 9 | 指 | **02 DRAW では指は描かない＝ステージの移動**（ペンとマウスで描く） | SPEC_18「指はナビ・ペンは描く」。iPad の本格対応は §13-6 のとおり後で |
| 10 | オニオン | 前後1セル（前＝赤・後＝青・32%）。**塗の上・線の下**（SPEC_20 §7-1 #2）。再生中は出さない。「＋塗」でオニオンに塗りも | `renderFrame` の focus に `view.mid` の手すりを足した（出力には出ない） |
| 11 | **REF** | **参照＝同じ BOOK の他のプレート**（`plate.refs[]`＝{plateId, offset, step, opacity, visible, color}）。ドックの REF（R）で素材を押して足す・濃さ 20/40/70・✕。タイムラインの **REF 行**に帯：横ドラッグ＝offset・`×N` を押す＝1→2→3→4・帯を押す＝表示 ON/OFF。セル番号は `cellIndexAt` に `clip:true`（尽きたら出さない）を足して**同じ式**で出す。プレートの縦横比を保って収める | SPEC_20 §1-5・§7-6（添字の式を1か所）。animator の「+ FROM SAVED」は同じ BOOK なので要らない |
| 12 | 変形（SEL） | animator の gFloat をそのまま移植（`mode/draw-sel.js`・箱+rot+warp・AA OFF は `flBakeNearest`・COPY/PASTE は同じ座標・線+塗）。HUD はドックの SEL 群（AA／線+塗／WARP／COPY／PASTE／✓／✕）。持ち上げ〜確定で Undo 1手、取消は積まない。他の道具・別のセル・別の層・ステップ切替で**確定**（animator の floatSettle） | SPEC_20 §7-8 |
| 13 | セル | タイムラインの 線／塗 行でクリック＝そのセル＋そのレーン・右端ドラッグ＝セルの長さ・SHEET で Wクリック＝02 DRAW。ドックの CELL：◀▶（↑↓）・＋（空のセルを後ろへ）・複製・削除（最後の1枚は消せない）・長さ（スクラブ） | SPEC_20 §1-4 |
| 14 | キー | **step スコープ**を keymap に足した：01 と 02 で同じキーを別の道具に（P＝EDIT／PEN、G＝白／FILL。§8-1 の「P と G だけ」）。02：P E G A L R O ↑↓。**SPEC_17 の押し方**（2連打・長押し 500ms・Shift・バネ 250ms）を登録制に足した（`hold` `shift` `spring`）。Ctrl+C／Ctrl+V は SEL の形（浮いていなければ従来の画像貼り付け） | SPEC_17 §2-1。`O`（オニオン）と `↑↓`（セル）は §8-1 に無い追加 |
| 15 | **SEQ PNG** | 04 SHOW の出口に（P0 の札を外した）。**カメラの出力を1コマ1枚**（`renderFrame mode:'export'`）で、合体＝`frames/`／線＝`line/`／塗＝`fill/`／線+塗＝2フォルダ。線・塗は `view.pass`＝そのレーンだけ・**透明の地・枠線と仕上げ素材は出さない**（コマの切り抜き・Z・カメラは同じ）。保存先 ZIP（無圧縮）／フォルダ（`showDirectoryPicker` がある環境だけ・1枚ずつ）。空のコマも透明1枚（番号の欠けを作らない）。600枚超の ZIP は確認 | SPEC_20 §1-8 の4択を「1本の BOOK」に広げた形（AE で線と塗りを別に重ねる） |
| 16 | **旧 ANIMATOR_v1 を読む** | `format:'PROJECT_v1'`（ANIMATOR の EXPORT JSON）をどこに落としても／⇧ BOOK 開く で。**PLATE 1本（作業解像度そのまま）＋新しい紙1枚**（尺＝合計コマ数・紙いっぱい）。`cells[].layers {line, fill}` があれば分けたまま、無ければ合体を線レーンへ。空ブロック＝絵の無いセル（長さは保つ）。dataURL をそのまま Blob に（再エンコードしない） | §5-2。持ち込まない：FRAME 下絵・ワークエリア・非表示の印（絵は入る） |
| 17 | 描いた絵のサムネ | Blob にしたとき、棚のタイル（1枚目のセル）・その素材を使う紙のサムネ・◆ITEMS を描き直す（`sides.refreshPlate`） | |

### 17-2. 実測（2026-09-26・このコンテナのヘッドレス Chromium）

- **VRT**：`verify:liveplate` 8コマ。このコンテナの Chromium は C4（コマ割り）で既存の承認画像と 0.356% ずれる（**変更前のコードでも同じ 0.356%**＝ブラウザ版の差）。
  そこで**変更前のコードで基準を撮り直して**から変更後を比べた → **8/8 = 0.000%**（P0・P1 の出力は1px も変わっていない）。承認画像はリポジトリのものに戻してある
- **ANIMATOR_v1 の読み込み**：半透明を含む 640×360 の絵（線だけ／線＋塗／空ブロック）を読んで Blob をデコードし直して比べる → **線・塗とも差 0 画素**。長さ 2・1・3 → 紙の尺 6
- ストローク中の1フレーム：1920×1080 のプレート・ペン 60点 → **中央 17.3ms／最大 18.2ms**（60fps。ステージは紙＋プレートを毎フレーム `renderFrame`）
- バケツ（1920×1080・壁判定＋1px 潜り）：塗った 166,704 画素のうち線の下へ潜った 1,626 画素・Undo で 0／Redo で戻る
- SEL：矩形で持ち上げ → 移動 → 確定で外接矩形が (268,149)→(289,159)、Ctrl+Z で (268,149) に戻る。AA OFF で半透明 0
- SEQ PNG（線+塗・1280）：54コマ → `line/` `fill/` 108枚・Python `zipfile.testzip()` で CRC エラー無し
- 保存 → 再読み込み：セル2枚の線／塗の有無が一致

### 17-3. 動作チェック表（P2）

| パラメータ／操作 | 期待される変化 | 有効になる条件 | 結果 |
|---|---|---|---|
| 01：◆ITEMS で下の層を選んでから、上の層と重なった所をドラッグ | 下の層が動く（上は動かない） | 01 SHEET・SEL | ✅ 確認済（ヘッドレス・実マウス） |
| 01：選んでいる物の上でもう一度クリック／Alt＋クリック | 重なりの1つ下を選ぶ（トースト n / N） | 重なりが2つ以上 | ✅ 確認済（top → bottom → top） |
| 右ペイン SHEETS｜◆ITEMS の ≡ | 列ごとに 30px の帯に畳む・帯で開く・覚える | 常時 | ✅ 確認済（幅 412 → 266 → 60 → 412） |
| ＋ 描く層 | 1920×1080 の空プレートが紙いっぱい → 02 DRAW・ペン | 01 のドック／02 の NO LAYER | ✅ 確認済 |
| PEN（P）で描く／P を2回 | 線レーンに黒・筆圧 ON/OFF | 02 DRAW・層を選択 | ✅ 確認済（筆圧は実ペン未確認 ⚠️） |
| FILL（G）バケツ | 塗レーンへ移り、線を壁に塗る・1px 潜る | 同上 | ✅ 確認済 |
| G を2回／長押し・Shift＋G | 投げ縄塗り／投げ縄消し（いまのレーン） | 同上 | ✅ 確認済（2回・長押し 500ms・Shift＋G）。❌→修正済：投げ縄消しが localStorage に残って次に開いたときも消しのままだった（一時モードは覚えない） |
| ERASE（E）・E を2回 | 透明に／このセルを全消去（線＋塗で1手） | 同上 | ✅ 確認済（Ctrl+Z で戻る） |
| E を押しっぱなし → 離す | 押している間だけ ERASE・離すと元の道具（バネ） | 250ms 以上 | ✅ 確認済（FILL → ERASE → FILL） |
| SEL（A）：ドラッグ／Shift＋ドラッグ → 移動 → Enter | 持ち上げて動かして確定・Ctrl+Z 1回で元へ | 同上 | ✅ 確認済（回転・WARP は実マウス未確認 ⚠️） |
| COPY → 別のセルで PASTE | 同じ位置に貼る | SEL | ✅ 確認済 |
| Alt＋クリック／EYE | 線 → 塗 → 下の紙の順に色を拾う（線レーン＝インク／塗レーン＝塗りの色） | 02 DRAW | ✅ 確認済（線 #000000・塗 #F2C9B0・空の所は下の紙 #22AA44） |
| L／タイムラインの 線・塗 行 | レーン切替（HUD の 線 LINE／塗 FILL） | 同上 | ✅ 確認済 |
| CELL：＋・複製・削除・↑↓・長さ | セルを足す・複製（絵ごと）・消す・移る・長さ | 同上 | ✅ 確認済 |
| オニオン（O）・＋塗 | 前＝赤・後＝青（塗の上・線の下） | 前後にセルがある | ✅ 確認済（画面） |
| REF（R）→ 素材を押す・REF 行の帯 | 下に透かす・横ドラッグ＝offset・×N | 他のプレートがある | ✅ 確認済（offset 4・×2） |
| 紙の尺など BOOK の Undo | 描いた絵は戻らない | 描いた後 | ✅ 確認済 |
| 保存 → 再読み込み | 描いたセルが戻る | 同じブラウザ | ✅ 確認済 |
| ANIMATOR の EXPORT JSON を落とす | 新しい紙＋プレート（線・塗・空ブロック・長さ） | PROJECT_v1 | ✅ 確認済（画素差 0） |
| 04 SHOW：SEQ PNG（合体／線／塗／線+塗・ZIP） | frames/ か line/ fill/ に frame_00000.png… | 常時 | ✅ 確認済（線+塗・ZIP）／フォルダは未確認 ⚠️ |
| HTML 書き出し・BOOK zip | 描いた絵も入る（書き出す前に Blob へ） | 常時 | ✅ 確認済 |
| 実機（PC の実マウス・ペンタブ） | — | — | ⚠️ 未確認（ヘッドレス Chromium の合成マウスで確認） |
| iPad | — | — | ⚠️ 対象外（§13-6） |

### 17-4. やっていないこと（P2 のあと）

- **セル一覧（GRID）**（§7-2「REF パネルの隣のタブ」・C.SCRIPT 一覧 PNG）— 未着手
- トーンインク（網点で塗る）・パレットの編集（スロットへスポイト・JSON 入出力）・筆圧カーブの選択 — animator にはある。要るとなったら
- ブラシ（BRUSH LAB の6種）— 今は AA なしの丸ペンだけ（SPEC_19 P3 の econte ブラシを持ち込むかは要判断）
- 02 DRAW 中の LIVE（再生しながら描く）は P4
- **iPad／ペンの対応**：詳細パネルの移動の引っかかり（§17-0 #3）・2本指 UNDO／3本指 REDO・ピンチ・`pointermove` の pointerId 固定を、iPad の知見が固まったときに一緒に（§13-6）
