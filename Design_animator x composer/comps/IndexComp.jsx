// IndexComp.jsx — landing page comp (tDR ANIMATION SUITE)

function IndexComp({ theme }) {
  return (
    <div className={'ks-comp ' + theme} style={{ width: '100%', height: '100%' }}>
      <div className="ix-page">
        <div className="ix-corner tl"></div>
        <div className="ix-corner tr"></div>
        <div className="ix-corner bl"></div>
        <div className="ix-corner br"></div>
        <div className="ix-ghost">ANIM</div>

        <div className="ix-lockup">
          <div className="ix-eyebrow">tDR / BROWSER TOOLCHAIN</div>
          <div className="ix-title">ANIMATION SUITE</div>
          <div className="ix-sub">描いて、重ねて、書き出す。</div>
        </div>

        <div className="ix-grid">
          <a className="ix-card hover" href="#">
            <span className="ord">01</span>
            <div className="name">ANIMATOR</div>
            <div className="desc">作画 / ペイント<br />ラフ〜仕上げ</div>
            <div className="tags">
              <span className="tag">PENCIL</span>
              <span className="tag">ONION</span>
              <span className="tag">4K</span>
            </div>
          </a>
          <a className="ix-card" href="#">
            <span className="ord">02</span>
            <div className="name">COMPOSER</div>
            <div className="desc">音 / PAN / タイミング確認<br />（撮影処理はAE）</div>
            <div className="tags">
              <span className="tag">MULTI-TRACK</span>
              <span className="tag">KF</span>
            </div>
          </a>
        </div>

        <div className="ix-foot">
          <span>v0 · GITHUB PAGES</span>
          <span className="live">LIVE LINK READY ●</span>
        </div>
      </div>
    </div>
  );
}

window.IndexComp = IndexComp;
