// Paystack PUBLISHABLE key only — safe to expose in the browser.
// Never put the secret key (sk_...) here or anywhere in frontend code.
//
// Swap this for your live key (pk_live_...) when you're ready to take real
// payments from real users. That's the ONLY place you need to change it —
// every page pulls from here.
window.CP_PAYSTACK_PUBLIC_KEY = "pk_live_5ccc16c769091d817ae2e33c6b6f4a8574d7dd54";


/* ============================================================
   VOICE / VIDEO CALL CONFIG  (WebRTC)
   ============================================================

   You do NOT need a paid calling API. Calls need three pieces:

   1. SIGNALLING — how the two phones swap "let's connect" info.
      Already handled, free, by Supabase Realtime (the channels this
      app already uses). Nothing to add.

   2. STUN — tells each phone its own public IP. Free forever.
      Google's public STUN is below.

   3. TURN — a relay for when the two phones CANNOT reach each other
      directly. This is the missing piece that makes calls fail on
      campus WiFi, MTN/Glo mobile data, and anything behind a strict
      firewall. Roughly 1 call in 5 in Nigeria needs it.

   TURN is the only piece that needs an account. Free options:

     • ExpressTurn  — 100 GB/month free.  https://www.expressturn.com
     • Metered / Open Relay — 20 GB/month free (0.5 GB without a card).
                              https://www.metered.ca/stun-turn
     • Cloudflare Realtime TURN — generous free allowance.
                              https://dash.cloudflare.com → Realtime

   100 GB ≈ ~2,800 minutes of relayed voice, and most calls don't get
   relayed at all — so the free tier goes a long way.

   HOW TO TURN IT ON:
     Sign up with one of the above, copy your TURN username + credential,
     paste them below, and calls stop failing. Until then the app falls
     back to STUN-only, which works on open networks.
   ============================================================ */

window.CP_TURN = {
  // ExpressTurn (free tier, 100 GB/month).
  host: "free.expressturn.com:3478",
  username: "000000002105181001",

  credential: "eH0aBIjn6290AnXD+l3hLxYfaEw=",

  // free.expressturn.com only listens on 3478. Their paid relays also offer
  // TLS on 443; set this to true if you upgrade, since 443/TLS is what gets
  // through the strictest campus firewalls.
  tls: false,
};

// Optional: some providers (Metered, Cloudflare) hand out short-lived
// credentials from an endpoint instead. Put that URL here and it wins
// over the static values above.
//   Metered example:
//   https://<your-app>.metered.live/api/v1/turn/credentials?apiKey=<key>
window.CP_TURN_CREDENTIALS_URL = "";

// Builds the iceServers array WebRTC needs. Always returns something usable.
window.CP_getIceServers = async function () {
  // Free public STUN — multiple hosts so one being down doesn't kill calls.
  const stun = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ];

  if (window.CP_TURN_CREDENTIALS_URL) {
    try {
      const res = await fetch(window.CP_TURN_CREDENTIALS_URL);
      const data = await res.json();
      const servers = Array.isArray(data) ? data : (data.iceServers || data.v || []);
      if (servers.length) return stun.concat(servers);
    } catch (err) {
      console.warn('TURN credential fetch failed, falling back to STUN:', err);
    }
  }

  const t = window.CP_TURN || {};
  if (t.username && t.credential && t.host) {
    const host = t.host.includes(':') ? t.host : `${t.host}:3478`;
    const hostNoPort = t.host.split(':')[0];
    const servers = [
      // UDP first (best audio quality), then TCP as a fallback for networks
      // that block UDP outright.
      { urls: `turn:${host}?transport=udp`, username: t.username, credential: t.credential },
      { urls: `turn:${host}?transport=tcp`, username: t.username, credential: t.credential },
    ];
    // TLS on 443 looks like ordinary HTTPS, so it survives the strictest
    // campus firewalls — but only add it if the provider actually listens there.
    if (t.tls) servers.push({ urls: `turns:${hostNoPort}:443?transport=tcp`, username: t.username, credential: t.credential });
    return stun.concat(servers);
  }

  console.warn('No TURN credentials in config.js — calls will fail for users behind strict NAT/firewalls.');
  return stun;
};
