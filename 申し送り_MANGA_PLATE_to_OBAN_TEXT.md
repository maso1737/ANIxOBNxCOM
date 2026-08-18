# 申し送り — MANGA PLATE の文字を OBAN で編集できるようにする

作成 2026-08-16 ／ 起票元: MANGA PLATE v2 にテキストツールを実装した回
**このファイルは「まだやっていない作業の指示書」**。着手したら実装メモは
`SPEC_09_MANGA_PLATE.md` と `OBAN_BUILDER_HANDOVER.md` へ移し、ここは消す。

---

## 何がしたいか

MANGA PLATE で置いた**擬音・セリフ（テキスト）を、OBAN 側でも文字のまま編集したい**。
いまは PNG に焼いて渡しているので、OBAN では絵の一部になってしまう。縦書き・横書きの両方。

## いまの受け渡し（変えたくない土台）

```
MANGA PLATE  --[ tdr_exchange(IndexedDB) に PROJECT_v1 を put ]-->  OBAN
             --[ tdr_live(BroadcastChannel) で project-update ]-->
```
- 送っているのは `cells:[{kind:'draw', image:<dataURL>}]` の**1枚絵**（`linkRecord()`）
- OBAN は `＋ FROM ANIMATOR` でこのレコードを拾ってパネルにする
- **この配管は ANIMATOR / COMPOSER と共用**。壊すと3ツールに波及するので、
  既存フィールドは触らず**追加だけ**で済ませること

## 突き合わせ（2026-08-16 実コード確認済み）

| | MANGA PLATE `type:'text'` | OBAN `PROJECT.texts` |
|---|---|---|
| 実体 | `pg.items[]` の1要素 | `PROJECT.texts[]`（`type:'v'`=縦書き / `'sub'`=EN字幕） |
| 文字列 | `text`（改行あり） | `str` |
| 位置 | `x,y`（用紙座標・中心） | `x,y`（親フレーム基準） |
| 大きさ | `size`（px・600dpi基準） | `size` |
| 色 | `color` | `col`（**白/黒トグルのみ**） |
| 縦書き | `vertical:true` | **常に縦**（1文字ずつ縦積み `fillText`） |
| 横書き | `vertical:false` | **無い** |
| 書体 | `font`（0=しっぽりアンチック / 1=同B1 / 2=ゴシック） | **無い**（既定フォント） |
| フチ | `edge{on,w,color}` | にじみ縁取り（4方向シャドウ・太さ固定） |
| 行間/字間 | `lh` / `ls` | 無い |
| 親 | `panelId`（コマ） | `parent`（フレームid・`textsOf(f)`） |

**縦書き・文字列・位置・大きさはほぼ 1:1。** 足りないのは **横書き / 書体 / フチの太さ・色**。

## やること（P0〜P2）

### P0 — 運び方（両ツール・小）
`linkRecord()` の返すレコードに**1フィールドだけ足す**。既存の読み手は無視するので安全:

```js
// manga-plate.html: linkRecord() の rec に追加
plate:{ v:1, texts:[ /* 送るコマ/ページに含まれる type:'text' を、送信時の
                        レターボックス変換（L.scale / L.ox / L.oy）済みの座標で */ ] }
```
- 座標は `linkCanvas()` と同じ式で変換すること（`x*s+ox` / `y*s+oy`・`size*s`）。
  **ここを合わせないと文字だけ位置がズレる**（PNGは変換済みで焼かれているため）
- 送る対象は「そのコマに割り当たっている文字」＋「コマ外＝ページに乗っている文字」の両方

### P1 — OBAN 側の取り込み（`oban-builder.html`・中）
1. `＋ FROM ANIMATOR` の取り込みで `rec.plate.texts` があれば、
   **PNGはこれまでどおりパネルにしつつ**、文字は `PROJECT.texts` へ `type:'v'` で足す
   （`parent` = 作ったフレームのid）
2. `vertical:false` を受けるため、テキスト描画に**横書き分岐**を足す
   （実体は `oban-builder.html` の「V2-D: 縦書きテキスト」ブロック。
   **ビューア書き出し側にも同じ式が複製されている**ので、2か所直すこと。片方だけだと
   編集画面と書き出しで見た目が変わる）
3. 書体: MANGA PLATE と同じ Google Fonts（しっぽりアンチック）を読み込み、`font` 番号で切替。
   ⚠ **canvas は `ctx.font` に指定しただけでは Webフォントを取りに行かない。**
   `document.fonts.load()` を明示的に呼んでから描くこと（MANGA PLATE で踏んだ）
4. フチ: いまの4方向シャドウを `edge.w` で可変にする（色も白/黒）

### P2 — 戻り（任意）
OBAN で直した文字を MANGA PLATE へ返す。`tdr_live` に `plate-text-update` を1本足して
`id` 一致で `str/x/y/size` を差し替える。**P1 まででも実用になる**ので、要望が出てから。

## 判断が要る点（着手前に発注者へ）

- **OBAN の色は白/黒トグルだけ**。MANGA PLATE のパレット（黒〜赤10色）に合わせるか、
  白/黒に丸めるか
- MANGA PLATE の `lh`（行間）/`ls`（字間）を OBAN にも持たせるか、捨てるか
- 縦書きの `ー（）「」` 90°倒し・`、。` 右上寄せの規則も移植するか
  （MANGA PLATE の `VERT_ROT` / `VERT_SHIFT` をそのまま持っていける）

## 触るときの注意

- `oban-builder.html` を変えたら **`cd verify && npm run verify:oban`**（SPEC_08）
- 入出力を変えたら **`PIPELINE.md` を必ず更新**
- `SPEC_07_ANIMATOR_OBAN_BRIDGE.md` が `tdr_exchange` の語彙の親。`plate` 追加もそこへ1行
