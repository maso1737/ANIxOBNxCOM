# SPEC_10 — ECONTE（プリプロ：ネーム→絵コンテ→動画コンテ）

紙のネーム/漫画ラフから絵コンテ・動画コンテまでを1本で行き来するプリプロツール。
ファイル: `econte.html`（単一HTML・IndexedDB自動保存・Chrome / iPad Safari）。

## 核心設計 — 「同期」は作らない

**カット配列 `cuts[]` を唯一のデータ**とし、BOARD / SHEET / TIMELINE は同じ配列の
別ビューにする。画・尺・コメントはどのビューで触っても同じデータに書くため、
ビュー間の「反映処理」は存在しない（＝同期バグが構造的に起きない）。

```
cut = {
  id,                    // 一意ID（採番はカット順から自動: C1, C2, ...）
  src: {x,y,w,h}|null,   // BOARD座標での切り出し元矩形（再ベイク可能。空コマは null）
  baseC: canvas|null,    // 切り出しベイク（1280×720）。CLEAR BASE で破棄可
  drawC: canvas,         // 加筆レイヤー（1280×720・透過）
  bg: 0..255,            // 下地グレー（255=白）
  durF: int,             // 尺（コマ数, 24fps）。表示は「秒+コマ」（例 3+12）
  note: string           // 内容・セリフ
}
```

- コンテ解像度は **1280×720（16:9）固定**。`CONTE_W/CONTE_H`。
- 尺の表記は作画慣習の **秒+コマ（24fps）**。`"3+12"` ⇔ 84f。整数のみは秒扱い。
- 規模目安: 15秒〜2分 ≒ カット10〜60。iPadで余裕の範囲。

## フェーズ

- **P0（実装済み）**: BOARD＋SHEET＋EDIT（描画）＋IndexedDB保存
- **P1（実装済み）**: TIMELINE（composer-timeline-kit 移植・クリップ尺⇔SHEET尺・再生・動画書き出し）
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
- ショートカット（`econte_keymap_v1`・kit準拠レジストリ。TIMELINEビューで有効）:
  Space=再生/停止 ／ ←→=±1コマ(Shift=10) ／ Home/End ／ J/K=前後カット頭 ／ L=ループ。
  再割当UIはP2以降（localStorageの手書き編集は可能）。
- **EXPORT VIDEO**: `canvas.captureStream(24)`＋MediaRecorder で**実時間再生を録画**
  （WebM vp9→vp8→mp4の順でフォールバック。Safariはmp4になる想定）。
  「C#/尺 焼き込み」チェックでプレビュー＝書き出しにオーバーレイ（WYSIWYG）。
  書き出し中はSpaceで中断（ファイル破棄）。**タブを前面のままにすること**
  （非表示タブはrAF停止のため録画が止まる）。

## P0 ビュー仕様

### BOARD — 考える場（無限キャンバス風）

- 紙の写真を IMPORT ボタン / D&D で複数投げ込み、パン・ズーム（ホイール／ピンチ）
  の効く場に自由配置。
- ツール **MOVE**: 写真ドラッグで移動（空白ドラッグ＝パン）。
- ツール **CUT**: 矩形ドラッグ（**16:9固定比**）→ その範囲を 1280×720 にベイクして
  新規カット追加。切り出し元矩形 `src` を保持し、BOARD上に既存カット枠（C番号付き）
  を常時表示。
- SHEET側の **⟳（再ベイク）** で、同じ `src` から現在のBOARD内容を再切り出し
  （「枠があと」「切り直したい」に対応）。

### SHEET — 絵コンテ表

- 行フォーマット: `C# | 画（サムネ）| 内容・セリフ | 尺(秒+コマ)`。
- ＋空コマ追加 / ▲▼並べ替え（自動リナンバー）/ ✕削除 / ⟳再ベイク / ✎EDIT。
- 尺インプットは `3+12` 形式をパース（不正入力は元値へ復帰）。合計尺を常時表示。

### EDIT — 加筆（animator系・仕上げではない）

- レイヤー合成: 下地グレー(bg) → baseC → drawC。表示はfitスケール、描画は実寸座標。
- ツール: PEN / ERASER / FILL（合成色を境界判定して drawC に書く）/ EYEDROP。
  手振れ補正なし。ブラシサイズ 1–64。
- **FILLパレット＋Altスポイト**: animator正準（skill `animator-color-palette`）を移植。
  localStorage キーは `econte_palette_v1`。スポイトは合成色サンプリング＋選択スロット上書き。
- 下地グレー: スライダー(0–255)＋白/グレー/黒プリセット。白ペイントも可能。
- UNDO/REDO（drawC スナップショット、カット毎、上限30）。CLEAR DRAW / CLEAR BASE
  （BASEはモーダル確認・Undo対象外）。◀▶で前後カットへ。
- ショートカット: B=PEN / E=ERASER / G=FILL / I=EYEDROP / [ ] =ブラシ / Ctrl+Z/Y。

## 保存（IndexedDB `econte_db_v1`）

- store `photos`: {id, name, x,y,w,h, blob}
- store `cuts`: {id, order, src, bg, durF, note, baseBlob, drawBlob}
- store `meta`: BOARD視点(pan/zoom)・選択状態
- debounce保存。ビットマップは dirty のカットのみ再エンコード。

## 出口

- **動画コンテ WebM/mp4（P1実装済み）**: カット番号・尺 焼き込みON/OFF・実時間録画
- animator REF（PNG＋尺メタ、`tdr_live`ライブ渡し）… P2
- カラースクリプト一覧PNG（サムネ表形式グリッド）… P2

## 検証

`tools/check.js` の FILES に `econte.html` を追加済み。変更後は必ず:
```
node tools/check.js
```

## 制限（P0/P1）

- EDITビューはズームなし（fit表示のみ）。
- BOARDの写真は矩形配置のみ（回転なし）。
- Undo は drawC（加筆）のみ対象。BASE破棄・写真移動・尺変更は対象外。
- 動画書き出しは実時間（2分のコンテなら2分かかる）。非表示タブでは進まない。
- 音声（BGM/仮アフレコ）は未対応（欲しくなったら composer の audio 系を移植）。
