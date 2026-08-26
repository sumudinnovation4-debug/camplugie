// POST { user_id, order_type, order_id }
// Alternative to the card/Paystack flow: pays for an already-created
// food_order/escrow_order straight out of the buyer's wallet balance.
// Mirrors exactly what paystack-verify.js does once a card payment succeeds
// (mark paid, notify seller, decrement stock) — the only difference is
// where the money comes from.
const { supabaseAdmin, finalizeOrderPaid, setCors } = require('./_lib');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { user_id, order_type, order_id } = req.body;
    if (!user_id || !order_type || !order_id) return res.status(400).json({ error: 'Missing user_id/order_type/order_id' });
    if (!['escrow', 'food'].includes(order_type)) return res.status(400).json({ error: 'Invalid order_type' });

    const sb = supabaseAdmin();
    const table = order_type === 'escrow' ? 'escrow_orders' : 'food_orders';
    const paidStatus = order_type === 'escrow' ? 'paid_escrow' : 'paid';

    const { data: order, error } = await sb.from(table).select('*').eq('id', order_id).single();
    if (error) return res.status(500).json({ error: `Database error looking up order: ${error.message}` });
    if (!order) return res.status(404).json({ error: `Order not found (id ${order_id})` });
    if (order.buyer_id !== user_id) return res.status(403).json({ error: 'This order does not belong to this user' });
    if (order.status !== 'awaiting_payment') return res.status(200).json({ ok: true, already: true });

    const { data: wallet } = await sb.from('wallets').select('balance_kobo').eq('user_id', user_id).maybeSingle();
    const currentBalance = wallet?.balance_kobo || 0;
    if (currentBalance < order.amount_kobo) {
      return res.status(400).json({ error: `Insufficient wallet balance — you have ₦${(currentBalance / 100).toLocaleString('en-NG')}, this costs ₦${(order.amount_kobo / 100).toLocaleString('en-NG')}.` });
    }

    // Deduct from the buyer's wallet first — if anything below fails, the
    // order is still visibly "awaiting_payment" and this deduction would
    // need reconciling, so keep this as the very next write after the
    // balance check, not several steps later.
    await sb.from('wallets').upsert({
      user_id, balance_kobo: currentBalance - order.amount_kobo, updated_at: new Date().toISOString(),
    });
    await sb.from('wallet_transactions').insert({
      user_id, type: 'wallet_purchase', amount_kobo: -order.amount_kobo,
      note: order_type === 'food' ? 'Food order paid from wallet' : 'Purchase paid from wallet',
    });

    await sb.from(table).update({
      status: paidStatus, payment_method: 'wallet', updated_at: new Date().toISOString(),
    }).eq('id', order_id);

    await finalizeOrderPaid(sb, order_type, order);

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
    
