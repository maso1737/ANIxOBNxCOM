# SPEC_12 — PARALLAX_LAB × OBAN/COMPOSER 連携ズレ解説機

OBAN_BUILDER で組んだ **TAKE JSON を PARALLAX_LAB に貼ると、同じカメラワークを
①OBAN撮影台／②COMPOSER Zドリー／③COMPOSER SCL の3流儀で並べて再生できる**ようにする。

**目的は「なぜ OBAN と COMPOSER をそのまま繋ぐとズレるのか」を、見て触って理解・解説できること。**
工程判断（振り直すべきか）はその結果として付いてくる。

- **実装先**: `LP_motion-graphics/PARALLAX_LAB/parallax-lab.html`（単一HTML・KINETIC STAGE準拠のまま）
- **本リポジトリ側の義務**: `planeZoom` / `pf` / `buildComposerJSON` を変えたら本SPECの数値表を更新する。コード変更なし
- **正準**: 再生コアは `oban-builder.html` の `buildTake()` / `camAt()`、写像は `planeZoom()` / `prect()` /
  `buildComposerJSON()` と composer の `applyObanPlacements()` / `applyTrackChain()` / `applyCamWrap()`
  （§3・§4にコード転載。共有ライブラリ化はせず**コピーで運用**）
- 状態: **P0 実装済み（2026-08-15）＋ P1 のうち §6.3 視差量メーターを先行実装。P1 残り／P2 未着手**
- **最終照合 2026-08-15**（`planeZoom` 新式・DOF・COPY FOR COMPOSER 実装後の実コードと突き合わせ済み）
- 実装後の実測は §1 の表と**全項目一致**を実機で確認済み（検証手順は `PARALLAX_LAB/CLAUDE.md` §検証）

---

## 0. 前回SPECからの差分（2026-08-15 改訂）

SPEC 起草後に OBAN 側が動いたので、**前提が3つ変わった**。実装前に必ずここを読む。

| 変わったもの | 旧SPECの記述 | 現在の実機 | 影響 |
|---|---|---|---|
| **①のズーム式** | `zi=1+(z−1)·lerp(0.55,1.25,d)` | `zi=z·spread^(2d−1)`, `spread=1+max(0,z−1)·0.22`（`planeZoom`・commit `ed04607`） | **§4.1 全面差し替え。ラボの①も現状は旧式＝実機不一致** |
| **COPY PROJ ボタン** | クリップボードに PROJECT を出す前提 | 無い。`EXPORT JSON`（ファイル）／`IMPORT JSON`、クリップボードは **COPY FOR COMPOSER**（`buildComposerJSON`） | §2 の入力経路を修正 |
| **OBAN→composer 変換** | SPEC_12 §6.3 で「出発点の数表を作る」提案（未実装前提） | **実装済み**。`buildComposerJSON(fps,sec,W,H,zoomMode)` が 案A(`scl`)／案B(`z`) の2モードを出す。composer 側も `applyObanPlacements()` で `depth→Z` を受ける | **§6.3 廃止。ラボの役目は「既にある2つの変換のどちらを選ぶか」を見せることへ変わる** |

変わらなかったもの（そのまま使える）:

- `pf = lerp(0.7, 1.2, depth)`（パンのパララックス係数）— **据え置き**
- composer の `persp = F/(F+Z−camZ)`, `PERSP_FOCAL = 1000` — **据え置き**
- `buildTake()` / `camAt()` の構造 — **据え置き**（§3のコードは実コードと一致を再確認済み）

さらに増えていて、ラボが**受理して無視する**必要があるもの:

- `PROJECT.dof`（DOF/ピン送り。`take` と同階層のトップレベル）
- `PROJECT.frames[].wipe`（`'invert'|'whiteout'`）— **旧SPECは `take.wipes[]` と書いていたが誤り。ワイプは frame 側にある**
- `PROJECT.texts` / `PROJECT.clickFx` / `frames[].fx`
- `ease` が **5種**（`linear / smooth / inout / outCubic / inCubic`）— ラボは3種しか持っていない（§2で対応）

---

## 1. 背景 / 価値 — 「ズレる」の正体

ユーザーの動機はこれ：**OBAN で組んだカメラワークを COMPOSER にそのまま持っていくとズレる。なぜ？**

