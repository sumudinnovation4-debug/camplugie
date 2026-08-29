// POST { user_id, amount_kobo, reason }
// Header: Authorization: Bearer <admin's Supabase access token>
//
// Manually credits or debits a user's wallet (amount_kobo can be negative).
// This is the one place in the whole payments system that can create money
// out of nowhere, so unlike the other /api/paystack-* and /api/wallet-*
// functions (which only ever move money that a real Paystack charge already
// brought onto the platform), this one verifies the caller is an admin
// BEFORE doing anything — it does not just trust that only the admin
// dashboard will ever call it.
const { supabaseAdmin, setCors } = require('./_lib');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing Authorization header' });

    const sb = supabaseAdmin();

    // Verify the token belongs to a real, currently-signed-in user...
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid or expired session' });

    // ...and that user is an admin. Nobody else can reach this branch.
    const { data: callerProfile } = await sb.from('profiles').select('is_admin, email, username').eq('id', user.id).single();
    if (!callerProfile?.is_admin) return res.status(403).json({ error: 'Admin access required' });

    const { user_id, amount_kobo, reason } = req.body;
    if (!user_id || !Number.isInteger(amount_kobo) || amount_kobo === 0) {
      return res.status(400).json({ error: 'user_id and a non-zero integer amount_kobo are required' });
    }
    if (!reason || !reason.trim()) return res.status(400).json({ error: 'A reason is required for every manual adjustment (kept in the ledger note for audit)' });

    const { data: wallet } = await sb.from('wallets').select('balance_kobo').eq('user_id', user_id).maybeSingle();
    const currentBalance = wallet?.balance_kobo || 0;
    const newBalance = currentBalance + amount_kobo;
    if (newBalance < 0) return res.status(400).json({ error: `That would take the balance below zero (currently ₦${(currentBalance / 100).toLocaleString()})` });

    await sb.from('wallets').upsert({ user_id, balance_kobo: newBalance, updated_at: new Date().toISOString() });

    const adminLabel = callerProfile.username || callerProfile.email || user.id;
    await sb.from('wallet_transactions').insert({
      user_id,
      type: 'admin_adjustment',
      amount_kobo,
      note: `Manual ${amount_kobo > 0 ? 'credit' : 'debit'} by admin @${adminLabel}: ${reason.trim()}`,
    });

    return res.status(200).json({ ok: true, new_balance_kobo: newBalance });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
