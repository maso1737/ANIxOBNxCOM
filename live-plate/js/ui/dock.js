/* ============================================================
   LIVE PLATE — ui/dock.js（下部ドック：ステップごとの道具。OBAN renderDock() と同じ作り）
   ★ レールの道具は6個以内（§2-4）。まだ無いフェーズの道具は「押せない＋P番号の札」で並べておく
     ＝完成形の場所を先に見せつつ、「動かない＝バグか仕様か」で悩ませない（CLAUDE.md の約束）。
   ============================================================ */
var LP = window.LP || (window.LP = {});

(function(){
  'use strict';
  const $ = s => document.querySelector(s);
  const U = () => LP.ui;

  /* レール1個。later＝そのフェーズで来る（押せない） */
  function rail(id, t, key, opt){
    opt = opt || {};
    const later = opt.later;
    return '<div class="rail' + (opt.on ? ' on' : '') + (later ? ' later' : '') + '"' + (later ? '' : ' data-act="' + id + '"')
      + ' title="' + U().esc(opt.tip || t) + (later ? '（' + later + ' で実装）' : '') + '">'
      + (later ? '<span class="ph">' + later + '</span>' : '')
      + '<span class="t">' + t + '</span><span class="k">' + (key || '') + '</span></div>';
  }
  function grp(en, jp, body){
    return '<div class="dk-grp"><div class="dk-hd"><span class="dk-lab">' + en + '</span><span class="dk-jp">' + (jp || '') + '</span></div><div class="dk-row">' + body + '</div></div>';
  }
  const VL = '<span class="dk-vl"></span>';

  function render(){
    const el = $('#dock');
    if(!el || !LP.book) return;
    const st = LP.state.step;
    el.innerHTML = st === 'sheet' ? sheetHTML() : st === 'draw' ? drawHTML() : st === 'take' ? takeHTML() : showHTML();
  }

  /* 01 SHEET のレール：Wクリック（2回続けて押す）でその道具のモード。いまのモードは下の小さい字 */
  function sheetRails(){
    const st = LP.state, t = st.tool;
    const m = {
      sel: st.selMode === 'panel' ? 'コマ' : '素材',
      div: { f: '斜', v: '縦', h: '横' }[st.divMode],
      text: st.textVert ? '縦' : '横',
      tone: LP.model.ITEM_NAMES[st.toneKind],
      white: st.whiteErase ? '消し' : '白',
    };
    const r = (id, lab, key, tip) => '<div class="rail' + (t === id ? ' on' : '') + '" data-act="tool" data-t="' + id + '" title="' + U().esc(tip) + '">'
      + '<span class="t">' + lab + '</span><span class="k">' + key + (m[id] ? '・' + m[id] : '') + '</span></div>';
    return grp('TOOLS', '割る・置く',
      r('sel', 'SEL', 'V', '選ぶ・動かす（角で大きさ・Shift＝縦横別）／Wクリック：素材 ⇄ コマ')
      + r('div', 'DIV', 'D', 'コマを割る：紙の上に線を引く（紙の外から引く＝縦横・Shift＝15°）／Wクリック：斜 → 縦 → 横')
      + r('edit', 'EDIT', 'P', '分割線を動かす：■＝平行移動・●＝回転（Shift＝15°）')
      + r('text', 'TEXT', 'T', '文字：クリックした所に置いて詳細で打つ／Wクリック：縦書き ⇄ 横書き')
      + r('tone', 'TONE', 'N', '仕上げ：クリックしたコマに置く／Wクリック：網 → 集中線 → 流線')
      + r('white', '白', 'W', 'ホワイト：ドラッグで囲う／クリックで始める＝多角形（Enter で閉じる）／Wクリック：白 ⇄ 消し'));
  }
  /* 奥⇄手前の定規（OBAN の DEPTH 定規と同じ手つき）。0.6 が紙の面 */
  function zRuler(L){
    const d = LP.panels.dFromZ(L.z || 0);
    return '<div class="zr-wrap" title="奥⇄手前（Z）。カメラが動いたときの視差だけに効く＝止まった画は変わらない（カメラは P3）。点線＝紙の面">'
      + '<span class="dk-jp">奥</span><div class="zr" data-zr><i class="ax"></i><i class="pp"></i><b class="dm" style="left:' + (d * 100).toFixed(1) + '%"></b></div><span class="dk-jp">手前</span>'
      + '<span class="zr-v" id="dk-zv">' + zLabel(d) + '</span></div>';
  }
  function zLabel(d){ return Math.abs(d - 0.6) < 0.005 ? '紙の面' : (d < 0.6 ? '奥 ' : '手前 ') + d.toFixed(2); }
  const INK = [['#000000', '黒'], ['#FFFFFF', '白'], ['#808080', '灰']];

  function sheetHTML(){
    const u = U(), L = LP.app.selLayer(), it = LP.app.selItem(), k = LP.app.selPanel(), sh = LP.app.curSheet();
    let h = sheetRails();
    h += VL;
    if(L){
      const sc = Math.round(L.w / LP.detail.baseW(L) * 100);
      const inPanel = L.panelId && LP.model.panelById(sh, L.panelId);
      h += grp('LAYER', u.esc(L.name) + (inPanel ? '　コマ ' + (sh.panels.indexOf(inPanel) + 1) : '　枠の上'),
        '<button class="qd-sb" data-act="scaleDn" title="小さく（10%）">－</button>'
        + u.qdNum('lsc', 'SIZE', sc, '%')
        + '<button class="qd-sb" data-act="scaleUp" title="大きく（10%）">＋</button>'
        + '<span style="width:6px"></span>' + u.qdNum('lop', 'OPACITY', Math.round(L.opacity * 100), '%')
        + '<span style="width:6px"></span>' + zRuler(L)
        + '<button class="qd-sb" data-act="fwd" title="1つ手前へ（重なり順）　]">手前へ</button>'
        + '<button class="qd-sb" data-act="back" title="1つ奥へ（重なり順）　[">奥へ</button>'
        + '<button class="qd-sb" data-act="fit" title="' + (inPanel ? 'コマいっぱいに（のりしろ込み・縦横比は保つ）' : '紙いっぱいに収める（縦横比は保つ）') + '">' + (inPanel ? 'コマに合わせる' : '紙に合わせる') + '</button>'
        + '<button class="qd-sb" data-act="dup" title="複製（同じ素材を参照する層がもう1枚）　Ctrl+D">複製</button>'
        + '<button class="qd-sb del" data-act="del" title="層を消す（Ctrl+Z で戻せます）　DEL">削除</button>');
    }else if(it){
      h += grp('ITEM', u.esc(it.name) + (it.panelId ? '' : '　枠の上'),
        u.qdNum('iop', 'OPACITY', Math.round((it.opacity == null ? 1 : it.opacity) * 100), '%')
        + '<span style="width:6px"></span>'
        + INK.map(([c, n]) => '<button class="qd-sb jp' + (String(it.color).toUpperCase() === c ? ' on' : '') + '" data-act="ink" data-v="' + c + '" title="色：' + n + '">' + n + '</button>').join('')
        + '<span style="width:6px"></span>'
        + '<button class="qd-sb" data-act="ifwd" title="1つ前へ（同じ段の中）">前へ</button>'
        + '<button class="qd-sb" data-act="iback" title="1つ後ろへ（同じ段の中）">後ろへ</button>'
        + '<button class="qd-sb" data-act="dup" title="複製　Ctrl+D">複製</button>'
        + '<button class="qd-sb del" data-act="del" title="消す（Ctrl+Z で戻せます）　DEL">削除</button>'
        + '<span class="dk-jp" style="margin-left:6px">本数・濃さ・文字は 詳細（U）</span>');
    }else if(k){
      const n = sh.panels.indexOf(k) + 1, cnt = sh.layers.filter(o => o.panelId === k.id).length + (sh.items || []).filter(o => o.panelId === k.id).length;
      h += grp('PANEL', 'コマ ' + n + '　中身 ' + cnt,
        '<button class="qd-sb' + (k.border !== false ? ' on' : '') + '" data-act="pBorder" title="このコマの枠線 ON/OFF">枠線</button>'
        + '<button class="qd-sb' + (k.bleed ? ' on' : '') + '" data-act="pBleed" title="断ち切り：内枠に接した辺を紙の端まで伸ばす">断ち切り</button>'
        + '<button class="qd-sb" data-act="pMerge" title="このコマを割った線を取り除く（分割の逆）">分割を戻す</button>'
        + '<span class="dk-jp" style="margin-left:6px">選んでいる間は DIV がこのコマだけを割る</span>');
    }else{
      const tip = {
        sel: LP.state.selMode === 'panel' ? '<b>コマ</b>をクリックで選ぶ（枠線・断ち切り・分割を戻す）' : '紙の上の絵・素材を<b>クリック</b>で選ぶ ／ <b>ドラッグ</b>で移動 ／ 角で大きさ ／ 層を<b>Wクリック</b>で 02 DRAW',
        div: '紙の上で<b>線を引く</b>とコマが割れる（紙の外から引き始める＝縦・横）。コマを選んでおくとそのコマだけ',
        edit: '分割線の <b>■</b>＝平行移動 ／ <b>●</b>＝回転。コマをクリック＝選ぶ',
        text: '<b>クリック</b>した所に文字 → 詳細（U）で打つ。Wクリック（T を2回）で縦 ⇄ 横',
        tone: '<b>クリック</b>したコマに ' + LP.model.ITEM_NAMES[LP.state.toneKind] + '。Wクリック（N を2回）で 網 → 集中線 → 流線',
        white: '<b>ドラッグ</b>で囲う ／ <b>クリック</b>で始めると多角形（Enter・始点・Wクリックで閉じる）',
      }[LP.state.tool];
      h += '<div class="dk-info"><span class="t">' + (sh && sh.panels.length ? 'コマ ' + sh.panels.length : 'コマ割り無し（全面1コマ）') + '</span><span class="s">' + tip + '</span></div>';
      h += '<span class="dk-sp"></span>';
      h += grp('ADD', '取り込む・描く', '<button class="btn" data-act="pick" title="画像を選んで、いまの紙に層として置く（複数・連番OK）">＋ 画像を置く</button>'
        + '<button class="btn" data-act="newDraw" title="空のプレート（カメラ出力の大きさ）を紙いっぱいに置いて 02 DRAW へ（コマを選んでいればそのコマ）">＋ 描く層</button>'
        + '<button class="btn" data-act="addSheet" title="空の紙を最後に足す">＋ 紙</button>');
    }
    return h;
  }

  /* 02 DRAW：レールは Wクリック（2回続けて押す）でその道具のモード（SPEC_17）。いまのモードは下の小さい字 */
  function drawHTML(){
    const u = U(), D = LP.state.draw, DT = LP.drawTools;
    const tg = DT.target(), p = tg && tg.plate;
    const r = (id, lab, key, sub, tip, cls) => '<div class="rail' + (D.tool === id ? ' on' : '') + (cls ? ' ' + cls : '') + '" data-act="dtool" data-t="' + id + '" title="' + u.esc(tip) + '">'
      + '<span class="t">' + lab + '</span><span class="k">' + key + (sub ? '・' + sub : '') + '</span></div>';
    let h = grp('TOOLS', '描く',
      r('pen', 'PEN', 'P', D.pressure ? '筆圧' : '固定', 'ペン：線レーン＝インク／塗レーン＝塗りの色（補修）。Shift＋クリック＝直前の終点から直線／Wクリック：筆圧 ON/OFF')
      + r('erase', 'ERASE', 'E', '', '消しゴム（透明にする）／Wクリック：このセルを全消去（線＋塗・Ctrl+Z で戻る）')
      + r('fill', 'FILL', 'G', D.fillErase ? '消し' : (D.fillMode === 'lasso' ? '投げ縄' : 'バケツ'), 'FILL：押すと塗レーンへ。バケツ＝線が壁・潜って塗る／Wクリック：バケツ ⇄ 投げ縄塗り／長押し・Shift＋G：投げ縄消し', D.fillErase ? 'fe' : '')
      + r('sel', 'SEL', 'A', D.selWarp ? 'WARP' : '', 'SEL：ドラッグ＝投げ縄・Shift＝矩形で持ち上げて変形／Wクリック：WARP ON/OFF')
      + r('eye', 'EYE', 'Alt', '', 'スポイト：見えている色を拾ってインク（線）／塗りの色（塗）に。Alt＋クリックはどの道具からでも')
      + '<div class="rail' + (D.refOpen ? ' on' : '') + '" data-act="dref" title="参照（REF）：同じ BOOK の他の素材を下に透かす（R）"><span class="t">REF</span><span class="k">R' + (p && p.refs && p.refs.length ? '・' + p.refs.length : '') + '</span></div>');
    h += VL;
    if(!p){
      h += '<div class="dk-info"><span class="t">NO LAYER</span><span class="s">01 SHEET で層を <b>Wクリック</b>、右の ◆ITEMS で層を選ぶ、または<br><b>＋ 描く層</b>で空のプレート（' + LP.app.outSize().w + '×' + LP.app.outSize().h + '）を紙に置いて描き始める</span></div>';
      h += grp('ADD', '', '<button class="btn on" data-act="newDraw" title="空のプレートを紙いっぱいに置いて描き始める（コマを選んでいればそのコマ）">＋ 描く層</button>');
      h += '<span class="dk-sp"></span>' + grp('BACK', '戻る', '<button class="btn" data-act="toSheet" title="01 SHEET へ戻る（Esc）">◀ 01 SHEET（Esc）</button>');
      return h;
    }
    const lk = l => p.lanes && p.lanes[l] && p.lanes[l].locked ? '🔒' : '';
    h += grp('LANE', 'L で切替',
      '<button class="qd-sb' + (D.lane === 'line' ? ' on' : '') + '" data-act="dlane" data-v="line" title="線レーン（主線）">線 LINE' + lk('line') + '</button>'
      + '<button class="qd-sb' + (D.lane === 'fill' ? ' on' : '') + '" data-act="dlane" data-v="fill" title="塗レーン（線の下。バケツは線を壁にする）">塗 FILL' + lk('fill') + '</button>');
    if(D.tool === 'sel'){
      const fa = LP.drawSel.active, cl = LP.drawSel.hasClip;
      h += grp('SEL', fa ? '浮いている — Enter 確定・Esc 取消' : '囲って持ち上げる',
        '<button class="qd-sb' + (D.selAA ? ' on' : '') + '" data-act="selAA" title="貼るときのなめらかさ（OFF＝アンチ無しのまま・色も変わらない）">AA ' + (D.selAA ? 'ON' : 'OFF') + '</button>'
        + '<button class="qd-sb' + (D.selBoth ? ' on' : '') + (fa ? ' off' : '') + '" data-act="selBoth" title="線+塗：両レーンを同じ形で持ち上げる">線+塗</button>'
        + '<button class="qd-sb' + (D.selWarp ? ' on' : '') + '" data-act="selWarp" title="WARP：3×3 の格子で曲げる（A を2回）">WARP</button>'
        + '<button class="qd-sb' + (fa ? '' : ' off') + '" data-act="selCopy" title="浮いた形をコピー（Ctrl+C）">COPY</button>'
        + '<button class="qd-sb' + (cl ? '' : ' off') + '" data-act="selPaste" title="同じ位置に貼る（Ctrl+V）">PASTE</button>'
        + '<button class="qd-sb' + (fa ? '' : ' off') + '" data-act="selOk" title="確定（Enter）">✓ 確定</button>'
        + '<button class="qd-sb' + (fa ? '' : ' off') + '" data-act="selCancel" title="取消（Esc）">✕ 取消</button>');
    }else if(D.tool === 'fill'){
      h += grp('FILL', D.fillErase ? '投げ縄消し：いまのレーン' : '塗レーン',
        u.qdSeg('dfmode', [['bucket', 'バケツ'], ['lasso', '投げ縄'], ['erase', '投げ縄消し']], D.fillErase ? 'erase' : D.fillMode)
        + '<span class="dk-jp" style="margin-left:4px">潜り</span>' + u.qdSeg('dunder', [[0, '0'], [1, '1'], [2, '2'], [3, '3']], D.under) + '<span class="dk-jp">px</span>');
    }else if(D.tool === 'pen' || D.tool === 'erase'){
      const er = D.tool === 'erase';
      h += grp('BRUSH', er ? '消しゴム' : 'ペン',
        '<button class="qd-sb" data-act="dsizeDn" title="細く">－</button>' + u.qdNum('dsize', 'SIZE', er ? D.eraseSize : D.penSize, 'px') + '<button class="qd-sb" data-act="dsizeUp" title="太く">＋</button>'
        + '<button class="qd-sb' + ((er ? D.pressureErase : D.pressure) ? ' on' : '') + '" data-act="dpress" title="筆圧（ペンと消しゴムで別々。' + (er ? '' : 'P を2回') + '）">筆圧</button>');
    }
    if(D.refOpen){
      const others = Object.values(LP.book.plates).filter(o => o.id !== p.id);
      const refs = p.refs || [];
      h += grp('REF', '参照＝下に透かす（出力には出ない）',
        '<div class="dk-refs">' + (refs.length ? refs.map(rf => { const rp = LP.book.plates[rf.plateId]; return '<div class="rr"><i style="background:' + rf.color + '"></i><span style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' + u.esc(rp ? rp.name : '?') + '</span>'
          + u.qdSeg('refOp', [[rf.id + ':0.2', '20'], [rf.id + ':0.4', '40'], [rf.id + ':0.7', '70']], rf.id + ':' + rf.opacity) + '<button class="qd-sb del" data-act="refDel" data-v="' + rf.id + '">✕</button></div>'; }).join('') : '<span class="dk-jp">下の素材を押すと参照に足します。タイムラインの REF 行で ずらす・×N</span>') + '</div>'
        + '<div class="dk-plates">' + others.map(o => '<button data-act="refAdd" data-v="' + o.id + '" title="' + u.esc(o.name) + '（' + o.w + '×' + o.h + '・セル ' + o.cells.length + '）を参照に" style="background-image:url(' + (o.thumb ? LP.cache.thumbURL(o.thumb) : '') + ')"><span>' + u.esc(o.name) + '</span></button>').join('') + '</div>');
    }else{
      const cur = D.lane === 'fill' ? D.paint : D.ink;
      h += grp('COLOR', D.lane === 'fill' ? '塗りの色' : 'インク',
        '<div class="dk-cur"><div class="chip" style="background:' + cur + '" title="色を選ぶ"><input type="color" data-f="dcolor" value="' + cur.toLowerCase() + '"></div><span class="lb">' + cur + '</span></div>'
        + '<div class="dk-sw">' + LP.drawTools.PAL.map(c => '<button class="' + (c === cur ? 'on' : '') + '" data-act="dpal" data-v="' + c + '" style="background:' + c + '" title="' + c + '"></button>').join('') + '</div>');
    }
    const n = p.cells.length, ci = tg.ci, cell = ci >= 0 ? p.cells[ci] : null;
    h += grp('CELL', ci < 0 ? 'このコマは出ていない' : 'セル ' + (ci + 1) + ' / ' + n,
      '<button class="qd-sb" data-act="cellPrev" title="前のセル（↑）">◀</button><button class="qd-sb" data-act="cellNext" title="次のセル（↓）">▶</button>'
      + '<button class="qd-sb" data-act="cellAdd" title="いまのセルの後ろに空のセルを足す">＋</button>'
      + '<button class="qd-sb" data-act="cellDup" title="いまのセルを複製して後ろへ">複製</button>'
      + '<button class="qd-sb del" data-act="cellDel" title="いまのセルを消す（Ctrl+Z で戻る）">削除</button>'
      + (cell ? u.qdNum('cdur', '長さ', cell.dur, 'コマ') : '')
      + '<button class="qd-sb' + (D.onion ? ' on' : '') + '" data-act="onion" title="オニオン：前＝赤・後＝青（O）">オニオン</button>'
      + '<button class="qd-sb' + (D.onionFill ? ' on' : '') + '" data-act="onionFill" title="オニオンに塗りも含める">＋塗</button>');
    h += '<span class="dk-sp"></span>' + grp('BACK', '戻る', '<button class="btn" data-act="toSheet" title="01 SHEET へ戻る（Esc）">◀ 01 SHEET</button>');
    return h;
  }

  function takeHTML(){
    const b = LP.render.camBase(LP.book), o = LP.app.outSize(LP.book.out.long);
    let h = grp('CAMERA', '撮る',
      rail('cap', 'CAPTURE', 'C', { later: 'P3', tip: 'いまの窓を KF に' }) + rail('focus', '◎FOCUS', '', { later: 'P3', tip: 'ピント（多点 DOF）' })
      + rail('fx', 'FX', 'F', { later: 'P3', tip: '撮影処理' }) + rail('join', '繋ぎ', '', { later: 'P3', tip: 'cut / fade / wipe' }) + rail('shake', '∿', '', { later: 'P3', tip: '画ブレ' }));
    h += VL;
    h += '<div class="dk-info"><span class="t">既定カメラ — 紙全面</span><span class="s">窓 <b>' + b.w + '×' + b.h + '</b>（紙）→ 出力 <b>' + o.w + '×' + o.h + '</b>。枠の中＝書き出しと同じ式（composer の透視 1本）'
      + '<br>カメラを打つ（KF・dwell・ピント）のは P3。いまは Space で再生だけ確認できます。</span></div>';
    return h;
  }

  function showHTML(){
    const ex = LP.io.exportState();
    const o = LP.app.outSize(ex.res), seq = ex.kind === 'seq';
    let h = grp('SHOW', '見せる',
      '<div class="rail" data-act="playFull" title="UI を全部消して全画面で再生（Space＝再生/停止・←→＝コマ・J/K＝紙の頭・Esc＝戻る）"><span class="t">▶ PLAY</span><span class="k">全画面</span></div>'
      + rail('rec', '● REC', 'LIVE', { later: 'P4', tip: '再生しながら描いて録画' }));
    h += VL;
    h += grp('OUTPUT', '出す',
      '<div class="dk-out' + (seq ? '' : ' on') + '" data-act="exKind" data-v="html" title="スクロールで動く単一 HTML（画像はすべて埋め込み＝別 PC でもそのまま開ける）"><span class="t">HTML</span><span class="s">スクロールビューア<br>画像は全部埋め込み</span></div>'
      + '<div class="dk-out later"><span class="t">VIDEO</span><span class="s">MP4（非実時間）／WebM</span><span class="ph">P3</span></div>'
      + '<div class="dk-out' + (seq ? ' on' : '') + '" data-act="exKind" data-v="seq" title="カメラの出力を1コマ1枚の PNG に（合体・線・塗・線+塗）"><span class="t">SEQ PNG</span><span class="s">合体・線・塗・線+塗<br>ZIP／フォルダ</span></div>');
    h += VL;
    if(ex.busy){
      h += '<div class="dk-prog"><span class="m" id="dk-pmsg">' + U().esc(ex.msg) + '</span><div class="bar"><i id="dk-pbar" style="width:' + Math.round(ex.p * 100) + '%"></i></div></div>'
        + '<button class="btn dk-go" data-act="' + (seq ? 'expSeq' : 'expHtml') + '" title="もう一度押すと中断">中断</button>';
      return h;
    }
    const resRow = '<div class="dk-row"><span class="dk-jp">解像度</span>' + U().qdSeg('exRes', [[1280, '1280'], [1920, '1920'], [3840, '3840']], ex.res) + '<span class="dk-jp" style="width:auto">' + o.w + '×' + o.h + '</span></div>';
    if(seq){
      h += grp('SEQ PNG', '書き出しの設定',
        '<div class="dk-set">' + resRow
        + '<div class="dk-row"><span class="dk-jp">中身</span>' + U().qdSeg('exSeqMode', [['comp', '合体'], ['line', '線'], ['fill', '塗'], ['both', '線+塗']], ex.seqMode) + '</div>'
        + '<div class="dk-row"><span class="dk-jp">保存先</span>' + U().qdSeg('exSeqTo', [['zip', 'ZIP'], ['folder', 'フォルダ']], LP.io.canFolder() ? ex.seqTo : 'zip') + (LP.io.canFolder() ? '' : '<span class="dk-jp" style="width:auto">（このブラウザは ZIP だけ）</span>') + '</div>'
        + '</div>');
      h += '<div class="dk-est"><span class="s"><b>' + LP.io.estimateSeq(ex) + '</b>・' + LP.time.fmtDur(LP.time.totalFrames(LP.book), LP.book.fps)
        + '<br>' + (ex.seqMode === 'comp' ? 'frames/ 見えている画' : ex.seqMode === 'both' ? 'line/ と fill/（透明の地）' : ex.seqMode + '/ そのレーンだけ（透明の地）') + '</span><button class="btn on dk-go" data-act="expSeq" title="連番 PNG を書き出す">書き出す</button></div>';
      return h;
    }
    h += grp('HTML', '書き出しの設定',
      '<div class="dk-set">' + resRow
      + '<div class="dk-row"><span class="dk-jp">画質</span>' + U().qdSeg('exQ', [['webp80', 'WEBP 80'], ['webp95', 'WEBP 95'], ['orig', '原画']], ex.q) + '</div>'
      + '<div class="dk-row"><span class="dk-jp">感度</span>' + U().qdSeg('exPpf', [[10, '速い'], [20, '標準'], [40, 'ゆっくり']], ex.ppf) + '</div>'
      + '</div>');
    h += '<div class="dk-est"><span class="s">推定 <b>' + LP.io.estimateHtml(ex) + '</b><br>紙 ' + LP.book.sheets.length + ' 枚・' + LP.time.fmtDur(LP.time.totalFrames(LP.book), LP.book.fps)
      + '・1コマ＝' + ex.ppf + 'px</span><button class="btn on dk-go" data-act="expHtml" title="HTML を書き出してダウンロード">書き出す</button></div>';
    return h;
  }

  let lastRail = { t: '', at: 0 };
  function onClick(e){
    const b = e.target.closest('[data-act]');
    if(!b) return;
    const a = b.dataset.act, L = LP.app.selLayer(), it = LP.app.selItem(), k = LP.app.selPanel(), sh = LP.app.curSheet();
    switch(a){
      case 'tool': {
        // Wクリックは自前で数える（1回目で道具を替えるとドックが描き直されて dblclick が届かない）
        const now = performance.now(), t = b.dataset.t;
        if(lastRail.t === t && now - lastRail.at < 380){ lastRail = { t: '', at: 0 }; LP.sheetTools.toggleMode(t); }
        else { lastRail = { t, at: now }; LP.sheetTools.setTool(t); }
        break;
      }
      case 'scaleUp': case 'scaleDn':
        if(L){ const d = LP.detail.SCR.lsc; d.set(Math.max(2, d.get() + (a === 'scaleUp' ? 10 : -10))); LP.app.commit('層の大きさ'); }
        break;
      case 'fwd': case 'back': LP.app.layerStep(a === 'fwd' ? 1 : -1); break;
      case 'ifwd': case 'iback': LP.app.itemStep(a === 'ifwd' ? 1 : -1); break;
      case 'fit': LP.app.fitLayerToPaper(); break;
      case 'dup': LP.app.dupSel(); break;
      case 'del': LP.app.deleteSel(); break;
      case 'ink': if(it){ it.color = b.dataset.v; LP.app.commit('色'); } break;
      case 'pBorder': if(k){ k.border = k.border === false; LP.app.commit('枠線'); } break;
      case 'pBleed': if(k){ k.bleed = !k.bleed; LP.app.commit('断ち切り'); } break;
      case 'pMerge':
        if(k && sh){
          const nk = LP.panels.merge(sh, k);
          if(nk){ LP.app.select('panel', nk.id, true); LP.app.commit('分割を戻す'); LP.ui.toast('分割を戻しました（' + sh.panels.length + ' コマ）'); }
          else LP.ui.toast('このコマは戻せません（最後に割った線の相手が見つからない）');
        }
        break;
      case 'pick': LP.io.pickFiles('stage'); break;
      case 'newDraw': LP.drawTools.newDrawLayer(); break;
      /* ---- 02 DRAW ---- */
      case 'dtool': {
        const now = performance.now(), t = b.dataset.t;
        if(lastRail.t === 'd' + t && now - lastRail.at < 380){ lastRail = { t: '', at: 0 }; LP.drawTools.toggleMode(t); }
        else { lastRail = { t: 'd' + t, at: now }; LP.drawTools.setTool(t); }
        break;
      }
      case 'dref': LP.drawTools.toggleRef(); break;
      case 'dlane': LP.drawTools.setLane(b.dataset.v); break;
      case 'dsizeUp': case 'dsizeDn': { const d = LP.detail.SCR.dsize; d.set(Math.max(1, Math.min(200, Math.round(d.get() * (a === 'dsizeUp' ? 1.25 : 0.8)) + (a === 'dsizeUp' ? 1 : 0)))); d.done(); break; }
      case 'dpress': { const D = LP.state.draw; if(D.tool === 'erase') D.pressureErase = !D.pressureErase; else D.pressure = !D.pressure; LP.drawTools.savePrefs(); render(); LP.app.crumb(); break; }
      case 'dfmode': { const D = LP.state.draw; if(b.dataset.v === 'erase') LP.drawTools.fillEraseToggle(true); else { D.fillErase = false; D.fillMode = b.dataset.v; LP.drawTools.setTool('fill', true); } break; }
      case 'dunder': LP.state.draw.under = +b.dataset.v; LP.drawTools.savePrefs(); render(); LP.app.crumb(); LP.ui.toast('塗りの潜り ' + LP.state.draw.under + 'px（これから塗るぶん）'); break;
      case 'dpal': LP.drawTools.setColor(b.dataset.v); break;
      case 'selAA': LP.drawSel.toggleAA(); break;
      case 'selBoth': LP.drawSel.toggleBoth(); break;
      case 'selWarp': LP.drawSel.toggleWarp(); break;
      case 'selCopy': LP.drawSel.copy(); break;
      case 'selPaste': LP.drawSel.paste(); break;
      case 'selOk': LP.drawSel.commit(); break;
      case 'selCancel': LP.drawSel.cancel(); break;
      case 'cellPrev': LP.drawTools.cellStep(-1); break;
      case 'cellNext': LP.drawTools.cellStep(1); break;
      case 'cellAdd': LP.drawTools.cellAdd(false); break;
      case 'cellDup': LP.drawTools.cellAdd(true); break;
      case 'cellDel': LP.drawTools.cellDelete(); break;
      case 'onion': LP.drawTools.toggleOnion(); break;
      case 'onionFill': LP.state.draw.onionFill = !LP.state.draw.onionFill; LP.drawTools.savePrefs(); render(); LP.stage.renderQ(); break;
      case 'refAdd': LP.drawTools.refAdd(b.dataset.v); break;
      case 'refDel': LP.drawTools.refDel(b.dataset.v); break;
      case 'refOp': { const [id, op] = b.dataset.v.split(':'); const rf = LP.drawTools.refOf(id); if(rf){ rf.opacity = +op; LP.app.commit('参照の濃さ'); } break; }
      /* ---- 04 SHOW ---- */
      case 'exKind': LP.io.exportState().kind = b.dataset.v; LP.io.saveExportPrefs(); render(); break;
      case 'exSeqMode': LP.io.exportState().seqMode = b.dataset.v; LP.io.saveExportPrefs(); render(); break;
      case 'exSeqTo': if(LP.io.canFolder()){ LP.io.exportState().seqTo = b.dataset.v; LP.io.saveExportPrefs(); render(); } break;
      case 'expSeq': LP.io.exportSeq(); break;
      case 'addSheet': LP.app.addSheet(); break;
      case 'toSheet': LP.app.setStep('sheet'); break;
      case 'playFull': LP.app.playFull(); break;
      case 'exRes': LP.io.exportState().res = +b.dataset.v; LP.io.saveExportPrefs(); render(); break;
      case 'exQ': LP.io.exportState().q = b.dataset.v; LP.io.saveExportPrefs(); render(); break;
      case 'exPpf': LP.io.exportState().ppf = +b.dataset.v; LP.io.saveExportPrefs(); render(); break;
      case 'expHtml': LP.io.exportHtml(); break;
    }
  }
  /* Z 定規：ドラッグ中は ◆ と文字だけ、離したら commit（「ドラッグ中はテキストだけ」の約束） */
  function onDown(e){
    const zr = e.target.closest && e.target.closest('[data-zr]');
    if(!zr) return;
    const L = LP.app.selLayer();
    if(!L) return;
    e.preventDefault();
    zr.setPointerCapture(e.pointerId);
    const r = zr.getBoundingClientRect();
    const at = ev => {
      let d = Math.max(0, Math.min(1, (ev.clientX - r.left) / Math.max(1, r.width)));
      if(Math.abs(d - 0.6) < 0.025) d = 0.6;          // 紙の面に吸い付く
      L.z = Math.abs(d - 0.6) < 1e-9 ? 0 : +LP.panels.zFromD(d).toFixed(1);
      const dm = zr.querySelector('.dm'); if(dm) dm.style.left = (d * 100).toFixed(1) + '%';
      const v = $('#dk-zv'); if(v) v.textContent = zLabel(d);
      LP.stage.renderQ();
    };
    at(e);
    const mv = ev => at(ev);
    const up = () => { zr.removeEventListener('pointermove', mv); zr.removeEventListener('pointerup', up); zr.removeEventListener('pointercancel', up); LP.app.commit('奥⇄手前'); };
    zr.addEventListener('pointermove', mv);
    zr.addEventListener('pointerup', up);
    zr.addEventListener('pointercancel', up);
  }
  /* 書き出し中の進捗（ドックを作り直さずに文字と棒だけ） */
  function progress(msg, p){
    const m = $('#dk-pmsg'), bar = $('#dk-pbar');
    if(m) m.textContent = msg;
    if(bar) bar.style.width = Math.round(p * 100) + '%';
  }

  /* 02 DRAW の数値（SCR は詳細パネルと共有の表に足す） */
  function drawScr(){
    const D = () => LP.state.draw;
    const cell = () => { const tg = LP.drawTools.target(); return tg && tg.cell; };
    Object.assign(LP.detail.SCR, {
      dsize: { get: () => D().tool === 'erase' ? D().eraseSize : D().penSize, set: v => { v = Math.round(v); if(D().tool === 'erase') D().eraseSize = v; else D().penSize = v; LP.stage.renderOv(); },
               min: 1, max: 200, px: 3, step: 1, done: () => { LP.drawTools.savePrefs(); render(); } },
      cdur:  { get: () => cell() ? cell().dur : 1, set: v => { const c = cell(); if(c){ c.dur = Math.max(1, Math.round(v)); LP.stage.renderQ(); } }, min: 1, max: 240, px: 8, step: 1,
               done: () => LP.app.commit('セルの長さ') },
    });
  }

  function init(){
    drawScr();
    $('#dock').addEventListener('click', onClick);
    $('#dock').addEventListener('change', e => { if(e.target.dataset.f === 'dcolor') LP.drawTools.setColor(e.target.value.toUpperCase()); });
    $('#dock').addEventListener('pointerdown', onDown);
    U().bindScrub($('#dock'), LP.detail.SCR);
  }

  LP.dock = { init, render, progress };
})();
