# CLAUDE.md — Animation Paint（ANI × OBN × COM）

ブラウザベースの日本アニメ作画特化エディタ群。**ANI**mator（作画）× **OB**a**N**（モーションコミック）× **COM**poser（合成/書き出し）の3ツール。単一HTMLで完結、IndexedDB自動保存、Chrome / iPad Safari 対応。

## ファイル構成（リポジトリ直下）

アプリ本体（単一HTML）:
- `animator.html` — メインの作画エディタ（実体。最重要）
- `oban-builder.html` — OBAN BUILDER **SPECIAL EDITION（新UI・既定）**。モーションコミック製造機（画像→PLACE→TAKE→単一HTMLビューア書き出し）。パイプライン上は animator と composer の間。
  UI リデザイン版（ゲーム風・操作明快）で、**描画エンジン（canvas / TAKE / DOF / 書き出し）は従来版と同一**。3テーマ切替あり。UI 規約は `OBAN_BUILDER_UI_HANDOVER.md`
- `oban-builder-classic.html` — 従来UI版（差し替え前の実体を温存）。**エンジンも `localStorage['oban-project']` も共通**なので、作業中のプロジェクトのまま行き来できる。
  相互リンク: 新UI = ⚙ SETTINGS ▸ FILE／連携 の `CLASSIC UI`（`#b-classic`）／ 従来版 = `#bar-right` の `NEW UI`（`#b-se`）
- `composer.html` — マルチトラック合成（カメラ/キーフレーム/書き出し）
- `manga-plate.html` — **MANGA PLATE v2。漫画ページ＆コマ割り**（ジャンプ規定B4 600dpi・多角形コマの縦/横/斜め分割・コマ内マスク・境界効果・ページ一覧・**左右見開き作業**・グレー→網点。SPEC_09 §v2 / §v2-6b）
- `econte.html` — ECONTE。プリプロ（紙ネーム写真→BOARD切り出し→SHEET絵コンテ→加筆。SPEC_10。パイプライン上は animator の前）
- `index.html` — ランディングページ（**OBAN 追加予定**）
- `inbetween_lab.html` / `inbetween_warp_lab.html` — 中割り実験ラボ
- `tools/check.js` — 依存ゼロのスモークチェック（構文/配線/ID重複/デッドコード）
- `verify/` — VERIFY HARNESS（決定論VRT＋パフォーマンス予算。SPEC_08）。
  **ANIMATOR / COMPOSER / OBAN BUILDER 実装済み**。詳細は [verify/CLAUDE.md](verify/CLAUDE.md)

ドキュメント（ハンドオーバー／仕様）:
- `ANIMATOR_HANDOVER.md` — animator 実装メモ／設計履歴（深掘りはこちら）
- `COMPOSER_HANDOVER.md` — composer 実装メモ
- `OBAN_BUILDER_HANDOVER.md` — OBAN BUILDER 実装メモ（旧 OBAN_BUILDER/CLAUDE.md）
- `ECONTE_HANDOVER.md` — econte 実装メモ（cuts[]共有ペイント・TIMELINE書き出しの注意点）
- `MOTION_COMIC_SPEC.md` / `EXPORT_WEB_SPEC.md` — モーションコミック／WEB書き出し仕様
- `PIPELINE.md` — 3ツールの入口/出口フォーマット表。**入出力を変えたら必ず更新**。新ルート探しはまずここ
- `GUIDE_MANGA_LINKS.md` — ANIMATOR⇄MANGA PLATE⇄OBAN/COMPOSER の**手順書**（人間向け・ボタン名で追える）。
  仕組みは SPEC_09、入出力の一覧表は PIPELINE.md、実際に押す手順はここ。連携ボタンの表記を変えたら更新すること