答えは「3つのツールが**別々の光学**を持っているから」で、ラボはそれを**同じカットを3流儀で同時再生**して見せる。

| 流儀 | 実機 | ズーム | パン係数 | パンとズームの順序 |
|---|---|---|---|---|
| **① OBAN 撮影台** | `oban-builder.html` `prect()` | `planeZoom(z,d)` ＝ **冪**（層別） | `pf(d)=lerp(0.7,1.2,d)`（**z非依存**） | **パンはスケールの内側**（`zi` 倍される） |
| **② COMPOSER Zドリー** | `buildComposerJSON(...,'z')` | `persp/persp₀` ＝ **双曲線**（層別） | `persp(d,z)`（**zで変わる**） | パンはスケールの**外側** |
| **③ COMPOSER SCL** | `buildComposerJSON(...,'scl')`（既定） | `z` ＝ **全層一律** | `persp₀(d) = pf(d)` （**z非依存・OBANと厳密一致**） | `applyCamWrap` の一律ズームが**外側から全部に掛かる** |

**z=1 では3流儀が完全一致する**（サイズもパンも誤差 0.0%）。ズレは寄り／引きに入った瞬間から開く。
——「配置は合っているのに動かすとズレる」の理由がこれ。

### 実測（§9のスクリプトで算出。W=1920 / H=1080 / h=0.8 / camx=0.5）

**③ SCL のズレ ＝ サイズとパンが完全に同率**（＝ズレの正体は係数1本 `spread^(2d−1)`）

| z | 層 | サイズ Δ | パン Δ |
|---|---|---|---|
| 2.0 | 奥 d=0 | **+22.0%** | **+22.0%** |
| 2.0 | 中 d=0.5 | 0.0% | 0.0% |
| 2.0 | 手前 d=1 | **−18.0%** | **−18.0%** |

→ ③は **「奥行きによるズーム配分」だけを失う**。中間層は常に一致するので、**寄ると奥がふくらみ手前が痩せる＝奥行きが平たくなる**。

**② Zドリーのズレ ＝ サイズは合うのにパンが潰れる**

| z | 層 | サイズ Δ | パン Δ |
|---|---|---|---|
| 2.0 | 奥 d=0 | −6.2% | **−53.1%** |
| 2.0 | 手前 d=1 | +2.5% | **−48.8%** |
| 0.6 | 奥 d=0 | +13.6% | **+89.4%** |

→ ②は**サイズは近いのにパンが半分になる**（引きでは逆に倍近く暴れる）。
原因は**パンがスケールの外側にある**こと＋`X=x·Wc/z` の相殺。「寄ったのに横移動がついてこない」感じの正体。

**視差量（手前層と奥層のパン差＝奥行き感そのもの）**

| z | ① OBAN | ③ SCL | ② Zドリー |
|---|---|---|---|
| 1.0 | 480 | 480 | 480 |
| 1.5 | 1010 | 720 | 696 |
| 2.2 | **2034** | 1056 | 1022 |

→ **寄るほど、どちらの変換も OBAN の約半分の視差しか出ない。** これが「連携するとペタッとする」の数値的な答え。

### おまけ：実際に起きたバグを再現できる（教材として強い）

旧① `zi=1+(z−1)·lerp(0.55,1.25,d)` は **z<1 で前後が逆転する**（`OBAN_BUILDER_HANDOVER.md` §マルチプレーンの是正）。

| z | 旧① 奥 / 手前 | 新① 奥 / 手前 |
|---|---|---|
| 0.5 | 0.725 / **0.375** ← 手前のほうが小さい | 0.500 / 0.500 |
| 0.8 | 0.890 / **0.750** | 0.800 / 0.800 |
| 2.2 | 1.660 / 2.500 | 1.741 / 2.781 |

ラボに **旧①トグル**を置けば「なぜ式を変える必要があったか」を体験で説明できる。**P0 に入れる。**

---

## 2. 入力仕様（PASTE TAKE）

クリップボード経由。以下を**自動判別**して受理する:

