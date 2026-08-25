// POST { order_type: 'escrow' | 'food', order_id }
// This is the function that "releases" a paid order — it used to wire money
// straight to the seller's bank account immediately. Per the new payout
// design, it now just credits the seller's in-app WALLET with the full
// amount. The seller then withdraws from the wallet to their bank whenever
// they want (see wallet-withdraw.js) — that's the one place commission is
// taken, exactly like P2P transfers already work (see wallet-p2p-send.js).
// It is called from three places in the frontend:
//   1. Buyer taps "Confirm received" on a normal item escrow.
//   2. A Swift runner enters the buyer's delivery PIN (auto-release, no buyer tap needed).
//   3. A food vendor marks an order "delivered" (or buyer confirms, your choice in the UI).
const { computeCommission, supabaseAdmin, payAmbassadorCommission, setCors } = require('./_lib');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { order_type, order_id } = req.body;
    if (!order_type || !order_id) return res.status(400).json({ error: 'Missing fields' });
    const sb = supabaseAdmin();
    const table = order_type === 'escrow' ? 'escrow_orders' : 'food_orders';
    const paidStatus = order_type === 'escrow' ? 'paid_escrow' : 'paid';

    const { data: order, error } = await sb.from(table).select('*').eq('id', order_id).single();
    if (error) return res.status(500).json({ error: `Database error looking up order: ${error.message}` });
    if (!order) return res.status(404).json({ error: `Order not found (id ${order_id}) — this usually means the API function's SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY point to a different Supabase project than the one the app writes to.` });
    if (order.status === 'released') return res.status(200).json({ ok: true, already: true });
    if (order.status !== paidStatus) {
      return res.status(400).json({ error: `Order is "${order.status}", not ready for release` });
    }

    // No payout_recipients check here anymore — the seller doesn't need a
    // bank account added just to RECEIVE money into their wallet. They only
    // need one when they actually withdraw.
    const { data: sellerWallet } = await sb.from('wallets').select('balance_kobo').eq('user_id', order.seller_id).maybeSingle();
    const currentBalance = sellerWallet?.balance_kobo || 0;

    // Credit the FULL amount — commission is deferred to withdrawal time so
    // it's only ever taken once per naira that actually leaves the platform.
    await sb.from('wallets').upsert({
      user_id: order.seller_id, balance_kobo: currentBalance + order.amount_kobo, updated_at: new Date().toISOString(),
    });

    await sb.from(table).update({
      status: 'released', updated_at: new Date().toISOString(),
    }).eq('id', order_id);

    await sb.from('wallet_transactions').insert({
      user_id: order.seller_id, type: 'escrow_release', amount_kobo: order.amount_kobo,
      related_order_id: order_type === 'escrow' ? order_id : null,
      related_food_order_id: order_type === 'food' ? order_id : null,
      note: 'Order payout — full amount credited to wallet (commission taken when you withdraw to your bank)',
    });

    // Informational only — the real commission_kobo is computed and actually
    // deducted later, in wallet-withdraw.js.
    const { commission } = computeCommission(order.amount_kobo);
    await sb.from('receipts').insert({
      escrow_order_id: order_type === 'escrow' ? order_id : null,
      food_order_id: order_type === 'food' ? order_id : null,
      buyer_id: order.buyer_id, seller_id: order.seller_id,
      amount_kobo: order.amount_kobo, commission_kobo: commission,
    });

    // If the buyer was referred by an ambassador, pay that ambassador their
    // 20% cut of the platform's 5% commission — wrapped so a hiccup here
    // never blocks the seller's own payout, which has already landed above.
    try {
      await payAmbassadorCommission(sb, { buyerId: order.buyer_id, amountKobo: order.amount_kobo, orderType: order_type, orderId: order_id });
    } catch (err) {
      console.error('payAmbassadorCommission failed:', err.message);
    }

    return res.status(200).json({ ok: true, credited_kobo: order.amount_kobo });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
