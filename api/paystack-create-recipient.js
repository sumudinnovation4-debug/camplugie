// POST { user_id, account_number, bank_code, bank_name }
// Creates a Paystack transfer recipient (tokenized bank account) and stores
// the recipient_code so future payouts to this user are one API call away.
//
// Payout accounts must belong to the signed-up user — this stops someone from
// wiring their wallet withdrawals to a friend's/stranger's bank account.
// Enforced here (server-side, authoritative) rather than only in the UI,
// since the UI check can be bypassed by calling this endpoint directly.
const { paystack, supabaseAdmin, setCors } = require('./_lib');

// Loose word-overlap match so legitimate variation in name order/middle names/
// initials (e.g. "Chidinma N. Okoro" vs "Okoro Chidinma") still passes, while
// a genuinely different person's account gets rejected.
function normalizeNameWords(name) {
  return (name || '')
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function namesLikelyMatch(registeredName, resolvedName) {
  const a = normalizeNameWords(registeredName);
  const b = new Set(normalizeNameWords(resolvedName));
  if (!a.length || !b.size) return false;
  const overlap = a.filter((w) => b.has(w)).length;
  return overlap >= Math.max(1, Math.ceil(Math.min(a.length, b.size) / 2));
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { user_id, account_number, bank_code, bank_name } = req.body;
    const missing = [];
    if (!user_id) missing.push('user_id');
    if (!account_number) missing.push('account_number');
    if (!bank_code) missing.push('bank_code');
    if (missing.length) {
      return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });
    }

    const sb = supabaseAdmin();

    const { data: profile, error: profileError } = await sb
      .from('profiles').select('full_name').eq('id', user_id).maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile?.full_name) {
      return res.status(400).json({ error: 'Add your full name to your profile before adding a payout account.' });
    }

    const resolved = await paystack(`/bank/resolve?account_number=${encodeURIComponent(account_number)}&bank_code=${encodeURIComponent(bank_code)}`);
    const account_name = resolved.data.account_name;

    if (!namesLikelyMatch(profile.full_name, account_name)) {
      return res.status(400).json({
        error: `That account is registered to "${account_name}", not your profile name. You can only withdraw to a bank account in your own name.`,
      });
    }

    const recipient = await paystack('/transferrecipient', {
      method: 'POST',
      body: JSON.stringify({
        type: 'nuban', name: account_name, account_number, bank_code, currency: 'NGN',
      }),
    });

    await sb.from('payout_recipients').upsert({
      user_id,
      paystack_recipient_code: recipient.data.recipient_code,
      bank_name: bank_name || null,
      account_number,
      account_name,
    });

    return res.status(200).json({ ok: true, account_name, recipient_code: recipient.data.recipient_code });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
      
