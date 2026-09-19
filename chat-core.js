/* ============================================================
   Camplugie chat core — shared by chat-thread.html + group-thread.html
   Handles: escaping, bubble rendering, ticks, presence/typing,
   media upload, voice notes, action sheet, lightbox, scrolling.
   ============================================================ */
window.CPChat = (function () {

  const STORAGE_BUCKET = 'chat-media';

  /* ---------- text safety ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Escape first, then turn URLs into links. Never the other way round.
  function linkify(raw) {
    const safe = esc(raw);
    return safe.replace(/(https?:\/\/[^\s<]+)/g, (u) =>
      `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
  }

  /* ---------- time ---------- */
  function clock(iso) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function dayLabel(iso) {
    const d = new Date(iso), today = new Date();
    const y = new Date(); y.setDate(today.getDate() - 1);
    const same = (a, b) => a.toDateString() === b.toDateString();
    if (same(d, today)) return 'Today';
    if (same(d, y)) return 'Yesterday';
    return d.toLocaleDateString([], {
      day: 'numeric', month: 'short',
      year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
    });
  }
  function lastSeen(iso) {
    if (!iso) return 'offline';
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return 'last seen just now';
    if (mins < 60) return `last seen ${mins}m ago`;
    const d = new Date(iso), today = new Date();
    if (d.toDateString() === today.toDateString()) return `last seen today at ${clock(iso)}`;
    return `last seen ${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}`;
  }
  function mmss(sec) {
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  /* ---------- delivery ticks ---------- */
  const TICK_ONE = '<svg viewBox="0 0 18 13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 7 6.5 11.5 15 2"/></svg>';
  const TICK_TWO = '<svg viewBox="0 0 18 13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 7 5 11 12.5 2"/><polyline points="7 10.6 8.2 11.8 16.8 2"/></svg>';
  const TICK_PENDING = '<svg viewBox="0 0 18 13" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="9" cy="6.5" r="5"/><polyline points="9 3.4 9 6.5 11 7.8" stroke-linecap="round"/></svg>';

  // pending -> sent (1 grey) -> delivered (2 grey) -> read (2 blue)
  function ticks(m) {
    if (m._pending) return `<span class="msg-ticks pending">${TICK_PENDING}</span>`;
    if (m.read_at) return `<span class="msg-ticks read">${TICK_TWO}</span>`;
    if (m.delivered_at) return `<span class="msg-ticks">${TICK_TWO}</span>`;
    return `<span class="msg-ticks">${TICK_ONE}</span>`;
  }

  /* ---------- bubble rendering ---------- */
  // opts: { mine, showTicks, senderName, senderColor, onReplyJump }
  function bubbleHtml(m, opts) {
    const mine = !!opts.mine;
    const media = m.media_url ? String(m.media_url) : '';
    const type = m.media_type || '';
    const hasMedia = !!media;
    let inner = '';

    if (m.is_deleted) {
      return `<div class="msg-bubble"><i style="opacity:.6">🚫 This message was deleted</i><span class="msg-meta-space"></span><span class="msg-meta"><span>${clock(m.created_at)}</span></span></div>`;
    }

    // quoted reply
    if (m.reply_to_content) {
      inner += `<span class="msg-reply" data-jump="${esc(m.reply_to || '')}"><b>${esc(m.reply_to_name || 'Message')}</b><span>${esc(String(m.reply_to_content).slice(0, 90))}</span></span>`;
    }

    // sender name in groups
    if (!mine && opts.senderName) {
      inner += `<div class="msg-sender-name" style="color:${opts.senderColor || 'var(--brand)'}">${esc(opts.senderName)}</div>`;
    }

    if (hasMedia && type.startsWith('image')) {
      inner += `<img class="msg-media" src="${esc(media)}" alt="" loading="lazy" data-view="${esc(media)}">`;
      if (m.content) inner += `<div class="msg-caption">${linkify(m.content)}</div>`;
    } else if (hasMedia && type.startsWith('video')) {
      inner += `<video class="msg-media" src="${esc(media)}" controls playsinline preload="metadata"></video>`;
      if (m.content) inner += `<div class="msg-caption">${linkify(m.content)}</div>`;
    } else if (hasMedia && type.startsWith('audio')) {
      inner += `<div class="msg-voice" data-audio="${esc(media)}"><button class="vplay" aria-label="Play"><svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20"/></svg></button><span class="vbar"><i></i></span><span class="vdur">${m.media_duration ? mmss(m.media_duration) : '0:00'}</span></div>`;
    } else if (hasMedia) {
      const name = media.split('/').pop().split('?')[0];
      let fileName = name;
      try { fileName = decodeURIComponent(name); } catch (_) {}
      inner += `<a class="msg-file" href="${esc(media)}" target="_blank" rel="noopener"><span class="fi">📎</span><span><span class="fn">${esc(fileName).slice(0, 34)}</span><span class="fs">Tap to open</span></span></a>`;
    } else {
      inner += linkify(m.content || '');
    }

    const spacer = hasMedia && !m.content ? '' : `<span class="msg-meta-space${mine ? ' wide' : ''}"></span>`;
    const meta = `<span class="msg-meta">${m.edited_at ? '<span class="msg-edited">edited</span>' : ''}<span>${clock(m.created_at)}</span>${mine && opts.showTicks !== false ? ticks(m) : ''}</span>`;

    return `<div class="msg-bubble${hasMedia ? ' has-media' : ''}">${inner}${spacer}${meta}</div>`;
  }

  function rowHtml(m, opts) {
    const cls = `msg-row ${opts.mine ? 'mine' : 'theirs'}${opts.grouped ? ' grouped' : ''}`;
    let html = `<div class="${cls}" data-mid="${esc(m.id)}">${bubbleHtml(m, opts)}</div>`;
    if (m.reactions && Object.keys(m.reactions).length) {
      const chips = Object.entries(m.reactions)
        .map(([emoji, users]) => `<span>${esc(emoji)} ${Array.isArray(users) ? users.length : users}</span>`).join('');
      html += `<div class="msg-reacts" data-for="${esc(m.id)}">${chips}</div>`;
    }
    return html;
  }

  /* ---------- deterministic per-sender colour (groups) ---------- */
  const NAME_COLORS = ['#A78BFA', '#FBBF24', '#34D399', '#60A5FA', '#FB7185', '#F472B6', '#2DD4BF', '#FB923C'];
  function colorFor(id) {
    let h = 0;
    for (let i = 0; i < String(id).length; i++) h = (h * 31 + String(id).charCodeAt(i)) >>> 0;
    return NAME_COLORS[h % NAME_COLORS.length];
  }

  /* ---------- scroll manager ---------- */
  function makeScroller(scrollEl, btnEl) {
    let unread = 0;
    const nearBottom = () => scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 120;
    function toBottom(smooth) {
      scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
      unread = 0; paint();
    }
    function paint() {
      if (!btnEl) return;
      btnEl.classList.toggle('show', !nearBottom());
      const n = btnEl.querySelector('.n');
      if (n) { n.textContent = unread; n.classList.toggle('show', unread > 0); }
    }
    scrollEl.addEventListener('scroll', () => { if (nearBottom()) unread = 0; paint(); });
    btnEl?.addEventListener('click', () => toBottom(true));
    return {
      toBottom, nearBottom,
      onIncoming(isMine) {
        if (isMine || nearBottom()) toBottom(true);
        else { unread++; paint(); }
      },
    };
  }

  /* ---------- auto-growing textarea ---------- */
  function autoGrow(ta) {
    const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; };
    ta.addEventListener('input', fit); fit();
    return fit;
  }

  /* ---------- media upload (Supabase Storage) ---------- */
  async function uploadFile(file, userId, onProgress) {
    const ext = (file.name && file.name.includes('.')) ? file.name.split('.').pop() : (file.type.split('/')[1] || 'bin');
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    onProgress && onProgress('Uploading…');
    const { error } = await window.sb.storage.from(STORAGE_BUCKET)
      .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || 'application/octet-stream' });
    if (error) throw new Error(error.message || 'Upload failed');
    const { data } = window.sb.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, type: file.type || 'application/octet-stream' };
  }

  // Shrink big photos before upload so chat stays fast on campus data.
  function compressImage(file, maxDim = 1600, quality = 0.82) {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image') || file.type === 'image/gif') return resolve(file);
      const img = new Image();
      img.onload = () => {
        let { width: w, height: h } = img;
        if (Math.max(w, h) > maxDim) { const s = maxDim / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        c.toBlob(b => resolve(b ? new File([b], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }) : file), 'image/jpeg', quality);
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  }

  /* ---------- voice notes ---------- */
  function makeRecorder() {
    let rec = null, chunks = [], stream = null, startedAt = 0, timer = null;
    return {
      get active() { return !!rec && rec.state === 'recording'; },
      async start(onTick) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported(t)) || '';
        rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        chunks = []; startedAt = Date.now();
        rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        rec.start();
        timer = setInterval(() => onTick && onTick((Date.now() - startedAt) / 1000), 200);
      },
      stop() {
        return new Promise((resolve) => {
          if (!rec) return resolve(null);
          const seconds = Math.round((Date.now() - startedAt) / 1000);
          rec.onstop = () => {
            stream.getTracks().forEach(t => t.stop());
            clearInterval(timer);
            const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
            rec = null;
            resolve(seconds < 1 ? null : { file: new File([blob], `voice-${Date.now()}.webm`, { type: blob.type }), seconds });
          };
          rec.stop();
        });
      },
      cancel() {
        if (!rec) return;
        rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); clearInterval(timer); rec = null; };
        rec.stop();
      },
    };
  }

  /* ---------- voice-note playback (delegated, one player at a time) ---------- */
  let currentAudio = null, currentUI = null;
  function wireVoicePlayback(root) {
    root.addEventListener('click', (e) => {
      const box = e.target.closest('.msg-voice');
      if (!box) return;
      const url = box.dataset.audio;
      const btn = box.querySelector('.vplay');
      const fill = box.querySelector('.vbar i');
      const dur = box.querySelector('.vdur');

      if (currentAudio && currentUI === box) {
        if (currentAudio.paused) currentAudio.play(); else currentAudio.pause();
        return;
      }
      if (currentAudio) { currentAudio.pause(); currentUI?.querySelector('.vbar i') && (currentUI.querySelector('.vbar i').style.width = '0'); }
      currentAudio = new Audio(url); currentUI = box;
      currentAudio.play().catch(() => {});
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
      currentAudio.ontimeupdate = () => {
        if (currentAudio.duration) fill.style.width = (currentAudio.currentTime / currentAudio.duration * 100) + '%';
        dur.textContent = mmss(currentAudio.currentTime);
      };
      currentAudio.onended = currentAudio.onpause = () => {
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20"/></svg>';
      };
      currentAudio.onplay = () => {
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
      };
    });
  }

  /* ---------- image lightbox ---------- */
  function wireLightbox(root) {
    let el = document.querySelector('.img-viewer');
    if (!el) {
      el = document.createElement('div');
      el.className = 'img-viewer';
      el.innerHTML = '<img alt=""><button aria-label="Close">✕</button>';
      document.body.appendChild(el);
      el.addEventListener('click', () => el.classList.remove('show'));
    }
    root.addEventListener('click', (e) => {
      const img = e.target.closest('[data-view]');
      if (!img) return;
      el.querySelector('img').src = img.dataset.view;
      el.classList.add('show');
    });
  }

  /* ---------- long-press / right-click action sheet ---------- */
  // onAction(action, messageId) — action: 'reply' | 'copy' | 'delete' | 'react:<emoji>' | 'edit'
  function wireActionSheet(root, getMessage, onAction) {
    let sheet = document.querySelector('.msg-sheet-backdrop');
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.className = 'msg-sheet-backdrop';
      sheet.innerHTML = `
        <div class="msg-sheet">
          <div class="grab"></div>
          <div class="reactions">
            ${['👍', '❤️', '😂', '😮', '😢', '🙏'].map(e => `<button data-act="react:${e}">${e}</button>`).join('')}
          </div>
          <button data-act="reply">↩️ Reply</button>
          <button data-act="copy">📋 Copy text</button>
          <button data-act="edit" data-mine-only>✏️ Edit</button>
          <button data-act="delete" class="danger" data-mine-only>🗑️ Delete for everyone</button>
          <button data-act="close">✕ Cancel</button>
        </div>`;
      document.body.appendChild(sheet);
      sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.classList.remove('show'); });
    }

    let targetId = null;
    sheet.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      sheet.classList.remove('show');
      if (btn.dataset.act === 'close' || !targetId) return;
      onAction(btn.dataset.act, targetId);
    });

    function open(id) {
      targetId = id;
      const m = getMessage(id);
      const mine = m && m._mine;
      sheet.querySelectorAll('[data-mine-only]').forEach(b => { b.style.display = mine ? 'flex' : 'none'; });
      sheet.querySelector('[data-act="edit"]').style.display = (mine && m && !m.media_url) ? 'flex' : 'none';
      sheet.classList.add('show');
      if (navigator.vibrate) navigator.vibrate(12);
    }

    let pressTimer = null, moved = false;
    root.addEventListener('touchstart', (e) => {
      const row = e.target.closest('.msg-row'); if (!row) return;
      moved = false;
      pressTimer = setTimeout(() => { if (!moved) open(row.dataset.mid); }, 420);
    }, { passive: true });
    root.addEventListener('touchmove', () => { moved = true; clearTimeout(pressTimer); }, { passive: true });
    root.addEventListener('touchend', () => clearTimeout(pressTimer), { passive: true });
    root.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('.msg-row'); if (!row) return;
      e.preventDefault(); open(row.dataset.mid);
    });
    // Desktop: double-click a bubble
    root.addEventListener('dblclick', (e) => {
      const row = e.target.closest('.msg-row'); if (!row) return;
      open(row.dataset.mid);
    });
  }

  /* ---------- presence + typing over Supabase Realtime ---------- */
  // Free: uses the same Realtime channels the app already pays nothing for.
  function makePresence(channelName, myId, handlers) {
    const ch = window.sb.channel(channelName, { config: { presence: { key: myId } } });
    ch.on('presence', { event: 'sync' }, () => handlers.onSync && handlers.onSync(ch.presenceState()));
    ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (payload.userId !== myId) handlers.onTyping && handlers.onTyping(payload);
    });
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await ch.track({ online_at: new Date().toISOString(), userId: myId });
    });

    let lastSent = 0, stopTimer = null;
    return {
      channel: ch,
      typing(name) {
        const now = Date.now();
        if (now - lastSent > 1800) {
          lastSent = now;
          ch.send({ type: 'broadcast', event: 'typing', payload: { userId: myId, name, typing: true } });
        }
        clearTimeout(stopTimer);
        stopTimer = setTimeout(() => {
          lastSent = 0;
          ch.send({ type: 'broadcast', event: 'typing', payload: { userId: myId, name, typing: false } });
        }, 2500);
      },
      stopTyping(name) {
        clearTimeout(stopTimer); lastSent = 0;
        ch.send({ type: 'broadcast', event: 'typing', payload: { userId: myId, name, typing: false } });
      },
      destroy() { window.sb.removeChannel(ch); },
    };
  }

  return {
    esc, linkify, clock, dayLabel, lastSeen, mmss,
    bubbleHtml, rowHtml, colorFor, ticks,
    makeScroller, autoGrow, uploadFile, compressImage, makeRecorder,
    wireVoicePlayback, wireLightbox, wireActionSheet, makePresence,
    STORAGE_BUCKET,
  };
})();
