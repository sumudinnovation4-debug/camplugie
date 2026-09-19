# CampusPlug

CampusPlug is a secure campus marketplace built for university communities — a trusted place for students to buy, sell, and get things delivered, with escrow-protected payments on every transaction. **5,000+ students and counting.**

Social features — a campus feed, profiles, and alerts — exist to bring students back to the marketplace, keeping them engaged between transactions rather than competing with it for attention.

---

## Overview

CampusPlug provides:

**Marketplace (core product)**
- Marketplace-style listing support for products and services
- Escrow-protected transactions — funds are held until the buyer confirms receipt, never released blind
- In-chat haggling before a deal is struck
- Swift delivery with runner pickup and PIN-gated payout
- Food ordering with quick checkout
- Wallet and P2P transfers between users
- Google-only sign-in with onboarding for new users, keeping accounts verified and reducing fake profiles

**Social (retention layer)**
- A ranked campus feed for posts and updates
- Student profile pages with posts and plug activity
- Alerts and notifications for user activity
- Mobile-first design with desktop support
- Light and dark theme support
- Media-ready post cards for text, images, and videos
- Supabase-powered authentication, database, storage, and realtime updates

---

## Tech Stack

| Area | Technology |
|---|---|
| Frontend | React + Vite |
| Styling | TailwindCSS + CSS variables |
| Backend | Supabase |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth |
| Realtime | Supabase Realtime |
| Media Uploads | Supabase Storage / Cloudinary-ready flow |
| Build Tool | Vite |
| Payments | Paystack (Popup + Transfers API) |
| Serverless API | Vercel Functions |

---

## Core Features

### Marketplace & Payments

Marketplace is CampusPlug's core product — 5,000+ students use it to list, haggle, and transact on products and services safely, with no money changing hands outside of escrow. All payments run through Paystack and are verified server-side via Vercel serverless functions; the frontend only ever uses the Paystack publishable key.

- **Normal item (haggled in chat):** seller starts a transaction in the chat thread and confirms pickup location; buyer pays into escrow and confirms dropoff location. Funds are held until the buyer confirms receipt, then released to the seller (95%) via Paystack Transfer — or refunded if either side cancels.
- **Swift delivery:** after a runner accepts a delivery request, the buyer pays to confirm before pickup can start. Entering the correct delivery PIN on handoff auto-releases payout to the runner (95%) with no extra steps.
- **Food orders:** food-category listings get their own quick checkout in the cart — no chat required. Buyers confirm receipt or cancel & refund from the orders page.
- **Wallet / P2P:** send money to another user by username (free, wallet-to-wallet) or withdraw to a bank account (5% commission taken at withdrawal). Includes bank account setup and transaction history.
- **Commission:** a flat 5% is taken automatically on escrow releases, Swift payouts, and wallet withdrawals, computed in `computeCommission()` in `api/_lib.js`.
- **Auth:** sign-in is Google-only; new users complete a short onboarding step to add their name and school.

Payment verification currently happens on the client's redirect back from Paystack. A webhook endpoint for extra reliability (e.g. if a buyer closes the tab mid-payment) is a planned addition, along with a vendor-side dashboard so vendors can update food order status themselves.

### Yard Feed

The Yard feed is the main campus timeline. It supports:

- Ranked post loading through the feed algorithm RPC
- Safe fallback to latest posts when the ranked feed is unavailable
- Realtime post updates
- Text, image, and video posts
- Text-only post background styling
- Media-aware layouts so image/video posts do not receive text backgrounds
- Screen-safe post action menu
- Mobile and desktop responsive layouts

### Feed Ranking Algorithm

The feed algorithm scores posts using a combination of:

- Freshness
- Author affinity
- Variety boost
- Unseen post boost
- Low-engagement rescue
- Hub post boost
- Random jitter for natural feed movement

This helps the feed feel active while still giving new creators and lower-engagement posts a chance to be seen.

### Post Cards

Post cards include:

- Profile identity display
- Post content rendering
- Image and video support
- Purple primary-color active states
- Comment, repost, archive, and plug actions
- Responsive media preview
- Dark and light mode support

### Profile Pages

The profile experience supports:

- User identity and profile information
- User posts
- Plug/listing activity
- Empty states
- Responsive layout across mobile and desktop

### My Plug

The My Plug page supports listing discovery and user-owned plug activity. It is designed to work with product and service-style listings.

