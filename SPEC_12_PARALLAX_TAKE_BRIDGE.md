# SPEC_12 — PARALLAX_LAB × OBAN TAKE ブリッジ（実プロジェクト差分検証機）

OBAN_BUILDER で組んだ **TAKE JSON を PARALLAX_LAB に貼ると、同じカメラワークを
①撮影台マルチプレーン／②3Dドリー／③スケール の3流儀で並べて再生できる**ようにする。
「このカットは composer に持ち込んで Z ドリーへ振り直すべきか？」を**目視＋数値**で判断する検証機。

- **実装先**: `LP_motion-graphics/PARALLAX_LAB/parallax-lab.html`（単一HTML・KINETIC STAGE準拠のまま）
- **本リポジトリ側の義務**: TAKE 形式（`kf:[{x,y,z,dwell,ease}]`）を変えるときに本SPECとの互換を意識するだけ。コード変更なし
- **正準**: 再生コアは `oban-builder.html` の `buildTake()` / `camAt()`（§3にコード転載。共有ライブラリ化はせず**コピーで運用**）
- 状態: **P0/P1/P2 未着手**

---

## 1. 背景 / 価値

- OBAN のズームは様式①（`zi=1+(z−1)·lerp(0.55,1.25,depth)`）。composer は物理②（`persp=F/(F+Z−camZ)`）。
  SPEC_06 §8 で「OBAN→composer 持ち込み時、視差が欲しいカットは Z ドリーへ手動で振り直す」と決めたが、
  **どのカットが振り直しに値するかを事前に見る道具がない**。
- PARALLAX_LAB は3流儀の式を実機と同一係数で持つ教材ラボ。ここに**実プロジェクトの TAKE**を通せば、
  「①のまま LP に出す ／ ②で composer に振り直す ／ ③で十分（ロゴ等）」の判断が再生1回で下せる。
- 差分の最大値・発生位置（どの KF 区間か）まで数値で出す（§6）。勘ではなく数字で工程を選ぶ。

---

## 2. 入力仕様（PASTE TAKE）

クリップボード経由。以下の**3形態を自動判別**して受理する:

| 形態 | 判別 | 取り出し |
|---|---|---|
| bare TAKE_v1 | `j.kf` が配列 | `j` をそのまま |
| OBAN PROJECT（COPY PROJ 出力） | `j.take && j.panels` | `j.take` |
| 埋め込みJSON（P2） | `<script type="application/json" id="take-*">` | `?take=<id>` で選択（file://対応のため fetch は使わない） |

### バリデーション（applyTake）

```js
// 受理規則 — 未知キーは無視（前方互換）。失敗は ✗ INVALID フラッシュのみで状態を壊さない
kf: 必須・length>=1。各要素:
  x,y   : Number(有限)必須。単位=画面（x=1 → 1画面ぶん横）
  z     : 省略時1。clamp(0.25, 4)   ← 実機 camAt と同じレンジ
  dwell : 省略時1。max(0.05, v)
  ease  : E に無いキーは 'smooth' に落とす（E = {linear, smooth, inout} ラボ既存EASEと同名）
name/world : 表示のみ（ラボにworldは無いので不一致警告も出さない。TAKE行に併記）
wipes[]    : 無視。ただし「WIPES ×N IGNORED」を TAKE 行に表示（黙って捨てない）
```

- ペースト成功 → **TAKEモード**へ（S.take = 正規化済みTAKE、S.tt = buildTake(S.take)）。CLEAR で通常モード復帰。
- OBAN の panels[].depth は**持ち込まない**（シーンが違う。ラボは BG/CEL/BOOK の3層 depth スライダのまま）。
  実プロジェクトの深度分布を反映したいときは depth スライダを手で合わせる（P2 に補助案あり→§7）。

---

## 3. 正準再生コア（oban-builder.html から転載コピー）

`oban-builder.html` の実装が正準。**そのままコピー**して貼る（変数名も揃える。差し替え禁止箇所）:

