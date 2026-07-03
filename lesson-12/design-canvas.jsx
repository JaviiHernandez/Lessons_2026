
// DesignCanvas.jsx — scrollable printables gallery
// A calm, vertically-scrolling gallery of "artboard" cards. Each card shows a
// scaled-down preview of an iframe (a printable page or an interactive riddle);
// clicking a card opens it full-size in a focus overlay with ←/→ navigation.
//
// This replaces the old Figma-style pan/zoom canvas: no dragging, no pinch —
// just a normal page scrollbar. The public API is unchanged so every lesson's
// index.html keeps working untouched:
//
//   <DesignCanvas title="…optional hero…">
//     <DCSection id="print" title="Printables" subtitle="…">
//       <DCArtboard id="poster" label="Poster (A3)" width={560} height={800}
//                   download="poster.html" downloadFormat="A3">
//         <iframe src="poster.html" … />
//       </DCArtboard>
//     </DCSection>
//   </DesignCanvas>
//
// The `width`/`height` on an artboard are only the *layout width* + an initial
// guess; the real content height is measured from each iframe (on load + via a
// ResizeObserver so late web-font / twemoji reflow is caught) so previews show
// the whole page with no cropped-off content and no inner scrollbar.
// Legacy props that no longer apply (minScale, maxScale, gap) are ignored.

const DC = {
  ink:      '#1f3d2b',            // deep green — headings
  inkSoft:  '#5b6b5f',            // muted green-gray — subtitles / labels
  green:    '#2E7D32',
  greenLt:  '#43A047',
  gold:     '#FBC02D',
  font:     "'Fredoka', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  fontHead: "'Fredoka One', 'Fredoka', sans-serif",
};

// Uniform card width; heights scale to preserve aspect ratio and are capped so
// very tall multi-page previews don't dominate the grid (they fade + invite a
// click to open full-size).
const CARD_W = 320;
const CARD_MAX_H = 520;