| 形態 | 判別 | 取り出し | 出どころ |
|---|---|---|---|
| bare TAKE_v1 | `j.kf` が配列 | `j` をそのまま | 手書き／SPEC_01 |
| OBAN PROJECT | `j.take && Array.isArray(j.panels)` | `j.take`（＋`j.panels` は §7の depth 提案に使う） | `EXPORT JSON` のファイル内容を貼る |
| composer PROJECT_v2 | `j.format==='PROJECT_v2' && j.tracks` に camera あり | **P2**。camera KF から逆算（§8 非目標だったが、`COPY FOR COMPOSER` の出力をそのまま検算できる価値が出たので P2 に格上げ） | `COPY FOR COMPOSER` |
| 埋め込みJSON | `<script type="application/json" id="take-*">` | `?take=<id>` で選択（file://対応のため fetch は使わない） | P2・教材デモ |

### バリデーション（applyTake）

```js
// 受理規則 — 未知キーは無視（前方互換）。失敗は ✗ INVALID フラッシュのみで状態を壊さない
kf: 必須・length>=1。各要素:
  x,y   : Number(有限)必須。単位=画面（x=1 → 1画面ぶん横）
  z     : 省略時1。clamp(0.25, 4)   ← 実機 camAt と同じレンジ
  dwell : 省略時1。max(0.05, v)
  ease  : E に無いキーは 'smooth' に落とす
name       : 表示のみ（TAKE行に併記）
```

- **EASE を実機と同じ5種に増やす**（P0）: `linear / smooth / inout / outCubic / inCubic`。
  現状ラボは3種しかなく、OBAN の既定 KF に入る `outCubic` が黙って `smooth` に落ちる＝**再生が実機と別物になる**。
  実機の定義をそのままコピー（`oban-builder.html` L933）:
  ```js
  const E={linear:t=>t, inout:t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2,
           smooth:t=>t*t*(3-2*t), outCubic:t=>1-Math.pow(1-t,3), inCubic:t=>t*t*t};
  ```
- **黙って捨てないもの**（TAKE行に件数だけ出す）: `frames[].wipe ×N` / `dof.pts ×N` / `texts ×N` / `clickFx`。
  ワイプは take ではなく **frame 側**にある（旧SPECの `take.wipes[]` は存在しない）。
- ペースト成功 → **TAKEモード**へ（`S.take` = 正規化済みTAKE、`S.tt` = `buildTake(S.take)`）。CLEAR で通常モード復帰。
- OBAN の `panels[].depth` は**自動では持ち込まない**（シーンが違う。ラボは BG/CEL/BOOK の3層 depth スライダのまま）。
  ヒストグラムからの**推奨値提示は §7 P2**（適用はワンクリック・自動では変えない）。

---

## 3. 正準再生コア（oban-builder.html から転載コピー）

`oban-builder.html` L1171-1197 の実装が正準。**そのままコピー**して貼る（変数名も揃える。差し替え禁止箇所）:

```js
function buildTake(take){
  const kf=(take.kf&&take.kf.length)?take.kf:[{x:0,y:0,z:1,dwell:1,ease:'smooth'}];
  const tw=d=>clamp(d,0.25,2.2);const segs=[];
  for(let i=0;i<kf.length;i++){
    segs.push({t:'dwell',a:kf[i],b:kf[i],w:Math.max(0.05,kf[i].dwell??1)});
    if(i<kf.length-1){const A=kf[i],B=kf[i+1];
      segs.push({t:'travel',a:A,b:B,ease:B.ease??'smooth',
        w:tw(Math.hypot(B.x-A.x,B.y-A.y)+Math.abs((B.z??1)-(A.z??1)))});}
  }
  const total=segs.reduce((s,x)=>s+x.w,0);let acc=0;
  for(const s of segs){s.p0=acc/total;acc+=s.w;s.p1=acc/total;}
  return{segs,total};
}
function camAt(P){            // ラボでは TT を引数に取る camAt(tt,P) に一般化してよい（式は不変）
  let seg=TT.segs[TT.segs.length-1];
  for(const s of TT.segs){if(P<=s.p1){seg=s;break;}}
  const f=map(P,seg.p0,seg.p1);
  if(seg.t==='travel'){const e=(E[seg.ease]||E.smooth)(f);
    return{x:lerp(seg.a.x,seg.b.x,e),y:lerp(seg.a.y,seg.b.y,e),
           z:clamp(lerp(seg.a.z??1,seg.b.z??1,e),0.25,4),segT:'travel'};}
  return{x:seg.a.x,y:seg.a.y,z:clamp(seg.a.z??1,0.25,4),segT:seg.t};
}
```

