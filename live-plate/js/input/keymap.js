/* ============================================================
   LIVE PLATE — input/keymap.js（キー。SPEC_21 §8-1）
   正準：composer-timeline-kit（SHORTCUT_ACTIONS 登録制＋gKeymap＋キャプチャで再割当）。
   ★ 登録するのは**いま実在する操作だけ**。P2 以降の道具キー（E/A/L/C/F…）はそのフェーズで1行ずつ足す。
   ★ 2連打（KEY_DBL_MS 以内に同じキー）＝ dbl。道具のモード切替（SPEC_17 の押し方。長押し・バネは PEN が来る P2 で）。
   ★ 修飾キー付き（Ctrl+Z / Ctrl+Y / Ctrl+D / Ctrl+V）と Esc は固定（再割当の対象外）。
   ★ id は localStorage に残る安定キー。一度出したら改名しない。
   ============================================================ */
var LP = window.LP || (window.LP = {});

(function(){
  'use strict';
  const A = () => LP.app;
  const TL = () => LP.sheetTools;
  const KEY_DBL_MS = 320;   // ANIMATOR / econte / manga-plate と同値
  const SHORTCUT_ACTIONS = [
    { cat: 'ステップ', id: 'step1', label: '01 SHEET（割る・置く）', def: '1', run: () => A().setStep('sheet') },
    { id: 'step2', label: '02 DRAW（描く・選んだ層を FOCUS）', def: '2', run: () => A().setStep('draw') },
    { id: 'step3', label: '03 TAKE（撮る）', def: '3', run: () => A().setStep('take') },
    { id: 'step4', label: '04 SHOW（見せる・出す）', def: '4', run: () => A().setStep('show') },
    { cat: '01 SHEET の道具（2回＝モード）', id: 'tSel', label: 'SEL 選ぶ（2回：素材 ⇄ コマ）', def: 'V', run: () => TL().setTool('sel'), dbl: () => TL().toggleMode('sel') },
    { id: 'tDiv', label: 'DIV コマを割る（2回：斜 → 縦 → 横）', def: 'D', run: () => TL().setTool('div'), dbl: () => TL().toggleMode('div') },
    { id: 'tEdit', label: 'EDIT 分割線を動かす', def: 'P', run: () => TL().setTool('edit') },
    { id: 'tText', label: 'TEXT 文字（2回：縦 ⇄ 横）', def: 'T', run: () => TL().setTool('text'), dbl: () => TL().toggleMode('text') },
    { id: 'tTone', label: 'TONE 網・集中線・流線（2回：種類）', def: 'N', run: () => TL().setTool('tone'), dbl: () => TL().toggleMode('tone') },
    { id: 'tWhite', label: '白 ホワイト（2回：白 ⇄ 消し）', def: 'W', alt: 'G', run: () => TL().setTool('white'), dbl: () => TL().toggleMode('white') },
    { cat: '再生 / 時間', id: 'play', label: '再生 / 停止', def: 'Space', prevent: true, run: () => A().togglePlay() },
    { id: 'prevFrame', label: '前のコマ（Shift＝10）', def: 'ArrowLeft', prevent: true, run: e => { A().stop(); A().seek(LP.state.t - (e && e.shiftKey ? 10 : 1)); } },
    { id: 'nextFrame', label: '次のコマ（Shift＝10）', def: 'ArrowRight', prevent: true, run: e => { A().stop(); A().seek(LP.state.t + (e && e.shiftKey ? 10 : 1)); } },
    { id: 'prevSheet', label: '前の紙の頭', def: 'J', run: () => A().jumpSheet(-1) },
    { id: 'nextSheet', label: '次の紙の頭', def: 'K', run: () => A().jumpSheet(1) },
    { id: 'first', label: '先頭', def: 'Home', prevent: true, run: () => { A().stop(); A().seek(0); } },
    { cat: '層', id: 'del', label: '選んだ層・素材を消す', def: 'Delete', prevent: true, alt: 'Backspace', run: () => A().deleteSel() },
    { id: 'fwd', label: '1つ手前へ', def: ']', run: () => A().layerStep(1) },
    { id: 'back', label: '1つ奥へ', def: '[', run: () => A().layerStep(-1) },
    { cat: '表示', id: 'detail', label: '詳細パネル 開閉', def: 'U', run: () => LP.detail.toggle() },
    { id: 'zoomOut', label: 'ステージを縮小', def: ',', run: () => LP.stage.zoomBy(1 / 1.25) },
    { id: 'zoomIn', label: 'ステージを拡大', def: '.', run: () => LP.stage.zoomBy(1.25) },
    { id: 'fit', label: 'ステージを全体表示', def: '0', run: () => LP.stage.fit() },
  ];
  /* 固定キー（一覧に出すだけ・再割当不可） */
  const FIXED = [
    ['Ctrl+Z', 'Undo'], ['Ctrl+Shift+Z / Ctrl+Y', 'Redo'], ['Ctrl+D', '選んだ層を複製'], ['Ctrl+V', '画像を貼り付け（いまの紙に層として）'],
    ['Esc', '投げ縄・分割の取消 ＞ 設定 ＞ 全画面 ＞ 再生停止 ＞ FOCUS を出る ＞ 選択解除'], ['Enter', '多角形の投げ縄を閉じる（白）'], ['ホイール', 'ステージの拡縮（カーソル中心）'], ['中ボタン / 右ドラッグ', 'ステージの移動（紙の外をドラッグでも）'],
    ['Ctrl+ホイール', 'タイムラインの拡縮（ホイール＝横送り）'],
  ];
  const KEYMAP_LS = 'liveplate_keymap_v1';
  let gKeymap = {}, gCaptureId = null, lastKey = { id: '', at: 0 };

  function defaultKeymap(){ const m = {}; SHORTCUT_ACTIONS.forEach(a => m[a.id] = a.def); return m; }
  function loadKeymap(){
    gKeymap = defaultKeymap();
    try{
      const raw = localStorage.getItem(KEYMAP_LS);
      if(raw){ const o = JSON.parse(raw); for(const a of SHORTCUT_ACTIONS) if(typeof o[a.id] === 'string') gKeymap[a.id] = o[a.id]; }
    }catch(e){}
    // 既定キーの重複は先勝ちで後ろが黙って死ぬ（composer の保険と同じ）
    const seen = {};
    SHORTCUT_ACTIONS.forEach(a => { const k = gKeymap[a.id]; if(!k) return; if(seen[k]) console.warn('[LIVE PLATE] キー重複', k, seen[k], a.id); else seen[k] = a.id; });
  }
  function saveKeymap(){ try{ if(!LP.HARNESS_ON) localStorage.setItem(KEYMAP_LS, JSON.stringify(gKeymap)); }catch(e){} }
  function normKey(e){ const k = e.key; if(k === ' ' || k === 'Spacebar') return 'Space'; if(k.length === 1) return k.toUpperCase(); return k; }
  const KEY_DISP = { Space: 'SPACE', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Delete: 'DEL', Backspace: '⌫', Escape: 'ESC', Enter: '⏎', Home: 'HOME' };
  function dispKey(k){ return k ? (KEY_DISP[k] || k) : '—'; }
  function disp(id){ const k = gKeymap[id]; return k ? dispKey(k) : ''; }

  function handleCapture(e){
    if(!gCaptureId) return false;
    e.preventDefault(); e.stopPropagation();
    if(['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return true;
    const k = normKey(e);
    if(k === 'Escape'){ gCaptureId = null; LP.settings.render(); return true; }
    for(const id in gKeymap) if(id !== gCaptureId && gKeymap[id] === k) gKeymap[id] = '';   // 同じキーは奪う
    gKeymap[gCaptureId] = k; gCaptureId = null; saveKeymap(); LP.settings.render();
    return true;
  }
  function typing(e){
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }
  function onKey(e){
    if(LP.ui.cfOpen) return;
    if(handleCapture(e)) return;
    if(typing(e)) return;
    const mod = e.ctrlKey || e.metaKey;
    if(mod && e.code === 'KeyZ'){ e.preventDefault(); e.shiftKey ? A().redo() : A().undo(); return; }
    if(mod && e.code === 'KeyY'){ e.preventDefault(); A().redo(); return; }
    if(mod && e.code === 'KeyD'){ e.preventDefault(); A().dupSel(); return; }
    if(e.key === 'Escape'){ e.preventDefault(); A().escape(); return; }
    if(e.key === 'Enter' && TL().enter()){ e.preventDefault(); return; }
    if(mod || e.altKey) return;
    if(LP.state.exporting) return;
    const k = normKey(e);
    for(const a of SHORTCUT_ACTIONS){
      if((gKeymap[a.id] && gKeymap[a.id] === k) || (a.alt && gKeymap[a.id] === a.def && a.alt === k)){
        if(a.prevent) e.preventDefault();
        if(e.repeat && a.dbl) return;   // 押しっぱなしで2連打扱いにしない（←→ の送りは繰り返してよい）
        const now = performance.now();
        if(a.dbl && lastKey.id === a.id && now - lastKey.at < KEY_DBL_MS){ lastKey = { id: '', at: 0 }; a.dbl(e); return; }
        lastKey = { id: a.id, at: now };
        a.run(e);
        return;
      }
    }
  }
  function init(){
    loadKeymap();
    window.addEventListener('keydown', onKey);
  }
  function startCapture(id){ gCaptureId = gCaptureId === id ? null : id; }
  function resetKeys(){ gKeymap = defaultKeymap(); gCaptureId = null; saveKeymap(); }

  LP.keys = {
    init, disp, dispKey, startCapture, resetKeys,
    get actions(){ return SHORTCUT_ACTIONS; }, get fixed(){ return FIXED; },
    get map(){ return gKeymap; }, get capturing(){ return gCaptureId; },
  };
})();