// One-time CSS injection. All classes are dc-prefixed so they can't collide
// with a hosted printable's own styles.
if (typeof document !== 'undefined' && !document.getElementById('dc-styles')) {
  const s = document.createElement('style');
  s.id = 'dc-styles';
  s.textContent = `
  .dc-scroll{
    height:100%; width:100%;
    overflow-y:auto; overflow-x:hidden;
    -webkit-overflow-scrolling:touch;
    scroll-behavior:smooth;
    font-family:${DC.font};
    color:${DC.ink};
    background:
      radial-gradient(1200px 520px at 12% -8%, rgba(46,125,50,.10), transparent 60%),
      radial-gradient(1000px 520px at 108% 4%, rgba(251,192,45,.14), transparent 55%),
      linear-gradient(180deg,#FCFBF3 0%,#F1F7EC 100%);
    background-attachment:local;
    scrollbar-width:thin; scrollbar-color:#9DBF9E transparent;
  }
  .dc-scroll::-webkit-scrollbar{width:14px;height:14px}
  .dc-scroll::-webkit-scrollbar-track{background:rgba(46,125,50,.06)}
  .dc-scroll::-webkit-scrollbar-thumb{background:#9DBF9E;border:3px solid transparent;background-clip:padding-box;border-radius:8px}
  .dc-scroll::-webkit-scrollbar-thumb:hover{background:${DC.green};background-clip:padding-box;border:3px solid transparent}

  .dc-page{max-width:1180px;margin:0 auto;padding:clamp(26px,4vw,50px) clamp(16px,4vw,40px) 96px}

  .dc-hero{text-align:center;margin:4px auto 40px;max-width:820px}
  .dc-hero-title{font-family:${DC.fontHead};font-size:clamp(24px,4.4vw,38px);color:${DC.ink};letter-spacing:.3px;line-height:1.15}

  .dc-section{margin:0 0 46px}
  .dc-sec-head{padding:0 2px 20px;position:relative}
  .dc-sec-title{font-family:${DC.fontHead};font-size:clamp(20px,3vw,27px);color:${DC.ink};letter-spacing:.2px;line-height:1.18;margin:0}
  .dc-sec-sub{margin-top:7px;font-size:15px;color:${DC.inkSoft};line-height:1.45;max-width:74ch}
  .dc-sec-rule{margin-top:16px;height:3px;width:100%;border-radius:3px;
    background:linear-gradient(90deg,${DC.gold},${DC.green} 42%,rgba(46,125,50,0) 96%)}

  .dc-grid{display:flex;flex-wrap:wrap;gap:28px;align-items:flex-start}

  .dc-card{width:${CARD_W}px;background:#fff;border-radius:16px;overflow:hidden;
    border:1px solid rgba(20,50,30,.07);
    box-shadow:0 1px 2px rgba(0,0,0,.05),0 6px 20px rgba(20,45,25,.08);
    transition:transform .18s cubic-bezier(.2,.7,.3,1),box-shadow .18s}
  .dc-card:hover{transform:translateY(-4px);
    box-shadow:0 8px 16px rgba(0,0,0,.10),0 20px 46px rgba(20,45,25,.17)}

  .dc-thumb{position:relative;overflow:hidden;cursor:pointer;background:#fff}
  .dc-thumb iframe{border:0;display:block;background:#fff}
  .dc-thumb-hint{position:absolute;left:50%;top:50%;
    transform:translate(-50%,-50%) scale(.94);
    background:rgba(15,36,31,.82);color:#fff;font-weight:600;font-size:13px;
    padding:8px 15px;border-radius:999px;white-space:nowrap;pointer-events:none;
    opacity:0;transition:opacity .16s,transform .16s;box-shadow:0 6px 18px rgba(0,0,0,.3);z-index:3}
  .dc-card:hover .dc-thumb-hint{opacity:1;transform:translate(-50%,-50%) scale(1)}
  .dc-fade{position:absolute;left:0;right:0;bottom:0;height:70px;pointer-events:none;z-index:2;
    background:linear-gradient(to bottom,rgba(255,255,255,0),rgba(255,255,255,.92))}
  .dc-newtab{position:absolute;top:9px;right:9px;width:30px;height:30px;border-radius:9px;z-index:3;
    background:rgba(15,36,31,.5);color:#fff;display:flex;align-items:center;justify-content:center;
    text-decoration:none;opacity:0;transition:opacity .16s,background .16s;backdrop-filter:blur(2px)}
  .dc-card:hover .dc-newtab{opacity:1}
  .dc-newtab:hover{background:${DC.green}}

  .dc-foot{display:flex;align-items:center;gap:10px;padding:12px 14px;border-top:1px solid rgba(20,50,30,.07)}
  .dc-foot-label{flex:1;min-width:0;font-size:13px;font-weight:500;color:#2b3a2f;line-height:1.28;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .dc-dl{flex-shrink:0;display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;
    color:#fff;background:linear-gradient(135deg,${DC.green},${DC.greenLt});border:none;border-radius:9px;
    padding:7px 11px;text-decoration:none;white-space:nowrap;cursor:pointer;
    box-shadow:0 1px 3px rgba(46,125,50,.35);transition:filter .15s,transform .12s}
  .dc-dl:hover{filter:brightness(1.08);transform:translateY(-1px)}
  .dc-dl:active{transform:translateY(0)}

  .dc-pillrow{display:flex;flex-wrap:wrap;gap:12px}
  .dc-pill{display:inline-flex;align-items:center;gap:9px;padding:11px 17px;border-radius:999px;
    background:#fff;border:1.5px solid rgba(20,50,30,.14);color:#26382c;font-size:14.5px;font-weight:500;
    text-decoration:none;box-shadow:0 1px 2px rgba(20,45,25,.06);
    transition:transform .15s,border-color .15s,background .15s,box-shadow .15s}
  .dc-pill:hover{border-color:${DC.green};background:#F1F8EE;color:${DC.ink};transform:translateY(-2px);
    box-shadow:0 6px 16px rgba(20,45,25,.12)}
  .dc-pill svg{opacity:.4;transition:opacity .15s,color .15s;flex-shrink:0}
  .dc-pill:hover svg{opacity:.95;color:${DC.green}}
  `;
  document.head.appendChild(s);
}

const DCCtx = React.createContext(null);