### Alerts

The Alerts page provides a cleaner notification experience with:

- Read/unread visual states
- Better spacing and card styling
- Theme-aware surfaces
- Professional empty states

### Theme System

CampusPlug includes a shared theme system for light and dark mode using global CSS variables. This prevents white text on white surfaces and keeps UI surfaces consistent across pages.

---

## Project Structure

```txt
src/
  components/
    AppLayout.jsx
    CreatePostModal.jsx
    PostCard.jsx
  lib/
    contentLoaders.js
    feed.js
    supabase.js
  pages/
    AlertsPage.jsx
    MyPlugPage.jsx
    ProfilePage.jsx
    YardPage.jsx
  index.css
assets/
  js/
    payments.js
api/
  _lib.js
  ...
sql/
  feed_algorithm.sql
  payments_schema.sql
cart.html
swift.html
chat-thread.html
wallet.html
orders.html
auth.html
onboarding.html
```

---

## Environment Variables

Create a `.env` file in the project root.

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

VITE_CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
VITE_CLOUDINARY_UPLOAD_PRESET=your_unsigned_upload_preset
```

Set the following in your Vercel project's Environment Variables (server-side only, never in the frontend `.env`):

```env
PAYSTACK_SECRET_KEY=your_paystack_secret_key
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

`SUPABASE_SERVICE_ROLE_KEY` comes from Supabase → Project Settings → API — this is not the anon key. Never commit a real `.env` file, even to a private repo.

Do not expose private API secrets in the frontend.

---

## Cloudinary Setup

To get Cloudinary credentials:

1. Create or open your Cloudinary account.
2. Go to the Cloudinary Console dashboard.
3. Copy your **Cloud Name**.
4. Go to **Settings → Upload → Upload Presets**.
5. Create an **unsigned upload preset**.
6. Restrict the preset by file type, upload folder, and size limit.
7. Copy the preset name into `VITE_CLOUDINARY_UPLOAD_PRESET`.

Only the cloud name and unsigned preset should be used in frontend code. API secrets should stay server-side only.

---

## Getting Started

Install dependencies:

```bash
npm install
```

Start development server:

```bash
npm run dev
```

Create production build:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

---

## Supabase Setup

The app expects the main Supabase tables for:

- users
- profiles
- posts
- post likes
- post comments
- listings
- notifications
- universities
- feed impressions
- feed engagements
- wallets
- escrow_orders
- food_orders
- p2p_transfers
- payout_recipients
- wallet_transactions
- receipts

The ranked feed uses RPC functions from `sql/feed_algorithm.sql`. Payments tables are created by running `sql/payments_schema.sql` once in the Supabase SQL editor.

If the feed RPC is unavailable, the app safely falls back to loading recent posts directly from the `posts` table.

---

## Recent Improvements

This update includes:

- Fixed Yard post loading
- Fixed Profile post loading
- Fixed My Plug loading
- Added safer content loading utilities
- Improved light and dark theme consistency
- Fixed white text on white background issues
- Improved post card styling
- Fixed the post composer UI
- Improved Alerts page styling
- Added safer action menu behavior
- Improved image preview behavior
- Removed unwanted Bump, Holla, and Seen actions
- Kept Plug active color aligned with the primary purple brand color

---

## Testing Checklist

Before merging to `main`, test the following:

- User can sign in
- Yard feed loads posts
- New posts appear correctly
- Profile page loads user posts
- My Plug loads listings
- Alerts page renders correctly
- Light mode has correct contrast
- Dark mode has correct contrast
- Post composer opens and submits properly
- Three-dot menu opens within the screen
- Image preview fits the screen
- Plug active state uses purple
- Mobile layout works correctly
- Desktop layout looks polished

---

## Git Workflow

Recommended flow:

```bash
git status
git add .
git commit -m "Improve feed loading, theme system, and post UI"
git push origin your-branch-name
```

Then open a pull request into `main`.

---

## Pull Request Summary

```txt
Improved CampusPlug feed stability, post loading, and theme consistency across Yard, Profile, My Plug, and Alerts.

Highlights:
- Fixed post loading across Yard, Profile, and My Plug
- Added safer content loading to avoid broken nested Supabase joins
- Improved light/dark mode styling across key pages
- Fixed post composer UI issues
- Improved post card action menu and media preview behavior
- Removed unwanted Bump, Holla, and Seen actions
- Kept Plug action aligned with primary brand color
- Preserved existing working feed algorithm and SQL setup
```

