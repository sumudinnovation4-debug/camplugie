// Shared helpers for all /api/paystack-* and /api/wallet-* functions.
// These run server-side on Vercel only — never imported by frontend code.

const { createClient } = require('@supabase/supabase-js');

const PAYSTACK_BASE = 'https://api.paystack.co';
const COMMISSION_RATE = 0.05; // 5% platform commission
const AMBASSADOR_SHARE = 0.20; // ambassadors get 20% of the platform's 5% cut, per sale their referred student makes

function supabaseAdmin() {
  // Service-role key bypasses RLS — this is the ONLY place it should be used.
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function paystack(path, options = {}) {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok || data.status === false) {
    throw new Error(data.message || `Paystack error on ${path}`);
  }
  return data;
}

function computeCommission(amountKobo) {
  const commission = Math.round(amountKobo * COMMISSION_RATE);
  return { commission, payout: amountKobo - commission };
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// --- Notifications (in-app + email) ---
// Sends via Resend (https://resend.com) — free tier covers 3,000 emails/month
// and, unlike Formspree, can send to any address dynamically (each seller's
// own inbox), not just one fixed address configured ahead of time.
// Requires RESEND_API_KEY and RESEND_FROM env vars (see notes at bottom of file).
async function sendEmail({ to, subject, text }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email notification');
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'Camplugie <onboarding@resend.dev>',
      to,
      subject,
      text,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error (${res.status}): ${body}`);
  }
}

// Writes the in-app notification row AND emails the seller. Both halves are
// wrapped so a failure here (bad email, Resend down, etc.) never breaks the
// calling payment flow — it just logs and moves on.
async function notifySeller(sb, { sellerId, type = 'order', title, body }) {
  try {
    await sb.from('notifications').insert({
      user_id: sellerId, type, title, body, is_read: false,
    });
  } catch (err) {
    console.error('notifySeller: in-app notification failed:', err.message);
  }

  try {
    const { data: seller } = await sb.from('profiles').select('email').eq('id', sellerId).maybeSingle();
    if (seller?.email) {
      await sendEmail({ to: seller.email, subject: title, text: body });
    }
  } catch (err) {
    console.error('notifySeller: email failed:', err.message);
  }
}

// If this order's buyer was referred by an ambassador, credits that
// ambassador 20% of the platform's 5% commission on the sale — straight to
// their wallet, same as a seller payout. Called once per order, right when
// the order is released (see paystack-release.js). Safe to call for every
// order: it's a no-op if the buyer wasn't referred by anyone.
async function payAmbassadorCommission(sb, { buyerId, amountKobo, orderType, orderId }) {
  const { data: buyerProfile } = await sb.from('profiles').select('referred_by_ambassador_id').eq('id', buyerId).maybeSingle();
  const ambassadorId = buyerProfile?.referred_by_ambassador_id;
  if (!ambassadorId) return;

  const { data: ambassador } = await sb.from('ambassadors').select('user_id, status').eq('id', ambassadorId).maybeSingle();
  if (!ambassador || ambassador.status !== 'approved') return; // revoked ambassadors stop earning

  const platformCommission = Math.round(amountKobo * COMMISSION_RATE);
  const ambassadorCut = Math.round(platformCommission * AMBASSADOR_SHARE);
  if (ambassadorCut <= 0) return;

  const { data: wallet } = await sb.from('wallets').select('balance_kobo').eq('user_id', ambassador.user_id).maybeSingle();
  const currentBalance = wallet?.balance_kobo || 0;

  await sb.from('wallets').upsert({
    user_id: ambassador.user_id, balance_kobo: currentBalance + ambassadorCut, updated_at: new Date().toISOString(),
  });
  await sb.from('wallet_transactions').insert({
    user_id: ambassador.user_id, type: 'ambassador_commission', amount_kobo: ambassadorCut,
    note: `20% referral commission on a student's ${orderType === 'food' ? 'food order' : 'purchase'}`,
  });
  await sb.from('ambassador_earnings').insert({
    ambassador_id: ambassadorId, buyer_id: buyerId, order_type: orderType, order_id: orderId, amount_kobo: ambassadorCut,
  });
}

// Reduces listings.stock_qty by however many units this order paid for, and
// marks the listing unavailable once it hits zero.
async function decrementListingStock(sb, listingId, qty) {
  const { data: listing } = await sb.from('listings').select('stock_qty').eq('id', listingId).maybeSingle();
  if (!listing) return;
  const newStock = Math.max(0, (listing.stock_qty ?? 1) - qty);
  const updates = { stock_qty: newStock };
  if (newStock <= 0) updates.is_available = false;
  await sb.from('listings').update(updates).eq('id', listingId);
}

async function decrementStockForOrder(sb, order_type, order) {
  if (order_type === 'food') {
    for (const line of (order.items || [])) {
      if (line.listing_id) await decrementListingStock(sb, line.listing_id, line.qty || 1);
    }
    return;
  }
  if (order.listing_id) await decrementListingStock(sb, order.listing_id, order.qty || 1);
}

// Builds an order-specific message and fires the seller's in-app + email notification.
async function notifyOrderPaid(sb, order_type, order) {
  const amountNaira = (order.amount_kobo / 100).toLocaleString('en-NG');

  if (order_type === 'food') {
    const itemNames = (order.items || []).map((i) => `${i.qty}x ${i.title}`).join(', ') || 'your food listing';
    await notifySeller(sb, {
      sellerId: order.seller_id,
      title: 'New order! 🍔',
      body: `You've got a new food order for ${itemNames} — ₦${amountNaira}. Head to your orders page on Camplugie to start preparing it.`,
    });
    return;
  }

  if (order.kind === 'swift') {
    await notifySeller(sb, {
      sellerId: order.seller_id,
      title: 'New Swift delivery job 🛵',
      body: `A buyer has paid for a Swift delivery — ₦${amountNaira}. Check the Swift tab on Camplugie for pickup details.`,
    });
    return;
  }

  let itemTitle = 'your item';
  if (order.listing_id) {
    const { data: listing } = await sb.from('listings').select('title').eq('id', order.listing_id).maybeSingle();
    if (listing?.title) itemTitle = listing.title;
  }
  await notifySeller(sb, {
    sellerId: order.seller_id,
    title: 'Item sold! 🎉',
    body: `"${itemTitle}" just sold for ₦${amountNaira}. Head to Camplugie to arrange handoff with the buyer.`,
  });
}

// Runs both side-effects of an order flipping to paid, each wrapped so a
// failure in one never blocks the other or bubbles up to break the caller
// (which has already recorded the payment by the time this runs).
async function finalizeOrderPaid(sb, order_type, order) {
  try { await notifyOrderPaid(sb, order_type, order); }
  catch (err) { console.error('notifyOrderPaid failed:', err.message); }

  try { await decrementStockForOrder(sb, order_type, order); }
  catch (err) { console.error('decrementStockForOrder failed:', err.message); }
}

module.exports = { supabaseAdmin, paystack, computeCommission, setCors, notifySeller, payAmbassadorCommission, finalizeOrderPaid, COMMISSION_RATE, AMBASSADOR_SHARE };
        