- `SPEC_01_OBAN_TAKE_RIG.md` — 大判カメラTAKE化の元仕様（SPEC_01 P2 = OBAN BUILDER）
- `SPEC_05_OBAN_BUILDER_V2.md` — OBAN BUILDER V2 拡張仕様
- `SPEC_06_SATSUEI_KIT.md` — 撮影処理キット（fx共通スキーマ・composer/OBAN統合）
- `SPEC_07_ANIMATOR_OBAN_BRIDGE.md` — animator⇄OBAN 連番往復ブリッジ仕様
- `SPEC_09_MANGA_PLATE.md` — MANGA PLATE 仕様。**v1=パラメトリック素材（P0〜P4実装済）／§v2=ページ・コマ割りツール（2026-08-13 実装済）**。
  v2の要点: コマ＝多角形＋半平面クリップ分割（間隔は線の向きで lr/tb を補間）・`panelId` の有無だけで「コマ内マスク／枠の上」が決まる・
  **連携は `tdr_exchange`＋`tdr_live` に相乗りするだけで animator/composer/oban の改修ゼロ**・保存はIndexedDB（dataURLのため）／
  **§v2-12（2026-09-02）= コマ番号の打ち替え**（◆Items の「コマ N」を Wクリック/Wタップ・`pg.manualOrder` を立てたページは `sortPanels()` が触らない。
  `onDoubleActivate` は**キー付き**になった＝1タップ目でリストを描き直しても2回目を拾える）／
  **§v2-13（同日）= レイヤー送り・奥行き・ぱかぱか・描き足し**。
  `it.z`(bg/mid/fg)＝**転送用のタグで紙の見た目は変えない**／`▶▶ OBAN レイヤー`＝選択コマを 地/奥/中間/手前/枠の上 に分けて
  **1レイヤー=1レコード＋束ねる manifest**（`plate.layers[]`）で送り、OBAN は **フレーム＋子パネル**にする（`childRect` の depth 差＝コマ内パララックス）。
  **§v2-14 で寄り（T.U.）も出るようにした**＝フレームの `zpar`（インスペクタの `Z`）。`cz = spread^(2·depth·zpar)` で **一番奥(DEPTH 0)が基準**（0.5基準にすると奥が縮んでマスクから欠ける／奥基準なら `cz>=1` で寄るほど余裕が増える）。**既存フレームと手置き `+ FRAME` は 0＝従来と1pxも変わらない**・MANGA PLATE のレイヤー送りだけ 1。`z<=1` では zpar に関係なく従来と一致。`verify:oban` は 0.000%／のりしろ `BOOK.link.pad` がフレームのマスクからはみ出す分＝欠け防止／
  `it.pk` の**ぱかぱか**は `cells` を n枚・`duration=step` にするだけで **OBAN 側の改修ゼロ**（`apIngest` が展開して2コマ打ちになる）。
  **紙の書き出しは常に `gPkFrame=0`＝従来と1pxも変わらない**／**§v2-15 = ぱかぱか層だけ画素を落とす**（`BOOK.link.pkRes`・既定70%）＝**レコードの `width/height` は full のまま**で PNG だけ縮める＝受け側は引き伸ばすだけなので下流は無改造。OBAN はなめらか・COMPOSER はニアレストなので差が倍つく（実測表は SPEC）／描き足しは**別アプリを作らず** ANIMATOR 往復にのりしろと枠ガイドを足した
