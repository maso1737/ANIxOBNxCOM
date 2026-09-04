# ROADMAP — これからやること（2026-09-02 時点）

各 SPEC / HANDOVER に散っている「まだ終わっていないもの」を、**着手できる形**にまとめた1枚。
状態は 2026-09-02 に**実コードを grep して確かめた実測**で、SPEC の自己申告そのままではない。

- 仕組みの説明 → 各 SPEC
- 実装の経緯・踏んだ落とし穴 → 各 `*_HANDOVER.md`
- 入口/出口の形式 → `PIPELINE.md`
- **ここは「次に何を、どの順で、どこに気をつけて」だけ**

---

## 0. 3行で

1. **iPad の統一（SPEC_18 P2/P3）が最優先。** COMPOSER をパイロットにした決着はもう出ているのに、
   **他の4本には1行も入っていない**（`navigator.standalone` を見ているのは probe だけ・safe-area は OBAN の top のみ）。
2. ~~**COMPOSER に native ダイアログが残っている**~~ → **2026-09-02 完了**（`alert` 13 / `confirm` 1 / `prompt` 2 = 16件を `#cfm-modal` と `flashLive()` へ）。
   実装メモは `COMPOSER_HANDOVER.md` の「native ダイアログの追放」。
3. ~~**econte / manga-plate には VRT が無い**~~ → **econte は 2026-09-03 完了**（`npm run verify:econte`・9コマ）。
   **manga-plate は「まだ張らない」で確定**——SPEC_09 v2 が出力そのものを変えている最中なので、
   いま張ると承認しなおしが常態化して**差分を見なくなる**（ゴールデンテストの本当の死に方）。§v2 が一段落してから。
   ★ econte のフィクスチャは **T.U / PAN を「TIMELINE出力」と「GRIDセル」の両方で撮ってある**。
   発注者報告の「大きくなっている方の画にペイントがのらない/ずれる・継ぎ目が出る」を直すときの
   before/after がここで取れる（詳細と負のコントロールは [verify/CLAUDE.md](verify/CLAUDE.md)）。
4. **新しく `link-map.html` / `brush-lab.html` が増えている**（別セッション作・index のカード07/08）。
   `tools/check.js` の対象にも追加済みで、SPEC_18 P0 も 2026-09-02 に当てた。
   **BRUSH LAB は §3（econte のブラシ）の設計レビュー用ラボ**なので、ブラシに着手するときはまずそこを見る。

---

## 1. 全アプリの操作の統一（SPEC_17 INPUT GRAMMAR）

### いまの実測

| ツール | 押し方の文法<br>(単押し/2連打/長押し/Shift/バネ) | 再割当キーマップ<br>(`SHORTCUT_ACTIONS`+`gKeymap`) | localStorage キー |
|---|---|---|---|
| `animator` | ✅ 正準 | ✅ | `animator_keymap_v1` |
| `econte` | ✅（§2-2b・差分つき） | ✅ | `econte_keymap_v2` |
| `manga-plate` | ✅（§2-2c・差分つき） | ❌ **無い**（`TOOL_KEYS` 固定） | — |
| `composer` | —（別系統。無理に揃えない＝SPEC_17 §3 の判断） | ✅ | `composer_keymap_v2` |
| `oban-builder` | ❌ **未着手** | ❌ **無い** | — |

> ⚠ SPEC_17 の「manga-plate 実装済み」は**押し方の文法だけ**。
> キーの再割当は animator / econte / composer の3本にしか無い。**この2つは別の話**なので混ぜないこと。

### 残り

- [ ] **`oban-builder.html` に押し方の文法を載せるか決める**（SPEC_17 §3）
      OBAN のキーは「ツール切替」ではなく**選択・配置**なので、ANIMATOR の文法がそのまま当たる相手が居ない。
      *やらない* という結論もあり得る。**やらないなら SPEC_17 §3 にそう書いて閉じる**（未着手のまま放置しない）