- `map(v,a,b)=clamp((v-a)/(b-a),0,1)` 相当。ラボに無ければ足す。
- TAKEモード中のラボのタイムライン変数は **P（0..1）ただ1つ**。既存の `S.t` を P として流用し、
  `applyTimeline()` を「TAKE中: cam=camAt(P) → `P.zoom=cam.z` / `camX=cam.x` / `camY=cam.y`」に分岐させる。

---

## 4. 3流儀への写像（ここが本体・**全面差し替え**）

TAKE の `cam{x,y,z}` を3流儀に写す。**z=1 で3流儀の画が完全一致**するラボの原則は維持する（実測で確認済み）。
基準ビューポート `VW×VH`、`V`: x→VW / y→VH、`d`=層 depth。

### 4.1 統一形

```
size_i   = h · VH · s_i(d,z)
offset_i = cam · V · pf_i(d,z) · q_i(z)        // q = 「パンがスケールの内側かどうか」の係数
```

| 流儀 | `s_i(d,z)` | `pf_i(d,z)` | `q_i(z)` | 実機の根拠 |
|---|---|---|---|---|
| **① OBAN** | `planeZoom(z,d)` | `lerp(0.7,1.2,d)` | `planeZoom(z,d)` ←**内側** | `prect()` L1524-1533 |
| **② COMPOSER Z** | `persp(d,z)/pf(d)` | `persp(d,z)` | `1/z` ←**外側**＋X相殺 | `applyTrackChain()` L3436-3446 ＋ `buildComposerJSON` zoomMode='z' |
| **③ COMPOSER SCL** | `z` | `pf(d)` | `z` ←`applyCamWrap` が外から全体に掛ける | `applyCamWrap()` L3412-3417 ＋ zoomMode='scl' |
| **④ FLAT**（対照群） | `z` | `1` | `z` | 実機に無い。**視差ゼロの参照**（ロゴプッシュ用・現ラボの③がこれ） |

```js
const DEPTH_SPREAD=0.22, F=1000;
const pf   = d => lerp(0.7,1.2,d);                      // OBANのパン係数 = composerのpersp₀ と同値
const planeZoom = (z,d)=>{const s=1+Math.max(0,z-1)*DEPTH_SPREAD;
                          return s===1? z : z*Math.pow(s,2*d-1);};
const Zof  = d => F*(1/pf(d)-1);                        // composer applyObanPlacements の depth→Z
const camZ = z => F*(1-1/z);                            // buildComposerJSON zoomMode='z'
const persp= (d,z)=> F/Math.max(30, F+Zof(d)-camZ(z));  // composer applyTrackChain
```

- **`pf(d)` と `persp₀(d)=F/(F+Zof(d))` は恒等的に等しい**（`F+Zof = F/pf` より）。
  だから③のパンは OBAN と**厳密一致**する — composer.html L2046 のコメント「OBANのpfと厳密一致する」はこの意味。
- **①の `q` が `zi` である（＝パンがスケールの内側）ことが②③との構造差**。旧SPEC §4.2 の指摘は正しいが、
  当時は「①だけ直せば3流儀が揃う」と書いていた。実際は**②③は外側のままが実機**なので、**内外の差そのものを見せる**のが正しい。

### 4.2 描画（1層ぶん）

```js
// ①: パンはスケールの内側
ctx.translate(cx,cy); ctx.scale(m*s, m*s);
ctx.translate(-VW/2 - camX*pf*VW, -VH/2 - camY*pf*VH);

// ②③④: パンはスケールの外側（実機の順序）
ctx.translate(cx,cy); ctx.scale(m,m);
ctx.translate(-camX*pf*q*VW, -camY*pf*q*VH);
ctx.scale(s,s); ctx.translate(-VW/2,-VH/2);
```

- **y パン対応が新規**（TAKE は2次元）。通常モードの PAN スライダは `camX = pan·0.24, camY = 0` として同じ経路に乗せる（`PANV=240` 定数は廃止）。
- ゴースト差分ベクトルの `project()` も**流儀ごとに同じ分岐**を通すこと（現状は1本の式で全流儀を計算していてズレの原因になる）。

### 4.3 旧①トグル（`O` キー・P0）