- `SPEC_10_ECONTE.md` — プリプロツール仕様（cuts[]単一データ・BOARD/SHEET/TIMELINE設計。P0+P1実装済み、P2=animator連携/カラースクリプト）
- `SPEC_13_ECONTE_V2.md` — ECONTE V2「STUDIO」仕様（1画面統合・BOARD強化・**大判カメラ枠列＋可変ベイク**・MP4書き出し・カラースクリプト・iPad操作。**V2-A〜D3・E1・E2(a〜d) 実装済み（2026-08-09）／E3 フォトバッシュも 2026-08-19 に片付いた——ただし §9c の `cut.layers[]` ではなく SPEC_15 P2「浮いた選択」で**）。※§5は2026-07に差し替え済み（旧「のりしろ1.2x固定＋カメラプリセット」は廃止）。**画面の役割（STUDIO=プレビュー+コラージュ／EDIT=単票+カラースクリプト一覧）は §9 で確定済み。着手前に §9 を読む**
- `SPEC_15_ECONTE_V3.md` — **ECONTE V3「ペイントの一本化」。P1＋P3-1（2026-08-18）／P3-2〜P3-4 は SPEC_16 §5-B ／P2 フォトバッシュ（2026-08-19）＝すべて実装済み・残タスクなし**。
  ⚠ **P1 の `cut.plateC`（カット1枚）・`plateScale`・`plateSize` は SPEC_16 V4 で撤去済み**。以下は経緯として読むこと。
  P1=カラー層を「枠ごと・出力枠512×288」から**カット1枚・ベイク空間（`cut.plateC`）**へ一本化（line と同じ扱い＝T.U./PANに追従。`colorMixAt`/`drawColorFrame`/`drawColorPlate`/`frameAtBake`/`plateStrokeSeg` は削除済み。**座標は必ず `plateScale(cut)` を通す**——`PLATE_MAX` で頭打ちしたカットは 0.4 ではない）／
  P3-1=濃・描画モードは全体設定 `gPaint`（`UI_LS`＋ZIP `meta.paint`）——**P1で色から per-slot 値が消えるので同時にやるしかない**／
  P2=軽いフォトバッシュ＝**「浮いた選択」**（**`cut.layers[]` は不採用**）。SEL(`A`)で投げ縄→持ち上げ→変形→Enter確定・Esc取消。
  **SINGLE 限定**（他画面ではグレー＋PENに戻す）。中身は紙の1枚として持ち上げ、確定は**重なる枠ぶん全部のパッチへ**（投げ縄塗りと同じ配り方）。
  **持ち上げ元＝Shiftなら REF・それ以外は描く先／焼き込み先＝つねに描く先**（`floatKindNow`。SPEC_15 P2-4 からの意図的な変更＝**P2-6**）。
  **変形は 箱 + rot + warp。warp の制御点は箱ローカルの正規化 `{u,v}`**（P2-7。ワールドで持つと箱を触るたび作り直しになる）。
  隅=拡縮／Shift=比率維持／隅の外=回転（↻カーソル）／`Ctrl`+隅=射影変換／SEL Wクリック=WARP 3×3（Catmull-Rom）。
  **保存形式もLRUも触っていない**。持ち上げ＋確定で Undo 1手（`txAbort` で Esc はログを汚さない）。メッシュ化してもプレビューは重くならない（実測）。
  戻り先タグ `econte-v2-g3`。**P1 の設計レビューは実物で先に見られる** → `LP_motion-graphics/TOOL_MECHANICS/SPACES_LAB/spaces-lab.html`
  （実装済み 2026-08-18・port 8141）。色の置き場所を「レンズ前 ⇄ セル上」で切り替えて、**寄りながら色が変わる／色が寄る**を同じ動きで見比べられる。
  `plateSize()`（P1-2 の寸法規則）もラボ側で先に動いていて、**B枠にちょうど512px当たる**ことを数値で確認済み。
  ラボは `calcBakeSize` / `strokeScaleFor` / `drawCamFrame` を econte から転載しているので、
  **P1 でこれらを変えたらラボ側も直す**（`SPACES_LAB/CLAUDE.md` の転載表を見る）
- `SPEC_17_INPUT_GRAMMAR.md` — **操作文法の統一（INPUT GRAMMAR）**。ツールキーの押し方（単押し/2連打/長押し/Shift/バネ）と
  投げ縄の囲い方（ドラッグ=フリーハンド / クリック=多角形）の共通文法。**正準は `animator.html`**。
  **実装済み: animator（§2-2）／econte（§2-2b・差分つき）／manga-plate（§2-2c・差分つき）。残り: oban-builder のみ**