- [ ] **manga-plate / oban-builder にキー再割当を入れるか決める**
      SPEC_17 §2-2c に「`TOOL_KEYS`（キー→ツールid）と `KEY_GESTURES`（ツールid→押し方）の2枚に分けてあるので、
      再割当を入れるときは `TOOL_KEYS` を keymap 参照へ差し替えるだけで済む」と**差し込み口だけ用意済み**

### プログラム的な注意点

- **キー名ではなくアクションid に紐づける**（`fill`/`pen`/`erase`）。キー名で書くと再割当で壊れる
- `e.repeat` を捨てる。単押しは遅らせない。2連打・長押しが成立したら基準時刻を0に落とす。`keyup`/`blur` でタイマーを消す
- **ボタン側が click の時刻差で見ている操作は `dbl` に登録しない**（キー2連打＝click 2回で二重発火する）
- ★**ボタンとキーは同じ関数を呼ぶ。** `wire()` の無名ハンドラのままだとキー側から呼べない → トップレベルに出す（econte §5-G で実際に踏んだ）
- 揃える対象は**モードの切替**であって機能そのものではない。**空振りする押し方を作らない**（相手が居ない2連打は割り当てない）

---

## 2. iPad の操作の統一（SPEC_18 IPAD GRAMMAR）

**第一原則＝指はナビとUI・ペンは描く面だけ。**
数値は `ipad-probe.html` の実測（iPadOS 18.7 / Safari 26.6 / 2026-08-26〜27）。**仕様を変えるときは probe で測り直す。**

### いまの実測（2026-09-02・**再計測**）

> ⚠ **2026-09-02 の初回計測に誤りがあった。** `grep | head` で行が切れていて、
> `canFS`（⛶を消す判定）と `apple-mobile-web-app-capable` を「無い」と読み違えていた。
> **実際は5本とも入っていた。** 下は数え直したもの。

| | animator | composer | econte | manga-plate | oban | index / link-map / brush-lab |
|---|---|---|---|---|---|---|
| `apple-mobile-web-app-capable` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅（brush-lab は 09-02 に追加） |
| `black-translucent` | ✅ 09-02 | ✅ 09-02 | ✅ 09-02 | ✅ 09-02 | ✅ | ✅ 09-02 |
| `viewport-fit=cover` | ✅ 09-02 | ✅ 09-02 | ✅ 09-02 | ✅ 09-02 | ✅ | ✅ |
| `--safe-t` / `--safe-b` の押し下げ | ✅ 09-02 | ✅ 09-02 | ✅ 09-02 | ✅ 09-02 | ✅ 09-02(下端) | ✅ 09-02 |
| ⛶ を `canFS` で消す | ✅ | ✅ | ✅ | ✅ | ✅ | ⛶ 無し |
| native ダイアログ | 2/1/0 | ✅ 0/0/0 | 0/0/0 | 0/0/0 | 0/0/0 | 0/0/0 |
| `touch-action` | `none`（描く面。**格下げ禁止**） | `manipulation` | ✅ 09-02 | ✅ 09-02 | ✅ 09-02 | ✅ 09-02 |
| `overscroll-behavior:none` | ✅ | ✅ | ✅ 09-02 | ✅ 09-02 | ✅ 09-02 | ✅ 09-02 |

**`navigator.standalone` を直接見ているアプリは今も0本だが、これは抜けではない。**
⛶ の出し分けは `canFS`（Fullscreen API の有無）で足りていて、そちらが実装の正準。

### 残り（この順で）

- [ ] **P2 スキル化**（SPEC_18 の決着を `.claude/skills/ipad-grammar/` に落とす）。COMPOSER が正準

#### §4-1〜§4-3 の残り（2026-09-03 実コードで確認）

**COMPOSER は3つとも完了**（`makeNumField` 18欄 / `.tl-drag-handle{touch-action:none}`＋`dhPid` / `gTap` 2・3・4本指）。
他ツールに同じものが無いだけ。