---

## Status

CampusPlug is a trusted, escrow-secured campus marketplace with 5,000+ students and counting, backed by a stable social feed and profile experience that keeps users coming back between transactions.

Escrow payments, Swift delivery payouts, food ordering, wallet/P2P transfers, and Google-only sign-in are complete and live. Still open: Paystack webhook verification (as a safety net alongside client-redirect verification) and a vendor-side dashboard for updating food order status.

---

## Chat, Groups, Calls & Activity upgrade

### What changed

**Chat (`chat-thread.html`)** — rebuilt as a fixed app frame (header / scrolling
message list / composer) instead of a page that scrolls as one block.

- Delivery ticks: ⏱ pending → ✓ sent → ✓✓ delivered → ✓✓ blue (read)
- Online / typing… / last-seen in the header, over Supabase Realtime presence
- Optimistic send — the bubble appears instantly and reconciles with the server row
- Reply-to quotes (tap the quote to jump to the original), edit, delete for everyone, emoji reactions
- Photos, videos, documents, and hold-to-record voice notes via Supabase Storage
- Bubble grouping, date separators, an "unread messages" divider, scroll-to-latest pill
- Multi-line composer (Enter sends on desktop, Shift+Enter = newline)
- **All message text is HTML-escaped.** It was being injected raw before, which was an XSS hole.

**Groups (`group-thread.html`)** — same engine, plus per-sender name colours,
`N online` in the header, multi-person typing indicators, admin-only announcements,
and admin delete.

**Activity / inbox (`notifications.html`)**

- **Fixed:** the Groups and Calls tabs were permanently empty — `loadGroups()` and
  `loadCalls()` existed but no tab click ever called them.
- **Fixed:** tapping a person in "New chat" fired two handlers and navigated to
  `chat-thread.html?id=undefined`. The search rows now use a separate class.
- **Fixed:** the "Search conversations…" box had no handler at all.
- Added per-chat unread badges, tick state on the last message, avatars, realtime
  reordering, mark-all-read, activity filters, and deep links from each notification.

**Calls (`call.html`)** — see below.

### Calls: what API do you need?

**None that costs money.** A call needs three pieces:

| Piece | What it does | What we use | Cost |
|---|---|---|---|
| Signalling | Lets two phones find each other | Supabase Realtime (already in the app) | Free |
| STUN | Tells each phone its public IP | Google + Cloudflare public STUN | Free |
| **TURN** | Relays audio when the phones *can't* reach each other | **Needs a free account — see below** | Free tier |

TURN is the part that was missing, and it's why calls were failing. Without it,
anyone behind campus WiFi, a captive portal, or symmetric NAT on MTN/Glo/Airtel
data simply can't connect. That's roughly 1 call in 5.

**Free TURN providers** (pick one, sign up, paste credentials into `config.js`):

- **ExpressTurn** — 100 GB/month free. https://www.expressturn.com
- **Metered / Open Relay** — 20 GB/month free (0.5 GB without a card). https://www.metered.ca/stun-turn
- **Cloudflare Realtime TURN** — free allowance, credentials generated per session. https://dash.cloudflare.com

100 GB is roughly 2,800 minutes of *relayed* voice — and most calls never get
relayed, so the free tier stretches a long way.

Open `config.js` and fill in:

```js
window.CP_TURN = {
  username:   "your-turn-username",
  credential: "your-turn-credential",
  host:       "relay1.expressturn.com:3480",
};
```

Until that's filled in the app runs STUN-only and the Calls tab shows a warning
banner. Nothing else needs changing.

Also new in calls: video calls, camera flip, speaker toggle, generated ringback
and ringtone, live call timer, a "weak connection" warning from WebRTC stats,
one automatic ICE restart when the network changes, and perfect-negotiation
signalling so simultaneous offers don't deadlock.

> Calls only work over HTTPS. Vercel already serves HTTPS, so this is handled.

### Setup steps

1. Run `sql/chat_calls_upgrade.sql` once in the Supabase SQL editor. It adds the new
   message columns, the `call_logs` table, `profiles.last_seen_at`, realtime
   settings, RLS policies, and the public `chat-media` storage bucket.
