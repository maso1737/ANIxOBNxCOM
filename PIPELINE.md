# PIPELINE.md — ツール間の入口/出口マップ

「え、そういう切り口からできたの！？」を偶然でなく設計で見つけるための1枚。
**新しいルートは「出口Aの形式と入口Bの形式が合うか」をこの表で探す。**
ツールの入出力を変えたら必ずこの表を更新すること（各プロジェクトのCLAUDE.mdより先にここ）。

## 入口/出口 一覧

| ツール | 入口（読めるもの） | 出口（書き出すもの） | 撮影処理 |
|---|---|---|---|
| **animator.html** | 画像(REF/下絵) / プロジェクトJSON(IndexedDB) / **2026-07〜: REFパネル `+ JSON / SEQ` に連番画像を複数選択 → 1件のREF ANIMATOR（ファイル名の数字順・1枚=1コマ）** / **2026-08〜: 1コマだけのREFは静止画扱いで全ティック表示（MANGA PLATEのコマ枠下敷き用。複数コマは従来どおり尽きたら非表示）** | ANIMATOR_v1 JSON（ファイル名 `animator_<ISO>.json`） / ライブ連携(BroadcastChannel `tdr_live`) / **2026-08〜: 作画タイムラプス動画 WebM・MP4（`timelapse_<work\|cell>_<yyyymmdd-hhmm>`。SPEC_14。作画の記録そのもので、パイプラインの下流には流さない終端出力）** | なし（作画に専念） |
| **composer.html** | PROJECT_v2 / PROJECT_v1 / ANIMATOR_v1 / IMAGE_v1(PNG·JPEG·WebP) / audio / ライブ連携 / **SPEC_07: トラックの`Re`でEX_DBから絵を取り直し** / **2026-07〜: 連番画像4枚以上（`^(.*?)(\d{3,5})\.(png\|webp\|jpe?g)$` の同名グループ）はIMPORT・D&Dとも1トラックのシーケンスに自動集約（OBANの `addFiles` と同一判定）** | 連番PNG(**SPEC_11 P7-4〜: 出力先は ZIP か「フォルダへ1枚ずつ」(`showDirectoryPicker`・未対応はZIPへ自動フォールバック)を INSPECTOR の OUTPUT で選択。フォルダ書き出しは溜め込まないので尺の上限が実質なくなる**・**P7-1/P7-2〜: 出力解像度は ×1/×2/長辺3840/任意＋のりしろ×1.2。アスペクトは常に保持**・**SPEC_11 P3〜: 全体/トラック単体ともワークエリア準拠。ファイル名は絶対フレーム番号 `frame_00011.png`〜**・**P8〜: 書き出しボタンは INSPECTOR の OUTPUT 内。SEQ PNG の Shift+クリック必須は廃止**) / 動画(MP4·WebM) / EXPORT WEB(スクロールビューアHTML・**P7-2〜: `bleed` を同梱＝ビューアのキャンバスものりしろ込みで描く**) / PROJECT_v2 JSON（ファイル名 `composer_<ISO>.json`） / **SPEC_11 P4-4〜: AE JSX（`composer_ae_<ISO>.jsx`＝カメラ＋各トラックを平面/ヌルレイヤーとしてKF付き生成。絵は運ばないのでソース差し替え前提）** / **SPEC_07: トラックの`ANI`で `animator.html?open=` ディープリンク** | **P0〜: fxチェーン**（VIDEO=rt / PNG=final / EXPORT WEB=rt・P2b〜） |
| **OBAN_BUILDER** | 画像D&D(単品/連番seq・**MANGA PLATEのPNG含む**) / プロジェクトJSON(**2026-07〜: EXPORT JSON / IMPORT JSON＝ファイル入出力に統一。旧 COPY/PASTE PROJ のクリップボード方式は廃止**) / **SPEC_07: + FROM ANIMATOR(EX_DB)＋ライブ連携(`tdr_live`受信・PNG書き出し不要)** | oban-viewer.html(単一HTML・画像は同フォルダ参照・**ap-seqはdataURLベイク同梱**・**SPEC_09 P4: FRAME枠線含む**・**V2-D: 縦書きテキスト/EN字幕(`?sub=0`)/クリックFX含む**・**DOFピン送り含む**) / プロジェクトJSON(**V2-D〜: `texts[]`+`clickFx`+`dof`含む**) / **P3: COPY FOR COMPOSER(PROJECT_v2=CAMERAトラック+fx+obanPanels配置同梱・クリップボード。composer側で画像を先にIMPORTしておくと名前一致で配置が自動適用=P3b。textsは対象外)** / **SPEC_07 B3: EDIT IN ANIMATOR(`?open=`ディープリンク)** | **P2〜: take.fx→ビューアrt** |
| **manga-plate.html** | 画像(D&D・IMPORT。落とした位置のコマに入る) / **MANGA_BOOK_v2 JSON**(ファイル) / **2026-08〜: ANIMATOR取込＝共有DB(`tdr_exchange`)の PROJECT_v1 を選んで画像素材化。以後 `tdr_live` の `project-update` で同 projectId の素材を自動差し替え（往来）** | **ページPNG / コマ別PNG / 全ページPNG**（WEB1200・WEB800・原寸／生グレー・網点化・カラー） / **MANGA_BOOK_v2 JSON** / **共有DBへ PROJECT_v1**（＝ANIMATORの`REF ＋FROM SAVED`・OBANの`＋FROM ANIMATOR`・COMPOSERの`?id=`がそのまま受け取れる。**受け側の改修ゼロ**） | なし（コマ割り・仕上げに専念） |
| **econte.html** | 紙ネーム/ラフの写真(D&D・IMPORT・Ctrl+Vペースト・HEIC) / パレットJSON / 音(mp3·wav·m4a·aac) / **プロジェクトZIP `ECONTE_PROJECT_v1`（⇧ PROJ。2026-08-15〜 音とマーカーも同梱＝これ1つで丸ごと戻せる）** | **動画コンテ WebM/mp4（実時間録画 or WebCodecs非実時間・音入り・C#/尺/**TIME**焼き込み可）** / **カラースクリプト一覧PNG（単位は「カット」ではなく**カメラ枠**。`C1-A`/`C1-L` が各1セル・`cam[].key`＝SHEET行の★ で間引き。SPEC_13 §5h）** / **プロジェクトZIP `ECONTE_PROJECT_v1`（⇩ PROJ。写真＋枠列＋加筆＋色＋音＋マーカー。ベイクは含めない）** / **P2予定: animator REF(`tdr_live`)** | なし（プリプロに専念） |
| **oban-viewer.html** | 同フォルダの画像ファイル | （最終出力・スクロールLP） | rt実行時（`?fx=0`でOFF） |
| **EXPORT WEBビューア** | （画像は埋め込み済み） | （最終出力・スクロールLP） | P2b(任意)でrt |
| **AE** | 4K連番PNG | 完成動画 | AE側（fx OFFで持ち込む） |
| **VERIFY_HARNESS** | 検証対象HTML（`window.__HARNESS__`契約実装） / baseline PNG / API録画fixtures | 統合結果JSON(summary.json) / diff PNG / baseline PNG | 検証専用（fx対象外） |

