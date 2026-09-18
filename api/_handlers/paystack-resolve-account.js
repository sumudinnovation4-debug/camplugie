// POST { account_number, bank_code }
// Returns { account_name } so the UI can show "Is this you: JOHN DOE?" before saving.
const { paystack, setCors } = require('../_lib');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { account_number, bank_code } = req.body;
    if (!account_number || !bank_code) return res.status(400).json({ error: 'Missing fields' });

    const data = await paystack(`/bank/resolve?account_number=${encodeURIComponent(account_number)}&bank_code=${encodeURIComponent(bank_code)}`);
    return res.status(200).json({ account_name: data.data.account_name });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
