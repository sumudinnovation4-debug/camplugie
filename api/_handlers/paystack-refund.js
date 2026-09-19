// POST { order_type: 'escrow' | 'food', order_id }
// Cancels an order that was paid but not yet released, and refunds the buyer
// through Paystack (reverses the original charge — no manual bank transfer needed).
const { paystack, supabaseAdmin, setCors } = require('../_lib');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { order_type, order_id } = req.body;
    if (!order_type || !order_id) return res.status(400).json({ error: 'Missing fields' });
    const sb = supabaseAdmin();
    const table = order_type === 'escrow' ? 'escrow_orders' : 'food_orders';

    const { data: order, error } = await sb.from(table).select('*').eq('id', order_id).single();
    if (error) return res.status(500).json({ error: `Database error looking up order: ${error.message}` });
    if (!order) return res.status(404).json({ error: `Order not found (id ${order_id}) — this usually means the API function's SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY point to a different Supabase project than the one the app writes to.` });
    if (!['paid_escrow', 'paid'].includes(order.status)) {
      return res.status(400).json({ error: `Cannot refund an order in status "${order.status}"` });
    }

    await paystack('/refund', {
      method: 'POST',
      body: JSON.stringify({ transaction: order.paystack_reference }),
    });

    await sb.from(table).update({ status: 'refunded', updated_at: new Date().toISOString() }).eq('id', order_id);

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