- `SPEC_18_IPAD_GRAMMAR.md` — **iPad 操作文法の統一（IPAD GRAMMAR）**。SPEC_17 の iPad 版。
  **第一原則＝指はナビとUI・ペンは描く面だけ。** 数値はここに書いてあるものが**実機の測定値**で、推測ではない
  （測定器 `ipad-probe.html`・iPadOS 18.7 / Safari 26.6・2026-08-26〜27）。**仕様を変えるときは probe で測り直す。**
  決着: **3本指タップは使える**（20回すべて到達・OSの取り消しは一度も発火せず＝OBANの旧コメントは誤り、訂正済み）／
  **4本指=PREVIEW は安全**／**5本指はアプリ切替に化けるので割り当てない**／
  **`preventDefault` は多指タップの到達には不要**（ピンチ・スクロール抑止のためだけ）／
  数値欄は **div スクラブ（Wタップで input を動的生成）が唯一 Scribble を出さずスクラブもできる**
  ——**`readonly` は実機では Scribble を止めたが研究資料2本の記述とは逆**、ただしスクラブと両立しないので正準にしない／
  standalone は **`navigator.standalone` で見る**（`display-mode` は `browser` と出て当てにならない）・
  **`<link rel="manifest">` を張るとホーム画面追加が start_url をインストールしてしまう**／
  safe-area は top 32px / bottom 20px・**Fullscreen API は無いので ⛶ は消す**。
  **P0・P4 実装済み。P1＝composer をパイロット（数値欄・トラック並べ替え・4本指）→ P2 スキル化 → P3 横展開。**
  **P1c（2026-08-31・§4-6）でタイムラインの手つきを整理**＝上端の掴みバーが指で掴めなかった真因
  （`#timeline{overflow:hidden}` が掴み代をクリップ。`#app` 直下へ出して解決）／
  トリムは `bottom:23px` でキー帯を空ける（1コマ目の「端かキーか」問題）／
  **トリム＝ペン専任・並べ替え＝指専任**／矩形選択はマウス専用にして
  **「1つ押さえたまま次々タップ」で複数選択**（キー・トラックとも）／
  **複数選択のまま ⠿ でまとめて並べ替え**（従来は押した時点で単体に畳んでいた）／
  ラベル帯の**左スワイプで ⧉複製 / ✕削除**（指では行の ✕ を隠す）／
  **タイムライン伸縮はルーラーを指1本でこする**（3本指ドラッグは廃止・3本指タップ=REDOは存続）。
  **P1d（同日・§4-7）で手つきを再配分**＝**トラックの横移動は指2本**（長押しは廃止）→ 空いた指1本で
  **トリムを指でも掴める**／**ペンで動かない・選べないの真因は `pointermove` の `!e.buttons`**
  （キー・トリム・マーカー・WAの4か所。pointerIdで固定し保険はマウスだけ＝§6-14を全面適用）／
  **指でトラックを押さえたままペンでキーを次々タップ＝追加選択**／
  **`user-scalable=no` は iOS で無視される**ので `touch-action:manipulation` でWタップ拡大を、
  `overscroll-behavior` でゴムバウンドを止める／ADD KF・RESET KF は INSPECTOR 最上段（畳むとそこでスナップ）
  **§4-5 = ANIMATOR の「線上に点々と残る太い粒」の真因**＝`pressureRadius` の `pressure || 0.5` が
  **筆圧ちょうど0のサンプルを 0.5（中くらいの太さ）に化かしていた**（実測で1ストローク1363点中37点が0）。
  左レール `PRS` の下に **`SM` トグル（RAW → EMA → EMA+）** を追加。**既定 RAW ＝従来と完全に同じ**なので、
  描き比べて好きなほうを選べる（`localStorage['animator_pensmooth_v1']`）。
  §6 に「probe を作って実際に踏んだ落とし穴7件」（getCoalescedEvents が空配列を返す・setPointerCapture が投げる 等）
