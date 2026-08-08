# SPEC_10 — ECONTE（プリプロ：ネーム→絵コンテ→動画コンテ）

紙のネーム/漫画ラフから絵コンテ・動画コンテまでを1本で行き来するプリプロツール。
ファイル: `econte.html`（単一HTML・IndexedDB自動保存・Chrome / iPad Safari）。

## 核心設計 — 「同期」は作らない

**カット配列 `cuts[]` を唯一のデータ**とし、BOARD / SHEET / TIMELINE は同じ配列の
別ビューにする。画・尺・コメントはどのビューで触っても同じデータに書くため、
ビュー間の「反映処理」は存在しない（＝同期バグが構造的に起きない）。

> **V2-A（SPEC_13 §1）で3ビューは1画面 STUDIO に統合済み**（2026-08-02）。
> `state.view` は **`studio` | `edit`** の2値。BOARD / プレビュー / SHEETパネル / TIMELINE帯は
> STUDIO内のペインになった（＝ビューが減っただけで、上の核心設計は変わらない）。
> 「現在カット」は `cutIndexAt(state.tl.frame).i` の**唯一の導出値**で、
> 右パネルの `.focus` 行・中央下の尺/TEXT欄・BOARDのCUT枠ハイライトが全部これに従う（`renderStudioSync()`）。

```
cut = {
  id,                    // 一意ID（採番はカット順から自動: C1, C2, ...）
  cam: [{k,x,y,w,h,dur,ease,key}],  // カメラ枠列（V2-D1）。BOARD座標・16:9固定。空コマは []
  bakeRect: {x,y,w,h}|null,         // ベイク範囲 = fit16_9(union(cam[]) × bakeExpand)
  bakeW, bakeH,          // ベイクのピクセル寸法（V2-D1では 1280×720 固定・D2で可変）
  bakeExpand: 1.02,      // 枠ぎりぎりが不安なときの手動保険（1.0〜1.5）
  baseC: canvas|null,    // bakeRect のベイク。CLEAR BASE で破棄可
  drawC: canvas,         // 加筆レイヤー（baseCと同じベイク空間・透過）
  bg: 0..255,            // 下地グレー（255=白）
  baseAlpha: 0..1,       // トレース透かし（V2-C）
  durF: int,             // 尺（コマ数, 24fps）。**枠列カットでは Σcam[].dur の導出値**
  note: string           // 内容・セリフ
}
```

> **`cut.src` は V2-D1 で廃止**（`cam[0]` に吸収）。旧データは読み込み時に自動変換される（§5i）。

- コンテ解像度は **1280×720（16:9）固定**。`CONTE_W/CONTE_H`。
- 尺の表記は作画慣習の **秒+コマ（24fps）**。`"3+12"` ⇔ 84f。整数のみは秒扱い。
- 規模目安: 15秒〜2分 ≒ カット10〜60。iPadで余裕の範囲。

> **V2-D1/D2（実装済み）**: `src` → `cam[]`＋`bakeRect`、`durF` は導出値、再生は `drawCamFrame()`。
> **PANした先に画が無い問題の構造的解決**（定義上すべての枠が bakeRect の内側）。
> キャンバス寸法は **カット毎に可変**（`bakeW/bakeH`）で、`CONTE_W/H` は
> **「本番枠＝出力解像度」の意味に純化された**（＝キャンバス寸法として使ってはいけない）。

## フェーズ

- **P0（実装済み）**: BOARD＋SHEET＋EDIT（描画）＋IndexedDB保存
- **P1（実装済み）**: TIMELINE（composer-timeline-kit 移植・クリップ尺⇔SHEET尺・再生・動画書き出し）
- **V2-A（実装済み・2026-08-02）**: STUDIO 1画面統合＋フォーカス同期＋フルスクリーン＋
  パレット挙動変更＋TOOL左右入替＋iPadダブルタップ（SPEC_13 §1/§3-2,3-3/§4-1）
- **V2-B（実装済み・2026-08-02）**: BOARD強化（Ctrl+Vペースト／HEIC／写真の回転・モノクロ輝度／
  CUT枠編集／統合Undoログ）＋REF BOARD連携 `photo.ref`（SPEC_13 §2・§2-1a）。
  併せてペイン境界のスプリッタ（AE風の幅変更）を追加