| | §4-1 数値欄の div 化 | §4-2 ⠿ ハンドル | §4-3 多指タップ |
|---|---|---|---|
| composer | ✅ 18欄（kf 8 / fx 8 / ease 2）。**設定・書き出しの10欄は素の input のまま** | ✅ | ✅ 2/3/4本 |
| animator | ❌ 7欄（`#fps-input` 含む＝SPEC 名指し） | — | ❌ **4本指が無い** |
| econte | ✅ 素の `input[type=number]` は0 | ❌ 長押し350ms のまま → ハンドルへ | ❌ **4本指が無い**（`n>3` で捨てている） |
| manga-plate | ❌ 2欄（`#lk-w` / `#lk-h`） | ❌ ▲▼ボタンのみ | ✅ 2/3本（プレビュー無し＝4本は不要） |
| oban | ❌ 5欄（書き出し・コンバータ） | — | ⚠ **3本指が `n===3` の早期 return で塞がったまま**（コメントも古い）。5本指 CAPTURE は**維持で確定** |

★ **5本指は OBAN の CAPTURE だけ。** 実機で使えているので残す（2026-09-03 発注者判断・SPEC_18 §4-3）。
他ツールへ新規に割り当てるのは引き続き禁止。
- [x] ~~**P0 の横展開**~~ **完了（2026-09-02・8本）**。black-translucent + viewport-fit=cover + `--safe-t`/`--safe-b` の押し下げ＋
      `touch-action` / `overscroll-behavior`。詳細は SPEC_18 **§4-4b**。⛶ の `canFS` は元から5本に入っていた
- [x] ~~**COMPOSER の native ダイアログを潰す**~~ **完了（2026-09-02）**。16件 → 0件
- [x] ~~`apple-mobile-web-app-capable`~~ — **元から入っていた**（初回計測のミス）。`brush-lab.html` にだけ無かったので 09-02 に追加
- [ ] `econte` §5-D（iPad）— SPEC_16 の**唯一の残タスク**
- [ ] P3 横展開（タイムラインの手つき＝§4-7 の再配分。COMPOSER 以外でタイムラインを持つのは econte）

### プログラム的な注意点

- **`manifest.webmanifest` は意図的にどこからも `<link rel="manifest">` していない。**
  張るとホーム画面追加が `start_url`（＝`index.html`）をインストールしてしまい、**開いていたツールに戻れなくなる**。
  「リンク忘れ」に見えるが**直してはいけない**。消すか、この理由をファイル先頭のコメントに書いて残す
- **`display-mode: standalone` は当てにならない**（`browser` と出る）。判定は `navigator.standalone` 一択
- **`user-scalable=no` は iOS で無視される。** Wタップ拡大は `touch-action:manipulation`、ゴムバウンドは `overscroll-behavior` で止める
- **`preventDefault` は多指タップの到達には不要**（ピンチ・スクロール抑止のためだけ）
- **3本指タップは使える／4本指=PREVIEW は安全／5本指はアプリ切替に化けるので割り当てない**
- **数値欄は div スクラブ（Wタップで input を動的生成）**が唯一 Scribble を出さずスクラブもできる
- ★**`pointermove` の `!e.buttons` で早期 return しない。** ペンで「動かない・選べない」の真因はこれ（§6-14）。
  pointerId で固定し、保険はマウスだけにする
- ★**native `alert()` を潰すとき、AE JSX テンプレ文字列の中の `alert(` は触らない**（After Effects の ExtendScript）。
  composer では2件あった。grep で拾っても置き換えない——**他ツールへ横展開するときも同じ罠を見ること**
- ★**ブラウザ自動化で Enter を撃つときは `"Enter"`。** `"Return"` は `key:''` の空イベントを投げる実装があり、
  **モーダルが閉じない＝実装のバグに見える**（実際に一度引っかかった）

---

## 3. econte のブラシ追加

### いまの実測 — animator との差