- `SPEC_16_ECONTE_V4.md` — **ECONTE V4「枠ごとの画」。§1〜§3＋§5-B＋E1＋§5-C(C1〜C10) 実装済み（2026-08-18〜19）。残りは §5-D（iPad）だけ**。
  画は **枠（`cam[k]`）ごとに1枚**（`cut.fr[k] = {line 1280×720, plate 512×288, rect}`。`cam[]` と1対1・`ensureFr()` を必ず通す）。
  写真（`baseC`）だけ全枠で共有。パッチは **紙（ベイク空間）の上に `camBakeRect(cut,k)` の位置で置く**ので
  T.U./PAN に追従する（V3-P1 の土台のまま＝旧V2のフェードには戻らない）。描画の入口は **`drawPatchStack()` 1本**。
  **§2a は (b)＋入れ子（T.U./T.B.）のときだけ下を隠す**＝`patchHides()`（PANは重ねるだけ）。
  **GRIDのセル／SHEETサムネ／C.SCRIPT は `drawCellFrame()`＝自分の枠のパッチだけ**（§3-3）。
  その帰結で「Aセルには描けるが TIMELINE では B が総取りする」領域ができるので、**Aセルに破線で出す**（`drawTakeoverGuide`）。
  ブラシ補正（旧 `strokeScaleFor`）は**消えた**——パッチが出力等倍なので `brush` px がそのまま出力px＝GRIDでまたいでも同じ太さ。
  保存は IndexedDB `cut.fr[]` ／ ZIP **`ver:4`**（`cuts/<id>.f<k>.line.png` / `.plate.png`）。ver3・ver2 は読み込み時に変換。
  **E1**: ペイントUndoは**変更した矩形だけ**（`txBegin`/`txTouch`/`txEnd`）＝12手 → **80手**。EDIT の Undo は1本化（`gColorLog`）。
  **§5-B**: 描く先/ブラシ上限は画面移動で変えない・**econte だけ FILL 廃止で常時投げ縄**（スキルは触らない意図的逸脱）・
  ペンはスライダー等を掴まない・パレット縦3行・CUTSは目アイコンのみ。
  **§5-C5 画ブレ**: `cut.shake = {a0,a1,freq}` の**カット1組・キーは打たない**（頭→尻で強さが直線に変わる＝
  強めていく／弱めてブレがなくなる）。揺れ幅は**枠の幅に対する割合**、値は**コマ番号から決まる**（乱数を持たない＝
  再生・書き出しで同じ）。乗るのは `drawCamFrame`（出力）だけで、`drawCellFrame`（GRID/サムネ/C.SCRIPT）は揺れない。
  UI は BOARDの枠選択バーの **∿**、SHEET の行に **∿** マーク。
  **§5-C6 イーズ**: 区間ではなく **キーごと**（`cam[k].eo` / `.ei` / `.hold`。0〜100）＝**COMPOSER が正準**で
  `bezierEaseT` はそのまま転載。**◆をクリックでそのキーの緩急**（ドラッグ＝尺の配分とは「動かさずに離したか」で切り分け）、
  ◆の形は COMPOSER 合わせ（菱形=なし/角丸=中/丸=最大/灰の四角=タメ）。区間バーは現場の名前の早撃ち入口として残す。
  旧「区間に1つの名前」は `migrateEase()` が開き、**旧 IN/OUT の名前の逆転もここで直る**。
  **§5-C10 読み戻し／リファレンス取り込み**: **新しい層は足していない**——BOARD の写真がそのまま参照なので、
  「写真を置いて 16:9 の枠を自動で合わせる」だけ。**落とす場所で意味が決まる**（BOARD＝写真 / SHEET・`+ カット`＝1枚=1カット）。
  **書き出したカラースクリプトPNGは `csGeometry()` が寸法式を逆に解いて自動で格子に分ける**
  （空き升目はキャプションの有無で落とす。読み戻しの画素差 0% を実測）。
  ★ `exportColorScript` の数値を変えたら `csGeometry` の定数も直すこと。
  枠は升目に固定して画像を contain（逆にすると縦長画像で**隣の参照まで焼き込む**）。`baseAlpha=1`・取り込み全体で Undo 1手。
  **動画→連番写真はユーザー判断で見送り**（`importAsCuts()` が画像の配列を受け取る形なので、後から足すのは容易）。
  **§5-E 手つきの整理（2026-08-24）**: 実機で触って出た引っかかりの是正。**データも保存形式も触っていない**——
  書き出しは**同じボタンをもう一度押すと中断**（動画・C.SCRIPT とも）／`▶ IMPORT`（写真）と `▶ C.SCRIPT`（1枚=1カット）／
  **CUT枠の選択＝水色・写真の選択＝グレー**（§5-C9 の逆に戻した）／写真は**選ばれていなければ一触りでは動かない**／
  写真の DEL は撤去＝Delete キーへ一本化（指の端末だけ 🗑）／REF解除は **🔗＋斜線**・🔗/⇄/🔗̸ は GRAY と別の一群／
  **L＝SHEETロック・Ctrl+L＝全解除**（LOOP のキーは廃止。keymap LS は `_v2`）／投げ縄の点灯は ANIMATOR と同値／
  **パレットはスクロールしない**（§5-B5 撤回）／TIMELINE は**ホイール押しドラッグで横移動**／
  **◆の緩急は Wクリック**（COMPOSER 合わせ。§5-C6 撤回。ネイティブ dblclick は来ないので自前判定）／
  ミニツールを畳むのは **PENの手前の ✕**／**BOARD でも Alt+クリック＝スポイト**／
  **現在色スウォッチ＝画面全体スポイト**（`EyeDropper` API・ブラウザの外も可・Chrome/Edge）／
  **SEL のコピー／ペースト**（`gSelClip`。別カットへ運べる）。
  **§5-F 追い調整（同日）**: ◆のWクリックが効かない真因は **FIXカットの飾り◆が当たり判定を持っていて、
  T.U./PAN の B キーのクリックを食っていた**こと（`pointer-events:none` で解決。Wクリック窓も 900ms/40px へ）／
  **GRID の Ctrl+A・Ctrl+D**／ペイント系キーは修飾キー付きで撃たない（**Ctrl+A が黙って SEL にしていた**）／
  **「余」を SETTINGS から BOARD の枠バーへ移設**（効く先を覆うモーダルの中にあって変化が見えなかった）＋
  **焼く範囲を BOARD に紫の破線で常に表示**・FIXカットではグレー＋値 `—`。
  **§5-G 操作文法を ANIMATOR に揃えた（SPEC_17・同日）**: キーの押し方4通り＋バネ（単押し=選択／2連打=ボタンのWクリック／
  長押し=ボタンの長押し／Shift+=直行／押しっぱなし→離す=その間だけそのツール）。**`G`の2連打だけは割り当てない**
  ——econte は FILL廃止で常時投げ縄＝ANIMATORの「2連打＝投げ縄⇔バケツ」に当たる相手が居ないため。
  投げ縄消しは **G長押し / Shift+G**。`P` を PEN の別名に追加（`B` も残す）。
  **投げ縄はクリックで始めると多角形**（Enter/始点/Wクリックで確定・Escで捨てる。Alt+クリックはスポイトなので使わない）。
  `stageToast()` を追加（ステージが2つあるので class で持ち、出ているほうへ）。
  ★ボタンとキーは**同じ関数**を呼ぶ（`wire()` の無名ハンドラをトップレベルへ出した）。
  **残り: §5-D（iPad）だけ**
