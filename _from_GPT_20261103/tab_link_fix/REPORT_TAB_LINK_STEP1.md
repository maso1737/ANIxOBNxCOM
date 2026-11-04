# REPORT — TAB LINK STEP 1（GPT 修正の取り込み）

2026-11-04 · Claude Code。**commit / push はしていない**（利用者の OK 待ち）。STEP 2 には入っていない。

## 結論

GPT の3件の修正と案内文を、改行コードを崩さずに当てた。実ブラウザで手順 2〜6 が全部通り、
実験データ（`GUI_door_book.json`）の往復も `GUI_door_returned_book.json` と同じ構造になった。`node tools/check.js` は ALL PASS。

## 1. 前提の確認

| 項目 | 結果 |
|---|---|
| HEAD | `c84fff0`（ORDER の想定 `67584d4` より **2コミット先**：SPEC_23 と LIVE PLATE P3a） |
| その2コミットで対象ファイルは変わったか | html 3本・GUIDE は**変化なし**。PIPELINE.md は16行目（live-plate の行）だけ変化。GPT の差分は35行目なのでぶつからない |
| 作業前の作業ツリー | `CIMxFIS/` と `debug.log` が未追跡なだけ。CLAUDE.md に未コミット変更は無かった |
| 触らなかったもの | `CIMxFIS/`・`SPEC_23_*`・`debug.log` |

## 2. 差分の当て方

- `files/` で置き換えず、`gpt_changes_ignore-cr.diff` を手で当てた（作業用コピーで LF にそろえて `git apply` → 元の改行に戻して書き戻し）。
- 改行コードは元のまま：`manga-plate.html` / `oban-builder.html` ＝ LF、`link-map.html` / `PIPELINE.md` / `GUIDE_MANGA_LINKS.md` ＝ CRLF。
- 見かけの差分は **6ファイル・+54 / −57 行**（CLAUDE.md の追記込み）。置き換えたときの約1万行にはなっていない。
- 改行を無視して `files/` と比べた結果：

| ファイル | `files/` との一致 |
|---|---|
| manga-plate.html | ✅ 一致 |
| oban-builder.html | ✅ 一致 |
| link-map.html | ✅ 一致 |
| GUIDE_MANGA_LINKS.md | ✅ 一致 |
| PIPELINE.md | 違いは16行目の1行だけ。HEAD で更新された live-plate の行で、GPT は古い版を元にしていた。**HEAD 側を残した** |

追加したファイル（GUIDE が `TAB_LINK_HANDOFF.md` にリンクしているため）：
- `TAB_LINK_HANDOFF.md`（`files/` のまま）
- `verify/tab-link-browser.png`（HANDOFF の図。実画面の縮小で、個人データは写っていない）

## 3. 実ブラウザでの確認（TAB_LINK_HANDOFF の手順 2〜6）

Claude の内蔵ブラウザ（Chromium）を使用。専用ポート `localhost:8179` を立てて、保存データが空の状態から始めた。
画面サイズは GPT と同じ 1500×970 に合わせた。証拠の画像は `verify_claude/`（git 対象外）に置いた。

### 動作チェック表

| 確かめたこと | 期待される変化 | 有効になる条件 | 結果 |
|---|---|---|---|
| 手順2 ROUGH → ANIMATOR REF（ANIMATOR を閉じた状態で送る） | 「共有DBに置きました」と出て、ANIMATOR を開くと REF に1件入る | 同じオリジン | ✅確認済（REF 1件・不透明度50%） |
| 手順2 ROUGH で線を足して再送 | 「差し替えました」と出て、REF は1件・50% のまま | ANIMATOR が開いている | ✅確認済 |
| 手順3 MANGA の上段コマ → ▶ ANIMATOR REF | 確認画面の文言が「REF ▸ + SAVED」に変わっている | コマを選択している | ✅確認済 |
| 手順3 ANIMATOR の REF → + SAVED → MP 1-1 | 下敷きとして IMG 1920×1080 が入る | — | ✅確認済 |
| **修正1** 手順4 ◀ ANIMATOR 取込（上段コマ 4252×3159） | ページ中心ではなく**コマ中心**に置かれる | コマを選択している | ✅確認済：中心 (2716.5, 2170.14)＝コマ中心、倍率 2.07617（GPT と同値）。ページ中心 Y=3779.5 ではない |
| 手順4 ANIMATOR で線を足す（LIVE） | MANGA の絵だけ差し替わり、位置と件数は変わらない | ANIMATOR で LIVE を押してある | ✅確認済（IMG 1件・同じ位置・画像データが最新に） |
| **修正2** 手順4 取込のあと MANGA で Ctrl+Z を1回 | IMG が 0件になる | — | ✅確認済（LIVE 更新を挟んでも1回で消えた） |
| 手順4 続けて Ctrl+Y | 同じコマ・同じ位置に IMG 1件、絵は最新 | — | ✅確認済 |
| 手順5 集中線（手前・ぱかぱか 3種／2コマ打ち）＋文字「来た。」→ ▶▶ COMPOSER レイヤー | COMPOSER に3トラック。取込時の Z は全トラック共通 | コマを選択している | ✅確認済（1920×1427・24fps・6f・地／中間／手前。Z のキーは空＝既定値で共通。新しい案内文どおり） |
| 手順5 ▶▶ OBAN レイヤー | OBAN に1フレーム・子3枚・文字1件 | — | ✅確認済（DEPTH 0／0.5／0.85・高さ1.15・文字は編集できる） |
| **修正3** OBAN の ⚙ → FILE／連携 → ▶ ANIMATOR | 設定画面に隠れずに一覧が出て、候補を1回押せば取り込める | — | ✅確認済（一覧の行が最前面。押した位置が設定画面に奪われないことも確認） |
| 手順6 OBAN で文字を「着いた。」に直して Ctrl+Enter | MANGA に戻り、受け取り確認（ack）が返る | 両方のタブを開いている | ✅確認済 |
| 手順6 MANGA で Ctrl+Z → Ctrl+Y | 「来た。」→「着いた。」 | — | ✅確認済 |
| 手順6 MANGA を再読み込み | 文字と3素材の配置が残る | 自動保存のあと | ✅確認済 |
| 手順7 縦長コマ（観察だけ） | コマ中心に入り、横長の絵は余白ごと縮む | — | ✅確認済（2086×3039 のコマで中心 (1633.65, 5449.14)、2048×1152 の絵が 2086×1174 に＝上下に余白。下敷きの使用率は 39%。GPT の記録と同じ傾向） |