- **V2-C（実装済み・2026-08-02）**: トレース透かし `cut.baseAlpha`＋EDITズーム/パン＋
  指=操作・ペン=描画＋2本指UNDO/3本指REDO（SPEC_13 §3-1・§3-5・§4-2・§4-3）
- **V2-D1（実装済み・2026-08-02）**: カメラ枠列 `cut.cam[]`＋`bakeRect` 自動算出＋
  BOARD枠列編集UI＋`drawCamFrame()`＋meta.ver 1→2 マイグレーション（SPEC_13 §5a/§5b/§5i）
- **V2-D2（実装済み・2026-08-02）**: 可変ベイク解像度（`cut.bakeW/bakeH`）＋遅延デコードLRU＋
  素材はみ出し警告（SPEC_13 §5c/§5d/§5e）。**`CONTE_W/H` は「本番枠＝出力解像度」の意味に純化**
- **V2-E1（実装済み・2026-08-02）**: HSVスライダーピッカー＋SHEET行ドラッグ並べ替え（▲▼撤去・`Ctrl+↑↓`）＋
  SETTINGSショートカット一覧（⚙ / `?`）＋プロジェクトZIP入出力（SPEC_13 §9e/§9f）
- **V2-E2（実装済み・2026-08-02）**: カラースクリプト編集（EDITの`GRID`モード＋`cut.colorC`＋
  描画モード5種）（SPEC_13 §9b）
- **P2**: animator連携（SPEC_07 `tdr_live` 語彙参加・REF送り）＋カラースクリプト一覧PNG
- **P3（構想）**: manga-plate FRAME接続・OBANコマ送り

## P1 TIMELINE仕様

- **第4のビューではなく第3のビュー**: cuts[] をそのまま時間軸に並べるだけ（クリップ＝カット）。
  尺・画・番号は同一データなので、SHEETとの「同期処理」は存在しない。
- クリップ右端ドラッグ＝尺変更（ドラッグ中はpx/フレーム固定でラバーバンド防止、離すと再レイアウト）。
- 帯クリック/ドラッグ＝seek（スクラブ）。クリップをダブルクリック＝EDITへ（戻り先はTIMELINE）。
- **プレビューに直接ペイント可**: PEN/ERASE/FILL/EYEがそのまま効き、プレイヘッド位置の
  カットの drawC に入る（＝「動画コンテに描いて絵コンテに反映」。同一データなので自動）。
- 再生: rAFベース `tick`（kit準拠）。LOOPトグル。24fps。
- ショートカット（`econte_keymap_v1`・kit準拠レジストリ。**V2-A以降は STUDIO ビューで有効**）:
  Space=再生/停止 ／ ←→=±1コマ(Shift=10) ／ Home/End ／ J/K=前後カット頭 ／ L=ループ。
  再割当UIはP2以降（localStorageの手書き編集は可能）。
  **V2-A で Space がトランスポートに移ったため、BOARDの強制パンは Alt / 中ボタン**
  （空白ドラッグ＝パンは従来どおり）。
- **EXPORT VIDEO**: `canvas.captureStream(24)`＋MediaRecorder で**実時間再生を録画**
  （WebM vp9→vp8→mp4の順でフォールバック。Safariはmp4になる想定）。
  「C#/尺 焼き込み」チェックでプレビュー＝書き出しにオーバーレイ（WYSIWYG）。
  書き出し中はSpaceで中断（ファイル破棄）。**タブを前面のままにすること**
  （非表示タブはrAF停止のため録画が止まる）。

## P0 ビュー仕様

### BOARD — 考える場（無限キャンバス風）

- 紙の写真を IMPORT ボタン / D&D / **Ctrl+V ペースト**（V2-B）で複数投げ込み、
  パン・ズーム（ホイール／ピンチ）の効く場に自由配置。**HEIC/HEIF 対応**（V2-B）:
  まず `createImageBitmap`、駄目なら heic2any をCDNから遅延ロード。
  保存用blobは必ずJPEGに落とす（HEICのまま持つとリロードで復元できない）。
