// POST { email, amount_kobo, order_type: 'escrow' | 'food', order_id }
// Returns { authorization_url, access_code, reference }
const { paystack, setCors } = require('../_lib');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, amount_kobo, order_type, order_id } = req.body;
    if (!email || !amount_kobo || !order_type || !order_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!['escrow', 'food'].includes(order_type)) {
      return res.status(400).json({ error: 'Invalid order_type' });
    }

    const data = await paystack('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email,
        amount: amount_kobo, // Paystack amount is already in kobo
        metadata: { order_type, order_id },
      }),
    });

    return res.status(200).json({
      authorization_url: data.data.authorization_url,
      access_code: data.data.access_code,
      reference: data.data.reference,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