## 共通フォーマット

- **fxスキーマ v1**（SPEC_06 §2）— 全ツール共通・無変換で持ち回り。未知エフェクトはスキップ（前方互換）
- **TAKE**（SPEC_01）— `{kf:[{x,y,z,dwell,ease}]}`。OBAN / LP_Model_CR 系で共通。P3でcomposer CAMERAトラックへ変換可
- **PROJECT_v2** — composerの保存形式。IMPORT JSONは複数回で追加合成できる。**P0〜: トップレベル `fx:`（fxスキーマv1）を同梱**（欠損時は composer 側で `makeDefaultFx()` 補完。PROJECT_v1 単一トラック保存には乗らない）。**2026-07〜: トラック `type:'null'`（描画されない親専用ヌル）、カメラトラックの `parent`（NULLのtid）、KFの任意 `ei`/`eo`（influence% 0-100）を追加**（いずれも旧リーダーでは無視されるだけの後方互換フィールド）。**SPEC_11 P2/P3b/P4-2 で追加（すべて任意・省略時は既定値＝後方互換）: KFの `hold:true`（ステップ補間。区間の左キーに付き、次のキーまで値固定）／トラックの `tIn`(既定0)・`tOut`(既定 null=末尾まで)＝**コンポ時間基準**のIN/OUTトリム、`tOffset`(既定0・負可)＝時間オフセット（**トラック内時間 = コンポ時間 − tOffset**。絵とKFの両方が動く）、`locked:true`（編集ロック）**。**SPEC_11 P7-1/P7-2 で追加: トップレベル `out:{mode:'x1'|'x2'|'long3840'|'custom', long, bleed}`**（書き出し解像度とのりしろ×1.2。省略時は `long3840`・のりしろ無し＝従来出力。**出力サイズはコンポのアスペクトを常に保つ**ので、16:9以外のコンポでも変形しない）

