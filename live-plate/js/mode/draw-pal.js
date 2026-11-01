/* ============================================================
   LIVE PLATE — mode/draw-pal.js（02 DRAW のパレット。SPEC_21 §18-3）
   正準：animator.html の FILL PALETTE（スキル animator-color-palette）。
     ・先頭 11 枠＝明度チップ（0〜100%・固定。消せない・スポイトで上書きされない）／その後ろ＝カスタム枠
     ・枠を押す＝いまのレーンの色（線＝インク／塗＝塗りの色）にする。押した枠が「選んでいる枠」
     ・スポイト（EYE / Alt＋クリック）と色ピッカーは、カスタム枠を選んでいれば**その枠を上書き**
       （明度チップを選んでいるときは枠に入れない。ピッカーだけは枠を1つ足してそこへ入れる＝animator の HSB と同じ）
     ・＋＝いまの色で枠を足す／−＝選んでいる枠を消す／⇩ ⇧＝JSON（format: PALETTE_v1＝ANIMATOR と同じ形。互いに読める）
   ★ 作品ではなく道具なので BOOK には入れない（localStorage。端末ごと）
   ============================================================ */
var LP = window.LP || (window.LP = {});

(function(){
  'use strict';
  const PAL_LS = 'liveplate_palette_v1', SLOT_LS = 'liveplate_palslot_v1';
  const FIXED = ['#000000', '#1A1A1A', '#333333', '#4D4D4D', '#666666', '#808080', '#999999', '#B3B3B3', '#CCCCCC', '#E6E6E6', '#FFFFFF'];
  // カスタムの既定（P2 の固定12色から明度を抜いたもの＋肌・影）
  const CUSTOM0 = ['#F2C9B0', '#D9A58C', '#8B5A3C', '#E8433F', '#F28C28', '#F5D442', '#5CC46A', '#3FA8E8', '#6A5BE0', '#D96BD0'];
  let colors = FIXED.concat(CUSTOM0), slot = FIXED.length;

  function isFixed(i){ return i >= 0 && i < FIXED.length; }
  /* 先頭を必ず明度チップに揃える（ANIMATOR の書き出しも、明度の無い古い JSON も、これ1本で読む） */
  function normalize(arr){
    const src = (Array.isArray(arr) ? arr : []).filter(c => typeof c === 'string')
      .map(c => (c[0] === '#' ? c : '#' + c).toUpperCase()).filter(c => /^#[0-9A-F]{6}$/.test(c));
    let head = 0;
    while(head < FIXED.length && src[head] === FIXED[head]) head++;
    return FIXED.concat(head === FIXED.length ? src.slice(FIXED.length) : src);
  }
  function load(){
    try{
      const o = JSON.parse(localStorage.getItem(PAL_LS) || 'null');
      const cols = Array.isArray(o) ? o : (o && Array.isArray(o.colors) ? o.colors : null);
      if(cols && cols.length) colors = normalize(cols);
      const v = parseInt(localStorage.getItem(SLOT_LS), 10);
      if(!isNaN(v)) slot = v;
    }catch(e){}
    slot = Math.max(0, Math.min(colors.length - 1, slot));
  }
  function save(){
    if(LP.HARNESS_ON) return;
    try{ localStorage.setItem(PAL_LS, JSON.stringify({ format: 'PALETTE_v1', colors })); localStorage.setItem(SLOT_LS, String(slot)); }catch(e){}
  }
  load();

  /* 枠を押す＝その色をいまのレーンへ */
  function select(i){
    if(i < 0 || i >= colors.length) return;
    slot = i;
    save();
    LP.drawTools.setColor(colors[i], true);
  }
  /* スポイト・ピッカーからの色。戻り値＝トーストに足す一言 */
  function take(hex, fromPicker){
    if(!isFixed(slot) && slot < colors.length){ colors[slot] = hex; save(); return '（枠 ' + (slot - FIXED.length + 1) + ' を上書き）'; }
    if(fromPicker){ colors.push(hex); slot = colors.length - 1; save(); return '（明度チップは固定なので枠を足しました）'; }
    return '';
  }
  function add(){
    const D = LP.state.draw;
    colors.push(D.lane === 'fill' ? D.paint : D.ink);
    slot = colors.length - 1;
    save(); LP.dock.render();
    LP.ui.toast('いまの色で枠を足しました（スポイトで上書きできます）');
  }
  function del(){
    if(isFixed(slot)){ LP.ui.toast('明度チップは固定です（消せません）'); return; }
    if(colors.length <= FIXED.length + 1){ LP.ui.toast('カスタム枠は最後の1つを残します'); return; }
    colors.splice(slot, 1);
    slot = Math.min(slot, colors.length - 1);
    save(); LP.dock.render();
  }
  function exportJSON(){
    const blob = new Blob([JSON.stringify({ format: 'PALETTE_v1', colors }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'palette_' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function importJSON(){
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      if(!f) return;
      try{
        const o = JSON.parse(await f.text());
        const cols = Array.isArray(o) ? o : (o && Array.isArray(o.colors) ? o.colors : null);
        if(!cols || !cols.length){ LP.ui.toast('パレット JSON に colors がありません'); return; }
        colors = normalize(cols);
        if(colors.length <= FIXED.length) colors = colors.concat(CUSTOM0);
        slot = Math.min(slot, colors.length - 1);
        save(); LP.dock.render();
        LP.ui.toast('パレットを読み込みました（' + (colors.length - FIXED.length) + ' 色＋明度 11）');
      }catch(e){ LP.ui.toast('読み込めませんでした：' + (e.message || e)); }
    };
    inp.click();
  }
  /* ドックの HTML（いまの色 cur の枠に印） */
  function html(cur){
    const esc = LP.ui.esc;
    return '<div class="dk-pal">' + colors.map((c, i) => (i === FIXED.length ? '<i class="pd"></i>' : '')
      + '<button class="' + (i === slot ? 'sel ' : '') + (c === cur ? 'on' : '') + (isFixed(i) ? ' fx' : '') + '" data-act="dpal" data-v="' + i + '" style="background:' + c + '" title="'
      + esc(isFixed(i) ? '明度 ' + (i * 10) + '%　' + c + '（固定）' : c + '（押す＝この色／選んだ枠はスポイト・ピッカーで上書き）') + '"></button>').join('') + '</div>';
  }

  LP.drawPal = { FIXED, select, take, add, del, exportJSON, importJSON, html, isFixed, get colors(){ return colors; }, get slot(){ return slot; } };
})();
