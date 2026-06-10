// AnimatorComp.jsx — static comp of animator.html chrome
// Layout faithful to the live app; theme via wrapper class.

const AN_PALETTE = ['#FFF0E0','#FCE5CE','#F8C99B','#E8A87C','#C68863','#3B2C2A','#5C3A36','#8B4543','#C04848','#E55B47','#F08A6E','#FFB89B','#FFD8C2','#FFD93D','#FFC857','#FFA94D','#FF8730','#E8F5D0','#C5E384','#9DCB5C','#6FAF3A','#4A8B2D','#2E5F1F','#1F3F12','#F0F8FF','#E8F4FF','#BFDFFF','#8BB8E8','#5C8FCC','#3D6FA8','#1F4A7C','#D4B6E8','#A881C5','#7C5BA0','#553B7A','#FFE0E0','#FFD0D0','#FF9090','#E55050','#A02020','#FFFFFF','#E0DDD5','#B5B0A4','#888373','#4F4B40','#2A2722','#1A1815','#000000'];

function AnIconPen(){return(
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 21l4-1 11-11-3-3L4 17l-1 4z"></path><path d="M14 6l3 3"></path>
  </svg>);}
function AnIconErase(){return(
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M16 4l4 4-9 9H7l-3-3 9-9z"></path><path d="M9 17h11"></path>
  </svg>);}
function AnIconFill(){return(
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M5 11l7-7 7 7-7 7-7-7z"></path><path d="M5 11h14"></path><circle cx="20" cy="18" r="2"></circle>
  </svg>);}