### 実験データでの回帰（ORDER の手順4）

保存データが空の別オリジン（`127.0.0.1:8179`）で次の順に操作した。

1. MANGA で `GUI_door_book.json` を IMPORT JSON
2. 上段を選んで文字「コン」を追加。実験レポートの A と同じで、元の JSON には文字が無い
3. ▶▶ OBAN レイヤー
4. OBAN で ⚙ → ▶ ANIMATOR → MP 1-1 を選んで受信。1フレーム・子2枚（地・中間）・文字1件になった
5. フレームに入り、文字を「コン、コン」に直して Ctrl+Enter（ack あり）

| 比べた項目 | 結果 |
|---|---|
| 項目数 | 5／5 |
| ブラシ4本（コマ所属・位置・点列） | ✅ 一致 |
| 文字（コマ所属・中間・縦書き・位置＝コマ中心 (2716.5, 1780.94)・大きさ66・行間・字間・書体・色・フチ） | ✅ 一致 |
| `links` | 両方とも空 ✅ |

比べたのは MANGA が持っている原稿データで、書き出したファイルではない。

## 4. CLAUDE.md への追記

`## 地雷（踏んだもの）` を新しく作り（`## 既知の制限` の前）、次の3つを書いた。改行コード（CRLF）はそのまま。
- `placeLinked` が座標を上書きしていた件と、今後の注意（置き場所は `addImage` の `fields` だけで決める）
- 取込が3つの履歴に分裂していた件と、今後の注意（取込・受信の処理に `commit()` を足さない）
- OBAN の `#b-ap` は設定画面を閉じてから一覧を開く件（`TAB_LINK_HANDOFF.md` へのリンク付き）

## 5. 確認のために本来と違う操作をしたところ

- **内蔵ブラウザは `window.open` で新しいタブを開かず、同じタブがその画面に移る。** 1回目の ▶▶ COMPOSER では MANGA のタブが COMPOSER に置き換わったので、MANGA は開き直した。
  自動保存の内容はそのまま残っていた。▶▶ OBAN は MANGA を開いたまま確かめる必要があったので、MANGA 側の `window.open` を一時的に無効にした（呼ばれたことは記録した）。
  OBAN は別タブで自分で開いた。アプリの動作ではなく、確認環境の制約。
- **IMPORT JSON のファイル選択だけはスクリプトで代行した**（ファイル入力に File を渡して、本来の読み込み処理を動かした）。
- テスト用に `Projects/.claude/launch.json` へ `anixobn-tablink-test`（port 8179・ANIxOBNxCOM 直下）を追加した。リポジトリの外のファイルで、STEP 2 でも使える。

## 6. 確認していないこと

| 項目 | 理由 |
|---|---|
| 修正前の版で不具合が出ること | GPT の記録（TAB_LINK_HANDOFF）に任せた。今回は修正後の版だけ確認した |
| 見た目の回帰検査（VRT） | 描画の変更が無い（MANGA は取込の座標と履歴、OBAN はボタンの処理だけ）。manga-plate には VRT がまだ無い |
| iPad・Safari | 対象外 |
| ANIMATOR のペンで描いた線の筆圧・形 | ドラッグで直線を描いただけ |

## 7. 確認中に見つけたこと（今回は直していない・STEP 2 か別件の候補）

- **ボタン名の言い換えが残っている。** ANIMATOR のボタンは今「+ SAVED」なのに、次の場所はまだ「+ FROM SAVED」と書いてある。
  - `rough.html`（送信後の確認画面と OUT の注記）
  - `PIPELINE.md` 14行目（manga-plate の行）
  - `SPEC_22_ROUGH.md` §151
- **MANGA から OBAN へ送ったときの案内が古い。** 確認画面は「OBAN 側の ＋ FROM ANIMATOR」と言うが、新 UI の入口は「⚙ ▸ ▶ ANIMATOR」（`manga-plate.html` 3414・3563行付近）。
- **縦割りが上の段まで割れた。** MANGA の DIV │縦 を下段の中だけで引いたら、上段まで一緒に割れた（観察の手順7で）。仕様なのか確かめていない。
- **git の改行の警告。** `manga-plate.html` / `oban-builder.html` は作業ツリーが LF で、`core.autocrlf=true` のため「次に git が触ると CRLF になる」と警告が出る。前からある状態で、今回の変更で増えたものではない。

## 8. commit するなら（承認後）

対象は次の8ファイル。`CIMxFIS/` と `debug.log` は入れない。

- CLAUDE.md
- GUIDE_MANGA_LINKS.md
- PIPELINE.md
- link-map.html
- manga-plate.html
- oban-builder.html
- TAB_LINK_HANDOFF.md（新規）
- verify/tab-link-browser.png（新規）