```js
function buildTake(take){
  const kf=(take.kf&&take.kf.length)?take.kf:[{x:0,y:0,z:1,dwell:1}];
  const tw=d=>clamp(d,0.25,2.2);const segs=[];
  for(let i=0;i<kf.length;i++){
    segs.push({t:'dwell',a:kf[i],b:kf[i],w:Math.max(0.05,kf[i].dwell??1)});
    if(i<kf.length-1){const A=kf[i],B=kf[i+1];
      segs.push({t:'travel',a:A,b:B,ease:B.ease||'smooth',
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
- TAKEモード中のラボのタイムライン変数は **P（0..1）ただ1つ**。既存の S.t を P として流用し、
  `applyTimeline()` を「TAKE中: cam=camAt(P) → P.zoom=cam.z / camX=cam.x / camY=cam.y」に分岐させる。

---

## 4. 3流儀への写像（ここが本体）

TAKE の `cam{x,y,z}` を3流儀に写す。**z=1 で3流儀の画が完全一致**するラボの原則は維持する。

### 4.1 スケール（実装済みの式のまま）

| 流儀 | scale_i(z) |
|---|---|
| ① MULTIPLANE | `1+(z−1)·lerp(kFar,kNear,d)`（既定 0.55/1.25 = 実機） |
| ② DOLLY | `(F+Z(d))/(F+Z(d)−camZ)`、`Z(d)=1000·(1/lerp(0.7,1.2,d)−1)`、`camZ=F·(1−1/z)` |
| ③ SCALE | `z` |

### 4.2 パン（**P0で現行ラボを実機合わせに修正**）

実機（`oban-builder.html rect()`）は
`screenX = W/2 + (o.x − cam.x·pf)·W·zi`、`pf = lerp(0.7, 1.2, depth)`。
つまり**パンのオフセットはスケールの内側**（zi 倍される）で、係数は pf（0.7..1.2）。
現行ラボ①は係数 k（0.55..1.25）×スケール外側になっており実機と不一致 → **修正必須**。

3流儀とも次の**統一形**で書ける（これに置き換える）:

```
offset_i = cam · V · pf_i · s_i          // V: x→VW, y→VH。描画は translate をスケール内側へ
  ① pf = lerp(0.7, 1.2, d)   s = zi        …実機そのもの
  ② pf = lerp(0.7, 1.2, d)   s = scaleN    …F=1000基準に正規化した物理（z=1でF非依存に①と一致）
  ③ pf = 1                   s = z         …全層一律＝視差ゼロ
```

```js
// drawViewport 内の変換（1層ぶん）。旧: translate(-off) がスケール外側 → 新: 内側
ctx.translate(cx,cy); ctx.scale(m*s, m*s);
ctx.translate(-VW/2 - camX*pfx*VW, -VH/2 - camY*pfy*VH);
LAYERS[i].draw(ctx);
```

- **y パン対応が新規**（TAKE は2次元）。通常モードの PAN スライダは `camX = pan·0.24, camY = 0` として同じ経路に乗せる（PANV=240 定数は廃止）。
- ゴースト差分ベクトルの `project()` も同じ式に揃えること（ズレの原因になる）。
- ②のパンを厳密物理 `F/(F+Z−camZ)` でなく `pf·scaleN` とするのは**z=1一致の正規化**（F の寄与は scaleN 側が持つ）。SPEC_06 §8 の思想と同じ。

### 4.3 z レンジ

- camAt は z を 0.25..4 でクランプ（実機）。ラボの ZOOM スライダ表示レンジ 0.5..3 を超える値は
  スライダ振り切り＋数値表示で対応（スライダ min/max は変えない。表示は `.tv` に実値）。
- カーブビューの z 軸は TAKE中 `[min(kf.z)−0.2, max(kf.z)+0.4]` に自動リスケール（P1）。

---

## 5. UI 仕様

### 5.1 サイドパネル「▸ TAKE / OBAN連携」セクション（PRESET の直後に新設）

```
[▣ PASTE TAKE] [✕ CLEAR]
take-A · hangar-v1 · KF×6 · WIPES ×1 IGNORED     ← TAKE行（mono 9px, ice）。未ロード時 "—"
```

- PASTE 成功: `✓ APPLIED` / 失敗: `✗ INVALID`（既存 flash() 流用）
- TAKEモード中の dim 規則: **PRESETセクション**と**ZOOM/PANスライダ**を `.dimrow`
  （値は毎フレーム表示更新だけする＝read-only）。
  **生かすもの**: FOCAL / kNear / kFar / depth / vis / EASE系は殺す（easeはTAKE内蔵）→ FOCAL・k・depth・vis が検証パラメータ。
- DUR は「TAKE 1周の実尺」として生かす（camAt は P の純関数なので尺は自由）。既定 4s に引き上げ。

### 5.2 TAKEタイムラインバー（ステージ下端・canvas直描き）

- 高さ12px・下端から24px上。`buildTake` の segs を全幅にマップ:
  **dwell=gold太帯（高さ8px）／travel=ice細線（高さ2px）**、KF位置に `01 02 …` （mono 8px）。
- 現在P に white 針＋glow。**クリック/ドラッグでシーク**（既存ステージスクラブを TAKE中は P 直接操作に）。
- `←`/`→` は TAKE中 **KFジャンプ**（各 kf の dwell 区間中央 `P=(p0+p1)/2` へスナップ）に切替。

### 5.3 COPY/PASTE PARAMS の拡張

- COPY の JSON に `take:` を同梱（正規化済み TAKE そのまま）。PASTE は `take` キーがあれば applyTake。
  未知キー無視の前方互換は従来通り。

### 5.4 ショートカット追加

| キー | 動作 |
|---|---|
| `T` | クリップボードから PASTE TAKE（ボタンと同じ） |
| `←` `→` | TAKE中: KFジャンプ（通常時: ズーム±のまま） |
| `V` | カーブビューを Δ乖離グラフ ↔ サイズカーブ 切替（P1・TAKE中のみ） |

ショートカットモーダルにも3行追加。ESCカスケードは変更なし。

---

## 6. 差分メトリクス（P1 — 「数字で工程を選ぶ」）

### 6.1 maxΔ（最大乖離）

```js
// TAKEロード時＋検証パラメータ(F/k/depth/vis)変更時に再計算（150ms debounce）
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
// しきい値の目安: Δ < 8px 「③で十分」 / < 40px 「①のままでOK」 / それ以上 「②振り直し検討」
//   （目安値はDATA行のtooltip的キャプションに小さく併記。断定はしない）
```

- `(KF2→3)` は argP が属する seg から逆引き。クリックでその P へシーク。

### 6.2 Δ乖離グラフ（カーブビューのモード切替・`V`）

- x軸=P(0..1)、y軸=Δpx（自動レンジ）。styleA vs styleB の乖離を層別3本（BG/CEL/BOOK、既存の層別alpha）。
- KF位置に縦目盛、現在Pに針。dwell区間は背景をうっすら gold で塗る（乖離が動かない区間だとわかる）。

### 6.3 COPY AS COMPOSER Z（P2）

- SPEC_06 §8 の出発点式 `Z ≒ PERSP_FOCAL·(1−1/z)` で kf の z 列を camZ に換算した表をクリップボードへ:

```json
{"note":"SPEC_12: composer CAMERAトラックZ振り直し出発点。PERSP_FOCAL=1000",
 "rows":[{"kf":0,"z":1.0,"camZ":0},{"kf":2,"z":1.6,"camZ":375}]}
