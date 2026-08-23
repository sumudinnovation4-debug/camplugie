// POST { reference, order_type, order_id }
// Verifies payment with Paystack (never trust the client on the AMOUNT —
// that's always re-checked against Paystack's own record), then flips the
// matching escrow_order/food_order to "paid" — money now sits with the
// platform until release (confirm-received / Swift PIN / vendor delivered).
//
// order_type/order_id come straight from the client instead of being read
// back out of Paystack's `metadata` field. Paystack's inline popup (opened
// via PaystackPop.setup + openIframe) doesn't reliably round-trip metadata
// set during the earlier server-side /transaction/initialize call, so
// reading it back here was causing "Order not found" even on successful
// payments. The client already knows exactly which order it's paying for —
// we just re-verify the amount actually charged before trusting it.
const { paystack, supabaseAdmin, notifySeller, setCors } = require('./_lib');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { reference, order_type, order_id } = req.body;
    if (!reference || !order_type || !order_id) return res.status(400).json({ error: 'Missing reference/order_type/order_id' });
    if (!['escrow', 'food'].includes(order_type)) return res.status(400).json({ error: 'Invalid order_type' });

    const data = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
    if (data.data.status !== 'success') {
      return res.status(200).json({ ok: false, status: data.data.status });
    }

    const amountPaid = data.data.amount; // kobo, confirmed by Paystack — this is the number we actually trust
    const sb = supabaseAdmin();
    const table = order_type === 'escrow' ? 'escrow_orders' : 'food_orders';
    const paidStatus = order_type === 'escrow' ? 'paid_escrow' : 'paid';

    const { data: order, error } = await sb.from(table).select('*').eq('id', order_id).single();
    if (error) return res.status(500).json({ error: `Database error looking up order: ${error.message}` });
    if (!order) return res.status(404).json({ error: `Order not found (id ${order_id}) — this usually means the API function's SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY point to a different Supabase project than the one the app writes to.` });
    if (order.status !== 'awaiting_payment') return res.status(200).json({ ok: true, already: true });
    if (amountPaid < order.amount_kobo) return res.status(400).json({ error: 'Amount mismatch' });

    await sb.from(table).update({
      status: paidStatus, paystack_reference: reference, updated_at: new Date().toISOString(),
    }).eq('id', order_id);

    try {
      await notifyOrderPaid(sb, order_type, order);
    } catch (err) {
      console.error('notifyOrderPaid failed:', err.message);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Builds an order-specific message and fires the seller's in-app + email
// notification. Runs after the DB write above so the order is already marked
// paid even if this part fails for some reason (see notifySeller in _lib.js).
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

  // escrow: either a normal item sale or a Swift delivery job
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