// Walk a React children tree to find the first iframe src, so the preview,
// "open in new tab" button and focus overlay know what to point at.
function findFrameSrc(node) {
  if (!node) return null;
  if (Array.isArray(node)) { for (const c of node) { const r = findFrameSrc(c); if (r) return r; } return null; }
  if (typeof node !== 'object') return null;
  if (node.props) {
    if (typeof node.props.src === 'string') return node.props.src;
    if (node.props.children) return findFrameSrc(node.props.children);
  }
  return null;
}

// Interactive riddles (riddle.html?s=N, never a printable/download) are shown
// as compact "open on a device" pills instead of heavy preview cards.
function isRiddle(artboard) {
  if (artboard.props.download) return false;
  const src = findFrameSrc(artboard.props.children);
  return !!src && /riddle\.html/i.test(src);
}

// ─────────────────────────────────────────────────────────────
// DCFrame — a controlled iframe at a fixed layout width whose height auto-grows
// to its real rendered content. Measured on load and via a ResizeObserver so
// late reflow (web fonts, twemoji SVG swap, images) is captured; the height is
// written straight to the element (so there's never an inner scrollbar) and
// reported up through onHeight so the parent can scale/clip it.
// ─────────────────────────────────────────────────────────────
function DCFrame({ src, width, initialHeight, interactive, onHeight }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;
    let ro, last = 0, cancelled = false;
    const measure = () => {
      if (cancelled) return;
      try {
        const d = iframe.contentDocument;
        if (!d || !d.documentElement) return;
        const h = Math.max(
          d.documentElement.scrollHeight,
          d.body ? d.body.scrollHeight : 0,
          d.body ? d.body.offsetHeight : 0,
        );
        if (h > 0 && Math.abs(h - last) > 1) {
          last = h;
          iframe.style.height = h + 'px';
          if (onHeight) onHeight(h);
        }
      } catch (e) { /* cross-origin — leave the initial height */ }
    };
    const onLoad = () => {
      measure();
      try {
        const d = iframe.contentDocument;
        if (d && window.ResizeObserver) { ro = new ResizeObserver(measure); ro.observe(d.documentElement); }
      } catch (e) {}
      setTimeout(measure, 400);
      setTimeout(measure, 1400);
    };
    iframe.addEventListener('load', onLoad);
    try { if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') onLoad(); } catch (e) {}
    return () => { cancelled = true; iframe.removeEventListener('load', onLoad); if (ro) ro.disconnect(); };
  }, [src]);

  // Not lazy-loaded: we measure each frame's real height to lay the grid out,
  // so we want them to load (and settle) promptly rather than on scroll.
  return (
    <iframe ref={ref} src={src} title={src} scrolling="no"
      style={{ width, height: initialHeight, border: 0, display: 'block', background: '#fff',
        pointerEvents: interactive ? 'auto' : 'none' }} />
  );
}

