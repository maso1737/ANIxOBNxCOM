# 申し送り — MANGA PLATE ⇄ OBAN の読み文字

更新 2026-08-16。**P0（送り）と P1（受け）は実装済み。**
実装メモは `SPEC_09_MANGA_PLATE.md` §v2-9 と `OBAN_BUILDER_HANDOVER.md`（V2-D テキスト）へ移した。
ここに残っているのは**まだやっていない P2 だけ**。

---

## 済んだこと（要点だけ）

- MANGA PLATE の `▶ OBAN` は、読み文字を**画像に焼かず** `rec.plate.texts[]` で渡す
  （`▶ ANIMATOR REF` / `▶ COMPOSER` は従来どおり焼く）
- OBAN は取り込み時に**1ページ＝1フレーム**へ包み、絵を子パネル・読み文字をフレーム子テキストにする
- OBAN の `texts[]` に `vert`（横書き）/ `font`（アンチック）/ `ew`（縁取り太さ）を追加。既定は従来と同じ
- 実測: 1文字目の位置ズレ **0.03px** / 文字サイズ差 **0.01px**
- **EN字幕（`type:'sub'`）には一切触っていない**

## P2 — 戻り（OBAN → MANGA PLATE）※未着手

OBAN で直した文字を MANGA PLATE に戻したい、と要望が出たら着手する。

1. **先に下ごしらえが要る**: いまの `plateWrap()` は MANGA PLATE 側の `it.id`（送信データの `t.id`）を
   捨てている。戻りをやるなら **`srcId` として控える**こと（これが無いと、どの文字を書き戻すか特定できない）
2. OBAN 側: `commitText()` の確定時に
   `tdr_live` へ `{type:'plate-text-update', projectId, texts:[{srcId,str}]}` を流す
3. MANGA PLATE 側: `setupLive()` の `onmessage` に分岐を足し、`id` 一致の text アイテムへ `str` を書き戻す。
   **座標は書き戻さない**のが安全（用紙座標へ逆変換すると誤差が乗る。位置は MANGA PLATE 側を正とする）

### 判断が要る点（着手前に発注者へ）

- 戻すのは**文字だけ**か、位置も戻すか
- OBAN の色は白/黒しかない。戻すときに MANGA PLATE のパレット色を上書きしてよいか
- `lh`（行間）/ `ls`（字間）は OBAN に無い。戻り時は MANGA PLATE の値を維持でよいか

## 触るときの注意

- `oban-builder.html` を変えたら **`cd verify && npm run verify:oban`**（SPEC_08）
- 入出力を変えたら **`PIPELINE.md` を更新**
- `drawVText` は **builder と viewer の2か所**にある