`zi = 1+(z−1)·lerp(kFar,kNear,d)` を①の代替式として残す。既存の kNear/kFar スライダはこのときだけ生きる。
プリセット「撮影台1937」は旧式＋強係数（1.5/0.2）のまま＝**様式化された視差**の見本として維持する。

### 4.4 z レンジ

- `camAt` は z を 0.25..4 でクランプ（実機）。ラボの ZOOM スライダ表示レンジ 0.5..3 を超える値は
  スライダ振り切り＋数値表示で対応（スライダ min/max は変えない。表示は `.tv` に実値）。
- カーブビューの z 軸は TAKE中 `[min(kf.z)−0.2, max(kf.z)+0.4]` に自動リスケール（P1）。

---

## 5. UI 仕様

### 5.1 流儀セレクタの改称（P0）

数字だけだとどのツールの話か分からないので、**実機名を出す**:

```
① OBAN 撮影台 / ② COMPOSER Zドリー / ③ COMPOSER SCL / ④ FLAT 化粧ズーム
```

- 既定の比較ペアを **A=① / B=③** にする（③＝`COPY FOR COMPOSER` の既定モード＝**いちばんよく踏むズレ**）
- `1/2/3/4` キーで選択。`STYLE_META` に `col` を1色追加（④は既存の紫を流用、③に新色）
- HUDチップに**どの実機の式か**を出す（例: `A ③ COMPOSER SCL / applyCamWrap`）

### 5.2 サイドパネル「▸ TAKE / OBAN連携」セクション（PRESET の直後に新設）

```
[▣ PASTE TAKE] [✕ CLEAR]
take-A · KF×6 · WIPE×1 · DOF×3 · TEXT×2 （無視）      ← TAKE行（mono 9px, ice）。未ロード時 "—"
```

- PASTE 成功: `✓ APPLIED` / 失敗: `✗ INVALID`（既存 `flash()` 流用）
- TAKEモード中の dim 規則: **PRESETセクション**と**ZOOM/PANスライダ**を `.dimrow`（値は毎フレーム表示更新だけ＝read-only）。
  **生かすもの**: FOCAL / depth / vis / 旧①トグル（＋旧①時のみ kNear/kFar）。EASE系は殺す（TAKE内蔵）
- DUR は「TAKE 1周の実尺」として生かす（`camAt` は P の純関数なので尺は自由）。既定 4s に引き上げ。

### 5.3 TAKEタイムラインバー（ステージ下端・canvas直描き）

- 高さ12px・下端から24px上。`buildTake` の segs を全幅にマップ:
  **dwell=gold太帯（高さ8px）／travel=ice細線（高さ2px）**、KF位置に `01 02 …`（mono 8px）。
- 現在P に white 針＋glow。**クリック/ドラッグでシーク**（既存ステージスクラブを TAKE中は P 直接操作に）。
- `←`/`→` は TAKE中 **KFジャンプ**（各 kf の dwell 区間中央 `P=(p0+p1)/2` へスナップ）に切替。

### 5.4 COPY/PASTE PARAMS の拡張

- COPY の JSON に `take:` を同梱（正規化済み TAKE そのまま）。PASTE は `take` キーがあれば `applyTake`。未知キー無視は従来通り。

### 5.5 ショートカット追加

| キー | 動作 |
|---|---|
| `T` | クリップボードから PASTE TAKE（ボタンと同じ） |
| `O` | ①を **新式 ⇄ 旧式** 切替（P0・§4.3） |
| `4` | ④ FLAT を選択（1/2/3 と同列） |
| `←` `→` | TAKE中: KFジャンプ（通常時: ズーム±のまま） |
| `V` | カーブビューを Δ乖離グラフ ↔ サイズカーブ 切替（P1・TAKE中のみ） |

ショートカットモーダルにも追加。ESCカスケードは変更なし。

---

## 6. 差分メトリクス（P1 — 「数字で工程を選ぶ」）

### 6.1 maxΔ（最大乖離）

