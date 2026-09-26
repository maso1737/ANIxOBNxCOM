/* ============================================================
   LIVE PLATE — viewer/template.js（書き出す HTML ビューアの雛形）
   build(data, core)：data＝VIEWER_DATA、core＝LP.lib.time / LP.lib.render の文字列（export-html.js が渡す）。
   ★ 描画は core の renderFrame だけ。ここに合成の式を書かない（書いた瞬間にステージとずれる）。
   ★ スクロール → t：t = scrollY / ppf（EXPORT_WEB と同じ。OBAN の P は t / total に等しい）。
   ★ 文字列に閉じ script タグを生で書かない（ビューアの中で閉じてしまう）。'<\/' で割る。
   ============================================================ */
var LP = window.LP || (window.LP = {});

(function(){
  'use strict';
  const S = '<' + '/script>';

  function build(data, core){
    const json = JSON.stringify(data).replace(/</g, '\\u003c');
    const title = String(data.name || 'LIVE PLATE').replace(/[<&]/g, '');
    return '<!DOCTYPE html>\n<html lang="ja"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
      + '<meta name="generator" content="LIVE PLATE (ANIxOBNxCOM) viewer v1">'
      + '<title>' + title + '</title>\n'
      // 文字（アンチック体）。オフラインで開いたときは代わりの書体で出る
      + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shippori+Antique&family=Shippori+Antique+B1&family=Noto+Sans+JP:wght@400;500&display=swap">\n'
      + '<style>\n'
      + 'html,body{margin:0;padding:0;background:#000}\n'
      + '#spacer{width:1px}\n'
      + '#cv{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);opacity:0;transition:opacity .6s}\n'
      + '#cv.ready{opacity:1}\n'
      + '#loader{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:#888;font-family:monospace;font-size:11px;letter-spacing:.3em;background:#000;transition:opacity .4s;z-index:9}\n'
      + '#loader.done{opacity:0;pointer-events:none}\n'
      + '#lbar-w{width:240px;height:2px;background:rgba(255,255,255,.12)}\n'
      + '#lbar{height:100%;width:0;background:linear-gradient(90deg,#5AE9FF,#8F7BFF,#FF4FA8)}\n'
      + '#chapters{position:fixed;right:14px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:10px;z-index:5}\n'
      + '.chap{width:9px;height:9px;border-radius:50%;border:1px solid rgba(255,255,255,.4);cursor:pointer;position:relative}\n'
      + '.chap:hover{border-color:#C46BFF}.chap.on{background:#C46BFF;border-color:#C46BFF}\n'
      + '.chap .tip{display:none;position:absolute;right:16px;top:50%;transform:translateY(-50%);white-space:nowrap;color:#ddd;font-family:monospace;font-size:10px;background:rgba(0,0,0,.8);border:1px solid rgba(196,107,255,.5);padding:2px 8px}\n'
      + '.chap:hover .tip{display:block}\n'
      + '#hint{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,.35);font-family:monospace;font-size:10px;letter-spacing:.25em;animation:hb 2s infinite;pointer-events:none}\n'
      + '@keyframes hb{0%,100%{opacity:.35}50%{opacity:.8}}\n'
      + '</style></head><body>\n'
      + '<div id="spacer"></div><canvas id="cv"></canvas><div id="chapters"></div><div id="hint">SCROLL ▼</div>\n'
      + '<div id="loader"><div>LOADING</div><div id="lbar-w"><div id="lbar"></div></div><div id="lprog">0 / 0</div></div>\n'
      + '<script type="application/json" id="lpdata">' + json + S + '\n'
      + '<script>\n' + core + '\n' + S + '\n'
      + '<script>\n' + RUNTIME + '\n' + S + '\n'
      + '</body></html>\n';
  }

  /* ビューア本体（ES5 寄り・依存ゼロ）。LPT / LPR は core が作る */
  const RUNTIME = [
    "var D=JSON.parse(document.getElementById('lpdata').textContent);",
    "var BOOK={paper:D.paper,frame:D.frame,sheets:D.sheets,plates:D.plates,fps:D.fps};",
    "var TOTAL=Math.max(1,LPT.totalFrames(BOOK));",
    "var cv=document.getElementById('cv'),ctx=cv.getContext('2d');",
    "cv.width=D.out.w;cv.height=D.out.h;",
    "var IM=[];",
    "function img(cell,lane){var i=cell[lane];if(i==null||i<0)return null;var m=IM[i];return(m&&m.complete&&m.naturalWidth)?m:null;}",
    "function layout(){",
    "  document.getElementById('spacer').style.height=(TOTAL*D.ppf+window.innerHeight)+'px';",
    "  var s=Math.min(window.innerWidth/D.out.w,window.innerHeight/D.out.h);",
    "  cv.style.width=(D.out.w*s)+'px';cv.style.height=(D.out.h*s)+'px';",
    "}",
    "window.addEventListener('resize',layout);layout();",
    "var sm=0,lastF=-1;",
    "function draw(f){",
    "  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,cv.width,cv.height);",
    "  LPR.renderFrame(ctx,BOOK,f,{mode:'export',img:img,rect:{x:0,y:0,w:cv.width,h:cv.height}});",
    "}",
    "function tick(){",
    "  var tg=Math.max(0,Math.min(TOTAL-1,window.scrollY/D.ppf));",
    "  sm+=(tg-sm)*0.2;if(Math.abs(tg-sm)<0.01)sm=tg;",
    "  var f=Math.floor(sm);",
    "  if(f!==lastF){lastF=f;draw(f);chap(f);}",
    "  if(window.scrollY>40){var h=document.getElementById('hint');if(h)h.remove();}",
    "  requestAnimationFrame(tick);",
    "}",
    // チャプター＝紙の頭（紙が2枚以上のとき）
    "var CH=[];",
    "function buildChap(){",
    "  if(D.sheets.length<2)return;var w=document.getElementById('chapters'),acc=0;",
    "  D.sheets.forEach(function(s){var d=document.createElement('div');d.className='chap';var t=document.createElement('span');t.className='tip';t.textContent=s.name;d.appendChild(t);",
    "    var f0=acc;d.addEventListener('click',function(){window.scrollTo({top:f0*D.ppf,behavior:'smooth'});});w.appendChild(d);CH.push({el:d,f:f0});acc+=s.dur;});",
    "}",
    "function chap(f){var c=-1;for(var i=0;i<CH.length;i++)if(f>=CH[i].f)c=i;for(var j=0;j<CH.length;j++)CH[j].el.classList.toggle('on',j===c);}",
    // 全画像を読んでから始める
    "var n=D.images.length,done=0;",
    "document.getElementById('lprog').textContent='0 / '+n;",
    "function one(){done++;document.getElementById('lbar').style.width=(done/Math.max(1,n)*100)+'%';document.getElementById('lprog').textContent=done+' / '+n;if(done>=n)start();}",
    "var started=false;",
    "function start(){if(started)return;started=true;document.getElementById('loader').classList.add('done');cv.classList.add('ready');buildChap();draw(0);requestAnimationFrame(tick);}",
    "D.images.forEach(function(src,i){var m=new Image();m.onload=one;m.onerror=one;m.src=src;IM[i]=m;});",
    // 書体が届いたら描き直す（届くまでは代わりの書体で出ている）
    "if(document.fonts&&document.fonts.load){Promise.all([document.fonts.load(\"72px 'Shippori Antique'\"),document.fonts.load(\"72px 'Shippori Antique B1'\")]).then(function(){lastF=-1;},function(){});}",
    "if(!n)start();",
  ].join('\n');

  LP.viewer = { build };
})();
