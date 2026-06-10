/* @ds-bundle: {"format":3,"namespace":"KINETICSTAGEDesignSystem_bfe4c6","components":[],"sourceHashes":{"ui_kits/principle-app/Chrome.jsx":"f49ec91b2b10","ui_kits/principle-app/ShortcutModal.jsx":"fa7028b3147f","ui_kits/principle-app/SidePanel.jsx":"786469006b24","ui_kits/principle-app/Stage.jsx":"19f9d3c9fea6","ui_kits/principle-app/app.jsx":"253e3716fee8"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.KINETICSTAGEDesignSystem_bfe4c6 = window.KINETICSTAGEDesignSystem_bfe4c6 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// ui_kits/principle-app/Chrome.jsx
try { (() => {
/* ════════════════════════════════════════════════════════════════
   PRINCIPLE-APP UI KIT — Chrome (TopBar + BottomBar)
   Shared via window.* for the Babel scripts.
   ════════════════════════════════════════════════════════════════ */

function TopBar({
  principle,
  onIndex
}) {
  return /*#__PURE__*/React.createElement("div", {
    id: "topbar"
  }, /*#__PURE__*/React.createElement("span", null, "KINETIC_STAGE // LEC_", principle.no), /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#FFD27A',
      letterSpacing: '0.22em'
    }
  }, "PRINCIPLE_", principle.no, " // ", principle.en.toUpperCase()), /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      onIndex();
    }
  }, "[ESC] INDEX"));
}
function BottomBar({
  frame,
  total,
  easing,
  onShortcuts
}) {
  const pad = n => String(n).padStart(2, '0');
  return /*#__PURE__*/React.createElement("div", {
    id: "bottombar"
  }, /*#__PURE__*/React.createElement("span", null, "STATUS // ", easing), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'rgba(248,239,255,0.7)'
    }
  }, "FRAME \xB7 ", pad(frame + 1), " / ", pad(total)), /*#__PURE__*/React.createElement("span", {
    onClick: onShortcuts,
    style: {
      cursor: 'pointer'
    },
    onMouseEnter: e => e.currentTarget.style.color = '#FFD27A',
    onMouseLeave: e => e.currentTarget.style.color = ''
  }, "\u2328 SHORTCUTS"));
}