## 成立している制作ルート

1. animator → composer →（fx OFF・連番）→ AE → 動画 …従来
2. animator → composer →（fx final）→ 動画/連番 …AE不要ルート(P0〜)
3. animator → OBAN_BUILDER → oban-viewer(LP) …スクロールコンテンツ(fxはP2〜)。**SPEC_07〜: PNG書き出し不要（+ FROM ANIMATOR＋ライブ同期→EXPORTでdataURLベイク）**
4. animator → OBAN_BUILDER →（P3変換）→ composer →（fx final）→ 動画
5. animator → composer → EXPORT WEB(LP) …fx rt実行(P2b〜)。fx有効時のみコア同梱・`?fx=0`でOFF
6. manga-plate →（透過PNG）→ OBAN（コマ内=FRAME子/飛び出し=ルート）/ composer …トーン・スピード線・枠の板（SPEC_09）
7. manga-plate →（×4 SEEDS連番）→ OBAN seqパネル（loop）…集中線がバタつく演出
10. **manga-plate でコマを割る → コマを選んで `▶ ANIMATOR REF`（共有DB経由）→ ANIMATOR で枠内の絵/ふきだし/擬音を描く → manga-plate `◀ ANIMATOR 取込` で送った位置にピタリ戻る（以後は保存のたび自動更新）→ はみ出しはコマのマスクでカット、スピード線/トーンを乗せて仕上げ → `▶ OBAN`（あたり・展開）／`▶ COMPOSER`（詰め）**
    …漫画ページ主導ルート（SPEC_09 v2）。**送受信は既存の `tdr_exchange` / `tdr_live` にそのまま相乗りしており、animator / oban / composer 側の改修は不要**
8. 紙ネーム/ラフ写真 → econte（BOARD切り出し→SHEET絵コンテ→TIMELINE）→ **動画コンテ WebM/mp4** …プリプロ（SPEC_10 P0+P1）。**P2で → animator REF（本作画へ）／ → カラースクリプト一覧PNG を接続予定**
9. **紙の大判レイアウト写真 → econte BOARD にカメラ枠列 A→B→…→L を置く → 動画コンテ／カラースクリプト** …大判PAN・T.U.のプリプロ（SPEC_13 V2-D 予定）。ベイク範囲＝枠の和集合なので「PAN先に画が無い」が構造的に起きない。**枠列 `cam[]` は OBAN の TAKE（`kf:[{x,y,z,dwell,ease}]`）と同じ「矩形/位置のキー列」なので、将来 econte → OBAN/composer のカメラ受け渡しに変換可**（未着手・変換式は未定）

## 関連スキル

- `satsuei-fx-kit` — 撮影処理チェーンの移植（正準コア＋レシピ）
- `composer-timeline-kit` / `camera-rig-orbit-capture` / `object-rig-gizmo-capture` / `vj-audio-export-kit`
- `single-html-verify` — 決定論VRT＋パフォーマンスバジェット＋APIモック検証（正準 `VERIFY_HARNESS/`）

## 外部プロジェクトとの接点（LP_motion-graphics）

- **PARALLAX_LAB**（`LP_motion-graphics/PARALLAX_LAB/parallax-lab.html`）— 「寄り」の3流儀（①撮影台マルチプレーン／②3Dドリー／③スケール）比較教材ラボ。
  係数は本リポジトリの実機値と同一（`k(depth)=lerp(0.55,1.25,depth)` / `persp=F/(F+Z−camZ), F=1000` ≒ composerの`PERSP_FOCAL`）。
  **TAKEブリッジ**: OBAN_BUILDERの**TAKE JSON**（SPEC_01 §2 `PROJECT.take`、COPY PROJで取得可）を貼ると、
  同じカメラワークを3流儀で並べて再生できる＝**実プロジェクトの差分検証機**。
  **設計・仕様は `SPEC_12_PARALLAX_TAKE_BRIDGE.md`（P0/P1/P2未着手）**。
  実装はPARALLAX_LAB側の対応で、本リポジトリ側は**TAKE JSON形式（`kf:[{x,y,z,dwell,ease}]`）を変えるときにSPEC_12との互換性を意識**すれば足りる。
- 上記以外、`LP_motion-graphics/CLAUDE.md`のSPEC_06に関する記述（「composer P0/P1・P3は未着手」）は古い
  （本リポジトリでは両方とも実装済み）。あちらのドキュメントなので本リポジトリからは編集しない。