```js
// TAKEロード時＋検証パラメータ(F/depth/vis/旧①トグル)変更時に再計算（150ms debounce）
// アンカー = 既存 anchors()（層ごとの代表点）。基準ビューポートは仮想 VW×VH（m=1）
let maxD=0, argP=0, argLayer=0;
for(let i=0;i<=200;i++){
  const P=i/200, cam=camAt(tt,P);
  for(const li of visibleLayers) for(const pt of anchors()[li]){
    const a=project(pt,li,styleA,cam), b=project(pt,li,styleB,cam);
    const d=Math.hypot(a[0]-b[0],a[1]-b[1]);
    if(d>maxD){maxD=d;argP=P;argLayer=li;}
  }
}
// 表示（DATAセクションに追加）:
//   MAX Δ   142px @P=0.61 (KF2→3) · BOOK     ← 針色はしきい値で gold/rouge
// しきい値の目安: Δ < 8px 「そのままでOK」 / < 40px 「気にならないことが多い」 / それ以上 「作り直しを検討」
//   （目安値はDATA行のtooltip的キャプションに小さく併記。断定はしない）
```

- `(KF2→3)` は argP が属する seg から逆引き。クリックでその P へシーク。

### 6.2 Δ乖離グラフ（カーブビューのモード切替・`V`）

- x軸=P(0..1)、y軸=Δpx（自動レンジ）。styleA vs styleB の乖離を層別3本（BG/CEL/BOOK）。
- KF位置に縦目盛、現在Pに針。dwell区間は背景をうっすら gold で塗る（乖離が動かない区間だとわかる）。

### 6.3 視差量メーター（**旧§6.3 を差し替え**）

旧SPECの「COPY AS COMPOSER Z」は **`buildComposerJSON` が実装済みなので不要**。
代わりに §1 の表がラボ上で常時読めるようにする＝**この道具のいちばんの成果物**:

```
視差 (手前−奥)   ① 2034px  │  ③ 1056px (52%)  │  ② 1022px (50%)
サイズ Δ  奥 +22.0% / 手前 −18.0%      パン Δ  奥 +22.0% / 手前 −18.0%
```

- 現在の z（TAKE中は `camAt(P).z`）における値をライブ更新。数字は§9のスクリプトと一致すること。
- **`③はサイズとパンのΔが常に等しい` を見せる**のが要（＝ズレが係数1本に還元される説明）。等しいときは両者を罫線で結ぶ。
- DATA行の下に1行キャプション:
  「③＝奥行きのズーム配分だけ失う／②＝サイズは近いがパンが半減する」

---

## 7. フェーズ分割

### P0 — 実機合わせと解説の骨格（これだけで解説機として成立）✅ **実装済み 2026-08-15**
1. ✅ §4 統一形へ全面差し替え（`planeZoom` 導入・②③の分離・パンの内外を流儀ごとに分岐・`project()` も同経路）＋ y パン対応
2. ✅ §5.1 流儀セレクタ4つ＋実機名表示、§4.3 旧①トグル（`O`）
3. ✅ §2 EASE 5種化、§3 `buildTake`/`camAt` 転載、`applyTake`（bare / OBAN PROJECT の2形態）
4. ✅ §5.2 TAKEセクション＋dim規則、§5.3 タイムラインバー＋Pスクラブ＋KFジャンプ、`T`キー
5. ✅ §5.4 COPY/PASTE PARAMS への take 同梱

### P1 — 数値化
6. ✅ §6.3 視差量メーター（先行実装。サイドパネル「Drift / 連携ズレ」）
7. §6.1 maxΔ＋DATA行＋シーク連動、§6.2 Δグラフ（`V`）、§4.4 カーブビュー自動リスケール

### P2 — 運用の便利
7. §2 composer PROJECT_v2 ペースト（`COPY FOR COMPOSER` の出力を貼って**変換の検算**ができる）
8. 埋め込みJSON `?take=<id>` 選択（デモTAKEを1本同梱: T.U.→横PAN→寄り の複合、教材デフォルトに）
9. PROJECT ペースト時に `panels[].depth` のヒストグラムから3層 depth の推奨値を提示（適用はワンクリック・自動では変えない）

## 8. 受け入れ基準（Done）— **全項目クリア 2026-08-15**

- [x] `z=1` で **①②③の画が完全一致**（サイズ・パンとも。`pan≠0` でも成立。数値0.0%＋変換行列がビット一致）。
      **④は `pan≠0` では割れて正しい**（`pf=1`＝視差ゼロだから。`pan=0` なら④含め4流儀一致）
