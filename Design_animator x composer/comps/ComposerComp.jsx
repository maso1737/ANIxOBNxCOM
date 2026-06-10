// ComposerComp.jsx — static comp of composer.html chrome (populated state)

function CpKf({ left, kind, sel }) {
  return <div className={'cp-kf' + (kind ? ' ' + kind : '') + (sel ? ' sel' : '')} style={{ left: left + '%' }}></div>;
}

function CpTrack({ name, sel, thumbs, kfs }) {
  return (
    <div className={'cp-track' + (sel ? ' sel' : '')}>
      <div className="head">
        <span className="name">⠿ {name}</span>
        <div className="tbtns">
          <button className="tbtn on">◉</button>
          <button className="tbtn">S</button>
          <button className="tbtn">PNG</button>
          <button className="tbtn">✕</button>
        </div>
      </div>
      <div className="lane">
        <div className="cp-thumbs">
          {Array.from({ length: thumbs }).map((_, i) => <div key={i} className="th"></div>)}
        </div>
        <div className="cp-kfrow">
          {kfs.map((k, i) => <CpKf key={i} left={k[0]} kind={k[1]} sel={k[2]} />)}
        </div>
      </div>
    </div>
  );
}

function ComposerComp({ theme, roomy }) {
  const ticks = [];
  for (let i = 0; i < 30; i++) {
    const major = i % 6 === 0 && i > 0;
    ticks.push(<div key={'t'+i} className={'tick' + (major ? ' major' : '')} style={{ left: (1.5 + i * 3.3) + '%' }}></div>);
    if (major) ticks.push(<div key={'l'+i} className="ticklbl" style={{ left: (1.5 + i * 3.3) + '%' }}>{i * 4}</div>);
  }
  const waveBars = Array.from({ length: 90 }).map((_, i) => (
    <i key={i} style={{ height: (18 + 60 * Math.abs(Math.sin(i * 0.55) * Math.sin(i * 0.13))) + '%' }}></i>
  ));

  return (
    <div className={'ks-comp ' + theme + (roomy ? ' roomy' : '')} style={{ width: '100%', height: '100%' }}>
      <div className="cp-app">

        <div className="cp-top">
          <div className="grp">
            <span className="an-title">COMPOSER<span className="mode">v0.6 — MULTI-TRACK — CUT_04</span></span>
          </div>
          <div className="grp">
            <button className="an-btn gold">IMPORT JSON</button>
            <button className="an-btn gold">EXPORT PROJECT</button>
            <button className="an-btn gold">EXPORT 4K PNG</button>
            <span className="an-sep">/</span>
            <button className="an-btn">♪ AUDIO</button>
            <button className="an-btn live">LIVE ●</button>
            <button className="an-btn">⚙</button>
            <button className="an-btn">HOME</button>
          </div>
        </div>

        <div className="cp-view">
          <div className="an-corner tl"></div>
          <div className="an-corner tr"></div>
          <div className="an-corner bl"></div>
          <div className="an-corner br"></div>
          <div className="meta" style={{ top: 10, left: 16 }}>CMP <b>2048×1152</b></div>
          <div className="meta" style={{ top: 10, right: 16 }}>RES <b>3840×2160</b></div>
          <div className="meta" style={{ bottom: 10, left: 16 }}>FPS <b>24</b></div>
          <div className="meta" style={{ bottom: 10, right: 16 }}>[ 012 / 072 ]</div>
          <div className="cp-comp" style={{ width: '54%', aspectRatio: '16/9' }}>
            <div className="safe"></div>
            <div className="cross"></div>
            <div className="handle" style={{ left: -4, top: -4 }}></div>
            <div className="handle" style={{ right: -4, top: -4 }}></div>
            <div className="handle" style={{ left: -4, bottom: -4 }}></div>
            <div className="handle" style={{ right: -4, bottom: -4 }}></div>
          </div>
        </div>

        <div className="cp-insp">
          <div className="cp-sect">
            <div className="h">PROJECT</div>
            <div className="cp-row"><span className="k">FPS</span><span className="v">24</span></div>
            <div className="cp-row"><span className="k">SRC</span><span className="v">2048×1152</span></div>
            <div className="cp-row"><span className="k">FRAMES</span><span className="v">072</span></div>
            <div className="cp-row"><span className="k">DUR</span><span className="v">3.00s</span></div>
          </div>
          <div className="cp-sect">
            <div className="h">OUTPUT</div>
            <div className="cp-row"><span className="k">TARGET</span><span className="v">3840×2160</span></div>
            <div className="cp-row"><span className="k">FILTER</span><span className="v">NEAREST</span></div>
          </div>
          <div className="cp-sect" style={{ flex: 1 }}>
            <div className="h">TRANSFORM · B_CHAR</div>
            <div className="cp-prop"><span className="k">AX</span><span className="st">◀</span><span className="num">0</span><span className="st">▶</span><span className="kf"></span></div>
            <div className="cp-prop"><span className="k">AY</span><span className="st">◀</span><span className="num">0</span><span className="st">▶</span><span className="kf"></span></div>
            <div className="cp-prop keyed"><span className="k">X</span><span className="st">◀</span><span className="num">-128</span><span className="st">▶</span><span className="kf"></span></div>
            <div className="cp-prop keyed"><span className="k">Y</span><span className="st">◀</span><span className="num">36</span><span className="st">▶</span><span className="kf"></span></div>
            <div className="cp-prop"><span className="k">Z</span><span className="st">◀</span><span className="num">0</span><span className="st">▶</span><span className="kf"></span></div>
            <div className="cp-prop"><span className="k">ROT</span><span className="st">◀</span><span className="num">0.0</span><span className="st">▶</span><span className="kf"></span></div>
            <div className="cp-prop keyed"><span className="k">SCL</span><span className="st">◀</span><span className="num">1.12</span><span className="st">▶</span><span className="kf"></span></div>
            <div className="cp-prop"><span className="k">OP</span><span className="st">◀</span><span className="num">1.00</span><span className="st">▶</span><span className="kf"></span></div>
          </div>
        </div>

        <div className="cp-tl">
          <div className="cp-ruler">
            {ticks}
            <div className="cp-marker" style={{ left: '22%' }}>M1 振り向き</div>
            <div className="cp-marker" style={{ left: '61%' }}>M2</div>
          </div>
          <div className="cp-tracks">
            <CpTrack name="C_FX_GLOW" sel={false} thumbs={10}
              kfs={[[12], [34, 'mid'], [58]]} />
            <CpTrack name="B_CHAR" sel={true} thumbs={10}
              kfs={[[8], [22, 'mid', true], [40, 'max', true], [66], [82, 'mid']]} />
            <CpTrack name="A_BG_PAN" sel={false} thumbs={10}
              kfs={[[5], [90, 'max']]} />
            <div className="cp-audio">
              <div className="head">♪ TAKE_03.WAV</div>
              <div className="wave">{waveBars}</div>
            </div>
            <div className="cp-playhead" style={{ left: 'calc(148px + (100% - 148px) * 0.40)' }}></div>
          </div>
        </div>

        <div className="cp-bot">
          <div className="grp">
            <span style={{ letterSpacing: '0.3em', fontFamily: 'var(--bank)', color: 'var(--t-label)' }}>TRANSPORT</span>
            <button className="tbtn">⏮</button>
            <button className="tbtn">◀</button>
            <button className="tbtn on">▶</button>
            <button className="tbtn">⏭</button>
            <button className="tbtn">⟳</button>
          </div>
          <div className="grp">
            <span>FRAME <span className="tc">012 / 072</span></span>
            <span className="an-sep">/</span>
            <span>TIME <span className="tc">0:00:00:12</span></span>
          </div>
        </div>

      </div>
    </div>
  );
}

window.ComposerComp = ComposerComp;
