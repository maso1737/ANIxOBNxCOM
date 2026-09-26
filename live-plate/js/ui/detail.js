/* ============================================================
   LIVE PLATE — ui/detail.js（詳細パネル #qe ／ U で開閉）
   選んでいるもの（層／仕上げ素材／コマ）の数値。何も選んでいなければ「いまの紙」とコマ割りの設定。
   数値は左右ドラッグ・Wクリックで直接入力（素の input[number] は置かない＝SPEC_18）。
   ★ ドック（SIZE / OPACITY）と同じ SCR 定義を共有する＝片方で動かせばもう片方も同じ値（OBAN §4 の双方向）。
   ★ 文字を打っている間はパネルを作り直さない（フォーカスが切れる）。
   ============================================================ */
var LP = window.LP || (window.LP = {});

(function(){
  'use strict';
  const $ = s => document.querySelector(s);
  const U = () => LP.ui;
  let open = false, rq = 0;

  /* 置いたときの大きさ＝100%（model.placeSize と同じ基準） */
  function baseW(L){
    const p = LP.book.plates[L.plateId];
    return p ? LP.model.placeSize(LP.book, p.w, p.h).w : L.w;
  }
  function setScale(L, pct){
    const p = LP.book.plates[L.plateId];
    const ar = p ? p.h / p.w : L.h / L.w;
    const cx = L.x + L.w / 2, cy = L.y + L.h / 2;
    L.w = Math.max(8, Math.round(baseW(L) * pct / 100));
    L.h = Math.max(8, Math.round(L.w * ar));
    L.x = Math.round(cx - L.w / 2); L.y = Math.round(cy - L.h / 2);
  }
  const live = () => { LP.stage.renderQ(); };
  const done = label => () => LP.app.commit(label);
  const sel = () => LP.app.selLayer();
  const item = () => LP.app.selItem();
  const cur = () => LP.app.curSheet();
  const f2 = v => (+v).toFixed(2);

  /* 数値の定義（data-scr のキー → 読み書き）。set(v, dragging) */
  const SCR = {
    lx:    { get: () => sel().x, set: v => { sel().x = Math.round(v); live(); }, px: 1, step: 4, done: done('層の位置') },
    ly:    { get: () => sel().y, set: v => { sel().y = Math.round(v); live(); }, px: 1, step: 4, done: done('層の位置') },
    lsc:   { get: () => Math.round(sel().w / baseW(sel()) * 100), set: v => { setScale(sel(), v); live(); }, min: 2, max: 800, px: 2, step: 1, fmt: v => v, done: done('層の大きさ') },
    lop:   { get: () => Math.round(sel().opacity * 100), set: v => { sel().opacity = v / 100; live(); }, min: 0, max: 100, px: 2, step: 1, done: done('層の不透明度') },
    lrot:  { get: () => Math.round(sel().rot || 0), set: v => { sel().rot = Math.round(v); live(); }, min: -180, max: 180, px: 2, step: 1, done: done('層の回転') },
    loff:  { get: () => sel().tOffset || 0, set: v => { sel().tOffset = Math.round(v); live(); LP.timeline.renderCells(); }, px: 6, step: 1, done: done('セルのずらし') },
    lz:    { get: () => Math.round(LP.panels.dFromZ(sel().z || 0) * 100), set: v => { sel().z = v === 60 ? 0 : +LP.panels.zFromD(v / 100).toFixed(1); live(); },
             min: 0, max: 100, px: 2, step: 1, fmt: v => v === 60 ? '紙の面' : (v < 60 ? '奥 ' : '手前 ') + (v / 100).toFixed(2), done: done('奥⇄手前') },
    lpad:  { get: () => Math.round((sel().pad || 1.15) * 100), set: v => { sel().pad = v / 100; }, min: 100, max: 160, px: 3, step: 1, fmt: v => (v / 100).toFixed(2), done: done('のりしろ') },
    ledge: { get: () => sel().edge.w, set: v => { sel().edge.w = Math.round(v); live(); }, min: 1, max: 160, px: 2, step: 1, done: done('フチの太さ') },
    iop:   { get: () => Math.round((item().opacity == null ? 1 : item().opacity) * 100), set: v => { item().opacity = v / 100; live(); }, min: 0, max: 100, px: 2, step: 1, done: done('不透明度') },
    iin:   { get: () => item().tIn || 0, set: v => { item().tIn = Math.max(0, Math.round(v)); live(); }, min: 0, px: 4, step: 1, done: done('出るコマ') },
    iout:  { get: () => item().tOut == null ? cur().dur : item().tOut, set: v => { const d = cur().dur; item().tOut = v >= d ? null : Math.max((item().tIn || 0) + 1, Math.round(v)); live(); },
             min: 1, px: 4, step: 1, fmt: v => v >= cur().dur ? '最後まで' : v, done: done('消えるコマ') },
    iedge: { get: () => (item().edge || {}).w || 10, set: v => { item().edge = Object.assign({ on: true, color: '#FFFFFF' }, item().edge, { w: Math.round(v) }); live(); }, min: 1, max: 80, px: 2, step: 1, done: done('フチの太さ') },
    sdur:  { get: () => cur().dur, set: v => { cur().dur = Math.max(1, Math.round(v)); LP.app.clampT(); live(); LP.timeline.render(); }, min: 1, max: 24 * 600, px: 3, step: 1,
             fmt: v => LP.time.fmtDur(v, LP.book.fps), edit: v => v, done: done('紙の尺') },
    sbg:   { get: () => cur().bg, set: v => { cur().bg = Math.round(v); live(); }, min: 0, max: 255, px: 1, step: 1, done: done('紙の背景') },
  };
  /* コマ割りの設定（BOOK 共通）。余白は内枠のコマを作り直す／間隔・太さは線を引き直す */
  let oldBas = null;
  const frameScr = (key, min, max, label) => ({
    get: () => LP.book.frame[key],
    set: v => {
      if(key === 'margin' && !oldBas) oldBas = LP.render.frameOf(LP.book, null).bas;
      LP.book.frame[key] = Math.round(v);
      if(key === 'margin'){ LP.panels.reframe(LP.book, oldBas); oldBas = LP.render.frameOf(LP.book, null).bas; }
      if(key === 'lr' || key === 'tb') LP.panels.regap(LP.book);
      live();
    },
    min, max, px: 2, step: 1, done: () => { oldBas = null; LP.app.commit(label); },
  });
  SCR.fm = frameScr('margin', 0, 600, 'コマの余白');
  SCR.flr = frameScr('lr', 0, 400, '縦線の間隔');
  SCR.ftb = frameScr('tb', 0, 400, '横線の間隔');
  SCR.flw = frameScr('lw', 0, 60, '枠線の太さ');

  /* 仕上げ素材のパラメータ（manga-plate DEFS を SCREEN 3840 の紙に合わせたもの）。[key, min, max, step, label] */
  const DEFS = {
    tone:   [['w', 50, 9000, 1, 'W'], ['h', 50, 9000, 1, 'H'], ['dot', 2, 120, 1, 'ドット径'], ['gap', 4, 240, 1, '間隔'], ['angle', 0, 90, 1, '角度'], ['rot', -90, 90, 1, '回転']],
    focus:  [['r0', 0, 4000, 1, '白場 R0'], ['core', 0, 1, 0.05, '芯くずし'], ['r1', 100, 9000, 1, '長さ R1'], ['count', 10, 400, 1, '本数'], ['lw', 1, 60, 1, '太さ'], ['taper', 0, 1, 0.05, '先細り'], ['jitter', 0, 1, 0.05, 'ゆらぎ'], ['seed', 1, 99, 1, 'SEED'], ['rot', -180, 180, 1, '回転']],
    stream: [['w', 50, 9000, 1, 'W'], ['h', 50, 9000, 1, 'H'], ['count', 2, 200, 1, '本数'], ['lw', 1, 60, 1, '太さ'], ['taper', 0, 1, 0.05, '先細り'], ['jitter', 0, 1, 0.05, 'ゆらぎ'], ['seed', 1, 99, 1, 'SEED'], ['rot', -180, 180, 1, '回転']],
    frame:  [['w', 50, 9000, 1, 'W'], ['h', 50, 9000, 1, 'H'], ['lw', 2, 120, 1, '太さ'], ['rot', -90, 90, 1, '回転']],
    white:  [['rot', -180, 180, 1, '回転']],
    text:   [['size', 12, 600, 1, '大きさ'], ['lh', 0.8, 2.4, 0.02, '行間'], ['ls', -0.1, 0.6, 0.01, '字間'], ['rot', -180, 180, 1, '回転']],
    brush:  [['lw', 1, 200, 1, '太さ'], ['rot', -180, 180, 1, '回転']],
  };
  Object.keys(DEFS).forEach(t => DEFS[t].forEach(([k, mn, mx, st, lab]) => {
    const id = 'i_' + k;
    if(SCR[id]) return;
    const frac = st < 1;
    SCR[id] = { get: () => item()[k], set: v => { item()[k] = frac ? +(+v).toFixed(2) : Math.round(v); live(); },
      min: mn, max: mx, step: st, px: frac ? 6 : (mx > 1000 ? 1 : 2), fmt: frac ? f2 : undefined, parse: parseFloat, done: done(lab) };
  }));
  const TONE_PRESETS = [['10%', 0.42], ['20%', 0.55], ['40%', 0.74], ['60%', 0.90]];   // dot = gap × 比
  const FOCUS_PRESETS = [['標準', { count: 110, taper: 0.9, jitter: 0.35 }], ['密', { count: 220, taper: 0.95, jitter: 0.25 }], ['芯くずし', { core: 0.55, jitter: 0.45 }], ['真円', { core: 0 }]];
  const PAL = ['#000000', '#FFFFFF', '#EBEBEB', '#D4D4D4', '#ABABAB', '#808080', '#555555', '#2B2B2B', '#F5F1E8', '#FF3355'];

  function init(){
    const qe = $('#qe');
    U().makePanelDraggable(qe, $('#qe-head'));
    U().makePanelResizable($('#qe-resize'), $('#qe-body'), '.qd-row,.qd-sect');
    U().makeMinimizable(qe, $('#qe-mini'));
    $('#qe-close').addEventListener('click', () => toggle(false));
    U().bindScrub($('#qe-body'), SCR);
    $('#qe-body').addEventListener('click', onClick);
    $('#qe-body').addEventListener('change', onChange);
    $('#qe-body').addEventListener('input', onInput);
    $('#qe-body').addEventListener('focusout', () => setTimeout(render, 0));   // 打ち終えたら最新の選択で描き直す
    // 文字欄で Esc ＝ 打ち終わり（確定して抜ける。ステージの Esc＝選択解除 とは別）
    $('#qe-body').addEventListener('keydown', e => { if(e.key === 'Escape' && e.target.tagName === 'TEXTAREA'){ e.preventDefault(); e.target.blur(); } });
  }
  function toggle(on){
    open = on == null ? !open : !!on;
    $('#qe').classList.toggle('show', open);
    $('#b-detail').classList.toggle('on', open);
    if(open) render();
  }
  /* 紙をクリックした直後に呼ばれる＝その後の mousedown がフォーカスを body へ持っていくので、1拍待ってから入れる */
  function focusText(){
    setTimeout(() => {
      const ta = $('#qe-body textarea');
      if(ta){ ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    }, 30);
  }

  /* 所属：枠の上／コマ n のチップ */
  function belongRow(o, act){
    const sh = cur(), u = U();
    if(!sh.panels.length) return u.qdRow('所属', '<span class="qd-note">コマ割り無し（全面1コマ）。DIV で割るとコマに入ります</span>');
    const items = [['', '枠の上']].concat(sh.panels.map((k, i) => [k.id, String(i + 1)]));
    return u.qdRow('所属', u.qdSeg(act, items, o.panelId || ''), 'コマ n＝そのコマの形で切り抜く（枠の下）／枠の上＝切り抜かない（擬音・飛び出し）');
  }
  function layerHTML(L){
    const u = U(), p = LP.book.plates[L.plateId];
    let h = u.qdSect('LAYER', '層');
    h += u.qdRow('名前', '<input class="qd-txt" data-f="lname" value="' + u.esc(L.name) + '" maxlength="40">');
    h += belongRow(L, 'lpanel');
    h += u.qdRow('位置', u.qdNum('lx', 'X', L.x, 'px') + u.qdNum('ly', 'Y', L.y, 'px'), '紙の座標（左上）。左右ドラッグで動かす／Wクリックで入力');
    h += u.qdRow('大きさ', u.qdNum('lsc', '', Math.round(L.w / baseW(L) * 100), '%') + '<span class="qd-note">' + L.w + '×' + L.h + ' px（紙）</span>', '100% ＝ 置いたときの大きさ（カメラ出力の 1px ＝ 絵の 1px）');
    h += u.qdRow('回転', u.qdNum('lrot', '', Math.round(L.rot || 0), '°'));
    h += u.qdRow('不透明', u.qdNum('lop', '', Math.round(L.opacity * 100), '%'));
    h += u.qdSect('DEPTH', '奥⇄手前・のりしろ');
    const d = Math.round(LP.panels.dFromZ(L.z || 0) * 100);
    h += u.qdRow('Z', u.qdNum('lz', '', d === 60 ? '紙の面' : (d < 60 ? '奥 ' : '手前 ') + (d / 100).toFixed(2), '') + '<span class="qd-note">カメラが動いたときの視差（P3）。止まった画は変わらない</span>', '0＝奥 ／ 0.60＝紙の面 ／ 1＝手前。OBAN の DEPTH と同じ写像');
    h += u.qdRow('のりしろ', u.qdNum('lpad', '', (L.pad || 1.15).toFixed(2), '×') + '<button class="qd-sb jp" data-act="lfit">' + (L.panelId ? 'コマに合わせる' : '紙に合わせる') + '</button>', '「コマに合わせる」でコマの外接矩形 × のりしろ を覆う（カメラが動いても縁が出ない）');
    h += u.qdSect('EDGE', '境界効果（α の外側のフチ）');
    h += u.qdRow('フチ', u.qdSeg('ledgeOn', [[1, 'ON'], [0, 'OFF']], L.edge && L.edge.on ? 1 : 0) + u.qdNum('ledge', '', (L.edge || {}).w || 16, 'px')
      + u.qdSeg('ledgeCol', [['#FFFFFF', '白'], ['#000000', '黒']], (L.edge || {}).color || '#FFFFFF'), 'α付きの絵の外側に色のフチ（飛び出し・擬音を絵の上で読ませる）。太さは紙 px');
    if(p && p.cells.length > 1){
      h += u.qdSect('TIME', 'セルの進み方');
      h += u.qdRow('コマ打ち', u.qdSeg('step', [[1, '1'], [2, '2'], [3, '3'], [4, '4']], L.step || 1), '1コマ打ち＝毎フレーム次のセル／2コマ打ち＝2フレームずつ（SPEC_20 の ×N と同じ式）');
      h += u.qdRow('ずらし', u.qdNum('loff', '', L.tOffset || 0, 'コマ'), 'セルの開始をずらす（負の値＝途中から始まる）');
      h += u.qdRow('ループ', u.qdSeg('loop', [[1, 'ON'], [0, 'OFF']], p.loop ? 1 : 0) + '<span class="qd-note">素材ごとの設定</span>', 'OFF にすると最後のセルで止まる。同じ素材を使う層すべてに効く');
    }
    if(p){
      h += '<div class="qd-row"><span class="qd-note"><b>' + u.esc(p.name) + '</b>　' + p.w + '×' + p.h + ' px ／ セル ' + p.cells.length + ' ／ ' + (p.src === 'seq' ? '連番' : p.src === 'draw' ? '描いた絵' : '取り込み') + '</span></div>';
    }
    return h;
  }
  function itemHTML(it){
    const u = U(), sh = cur(), fps = LP.book.fps;
    let h = u.qdSect(it.type.toUpperCase(), LP.model.ITEM_NAMES[it.type] || it.type);
    h += u.qdRow('名前', '<input class="qd-txt" data-f="iname" value="' + u.esc(it.name) + '" maxlength="40">');
    if(it.type === 'text'){
      h += '<div class="qd-row top"><span class="k">文字</span><textarea class="qd-txt qd-ta" data-f="itext" rows="3" placeholder="ここに打つ（改行＝次の列／行）">' + u.esc(it.text || '') + '</textarea></div>';
      h += u.qdRow('向き', u.qdSeg('ivert', [[1, '縦書き'], [0, '横書き']], it.vertical ? 1 : 0));
      h += u.qdRow('書体', u.qdSeg('ifont', LP.items.TEXT_FONTS.map((f, i) => [i, f[0]]), it.font | 0));
      h += u.qdRow('フチ', u.qdSeg('iedgeOn', [[1, 'ON'], [0, 'OFF']], it.edge && it.edge.on ? 1 : 0) + u.qdNum('iedge', '', (it.edge || {}).w || 10, 'px'));
    }
    if(it.type === 'tone') h += u.qdRow('濃さ', u.qdSeg('tonePre', TONE_PRESETS.map((p, i) => [i, p[0]]), -1), 'ドット径 ＝ 間隔 × 比（manga-plate と同じ）');
    if(it.type === 'focus') h += u.qdRow('型', u.qdSeg('focusPre', FOCUS_PRESETS.map((p, i) => [i, p[0]]), -1));
    if(it.type === 'white') h += u.qdRow('種類', u.qdSeg('ierase', [[0, 'ホワイト'], [1, '消し']], it.erase ? 1 : 0), '消し＝紙の地の色で塗る（下の絵を隠す）');
    (DEFS[it.type] || []).forEach(([k, , , st, lab]) => {
      h += u.qdRow(lab, u.qdNum('i_' + k, '', st < 1 ? f2(it[k] || 0) : Math.round(it[k] || 0), ''));
    });
    h += u.qdRow('不透明', u.qdNum('iop', '', Math.round((it.opacity == null ? 1 : it.opacity) * 100), '%'));
    if(it.type !== 'white' || !it.erase){
      h += '<div class="qd-row"><span class="k">色</span><div class="qd-pal">' + PAL.map(c => '<button class="qd-sw' + (String(it.color).toUpperCase() === c ? ' on' : '') + '" data-act="icol" data-v="' + c + '" style="background:' + c + '" title="' + c + '"></button>').join('') + '</div></div>';
    }
    h += belongRow(it, 'ipanel');
    h += u.qdSect('TIME', '出ている間（紙の中のコマ）');
    h += u.qdRow('出る', u.qdNum('iin', '', it.tIn || 0, 'コマ') + u.qdNum('iout', '消える', it.tOut == null ? '最後まで' : it.tOut, ''), 'この紙の中で、何コマ目から何コマ目まで出すか（' + LP.time.fmtDur(sh.dur, fps) + ' の中で）');
    return h;
  }
  function panelHTML(k){
    const u = U(), sh = cur(), n = sh.panels.indexOf(k) + 1;
    const nl = sh.layers.filter(o => o.panelId === k.id).length, ni = (sh.items || []).filter(o => o.panelId === k.id).length;
    let h = u.qdSect('PANEL', 'コマ ' + n);
    h += u.qdRow('枠線', u.qdSeg('pborder', [[1, 'ON'], [0, 'OFF']], k.border !== false ? 1 : 0));
    h += u.qdRow('断ち切り', u.qdSeg('pbleed', [[1, 'ON'], [0, 'OFF']], k.bleed ? 1 : 0), '内枠に接した辺を紙（ページ）の端まで伸ばす');
    h += u.qdRow('中身', '<span class="qd-note">層 ' + nl + ' ／ 素材 ' + ni + '</span><button class="qd-sb jp" data-act="pmerge">分割を戻す</button>');
    h += '<div class="qd-row"><span class="qd-note">選んでいる間は <b>DIV</b> がこのコマだけを割ります。番号は読み順（' + (LP.render.frameOf(LP.book, sh).bindRight ? '右綴じ' : '左綴じ') + '）</span></div>';
    return h;
  }
  function sheetHTML(sh){
    const u = U(), fps = LP.book.fps, f = LP.book.frame;
    let h = u.qdSect('SHEET', '紙');
    h += u.qdRow('名前', '<input class="qd-txt" data-f="sname" value="' + u.esc(sh.name) + '" maxlength="40">');
    h += u.qdRow('尺', u.qdNum('sdur', '', LP.time.fmtDur(sh.dur, fps), '秒+コマ') + '<span class="qd-note">' + sh.dur + ' コマ</span>', 'Wクリックでコマ数を入力');
    h += u.qdRow('背景', u.qdNum('sbg', '', sh.bg, '/255'), '紙の地の明るさ（255＝白）');
    h += u.qdSect('PANELS', 'コマ割り（BOOK 共通）');
    if(sh.frame) h += '<div class="qd-row"><span class="qd-note">この紙は<b>ページの範囲</b>を持っています（旧 MANGA_BOOK を読んだ紙）。下の設定は他の紙に効きます</span></div>';
    h += u.qdRow('余白', u.qdNum('fm', '', f.margin, 'px'), '紙の端から内枠までの距離（最初に割るコマの外形）');
    h += u.qdRow('間隔', u.qdNum('flr', '縦線', f.lr, 'px') + u.qdNum('ftb', '横線', f.tb, 'px'), 'コマとコマの隙間。斜めの線はその間を向きで補間（manga-plate gapFor）');
    h += u.qdRow('枠線', u.qdNum('flw', '太さ', f.lw, 'px'));
    h += u.qdRow('読み順', u.qdSeg('fbind', [[1, '右綴じ（右から）'], [0, '左綴じ']], f.bindRight !== false ? 1 : 0));
    h += u.qdRow('', '<button class="qd-sb jp del" data-act="pclear"' + (sh.panels.length ? '' : ' disabled') + '>この紙のコマ割りを消す</button><span class="qd-note">' + (sh.panels.length ? sh.panels.length + ' コマ' : 'コマ割り無し') + '</span>');
    h += '<div class="qd-row"><span class="qd-note">用紙 <b>SCREEN 3840×2160</b>（固定・§13-3）。層・素材・コマを選ぶとその数値に替わります。</span></div>';
    return h;
  }

  function render(){
    if(!open) return;
    const ta = $('#qe-body textarea');
    if(ta && document.activeElement === ta) return;        // 打っている最中は作り直さない
    const L = sel(), it = item(), k = LP.app.selPanel(), sh = cur();
    let h = '', tag = '';
    if(L){ h = layerHTML(L); tag = L.name; }
    else if(it){ h = itemHTML(it); tag = it.name; }
    else if(k){ h = panelHTML(k); tag = 'コマ ' + (sh.panels.indexOf(k) + 1); }
    else if(sh){ h = sheetHTML(sh); tag = sh.name; }
    $('#qe-tag').textContent = tag;
    $('#qe-body').innerHTML = h;
  }
  function renderLive(){ if(open && !rq) rq = requestAnimationFrame(() => { rq = 0; render(); }); }

  function onClick(e){
    const b = e.target.closest('[data-act]');
    if(!b || b.disabled) return;
    const L = sel(), it = item(), k = LP.app.selPanel(), sh = cur(), a = b.dataset.act, v = b.dataset.v, nv = +v;
    switch(a){
      case 'step': if(L){ L.step = nv; LP.app.commit('コマ打ち'); } break;
      case 'loop': if(L){ const p = LP.book.plates[L.plateId]; if(p){ p.loop = !!nv; LP.app.commit('ループ'); } } break;
      case 'lpanel': if(L){ L.panelId = v || null; LP.app.commit('層の所属'); } break;
      case 'ipanel': if(it){ it.panelId = v || null; LP.app.commit('素材の所属'); } break;
      case 'lfit': LP.app.fitLayerToPaper(); break;
      case 'ledgeOn': if(L){ L.edge = Object.assign({ w: 16, color: '#FFFFFF' }, L.edge, { on: !!nv }); LP.app.commit('フチ'); } break;
      case 'ledgeCol': if(L){ L.edge = Object.assign({ on: true, w: 16 }, L.edge, { color: v }); LP.app.commit('フチの色'); } break;
      case 'ivert': if(it){ it.vertical = !!nv; LP.app.commit('文字の向き'); } break;
      case 'ifont': if(it){ it.font = nv; LP.app.commit('書体'); } break;
      case 'iedgeOn': if(it){ it.edge = Object.assign({ w: 10, color: '#FFFFFF' }, it.edge, { on: !!nv }); LP.app.commit('フチ'); } break;
      case 'ierase': if(it){ it.erase = !!nv; LP.app.commit('ホワイト／消し'); } break;
      case 'icol': if(it){ it.color = v; LP.app.commit('色'); } break;
      case 'tonePre': if(it){ it.dot = Math.max(2, Math.round(it.gap * TONE_PRESETS[nv][1])); LP.app.commit('網の濃さ'); } break;
      case 'focusPre': if(it){ Object.assign(it, FOCUS_PRESETS[nv][1]); LP.app.commit('集中線の型'); } break;
      case 'pborder': if(k){ k.border = !!nv; LP.app.commit('枠線'); } break;
      case 'pbleed': if(k){ k.bleed = !!nv; LP.app.commit('断ち切り'); } break;
      case 'pmerge':
        if(k){ const nk = LP.panels.merge(sh, k); if(nk){ LP.app.select('panel', nk.id, true); LP.app.commit('分割を戻す'); } else LP.ui.toast('このコマは戻せません'); }
        break;
      case 'fbind': LP.book.frame.bindRight = !!nv; LP.book.sheets.forEach(s => LP.panels.sort(s)); LP.app.commit('読み順'); break;
      case 'pclear': if(sh && sh.panels.length){ LP.panels.clearAll(sh); LP.app.select(null, null, true); LP.app.commit('コマ割りを消す'); LP.ui.toast('コマ割りを消しました（Ctrl+Z で戻せます）'); } break;
    }
  }
  function onInput(e){
    if(e.target.dataset.f === 'itext' && item()){ item().text = e.target.value; live(); }
  }
  function onChange(e){
    const f = e.target.dataset.f, v = e.target.value;
    if(f === 'itext' && item()){ item().text = v; if(v.trim()) LP.app.commit('文字'); return; }
    if(!v.trim()) return;
    if(f === 'lname' && sel()){ sel().name = v.trim(); LP.app.commit('層の名前'); }
    else if(f === 'iname' && item()){ item().name = v.trim(); LP.app.commit('素材の名前'); }
    else if(f === 'sname' && cur()){ cur().name = v.trim(); LP.app.commit('紙の名前'); }
  }

  LP.detail = { init, toggle, render, renderLive, focusText, SCR, baseW, get open(){ return open; } };
})();