- [x] `z=2.0 / camx=0.5 / h=0.8 / W=1920,H=1080` で §1 の実測表と**ラボの数値が全項目一致**
- [x] **③のサイズΔとパンΔが全 z・全層で一致**（奥 +22.0%/+22.0%、手前 −18.0%/−18.0% 等）
- [x] 旧①トグルON・`z=0.5` で **奥 0.725 / 手前 0.375**（前後逆転が再現）／OFFで 0.500 / 0.500
- [x] `EXPORT JSON` 形（panels/frames/dof/texts/clickFx 付き）と bare TAKE の両方を PASTE → 再生できる
- [x] `ease:'outCubic'` が `smooth` に落ちず保持される（EASE5種が互いに別カーブであることも確認）
- [x] `kf=1`枚・`dwell`省略・`ease`未知キー・`z`範囲外(99/−5)・`kf`空・`x`が文字 でも壊れない。
      **拒否時は既存TAKEを保持**。ワイプ/DOF/テキストの件数がTAKE行に出る
- [x] `camAt` 数値一致テスト: `oban-builder.html` から関数を抽出して比較 → 4種のTAKE×P(0/.25/.5/.75/1) で**完全一致**
- [x] KFジャンプ（全KF中心にスナップ・カメラz追従）・Pスクラブ・CLEAR後の通常モード完全復帰
- [x] 構文チェック＋§9の数値テスト（`node tools/check.js` は本リポジトリ対象のため対象外）
- [x] **パラメータ動作チェック表**（全つまみを最小⇔最大で振って未配線ゼロを確認）

### 検証で判明した落とし穴（次に触る人へ）

- **SPLITの左右半分をそのままピクセル比較しても一致しない。** `hudChip()` の文字がキャンバスに
  焼き込まれるため。流儀ごとに `drawViewport()` をオフスクリーンへ描いて比べること
- **一致判定には許容差が要る。** 変換行列がビット一致でも、`scale(m*s)` と `scale(m)→scale(s)` では
  ラスタライズの丸めが変わり数画素（実測 2px / 256,000px・最大差 2/765）差が出る

## 9. 数値テストスクリプト（実装時の答え合わせ用）

§1 の表はこのスクリプトで算出した。ラボ実装後、**同じ入力でラボの表示値と突き合わせる**こと。

```js
const F=1000, W=1920, H=1080, SPREAD=0.22;
const lerp=(a,b,t)=>a+(b-a)*t;
const pf=d=>lerp(0.7,1.2,d);
const planeZoom=(z,d)=>{const s=1+Math.max(0,z-1)*SPREAD;return s===1?z:z*Math.pow(s,2*d-1);};
const Zof=d=>F*(1/pf(d)-1), persp0=d=>F/(F+Zof(d));      // persp0(d) === pf(d)
const oban =(d,z,cx,h)=>{const zi=planeZoom(z,d);return{size:h*H*zi, off:cx*pf(d)*W*zi};};
const planA=(d,z,cx,h)=>({size:h*H*z,            off:z*cx*W*persp0(d)});          // COMPOSER SCL
const planB=(d,z,cx,h)=>{const cZ=F*(1-1/z), p=F/(F+Zof(d)-cZ);
                         return{size:h*H*p/persp0(d), off:(cx*W/z)*p};};          // COMPOSER Zドリー
```

## 10. 非目標

- wipes / seq素材 / FRAMEネスト / fx / DOF の**再現**（ラボは**カメラワークだけ**を見る。件数表示にとどめる）
- OBAN panels の絵をラボに表示すること（シーン素材は BG/CEL/BOOK 固定。絵ではなく**動きの質**を見る道具）
- `buildComposerJSON` の改良提案（ラボは診断機。式を直すなら SPEC_06 側の仕事）

## 11. 関連

- `SPEC_01_OBAN_TAKE_RIG.md` §2 — TAKE データモデルの原典
- `SPEC_06_SATSUEI_KIT.md` §8 — z→Z 換算・案A/案Bの根拠（`buildComposerJSON` の出どころ）
- `OBAN_BUILDER_HANDOVER.md` §マルチプレーンの是正 — `planeZoom` 新式の経緯（§1おまけの一次情報）
- `LP_motion-graphics/PARALLAX_LAB/CLAUDE.md` — ラボ本体仕様（**①の式が旧式のままなので P0 で要更新**）
- `PIPELINE.md` §外部プロジェクトとの接点 — 本ブリッジの位置づけ
