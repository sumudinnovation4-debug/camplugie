// Combined Paystack endpoint — was 6 separate Vercel functions
// (paystack-initialize, paystack-verify, paystack-release, paystack-refund,
// paystack-resolve-account, paystack-create-recipient), now one, to stay
// under Vercel's 12-function limit on the Hobby plan.
//
// The actual logic for each action is untouched, just moved into
// /api/_handlers (a directory starting with "_", which Vercel never turns
// into a function — see https://vercel.com/docs, "files/directories
// starting with an underscore are not turned into Serverless Functions").
// This file only picks which one to run.
//
// Old URL              -> New URL
// /api/paystack-initialize      -> /api/paystack/initialize
// /api/paystack-verify          -> /api/paystack/verify
// /api/paystack-release         -> /api/paystack/release
// /api/paystack-refund          -> /api/paystack/refund
// /api/paystack-resolve-account -> /api/paystack/resolve-account
// /api/paystack-create-recipient-> /api/paystack/create-recipient
// (payments.js already updated to call these new paths — nothing else in
// the frontend called these directly.)
const handlers = {
  initialize: require('../_handlers/paystack-initialize'),
  verify: require('../_handlers/paystack-verify'),
  release: require('../_handlers/paystack-release'),
  refund: require('../_handlers/paystack-refund'),
  'resolve-account': require('../_handlers/paystack-resolve-account'),
  'create-recipient': require('../_handlers/paystack-create-recipient'),
};

module.exports = async (req, res) => {
  const { action } = req.query;
  const handler = handlers[action];
  if (!handler) {
    return res.status(404).json({ error: `Unknown paystack action "${action}". Valid: ${Object.keys(handlers).join(', ')}` });
  }
  return handler(req, res);
};