- `SPEC_11_COMPOSER_POLISH.md` — COMPOSER磨き込み仕様（**P0〜P7 すべて実装済み**。残タスクなし。P7=出力解像度のアスペクト保持／のりしろ1.2／Zソート／フォルダ書き出し／タイムライン時間軸ズーム）
- `SPEC_14_TIMELAPSE.md` — ANIMATOR 作画タイムラプス仕様（自動記録・専用ストア tl_shot・リングバッファ・**WORK/CELL 2通りの見せ方**・WebM書き出し。**P0〜P2 すべて実装済み。残タスクなし**（P3=区間トリム等は任意・将来））
- `SPEC_12_PARALLAX_TAKE_BRIDGE.md` — PARALLAX_LAB×OBAN/COMPOSER **連携ズレ解説機**仕様（TAKE JSONを貼ると同一カメラワークを ①OBAN撮影台／②COMPOSER Zドリー／③COMPOSER SCL で並べて再生。「なぜそのまま繋ぐとズレるか」を見て触って理解する道具）。**実装先は `LP_motion-graphics/PARALLAX_LAB/`**、本リポジトリ側は `planeZoom`/`pf`/`buildComposerJSON` を変えたらSPECの数値表を更新する義務のみ。P0/P1/P2未着手。**2026-08-15 に `planeZoom` 新式・COPY FOR COMPOSER 実装済みを反映して全面改訂**（§1にズレの実測表・§9に数値テストスクリプト）