```

- あくまで**出発点の数表**（自動でトラックは作らない。判断と微調整は人間の仕事）。

---

## 7. フェーズ分割

### P0 — 再生コアとPAN実機合わせ（これだけで検証機として成立）
1. §4.2 パン統一形へ修正（**通常モード含む**・ベクトルprojectも）＋ y パン対応
2. §3 buildTake/camAt 転載、applyTake（§2 受理3形態のうち bare/PROJECT の2つ）
3. §5.1 TAKEセクション＋dim規則、§5.2 タイムラインバー＋Pスクラブ＋KFジャンプ、`T`キー
4. COPY/PASTE PARAMS への take 同梱

### P1 — 数値化
5. §6.1 maxΔ＋DATA行＋シーク連動、§6.2 Δグラフ（`V`）、§4.3 カーブビュー自動リスケール

### P2 — 運用の便利
6. 埋め込みJSON `?take=<id>` 選択（デモTAKEを1本同梱: T.U.→横PAN→寄り の複合、教材デフォルトに）
7. §6.3 COPY AS COMPOSER Z
8. （案）PROJECT ペースト時に panels[].depth のヒストグラムから3層 depth の推奨値を提示（適用はワンクリック・自動では変えない）

## 8. 受け入れ基準（Done）

- [ ] z=1 で3流儀の画が完全一致（既存原則の回帰確認。パン修正後も `pan=0` で成立）
- [ ] pan≠0・z=1 のとき ①と②のオフセットが全層一致し、③だけ平行移動（pf表の通り）
- [ ] `oban-builder.html` の COPY PROJ 出力をそのまま PASTE → 再生できる（bare TAKE も可）
- [ ] kf=1枚のTAKE・dwell省略・ease未知キー・wipes付きを食わせても壊れない（§2規則）
- [ ] camAt 数値一致テスト: 同一TAKEに対しラボ転載コアと oban-builder 側で `camAt(0/0.25/0.5/0.75/1)` が一致（node で両者の関数を抽出比較）
- [ ] KFジャンプ・タイムラインシーク・CLEAR後の通常モード完全復帰
- [ ] maxΔ の値が手計算1ケースと一致（例: ②vs③・BOOK層・z=2.2 で Δ=|2.895−2.2|·|anchor−中心| の想定値）
- [ ] `node tools/check.js` は本リポジトリ対象のため対象外。ラボ側は 構文チェック＋数値テスト（PARALLAX_LAB 実装時と同じ手順）で代替

## 9. 非目標

- wipes / seq素材 / FRAMEネスト / fx の再現（ラボは**カメラワークだけ**を検証する）
- composer PROJECT_v2（CAMERAトラック）→ TAKE の逆変換（必要になったら別SPEC）
- OBAN panels の絵をラボに表示すること（シーン素材は BG/CEL/BOOK 固定。絵ではなく**動きの質**を見る道具）

## 10. 関連

- `SPEC_01_OBAN_TAKE_RIG.md` §2 — TAKE データモデルの原典
- `SPEC_06_SATSUEI_KIT.md` §8 — z→Z 換算の出発点式（§6.3 の根拠）
- `LP_motion-graphics/PARALLAX_LAB/CLAUDE.md` — ラボ本体仕様（3流儀・画面構成・操作）
- `PIPELINE.md` §外部プロジェクトとの接点 — 本ブリッジの位置づけ