| | animator | econte |
|---|---|---|
| サイズ | 1px / 2px 固定スロット ＋ 太ブラシ 3〜50px（**右ドラッグ**・iPadは押したまま上下） | `state.brush` スライダー1本のみ |
| 筆圧 | `pressureRadius()`＋**筆圧カーブ soft/normal/hard**（`applyPressureCurve`） | `pressFactor()`＝`0.2 + 0.8p` の直線のみ |
| 手ブレ補正 | `penSmooth` = **RAW / EMA / EMA+**（＋`taperK()` の入り抜き） | **無し** |
| 区間内の太さ | `drawLineRadius(r0→r1)`＝**区間の中で太さが変わる** | `lineWidth` 1値＝**区間内は一定** |
| 消し | 同じ経路 | `globalCompositeOperation='destination-out'` |

**＝ econte に足す価値が高い順**: ① 入り抜き（区間内で太さを変える）→ ② 手ブレ補正 → ③ 筆圧カーブ → ④ サイズスロット＋右ドラッグ

### プログラム的な注意点（ここが本題）

1. ★**1本の区間が2つのパッチに二重に描かれる。**
   `strokeSeg()` は始点と終点が別の枠に落ちると `strokePatchSegBake()` を **ka と kb の2回**呼ぶ（`econte.html:5563`）。
   **ストローク進行に依存する値（補正バッファ・入り抜きの進み・テクスチャの位相）をパッチ側に持つと、2枚で食い違う。**
   → **状態はベイク空間（`strokeSeg` の入口）に1つだけ持ち、パッチには計算済みの `r0/r1` を渡す**こと

2. ★**Undo の矩形は太さで決まる。**
   `txTouch()` に渡す `pad` はいま `lw/2 + 1`（`econte.html:5591`）。区間内で太さが変わるなら **`max(r0,r1)` で取る**。
   足りないと**戻したときに線の一部が消え残る**（Undo は矩形単位＝SPEC_16 E1）

3. ★**半透明ブラシを「区間ごとに `stroke()`」で描くと継ぎ目が濃くなる。**
   区間が端で重なるぶんアルファが二重に乗る。避けるなら**1ストローク＝1枚のオフスクリーンに描いて pointerup で1回合成**だが、
   econte は**パッチが枠ごとに分かれている**ので、オフスクリーンも**枠ごとに1枚**要る（＝1 の問題と同じ根）。
   **不透明ブラシに限れば今の構造のままで足せる。** 半透明・エアブラシは設計を1段変える話なので分けて考える

4. **`state.brush` は全体設定**（画面移動で変えない＝SPEC_16 §5-B）。per-slot にすると V3-P3-1 の「全体設定 `gPaint`」の判断を戻すことになる

5. **ブラシ「補正」という言葉が2つある。**
   `econte.html:5079` / `:5576` の「補正は要らない」は**サイズの枠ごと補正（旧 `strokeScaleFor`）**の話で、
   **手ブレ補正のことではない**。SPEC_16 §2-3 は手ブレ補正を否定していない

6. **投げ縄は別経路。** `lassoFillPolygon()` はスキャンラインで `getImageData`/`putImageData` するので、
   ブラシの見た目を変えても投げ縄には効かない。**「ブラシと投げ縄で色や消え方が違う」**にならないよう、変えるなら両方

7. ★**筆圧ちょうど0を 0.5 に化かさない。** `pressure || 0.5` は**0 を中くらいの太さにする**＝線の上に太い粒が点々と残る
   （実測1ストローク1363点中37点が 0。SPEC_18 §2-4）。econte の `pressFactor()` は
   `(typeof e.pressure === 'number' && e.pressure > 0) ? e.pressure : 0.5` で**同じ形**になっている——
   ペン以外では 1 を返すので実害は出にくいが、**筆圧の扱いを触るときは animator の `raw`/`ema` 分岐に揃える**

8. ~~回帰の網が無い~~ **2026-09-03 に `verify:econte` を張った**（C1 FIX / C2 T.U / C3 PAN / C4 投げ縄 / C5 空 の5カット・9コマ）。
   ★ 上の 1〜3・6・7 は**すべてこの網に掛かる**（枠をまたぐ二重描画・Undo矩形・投げ縄との食い違い・筆圧0）。
   **ブラシを触る前に1回 `npm run verify:econte` を回してから始める**（差分の起点を作る）

---

## 4. 抜け（誰も担当していないもの）

