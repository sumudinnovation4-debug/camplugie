// POST { sender_id, receiver_id, amount_kobo, note }
// Moves money between two internal wallet balances. No Paystack call here —
// it's just our own ledger. Commission is only taken later, when the
// receiver withdraws to their bank (see wallet-withdraw.js).
const { supabaseAdmin, setCors } = require('../_lib');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { sender_id, receiver_id, amount_kobo, note } = req.body;
    if (!sender_id || !receiver_id || !amount_kobo || amount_kobo <= 0) {
      return res.status(400).json({ error: 'Missing or invalid fields' });
    }
    if (sender_id === receiver_id) return res.status(400).json({ error: 'Cannot send to yourself' });

    const sb = supabaseAdmin();
    const { data: senderWallet } = await sb.from('wallets').select('*').eq('user_id', sender_id).single();
    const balance = senderWallet?.balance_kobo || 0;
    if (balance < amount_kobo) return res.status(400).json({ error: 'Insufficient wallet balance' });

    await sb.from('wallets').upsert({ user_id: sender_id, balance_kobo: balance - amount_kobo, updated_at: new Date().toISOString() });

    const { data: receiverWallet } = await sb.from('wallets').select('*').eq('user_id', receiver_id).single();
    const receiverBalance = receiverWallet?.balance_kobo || 0;
    await sb.from('wallets').upsert({ user_id: receiver_id, balance_kobo: receiverBalance + amount_kobo, updated_at: new Date().toISOString() });

    await sb.from('p2p_transfers').insert({ sender_id, receiver_id, amount_kobo, note: note || null });
    await sb.from('wallet_transactions').insert({ user_id: sender_id, type: 'p2p_out', amount_kobo: -amount_kobo, note });
    await sb.from('wallet_transactions').insert({ user_id: receiver_id, type: 'p2p_in', amount_kobo, note });

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