- ツール **MOVE**: 写真ドラッグで移動（空白ドラッグ＝パン／Alt・中ボタン＝常にパン）。
- **写真の加工（V2-B）**: `photo.rot`(0/90/180/270) と
  `photo.filter = {gray, bright, contrast}`。描画は `drawPhoto(ctx,p)` 一本に集約され、
  **renderBoard と bakeCut の両方に効く**（＝⟳再ベイクで絵コンテにも反映）。
  `p.x/y/w/h` は「見た目の外接矩形」を正とし、回転時は w/h も入れ替える（当たり判定はそのまま）。
- ツール **CUT**: 矩形ドラッグ（**16:9固定比**）→ その範囲を 1280×720 にベイクして
  新規カット追加。切り出し元矩形 `src` を保持し、BOARD上に既存カット枠（C番号付き）
  を常時表示。
- **CUT枠の編集（V2-B）**: MOVEツールで**枠線かC#ラベル**をクリックして選択（写真より優先。
  枠の内側は写真操作を邪魔しない）。選択枠は 内側ドラッグ=移動 / 角ハンドル=リサイズ(16:9固定) /
  Delete=削除。離した瞬間に自動で再ベイク（`dirtyBase`）。
- **素材はみ出し警告（V2-D2・§5e）**: `bakeRect` のうち写真に覆われていない領域を
  BOARD上に**赤ハッチ**（選択中/現在カットのみ）。該当カットは SHEET行に **⚠**。
  警告のみで自動補正はしない。判定は 48×27 の粗いグリッド（`cut.covGrid` / `cut.uncov`）。
- **カメラ枠列の編集（V2-D1）**: 枠を選ぶとBOARDパネルに枠列が出る。
  `＋枠` で次の枠（B, C…）を作り、BOARD上でドラッグして行き先を決める＝
  **B枠がAより小さい=T.U. / 位置違い=PAN / 両方=PAN+T.U.**（プリセットは持たない）。
  各行で **dur（次の枠までのコマ数）/ ease（LINEAR・EASE・HOLD）/ ★（カラースクリプトに出す枠）/ 削除**。
  通しフレーム（0f / 72f …）は表示のみ。`余` スライダーが `bakeExpand`（1.00〜1.50）。
- SHEET側の **⟳（再ベイク）** で、同じ `src` から現在のBOARD内容を再切り出し
  （「枠があと」「切り直したい」に対応）。
- **統合Undoログ（V2-B）**: `gLog = [{type, undo(), redo()}]`。type は photo-add / photo-move /
  photo-del / photo-rot / photo-filter / cut-add / cut-rect / cut-del / paint。
  STUDIO の Ctrl+Z/Y はこのログ、EDIT内は従来のカット別スナップショット。
- **ペイン幅（V2-B同時）**: BOARD⇔中央⇔SHEETパネルの境界をドラッグで幅変更（ダブルクリックで既定）。
  `gUi.boardW/sheetW`(%) に永続化。中央プレビューは最低320px確保でクランプ。

### REF BOARD 連携（`photo.ref`・SPEC_13 §2-1a）

- `photos[]` に `ref: {refId,url,svc,title,memo,tags[]} | null` を1つ足しただけ。
  **`cut` 側には持たせない**（カットの参照一覧が要るときは `src`/`bakeRect` に重なる
  `photos[].ref` をその場で集める＝導出値。「同期を作らない」原則を崩さない）。
- 受信: `BroadcastChannel('refboard_live')`（同一オリジンのとき即時）＋
  `localStorage['refboard.clip.v1']`（後から econte を開いた場合の受け皿）。**両方見る**。
  `v!==1` と **ts が24時間以上前**は無視（貼り忘れの誤爆防止・起動時はlocalStorageごと破棄）。
- 写真が増えたら**先頭1枚だけ**に ref を付けて棚を空にし、`clip-used` を送り返す
  （ref-board 側が受信して棚を消す）。econte 側で解除したら `clip-clear`。
- 選択中写真パネルの **🔗**: ref があれば開く / 無ければ現在のクリップを紐づけ（既存スクショの後付け）。
  ref 付きの写真は BOARD 上の右上角に ice のマーカー。
- file:// 等でチャンネルが繋がらない場合は、トップバーの **⧉ CLIP** から
  ref-board の ⧉ でコピーした `{v,ts,item}` を貼り付ける（手動貼付は ts が古くても受け取る）。

### SHEET — 絵コンテ表（V2-A以降は STUDIO 右の縦パネル）

