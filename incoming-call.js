/* ============================================================
   Camplugie incoming-call ring — one shared script.
   Add   <script src="incoming-call.js?v=1"></script>   just before </body>
   on any signed-in page and that page will ring + show the
   Answer / Decline popup when someone calls.

   Needs window.sb (the Supabase client the page already creates).
   Brings its own styles, so it looks right on every page.
   Does nothing on call.html, or if the page already has a ring.
   ============================================================ */
(function () {
  if (window.__cpRingInstalled) return;
  if (window.location.pathname.endsWith('call.html')) return;
  window.__cpRingInstalled = true;

  const CSS = `
  .cp-ring {
    position: fixed; inset: 0; z-index: 2147483000;
    background: linear-gradient(180deg, #7C3AED, #0E0A1D 70%);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    color: #fff; text-align: center; font-family: 'Satoshi', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    padding: calc(24px + env(safe-area-inset-top, 0px)) 24px calc(24px + env(safe-area-inset-bottom, 0px));
    box-sizing: border-box; height: 100vh; height: 100dvh;
  }
  .cp-ring * { box-sizing: border-box; }
  .cp-ring-avatar {
    width: 104px; height: 104px; font-size: 34px; border-radius: 50%; margin-bottom: 18px;
    background: rgba(255,255,255,.14); display: flex; align-items: center; justify-content: center;
    font-weight: 800; animation: cpRingPulse 1.6s ease-in-out infinite;
  }
  @keyframes cpRingPulse {
    0%,100% { box-shadow: 0 0 0 0 rgba(255,255,255,.28); }
    50% { box-shadow: 0 0 0 20px rgba(255,255,255,0); }
  }
  .cp-ring h2 { font-size: 22px; margin: 0; max-width: 100%; overflow-wrap: anywhere; font-weight: 700; }
  .cp-ring p { color: rgba(255,255,255,.75); font-size: 14px; margin: 6px 0 0; }
  .cp-ring-row { display: flex; gap: 60px; margin-top: 46px; }
  .cp-ring-btn {
    width: 64px; border: none; background: none; color: #fff; padding: 0;
    display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer;
    font: inherit; font-size: 12px; font-weight: 700; -webkit-tap-highlight-color: transparent;
  }
  .cp-ring-btn svg {
    width: 24px; height: 24px; box-sizing: content-box; padding: 17px; border-radius: 50%;
    background: #FB7185; transition: transform .12s;
  }
  .cp-ring-btn.accept svg { background: #34D399; color: #06281B; }
  .cp-ring-btn:active svg { transform: scale(.92); }
  @media (max-height: 460px) {
    .cp-ring-avatar { width: 64px; height: 64px; font-size: 22px; margin-bottom: 10px; }
    .cp-ring-row { margin-top: 20px; }
  }`;

  const ICON_DECLINE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.42 12.42 0 0 0 3.81.61 2 2 0 0 1 2 2V21a2 2 0 0 1-2 2h-1C7.61 23 1 16.39 1 8V7a2 2 0 0 1 2-2h3.5a2 2 0 0 1 2 2 12.42 12.42 0 0 0 .61 3.81 2 2 0 0 1-.45 2.11z"/></svg>';
  const ICON_ANSWER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function injectStyles() {
    if (document.getElementById('cpRingStyles')) return;
    const st = document.createElement('style');
    st.id = 'cpRingStyles';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ---------- ringtone (generated, no audio file) ---------- */
  let ring = null;
  function startRingtone() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const beep = () => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = 660; g.gain.value = 0.08;
        o.connect(g); g.connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + 0.7);
      };
      beep();
      ring = { ctx, loop: setInterval(beep, 1600) };
    } catch (_) {}
  }
  function stopRingtone() {
    if (!ring) return;
    clearInterval(ring.loop);
    try { ring.ctx.close(); } catch (_) {}
    ring = null;
  }

  function showIncoming(payload, session) {
    if (document.getElementById('incomingCallOverlay')) return; // already ringing
    injectStyles();

    const name = payload.callerName || 'Camplugie user';
    const overlay = document.createElement('div');
    overlay.id = 'incomingCallOverlay';
    overlay.className = 'cp-ring';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-label', 'Incoming call from ' + name);
    overlay.innerHTML = `
      <div class="cp-ring-avatar">${esc(name.slice(0, 2).toUpperCase())}</div>
      <h2>${esc(name)}</h2>
      <p>${payload.video ? 'Incoming video call…' : 'Incoming Camplugie call…'}</p>
      <div class="cp-ring-row">
        <button type="button" class="cp-ring-btn" id="declineCallBtn">${ICON_DECLINE}<span>Decline</span></button>
        <button type="button" class="cp-ring-btn accept" id="acceptCallBtn">${ICON_ANSWER}<span>Answer</span></button>
      </div>`;
    document.body.appendChild(overlay);
    startRingtone();
    if (navigator.vibrate) navigator.vibrate([400, 250, 400, 250, 400]);

    const cleanup = () => {
      stopRingtone();
      overlay.remove();
      if (navigator.vibrate) navigator.vibrate(0);
    };

    document.getElementById('acceptCallBtn').addEventListener('click', () => {
      cleanup();
      window.location.href = `call.html?peer=${payload.callerId}&name=${encodeURIComponent(name)}` +
        `&role=callee&channel=${payload.callChannel}&mode=${payload.video ? 'video' : 'audio'}&auto=1`;
    });

    document.getElementById('declineCallBtn').addEventListener('click', async () => {
      cleanup();
      try {
        const ch = window.sb.channel(payload.callChannel);
        await ch.subscribe();
        ch.send({ type: 'broadcast', event: 'signal', payload: { kind: 'declined', from: session.user.id } });
        setTimeout(() => window.sb.removeChannel(ch), 500);
      } catch (_) {}
    });

    setTimeout(() => { if (document.body.contains(overlay)) cleanup(); }, 35000);
  }

  async function boot() {
    // Pages create window.sb in their own inline script; wait briefly in case it's still loading.
    for (let i = 0; i < 40 && !window.sb; i++) await new Promise((r) => setTimeout(r, 100));
    if (!window.sb) return;

    const { data: { session } } = await window.sb.auth.getSession();
    if (!session) return; // signed-out visitors don't get rung

    window.sb.channel(`ring-${session.user.id}`)
      .on('broadcast', { event: 'incoming' }, ({ payload }) => showIncoming(payload, session))
      .subscribe();
  }

  boot().catch((err) => console.warn('Incoming-call ring failed to start:', err));
})();
