// Combined wallet endpoint — was 4 separate Vercel functions (wallet-pay,
// wallet-withdraw, wallet-p2p-send, admin-wallet-adjust), now one, to stay
// under Vercel's 12-function limit on the Hobby plan.
//
// Logic is untouched, just moved into /api/_handlers (never built as a
// function since the directory name starts with "_"). This file only picks
// which one to run.
//
// Old URL                  -> New URL
// /api/wallet-pay           -> /api/wallet/pay
// /api/wallet-withdraw      -> /api/wallet/withdraw
// /api/wallet-p2p-send      -> /api/wallet/p2p-send
// /api/admin-wallet-adjust  -> /api/wallet/admin-adjust
// (payments.js already updated for p2p-send and withdraw. wallet-pay and
// admin-wallet-adjust had no caller anywhere in the frontend at the time of
// this change, so there's nothing to update for those — just use the new
// paths whenever you do wire them up.)
const handlers = {
  pay: require('../_handlers/wallet-pay'),
  withdraw: require('../_handlers/wallet-withdraw'),
  'p2p-send': require('../_handlers/wallet-p2p-send'),
  'admin-adjust': require('../_handlers/admin-wallet-adjust'),
};

module.exports = async (req, res) => {
  const { action } = req.query;
  const handler = handlers[action];
  if (!handler) {
    return res.status(404).json({ error: `Unknown wallet action "${action}". Valid: ${Object.keys(handlers).join(', ')}` });
  }
  return handler(req, res);
};
