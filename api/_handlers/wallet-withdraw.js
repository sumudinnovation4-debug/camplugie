// POST { user_id, amount_kobo }
// Withdraws from the internal wallet to the user's real bank account.
// This is where P2P money finally leaves the platform, so the 5% commission
// is taken HERE (not when it was originally sent P2P).
const { paystack, supabaseAdmin, computeCommission, setCors } = require('../_lib');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { user_id, amount_kobo } = req.body;
    if (!user_id || !amount_kobo || amount_kobo <= 0) return res.status(400).json({ error: 'Missing or invalid fields' });

    const sb = supabaseAdmin();
    const { data: wallet } = await sb.from('wallets').select('*').eq('user_id', user_id).single();
    const balance = wallet?.balance_kobo || 0;
    if (balance < amount_kobo) return res.status(400).json({ error: 'Insufficient wallet balance' });

    const { data: recipientRow, error: rErr } = await sb.from('payout_recipients').select('*').eq('user_id', user_id).single();
    if (rErr || !recipientRow) return res.status(400).json({ error: 'Add a payout bank account first' });

    const { commission, payout } = computeCommission(amount_kobo);

    const transfer = await paystack('/transfer', {
      method: 'POST',
      body: JSON.stringify({
        source: 'balance', amount: payout, recipient: recipientRow.paystack_recipient_code,
        reason: 'Camplugie wallet withdrawal',
      }),
    });

    await sb.from('wallets').upsert({ user_id, balance_kobo: balance - amount_kobo, updated_at: new Date().toISOString() });
    await sb.from('wallet_transactions').insert({
      user_id, type: 'withdrawal', amount_kobo: -amount_kobo,
      note: `Withdrew ₦${(amount_kobo / 100).toFixed(2)}, paid out ₦${(payout / 100).toFixed(2)} after 5% commission`,
    });

    return res.status(200).json({ ok: true, payout_kobo: payout, commission_kobo: commission, transfer_code: transfer.data.transfer_code });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