- 行フォーマット: `C# | 尺 | ⟳✕` ＋ `サムネ | 内容・セリフ(2行省略)`。
  行クリック＝そのカット頭へ seek、ダブルクリック（iPadはダブルタップ）＝EDIT。
- **並べ替えは上下ドラッグ**（`Ctrl+↑/↓` でも可・自動リナンバー・Undo対象）。**▲▼ボタンは V2-E1 で撤去**。
  ドラッグは6pxのしきい値でクリックと区別し、挿入位置に線を出す。
- ＋空コマ追加 / ✕削除 / ⟳再ベイク。
- 尺インプットは `3+12` 形式をパース（不正入力は元値へ復帰）。合計尺を常時表示。
- 常時表示になったため**サムネは `cut.thumb` にキャッシュ**し、絵が変わったとき（`cut.thumb = null`）
  だけ作り直す。加筆・undo/redo・CLEAR・bg変更・再ベイクの各所で null にすること
  （SPEC_13 §5d のサムネキャッシュを V2-A で先取り。LRUはV2-D2のまま）。

### EDIT — 加筆（animator系・仕上げではない）

- **モードは `GRID`（カラースクリプト一覧・主戦場）と `SINGLE`（1カット全面・詰め用）**（V2-E2/E2b）。
  トップバーの `EDIT` は GRID を開き、✎ / ダブルクリック（iPadはダブルタップ）で SINGLE へ。
  GRID のセル＝`cam[].key` の枠（§5h と同じ単位）。**背景は黒・装飾は最小・ホイールで拡縮**、
  行ごとにカラー帯（代表色6色・導出値）とセル上の尺バーが出る。
  **1ストロークでコマをまたいで色を流せる**（触った全カットがUndo1手）。
- **カラースクリプト層 `cut.colorC`（V2-E2）**: 512×288・ベイク空間・**LRU対象外で常駐**。
  `colorBlend`（乗算/通常/加算/発光/オーバーレイ）＋`colorAlpha`。保存は PNG（`colorBlob`）。
  **描く先は `state.paintTarget`（線画 / 色）** で切り替える。GRIDは色、SINGLEは線画が既定。
  STUDIOへ戻ると線画に戻る（プレビュー直描きはP1どおり線画のまま）。
- レイヤー合成: 下地グレー(bg) → baseC → **colorC** → drawC。表示はfitスケール、描画は実寸座標。
- **トレース透かし（V2-C）**: `cut.baseAlpha`（0..1・既定1.0）。`compositeTo()` の
  **baseC を描くときだけ** `globalAlpha` を落とす。ここを通る全部
  （EDIT／プレビュー／サムネ／動画書き出し）に効くのでWYSIWYG。20〜40%がトレース用の想定。
  スライダーは **EDITサイドと STUDIOミニツールの両方**（対象カットは EDIT中＝編集中カット／
  STUDIO＝プレイヘッド位置のカット。`activeCutIndex()`）。
- **ズーム/パン（V2-C）**: `state.editView = {x,y,z}`。ホイール=カーソル中心ズーム（0.25〜12倍）／
  1本指=パン／2本指=ピンチ拡縮＋パン／FITボタンでリセット。
  実装は editCv の **CSSの width/height と transform だけ**を動かすので、
  `toCanvasCoord()`（getBoundingClientRect ベース）は**変更不要**。カット切替でズームは維持される。
- **指=操作・ペン=描画（V2-C）**: `paintDown()` は `pointerType === 'touch'` を描画に通さない。
  ペンとマウスだけが描く（animatorと同じ操作感）。STUDIOプレビューは指では何も起きない。
- **2本指タップ=UNDO / 3本指タップ=REDO（V2-C）**: 全部の指が250ms以内に上がり移動<12pxならタップ。
  window の capture 段で拾うので EDIT/STUDIO どちらでも効く。判定が出たら直前のピンチ/パンを打ち切る。
- ツール: PEN / ERASER / FILL（合成色を境界判定して drawC に書く）/ EYEDROP。
  手振れ補正なし。ブラシサイズ 1–64。
- **FILLパレット＋Altスポイト**: animator正準（skill `animator-color-palette`）を移植。
  localStorage キーは `econte_palette_v1`。スポイトは合成色サンプリング＋選択スロット上書き。
  **V2-A で正準から意図的に逸脱**: 色を選んでも塗りツールに切り替わらない（SPEC_13 §3-3）。
  ペンで描きながら色だけ拾う頻度が高いため。`＋`（スロット追加）も同様に切り替えない。
