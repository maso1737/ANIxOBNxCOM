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
      h += grp('ADD', '取り込む', '<button class="btn" data-act="pick" title="画像を選んで、いまの紙に層として置く（複数・連番OK）">＋ 画像を置く</button>'
        + '<button class="btn" data-act="addSheet" title="空の紙を最後に足す">＋ 紙</button>');
    }
    return h;
  }

  function drawHTML(){
    const L = LP.app.selLayer(), p = L && LP.book.plates[L.plateId];
    let h = grp('TOOLS', '描く',
      rail('pen', 'PEN', 'P', { later: 'P2' }) + rail('erase', 'ERASE', 'E', { later: 'P2' }) + rail('fill', 'FILL', 'G', { later: 'P2' })
      + rail('selx', 'SEL', 'A', { later: 'P2', tip: '投げ縄・矩形で持ち上げて変形' }) + rail('eye', 'EYE', 'Alt', { later: 'P2', tip: 'スポイト' }) + rail('ref', 'REF', 'R', { later: 'P2', tip: '参照（他のプレートも選べる）' }));
    h += VL;
    if(p){
      h += '<div class="dk-info"><span class="t">FOCUS — ' + U().esc(p.name) + '</span><span class="s"><b>' + p.w + '×' + p.h + '</b> px ／ セル <b>' + p.cells.length + '</b> ／ 紙は薄く透かして表示'
        + '<br>P0 は<b>見るだけ</b>（プレート原寸・ホイールで拡縮・ドラッグで移動）。線／塗レーンとペンは P2。</span></div>';
    }else{
      h += '<div class="dk-info"><span class="t">NO LAYER</span><span class="s">01 SHEET で層を <b>Wクリック</b>、または右の ◆ITEMS で層を選ぶ</span></div>';
    }
    h += '<span class="dk-sp"></span>' + grp('BACK', '戻る', '<button class="btn" data-act="toSheet" title="01 SHEET へ戻る（Esc）">◀ 01 SHEET（Esc）</button>');
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
    const o = LP.app.outSize(ex.res);
    let h = grp('SHOW', '見せる',
      '<div class="rail" data-act="playFull" title="UI を全部消して全画面で再生（Space＝再生/停止・←→＝コマ・J/K＝紙の頭・Esc＝戻る）"><span class="t">▶ PLAY</span><span class="k">全画面</span></div>'
      + rail('rec', '● REC', 'LIVE', { later: 'P4', tip: '再生しながら描いて録画' }));
    h += VL;
    h += grp('OUTPUT', '出す',
      '<div class="dk-out on" title="スクロールで動く単一 HTML（画像はすべて埋め込み＝別 PC でもそのまま開ける）"><span class="t">HTML</span><span class="s">スクロールビューア<br>画像は全部埋め込み</span></div>'
      + '<div class="dk-out later"><span class="t">VIDEO</span><span class="s">MP4（非実時間）／WebM</span><span class="ph">P3</span></div>'
      + '<div class="dk-out later"><span class="t">SEQ PNG</span><span class="s">合体・線・塗・線+塗</span><span class="ph">P2</span></div>');
    h += VL;
    if(ex.busy){
      h += '<div class="dk-prog"><span class="m" id="dk-pmsg">' + U().esc(ex.msg) + '</span><div class="bar"><i id="dk-pbar" style="width:' + Math.round(ex.p * 100) + '%"></i></div></div>'
        + '<button class="btn dk-go" data-act="expHtml" title="もう一度押すと中断">中断</button>';
      return h;
    }
    h += grp('HTML', '書き出しの設定',
      '<div class="dk-set">'
      + '<div class="dk-row"><span class="dk-jp">解像度</span>' + U().qdSeg('exRes', [[1280, '1280'], [1920, '1920'], [3840, '3840']], ex.res) + '<span class="dk-jp" style="width:auto">' + o.w + '×' + o.h + '</span></div>'
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

  function init(){
    $('#dock').addEventListener('click', onClick);
    $('#dock').addEventListener('pointerdown', onDown);
    U().bindScrub($('#dock'), LP.detail.SCR);
  }

  LP.dock = { init, render, progress };
})();