スキル（`.claude/skills/` — このフォルダ配下で作業するときだけ有効）:
`animator-color-palette`（FILLパレット＋Altスポイト） / `animator-ref-overlay`（参照画像＋FRAME下絵） /
`composer-timeline-kit`（ショートカット登録・座標規約・WA・マーカー・KFコピペ） /
`floating-panel-kit`（パネル移動・▾最小化・項目スナップ・高さフィット・前面制御） /
`animator-brush-ops`（右ドラッグでサイズ・PEN/FILL/ERASEのWクリック・FILL長押しで投げ縄・Altスポイト・TAB）。
いずれも animator/composer の実装が正準。**最終照合 2026-08-10**（実コードと突き合わせ済み）。
実装を大きく変えたら、対応するスキルの references も同じコミットで直すこと。

> ⚠ **`.claude/` は `.gitignore` 済み＝スキルは git に乗らない。**
> 2台目PCへは手動コピーが要る（`_Claude/SKILL/` に配布パッケージを置く運用）。

GitHub: https://github.com/maso1737/ANIxOBNxCOM
Pages: https://maso1737.github.io/ANIxOBNxCOM/

## 残タスク・予定タスク一覧（Claude Artifact）

https://claude.ai/code/artifact/a57e3c0b-064f-4e1b-97d2-a158602ab07b

各SPEC/HANDOVERを横断した「まだ終わっていないもの」の棚卸しページ。
**新チャットでこのページを更新するときは、必ず上のURLを Artifact ツールの `url` に渡すこと**
（渡さずに新規publishすると別URLが発行され、ここのリンクが古くなる）。

## トップバー右端の並び（3ツール共通・2026-08-13）

**プロジェクト入出力は必ず ⚙ の左隣**。ツールを渡り歩いても同じ場所にあるようにする。

```
… [プロジェクト入出力] [⚙ 設定] [⛶ 全画面] [HOME]      ← HOME は常に一番右
```

| ツール | 入出力ボタン | 備考 |
|---|---|---|
| `manga-plate` | EXPORT JSON / IMPORT JSON | 880px以下は `⇩JSON`/`⇧JSON` に短縮（iPad縦でHOMEまで届くこと） |
| `oban-builder`（新UI） | ⇧ EXPORT JSON / ⇩ IMPORT JSON | **⚙ SETTINGS ▸ FILE／連携** の中（バーには置かない） |
| `oban-builder-classic` | EXPORT JSON / IMPORT JSON | `#bar-right` の中 |
| `econte` | ⇩ PROJ / ⇧ PROJ | **ZIP**なので表記は PROJ のまま（形式が違うものを同じ名前にしない） |

`animator` / `composer` は入出力の性格が違う（ANIMATOR_v1・PROJECT_v2・連番・動画）ので**この並びには揃えない**。

## 変更後に必ず行うチェック
```
node tools/check.js
```
6ファイル（animator / oban-builder / composer / index / manga-plate / econte）すべての 構文 / JS→HTML の id 配線 / id 重複 / 未参照関数 を一括検査（問題があれば exit 1）。※type属性の無い `<script>` のみJS扱い（`type="application/json"` 等のデータブロックは除外）。実機確認は Pages か `file://` で。

