// GET /api/debug-food-orders
// Shows the 5 most recent food_orders rows exactly as the database has them —
// no personal info beyond ids and status, safe to check while debugging.
// Delete this file once things are working.
const { supabaseAdmin, setCors } = require('../_lib');

module.exports = async (req, res) => {
  setCors(res);
  try {
    const sb = supabaseAdmin();
    const { data, error, count } = await sb
      .from('food_orders')
      .select('id, status, amount_kobo, buyer_id, seller_id, paystack_reference, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ total_row_count: count, most_recent_5: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