function AnimatorComp({ theme, roomy }) {
  const ticks = [];
  for (let i = 0; i < 36; i++) {
    const major = i % 6 === 0 && i > 0;
    ticks.push(
      <div key={'t'+i} className={'tick' + (major ? ' major' : '')} style={{ left: (2 + i * 2.72) + '%' }}></div>
    );
    if (major) ticks.push(
      <div key={'l'+i} className="ticklbl" style={{ left: (2 + i * 2.72) + '%' }}>{i}k</div>
    );
  }

  const cells = [];
  const cellData = [
    { n: '001', dur: '×2', sel: false }, { n: '002', dur: '×2', sel: false },
    { n: '003', dur: '×1', sel: true },  { n: '004', dur: '×2', sel: false },
    { n: '005', dur: '×3', sel: false }, { n: '006', dur: null, sel: false, empty: true },
    { n: '007', dur: '×2', sel: false }, { n: '008', dur: '×2', sel: false },
  ];
  cellData.forEach((c, i) => {
    cells.push(
      <div key={i} className={'an-cell' + (c.sel ? ' sel' : '') + (c.empty ? ' empty' : '')}>
        <span className="num">{c.n}</span>
        {c.dur ? <span className="dur">{c.dur}</span> : null}
      </div>
    );
  });

  return (
    <div className={'ks-comp ' + theme + (roomy ? ' roomy' : '')} style={{ width: '100%', height: '100%' }}>
      <div className="an-app">

        <div className="an-top">
          <div className="grp">
            <span className="an-title">ANIMATOR<span className="mode">EDIT MODE</span></span>
          </div>
          <div className="grp">
            <button className="an-btn">FLIP</button>
            <button className="an-btn">MIRROR</button>
            <span className="an-sep">/</span>
            <button className="an-btn">REF</button>
            <button className="an-btn">⚙</button>
            <span className="an-sep">/</span>
            <button className="an-btn gold">EXPORT 4K</button>
            <button className="an-btn gold">SEQ PNG</button>
            <button className="an-btn gold">JSON ⇩</button>
            <button className="an-btn gold">JSON ⇧</button>
            <span className="an-sep">/</span>
            <button className="an-btn on">→ COMPOSER</button>
            <button className="an-btn live">LIVE ●</button>
            <button className="an-btn">HOME</button>
          </div>
        </div>

        <div className="an-tool">
          <button className="an-toolbtn on"><AnIconPen /><span className="lbl">PEN</span></button>
          <button className="an-toolbtn"><AnIconErase /><span className="lbl">ERASE</span></button>
          <button className="an-toolbtn"><AnIconFill /><span className="lbl">FILL</span></button>
          <div className="tsep"></div>
          <button className="an-pen"><span className="dot" style={{ width: 2, height: 2 }}></span>1px</button>
          <button className="an-pen"><span className="dot" style={{ width: 4, height: 4 }}></span>2px</button>
          <button className="an-pen on"><span className="dot" style={{ width: 9, height: 9 }}></span>20</button>
          <div className="tsep"></div>
          <button className="an-ink k on">主線</button>
          <button className="an-ink b">下書</button>
          <button className="an-ink o">指示</button>
          <div className="tsep"></div>
          <div className="an-bg">
            <span>BG</span>
            <div className="track"><div className="thumb"></div></div>
            <span>100</span>
          </div>
          <div className="tsep"></div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button className="an-undo">↶</button>
            <button className="an-undo">↷</button>
          </div>
          <div className="an-stab">
            <span>STAB</span>
            <span className="mode">AVG</span>
          </div>
        </div>

        <div className="an-stage">
          <div className="grid"></div>
          <div className="an-corner tl"></div>
          <div className="an-corner tr"></div>
          <div className="an-corner bl"></div>
          <div className="an-corner br"></div>
          <div className="an-stageinfo"><b>2048×1152</b> · ZOOM <b>FIT</b></div>
          <div className="an-canvas" style={{ width: '62%', aspectRatio: '16/9' }}></div>
          <div className="an-hud">16 · 698</div>
          <div className="an-zoom">
            <button className="zbtn">−</button>
            <span className="zval">41%</span>
            <button className="zbtn">+</button>
            <button className="zbtn fit">FIT</button>
          </div>
        </div>

        <div className="an-side">
          <div className="an-palhead">
            <button className="pbtn">＋</button>
            <button className="pbtn">−</button>
            <button className="pbtn">⇩</button>
            <button className="pbtn">⇧</button>
            <button className="pbtn">⤢</button>
          </div>
          <div className="an-palette">
            {AN_PALETTE.map((c, i) => (
              <div key={i} className={'cell' + (i === 47 ? ' on' : '')} style={{ background: c }}></div>
            ))}
          </div>
        </div>

        <div className="an-strip">
          <div className="an-striptool">
            <button className="play"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 2l11 6-11 6V2z"></path></svg></button>
            <button className="play"><svg viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10"></rect></svg></button>
            <span className="an-sep">|</span>
            <span className="lbl">FPS</span><span className="val">24</span>
            <span className="an-sep">|</span>
            <span className="lbl">IN</span><span className="val">024</span>
            <span className="lbl">OUT</span><span className="val">035コマ / 1.46s</span>
            <span className="an-sep">|</span>
            <span className="lbl">TIME</span><span className="val">072 コマ</span>
            <div className="right">
              <button className="an-btn on">ONION</button>
              <button className="an-btn">+ FRAME</button>
              <button className="an-btn">DUPLICATE</button>
              <button className="an-btn">DELETE</button>
            </div>
          </div>
          <div className="an-timetrack">
            {ticks}
            <div className="an-work" style={{ left: '34%', width: '30%' }}>
              <div className="wh l"></div><div className="wh r"></div>
            </div>
            <div className="an-cursor" style={{ left: '40%' }}></div>
          </div>
          <div className="an-cells">
            {cells}
            <div className="an-tap">+ TAP</div>
          </div>
        </div>

        <div className="an-bot">
          <div className="grp"><span>HISTORY 12</span><span>STROKES 86</span></div>
          <div className="grp"><span className="save">AUTOSAVED · 2.1s</span></div>
        </div>

      </div>
    </div>
  );
}

window.AnimatorComp = AnimatorComp;