**描画・合成まわりを触ったら、続けて見た目の回帰検査も走らせる**（SPEC_08）:
```
cd verify && npm run verify:animator
cd verify && npm run verify:composer
cd verify && npm run verify:oban
```
コマ送り6点を作業解像度そのままで撮って前回の承認済み画像と比較する（PASS=0%）。
意図した変更で差分が出たら `UPDATE_BASELINE=1 node harness/runner.mjs verify.<tool>.config.json` で承認。
`artifacts/summary.json` だけ読めば合否と崩れた位置が分かる。詳細は [verify/CLAUDE.md](verify/CLAUDE.md)。

## デプロイ
- `animator.html` / `composer.html` を直接編集 → 構文チェック → **明示依頼があったときのみ** master に commit & push。
- コミットメッセージ末尾に:
  `Co-Authored-By: Claude <noreply@anthropic.com>`

## 開発スタイル
- 単一HTMLで完結。外部依存は CDN（JSZip 等）のみ。
- 変更は Edit（差分）で最小限に。全書き換えは避ける。
- 短いプロンプト＋即実行。push は依頼時のみ。
- 大きい/不可逆な変更（キャンバスのピクセルパイプライン等）や性能トレードオフがある場合は、先に方針を確認。

## アーキテクチャ要点
- **解像度**: `CFG.WORK_W/WORK_H` は**可変**（左上ラベル/設定パネルで変更。上限≒4K面積 `CFG.MAX_AREA`）。各コマは `drawData`(Uint8ClampedArray, W×H×4)。書き出しは作業解像度そのまま。
- **レイヤー**(canvas, すべて WORK サイズ): bg / ref / frame / onion×2 / draw / guide。`setupCanvas()` で一括リサイズ、`applyZoom()` で表示スケール＋`renderGuides()`。
- **state**: ツール/ズーム/frames/再生/guides など一元管理。タイムライン履歴は `tlHistory`、Undoは `gUndo/gRedo` の一元ログ。
- **保存**: IndexedDB（差分・debounce）。meta に workW/workH・guides・ワークエリア等。**DB v5**（v5で作画タイムラプス用の `tl_meta`/`tl_shot` を追加。作画データ側のストアは不変）。
- **ショートカット**: `SHORTCUT_ACTIONS` 登録制＋`gKeymap`(localStorage)。設定パネル⚙で再割当。
- **FILL PALETTE**: `gPalette`(localStorage `animator_palette_v1`)。スロット選択中にスポイトで上書き、＋/−/JSON入出力。
- **ライブ連携**: `BroadcastChannel('tdr_live')`。ANIMATOR保存→COMPOSERへ project-update。COMPOSERは projectId一致トラックの絵だけ差し替え（KF/transform保持）。`→ COMPOSER` は別ウィンドウで開く。**OBAN も同じチャンネル・同じ語彙に参加**（animator から見ればもう1つの composer。詳細は SPEC_07）。
- **ガイド**: 解像度枠/セーフフレームは `guide-layer` に表示のみ（書き出し非合成）。
- **座標/入力**: 全ポインタ処理は `#stage` で一元化。`toCanvasCoord()` が flip/mirror 換算。

## 既知の制限
- ライブ連携は同一ブラウザ・同一オリジンのタブ間のみ。
- キャンバス拡大はメモリ×コマ数で増える（8Kは多コマ不可。上限4K面積）。

## 整理メモ（2026-07 統合時）
- 旧 `LP_motion-graphics/` から本フォルダへ統合。`oban-builder.html` は元 `OBAN_BUILDER/` から**ルート直下へフラット化**したため、SPEC_06/07 中の `OBAN_BUILDER/oban-builder.html` という記述は本フォルダでは `oban-builder.html` に読み替える。
- LP 個別プロジェクト（SCROLL_*_LP 等）や AP 非関連の SPEC_02/03/04 は `_済/` に退避済み。
