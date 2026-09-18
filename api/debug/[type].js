// Combined debug endpoint — was 2 separate Vercel functions (debug-env,
// debug-food-orders), now one, to stay under Vercel's 12-function limit.
// Meant to be opened directly in a browser, same as before.
//
// Old URL                   -> New URL
// /api/debug-env             -> /api/debug/env
// /api/debug-food-orders     -> /api/debug/food-orders
//
// Same safety notes as before: never returns secret values, only whether
// they're set. Feel free to delete this whole file once things are working.
const handlers = {
  env: require('../_handlers/debug-env'),
  'food-orders': require('../_handlers/debug-food-orders'),
};

module.exports = async (req, res) => {
  const { type } = req.query;
  const handler = handlers[type];
  if (!handler) {
    return res.status(404).json({ error: `Unknown debug type "${type}". Valid: ${Object.keys(handlers).join(', ')}` });
  }
  return handler(req, res);
};