| # | 抜け | 実測 | 効く場面 |
|---|---|---|---|
| 1 | ~~econte に VRT が無い~~ **2026-09-03 解消**／manga-plate は**保留で確定** | econte: `verify.econte.config.json`＋`window.__HARNESS__`（9コマ・負のコントロール2種で確認済み）。manga-plate は SPEC_09 v2 が出力そのものを変えている最中＝承認しなおしが常態化するので**§v2 が一段落してから** | ブラシ追加（§3）の安全網が張れた |
| 2 | ~~COMPOSER の native ダイアログ~~ | **2026-09-02 解消**（16件 → 0件） | — |
| 3 | ~~`navigator.standalone` が0本~~ | **抜けではなかった**。⛶ の出し分けは `canFS` で5本とも実装済み | — |
| 4 | ~~safe-area が oban の top だけ~~ | **2026-09-02 に8本へ横展開**（SPEC_18 §4-4b） | — |
| 5 | **`manifest.webmanifest` がどこからも参照されていない** | link 0件 | 「直そう」として張ると壊れる（§2 の注意点） |
| 6 | 確認ダイアログの方針 | **2026-09-02 に §5 へ救出＋`COMPOSER_HANDOVER.md` に正準として記載** | 残: SPEC_09 / ANIMATOR / OBAN 側への反映 |
| 7 | **SPEC_12（PARALLAX 連携ズレ解説機）P0/P1/P2 が未着手のまま** | 実装先は `LP_motion-graphics/PARALLAX_LAB/` | 本リポジトリの義務は数値表の更新だけ。**やらないなら SPEC に閉じると書く** |
| 8 | ~~index に OBAN が無い~~ | **既に載っていた**（初回の読み違い）。index は現在8枚（LINK MAP / BRUSH LAB が増えている） | CLAUDE.md の「OBAN 追加予定」だけ古い |
| 9 | **MOTION_COMIC_SPEC Phase 4〜5 / SPEC_10 P2 が「残」のまま宙に浮いている** | 後発の SPEC_13/15/16 が実質引き取っている可能性が高い | **生きているか閉じるかを1度判定する** |

---

## 5. 救出した設計ルール — 確認ダイアログ（2026-08-17）

> `.claude/worktrees/zen-shirley-e1b551` に**未コミットのまま残っていた**もの（worktree は 2026-09-02 に掃除済み。
> 元の差分は `_済/worktree_救出_20260817/` に patch で退避してある）。
> **composer の実装は 2026-09-02 に完了**。ANIMATOR / OBAN / SPEC_09 側の反映は**まだ**。

### 方針（正準）

**Undoで戻せる操作は聞かない。戻せない操作だけ聞く。**
ダイアログは「戻せない」の合図なので、戻せる操作にも出していると合図として効かなくなる。

| 残す | 撤去する |
|---|---|
| 全消去 / 置き換わる読み込み / 長い書き出し（＝時間の予告）/ localStorage 直書きで Undo に乗らないもの（ショートカット初期化）/ Undo履歴ごと消える操作（キャンバスサイズ変更） | `commit()`・`pushHistory()` 済みの削除系すべて（コマ・素材・ページ・トラック・KF・FRAMEレイヤーのCLR） |

撤去したら**トーストで必ず知らせる**（`…を削除しました（Ctrl+Z で戻せます）`）。
削除の確認を撤去した以上、**トースト＝唯一の「今なにが起きたか」**なので、出し忘れると無言で消えたように見える。

### ツール別の現状（2026-09-02 実測）

| ツール | 状態 |
|---|---|
| `econte` | ✅ V2-G3 で完了（native 0件） |
| `manga-plate` | ✅ 完了（native 0件・「Ctrl+Z で戻せます」トーストあり）。**ただし SPEC_09 に規則が書かれていない** |
| `oban-builder` | ✅ native 0件。**ただし `#b-clear` の title「元に戻せません」は不正確**（下記） |
| `animator` | ⚠ `btn-frame-clear` に `modalConfirm` が残ったまま（`pushFrameLayerHistory()` で Ctrl+Z 可能＝撤去候補）。native `alert` 2件 |
| `composer` | ✅ **2026-09-02 完了**。`#cfm-modal`（confirm/alert/prompt の3モード）＋否定は `flashLive()` |