- **TOOLパネルの左右入替**（V2-A・SPEC_13 §3-2）: `gUi = {side, sheet}`／localStorage `econte_ui_v1`。
  EDITサイドバー（`#edit-main.side-right`）と STUDIOミニツール（`.right`）が同時に反転する。
- 下地グレー: スライダー(0–255)＋白/グレー/黒プリセット。白ペイントも可能。
- UNDO/REDO（drawC スナップショット、カット毎、上限30）。CLEAR DRAW / CLEAR BASE
  （BASEはモーダル確認・Undo対象外）。◀▶で前後カットへ。
- ショートカット: B=PEN / E=ERASER / G=FILL / I=EYEDROP / [ ] =ブラシ / Ctrl+Z/Y。

## 保存（IndexedDB `econte_db_v1`）

- store `photos`: {id, name, x,y,w,h, blob, rot, filter, ref}
- store `cuts`: {id, order, cam, bakeRect, bakeW, bakeH, bakeExpand, bakeClamp, bg, baseAlpha, durF, note, baseBlob, drawBlob}
  （`src` は V2-D1 で廃止。旧レコードは読み込み時に自動変換して `meta.ver = 2` を書く）
- **V2-D2以降、読み込み時にビットマップをデコードしない**（Blobが正）。
  必要になったカットだけ `ensureResident()` で復号し、LRU（既定8カット）で追い出す。
  追い出す前に dirty を焼き付ける：**drawC = PNG（線画）／baseC = 素材が完全に覆っていれば JPEG q0.85、
  欠けていれば PNG**（透明部分が黒くなるため。`cut.baseOpaque` が判定＝§5e の被覆計算の副産物）。
- store `meta`: BOARD視点(pan/zoom)・選択状態
- debounce保存。ビットマップは dirty のカットのみ再エンコード。

## 出口

- **プロジェクトZIP（V2-E1実装済み）**: `project.json` ＋ 写真の原本 ＋ 加筆(drawC)。
  **ベイク(baseC)は含めない**（BOARDから再生成できる派生物。入れると数十MBになる）。
  読み込み時に `rebakeFromCam()` で焼き直す。JSZipをCDNから遅延ロード。
- **動画コンテ WebM/mp4（P1実装済み）**: カット番号・尺 焼き込みON/OFF・実時間録画
- animator REF（PNG＋尺メタ、`tdr_live`ライブ渡し）… P2
- **カラースクリプト一覧PNG**（グリッド・既定4列・セル480×270）… P2 / 仕様確定は SPEC_13 §5h。
  **単位は「カット」ではなく「カメラ枠」**（`C1-A` / `C1-L` が各1セル、下に `A→B 60Fr`）。
  枠が多い複合カットは `cam[].key`（既定＝始点と終点のみ true）で間引く。カット境界に区切り線。
  **プリント前提にしない**（絵コンテ用紙の体裁・ページ分割は作らない。画面で色設計を見るためのもの）

## 検証

`tools/check.js` の FILES に `econte.html` を追加済み。変更後は必ず:
```
node tools/check.js
```

## 制限（P0/P1）

- ~~EDITビューはズームなし（fit表示のみ）~~ → V2-C でズーム/パン実装済み。
- BOARDの写真は矩形配置のみ（回転なし）。
- Undo は drawC（加筆）のみ対象。BASE破棄・写真移動・尺変更は対象外。
- 動画書き出しは実時間（2分のコンテなら2分かかる）。非表示タブでは進まない。
- 音声（BGM/仮アフレコ）は未対応（欲しくなったら composer の audio 系を移植）。
- **大判（V2-D2・実装済み）**: ベイク密度は `CONTE_W / min(cam[].w)`（＝**最寄り枠が等倍**）。
  1カットのベイクは `MAX_AREA = 3840×2160` でクランプし、効いたカットは
  SHEET行と中央に「0.82x」等と表示（自動でカットを割ったりはしない）。
  FIXカット（枠1つ）は `bakeExpand` を掛けないので **1280×720 の等倍のまま**。
  大判カットは通常カットの約9倍のメモリを食うため、**遅延デコードLRU（既定8カット常駐）が前提**。