/* Index overlay — choose a principle */
function IndexOverlay({
  principles,
  current,
  onPick,
  onClose
}) {
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 8000,
      background: 'rgba(5,2,12,0.86)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      width: 'min(720px,92vw)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--mono)',
      fontSize: 10,
      letterSpacing: '0.4em',
      color: '#FFD27A',
      marginBottom: 20,
      textAlign: 'center'
    }
  }, "12 PRINCIPLES \xB7 \u89E6\u308C\u3070\u518D\u73FE\u3067\u304D\u308B"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3,1fr)',
      gap: 10
    }
  }, principles.map((p, i) => {
    const active = i === current;
    return /*#__PURE__*/React.createElement("div", {
      key: p.no,
      onClick: () => onPick(i),
      style: {
        cursor: 'pointer',
        padding: '14px 14px 16px',
        borderRadius: 5,
        border: active ? '1px solid transparent' : '1px solid rgba(255,210,122,0.16)',
        background: active ? 'linear-gradient(135deg,rgba(255,79,168,0.22),rgba(184,80,255,0.18))' : 'linear-gradient(180deg,rgba(255,79,168,0.05),rgba(184,80,255,0.02))',
        boxShadow: active ? '0 0 22px rgba(255,79,168,0.4)' : 'none',
        transition: 'all 0.15s'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--orn)',
        fontStyle: 'italic',
        fontWeight: 700,
        fontSize: 30,
        lineHeight: 1,
        background: 'var(--grad-spot)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        WebkitTextFillColor: 'transparent'
      }
    }, p.no), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--disp)',
        fontWeight: 900,
        fontSize: 15,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        color: active ? '#fff' : '#F8EFFF',
        marginTop: 6
      }
    }, p.en), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--jp-serif)',
        fontSize: 10.5,
        color: 'rgba(181,142,255,0.8)',
        marginTop: 3,
        letterSpacing: '0.12em'
      }
    }, p.jp));
  }))));
}
Object.assign(window, {
  TopBar,
  BottomBar,
  IndexOverlay
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/principle-app/Chrome.jsx", error: String((e && e.message) || e) }); }

// ui_kits/principle-app/ShortcutModal.jsx
try { (() => {
/* ════════════════════════════════════════════════════════════════
   PRINCIPLE-APP UI KIT — Shortcut modal
   ════════════════════════════════════════════════════════════════ */

function ShortcutModal({
  open,
  onClose
}) {
  const rows = [{
    k: 'Space',
    d: '再生 / 停止  ·  play / pause'
  }, {
    k: '◀ ▶',
    d: 'コマ送り  ·  step frame'
  }, {
    k: 'E',
    d: '編集モード切替  ·  toggle edit mode'
  }, {
    k: 'O',
    d: 'オニオンスキン  ·  onion skin'
  }, {
    k: '⌘Z',
    d: 'UNDO'
  }, {
    k: '⌘⇧Z',
    d: 'REDO'
  }, {
    k: 'Esc',
    d: 'インデックス  ·  index'
  }];
  return /*#__PURE__*/React.createElement("div", {
    id: "shortcut-modal",
    className: open ? 'open' : '',
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    id: "shortcut-box",
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("div", {
    className: "sc-header"
  }, /*#__PURE__*/React.createElement("span", null, "\u2328 KEYBOARD SHORTCUTS"), /*#__PURE__*/React.createElement("span", {
    id: "sc-open-btn",
    onClick: onClose
  }, "\u2715 CLOSE")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px 18px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "sc-section-lbl"
  }, "PLAYBACK \xB7 EDIT"), rows.map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '7px 0',
      borderBottom: '1px solid rgba(181,142,255,0.08)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "sc-desc",
    style: {
      fontSize: 11
    }
  }, r.d), /*#__PURE__*/React.createElement("span", {
    className: "sc-key"
  }, r.k))))));
}
Object.assign(window, {
  ShortcutModal
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/principle-app/ShortcutModal.jsx", error: String((e && e.message) || e) }); }

// ui_kits/principle-app/SidePanel.jsx
try { (() => {
/* ════════════════════════════════════════════════════════════════
   PRINCIPLE-APP UI KIT — Side panel (operate + learn)
   Stacked .sp sections: DEMO · DEBUG · APPLY · EDIT MODE
   ════════════════════════════════════════════════════════════════ */

function SectionLabel({
  letter,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "spl"
  }, /*#__PURE__*/React.createElement("span", {
    className: "lt"
  }, letter), children);
}
function Toggle({
  on,
  onClick
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: 'tg' + (on ? ' on' : ''),
    onClick: onClick
  });
}
function SidePanel({
  fps,
  setFps,
  opts,
  setOpts,
  onion,
  setOnion,
  debug,
  setDebug,
  editMode,
  setEditMode,
  checks,
  toggleCheck,
  principle
}) {
  const fpsOptions = [6, 12, 24];
  return /*#__PURE__*/React.createElement("div", {
    id: "side"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sp"
  }, /*#__PURE__*/React.createElement(SectionLabel, {
    letter: "A"
  }, "DEMO / TIMING"), /*#__PURE__*/React.createElement("div", {
    className: "tr"
  }, /*#__PURE__*/React.createElement("span", null, "FRAME RATE")), /*#__PURE__*/React.createElement("div", {
    className: "fpr"
  }, fpsOptions.map(v => /*#__PURE__*/React.createElement("div", {
    key: v,
    className: 'fp ' + (fps === v ? 'on' : 'off'),
    onClick: () => setFps(v)
  }, v, " FPS"))), /*#__PURE__*/React.createElement("div", {
    className: "tr",
    style: {
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement("span", null, "EXAGGERATION"), /*#__PURE__*/React.createElement("span", {
    className: "sl"
  }, "\xD7", (1 + opts.exaggerate * 0.3).toFixed(2))), /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: 0,
    max: 100,
    value: opts.exaggerate * 100,
    onChange: e => setOpts({
      ...opts,
      exaggerate: e.target.value / 100
    })
  }), /*#__PURE__*/React.createElement("div", {
    className: "tr",
    style: {
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement("span", null, "BOUNCES"), /*#__PURE__*/React.createElement("span", {
    className: "sl"
  }, opts.arcs)), /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: 1,
    max: 5,
    step: 1,
    value: opts.arcs,
    onChange: e => setOpts({
      ...opts,
      arcs: parseInt(e.target.value, 10)
    })
  }), /*#__PURE__*/React.createElement("div", {
    className: "tr",
    style: {
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement("span", null, "ONION SKIN"), /*#__PURE__*/React.createElement(Toggle, {
    on: onion,
    onClick: () => setOnion(!onion)
  }))), /*#__PURE__*/React.createElement("div", {
    className: "sp"
  }, /*#__PURE__*/React.createElement(SectionLabel, {
    letter: "B"
  }, "DEBUG"), /*#__PURE__*/React.createElement("div", {
    className: "tr"
  }, /*#__PURE__*/React.createElement("span", null, "SHOW KEY POSES"), /*#__PURE__*/React.createElement(Toggle, {
    on: debug,
    onClick: () => setDebug(!debug)
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "data-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk"
  }, "PRINCIPLE"), /*#__PURE__*/React.createElement("span", {
    className: "dv"
  }, principle.no, " \xB7 ", principle.en.toUpperCase())), /*#__PURE__*/React.createElement("div", {
    className: "data-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk"
  }, "EASING"), /*#__PURE__*/React.createElement("span", {
    className: "dv neon"
  }, "EASE-IN-OUT")), /*#__PURE__*/React.createElement("div", {
    className: "data-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dk"
  }, "DECAY"), /*#__PURE__*/React.createElement("span", {
    className: "dv"
  }, opts.decay)))), /*#__PURE__*/React.createElement("div", {
    className: "sp"
  }, /*#__PURE__*/React.createElement(SectionLabel, {
    letter: "C"
  }, "APPLY \xB7 \u5FDC\u7528"), /*#__PURE__*/React.createElement("div", {
    className: "db"
  }, /*#__PURE__*/React.createElement("div", {
    className: "de"
  }, "Squash keeps volume."), /*#__PURE__*/React.createElement("div", {
    className: "dj"
  }, "\u6F70\u3057\u3066\u3082\u4F53\u7A4D\u306F\u5909\u3048\u306A\u3044\u3002\u4F38\u3073\u3068\u6F70\u3057\u306F\u30BB\u30C3\u30C8\u3067\u3002")), /*#__PURE__*/React.createElement("div", {
    className: "ba"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ba-lbl"
  }, /*#__PURE__*/React.createElement("span", null, "BUTTON"), /*#__PURE__*/React.createElement("em", null, "swell & press")), /*#__PURE__*/React.createElement("div", {
    className: "ba-jp"
  }, "\u62BC\u3059\u524D\u306B\u81A8\u3089\u3093\u3067\u2192\u51F9\u3080"), /*#__PURE__*/React.createElement("div", {
    className: "ba-stage floor"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ba-btn"
  }, "TAP"))), /*#__PURE__*/React.createElement("div", {
    className: "ba"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ba-lbl"
  }, /*#__PURE__*/React.createElement("span", null, "DELETE"), /*#__PURE__*/React.createElement("em", null, "bloat \xB7 poof")), /*#__PURE__*/React.createElement("div", {
    className: "ba-jp"
  }, "\u6D88\u3048\u308B\u524D\u306B\u3075\u304F\u3089\u3080"), /*#__PURE__*/React.createElement("div", {
    className: "ba-stage"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ba-del"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "sp",
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(SectionLabel, {
    letter: "E"
  }, "EDIT MODE \xB7 \u78BA\u8A8D"), /*#__PURE__*/React.createElement("button", {
    id: "edit-toggle",
    className: editMode ? 'active' : '',
    onClick: () => setEditMode(!editMode),
    style: {
      width: '100%',
      padding: 9,
      fontSize: 10,
      letterSpacing: '0.3em',
      cursor: 'pointer',
      marginBottom: 12
    }
  }, editMode ? '✕ EXIT EDIT MODE' : '✏ EDIT MODE'), checks.map((c, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: 'check-item' + (c.done ? ' checked' : ''),
    onClick: () => toggleCheck(i)
  }, /*#__PURE__*/React.createElement("div", {
    className: "check-dot"
  }), /*#__PURE__*/React.createElement("span", null, c.label))), /*#__PURE__*/React.createElement("div", {
    className: 'check-progress' + (checks.every(c => c.done) ? ' complete' : '')
  }, checks.filter(c => c.done).length, " / ", checks.length, " CHECKED")));
}
Object.assign(window, {
  SidePanel
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/principle-app/SidePanel.jsx", error: String((e && e.message) || e) }); }

// ui_kits/principle-app/Stage.jsx
try { (() => {
/* ════════════════════════════════════════════════════════════════
   PRINCIPLE-APP UI KIT — Stage (the protagonist view)
   A frame-driven bouncing-ball demonstrating squash & stretch /
   timing / slow-in-slow-out. Scrub it, play it, edit it.
   ════════════════════════════════════════════════════════════════ */

/* Parametric bounce. Returns normalized pose for frame f of `total`.
   y  : 0 = floor … 1 = apex (fraction of stage height used)
   sx,sy : squash & stretch scale  */
function ballPose(f, total, opts) {
  const t = total <= 1 ? 0 : f / (total - 1);
  const arcs = opts.arcs; // how many bounces across the pass
  const decay = opts.decay; // amplitude falloff per bounce
  const exaggerate = opts.exaggerate; // squash/stretch strength

  const phase = t * arcs;
  const arc = Math.floor(phase);
  const u = phase - arc; // 0..1 within this arc
  const amp = Math.pow(decay, arc);
  const h = amp * 4 * u * (1 - u); // parabola, 0 at contacts

  // contact vs airborne
  const contact = h < 0.05;
  let sx = 1,
    sy = 1;
  if (contact) {
    const squash = exaggerate;
    sx = 1 + 0.35 * squash;
    sy = 1 - 0.32 * squash;
  } else {
    const speed = Math.min(1, Math.abs(0.5 - u) * 2.1); // fast near contacts
    sx = 1 - 0.18 * speed * exaggerate;
    sy = 1 + 0.26 * speed * exaggerate;
  }
  const x = 0.09 + 0.82 * t;
  return {
    x,
    y: h,
    sx,
    sy,
    contact,
    u
  };
}
function Ball({
  pose,
  size,
  hue,
  ghost
}) {
  const stageH = 100; // percentage basis handled by parent
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: `calc(${pose.x * 100}% - ${size / 2}px)`,
      bottom: `calc(14px + ${pose.y} * (100% - ${size + 28}px))`,
      width: size,
      height: size,
      borderRadius: '50%',
      transform: `scale(${pose.sx}, ${pose.sy})`,
      transformOrigin: 'bottom center',
      background: ghost ? 'transparent' : `radial-gradient(circle at 34% 30%, #fff, ${hue} 46%, var(--magenta) 100%)`,
      border: ghost ? `1px dashed rgba(90,233,255,0.45)` : 'none',
      boxShadow: ghost ? 'none' : `0 0 18px ${hue}aa, inset 0 -3px 8px rgba(0,0,0,0.35)`,
      opacity: ghost ? 0.5 : 1
    }
  });
}
function Playbar({
  playing,
  onPlay,
  onStep,
  frame,
  total,
  onScrub
}) {
  return /*#__PURE__*/React.createElement("div", {
    id: "playbar",
    style: {
      flexDirection: 'column',
      gap: 8,
      width: 'min(60%,420px)'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: 0,
    max: total - 1,
    value: frame,
    onChange: e => onScrub(parseInt(e.target.value, 10)),
    style: {
      width: '100%'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      alignSelf: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "pb",
    onClick: () => onStep(-99)
  }, "|\u25C0"), /*#__PURE__*/React.createElement("div", {
    className: "pb",
    onClick: () => onStep(-1)
  }, "\u25C0"), /*#__PURE__*/React.createElement("div", {
    className: 'pb' + (playing ? ' active' : ''),
    onClick: onPlay,
    style: {
      minWidth: 40
    }
  }, playing ? '⏸' : '▶'), /*#__PURE__*/React.createElement("div", {
    className: "pb",
    onClick: () => onStep(1)
  }, "\u25B6"), /*#__PURE__*/React.createElement("div", {
    className: "pb",
    onClick: () => onStep(99)
  }, "\u25B6|")));
}
function Stage({
  principle,
  frame,
  total,
  opts,
  editMode,
  onion,
  playing,
  onPlay,
  onStep,
  onScrub
}) {
  const pose = ballPose(frame, total, opts);
  const ghostFrames = [];
  if (onion) {
    for (let i = -2; i <= 2; i++) {
      const gf = frame + i * 3;
      if (i !== 0 && gf >= 0 && gf < total) ghostFrames.push(gf);
    }
  }
  // key poses (contacts + apexes) for edit-mode markers
  const keys = [];
  if (editMode) {
    for (let f = 0; f < total; f++) {
      const p = ballPose(f, total, opts);
      const prev = ballPose(Math.max(0, f - 1), total, opts);
      const next = ballPose(Math.min(total - 1, f + 1), total, opts);
      const isApex = p.y >= prev.y && p.y >= next.y && p.y > 0.2;
      const isContact = p.y <= prev.y && p.y <= next.y && p.y < 0.06;
      if (isApex || isContact) keys.push({
        f,
        p,
        kind: isContact ? 'C' : 'A'
      });
    }
  }
  return /*#__PURE__*/React.createElement("div", {
    id: "main"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stage-grid"
  }), /*#__PURE__*/React.createElement("span", {
    className: "corner tl"
  }), /*#__PURE__*/React.createElement("span", {
    className: "corner tr"
  }), /*#__PURE__*/React.createElement("span", {
    className: "corner bl"
  }), /*#__PURE__*/React.createElement("span", {
    className: "corner br"
  }), /*#__PURE__*/React.createElement("div", {
    className: "stage-bignum"
  }, principle.no), /*#__PURE__*/React.createElement("div", {
    className: "po"
  }, /*#__PURE__*/React.createElement("div", {
    className: "po-num"
  }, principle.no), /*#__PURE__*/React.createElement("div", {
    className: "po-en"
  }, principle.en), /*#__PURE__*/React.createElement("div", {
    className: "po-jp"
  }, principle.jp)), editMode && keys.map(k => /*#__PURE__*/React.createElement("div", {
    key: k.f,
    onClick: () => onScrub(k.f),
    title: `frame ${k.f + 1}`,
    style: {
      position: 'absolute',
      cursor: 'pointer',
      left: `calc(${k.p.x * 100}% - 7px)`,
      bottom: `calc(${14 + (opts.size || 0) / 2}px + ${k.p.y} * (100% - ${(opts.size || 44) + 28}px) - 7px)`,
      width: 14,
      height: 14,
      borderRadius: '50%',
      border: '1px solid ' + (k.kind === 'C' ? 'var(--ice)' : 'var(--gold)'),
      background: 'rgba(0,0,0,0.4)',
      boxShadow: '0 0 8px ' + (k.kind === 'C' ? 'rgba(90,233,255,0.5)' : 'rgba(255,210,122,0.5)'),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 7,
      color: k.kind === 'C' ? 'var(--ice)' : 'var(--gold)',
      fontFamily: 'var(--mono)'
    }
  }, k.kind)), ghostFrames.map(gf => /*#__PURE__*/React.createElement(Ball, {
    key: 'g' + gf,
    pose: ballPose(gf, total, opts),
    size: opts.size || 44,
    hue: "#5AE9FF",
    ghost: true
  })), /*#__PURE__*/React.createElement(Ball, {
    pose: pose,
    size: opts.size || 44,
    hue: "var(--rouge)"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 14,
      height: 1,
      background: 'linear-gradient(90deg,transparent,rgba(255,210,122,0.4),transparent)'
    }
  }), /*#__PURE__*/React.createElement(Playbar, {
    playing: playing,
    onPlay: onPlay,
    onStep: onStep,
    frame: frame,
    total: total,
    onScrub: onScrub
  }));
}
Object.assign(window, {
  Stage,
  ballPose
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/principle-app/Stage.jsx", error: String((e && e.message) || e) }); }

// ui_kits/principle-app/app.jsx
try { (() => {
/* ════════════════════════════════════════════════════════════════
   PRINCIPLE-APP UI KIT — App (state, loop, shortcuts)
   Wires the chrome + stage + side panel into the #app grid.
   ════════════════════════════════════════════════════════════════ */
const {
  useState,
  useEffect,
  useRef,
  useCallback
} = React;
const TOTAL = 36;
const PRINCIPLES = [{
  no: '01',
  en: 'Squash & Stretch',
  jp: '潰しと伸び'
}, {
  no: '02',
  en: 'Anticipation',
  jp: '予備動作'
}, {
  no: '03',
  en: 'Staging',
  jp: '見せ方'
}, {
  no: '04',
  en: 'Pose to Pose',
  jp: 'ポーズ・トゥ・ポーズ'
}, {
  no: '05',
  en: 'Follow Through',
  jp: '残し'
}, {
  no: '06',
  en: 'Slow In / Out',
  jp: '緩急'
}, {
  no: '07',
  en: 'Arcs',
  jp: '軌道'
}, {
  no: '08',
  en: 'Secondary Action',
  jp: '副次動作'
}, {
  no: '09',
  en: 'Timing',
  jp: 'タイミング'
}, {
  no: '10',
  en: 'Exaggeration',
  jp: '誇張'
}, {
  no: '11',
  en: 'Solid Drawing',
  jp: '実在感'
}, {
  no: '12',
  en: 'Appeal',
  jp: '魅力'
}];
function App() {
  const [pIndex, setPIndex] = useState(0);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [fps, setFps] = useState(12);
  const [opts, setOpts] = useState({
    arcs: 3,
    decay: 0.62,
    exaggerate: 0.7,
    size: 44
  });
  const [onion, setOnion] = useState(false);
  const [debug, setDebug] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [indexOpen, setIndexOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [checks, setChecks] = useState([{
    label: '潰しと伸びで体積を保った',
    done: true
  }, {
    label: '接地のコマで一番潰れる',
    done: false
  }, {
    label: '空中で最速＝最も伸びる',
    done: false
  }]);
  const principle = PRINCIPLES[pIndex];

  // playback loop
  const raf = useRef(0);
  const last = useRef(0);
  const acc = useRef(0);
  useEffect(() => {
    if (!playing) return;
    const tick = ts => {
      if (!last.current) last.current = ts;
      const dt = (ts - last.current) / 1000;
      last.current = ts;
      acc.current += dt * fps;
      if (acc.current >= 1) {
        const adv = Math.floor(acc.current);
        acc.current -= adv;
        setFrame(f => (f + adv) % TOTAL);
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf.current);
      last.current = 0;
    };
  }, [playing, fps]);
  const step = useCallback(d => {
    setPlaying(false);
    setFrame(f => {
      if (d === 99) return TOTAL - 1;
      if (d === -99) return 0;
      return (f + d + TOTAL) % TOTAL;
    });
  }, []);
  const toggleCheck = i => setChecks(cs => cs.map((c, j) => j === i ? {
    ...c,
    done: !c.done
  } : c));

  // keyboard
  useEffect(() => {
    const onKey = e => {
      if (e.code === 'Space') {
        e.preventDefault();
        setPlaying(p => !p);
      } else if (e.key === 'ArrowRight') step(1);else if (e.key === 'ArrowLeft') step(-1);else if (e.key.toLowerCase() === 'e') setEditMode(v => !v);else if (e.key.toLowerCase() === 'o') setOnion(v => !v);else if (e.key === 'Escape') {
        if (shortcutsOpen) setShortcutsOpen(false);else setIndexOpen(v => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, shortcutsOpen]);
  return /*#__PURE__*/React.createElement("div", {
    id: "app"
  }, /*#__PURE__*/React.createElement(TopBar, {
    principle: principle,
    onIndex: () => setIndexOpen(true)
  }), /*#__PURE__*/React.createElement(Stage, {
    principle: principle,
    frame: frame,
    total: TOTAL,
    opts: opts,
    editMode: editMode || debug,
    onion: onion,
    playing: playing,
    onPlay: () => setPlaying(p => !p),
    onStep: step,
    onScrub: v => {
      setPlaying(false);
      setFrame(v);
    }
  }), /*#__PURE__*/React.createElement(SidePanel, {
    fps: fps,
    setFps: setFps,
    opts: opts,
    setOpts: setOpts,
    onion: onion,
    setOnion: setOnion,
    debug: debug,
    setDebug: setDebug,
    editMode: editMode,
    setEditMode: setEditMode,
    checks: checks,
    toggleCheck: toggleCheck,
    principle: principle
  }), /*#__PURE__*/React.createElement(BottomBar, {
    frame: frame,
    total: TOTAL,
    easing: "EASE-IN-OUT",
    onShortcuts: () => setShortcutsOpen(true)
  }), indexOpen && /*#__PURE__*/React.createElement(IndexOverlay, {
    principles: PRINCIPLES,
    current: pIndex,
    onPick: i => {
      setPIndex(i);
      setIndexOpen(false);
      setFrame(0);
    },
    onClose: () => setIndexOpen(false)
  }), /*#__PURE__*/React.createElement(ShortcutModal, {
    open: shortcutsOpen,
    onClose: () => setShortcutsOpen(false)
  }));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/principle-app/app.jsx", error: String((e && e.message) || e) }); }

})();