### ⚠ OBAN `#b-clear` の文言は実態と違う（2026-08-17 実測）

`$('#b-clear')` は `PROJECT` を空にして `rebuild()` → `commit()` を通るだけで、**`history`/`hIdx` を捨てていない**。
実測（`PROJECT.name='WIPE-TEST'`＋KF1本を `commit()` してから CLEAR）:

| | name | take.kf | localStorage `oban-project` |
|---|---|---|---|
| CLEAR 直後 | `oban` | 0 | なし |
| その後 Ctrl+Z | **`WIPE-TEST`** | **1** | **あり**（`restoreState` が `save()` する） |

つまり**同じタブを閉じるまでは Ctrl+Z で戻せてしまう**。それでも**ダイアログは残す**
（`history` はメモリ上だけ＝リロード後は本当に戻らない）。直すならどちらかに寄せる:

- **(a) 文言を実態に合わせる** … 「保存済みデータは戻りません。このタブを閉じるまでは Ctrl+Z で戻せます」
- **(b) CLEAR 後に `history=[];hIdx=-1;`** … 逃げ道が1本減るので**安全側に見えて実は改悪**の可能性。採るなら要相談

### composer に `modalConfirm` を入れるときの要点

- **正準は OBAN の `#cf-modal`**。**Enter=OK / Esc=CANCEL**、開いている間は `document` の **capture段でキーを飲む**、開いたら OK にフォーカス
- ★**キーを飲むのが要点。** 飲まないとモーダルの裏で `window` の keydown に届いて **SPACE=再生 / Delete=KF削除 が走る**
- ★**テストで `window` に直接 dispatch すると経路に入らず「漏れた」ように見える。** `document.body` 等から撃つこと（一度引っかかった）
- `z-index` は **120**（`#webx-modal`=110 / `#export-overlay`=100 より上）
- `alert()` の寄せ先: **操作の否定は `flashLive()`（既存トースト）／読んで欲しいものは `#cfm-modal` の CANCEL を隠して OK だけ**

---

## 6. 進め方の提案（順番）

1. **§5 を master に残す**（この ROADMAP がその受け皿）／ worktree の差分を `_済/` に patch で退避してから worktree を掃除
2. ~~COMPOSER の native ダイアログを潰す~~ **完了（2026-09-02）**
3. ~~SPEC_18 P0 の横展開~~ **完了（2026-09-02・8本）**
4. **P2 スキル化**（3 が終わってから。動くものを見てから型にする）
5. **econte §5-D（iPad）** — SPEC_16 の最後の1つが片付く
6. **econte ブラシ** — ~~先に `verify:econte` を張るか決める~~ **張った（2026-09-03）**。①入り抜き → ②手ブレ補正 の順。
   **触る前後で `cd verify && npm run verify:econte` を回す**（意図した変更なら `approve:econte` で承認）
7. **SPEC_17 の OBAN / SPEC_12 / MOTION_COMIC Phase4-5 / SPEC_10 P2 を「やる or 閉じる」で判定**（未着手の宙吊りを減らす）

---

## 7. 変更後に必ず走らせるもの

```
node tools/check.js
```
6ファイル（animator / oban-builder / composer / index / manga-plate / econte）の 構文 / id配線 / id重複 / 未参照関数。

描画・合成を触ったら:
```
cd verify && npm run verify:animator
cd verify && npm run verify:composer
cd verify && npm run verify:oban
cd verify && npm run verify:econte
```

> ⚠ `verify/node_modules` は `Documents` 配下なので `npm ci` は Claude が実行してよい。
> **`npx playwright install`（ブラウザ本体）は `AppData` に入るのでユーザー自身のターミナルで実行すること**（ルート CLAUDE.md）。

パラメータ・UIコントロール・入力連動の挙動を変えたら **`/param-check`（動作チェック表）**。