// ─────────────────────────────────────────────────────────────
// DesignCanvas — builds a registry of sections/artboards from its children
// (in source order) so the focus overlay can navigate between them, then
// renders the scrolling gallery.
// ─────────────────────────────────────────────────────────────
function DesignCanvas({ children, title }) {
  const [focus, setFocus] = React.useState(null); // slotId "sectionId/artboardId" | null

  const registry = {};     // slotId -> { sectionId, artboard }
  const sectionMeta = {};  // sectionId -> { title, subtitle, slotIds[] }
  const sectionOrder = [];
  const sections = [];
  React.Children.forEach(children, (sec) => {
    if (!sec || sec.type !== DCSection) return;
    const sid = sec.props.id ?? sec.props.title;
    if (!sid) return;
    const slotIds = [];   // card artboards only — the focus overlay navigates these
    const cards = [];
    const pills = [];     // riddles, rendered as compact links
    React.Children.forEach(sec.props.children, (ab) => {
      if (!ab || ab.type !== DCArtboard) return;
      const aid = ab.props.id ?? ab.props.label;
      if (!aid) return;
      if (isRiddle(ab)) { pills.push({ aid, ab }); return; }
      registry[`${sid}/${aid}`] = { sectionId: sid, artboard: ab };
      slotIds.push(aid);
      cards.push({ aid, ab });
    });
    if (slotIds.length) {
      sectionOrder.push(sid);
      sectionMeta[sid] = { title: sec.props.title, subtitle: sec.props.subtitle, slotIds };
    }
    sections.push({ sid, title: sec.props.title, subtitle: sec.props.subtitle, cards, pills });
  });

  const api = React.useMemo(() => ({ setFocus }), []);

  // Esc closes the focus overlay.
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setFocus(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Re-run twemoji over the freshly-rendered headings so emoji in section
  // titles/hero render as SVG (matches the rest of the page).
  React.useEffect(() => {
    if (window.twemoji) { try { window.twemoji.parse(document.body, { folder: 'svg', ext: '.svg' }); } catch (e) {} }
  });

  return (
    <DCCtx.Provider value={api}>
      <div className="dc-scroll">
        <div className="dc-page">
          {title && <div className="dc-hero"><h1 className="dc-hero-title">{title}</h1></div>}
          {sections.map((s) => (
            <section key={s.sid} className="dc-section">
              <div className="dc-sec-head">
                <h2 className="dc-sec-title">{s.title}</h2>
                {s.subtitle && <div className="dc-sec-sub">{s.subtitle}</div>}
                <div className="dc-sec-rule" />
              </div>
              {s.cards.length > 0 && (
                <div className="dc-grid">
                  {s.cards.map(({ aid, ab }) => (
                    <DCCard key={aid} artboard={ab} onOpen={() => setFocus(`${s.sid}/${aid}`)} />
                  ))}
                </div>
              )}
              {s.pills.length > 0 && (
                <div className="dc-pillrow">
                  {s.pills.map(({ aid, ab }) => <DCRiddlePill key={aid} artboard={ab} />)}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
      {focus && registry[focus] && (
        <DCFocusOverlay entry={registry[focus]} sectionMeta={sectionMeta}
          sectionOrder={sectionOrder} setFocus={setFocus} />
      )}
    </DCCtx.Provider>
  );
}

// DCSection / DCArtboard — declarative markers; DesignCanvas reads their props.
function DCSection() { return null; }
function DCArtboard() { return null; }

// ─────────────────────────────────────────────────────────────
// DCCard — one preview card: scaled thumbnail (click to focus) + footer with
// the label and an optional "Download PDF" button.
// ─────────────────────────────────────────────────────────────
function DCCard({ artboard, onOpen }) {
  const { label, width = CARD_W, height = 480, download, downloadFormat, children, style = {} } = artboard.props;
  const frameSrc = findFrameSrc(children);
  const [natH, setNatH] = React.useState(height); // real content height (measured)

  const scale = CARD_W / width;                    // downscale to a uniform width
  const dispH = natH * scale;
  const clipped = dispH > CARD_MAX_H;
  const thumbH = clipped ? CARD_MAX_H : dispH;

  const dlHref = download
    ? `${download}${download.includes('?') ? '&' : '?'}pdf=1${downloadFormat ? '&size=' + encodeURIComponent(downloadFormat) : ''}`
    : null;

  return (
    <div className="dc-card">
      <div className="dc-thumb" style={{ width: CARD_W, height: thumbH }} onClick={onOpen} title="Click to enlarge">
        <div style={{ width, height: natH, transform: `scale(${scale})`, transformOrigin: 'top left', ...style }}>
          {frameSrc
            ? <DCFrame src={frameSrc} width={width} initialHeight={height} interactive={false} onHeight={setNatH} />
            : children}
        </div>
        {clipped && <div className="dc-fade" />}
        <div className="dc-thumb-hint">🔍 Click to enlarge</div>
        {frameSrc && (
          <a className="dc-newtab" href={frameSrc} target="_blank" rel="noopener"
            title="Open in a new tab" onClick={(e) => e.stopPropagation()}>
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 1h4v4"/><path d="M11 1L6.5 5.5"/>
              <path d="M9 7v3a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h3"/>
            </svg>
          </a>
        )}
      </div>
      <div className="dc-foot">
        <span className="dc-foot-label">{label}</span>
        {dlHref && (
          <a className="dc-dl" href={dlHref} target="_blank" rel="noopener"
            title={`Download print-ready PDF${downloadFormat ? ' (' + downloadFormat + ')' : ''}`}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor"
              strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 1v7"/><path d="M3 5l3 3 3-3"/><path d="M1 10h10"/>
            </svg>
            {downloadFormat ? `PDF ${downloadFormat}` : 'PDF'}
          </a>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DCRiddlePill — a compact chip for an interactive riddle; opens it in a new
// tab (riddles are meant to be run on classroom tablets/phones).
// ─────────────────────────────────────────────────────────────
function DCRiddlePill({ artboard }) {
  const { label, children } = artboard.props;
  const src = findFrameSrc(children);
  return (
    <a className="dc-pill" href={src} target="_blank" rel="noopener" title="Open the riddle in a new tab">
      <span>{label}</span>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor"
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 1h4v4"/><path d="M11 1L6.5 5.5"/>
        <path d="M9 7v3a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h3"/>
      </svg>
    </a>
  );
}

// ─────────────────────────────────────────────────────────────
// Focus mode — overlay one artboard full-size; ←/→ within a section, ↑/↓
// across sections, Esc or backdrop click to exit. Content taller than the
// viewport scrolls inside the overlay.
// ─────────────────────────────────────────────────────────────
function DCFocusOverlay({ entry, sectionMeta, sectionOrder, setFocus }) {
  const { sectionId, artboard } = entry;
  const meta = sectionMeta[sectionId];
  const peers = meta.slotIds;
  const aid = artboard.props.id ?? artboard.props.label;
  const idx = peers.indexOf(aid);
  const secIdx = sectionOrder.indexOf(sectionId);

  const go = (d) => { const n = peers[(idx + d + peers.length) % peers.length]; if (n) setFocus(`${sectionId}/${n}`); };
  const goSection = (d) => {
    const ns = sectionOrder[(secIdx + d + sectionOrder.length) % sectionOrder.length];
    const first = sectionMeta[ns] && sectionMeta[ns].slotIds[0];
    if (first) setFocus(`${ns}/${first}`);
  };

  React.useEffect(() => {
    const k = (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowUp') { e.preventDefault(); goSection(-1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); goSection(1); }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  });

  const { width = 260, height = 480, children } = artboard.props;
  const frameSrc = findFrameSrc(children);
  const [natH, setNatH] = React.useState(height);
  const [vp, setVp] = React.useState({ w: window.innerWidth, h: window.innerHeight });
  React.useEffect(() => { const r = () => setVp({ w: window.innerWidth, h: window.innerHeight }); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);
  // Reset the measured height whenever we navigate to a different artboard.
  React.useEffect(() => { setNatH(height); }, [aid]);

  const availW = vp.w - 160;
  const availH = vp.h - 150;
  const scale = Math.max(0.1, Math.min(availW / width, 1.6));
  const dispW = width * scale;
  const dispH = natH * scale;
  const needScroll = dispH > availH;

  const [ddOpen, setDd] = React.useState(false);

  const Arrow = ({ dir, onClick }) => (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{ position: 'absolute', top: '50%', [dir]: 28, transform: 'translateY(-50%)',
        border: 'none', background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.9)',
        width: 44, height: 44, borderRadius: 22, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .15s' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,.18)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,.08)')}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d={dir === 'left' ? 'M11 3L5 9l6 6' : 'M7 3l6 6-6 6'} /></svg>
    </button>
  );

  return ReactDOM.createPortal(
    <div onClick={() => setFocus(null)}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(15,36,31,.62)',
        backdropFilter: 'blur(14px)', fontFamily: DC.font, color: '#fff' }}>

      {/* top bar: section dropdown (left) · open-in-tab + close (right) */}
      <div onClick={(e) => e.stopPropagation()}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 72, display: 'flex', alignItems: 'flex-start', padding: '16px 20px 0', gap: 12, zIndex: 3 }}>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setDd((o) => !o)}
            style={{ border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer', padding: '6px 8px', borderRadius: 6, textAlign: 'left', fontFamily: 'inherit' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.3 }}>{meta.title}</span>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ opacity: .7 }}><path d="M2 4l3.5 3.5L9 4"/></svg>
            </span>
            {meta.subtitle && <span style={{ display: 'block', fontSize: 13, opacity: .6, fontWeight: 400, marginTop: 2 }}>{meta.subtitle}</span>}
          </button>
          {ddOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#22352b', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,.4)', padding: 4, minWidth: 220, zIndex: 10 }}>
              {sectionOrder.map((sid) => (
                <button key={sid} onClick={() => { setDd(false); const f = sectionMeta[sid].slotIds[0]; if (f) setFocus(`${sid}/${f}`); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                    background: sid === sectionId ? 'rgba(255,255,255,.12)' : 'transparent', color: '#fff',
                    padding: '8px 12px', borderRadius: 5, fontSize: 14, fontWeight: sid === sectionId ? 600 : 400, fontFamily: 'inherit' }}>
                  {sectionMeta[sid].title}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ flex: 1 }} />
        {frameSrc && (
          <a href={frameSrc} target="_blank" rel="noopener" title="Open in a new tab"
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,.16)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,.06)')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.9)', textDecoration: 'none', transition: 'background .12s' }}>
            <svg width="15" height="15" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 1h4v4"/><path d="M11 1L6.5 5.5"/><path d="M9 7v3a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h3"/>
            </svg>
          </a>
        )}
        <button onClick={() => setFocus(null)}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,.14)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          style={{ border: 'none', background: 'transparent', color: 'rgba(255,255,255,.8)', width: 32, height: 32, borderRadius: 16, fontSize: 20, cursor: 'pointer', lineHeight: 1, transition: 'background .12s' }}>×</button>
      </div>

      {/* card centered, label + index below (scrolls vertically if very tall) */}
      <div style={{ position: 'absolute', top: 64, bottom: 56, left: 100, right: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: needScroll ? 'flex-start' : 'center', gap: 16 }}>
        <div onClick={(e) => e.stopPropagation()}
          style={{ maxHeight: '100%', overflowY: needScroll ? 'auto' : 'visible', borderRadius: 4, boxShadow: '0 20px 80px rgba(0,0,0,.45)' }}>
          <div style={{ width: dispW, height: dispH, background: '#fff', overflow: 'hidden' }}>
            <div style={{ width, height: natH, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
              {frameSrc
                ? <DCFrame src={frameSrc} width={width} initialHeight={height} interactive={true} onHeight={setNatH} />
                : (children || <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb' }}>{aid}</div>)}
            </div>
          </div>
        </div>
        <div onClick={(e) => e.stopPropagation()} style={{ fontSize: 14, fontWeight: 500, opacity: .9, textAlign: 'center', flexShrink: 0 }}>
          {artboard.props.label}
          <span style={{ opacity: .5, marginLeft: 10, fontVariantNumeric: 'tabular-nums' }}>{idx + 1} / {peers.length}</span>
        </div>
      </div>

      {peers.length > 1 && <Arrow dir="left" onClick={() => go(-1)} />}
      {peers.length > 1 && <Arrow dir="right" onClick={() => go(1)} />}

      {/* dots */}
      {peers.length > 1 && (
        <div onClick={(e) => e.stopPropagation()}
          style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8 }}>
          {peers.map((p, i) => (
            <button key={p} onClick={() => setFocus(`${sectionId}/${p}`)}
              style={{ border: 'none', padding: 0, cursor: 'pointer', width: 7, height: 7, borderRadius: 4,
                background: i === idx ? '#fff' : 'rgba(255,255,255,.35)' }} />
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

// ─────────────────────────────────────────────────────────────
// Post-it — absolute-positioned sticky note (kept for API compatibility).
// ─────────────────────────────────────────────────────────────
function DCPostIt({ children, top, left, right, bottom, rotate = -2, width = 180 }) {
  return (
    <div style={{
      position: 'absolute', top, left, right, bottom, width,
      background: '#fef4a8', padding: '14px 16px',
      fontFamily: '"Comic Sans MS", "Marker Felt", "Segoe Print", cursive',
      fontSize: 14, lineHeight: 1.4, color: '#5a4a2a',
      boxShadow: '0 2px 8px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',
      transform: `rotate(${rotate}deg)`, zIndex: 5,
    }}>{children}</div>
  );
}

Object.assign(window, { DesignCanvas, DCSection, DCArtboard, DCPostIt });
