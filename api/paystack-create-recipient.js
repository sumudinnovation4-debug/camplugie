// POST { user_id, account_number, bank_code, bank_name }
// Creates a Paystack transfer recipient (tokenized bank account) and stores
// the recipient_code so future payouts to this user are one API call away.
const { paystack, supabaseAdmin, setCors } = require('./_lib');

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

    const resolved = await paystack(`/bank/resolve?account_number=${encodeURIComponent(account_number)}&bank_code=${encodeURIComponent(bank_code)}`);
    const account_name = resolved.data.account_name;

    const recipient = await paystack('/transferrecipient', {
      method: 'POST',
      body: JSON.stringify({
        type: 'nuban', name: account_name, account_number, bank_code, currency: 'NGN',
      }),
    });

    const sb = supabaseAdmin();
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