2. Sign up with a free TURN provider and paste the credentials into `config.js`.
3. Deploy. `chat-core.js` is a new file — make sure it ships.

### Still open

- Push notifications when the app is closed (needs a service worker + Web Push;
  the in-app ring only fires while a tab is open).
- Group read receipts (would need a per-member `message_reads` table).

---

## Site-wide audit — findings & fixes

A static analysis pass across all 27 pages (broken links, missing API handlers,
dead UI controls, un-escaped output, PWA readiness).

### Critical — fixed

**Site-wide XSS (70 injection points).** Every page was writing database text
straight into `innerHTML`: listing titles, usernames, post comments, dispute
reasons, Swift delivery notes, ambassador names, wallet transaction notes.
A student could set their username to `<img src=x onerror="...">` and run code
in every other student's browser — including yours in the admin dashboard, where
a session token is one line of JavaScript away.

Fixed by adding `window.CP.esc()` to the shared helper block and wrapping all 70
interpolations. Non-HTML uses of the same values (`navigator.share`, Paystack
payloads) were deliberately left raw — escaping those would corrupt the data.

### Functional — fixed

- **Home page search did nothing.** The box had no `id` and no listener. It now
  hands the query to `market.html?q=...`, and the marketplace reads that param.
- Groups and Calls tabs never loaded (earlier fix).
- "New chat" navigated to `chat-thread.html?id=undefined` (earlier fix).
- Conversation search had no handler (earlier fix).
- Removed `profile-2.html`, an orphan referencing a stylesheet that isn't in the
  project. Nothing linked to it.

### Verified clean

All 105 inline script blocks parse. No broken internal links, no `fetch()` to a
missing serverless handler, no secret keys in frontend code, no dead UI controls
outside the two noted below.

### Known, left alone

- `settings.html` and `settings-1.html` are near-duplicates; nothing links to
  `settings-1.html`. Delete it once you're sure which you're keeping.
- `swift.html` has an unused `haversineKm()` helper — harmless.

---

## Play Store packaging

The site is now an installable PWA, which is what a Play Store listing needs.

Added: `manifest.webmanifest`, `sw.js` (service worker), `offline.html`,
`icons/` (48→512px plus maskable), `vercel.json` (caching + security headers),
and `.well-known/assetlinks.json`.

### Steps

1. **Deploy.** Confirm the app installs: open in Chrome on Android, menu →
   "Install app". If that option is missing, nothing else will work.
2. **Audit it.** Chrome DevTools → Lighthouse → Progressive Web App. Aim for
   "installable" with no errors.
3. **Package it.**
   ```bash
   npm i -g @bubblewrap/cli
   bubblewrap init --manifest https://YOUR-DOMAIN/manifest.webmanifest
   bubblewrap build
   ```
   This produces a signed `.aab` for the Play Console. Bubblewrap creates a
   signing keystore — **back it up somewhere safe.** Lose it and you can never
   update the app under the same listing.
4. **Link the domain.** Bubblewrap prints your SHA-256 signing fingerprint.
   Paste it into `.well-known/assetlinks.json` (replacing the placeholder) and
   set `package_name` to whatever Bubblewrap used. Redeploy *before* you upload
   the build. Skip this and the app opens with a browser address bar across the
   top, which looks broken and fails review.
5. **Upload** the `.aab` to Play Console → Internal testing first.

### Play Store requirements you still need

- Privacy policy URL — **mandatory**, and yours collects location, camera,
  microphone and payment data, so it must say so.
- Data safety form — declare location, mic, camera, photos, financial info.
- Since you take payments: Play allows external payment for physical goods and
  services, which is what Camplugie sells. Declare it accurately.
- A 512×512 icon (in `icons/`), a 1024×500 feature graphic, and screenshots.

### Caveats for the app build

- **Permissions work but are asked per-session.** A TWA runs on Chrome, so mic,
  camera and location prompts behave as they do on the web.
- **Push notifications need more work.** `sw.js` has the push handlers wired,
  but nothing sends pushes yet. You need a VAPID key pair, a
  `push_subscriptions` table, and a serverless function that sends on new
  message / order events. Until then notifications only ring while the app is
  open. This is the single biggest gap between this and a real chat app.
- **Calls in a TWA** use the same WebRTC stack as the browser, so the TURN setup
  covers it. An incoming call still won't ring if the app is fully closed —
  that also needs push.
