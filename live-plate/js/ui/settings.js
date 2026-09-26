/* ============================================================
   LIVE PLATE — ui/settings.js（⚙ SETTINGS：FILE・キー一覧と再割当・保存の説明）
   OBAN の #set-ovl と同じ置き方。入出力と連携は ⚙ の中（バーには置かない・§2-4）。
   ============================================================ */
var LP = window.LP || (window.LP = {});

(function(){
  'use strict';
  const $ = s => document.querySelector(s);
  let open = false;

  function init(){
    $('#b-set').addEventListener('click', () => toggle());
    $('#set-close').addEventListener('click', () => toggle(false));
    $('#set-ovl').addEventListener('pointerdown', e => { if(e.target.id === 'set-ovl') toggle(false); });
    $('#b-newbook').addEventListener('click', newBook);
    $('#b-booksave').addEventListener('click', () => LP.io.saveBookZip());
    $('#b-bookopen').addEventListener('click', () => $('#book-in').click());
    $('#book-in').addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if(!f) return;
      if(await LP.io.openAny(f)) toggle(false);
    });
    $('#book-name').addEventListener('change', e => {
      const v = e.target.value.trim();
      if(v && v !== LP.book.name){ LP.book.name = v.slice(0, 40); LP.app.commit('BOOK の名前'); }
    });
    $('#set-body').addEventListener('click', e => {
      const k = e.target.closest('[data-cap]');
      if(k){ LP.keys.startCapture(k.dataset.cap); render(); return; }
      if(e.target.closest('#b-keyreset')){ LP.keys.resetKeys(); render(); LP.ui.toast('キーを既定に戻しました'); }
    });
  }
  function toggle(on){
    open = on == null ? !open : !!on;
    $('#set-ovl').classList.toggle('show', open);
    if(open){ $('#book-name').value = LP.book.name || ''; render(); }
    else if(LP.keys.capturing) LP.keys.startCapture(LP.keys.capturing);   // 開いたまま閉じたらキャプチャも解く
  }
  function render(){
    if(!open) return;
    const esc = LP.ui.esc, map = LP.keys.map, cap = LP.keys.capturing;
    let h = '', cat = null, body = '';
    const flush = () => { if(cat != null) h += '<div class="set-grp"><h4>' + esc(cat) + '</h4>' + body + '</div>'; body = ''; };
    LP.keys.actions.forEach(a => {
      if(a.cat && a.cat !== cat){ flush(); cat = a.cat; }
      const k = map[a.id] || '';
      body += '<div class="sc-row"><span class="lb">' + esc(a.label) + '</span><button class="sc-key' + (cap === a.id ? ' cap' : '') + (k ? '' : ' unbound') + '" data-cap="' + a.id + '" title="押してから新しいキーを打つ（Esc で取り消し）">'
        + (cap === a.id ? '…' : esc(LP.keys.dispKey(k))) + '</button></div>';
    });
    flush();
    h += '<div class="set-grp"><h4>固定</h4>' + LP.keys.fixed.map(([k, d]) => '<div class="sc-row"><span class="lb">' + esc(d) + '</span><span class="sc-key fixed">' + esc(k) + '</span></div>').join('')
      + '<div class="sc-row" style="margin-top:6px"><span class="lb"></span><button class="btn" id="b-keyreset" title="再割当したキーを全部既定に戻す">キーを既定に戻す</button></div></div>';
    $('#set-body').innerHTML = h;
  }
  async function newBook(){
    const ok = await LP.ui.modalConfirm('BOOK を空にします。\n紙・層・素材がすべて消え、元に戻せません。\n（残したい作品は先に 04 SHOW の HTML で書き出してください）', '空にする');
    if(!ok) return;
    await LP.store.wipe();
    LP.book = LP.model.newBook();
    LP.state.t = 0; LP.state.selLayer = null;
    LP.hist.reset();
    LP.store.saveSoon();
    toggle(false);
    LP.app.refresh(true);
    LP.ui.toast('新しい BOOK');
  }

  LP.settings = { init, toggle, render, get open(){ return open; } };
})();
